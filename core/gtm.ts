// GTM: the sales call loop for each deal in the CRM — prep the call, debrief it into a MEDDIC
// scorecard, send the recap with a mutual action plan, handle objections — plus the Head of GTM's
// weekly pipeline review. Pure functions: the scorecard math and the goals handed to each agent.
// Method adapted from GTM Skills (github.com/gtm-skills/gtm, MIT, © 2025 Prospeda); prompts are SIXXAB's own.

export const MEDDIC = [
  { key: 'metrics', letter: 'M', name: 'Metrics', question: 'What measurable result does the buyer expect, and have they said the number?' },
  { key: 'economic_buyer', letter: 'E', name: 'Economic buyer', question: 'Who can say yes with budget they control, and have we spoken to them?' },
  { key: 'decision_criteria', letter: 'D', name: 'Decision criteria', question: 'What will they judge us on, in their words?' },
  { key: 'decision_process', letter: 'D', name: 'Decision process', question: 'What steps, who signs, and by when?' },
  { key: 'pain', letter: 'I', name: 'Identified pain', question: 'What breaks today, what does it cost, and who feels it?' },
  { key: 'champion', letter: 'C', name: 'Champion', question: 'Who inside wants this, has influence and will sell for us?' },
] as const;

export type MeddicKey = (typeof MEDDIC)[number]['key'];
export type Evidence = 'unknown' | 'partial' | 'confirmed';
export type Meddic = Record<MeddicKey, Evidence>;
export const EVIDENCE: Evidence[] = ['unknown', 'partial', 'confirmed'];
export const EMPTY_MEDDIC: Meddic = { metrics: 'unknown', economic_buyer: 'unknown', decision_criteria: 'unknown', decision_process: 'unknown', pain: 'unknown', champion: 'unknown' };

export interface Scorecard { score: number; verdict: 'Qualified' | 'Developing' | 'Early'; gaps: string[] }

/** Confirmed counts 2, partial 1, unknown 0, out of 12: 75%+ is qualified, under 40% is early. */
export function scoreMeddic(m: Partial<Meddic> | null | undefined): Scorecard {
  const v = { ...EMPTY_MEDDIC, ...(m ?? {}) };
  const points = MEDDIC.reduce((s, e) => s + (v[e.key] === 'confirmed' ? 2 : v[e.key] === 'partial' ? 1 : 0), 0);
  const score = Math.round((points / (MEDDIC.length * 2)) * 100);
  return { score, verdict: score >= 75 ? 'Qualified' : score >= 40 ? 'Developing' : 'Early', gaps: MEDDIC.filter((e) => v[e.key] !== 'confirmed').map((e) => e.name) };
}

export function cleanMeddic(input: unknown): Meddic {
  const src = (input && typeof input === 'object' ? input : {}) as Record<string, unknown>;
  return Object.fromEntries(MEDDIC.map((e) => [e.key, EVIDENCE.includes(src[e.key] as Evidence) ? src[e.key] : 'unknown'])) as Meddic;
}

export interface DealContext {
  name: string; company?: string; email?: string; stage: string; value?: number; source?: string;
  nextStep?: string; notes?: string; meddic?: Partial<Meddic> | null; callNotes?: string;
}

const RULES = 'Use only what is written here and in the business profile; never invent facts about the person or their company, and mark anything unknown as "unknown". Keep it short enough to read in two minutes.';

function dealLines(d: DealContext): string {
  const s = scoreMeddic(d.meddic);
  const ev = { ...EMPTY_MEDDIC, ...(d.meddic ?? {}) };
  return [
    `Deal: ${d.name}${d.company ? ` at ${d.company}` : ''}; stage ${d.stage}${d.value ? `; value ${d.value}` : ''}${d.source ? `; came from ${d.source}` : ''}.`,
    d.nextStep ? `Agreed next step: ${d.nextStep}.` : '',
    d.notes ? `Notes: ${d.notes.slice(0, 1500)}` : '',
    `MEDDIC today (${s.score}%, ${s.verdict}): ${MEDDIC.map((e) => `${e.name} ${ev[e.key]}`).join('; ')}.`,
  ].filter(Boolean).join('\n');
}

export function callPrepGoal(d: DealContext): string {
  const gaps = scoreMeddic(d.meddic).gaps;
  return `Prepare a one-page call brief for the next conversation with this contact. Include: what we know and three hypotheses about their situation; six discovery questions, mostly on the MEDDIC gaps (${gaps.join(', ') || 'none; confirm and move to a decision'}); the two objections they are most likely to raise with a one-line answer each; and the single next step to ask for at the end. ${RULES} Save it as a note titled "Call prep: ${d.name}".\n\n${dealLines(d)}`;
}

export function debriefGoal(d: DealContext): string {
  return `Debrief this sales call into a MEDDIC scorecard. For each element (${MEDDIC.map((e) => e.name).join(', ')}) say confirmed, partial or unknown, with the words from the notes that show it. Then list the three biggest gaps, the questions that would close them on the next call, any red flags, and the recommended next step. ${RULES} Save it as a note titled "MEDDIC: ${d.name}".\n\nCall notes:\n${(d.callNotes ?? '').slice(0, 4000) || '(no notes given: say so and list what to capture next time)'}\n\n${dealLines(d)}`;
}

export function followUpGoal(d: DealContext): string {
  const send = d.email
    ? `Queue the email with send_message (channel "email", to ${d.email}); it waits for the owner's approval.`
    : 'There is no email address, so save the email as a note titled "Follow-up: ' + d.name + '" for the owner to send.';
  return `Write the follow-up after the latest conversation: a short recap email (thanks, what we heard in their words, what we agreed) and a mutual action plan of 3 to 5 steps, each with an owner (them or us) and a target date, ending with the next meeting. No pressure tactics, no invented commitments. ${send} ${RULES}\n\n${d.callNotes ? `Latest call notes:\n${d.callNotes.slice(0, 3000)}\n\n` : ''}${dealLines(d)}`;
}

export function objectionGoal(d: DealContext, objection: string): string {
  return `The contact raised this objection: "${objection.slice(0, 500)}". Write two ways to answer it: acknowledge it in their words, ask one question that finds what is behind it, reframe around the value they told us matters, offer proof only from what we actually have, and suggest a next step. Then say whether this objection is a real blocker for the deal and what would resolve it. ${RULES} Save it as a note titled "Objection: ${d.name}".\n\n${dealLines(d)}`;
}

/** The Head of GTM's weekly review across every open deal. Empty when there is nothing open. */
export function pipelineReviewGoal(deals: DealContext[]): string {
  const open = deals.filter((d) => !['won', 'lost'].includes(d.stage)).slice(0, 40);
  if (!open.length) return '';
  const rows = open.map((d) => { const s = scoreMeddic(d.meddic); return `- ${d.name}${d.company ? ` (${d.company})` : ''}: ${d.stage}, ${d.value || 0}, MEDDIC ${s.score}% ${s.verdict}, gaps: ${s.gaps.join(', ') || 'none'}${d.nextStep ? `, next: ${d.nextStep}` : ''}`; });
  return `Run the weekly pipeline review as Head of GTM. From the open deals below: the expected value this month and next (weight by MEDDIC score), the three deals to focus on and the one action each, deals that look stuck or under-qualified and whether to push or drop them, and the coaching point for the week. Use only these numbers. Save it as a note titled "GTM: weekly pipeline review".\n${rows.join('\n')}`;
}

export function proposalGoal(d: DealContext): string {
  return `Write a proposal for this deal: their situation and goals in their words, what we will do, the plan and timeline, the price and terms from the business profile (mark any price that is not recorded as "to be set by the owner"), why us, and the next step to sign. Plain language, two pages at most. Never invent results, customers or guarantees. Save it as a note titled "Proposal: ${d.name}".\n\n${d.callNotes ? `Latest call notes:\n${d.callNotes.slice(0, 3000)}\n\n` : ''}${dealLines(d)}`;
}

export function winLossGoal(d: DealContext): string {
  const won = d.stage === 'won';
  return `This deal was ${won ? 'won' : 'lost'}. Write a short win-loss review: the real reasons it was ${won ? 'won' : 'lost'} (from the notes and the MEDDIC record, quoting where you can), what we did that helped or hurt, what it says about our ideal customer and our message, and one change to make for the next deal. Remember the main lesson so other sales agents use it. Save it as a note titled "Win-loss: ${d.name}".\n\n${dealLines(d)}`;
}
