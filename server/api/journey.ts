// GET  /api/journey → stage, steps (with hard/soft dependencies), revenue by month, milestones
// POST /api/journey { action: 'complete' | 'reopen', step }       → mark a step done (hard dependencies enforced) or reopen it
// POST /api/journey { action: 'revenue', month, amount, note? }    → record revenue for a month (latest entry per month wins)
import { completeStep, loadJourney, recordRevenue, reopenStep } from '../../core/journey.js';
import { handle, HttpError, json, readJson, requireUser } from '../context.js';

export const GET = handle(async (request) => {
  const { orgId, store } = await requireUser(request);
  return json({ journey: await loadJourney(store, orgId) });
});

export const POST = handle(async (request) => {
  const { orgId, label, store } = await requireUser(request);
  const b = await readJson<{ action?: string; step?: string; month?: string; amount?: number | string; note?: string }>(request);
  try {
    if (b.action === 'complete' && b.step) return json({ journey: await completeStep(store, orgId, b.step, label) });
    if (b.action === 'reopen' && b.step) return json({ journey: await reopenStep(store, orgId, b.step, label) });
    if (b.action === 'revenue') {
      const amount = typeof b.amount === 'string' ? Number(b.amount.replace(/,/g, '')) : Number(b.amount);
      return json({ journey: await recordRevenue(store, orgId, { month: String(b.month ?? ''), amount, note: b.note }, label) });
    }
  } catch (e) {
    throw new HttpError(409, e instanceof Error ? e.message : 'Could not update the journey');
  }
  throw new HttpError(400, 'action must be complete, reopen (with step) or revenue (with month and amount)');
});
