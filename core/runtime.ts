// Agent runtime: the plan → act → review loop with human-in-the-loop pauses.
import { getAgent } from './agents.js';
import { effectiveGate } from './policy.js';
import { newId, nowIso, type Store } from './store.js';
import { NOT_SENT_PREFIX, toolForTaskType, toolsFor, TOOLS, type Integrations, type Tool } from './tools.js';
import { recordDecision } from './learning.js';
import { PROFILE_PREFIX, profileForPrompt } from './profile.js';
import { journeyForPrompt } from './journey.js';
import type {
  Approval, ChatMessage, ModelClient, PromotionProposal, RoleCard, Task, TaskType, TextBlock,
  ToolResultBlock, ToolUseBlock,
} from './types.js';

export interface RuntimeDeps {
  store: Store;
  model: ModelClient;
  integrations: Integrations;
  maxTurns?: number;
}

export interface RunResult {
  task: Task;
  /** First approval queued during the run (kept for callers that show one). */
  approval?: Approval;
  /** Every approval or draft queued during the run. */
  approvals?: Approval[];
}


async function audit(store: Store, orgId: string, actor: string, action: string, taskId: string | null, detail: Record<string, unknown> = {}) {
  await store.audit({ id: newId(), orgId, at: nowIso(), actor, action, taskId, detail });
}

function textOf(content: ChatMessage['content']): string {
  if (typeof content === 'string') return content;
  return content.filter((b): b is TextBlock => b.type === 'text').map((b) => b.text).join('\n').trim();
}

async function systemPrompt(store: Store, agent: RoleCard, task: Task): Promise<string> {
  const [profile, journey, memories] = await Promise.all([profileForPrompt(store, task.orgId), journeyForPrompt(store, task.orgId), store.recall(task.orgId, task.goal, 5)]);
  const relevant = memories.filter((m) => !m.text.startsWith(PROFILE_PREFIX) && !m.text.startsWith('Company profile'));
  const memo = relevant.length ? `\n\nRelevant business memory:\n${relevant.map((m) => `- ${m.text.slice(0, 1500)}`).join('\n')}` : '';
  return `${agent.instructions}\n\nYour role: ${agent.name}. ${agent.job}${profile}${journey}${memo}`;
}

export async function createTask(store: Store, orgId: string, agentId: string, goal: string, parentTaskId: string | null = null): Promise<Task> {
  const agent = getAgent(agentId);
  if (!agent) throw new Error(`Unknown agent ${agentId}`);
  const at = nowIso();
  const task: Task = {
    id: newId(), orgId, agentId, goal: goal.trim().slice(0, 4000), status: 'planned',
    transcript: [{ role: 'user', content: goal.trim().slice(0, 4000) }],
    pending: null, output: null, createdAt: at, updatedAt: at, parentTaskId,
  };
  await store.createTask(task);
  await audit(store, orgId, agentId, 'task.created', task.id, { goal: task.goal });
  return task;
}

/** Processes the tool calls of one model turn in order, pausing at the first one that needs a person. */
/** Required fields from a tool's schema that are missing or blank in the agent's call. */
function missingFields(tool: Tool, input: Record<string, unknown>): string[] {
  const required = (tool.spec.input_schema.required as string[] | undefined) ?? [];
  return required.filter((k) => {
    const v = input[k];
    return v === undefined || v === null || (typeof v === 'string' && !v.trim());
  });
}

/**
 * Processes one model turn's tool calls in order. Actions that need a person are queued as approvals and
 * the agent keeps working; nothing gated is executed until a person approves it (see decide()).
 */
async function processToolUses(
  deps: RuntimeDeps, task: Task, agent: RoleCard, types: Map<string, TaskType>,
  uses: ToolUseBlock[], prior: ToolResultBlock[],
): Promise<{ results: ToolResultBlock[]; approvals: Approval[] }> {
  const results = [...prior];
  const approvals: Approval[] = [];
  for (const use of uses) {
    const tool = agent.tools.includes(use.name) ? TOOLS[use.name] : undefined;
    if (!tool) {
      results.push({ type: 'tool_result', tool_use_id: use.id, content: `Tool "${use.name}" is not available to ${agent.name}.`, is_error: true });
      continue;
    }
    const missing = missingFields(tool, use.input ?? {});
    if (missing.length) {
      await audit(deps.store, task.orgId, agent.id, 'tool.failed', task.id, { tool: use.name, error: `Missing ${missing.join(', ')}` });
      results.push({
        type: 'tool_result', tool_use_id: use.id, is_error: true,
        content: `Missing ${missing.map((m) => `"${m}"`).join(', ')}. Call ${use.name} again with every required field filled in. If the content is long, shorten it or split it into several calls.`,
      });
      continue;
    }
    const tt = tool.taskType ? types.get(tool.taskType) : undefined;
    if (tool.taskType && !tt) {
      results.push({ type: 'tool_result', tool_use_id: use.id, content: `Task type "${tool.taskType}" is not configured for this company.`, is_error: true });
      continue;
    }
    const amount = typeof use.input.amountMinor === 'number' ? use.input.amountMinor : undefined;
    const gate = tt ? effectiveGate(tt, amount) : 'auto_execute';

    if (gate === 'auto_execute') {
      results.push(await executeTool(deps, task, agent, use));
      continue;
    }

    const approval: Approval = {
      id: newId(), orgId: task.orgId, taskId: task.id,
      kind: gate === 'await_approval' ? 'approve' : 'draft',
      taskType: tt!.key, summary: tool.summarize(use.input), proposed: use.input,
      status: 'pending', edited: null, reason: null, decidedBy: null, createdAt: nowIso(), decidedAt: null,
    };
    await deps.store.createApproval(approval);
    approvals.push(approval);
    await audit(deps.store, task.orgId, agent.id, gate === 'await_approval' ? 'approval.requested' : 'draft.created', task.id, { approvalId: approval.id, summary: approval.summary });
    results.push({
      type: 'tool_result', tool_use_id: use.id,
      content: gate === 'await_approval'
        ? 'Queued for the founder approval. It goes out only if approved. Continue with the rest of the task.'
        : 'Saved as a draft for the founder to send themselves. Continue with the rest of the task.',
    });
  }
  return { results, approvals };
}

async function executeTool(deps: RuntimeDeps, task: Task, agent: RoleCard, use: ToolUseBlock, inputOverride?: Record<string, unknown>): Promise<ToolResultBlock> {
  const tool = TOOLS[use.name];
  const input = inputOverride ?? use.input;
  try {
    const out = await tool.execute(input, { store: deps.store, orgId: task.orgId, task, agent, integrations: deps.integrations });
    const action = out.startsWith(NOT_SENT_PREFIX) ? 'tool.recorded' : 'tool.executed';
    await audit(deps.store, task.orgId, agent.id, action, task.id, { tool: use.name, summary: tool.summarize(input), result: out });
    return { type: 'tool_result', tool_use_id: use.id, content: out };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    await audit(deps.store, task.orgId, agent.id, 'tool.failed', task.id, { tool: use.name, error: msg });
    return { type: 'tool_result', tool_use_id: use.id, content: `Failed: ${msg}`, is_error: true };
  }
}

/** Output budget per model tier: planners and workers write long plans and posts in a single tool call. */
const MAX_TOKENS: Record<RoleCard['modelTier'], number> = { router: 1024, worker: 8192, planner: 8192 };

/** Runs the model loop until the task finishes or hits the turn limit. Gated actions are queued, not awaited. */
export async function runTask(deps: RuntimeDeps, taskId: string): Promise<RunResult> {
  let task = await deps.store.getTask(taskId);
  if (!task) throw new Error(`Task ${taskId} not found`);
  const agent = getAgent(task.agentId);
  if (!agent || !agent.usesModel) throw new Error(`Agent ${task.agentId} cannot run tasks`);
  const types = new Map((await deps.store.getTaskTypes(task.orgId)).map((t) => [t.key, t]));
  const tools = toolsFor(agent).map((t) => t.spec);
  const maxTurns = deps.maxTurns ?? 8;
  const queued: Approval[] = [];

  task = await deps.store.updateTask(task.id, { status: 'running' });
  for (let turn = 0; turn < maxTurns; turn++) {
    const resp = await deps.model.complete({
      tier: agent.modelTier, system: await systemPrompt(deps.store, agent, task), messages: task.transcript, tools, maxTokens: MAX_TOKENS[agent.modelTier],
    });
    const transcript: ChatMessage[] = [...task.transcript, { role: 'assistant', content: resp.content }];
    const uses = resp.content.filter((b): b is ToolUseBlock => b.type === 'tool_use');
    if (uses.length === 0) {
      if (resp.stopReason === 'max_tokens') {
        const nudge: ChatMessage = { role: 'user', content: 'Your reply was cut off at the length limit. Finish with a shorter summary.' };
        task = await deps.store.updateTask(task.id, { transcript: [...transcript, nudge] });
        continue;
      }
      task = await deps.store.updateTask(task.id, { transcript, status: 'done', output: textOf(resp.content), pending: null });
      await audit(deps.store, task.orgId, agent.id, 'task.done', task.id, { output: task.output, queued: queued.length });
      return { task, approvals: queued, approval: queued[0] };
    }
    task = await deps.store.updateTask(task.id, { transcript });
    const step = await processToolUses(deps, task, agent, types, uses, []);
    queued.push(...step.approvals);
    task = await deps.store.updateTask(task.id, { transcript: [...transcript, { role: 'user', content: step.results }] });
  }
  task = await deps.store.updateTask(task.id, { status: 'failed', output: `Stopped after ${maxTurns} turns without finishing.` });
  await audit(deps.store, task.orgId, agent.id, 'task.failed', task.id, { reason: 'turn limit' });
  return { task, approvals: queued, approval: queued[0] };
}

export interface Decision {
  approved: boolean;
  /** Replacement input when the person edited the proposal before approving. */
  edited?: Record<string, unknown> | null;
  reason?: string | null;
  by: string;
}

export interface DecideResult extends RunResult {
  proposal: PromotionProposal | null;
}

/**
 * Applies a person's decision and records it for learning. An approved action is executed now, with the
 * person's edits; a rejected one is never sent. Tasks paused by the earlier blocking design are resumed.
 */
export async function decide(deps: RuntimeDeps, approvalId: string, d: Decision): Promise<DecideResult> {
  const approval = await deps.store.getApproval(approvalId);
  if (!approval) throw new Error('Approval not found');
  if (approval.status !== 'pending') throw new Error('Approval already decided');
  const task = await deps.store.getTask(approval.taskId);
  if (!task) throw new Error('Task not found');
  const agent = getAgent(task.agentId)!;

  const decided = await deps.store.updateApproval(approvalId, {
    status: d.approved ? 'approved' : 'rejected', edited: d.edited ?? null, reason: d.reason ?? null, decidedBy: d.by, decidedAt: nowIso(),
  });
  await audit(deps.store, task.orgId, d.by, d.approved ? 'approval.approved' : 'approval.rejected', task.id, { approvalId, summary: approval.summary, reason: d.reason ?? null, edited: Boolean(d.edited) });
  const proposal = await recordDecision(deps.store, decided, agent.id);

  if (task.pending?.approvalId === approvalId) return { ...(await resumeLegacy(deps, task, agent, approval, d)), proposal };

  if (d.approved && approval.kind === 'approve') {
    const tool = toolForTaskType(approval.taskType);
    if (!tool) throw new Error(`No tool for ${approval.taskType}`);
    const input = { ...approval.proposed, ...(d.edited ?? {}) };
    await executeTool(deps, task, agent, { type: 'tool_use', id: `approval-${approvalId}`, name: tool.spec.name, input });
  }
  return { task: (await deps.store.getTask(task.id))!, proposal };
}

/** Resumes a task paused by the earlier blocking design (approvals created before this version). */
async function resumeLegacy(deps: RuntimeDeps, task: Task, agent: RoleCard, approval: Approval, d: Decision): Promise<RunResult> {
  const p = task.pending!;
  const use: ToolUseBlock = { type: 'tool_use', id: p.toolUseId, name: p.tool, input: p.input };
  let result: ToolResultBlock;
  if (!d.approved) {
    result = { type: 'tool_result', tool_use_id: p.toolUseId, content: `A person rejected this${d.reason ? `: ${d.reason}` : ''}.`, is_error: true };
  } else if (approval.kind === 'draft') {
    result = { type: 'tool_result', tool_use_id: p.toolUseId, content: 'A person accepted this draft and will carry it out themselves.' };
  } else {
    result = await executeTool(deps, task, agent, use, d.edited ?? undefined);
  }
  const types = new Map((await deps.store.getTaskTypes(task.orgId)).map((t) => [t.key, t]));
  const resumed = await deps.store.updateTask(task.id, { pending: null, status: 'running' });
  const step = await processToolUses(deps, resumed, agent, types, p.remaining ?? [], [...(p.priorResults ?? []), result]);
  await deps.store.updateTask(task.id, { transcript: [...resumed.transcript, { role: 'user', content: step.results }] });
  return runTask(deps, task.id);
}
