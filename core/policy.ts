// Autonomy policy: decides whether an agent may act, must ask, or may only draft.
import type { AutonomyLevel, Feedback, PromotionProposal, TaskType } from './types.js';

export type Gate = 'auto_execute' | 'await_approval' | 'draft_for_human';

export function gateFor(level: AutonomyLevel): Gate {
  if (level >= 3) return 'auto_execute';
  if (level === 2) return 'await_approval';
  return 'draft_for_human';
}

export interface SpendCheck {
  allowed: boolean;
  reason?: string;
}

/** Spend caps apply at every level: an autonomous agent still cannot exceed them. */
export function checkSpend(taskType: TaskType, amountMinor: number | undefined): SpendCheck {
  if (amountMinor === undefined || taskType.spendCapMinor === undefined) return { allowed: true };
  if (amountMinor < 0) return { allowed: false, reason: 'Negative amount' };
  if (amountMinor > taskType.spendCapMinor) {
    return { allowed: false, reason: `Amount ${amountMinor} exceeds cap ${taskType.spendCapMinor}` };
  }
  return { allowed: true };
}

/** The level a task actually runs at: never above its max, and a spend-cap breach forces approval. */
export function effectiveGate(taskType: TaskType, amountMinor?: number): Gate {
  const level = Math.min(taskType.level, taskType.maxLevel) as AutonomyLevel;
  const spend = checkSpend(taskType, amountMinor);
  if (!spend.allowed) return level === 1 ? 'draft_for_human' : 'await_approval';
  return gateFor(level);
}

/** Count the run of approvals with no edits, newest first, stopping at the first edit or rejection. */
export function cleanStreak(history: Feedback[]): number {
  const sorted = [...history].sort((a, b) => (a.at < b.at ? 1 : -1));
  let n = 0;
  for (const f of sorted) {
    if (f.outcome !== 'approved') break;
    n++;
  }
  return n;
}

/**
 * Proposes moving a task type up one level once it has earned it. A person confirms every promotion;
 * this function only proposes.
 */
export function proposePromotion(taskType: TaskType, history: Feedback[]): PromotionProposal | null {
  const relevant = history.filter((f) => f.taskType === taskType.key);
  if (taskType.level >= taskType.maxLevel) return null;
  const streak = cleanStreak(relevant);
  if (streak < taskType.approvalsToPromote) return null;
  const to = (taskType.level + 1) as AutonomyLevel;
  return {
    taskType: taskType.key,
    from: taskType.level,
    to,
    because: `${streak} approvals in a row with no edits`,
  };
}

/** A rejection drops an autonomous task back to approval; it never drops below L1. */
export function levelAfterRejection(taskType: TaskType): AutonomyLevel {
  return taskType.level === 3 ? 2 : taskType.level;
}

export const DEFAULT_TASK_TYPES: TaskType[] = [
  { key: 'internal_note', label: 'Write an internal note or plan', level: 3, risk: 'internal', approvalsToPromote: 0, maxLevel: 3 },
  { key: 'memory_write', label: 'Save a fact to company memory', level: 3, risk: 'internal', approvalsToPromote: 0, maxLevel: 3 },
  { key: 'send_message', label: 'Send a customer message', level: 2, risk: 'external', approvalsToPromote: 20, maxLevel: 3 },
  { key: 'publish_post', label: 'Publish a social post', level: 2, risk: 'external', approvalsToPromote: 15, maxLevel: 3 },
  { key: 'send_email_campaign', label: 'Send an email campaign', level: 1, risk: 'external', approvalsToPromote: 10, maxLevel: 2 },
  { key: 'spend_money', label: 'Spend money (ads, purchases, payments)', level: 1, risk: 'money', approvalsToPromote: 30, maxLevel: 2, spendCapMinor: 50_000 },
];
