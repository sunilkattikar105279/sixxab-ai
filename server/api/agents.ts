// POST /api/agents  { goal, agentId? }  → runs the Founder Orchestrator (or one agent) for the signed-in user's company.
// GET  /api/agents  → the agent roster, the company's autonomy levels and progress toward the next level.
import { AGENTS, getAgent } from '../../core/agents.js';
import { planGoal, settleParent } from '../../core/orchestrator.js';
import { createTask, runTask } from '../../core/runtime.js';
import { autonomyProgress } from '../../core/learning.js';
import { costSummary } from '../../core/cost.js';
import { depsFor, handle, HttpError, json, readJson, requireUser } from '../context.js';

export const GET = handle(async (request) => {
  const { orgId, store } = await requireUser(request);
  const [taskTypes, tasks, progress, cost] = await Promise.all([store.getTaskTypes(orgId), store.listTasks(orgId), autonomyProgress(store, orgId), costSummary(store, orgId)]);
  return json({
    agents: AGENTS.map(({ instructions: _i, ...a }) => a),
    taskTypes,
    progress,
    cost,
    tasks: tasks.slice(0, 50).map(({ transcript: _t, ...t }) => t),
  });
});

/**
 * POST /api/agents
 *   { goal }            → plan the goal; returns the steps (each a planned task). Fast.
 *   { taskId }          → run one planned step; returns its result and how many items it queued for approval.
 *   { goal, agentId }   → run one agent directly on a goal.
 * Steps run one request at a time so no single request nears the function time limit.
 */
export const POST = handle(async (request) => {
  const { orgId, label, store } = await requireUser(request);
  const body = await readJson<{ goal?: string; agentId?: string; taskId?: string }>(request);
  const d = await depsFor(store, orgId, label);

  if (body.taskId) {
    const task = await store.getTask(body.taskId);
    if (!task || task.orgId !== orgId) throw new HttpError(404, 'Step not found');
    if (task.status !== 'planned') throw new HttpError(409, 'This step has already run');
    const run = await runTask(d, task.id);
    if (task.parentTaskId) await settleParent(d, task.parentTaskId);
    return json({ taskId: task.id, agentId: task.agentId, status: run.task.status, output: run.task.output, queued: run.approvals?.length ?? 0 });
  }

  const goal = (body.goal ?? '').trim();
  if (goal.length < 3) throw new HttpError(400, 'Describe the goal in a few words');
  if (goal.length > 4000) throw new HttpError(400, 'Goal is too long');
  const limit = Number(process.env.DAILY_GOAL_LIMIT || 50);
  const since = new Date(Date.now() - 24 * 3600 * 1000).toISOString();
  const used = (await store.listAudit(orgId, since)).filter((e) => e.action === 'goal.submitted').length;
  if (used >= limit) throw new HttpError(429, `Daily limit of ${limit} goals reached. It resets within 24 hours.`);
  await store.audit({ id: crypto.randomUUID(), orgId, at: new Date().toISOString(), actor: label, action: 'goal.submitted', taskId: null, detail: { goal, agentId: body.agentId ?? null } });

  if (body.agentId) {
    const agent = getAgent(body.agentId);
    if (!agent || !agent.usesModel || agent.layer === 'core') throw new HttpError(400, 'Unknown agent');
    const task = await createTask(store, orgId, agent.id, goal);
    const run = await runTask(d, task.id);
    return json({ taskId: task.id, agentId: agent.id, status: run.task.status, output: run.task.output, queued: run.approvals?.length ?? 0 });
  }
  const planned = await planGoal(d, orgId, goal);
  return json({
    parentId: planned.parent.id,
    steps: planned.steps.map((s) => ({ taskId: s.task.id, agentId: s.step.agentId, goal: s.step.goal, status: s.task.status })),
  });
});
