// POST /api/agents  { goal, agentId? }  → runs the Founder Orchestrator (or one agent) for the signed-in user's company.
// GET  /api/agents  → the agent roster and the company's autonomy levels.
import { AGENTS, getAgent } from '../../core/agents.js';
import { orchestrate } from '../../core/orchestrator.js';
import { createTask, runTask } from '../../core/runtime.js';
import { deps, handle, HttpError, json, readJson, requireUser } from '../context.js';

export const GET = handle(async (request) => {
  const { orgId, store } = await requireUser(request);
  const [taskTypes, tasks] = await Promise.all([store.getTaskTypes(orgId), store.listTasks(orgId)]);
  return json({
    agents: AGENTS.map(({ instructions: _i, ...a }) => a),
    taskTypes,
    tasks: tasks.slice(0, 50).map(({ transcript: _t, ...t }) => t),
  });
});

export const POST = handle(async (request) => {
  const { orgId, label, store } = await requireUser(request);
  const body = await readJson<{ goal?: string; agentId?: string }>(request);
  const goal = (body.goal ?? '').trim();
  if (goal.length < 3) throw new HttpError(400, 'Describe the goal in a few words');
  if (goal.length > 4000) throw new HttpError(400, 'Goal is too long');
  const d = deps(store);
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
    return json({ task: { ...run.task, transcript: undefined }, approval: run.approval ?? null });
  }
  const res = await orchestrate(d, orgId, goal);
  return json({
    parent: { ...res.parent, transcript: undefined },
    steps: res.steps.map((s) => ({ agentId: s.step.agentId, goal: s.step.goal, status: s.task.status, output: s.task.output })),
  });
});
