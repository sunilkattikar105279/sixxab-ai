// Founder Orchestrator: one goal in, one plan out, each step run by the right agent.
import { getAgent, runnableAgents } from './agents.js';
import { createTask, runTask, type RuntimeDeps } from './runtime.js';
import { nowIso } from './store.js';
import type { Task, TextBlock } from './types.js';
import { profileForPrompt } from './profile.js';

export interface PlanStep {
  agentId: string;
  goal: string;
}

export interface OrchestrationResult {
  parent: Task;
  steps: { step: PlanStep; task: Task }[];
}

const MAX_STEPS = 6;

/** Pulls the first JSON object out of a model reply and keeps only valid steps for known agents. */
export function parsePlan(text: string): PlanStep[] {
  const start = text.indexOf('{');
  const end = text.lastIndexOf('}');
  if (start < 0 || end <= start) return [];
  try {
    const obj = JSON.parse(text.slice(start, end + 1)) as { steps?: unknown };
    if (!Array.isArray(obj.steps)) return [];
    const ids = new Set(runnableAgents().map((a) => a.id));
    return obj.steps
      .filter((s): s is PlanStep => typeof s === 'object' && s !== null && typeof (s as PlanStep).agentId === 'string' && typeof (s as PlanStep).goal === 'string')
      .filter((s) => ids.has(s.agentId) && s.goal.trim().length > 0)
      .slice(0, MAX_STEPS)
      .map((s) => ({ agentId: s.agentId, goal: s.goal.trim().slice(0, 2000) }));
  } catch {
    return [];
  }
}

export interface PlannedGoal {
  parent: Task;
  steps: { step: PlanStep; task: Task }[];
}

/** Turns a goal into a plan and creates one planned task per step. Fast: one planner call, no agent runs. */
export async function planGoal(deps: RuntimeDeps, orgId: string, goal: string): Promise<PlannedGoal> {
  const lead = getAgent('founder-orchestrator')!;
  let parent = await createTask(deps.store, orgId, lead.id, goal);
  parent = await deps.store.updateTask(parent.id, { status: 'running' });

  const roster = runnableAgents().map((a) => `- ${a.id}: ${a.name}. ${a.job}`).join('\n');
  const profile = await profileForPrompt(deps.store, orgId);
  const resp = await deps.model.complete({
    tier: lead.modelTier,
    system: `${lead.instructions}${profile}\n\nAgents you can assign:\n${roster}\n\nReply with JSON only: {"steps":[{"agentId":"...","goal":"..."}]}. At most ${MAX_STEPS} steps, in the order they should run. Give each step one clear deliverable.`,
    messages: [{ role: 'user', content: goal }],
    maxTokens: 2048,
  });
  const text = resp.content.filter((b): b is TextBlock => b.type === 'text').map((b) => b.text).join('\n');
  let plan = parsePlan(text);
  if (plan.length === 0) plan = [{ agentId: 'strategy-coach', goal }];

  const steps: PlannedGoal['steps'] = [];
  for (const step of plan) steps.push({ step, task: await createTask(deps.store, orgId, step.agentId, step.goal, parent.id) });
  parent = await deps.store.updateTask(parent.id, { output: `Plan of ${steps.length} step(s): ${steps.map((s) => s.step.agentId).join(', ')}` });
  return { parent, steps };
}

/** Marks the parent goal finished once every step has run, with a one-line summary. */
export async function settleParent(deps: RuntimeDeps, parentId: string): Promise<Task | null> {
  const parent = await deps.store.getTask(parentId);
  if (!parent) return null;
  const children = (await deps.store.listTasks(parent.orgId)).filter((t) => t.parentTaskId === parentId);
  if (children.some((c) => c.status === 'planned' || c.status === 'running')) return parent;
  const pending = (await deps.store.listApprovals(parent.orgId, 'pending')).filter((a) => children.some((c) => c.id === a.taskId)).length;
  const failed = children.filter((c) => c.status === 'failed').length;
  return deps.store.updateTask(parentId, {
    status: failed ? 'failed' : 'done',
    output: `${children.length} step(s) finished${failed ? `, ${failed} stopped` : ''}; ${pending} item(s) waiting for your approval.`,
    updatedAt: nowIso(),
  });
}

/** Plans and runs every step in one go (used by tests and background jobs; the web app runs steps one request at a time). */
export async function orchestrate(deps: RuntimeDeps, orgId: string, goal: string): Promise<OrchestrationResult> {
  const planned = await planGoal(deps, orgId, goal);
  const steps: OrchestrationResult['steps'] = [];
  for (const { step, task } of planned.steps) steps.push({ step, task: (await runTask(deps, task.id)).task });
  const parent = (await settleParent(deps, planned.parent.id)) ?? planned.parent;
  return { parent, steps };
}
