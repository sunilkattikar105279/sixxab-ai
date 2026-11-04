// Learning loop: every human decision becomes feedback, eval data and (when earned) a promotion proposal.
import { cleanStreak, levelAfterRejection, proposePromotion } from './policy.js';
import { newId, nowIso, type Store } from './store.js';
import type { Approval, PromotionProposal } from './types.js';

export async function recordDecision(store: Store, approval: Approval, agentId: string): Promise<PromotionProposal | null> {
  const outcome = approval.status === 'rejected' ? 'rejected' : approval.edited ? 'approved_with_edits' : 'approved';
  await store.addFeedback({
    id: newId(), orgId: approval.orgId, taskType: approval.taskType, agentId, outcome,
    reason: approval.reason, proposed: approval.proposed, final: approval.edited ?? (outcome === 'rejected' ? null : approval.proposed), at: nowIso(),
  });

  const types = await store.getTaskTypes(approval.orgId);
  const tt = types.find((t) => t.key === approval.taskType);
  if (!tt) return null;

  if (outcome === 'rejected') {
    const next = levelAfterRejection(tt);
    if (next !== tt.level) {
      await store.setTaskTypeLevel(approval.orgId, tt.key, next);
      await store.audit({ id: newId(), orgId: approval.orgId, at: nowIso(), actor: 'learning-engine', action: 'autonomy.demoted', taskId: approval.taskId, detail: { taskType: tt.key, from: tt.level, to: next } });
    }
    return null;
  }
  return proposePromotion(tt, await store.listFeedback(approval.orgId, tt.key));
}

/** A person confirms a promotion; the platform never promotes itself. */
export async function applyPromotion(store: Store, orgId: string, p: PromotionProposal, by: string): Promise<void> {
  const tt = (await store.getTaskTypes(orgId)).find((t) => t.key === p.taskType);
  if (!tt) throw new Error('Unknown task type');
  if (tt.level !== p.from) throw new Error('Task type level changed since the proposal');
  if (p.to > tt.maxLevel) throw new Error('Promotion exceeds the task type’s maximum level');
  await store.setTaskTypeLevel(orgId, p.taskType, p.to);
  await store.audit({ id: newId(), orgId, at: nowIso(), actor: by, action: 'autonomy.promoted', taskId: null, detail: { ...p } });
}

/** Edited approvals are the best eval cases: what the agent proposed vs what a person actually wanted. */
export async function evalCases(store: Store, orgId: string) {
  const fb = await store.listFeedback(orgId);
  return fb.filter((f) => f.outcome === 'approved_with_edits').map((f) => ({ taskType: f.taskType, agentId: f.agentId, proposed: f.proposed, expected: f.final }));
}

export interface AutonomyProgress {
  taskType: string;
  level: number;
  maxLevel: number;
  /** Approvals in a row with no edits, most recent first. */
  streak: number;
  /** Clean approvals needed for the next level, or null when already at the highest allowed level. */
  needed: number | null;
  /** Set once the next level is earned; a person still has to confirm it. */
  proposal: PromotionProposal | null;
}

/** How close each kind of action is to its next autonomy level. */
export async function autonomyProgress(store: Store, orgId: string): Promise<AutonomyProgress[]> {
  const [types, feedback] = await Promise.all([store.getTaskTypes(orgId), store.listFeedback(orgId)]);
  return types.map((t) => {
    const history = feedback.filter((f) => f.taskType === t.key);
    const atMax = t.level >= t.maxLevel;
    return {
      taskType: t.key,
      level: t.level,
      maxLevel: t.maxLevel,
      streak: cleanStreak(history),
      needed: atMax ? null : t.approvalsToPromote,
      proposal: proposePromotion(t, history),
    };
  });
}
