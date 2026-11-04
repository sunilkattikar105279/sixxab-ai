// The SIXXAB journey: six stages, the Startup and Struggle steps with hard and soft dependencies,
// revenue by month and milestones. State is derived from append-only audit events, so every
// step, entry and celebration is also part of the audit trail.
import { newId, nowIso, type Store } from './store.js';
import { BUSINESS_STAGES, loadBusinessProfile, type BusinessProfile } from './profile.js';
import type { AuditEvent } from './types.js';

export interface Stage { key: string; name: string; head: 'Start' | 'Scale' | 'Run'; level: string; summary: string; live: boolean }

export const STAGES: Stage[] = [
  { key: 'startup', name: 'Startup', head: 'Start', level: '$0', summary: 'Idea or restart to the first customer', live: true },
  { key: 'struggle', name: 'Struggle', head: 'Start', level: '$10K', summary: 'First customers to repeatable revenue', live: true },
  { key: 'scale', name: 'Scale', head: 'Scale', level: '$50K', summary: 'Marketing, sales and support run daily', live: false },
  { key: 'success', name: 'Success', head: 'Scale', level: '$100K', summary: 'A healthy business with a back office', live: false },
  { key: 'significance', name: 'Significance', head: 'Run', level: '$1M', summary: 'You lead; CXO agents work to one plan', live: false },
  { key: 'sixxab', name: 'SIXXAB', head: 'Run', level: '$10M', summary: 'Runs on agents; new markets in parallel', live: false },
];

interface SoftCheck { label: string; ok: (ctx: Ctx) => boolean }

export interface StepDef {
  id: string;
  title: string;
  summary: string;
  agentId: string | null;
  agents: string;
  ownerDecides: string;
  output: string;
  /** Steps that must be done first (blocks). */
  hard: string[];
  /** Checks that should pass first (warns, never blocks). */
  soft: SoftCheck[];
  /** What the step's agent is asked to do. */
  goal: string;
}

interface Ctx { profile: BusinessProfile | null; revenueMonths: RevenueMonth[] }
const has = (k: keyof BusinessProfile) => (c: Ctx) => Boolean(c.profile?.[k]);
const anyChannel = (c: Ctx) => ['whatsapp', 'googleProfile', 'instagram', 'facebook', 'linkedin'].some((k) => c.profile?.[k as keyof BusinessProfile]);

export const STEPS: StepDef[] = [
  {
    id: 'onboard', title: 'Onboard', summary: 'Tell your agents about the business: offer, customers, numbers, goals and channels.',
    agentId: null, agents: 'Onboarding Guide', ownerDecides: 'Confirms the business profile', output: 'Business profile, stage placed',
    hard: [], soft: [], goal: '',
  },
  {
    id: 'diagnose', title: 'Diagnose', summary: 'A health check places you on the SIXXAB path and shows what is holding you back.',
    agentId: 'health-check', agents: 'Business Health Check, Strategy Coach', ownerDecides: 'Confirms goals and stage', output: 'Stage report and top 3 priorities',
    hard: ['onboard'], soft: [{ label: 'Record last month’s revenue', ok: (c) => has('revenueMonthly')(c) || c.revenueMonths.length > 0 }],
    goal: 'Run the business health check: place the business on the SIXXAB path, name what is holding it back, and give the top 3 priorities for the next 90 days. Save it as a note titled "Stage report".',
  },
  {
    id: 'restart', title: 'Restart', summary: 'Reset the niche, offer and pricing around real demand. Stop what is not working.',
    agentId: 'niche-offer', agents: 'Niche and Offer, Strategy Coach', ownerDecides: 'Chooses the offer to back', output: 'One validated offer with price',
    hard: ['diagnose'], soft: [{ label: 'Add your prices to the profile', ok: has('pricing') }],
    goal: 'Review the niche, offer and pricing against what customers actually buy. Propose up to three offer options with price, who it is for and why, and recommend one. Save it as a note titled "Offer options".',
  },
  {
    id: 'plan', title: 'Plan', summary: 'One goal, a 90-day roadmap and a weekly plan that every agent works to.',
    agentId: 'roadmap-planner', agents: 'Roadmap Planner, Founder Orchestrator', ownerDecides: 'Approves the roadmap', output: 'One goal, 90-day roadmap, weekly plan',
    hard: ['restart'], soft: [{ label: 'Set a monthly marketing budget', ok: has('budget') }],
    goal: 'Write the 90-day roadmap: one measurable goal, three 30-day milestones, and this week’s plan with an owner for each task. Save it as a note titled "90-day roadmap".',
  },
  {
    id: 'staff', title: 'Staff with agents', summary: 'Switch on the agents your stage needs and connect your channels.',
    agentId: null, agents: 'Founder Orchestrator', ownerDecides: 'Picks which agents start; connects channels', output: 'Agent team and channels live',
    hard: ['plan'], soft: [{ label: 'Add at least one channel (WhatsApp, Google, Instagram, Facebook or LinkedIn)', ok: anyChannel }],
    goal: '',
  },
  {
    id: 'grow', title: 'Grow', summary: 'Marketing, replies and follow-up run every day. You approve posts, messages and spend.',
    agentId: 'cmo', agents: 'CMO, Social Poster, Comment Responder, Customer Reply', ownerDecides: 'Approves posts, replies and spend', output: 'Posts, replies, enquiries',
    hard: ['staff'], soft: [{ label: 'Describe your brand voice', ok: has('voice') }],
    goal: 'Plan this week’s marketing from the 90-day roadmap: three posts for the business’s channels, drafted in its voice and sent for approval.',
  },
  {
    id: 'run', title: 'Run', summary: 'Weekly review: revenue, milestones and what the agents learned, so the next week runs better.',
    agentId: 'milestone-tracker', agents: 'Milestone Tracker, Learning Engine', ownerDecides: 'Handles exceptions and big calls', output: 'Weekly review',
    hard: ['grow'], soft: [{ label: 'Record this month’s revenue', ok: (c) => c.revenueMonths.length > 0 }],
    goal: 'Write the weekly review: revenue against the goal, milestones reached, what was approved, edited or rejected and what to change next week. Save it as a note titled "Weekly review".',
  },
];

export interface MilestoneDef { key: string; title: string }
export const MILESTONES: MilestoneDef[] = [
  { key: 'profile_saved', title: 'Business profile saved' },
  { key: 'diagnosed', title: 'Business diagnosed' },
  { key: 'offer_chosen', title: 'Offer chosen' },
  { key: 'roadmap_approved', title: '90-day roadmap approved' },
  { key: 'first_post', title: 'First post live' },
  { key: 'first_reply', title: 'First reply sent' },
  { key: 'first_customer', title: 'First paying customer' },
  { key: 'autonomy_earned', title: 'An agent earned autonomy' },
];

export interface RevenueMonth { month: string; amount: number; currency: string }
export interface StepState extends Omit<StepDef, 'soft'> { status: 'done' | 'ready' | 'blocked'; blockedBy: string[]; warnings: string[]; doneAt: string | null }
export interface Journey {
  stage: Stage;
  nextGate: string;
  stages: Stage[];
  steps: StepState[];
  revenue: { currency: string; months: RevenueMonth[] };
  milestones: { key: string; title: string; reachedAt: string | null }[];
}

const EVENTS = ['profile.updated', 'journey.step_done', 'journey.step_reopened', 'revenue.recorded', 'milestone.reached', 'tool.executed', 'autonomy.promoted'];
const PAYING = new Set(BUSINESS_STAGES.slice(2));

function revenueMonths(events: AuditEvent[], currency: string): RevenueMonth[] {
  const latest = new Map<string, number>();
  for (const e of events) if (e.action === 'revenue.recorded') latest.set(String(e.detail.month), Number(e.detail.amount));
  return [...latest.entries()].sort(([a], [b]) => (a < b ? -1 : 1)).map(([month, amount]) => ({ month, amount, currency }));
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

/** Pure: the journey as the events and profile describe it. */
export function computeJourney(profile: BusinessProfile | null, events: AuditEvent[]): Journey {
  const currency = profile?.currency ?? 'USD';
  const months = revenueMonths(events, currency);
  const ctx: Ctx = { profile, revenueMonths: months };
  const done = stepsDone(events);
  const firstProfile = events.find((e) => e.action === 'profile.updated');
  if (profile?.name && profile.offer && firstProfile) done.set('onboard', done.get('onboard') ?? firstProfile.at);

  const title = (id: string) => STEPS.find((s) => s.id === id)!.title;
  const steps: StepState[] = STEPS.map(({ soft, ...s }) => {
    const blockedBy = s.hard.filter((h) => !done.has(h)).map(title);
    const doneAt = done.get(s.id) ?? null;
    return { ...s, status: doneAt ? 'done' : blockedBy.length ? 'blocked' : 'ready', blockedBy, warnings: doneAt ? [] : soft.filter((c) => !c.ok(ctx)).map((c) => c.label), doneAt };
  });

  const firstPaid = events.find((e) => e.action === 'revenue.recorded' && Number(e.detail.amount) > 0)?.at
    ?? (profile?.businessStage && PAYING.has(profile.businessStage) ? firstProfile?.at ?? null : null);
  const firstTool = (tools: string[]) => events.find((e) => e.action === 'tool.executed' && tools.includes(String(e.detail.tool)))?.at ?? null;
  const reached: Record<string, string | null> = {
    profile_saved: firstProfile?.at ?? null,
    diagnosed: done.get('diagnose') ?? null,
    offer_chosen: done.get('restart') ?? null,
    roadmap_approved: done.get('plan') ?? null,
    first_post: firstTool(['publish_post']),
    first_reply: firstTool(['reply_comment', 'send_message']),
    first_customer: firstPaid,
    autonomy_earned: events.find((e) => e.action === 'autonomy.promoted')?.at ?? null,
  };

  const stage = STAGES[firstPaid ? 1 : 0];
  const nextGate = stage.key === 'startup'
    ? 'Next gate: your first paying customer (record revenue, or set "Paying customers" in your profile).'
    : 'Next gate: the Scale level. Scale, Success and later stages open after the pilot; gate rules are being confirmed.';
  return {
    stage, nextGate, stages: STAGES, steps,
    revenue: { currency, months },
    milestones: MILESTONES.map((m) => ({ ...m, reachedAt: reached[m.key] })),
  };
}

/** Loads the journey and records any newly reached milestone once, so it is celebrated once. */
export async function loadJourney(store: Store, orgId: string): Promise<Journey> {
  const [profile, events] = await Promise.all([loadBusinessProfile(store, orgId), store.listAuditByActions(orgId, EVENTS)]);
  const j = computeJourney(profile, events);
  const celebrated = new Set(events.filter((e) => e.action === 'milestone.reached').map((e) => String(e.detail.key)));
  for (const m of j.milestones) {
    if (!m.reachedAt || celebrated.has(m.key)) continue;
    await store.audit({ id: newId(), orgId, at: nowIso(), actor: 'milestone-tracker', action: 'milestone.reached', taskId: null, detail: { key: m.key, summary: m.title } });
  }
  return j;
}

export async function completeStep(store: Store, orgId: string, stepId: string, by: string): Promise<Journey> {
  const def = STEPS.find((s) => s.id === stepId);
  if (!def) throw new Error(`Unknown step "${stepId}"`);
  const j = await loadJourney(store, orgId);
  const step = j.steps.find((s) => s.id === stepId)!;
  if (step.status === 'blocked') throw new Error(`Finish first: ${step.blockedBy.join(', ')}`);
  if (step.status !== 'done') {
    await store.audit({ id: newId(), orgId, at: nowIso(), actor: by, action: 'journey.step_done', taskId: null, detail: { step: stepId, summary: `${def.title} done`, warnings: step.warnings } });
  }
  return loadJourney(store, orgId);
}

export async function reopenStep(store: Store, orgId: string, stepId: string, by: string): Promise<Journey> {
  const def = STEPS.find((s) => s.id === stepId);
  if (!def) throw new Error(`Unknown step "${stepId}"`);
  await store.audit({ id: newId(), orgId, at: nowIso(), actor: by, action: 'journey.step_reopened', taskId: null, detail: { step: stepId, summary: `${def.title} reopened` } });
  return loadJourney(store, orgId);
}

export async function recordRevenue(store: Store, orgId: string, entry: { month: string; amount: number; note?: string }, by: string): Promise<Journey> {
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(entry.month)) throw new Error('month must look like 2026-10');
  if (!Number.isFinite(entry.amount) || entry.amount < 0) throw new Error('amount must be zero or more');
  const profile = await loadBusinessProfile(store, orgId);
  const note = typeof entry.note === 'string' ? entry.note.trim().slice(0, 300) : '';
  await store.audit({
    id: newId(), orgId, at: nowIso(), actor: by, action: 'revenue.recorded', taskId: null,
    detail: { month: entry.month, amount: entry.amount, currency: profile?.currency ?? 'USD', note, summary: `Revenue ${entry.month}: ${entry.amount}` },
  });
  return loadJourney(store, orgId);
}

/** A short journey summary for agent prompts (read-only: records nothing). */
export async function journeyForPrompt(store: Store, orgId: string): Promise<string> {
  const [profile, events] = await Promise.all([loadBusinessProfile(store, orgId), store.listAuditByActions(orgId, EVENTS)]);
  const j = computeJourney(profile, events);
  const done = j.steps.filter((s) => s.status === 'done').map((s) => s.title);
  const next = j.steps.find((s) => s.status !== 'done');
  const months = j.revenue.months.slice(-3).map((m) => `${m.month}: ${m.amount} ${m.currency}`);
  const reached = j.milestones.filter((m) => m.reachedAt).map((m) => m.title);
  return [
    '\n\nWhere the business is on the SIXXAB journey:',
    `- Stage: ${j.stage.name} (${j.stage.summary}). ${j.nextGate}`,
    `- Steps done: ${done.length ? done.join(', ') : 'none yet'}`,
    next ? `- Next step: ${next.title}${next.warnings.length ? ` (also: ${next.warnings.join('; ')})` : ''}` : '- All Start-the-business steps are done',
    `- Revenue by month: ${months.length ? months.join('; ') : 'not recorded yet'}`,
    `- Milestones reached: ${reached.length ? reached.join(', ') : 'none yet'}`,
  ].join('\n');
}
