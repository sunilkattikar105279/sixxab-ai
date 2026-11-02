// GET /api/activity → recent audit log for the signed-in user's company.
import { handle, json, requireUser } from '../context.js';

export const GET = handle(async (request) => {
  const { orgId, store } = await requireUser(request);
  const events = await store.listAudit(orgId);
  return json({ events: events.slice(0, 100) });
});
