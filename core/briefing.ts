// Morning Briefing: what shipped, what needs a yes, what the agents learned, from the last 24 hours.
import { proposePromotion } from './policy.js';
import type { Store } from './store.js';
import type { Briefing, ModelClient, TextBlock } from './types.js';

export async function buildBriefing(store: Store, orgId: string, now = new Date(), model?: ModelClient): Promise<Briefing> {
  const since = new Date(now.getTime() - 24 * 3600 * 1000).toISOString();
  const [events, pending, feedback, types] = await Promise.all([
    store.listAudit(orgId, since),
    store.listApprovals(orgId, 'pending'),
    store.listFeedback(orgId),
    store.getTaskTypes(orgId),
  ]);

  const shipped = events
    .filter((e) => e.action === 'tool.executed')
    .map((e) => String(e.detail.summary ?? e.detail.tool ?? 'action'));
  const needsYou = pending.map((a) => `${a.kind === 'draft' ? 'Draft to review' : 'Approve'}: ${a.summary}`);
  for (const tt of types) {
    const p = proposePromotion(tt, feedback);
    if (p) needsYou.push(`Autonomy upgrade ready: "${tt.label}" from L${p.from} to L${p.to} (${p.because})`);
  }
  const recent = feedback.filter((f) => f.at >= since);
  const learned = [
    ...recent.filter((f) => f.outcome === 'rejected' && f.reason).map((f) => `Rejected ${f.taskType}: ${f.reason}`),
    ...(recent.some((f) => f.outcome === 'approved_with_edits') ? [`${recent.filter((f) => f.outcome === 'approved_with_edits').length} edited approval(s) saved as examples`] : []),
    ...events.filter((e) => e.action === 'autonomy.demoted').map((e) => `Moved ${String(e.detail.taskType)} back to approval after a rejection`),
  ];

  let summary = `${shipped.length} action(s) done, ${needsYou.length} waiting on you, ${learned.length} lesson(s) learned.`;
  if (model && (shipped.length || needsYou.length || learned.length)) {
    try {
      const resp = await model.complete({
        tier: 'router',
        system: 'Write a two-sentence morning briefing for a busy founder. Plain words, no greeting.',
        messages: [{ role: 'user', content: JSON.stringify({ shipped, needsYou, learned }) }],
        maxTokens: 300,
      });
      const text = resp.content.filter((b): b is TextBlock => b.type === 'text').map((b) => b.text).join(' ').trim();
      if (text) summary = text;
    } catch {
      // Keep the plain summary if the model is unavailable; the briefing must always go out.
    }
  }

  const briefing: Briefing = { orgId, date: now.toISOString().slice(0, 10), shipped, needsYou, learned, summary };
  await store.saveBriefing(briefing);
  return briefing;
}
