// Owner feedback on agent results: a thumbs up or down with a reason. Recent feedback for an
// agent goes into that agent's next prompt, so the owner's corrections change what it does.
import { newId, nowIso, type Store } from './store.js';

export interface Rating { rating: 'up' | 'down'; reason?: string }
const MAX_REASON = 500;
const LESSONS = 5;

export async function rateTask(store: Store, orgId: string, taskId: string, r: Rating, by: string): Promise<void> {
  if (r.rating !== 'up' && r.rating !== 'down') throw new Error('rating must be up or down');
  const task = await store.getTask(taskId);
  if (!task || task.orgId !== orgId) throw new Error('Task not found');
  const reason = typeof r.reason === 'string' ? r.reason.trim().slice(0, MAX_REASON) : '';
  await store.audit({
    id: newId(), orgId, at: nowIso(), actor: by, action: 'task.rated', taskId,
    detail: { agentId: task.agentId, rating: r.rating, reason, summary: `${r.rating === 'up' ? 'Liked' : 'Disliked'} ${task.agentId}'s result${reason ? `: ${reason}` : ''}` },
  });
}

/** The owner's latest feedback for this agent, as a prompt block (empty when there is none). */
export async function feedbackForPrompt(store: Store, orgId: string, agentId: string): Promise<string> {
  const rated = (await store.listAuditByActions(orgId, ['task.rated'])).filter((e) => e.detail.agentId === agentId && e.detail.reason);
  const recent = rated.slice(-LESSONS).reverse();
  if (!recent.length) return '';
  const lines = recent.map((e) => `- ${e.detail.rating === 'up' ? 'Keep doing' : 'Change'}: ${String(e.detail.reason)}`);
  return `\n\nThe owner's feedback on your recent work (follow it):\n${lines.join('\n')}`;
}
