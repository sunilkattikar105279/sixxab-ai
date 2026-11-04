// GET /api/activity → recent audit log for the signed-in user's business.
// Per-call model usage is summarised on the Agents tab instead of listed here.
import { handle, json, requireUser } from '../context.js';

const HIDDEN = new Set(['model.usage']);

export const GET = handle(async (request) => {
  const { orgId, store } = await requireUser(request);
  const events = (await store.listAudit(orgId)).filter((e) => !HIDDEN.has(e.action));
  return json({ events: events.slice(0, 100) });
});
