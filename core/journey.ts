// The SIXXAB journey: six stages with revenue gates, the step catalogue with hard and soft
// dependencies, revenue by month and milestones. State is derived from append-only audit
// events, so every step, revenue entry and celebration is also in the audit trail.
//
// Gates (owner's decision, Nov 4 2026): Struggle, Scale and Success open at a $10K, $50K and
// $100K month; Significance and SIXXAB at $1M and $10M in the last 12 months. Each gate also
// needs the one before it. Rupees convert at INR_PER_USD (default 85).
import { newId, nowIso, type Store } from './store.js';
import { loadBusinessProfile, type BusinessProfile } from './profile.js';
import { STEPS, type Head, type StepDef } from './journey-steps.js';
import type { AuditEvent } from './types.js';

export { STEPS, type StepDef, type Head } from './journey-steps.js';

export const DEFAULT_INR_PER_USD = 85;

export interface Stage { key: string; name: string; head: Head; level: string; opensAt: string; summary: string; live: boolean }
interface Gate { monthUsd?: number; yearUsd?: number }

export const STAGES: Stage[] = [
  { key: 'startup', name: 'Startup', head: 'Start', level: '$0', opensAt: 'Day one', summary: 'From idea or restart to your first $10K month', live: true },
  { key: 'struggle', name: 'Struggle', head: 'Start', level: '$10K', opensAt: 'a $10K month', summary: '$10K months, building to $50K', live: true },
  { key: 'scale', name: 'Scale', head: 'Scale', level: '$50K', opensAt: 'a $50K month', summary: '$50K months, building to $100K', live: true },
  { key: 'success', name: 'Success', head: 'Scale', level: '$100K', opensAt: 'a $100K month', summary: '$100K months, building to $1M a year', live: true },
  { key: 'significance', name: 'Significance', head: 'Run', level: '$1M', opensAt: '$1M in 12 months', summary: '$1M a year, building to $10M', live: true },
  { key: 'sixxab', name: 'SIXXAB', head: 'Run', level: '$10M', opensAt: '$10M in 12 months', summary: '$10M a year, running on agents', live: true },
];
const GATES: Record<string, Gate> = {
  struggle: { monthUsd: 10_000 }, scale: { monthUsd: 50_000 }, success: { monthUsd: 100_000 },
  significance: { yearUsd: 1_000_000 }, sixxab: { yearUsd: 10_000_000 },
};

export interface MilestoneDef { key: string; title: string }
export const MILESTONES: MilestoneDef[] = [
  { key: 'profile_saved', title: 'Business profile saved' },
  { key: 'diagnosed', title: 'Business diagnosed' },
  { key: 'offer_chosen', title: 'Offer chosen' },
  { key: 'roadmap_approved', title: '90-day roadmap approved' },
  { key: 'first_post', title: 'First post live' },
  { key: 'first_reply', title: 'First reply sent' },
  { key: 'first_customer', title: 'First paying customer' },
  { key: 'month_10k', title: 'First $10K month' },
  { key: 'playbooks', title: 'Operating playbooks written' },
  { key: 'month_50k', title: 'First $50K month' },
  { key: 'month_100k', title: 'First $100K month' },
  { key: 'annual_plan', title: 'Annual plan approved' },
  { key: 'year_1m', title: '$1M in 12 months' },
  { key: 'year_10m', title: '$10M in 12 months' },
  { key: 'autonomy_earned', title: 'An agent earned autonomy' },
];

export interface RevenueMonth { month: string; amount: number; currency: string }
export interface StepState extends Omit<StepDef, 'soft'> { status: 'done' | 'ready' | 'blocked'; blockedBy: string[]; warnings: string[]; doneAt: string | null }
export interface Journey {
  stage: Stage;
  nextGate: string;
  stages: Stage[];
  steps: StepState[];
  revenue: { currency: string; months: RevenueMonth[]; bestRecentMonthUsd: number; last12Usd: number; inrPerUsd: number };
  milestones: { key: string; title: string; reachedAt: string | null }[];
}
export interface JourneyOptions { inrPerUsd?: number }

const EVENTS = ['profile.updated', 'journey.step_done', 'journey.step_reopened', 'revenue.recorded', 'milestone.reached', 'tool.executed', 'autonomy.promoted'];

const monthIndex = (m: string) => Number(m.slice(0, 4)) * 12 + Number(m.slice(5, 7)) - 1;

/** Revenue as of the events so far: latest entry per month, best of the last 3 recorded months, and the last 12 months' total, in USD. */
function revenueSnapshot(byMonth: Map<string, number>, toUsd: (n: number) => number) {
  const months = [...byMonth.keys()].sort();
  if (!months.length) return { bestRecentMonthUsd: 0, last12Usd: 0 };
  const latest = monthIndex(months.at(-1)!);
  const bestRecentMonthUsd = Math.max(...months.slice(-3).map((m) => toUsd(byMonth.get(m)!)));
  const last12Usd = months.filter((m) => latest - monthIndex(m) < 12).reduce((sum, m) => sum + toUsd(byMonth.get(m)!), 0);
  return { bestRecentMonthUsd, last12Usd };
}

function stageFor(bestRecentMonthUsd: number, last12Usd: number): Stage {
  let i = 0;
  for (let k = 1; k < STAGES.length; k++) {
    const g = GATES[STAGES[k].key];
    const ok = (g.monthUsd === undefined || bestRecentMonthUsd >= g.monthUsd) && (g.yearUsd === undefined || last12Usd >= g.yearUsd);
    if (!ok) break;
    i = k;
  }
  return STAGES[i];
}

function stepsDone(events: AuditEvent[]): Map<string, string> {
  const done = new Map<string, string>();
  for (const e of events) {
    const step = String(e.detail.step ?? '');
    if (e.action === 'journey.step_done') done.set(step, e.at);
    if (e.action === 'journey.step_reopened') done.delete(step);
  }
  return done;
}

const usdText = (n: number) => `$${Math.round(n).toLocaleString('en-US')}`;

/** Pure: the journey as the profile and events describe it. */
export function computeJourney(profile: BusinessProfile | null, events: AuditEvent[], opts: JourneyOptions = {}): Journey {
  const currency = profile?.currency ?? 'USD';
  const inrPerUsd = opts.inrPerUsd && opts.inrPerUsd > 0 ? opts.inrPerUsd : DEFAULT_INR_PER_USD;
  const toUsd = (n: number) => (currency === 'INR' ? n / inrPerUsd : n);

  // Walk revenue in order: the month total so far, plus when each revenue milestone was first crossed.
  const byMonth = new Map<string, number>();
  const crossed: Record<string, string | null> = { first_customer: null, month_10k: null, month_50k: null, month_100k: null, year_1m: null, year_10m: null };
  for (const e of events) {
    if (e.action !== 'revenue.recorded') continue;
    byMonth.set(String(e.detail.month), Number(e.detail.amount));
    const snap = revenueSnapshot(byMonth, toUsd);
    const mark = (k: string, ok: boolean) => { if (ok && !crossed[k]) crossed[k] = e.at; };
    mark('first_customer', Number(e.detail.amount) > 0);
    mark('month_10k', snap.bestRecentMonthUsd >= 10_000);
    mark('month_50k', snap.bestRecentMonthUsd >= 50_000);
    mark('month_100k', snap.bestRecentMonthUsd >= 100_000);
    mark('year_1m', snap.last12Usd >= 1_000_000);
    mark('year_10m', snap.last12Usd >= 10_000_000);
  }
  const months = [...byMonth.entries()].sort(([a], [b]) => (a < b ? -1 : 1)).map(([month, amount]) => ({ month, amount, currency }));
  const { bestRecentMonthUsd, last12Usd } = revenueSnapshot(byMonth, toUsd);

  const done = stepsDone(events);
  const firstProfile = events.find((e) => e.action === 'profile.updated');
  if (profile?.name && profile.offer && firstProfile) done.set('onboard', done.get('onboard') ?? firstProfile.at);

  const title = (id: string) => STEPS.find((s) => s.id === id)!.title;
  const ctx = { profile, revenueMonths: months };
  const steps: StepState[] = STEPS.map(({ soft, ...s }) => {
    const blockedBy = s.hard.filter((h) => !done.has(h)).map(title);
    const doneAt = done.get(s.id) ?? null;
    return { ...s, status: doneAt ? 'done' : blockedBy.length ? 'blocked' : 'ready', blockedBy, warnings: doneAt ? [] : soft.filter((c) => !c.ok(ctx)).map((c) => c.label), doneAt };
  });

  const firstTool = (tools: string[]) => events.find((e) => e.action === 'tool.executed' && tools.includes(String(e.detail.tool)))?.at ?? null;
  const reached: Record<string, string | null> = {
    ...crossed,
    profile_saved: firstProfile?.at ?? null,
    diagnosed: done.get('diagnose') ?? null,
    offer_chosen: done.get('restart') ?? null,
    roadmap_approved: done.get('plan') ?? null,
    first_post: firstTool(['publish_post']),
    first_reply: firstTool(['reply_comment', 'send_message']),
    playbooks: done.get('ops') ?? null,
    annual_plan: done.get('exec_plan') ?? null,
    autonomy_earned: events.find((e) => e.action === 'autonomy.promoted')?.at ?? null,
  };

  const stage = stageFor(bestRecentMonthUsd, last12Usd);
  const next = STAGES[STAGES.indexOf(stage) + 1];
  const where = next && GATES[next.key].yearUsd ? `last 12 months ${usdText(last12Usd)}` : `best recent month ${usdText(bestRecentMonthUsd)}`;
  const nextGate = next
    ? `Next: ${next.name} opens at ${next.opensAt} (${where}${currency === 'INR' ? `, at ₹${inrPerUsd} per $` : ''}).`
    : 'You have reached SIXXAB: the business runs on agents while you lead.';
  return {
    stage, nextGate, stages: STAGES, steps,
    revenue: { currency, months, bestRecentMonthUsd, last12Usd, inrPerUsd },
    milestones: MILESTONES.map((m) => ({ ...m, reachedAt: reached[m.key] ?? null })),
  };
}

/** Loads the journey and records any newly reached milestone once, so it is celebrated once. */
export async function loadJourney(store: Store, orgId: string, opts: JourneyOptions = {}): Promise<Journey> {
  const [profile, events] = await Promise.all([loadBusinessProfile(store, orgId), store.listAuditByActions(orgId, EVENTS)]);
  const j = computeJourney(profile, events, opts);
  const celebrated = new Set(events.filter((e) => e.action === 'milestone.reached').map((e) => String(e.detail.key)));
  for (const m of j.milestones) {
    if (!m.reachedAt || celebrated.has(m.key)) continue;
    await store.audit({ id: newId(), orgId, at: nowIso(), actor: 'milestone-tracker', action: 'milestone.reached', taskId: null, detail: { key: m.key, summary: m.title } });
  }
  return j;
}

export async function completeStep(store: Store, orgId: string, stepId: string, by: string, opts: JourneyOptions = {}): Promise<Journey> {
  const def = STEPS.find((s) => s.id === stepId);
  if (!def) throw new Error(`Unknown step "${stepId}"`);
  const step = (await loadJourney(store, orgId, opts)).steps.find((s) => s.id === stepId)!;
  if (step.status === 'blocked') throw new Error(`Finish first: ${step.blockedBy.join(', ')}`);
  if (step.status !== 'done') {
    await store.audit({ id: newId(), orgId, at: nowIso(), actor: by, action: 'journey.step_done', taskId: null, detail: { step: stepId, summary: `${def.title} done`, warnings: step.warnings } });
  }
  return loadJourney(store, orgId, opts);
}

export async function reopenStep(store: Store, orgId: string, stepId: string, by: string, opts: JourneyOptions = {}): Promise<Journey> {
  const def = STEPS.find((s) => s.id === stepId);
  if (!def) throw new Error(`Unknown step "${stepId}"`);
  await store.audit({ id: newId(), orgId, at: nowIso(), actor: by, action: 'journey.step_reopened', taskId: null, detail: { step: stepId, summary: `${def.title} reopened` } });
  return loadJourney(store, orgId, opts);
}

export async function recordRevenue(store: Store, orgId: string, entry: { month: string; amount: number; note?: string }, by: string, opts: JourneyOptions = {}): Promise<Journey> {
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(entry.month)) throw new Error('month must look like 2026-10');
  if (!Number.isFinite(entry.amount) || entry.amount < 0) throw new Error('amount must be zero or more');
  const profile = await loadBusinessProfile(store, orgId);
  const note = typeof entry.note === 'string' ? entry.note.trim().slice(0, 300) : '';
  await store.audit({
    id: newId(), orgId, at: nowIso(), actor: by, action: 'revenue.recorded', taskId: null,
    detail: { month: entry.month, amount: entry.amount, currency: profile?.currency ?? 'USD', note, summary: `Revenue ${entry.month}: ${entry.amount}` },
  });
  return loadJourney(store, orgId, opts);
}

/** A short journey summary for agent prompts (read-only: records nothing). */
export async function journeyForPrompt(store: Store, orgId: string, opts: JourneyOptions = {}): Promise<string> {
  const [profile, events] = await Promise.all([loadBusinessProfile(store, orgId), store.listAuditByActions(orgId, EVENTS)]);
  const j = computeJourney(profile, events, opts);
  const doneSteps = j.steps.filter((s) => s.status === 'done').map((s) => s.title);
  const next = j.steps.find((s) => s.status === 'ready');
  const months = j.revenue.months.slice(-3).map((m) => `${m.month}: ${m.amount} ${m.currency}`);
  const reached = j.milestones.filter((m) => m.reachedAt).map((m) => m.title);
  return [
    '\n\nWhere the business is on the SIXXAB journey:',
    `- Stage: ${j.stage.name} (${j.stage.summary}). ${j.nextGate}`,
    `- Steps done: ${doneSteps.length ? doneSteps.join(', ') : 'none yet'}`,
    next ? `- Next step: ${next.title}${next.warnings.length ? ` (also: ${next.warnings.join('; ')})` : ''}` : '- No step is ready; finish the blocked ones first',
    `- Revenue by month: ${months.length ? months.join('; ') : 'not recorded yet'}`,
    `- Milestones reached: ${reached.length ? reached.join(', ') : 'none yet'}`,
  ].join('\n');
}
