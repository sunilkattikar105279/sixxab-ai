// Founder Orchestrator: one goal in, one plan out, each step run by the right agent.
import { getAgent, runnableAgents } from './agents.js';
import { createTask, runTask, type RuntimeDeps } from './runtime.js';
import { nowIso } from './store.js';
import type { Task, TextBlock } from './types.js';

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

export async function orchestrate(deps: RuntimeDeps, orgId: string, goal: string): Promise<OrchestrationResult> {
  const lead = getAgent('founder-orchestrator')!;
  let parent = await createTask(deps.store, orgId, lead.id, goal);
  parent = await deps.store.updateTask(parent.id, { status: 'running' });

  const roster = runnableAgents().map((a) => `- ${a.id}: ${a.name}. ${a.job}`).join('\n');
  const resp = await deps.model.complete({
    tier: lead.modelTier,
    system: `${lead.instructions}\n\nAgents you can assign:\n${roster}\n\nReply with JSON only: {"steps":[{"agentId":"...","goal":"..."}]}. At most ${MAX_STEPS} steps, in the order they should run.`,
    messages: [{ role: 'user', content: goal }],
  });
  const text = resp.content.filter((b): b is TextBlock => b.type === 'text').map((b) => b.text).join('\n');
  let plan = parsePlan(text);
  if (plan.length === 0) plan = [{ agentId: 'strategy-coach', goal }];

  const steps: OrchestrationResult['steps'] = [];
  for (const step of plan) {
    const child = await createTask(deps.store, orgId, step.agentId, step.goal, parent.id);
    const run = await runTask(deps, child.id);
    steps.push({ step, task: run.task });
  }

  const waiting = steps.filter((s) => s.task.status === 'awaiting_approval' || s.task.status === 'draft_for_human').length;
  const failed = steps.filter((s) => s.task.status === 'failed').length;
  parent = await deps.store.updateTask(parent.id, {
    status: failed ? 'failed' : waiting ? 'awaiting_approval' : 'done',
    output: `Plan of ${steps.length} step(s): ${steps.map((s) => `${s.step.agentId} (${s.task.status})`).join(', ')}`,
    updatedAt: nowIso(),
  });
  return { parent, steps };
}
