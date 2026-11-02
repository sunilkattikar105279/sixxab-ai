// POST /api/autonomy { taskType, from, to } → a person confirms an autonomy upgrade (or sets a lower level).
import { applyPromotion } from '../../core/learning.js';
import { handle, HttpError, json, readJson, requireUser } from '../context.js';
import type { AutonomyLevel } from '../../core/types.js';

const isLevel = (n: unknown): n is AutonomyLevel => n === 1 || n === 2 || n === 3;

export const POST = handle(async (request) => {
  const { orgId, label, store } = await requireUser(request);
  const b = await readJson<{ taskType?: string; from?: number; to?: number }>(request);
  if (!b.taskType || !isLevel(b.from) || !isLevel(b.to)) throw new HttpError(400, 'taskType, from and to (1-3) are required');
  if (b.to > b.from && b.to - b.from !== 1) throw new HttpError(400, 'Autonomy goes up one level at a time');
  try {
    if (b.to > b.from) {
      await applyPromotion(store, orgId, { taskType: b.taskType, from: b.from, to: b.to, because: 'confirmed by a person' }, label);
    } else {
      await store.setTaskTypeLevel(orgId, b.taskType, b.to);
      await store.audit({ id: crypto.randomUUID(), orgId, at: new Date().toISOString(), actor: label, action: 'autonomy.lowered', taskId: null, detail: b });
    }
  } catch (e) {
    throw new HttpError(409, e instanceof Error ? e.message : 'Could not change the level');
  }
  return json({ taskTypes: await store.getTaskTypes(orgId) });
});
