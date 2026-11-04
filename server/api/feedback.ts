// POST /api/feedback { taskId, rating: 'up' | 'down', reason? } → the owner rates an agent's result.
// The latest reasons go into that agent's next prompt (core/feedback.ts).
import { rateTask } from '../../core/feedback.js';
import { handle, HttpError, json, readJson, requireUser } from '../context.js';

export const POST = handle(async (request) => {
  const { orgId, label, store } = await requireUser(request);
  const b = await readJson<{ taskId?: string; rating?: string; reason?: string }>(request);
  if (!b.taskId) throw new HttpError(400, 'taskId is required');
  try {
    await rateTask(store, orgId, b.taskId, { rating: b.rating as 'up' | 'down', reason: b.reason }, label);
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Could not save feedback';
    throw new HttpError(/not found/i.test(msg) ? 404 : 400, msg);
  }
  return json({ ok: true });
});
