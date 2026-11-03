// Agent runtime: the plan → act → review loop with human-in-the-loop pauses.
import { getAgent } from './agents.js';
import { effectiveGate } from './policy.js';
import { newId, nowIso, type Store } from './store.js';
import { toolsFor, TOOLS, type Integrations } from './tools.js';
import { recordDecision } from './learning.js';
import { PROFILE_PREFIX, profileForPrompt } from './profile.js';
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
  approval?: Approval;
}

type Step = { kind: 'continue'; results: ToolResultBlock[] } | { kind: 'paused'; approval: Approval };

async function audit(store: Store, orgId: string, actor: string, action: string, taskId: string | null, detail: Record<string, unknown> = {}) {
  await store.audit({ id: newId(), orgId, at: nowIso(), actor, action, taskId, detail });
}

function textOf(content: ChatMessage['content']): string {
  if (typeof content === 'string') return content;
  return content.filter((b): b is TextBlock => b.type === 'text').map((b) => b.text).join('\n').trim();
}

async function systemPrompt(store: Store, agent: RoleCard, task: Task): Promise<string> {
  const [profile, memories] = await Promise.all([profileForPrompt(store, task.orgId), store.recall(task.orgId, task.goal, 5)]);
  const relevant = memories.filter((m) => !m.text.startsWith(PROFILE_PREFIX));
  const memo = relevant.length ? `\n\nRelevant company memory:\n${relevant.map((m) => `- ${m.text.slice(0, 1500)}`).join('\n')}` : '';
  return `${agent.instructions}\n\nYour role: ${agent.name}. ${agent.job}${profile}${memo}`;
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
async function processToolUses(
  deps: RuntimeDeps, task: Task, agent: RoleCard, types: Map<string, TaskType>,
  uses: ToolUseBlock[], prior: ToolResultBlock[],
): Promise<Step> {
  const results = [...prior];
  for (let i = 0; i < uses.length; i++) {
    const use = uses[i];
    const allowed = agent.tools.includes(use.name) ? TOOLS[use.name] : undefined;
    if (!allowed) {
      results.push({ type: 'tool_result', tool_use_id: use.id, content: `Tool "${use.name}" is not available to ${agent.name}.`, is_error: true });
      continue;
    }
    const tt = allowed.taskType ? types.get(allowed.taskType) : undefined;
    if (allowed.taskType && !tt) {
      results.push({ type: 'tool_result', tool_use_id: use.id, content: `Task type "${allowed.taskType}" is not configured for this company.`, is_error: true });
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
      taskType: tt!.key, summary: allowed.summarize(use.input), proposed: use.input,
      status: 'pending', edited: null, reason: null, decidedBy: null, createdAt: nowIso(), decidedAt: null,
    };
    await deps.store.createApproval(approval);
    await deps.store.updateTask(task.id, {
      status: gate === 'await_approval' ? 'awaiting_approval' : 'draft_for_human',
      pending: { tool: use.name, input: use.input, toolUseId: use.id, approvalId: approval.id, priorResults: results, remaining: uses.slice(i + 1) },
    });
    await audit(deps.store, task.orgId, agent.id, gate === 'await_approval' ? 'approval.requested' : 'draft.created', task.id, { approvalId: approval.id, summary: approval.summary });
    return { kind: 'paused', approval };
  }
  return { kind: 'continue', results };
}

async function executeTool(deps: RuntimeDeps, task: Task, agent: RoleCard, use: ToolUseBlock, inputOverride?: Record<string, unknown>): Promise<ToolResultBlock> {
  const tool = TOOLS[use.name];
  const input = inputOverride ?? use.input;
  try {
    const out = await tool.execute(input, { store: deps.store, orgId: task.orgId, task, agent, integrations: deps.integrations });
    await audit(deps.store, task.orgId, agent.id, 'tool.executed', task.id, { tool: use.name, summary: tool.summarize(input), result: out });
    return { type: 'tool_result', tool_use_id: use.id, content: out };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    await audit(deps.store, task.orgId, agent.id, 'tool.failed', task.id, { tool: use.name, error: msg });
    return { type: 'tool_result', tool_use_id: use.id, content: `Failed: ${msg}`, is_error: true };
  }
}

/** Runs the model loop until the task finishes, pauses for a person, or hits the turn limit. */
export async function runTask(deps: RuntimeDeps, taskId: string): Promise<RunResult> {
  let task = await deps.store.getTask(taskId);
  if (!task) throw new Error(`Task ${taskId} not found`);
  const agent = getAgent(task.agentId);
  if (!agent || !agent.usesModel) throw new Error(`Agent ${task.agentId} cannot run tasks`);
  const types = new Map((await deps.store.getTaskTypes(task.orgId)).map((t) => [t.key, t]));
  const tools = toolsFor(agent).map((t) => t.spec);
  const maxTurns = deps.maxTurns ?? 8;

  task = await deps.store.updateTask(task.id, { status: 'running' });
  for (let turn = 0; turn < maxTurns; turn++) {
    const resp = await deps.model.complete({ tier: agent.modelTier, system: await systemPrompt(deps.store, agent, task), messages: task.transcript, tools });
    const transcript: ChatMessage[] = [...task.transcript, { role: 'assistant', content: resp.content }];
    const uses = resp.content.filter((b): b is ToolUseBlock => b.type === 'tool_use');
    if (uses.length === 0) {
      task = await deps.store.updateTask(task.id, { transcript, status: 'done', output: textOf(resp.content), pending: null });
      await audit(deps.store, task.orgId, agent.id, 'task.done', task.id, { output: task.output });
      return { task };
    }
    task = await deps.store.updateTask(task.id, { transcript });
    const step = await processToolUses(deps, task, agent, types, uses, []);
    if (step.kind === 'paused') {
      return { task: (await deps.store.getTask(task.id))!, approval: step.approval };
    }
    task = await deps.store.updateTask(task.id, { transcript: [...transcript, { role: 'user', content: step.results }] });
  }
  task = await deps.store.updateTask(task.id, { status: 'failed', output: `Stopped after ${maxTurns} turns without finishing.` });
  await audit(deps.store, task.orgId, agent.id, 'task.failed', task.id, { reason: 'turn limit' });
  return { task };
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

/** Applies a person's decision, records it for learning, then resumes the paused run. */
export async function decide(deps: RuntimeDeps, approvalId: string, d: Decision): Promise<DecideResult> {
  const approval = await deps.store.getApproval(approvalId);
  if (!approval) throw new Error('Approval not found');
  if (approval.status !== 'pending') throw new Error('Approval already decided');
  const task = await deps.store.getTask(approval.taskId);
  if (!task || !task.pending || task.pending.approvalId !== approvalId) throw new Error('Task is not waiting on this approval');
  const agent = getAgent(task.agentId)!;

  const decided = await deps.store.updateApproval(approvalId, {
    status: d.approved ? 'approved' : 'rejected', edited: d.edited ?? null, reason: d.reason ?? null, decidedBy: d.by, decidedAt: nowIso(),
  });
  await audit(deps.store, task.orgId, d.by, d.approved ? 'approval.approved' : 'approval.rejected', task.id, { approvalId, reason: d.reason ?? null, edited: Boolean(d.edited) });
  const proposal = await recordDecision(deps.store, decided, agent.id);

  const p = task.pending;
  const use: ToolUseBlock = { type: 'tool_use', id: p.toolUseId, name: p.tool, input: p.input };
  let result: ToolResultBlock;
  if (!d.approved) {
    result = { type: 'tool_result', tool_use_id: p.toolUseId, content: `A person rejected this${d.reason ? `: ${d.reason}` : ''}. Do not retry the same action; adjust or explain.`, is_error: true };
  } else if (approval.kind === 'draft') {
    result = { type: 'tool_result', tool_use_id: p.toolUseId, content: 'A person accepted this draft and will carry it out themselves.' };
  } else {
    result = await executeTool(deps, task, agent, use, d.edited ?? undefined);
  }

  const types = new Map((await deps.store.getTaskTypes(task.orgId)).map((t) => [t.key, t]));
  const resumed = await deps.store.updateTask(task.id, { pending: null, status: 'running' });
  const step = await processToolUses(deps, resumed, agent, types, p.remaining, [...p.priorResults, result]);
  if (step.kind === 'paused') return { task: (await deps.store.getTask(task.id))!, approval: step.approval, proposal };
  await deps.store.updateTask(task.id, { transcript: [...resumed.transcript, { role: 'user', content: step.results }] });
  const run = await runTask(deps, task.id);
  return { ...run, proposal };
}
