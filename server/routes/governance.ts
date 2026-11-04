// Admin only (ADMIN_EMAILS): AI & Platform Governance, the single pane for the founder, COO and SRE.
// GET  /api/governance                                   → live snapshot (status, journey, workflows, integrations, data, security, code, pipeline, cost per customer)
// POST /api/governance { action: 'costs', fixedCosts }   → set fixed monthly tech costs in USD by vendor
// POST /api/governance { action: 'review', agentId }     → a CXO agent reviews the snapshot and saves its findings as a note
import { createTask, runTask } from '../../core/runtime.js';
import { depsFor, handle, HttpError, json, readJson, requireAdmin, requireUser } from '../context.js';
import { governanceSnapshot } from '../governance-data.js';

const REVIEWERS: Record<string, { title: string; ask: string }> = {
  cto: { title: 'Architecture review', ask: 'Review the platform architecture, code and pipeline: what is solid, the top 3 technical risks to scaling, and the next 3 engineering priorities.' },
  ciso: { title: 'Security review', ask: 'Review the security controls and recent admin changes: gaps, the top 3 risks (including healthcare data boundaries), and the fixes in priority order.' },
  coo: { title: 'Operations review', ask: 'Review the customer journey and workflows across businesses: where customers are stuck, approvals waiting too long, failed actions, and the 3 operational fixes for this week.' },
  sre: { title: 'Reliability review', ask: 'Review platform status, failed actions and integrations: what is degraded, likely causes, and the runbook steps to restore and prevent each issue.' },
  cfo: { title: 'Tech cost review', ask: 'Review cost per customer, fixed tech costs and margins: which customers are unprofitable, what drives model cost, and 3 actions to cut cost or adjust pricing.' },
};

export const GET = handle(async (request) => {
  const { orgId, label, store } = await requireUser(request);
  requireAdmin(label);
  return json({ governance: await governanceSnapshot(store, orgId), reviewers: Object.entries(REVIEWERS).map(([id, r]) => ({ id, title: r.title })) });
});

export const POST = handle(async (request) => {
  const { orgId, label, store } = await requireUser(request);
  requireAdmin(label);
  const b = await readJson<{ action?: string; fixedCosts?: Record<string, unknown>; agentId?: string }>(request);

  if (b.action === 'costs') {
    const entries = Object.entries(b.fixedCosts ?? {}).slice(0, 20).map(([k, v]) => [k.trim().slice(0, 40), Number(v)] as const);
    if (entries.some(([k, v]) => !k || !Number.isFinite(v) || v < 0)) throw new HttpError(400, 'Each cost needs a name and an amount of zero or more (USD a month)');
    const costs = Object.fromEntries(entries);
    await store.audit({ id: crypto.randomUUID(), orgId, at: new Date().toISOString(), actor: label, action: 'settings.techcost', taskId: null, detail: { costs, summary: `Fixed tech costs set: $${entries.reduce((s, [, v]) => s + v, 0)} a month` } });
    return json({ fixedCosts: costs });
  }

  if (b.action === 'review') {
    const r = REVIEWERS[b.agentId ?? ''];
    if (!r) throw new HttpError(400, `agentId must be one of ${Object.keys(REVIEWERS).join(', ')}`);
    const snapshot = await governanceSnapshot(store, orgId);
    const goal = `${r.ask} Save it as a note titled "${r.title} ${snapshot.generatedAt.slice(0, 10)}".\n\nPlatform snapshot (JSON):\n${JSON.stringify(snapshot).slice(0, 14000)}`;
    const task = await createTask(store, orgId, b.agentId!, goal);
    const run = await runTask(await depsFor(store, orgId, label), task.id);
    return json({ taskId: task.id, status: run.task.status, output: run.task.output });
  }

  throw new HttpError(400, 'action must be costs or review');
});
