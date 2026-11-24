// Sales autopilot: runs the stage agents for the most urgent next actions that only save drafts or records
// onto a deal. Kept apart from salesflow.ts so the tools module does not import the runtime.
import { newId, nowIso } from './store.js';
import { loadCrm } from './crm.js';
import { logAgentRun } from './leadgen.js';
import { autoGoal, findGoal } from './salesflow.js';
import { AUTO_RULES } from './salesflow-state.js';
import { getAgent } from './agents.js';
import { createTask, runTask, type RuntimeDeps } from './runtime.js';

/**
 * Autopilot: runs the agents for the most urgent actions that only save drafts or records onto a deal
 * (scores, outreach drafts, onboarding plans, account reviews). Nothing is sent and no stage changes.
 */
export async function runAutopilot(deps: RuntimeDeps, orgId: string, max = 3, force = false): Promise<{ ran: { key: string; agentId: string; status: string }[]; skipped: string }> {
  const store = deps.store;
  const crm = await loadCrm(store, orgId);
  if (!force && !crm.flowOrg.autopilot?.on) return { ran: [], skipped: 'Autopilot is off' };
  const todo = crm.nextActions.filter((a) => AUTO_RULES.includes(a.rule) && a.agentId && a.contactId).slice(0, Math.max(0, Math.min(5, max)));
  const ran: { key: string; agentId: string; status: string }[] = [];
  for (const a of todo) {
    const agent = getAgent(a.agentId!);
    const goal = autoGoal(a);
    if (!agent || !goal) continue;
    try {
      const task = await createTask(store, orgId, agent.id, goal);
      const run = await runTask(deps, task.id);
      await logAgentRun(store, orgId, a.contactId!, agent.name, run.task.status, run.task.output, run.approvals?.length ?? 0).catch(() => false);
      ran.push({ key: a.key, agentId: agent.id, status: run.task.status });
    } catch (e) {
      ran.push({ key: a.key, agentId: agent.id, status: `failed: ${e instanceof Error ? e.message.slice(0, 120) : 'error'}` });
    }
  }
  if (ran.length) await store.audit({ id: newId(), orgId, at: nowIso(), actor: 'Sales autopilot', action: 'autopilot.ran', taskId: null, detail: { ran, summary: `Sales autopilot prepared ${ran.length} draft${ran.length === 1 ? '' : 's'}` } });
  return { ran, skipped: todo.length ? '' : 'Nothing for the autopilot to prepare' };
}

/**
 * The weekly prospect search: when the owner has switched it on, runs the Prospect Generator once for the
 * first ICP if the last search is a week old and no prospects are waiting. It only proposes businesses;
 * nothing is added to the CRM or contacted until the owner ticks them.
 */
export async function runAutofind(deps: RuntimeDeps, orgId: string, force = false): Promise<{ status: string }> {
  const store = deps.store;
  const crm = await loadCrm(store, orgId);
  if (!force && !crm.flowOrg.autofind?.on) return { status: 'off' };
  const a = crm.nextActions.find((x) => x.rule === 'find');
  const goal = a ? findGoal(a) : '';
  const agent = getAgent('lead-finder');
  if (!a || !goal || !agent) return { status: 'not due' };
  let status: string;
  try {
    const task = await createTask(store, orgId, agent.id, goal);
    status = (await runTask(deps, task.id)).task.status;
  } catch (e) {
    status = `failed: ${e instanceof Error ? e.message.slice(0, 120) : 'error'}`;
  }
  await store.audit({ id: newId(), orgId, at: nowIso(), actor: 'Weekly prospect search', action: 'autofind.ran', taskId: null, detail: { icp: a.icp?.name ?? '', status, summary: `Weekly prospect search for ${a.icp?.name ?? 'your ICP'}: ${status}` } });
  return { status };
}
