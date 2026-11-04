// Admin only (ADMIN_EMAILS). GET /api/admin → every business with its assigned n8n workflow.
// POST /api/admin { orgId, path | null } → assign or remove a business's workflow path.
import { automationPath, setAutomationPath } from '../../core/automation.js';
import { loadBusinessProfile } from '../../core/profile.js';
import { handle, HttpError, json, readJson, requireAdmin, requireUser } from '../context.js';

export const GET = handle(async (request) => {
  const { label, store } = await requireUser(request);
  requireAdmin(label);
  const ids = await store.listOrgIds();
  const orgs = await Promise.all(ids.map(async (orgId) => {
    const [profile, path] = await Promise.all([loadBusinessProfile(store, orgId), automationPath(store, orgId)]);
    return { orgId, name: profile?.name ?? null, path };
  }));
  return json({ orgs });
});

export const POST = handle(async (request) => {
  const { label, store } = await requireUser(request);
  requireAdmin(label);
  const b = await readJson<{ orgId?: string; path?: string | null }>(request);
  if (!b.orgId || !(await store.listOrgIds()).includes(b.orgId)) throw new HttpError(404, 'Business not found');
  const path = typeof b.path === 'string' && b.path.trim() ? b.path.trim().toLowerCase() : null;
  try {
    await setAutomationPath(store, b.orgId, path, label);
  } catch (e) {
    throw new HttpError(400, e instanceof Error ? e.message : 'Invalid path');
  }
  return json({ orgId: b.orgId, path });
});
