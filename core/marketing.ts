// AI Marketing Agency, phase 1: the assessment questionnaire, the readiness score, the recommended plan,
// the cost-per-lead ceiling and the 30-day plan, plus the plan catalog and the record of each payment.
// Everything is an append-only audit event in the business's workspace. Nothing here posts, spends or charges.
import { newId, nowIso, type Store } from './store.js';
import type { BusinessProfile } from './profile.js';
import { draftInvoice, setInvoiceStatus, setPlan } from './billing.js';
import { addNewContact, setDealStage } from './crm.js';

// ── Plan catalog ────────────────────────────────────────────────────────────

export type PlanId = 'starter' | 'growth' | 'agency' | 'scale';
export interface MarketingPlan {
  id: PlanId; name: string; priceUsd: number; for: string; images: number; videos: number; credits: number;
  includes: string[]; checkout: boolean;
}

/** Monthly USD prices. Scale is the full agent company plan and is set up on a call, not at checkout. */
export const MARKETING_PLANS: MarketingPlan[] = [
  {
    id: 'starter', name: 'Starter', priceUsd: 79, for: 'Owners who run it themselves', images: 20, videos: 4, credits: 100, checkout: true,
    includes: ['Assessment and 30-day plan', '20 image ads and 4 short videos a month', 'Organic posting on your linked pages', 'Leads into your CRM'],
  },
  {
    id: 'growth', name: 'Growth', priceUsd: 249, for: 'Small businesses that want paid ads managed', images: 40, videos: 8, credits: 200, checkout: true,
    includes: ['Everything in Starter', 'Ads managed in your own Meta and Google accounts', '40 image ads and 8 short videos a month', 'Drafted replies to every lead', 'Weekly report'],
  },
  {
    id: 'agency', name: 'Agency', priceUsd: 999, for: 'Owners who want it done for them', images: 80, videos: 16, credits: 400, checkout: true,
    includes: ['Everything in Growth', 'A SIXXAB person reviews every creative', 'A landing page and a WhatsApp lead line', 'Monthly strategy call', 'Up to 3 locations, 80 images and 16 videos a month'],
  },
  {
    id: 'scale', name: 'Scale', priceUsd: 5000, for: 'Larger and multi-location businesses', images: 0, videos: 0, credits: 0, checkout: false,
    includes: ['The 12-month small business plan with the full agent company', 'Set up with you on a call'],
  },
];

export const getMarketingPlan = (id: unknown): MarketingPlan | undefined => MARKETING_PLANS.find((p) => p.id === id);

// ── Questionnaire ───────────────────────────────────────────────────────────

export interface Question {
  key: string; label: string; kind: 'text' | 'long' | 'number' | 'choice'; options?: string[]; hint?: string;
}

export const REPEAT_RATES = ['Once', 'A few times a year', 'Monthly or more', 'Not sure'];
export const REPLY_SPEEDS = ['Within 5 minutes', 'Within an hour', 'Same day', 'Next day or later', 'Not sure'];
export const PIXEL_ANSWERS = ['Yes', 'No', 'Not sure'];
export const ASSET_ANSWERS = ['Logo, photos and videos', 'Logo and photos', 'Logo only', 'Nothing yet'];

/** About 20 questions in six parts. Anything already in the business profile is filled in. */
export const ASSESSMENT_SECTIONS: { title: string; questions: Question[] }[] = [
  {
    title: 'Business',
    questions: [
      { key: 'name', label: 'Business name', kind: 'text' },
      { key: 'industry', label: 'Industry', kind: 'text' },
      { key: 'location', label: 'Location and service area', kind: 'text', hint: 'e.g. Dallas, TX and 20 miles around' },
      { key: 'founded', label: 'Year started', kind: 'number' },
      { key: 'team', label: 'Team size', kind: 'text' },
    ],
  },
  {
    title: 'Offer',
    questions: [
      { key: 'services', label: 'Top 3 services or products, with the price of each', kind: 'long' },
      { key: 'averageSale', label: 'Average first sale', kind: 'number', hint: 'In your currency, e.g. 450' },
      { key: 'repeatRate', label: 'How often customers buy again', kind: 'choice', options: REPEAT_RATES },
    ],
  },
  {
    title: 'Customers',
    questions: [
      { key: 'bestCustomer', label: 'Your best customer', kind: 'long', hint: 'Who they are and why they choose you' },
      { key: 'sources', label: 'Where customers come from today', kind: 'text' },
      { key: 'closeRate', label: 'Out of 10 people who ask, how many buy?', kind: 'number', hint: '0 to 10' },
      { key: 'seasons', label: 'Busy and slow months', kind: 'text' },
    ],
  },
  {
    title: 'Goals',
    questions: [
      { key: 'leadsWanted', label: 'New leads wanted a month', kind: 'number' },
      { key: 'revenueGoal', label: 'Monthly revenue goal', kind: 'number' },
      { key: 'adBudget', label: 'Monthly ad budget', kind: 'number', hint: 'Paid to Meta or Google directly, not to SIXXAB' },
      { key: 'startDate', label: 'When to start', kind: 'text' },
    ],
  },
  {
    title: 'Marketing today',
    questions: [
      { key: 'website', label: 'Website', kind: 'text' },
      { key: 'booking', label: 'Booking or buy link', kind: 'text' },
      { key: 'googleProfile', label: 'Google Business Profile link', kind: 'text' },
      { key: 'social', label: 'Social pages', kind: 'long', hint: 'One link per line' },
      { key: 'reviews', label: 'Number of Google reviews', kind: 'number' },
      { key: 'pixel', label: 'Is a Meta pixel or Google tag on your website?', kind: 'choice', options: PIXEL_ANSWERS },
      { key: 'adsToday', label: 'Ad spend and results today', kind: 'text', hint: 'e.g. $300 a month on Facebook, about 10 leads' },
      { key: 'replySpeed', label: 'How fast new leads get a reply', kind: 'choice', options: REPLY_SPEEDS },
    ],
  },
  {
    title: 'Assets and limits',
    questions: [
      { key: 'assets', label: 'Photos, videos and logo you have', kind: 'choice', options: ASSET_ANSWERS },
      { key: 'voice', label: 'Brand voice', kind: 'text' },
      { key: 'avoid', label: 'Claims to avoid', kind: 'long', hint: 'Medical, legal or financial ad rules, or anything you never say' },
      { key: 'approver', label: 'Who approves ads before they go out', kind: 'text' },
    ],
  },
];

export const QUESTIONS: Question[] = ASSESSMENT_SECTIONS.flatMap((s) => s.questions);
export type Answers = Record<string, string>;
const MAX_ANSWER = 1500;

const firstNumber = (s: string | undefined): string => {
  const m = (s ?? '').replace(/,/g, '').match(/\d+(\.\d+)?/);
  return m ? m[0] : '';
};

/** Answers taken from the business profile, so the owner is not asked twice. */
export function prefillAnswers(p: BusinessProfile | null): Answers {
  if (!p) return {};
  const out: Answers = {
    name: p.name ?? '', industry: p.industry ?? '', location: [p.location, p.markets].filter(Boolean).join('; '), founded: p.founded ?? '', team: p.team ?? '',
    services: [p.offer, p.pricing].filter(Boolean).join('\n'), bestCustomer: p.customers ?? '', sources: p.sources ?? '',
    revenueGoal: firstNumber(p.revenueGoal), adBudget: firstNumber(p.budget), website: p.links ?? '', googleProfile: p.googleProfile ?? '',
    social: [p.instagram, p.facebook, p.linkedin].filter(Boolean).join('\n'), voice: p.voice ?? '',
  };
  return Object.fromEntries(Object.entries(out).filter(([, v]) => v));
}

/** Cleans the answers: known questions only, text trimmed and capped, numbers and choices checked. */
export function validateAnswers(body: unknown): Answers {
  if (!body || typeof body !== 'object' || Array.isArray(body)) throw new Error('Send the answers as an object');
  const src = body as Record<string, unknown>;
  const out: Answers = {};
  for (const q of QUESTIONS) {
    const raw = src[q.key];
    if (raw === undefined || raw === null || raw === '') continue;
    if (typeof raw !== 'string' && typeof raw !== 'number') throw new Error(`${q.label} must be text`);
    const v = String(raw).trim().slice(0, MAX_ANSWER);
    if (!v) continue;
    if (q.kind === 'number') {
      const n = Number(v.replace(/,/g, ''));
      if (!Number.isFinite(n) || n < 0) throw new Error(`${q.label} must be a number of zero or more`);
      if (q.key === 'closeRate' && n > 10) throw new Error('Out of 10 people, the number who buy must be 0 to 10');
      out[q.key] = String(n);
      continue;
    }
    if (q.kind === 'choice' && !q.options!.includes(v)) throw new Error(`${q.label} must be one of: ${q.options!.join(', ')}`);
    out[q.key] = v;
  }
  return out;
}

const num = (a: Answers, k: string): number | null => {
  const n = Number(a[k]);
  return a[k] !== undefined && a[k] !== '' && Number.isFinite(n) ? n : null;
};

// ── Readiness, plan and cost per lead ───────────────────────────────────────

export const CHECK_ITEMS = ['website', 'booking', 'google', 'social', 'reviews', 'pixel'] as const;
export type CheckItem = (typeof CHECK_ITEMS)[number];
export type CheckStatus = 'found' | 'missing' | 'unclear';

export interface Validation {
  checks: { item: CheckItem; status: CheckStatus; note: string; source: string }[];
  summary: string; at: string; by: string;
}

export interface ReadinessCheck { key: string; label: string; weight: number; earned: number; fix: string; confirmed: boolean | null }
export interface Readiness { score: number; checks: ReadinessCheck[]; gaps: string[] }

const CHECKS: { key: string; label: string; weight: number; item?: CheckItem; fix: string; earn: (a: Answers) => number }[] = [
  { key: 'website', item: 'website', label: 'Website', weight: 15, fix: 'Add a website, even one page, so ads have somewhere to send people', earn: (a) => (a.website ? 1 : 0) },
  { key: 'google', item: 'google', label: 'Google Business Profile', weight: 15, fix: 'Claim your Google Business Profile so local searches find you', earn: (a) => (a.googleProfile ? 1 : 0) },
  { key: 'booking', item: 'booking', label: 'Booking or buy link', weight: 10, fix: 'Add a booking or buy link so a lead can act at once', earn: (a) => (a.booking ? 1 : 0) },
  { key: 'social', item: 'social', label: 'Social pages', weight: 10, fix: 'Open an Instagram or Facebook page for posts and ads', earn: (a) => (a.social ? 1 : 0) },
  { key: 'reviews', item: 'reviews', label: 'Reviews', weight: 10, fix: 'Ask happy customers for Google reviews; 10 or more makes ads convert better', earn: (a) => { const n = num(a, 'reviews') ?? 0; return n >= 10 ? 1 : n > 0 ? 0.5 : 0; } },
  { key: 'pixel', item: 'pixel', label: 'Tracking pixel', weight: 10, fix: 'Install the Meta pixel or Google tag so ads can be measured', earn: (a) => (a.pixel === 'Yes' ? 1 : 0) },
  { key: 'offer', label: 'Clear offer and price', weight: 10, fix: 'Name your top services with a price and your average first sale', earn: (a) => (a.services && (num(a, 'averageSale') ?? 0) > 0 ? 1 : a.services ? 0.5 : 0) },
  { key: 'customer', label: 'Best customer described', weight: 5, fix: 'Describe your best customer so ads target the right people', earn: (a) => (a.bestCustomer ? 1 : 0) },
  { key: 'budget', label: 'Ad budget set', weight: 5, fix: 'Set a monthly ad budget, even a small one', earn: (a) => ((num(a, 'adBudget') ?? 0) > 0 ? 1 : 0) },
  { key: 'assets', label: 'Photos and logo', weight: 5, fix: 'Gather a logo and a few real photos for the ads', earn: (a) => (a.assets === 'Logo, photos and videos' ? 1 : a.assets === 'Logo and photos' ? 0.8 : a.assets === 'Logo only' ? 0.4 : 0) },
  { key: 'reply', label: 'Fast replies to leads', weight: 5, fix: 'Reply to new leads within 5 minutes; the Speed-to-Lead agent can draft them', earn: (a) => (a.replySpeed === 'Within 5 minutes' ? 1 : a.replySpeed === 'Within an hour' ? 0.6 : 0) },
];

/** Scores marketing readiness 0 to 100. A checked online presence overrides what the owner reported. */
export function scoreReadiness(a: Answers, validation?: Validation | null): Readiness {
  const checks: ReadinessCheck[] = CHECKS.map((c) => {
    const v = c.item ? validation?.checks.find((x) => x.item === c.item) : undefined;
    let earned = c.earn(a);
    let confirmed: boolean | null = null;
    if (v?.status === 'found') { earned = c.key === 'reviews' ? Math.max(earned, 0.5) : 1; confirmed = true; }
    if (v?.status === 'missing') { earned = 0; confirmed = false; }
    return { key: c.key, label: c.label, weight: c.weight, earned: Math.round(earned * c.weight * 10) / 10, fix: c.fix, confirmed };
  });
  const score = Math.round(checks.reduce((s, c) => s + c.earned, 0));
  const gaps = checks.filter((c) => c.earned < c.weight).sort((x, y) => (y.weight - y.earned) - (x.weight - x.earned)).map((c) => c.fix);
  return { score, checks, gaps };
}

/** Converts an amount in the business's currency to USD (INR at the journey rate, default 85). */
export const toUsd = (amount: number, currency: string, inrPerUsd = 85): number => (currency === 'INR' ? amount / inrPerUsd : amount);

export interface Recommendation { planId: PlanId; reason: string }

/** The plan that fits the monthly ad budget. Ad spend is paid to Meta or Google, never through SIXXAB. */
export function recommendPlan(a: Answers, currency = 'USD', inrPerUsd = 85): Recommendation {
  const budget = toUsd(num(a, 'adBudget') ?? 0, currency, inrPerUsd);
  if (budget >= 10000) return { planId: 'scale', reason: 'Your ad budget is large enough for the full agent company, set up with you on a call.' };
  if (budget >= 2500) return { planId: 'agency', reason: 'At this budget a person reviewing every creative and a landing page pay for themselves.' };
  if (budget >= 500) return { planId: 'growth', reason: 'Your budget is enough for paid ads, so the Ads Manager runs them in your own accounts.' };
  return { planId: 'starter', reason: budget > 0 ? 'Under $500 a month of ads works best as steady organic posts plus small boosts.' : 'With no ad budget yet, start with organic posts and the leads they bring.' };
}

export interface CostPerLead { ceiling: number | null; closeRate: number; assumedClose: boolean; leadsTarget: number | null; budgetNote: string; formula: string }

/** Most a lead can cost and still pay: average first sale × share of leads who buy × 30%. */
export function costPerLead(a: Answers): CostPerLead {
  const sale = num(a, 'averageSale');
  const given = num(a, 'closeRate');
  const closeRate = given !== null ? given / 10 : 0.2;
  const assumedClose = given === null;
  const ceiling = sale && sale > 0 && closeRate > 0 ? Math.max(1, Math.round(sale * closeRate * 0.3)) : null;
  const budget = num(a, 'adBudget') ?? 0;
  const wanted = num(a, 'leadsWanted');
  const affordable = ceiling && budget > 0 ? Math.floor(budget / ceiling) : null;
  const leadsTarget = wanted ?? affordable;
  let budgetNote = '';
  if (ceiling && wanted && budget > 0 && wanted * ceiling > budget) budgetNote = `Your budget buys about ${affordable} leads at that ceiling; raise the budget or lower the goal to ${affordable}.`;
  else if (ceiling && wanted && budget === 0) budgetNote = `${wanted} leads a month at up to ${ceiling} each needs about ${wanted * ceiling} of ads, or organic posts alone.`;
  const formula = ceiling ? `${sale} average sale × ${Math.round(closeRate * 100)}% who buy${assumedClose ? ' (assumed)' : ''} × 30%` : 'Add your average first sale to work this out';
  return { ceiling, closeRate, assumedClose, leadsTarget, budgetNote, formula };
}

export interface PlanWeek { week: number; focus: string; actions: string[] }
export interface ThirtyDayPlan { planId: PlanId; channels: string[]; weeks: PlanWeek[]; kpis: string[] }

const B2B = ['Professional services', 'Technology or software'];

/** The channels that fit: where the business already is, then what suits its industry. */
export function pickChannels(a: Answers): string[] {
  const s = `${a.social ?? ''} ${a.sources ?? ''}`.toLowerCase();
  const out: string[] = [];
  if (/instagram|facebook|meta/.test(s) || !s.trim()) out.push('Instagram and Facebook');
  if (/linkedin/.test(s) || B2B.includes(a.industry ?? '')) out.push('LinkedIn');
  if (/tiktok/.test(s)) out.push('TikTok');
  if (/youtube/.test(s)) out.push('YouTube Shorts');
  if (a.googleProfile) out.push('Google Business Profile posts');
  if (!out.includes('Instagram and Facebook') && out.length < 2) out.unshift('Instagram and Facebook');
  return out.slice(0, 4);
}

/** A first draft of the 30-day plan from the answers; the CMO agent can tailor it. */
export function draftThirtyDayPlan(a: Answers, planId: PlanId, currency = 'USD'): ThirtyDayPlan {
  const plan = getMarketingPlan(planId)!;
  const channels = pickChannels(a);
  const r = scoreReadiness(a);
  const cpl = costPerLead(a);
  const budget = num(a, 'adBudget') ?? 0;
  const images = plan.images || 40;
  const videos = plan.videos || 8;
  const money = (n: number) => `${currency === 'INR' ? '₹' : '$'}${Math.round(n).toLocaleString('en-US')}`;
  const paid = planId !== 'starter' && budget > 0;
  const weeks: PlanWeek[] = [
    { week: 1, focus: 'Set up', actions: [
      ...r.gaps.slice(0, 2),
      `Link ${channels.join(', ')} so posts can go out after your approval`,
      'Confirm the offer, the prices to show and the claims to avoid',
    ] },
    { week: 2, focus: 'First creatives', actions: [
      `Make ${Math.ceil(images / 4)} image ads and ${Math.ceil(videos / 4)} short videos from your top offer`,
      `Post ${channels.length > 1 ? 'daily across' : 'daily on'} ${channels.join(' and ')}, each post approved by you`,
      'Every lead and comment lands in your CRM with a drafted reply',
    ] },
    { week: 3, focus: paid ? 'Launch ads' : 'Grow reach', actions: paid ? [
      `Start ads at about ${money(budget / 4)} a week on ${channels[0]}, created paused until you approve`,
      cpl.ceiling ? `Pause any ad above ${money(cpl.ceiling)} a lead` : 'Pause any ad whose leads cost more than your average sale allows',
      'Test 3 hooks and keep the 2 that bring the cheapest leads',
    ] : [
      'Post daily and reply to every comment within an hour',
      'Boost the best organic post with a small budget if it brings leads',
      'Ask your last 10 customers for a Google review',
    ] },
    { week: 4, focus: 'Review and double down', actions: [
      'Keep the 2 best creatives and replace the rest',
      `Report: leads${cpl.leadsTarget ? ` against the goal of ${cpl.leadsTarget}` : ''}, cost per lead, calls booked and sales`,
      'Plan next month\'s creatives from what worked',
    ] },
  ];
  const kpis = [
    cpl.leadsTarget ? `${cpl.leadsTarget} new leads a month` : 'New leads a month',
    cpl.ceiling ? `Cost per lead at or under ${money(cpl.ceiling)}` : 'Cost per lead',
    'First reply to every lead within 5 minutes',
  ];
  return { planId, channels, weeks: weeks.map((w) => ({ ...w, actions: w.actions.filter(Boolean).slice(0, 4) })), kpis };
}

// ── Records: assessment, validation, tailored plan, payments ────────────────

export const MARKETING_EVENTS = ['marketing.assessment', 'marketing.validation', 'marketing.plan', 'marketing.payment', 'marketing.subscription'];

export async function saveAssessment(store: Store, orgId: string, body: unknown, by: string): Promise<Answers> {
  const answers = validateAnswers(body);
  if (Object.keys(answers).length < 3) throw new Error('Answer at least a few questions before saving');
  await store.audit({ id: newId(), orgId, at: nowIso(), actor: by, action: 'marketing.assessment', taskId: null, detail: { answers, summary: `Marketing assessment saved: ${Object.keys(answers).length} answers` } });
  return answers;
}

const text = (v: unknown, max = 600): string => (typeof v === 'string' ? v.trim().slice(0, max) : typeof v === 'number' ? String(v) : '');
const httpsOrEmpty = (v: unknown): string => { const s = text(v, 500); return /^https:\/\/\S+$/i.test(s) ? s : ''; };

/** Saves the Business Assessor's check of the business's online presence. Each "found" needs its page. */
export async function saveValidation(store: Store, orgId: string, input: Record<string, unknown>, by: string): Promise<string> {
  const raw = Array.isArray(input.checks) ? input.checks : [];
  const checks: Validation['checks'] = [];
  for (const c of raw.slice(0, 12)) {
    if (!c || typeof c !== 'object') continue;
    const r = c as Record<string, unknown>;
    const item = r.item as CheckItem;
    const status = r.status as CheckStatus;
    if (!CHECK_ITEMS.includes(item) || !['found', 'missing', 'unclear'].includes(status) || checks.some((x) => x.item === item)) continue;
    const source = httpsOrEmpty(r.source);
    checks.push({ item, status: status === 'found' && !source ? 'unclear' : status, note: text(r.note, 300), source });
  }
  if (!checks.length) throw new Error('Give at least one check: item (website, booking, google, social, reviews or pixel), status (found, missing or unclear), note and source.');
  const summary = text(input.summary, 1200);
  await store.audit({ id: newId(), orgId, at: nowIso(), actor: by, action: 'marketing.validation', taskId: null, detail: { checks, summary, summaryLine: `${checks.filter((c) => c.status === 'found').length} of ${checks.length} confirmed online` } });
  return `Saved the online check: ${checks.map((c) => `${c.item} ${c.status}`).join(', ')}. The owner sees it on the Marketing tab.`;
}

export interface TailoredPlan { summary: string; channels: string[]; weeks: PlanWeek[]; kpis: string[]; at: string; by: string }

/** Saves the CMO agent's tailored 30-day plan. Nothing is posted or spent. */
export async function saveTailoredPlan(store: Store, orgId: string, input: Record<string, unknown>, by: string): Promise<string> {
  const list = (v: unknown, n: number, max = 200) => (Array.isArray(v) ? v.map((x) => text(x, max)).filter(Boolean).slice(0, n) : []);
  const weeks: PlanWeek[] = (Array.isArray(input.weeks) ? input.weeks : []).slice(0, 5).map((w, i) => {
    const r = (w && typeof w === 'object' ? w : {}) as Record<string, unknown>;
    return { week: Number(r.week) || i + 1, focus: text(r.focus, 80), actions: list(r.actions, 6, 240) };
  }).filter((w) => w.focus && w.actions.length);
  const summary = text(input.summary, 1500);
  if (!summary || weeks.length < 4) throw new Error('A 30-day plan needs a summary and four weeks, each with a focus and actions.');
  const plan = { summary, channels: list(input.channels, 6, 60), weeks, kpis: list(input.kpis, 6) };
  await store.audit({ id: newId(), orgId, at: nowIso(), actor: by, action: 'marketing.plan', taskId: null, detail: { plan, summary: 'CMO agent saved a tailored 30-day marketing plan' } });
  return 'Saved the tailored 30-day plan. The owner sees it on the Marketing tab; nothing was posted or spent.';
}

export type Provider = 'stripe' | 'paypal';
export interface Payment {
  provider: Provider; ref: string; subscriptionId: string; planId: PlanId; amount: number; currency: string; mode: 'test' | 'live';
  kind: 'first' | 'renewal'; payer: string; at: string;
}
export interface Subscription {
  planId: PlanId; planName: string; provider: Provider; subscriptionId: string; mode: 'test' | 'live'; status: 'active' | 'cancelled';
  startedAt: string; lastPaidAt: string; amount: number; currency: string;
}

/** Records a payment once per provider reference. Live payments also set the plan and a paid invoice. */
export async function recordPayment(store: Store, orgId: string, p: Omit<Payment, 'at'>, by: string): Promise<{ recorded: boolean }> {
  const plan = getMarketingPlan(p.planId);
  if (!plan || !plan.checkout) throw new Error('Unknown plan');
  if (!p.ref) throw new Error('A payment needs its reference');
  const done = await store.listAuditByActions(orgId, ['marketing.payment']);
  if (done.some((e) => e.detail.provider === p.provider && e.detail.ref === p.ref)) return { recorded: false };
  const at = nowIso();
  await store.audit({ id: newId(), orgId, at, actor: by, action: 'marketing.payment', taskId: null, detail: { ...p, summary: `${p.mode === 'test' ? 'Test payment' : 'Payment'} received: Marketing ${plan.name}, ${p.amount} ${p.currency} by ${p.provider === 'stripe' ? 'card' : 'PayPal'}` } });
  if (p.mode === 'live') {
    await setPlan(store, orgId, { name: `Marketing ${plan.name}`, monthlyFee: p.amount, currency: p.currency }, by);
    const inv = await draftInvoice(store, orgId, at.slice(0, 7), by);
    if (inv.status !== 'paid') await setInvoiceStatus(store, orgId, inv.id, 'paid', by);
  }
  return { recorded: true };
}

export async function recordCancellation(store: Store, orgId: string, provider: Provider, subscriptionId: string, by: string): Promise<void> {
  await store.audit({ id: newId(), orgId, at: nowIso(), actor: by, action: 'marketing.subscription', taskId: null, detail: { provider, subscriptionId, status: 'cancelled', summary: `Marketing plan cancelled (${provider})` } });
}

// ── State ───────────────────────────────────────────────────────────────────

export interface MarketingState {
  currency: string;
  answers: Answers; savedAt: string | null; answered: number; total: number;
  readiness: Readiness; recommended: Recommendation; cpl: CostPerLead; plan30: ThirtyDayPlan;
  validation: Validation | null; tailored: TailoredPlan | null;
  subscription: Subscription | null; payments: Payment[];
}

/** Rebuilds the Marketing tab from the business's events (oldest first) and its profile. */
export function computeMarketing(events: { action: string; at: string; actor: string; detail: Record<string, unknown> }[], profile: BusinessProfile | null, inrPerUsd = 85): MarketingState {
  const currency = profile?.currency === 'INR' ? 'INR' : 'USD';
  let saved: { answers: Answers; at: string } | null = null;
  let validation: Validation | null = null;
  let tailored: TailoredPlan | null = null;
  const payments: Payment[] = [];
  const cancelled = new Set<string>();
  for (const e of events) {
    const d = e.detail;
    if (e.action === 'marketing.assessment') saved = { answers: d.answers as Answers, at: e.at };
    if (e.action === 'marketing.validation') validation = { checks: d.checks as Validation['checks'], summary: String(d.summary ?? ''), at: e.at, by: e.actor };
    if (e.action === 'marketing.plan') tailored = { ...(d.plan as Omit<TailoredPlan, 'at' | 'by'>), at: e.at, by: e.actor };
    if (e.action === 'marketing.payment') payments.push({ ...(d as unknown as Omit<Payment, 'at'>), at: e.at });
    if (e.action === 'marketing.subscription' && d.status === 'cancelled') cancelled.add(`${d.provider}:${d.subscriptionId}`);
  }
  const answers = { ...prefillAnswers(profile), ...(saved?.answers ?? {}) };
  const readiness = scoreReadiness(answers, validation);
  const recommended = recommendPlan(answers, currency, inrPerUsd);
  const last = payments.at(-1);
  let subscription: Subscription | null = null;
  if (last) {
    const first = payments.find((p) => p.subscriptionId === last.subscriptionId && p.provider === last.provider) ?? last;
    const plan = getMarketingPlan(last.planId);
    subscription = {
      planId: last.planId, planName: plan?.name ?? last.planId, provider: last.provider, subscriptionId: last.subscriptionId, mode: last.mode,
      status: cancelled.has(`${last.provider}:${last.subscriptionId}`) ? 'cancelled' : 'active', startedAt: first.at, lastPaidAt: last.at, amount: last.amount, currency: last.currency,
    };
  }
  return {
    currency, answers, savedAt: saved?.at ?? null, answered: QUESTIONS.filter((q) => answers[q.key]).length, total: QUESTIONS.length,
    readiness, recommended, cpl: costPerLead(answers), plan30: draftThirtyDayPlan(answers, subscription?.planId ?? recommended.planId, currency),
    validation, tailored, subscription, payments: payments.slice().reverse(),
  };
}

export async function loadMarketing(store: Store, orgId: string, profile: BusinessProfile | null, inrPerUsd = 85): Promise<MarketingState> {
  return computeMarketing(await store.listAuditByActions(orgId, MARKETING_EVENTS), profile, inrPerUsd);
}

// ── Goals handed to the agents ──────────────────────────────────────────────

const line = (label: string, v: string | undefined) => (v ? `${label}: ${v}` : `${label}: not given`);

/** The Business Assessor's task: check the links the owner gave, on public pages only. */
export function assessorGoal(a: Answers): string {
  return [
    `Check this business's online presence before its marketing starts. Business: ${a.name ?? 'see the company profile'}${a.location ? `, ${a.location}` : ''}.`,
    line('Website', a.website), line('Booking or buy link', a.booking), line('Google Business Profile', a.googleProfile),
    line('Social pages', a.social?.replace(/\n+/g, ', ')), line('Google reviews the owner reported', a.reviews),
    'For each of website, booking, google, social, reviews and pixel, say found, missing or unclear with a note and the public page that shows it.',
    'You cannot see page code, so a pixel is unclear unless a public page plainly states it. Never guess.',
    'Save the result with save_assessment_check, with a short summary of the top gaps.',
  ].join('\n');
}

/** The CMO agent's task: tailor the 30-day plan. It saves a plan; it drafts no posts and spends nothing here. */
export function cmoPlanGoal(m: MarketingState): string {
  const a = m.answers;
  const plan = getMarketingPlan(m.subscription?.planId ?? m.recommended.planId)!;
  return [
    `Tailor a 30-day marketing plan for this business on the ${plan.name} plan (${plan.images} images and ${plan.videos} short videos a month).`,
    `Readiness ${m.readiness.score}/100. Top gaps: ${m.readiness.gaps.slice(0, 3).join('; ') || 'none'}.`,
    line('Offer', a.services), line('Average first sale', a.averageSale), line('Best customer', a.bestCustomer), line('Where customers come from', a.sources),
    line('Monthly ad budget', a.adBudget), line('Leads wanted a month', a.leadsWanted), line('Claims to avoid', a.avoid), line('Brand voice', a.voice),
    `Cost-per-lead ceiling: ${m.cpl.ceiling ?? 'unknown'} (${m.cpl.formula}).`,
    `Draft to improve on: ${m.plan30.weeks.map((w) => `week ${w.week} ${w.focus}: ${w.actions.join('; ')}`).join(' | ')}.`,
    'Save the plan with save_marketing_plan: a summary, the channels, four weeks each with a focus and 3 to 5 actions, and the KPIs.',
    'In this task do not draft posts, emails or ads and do not spend; only save the plan.',
  ].join('\n');
}

// ── Agency sales: paying businesses become won deals in SIXXAB's own CRM ────

/** Adds each business with a paid marketing plan to the admin's CRM as a won deal, once. */
export async function syncAgencySales(store: Store, adminOrgId: string, orgIds: string[], names: (orgId: string) => Promise<string | null>, by: string): Promise<number> {
  const synced = new Set((await store.listAuditByActions(adminOrgId, ['marketing.synced'])).map((e) => String(e.detail.customerOrgId)));
  // Read every unsynced business's payments at once, so the CRM tab doesn't wait on one lookup after another.
  const todo = orgIds.filter((id) => id !== adminOrgId && !synced.has(id));
  const firsts = await Promise.all(todo.map(async (orgId) => ({ orgId, first: (await store.listAuditByActions(orgId, ['marketing.payment']))[0]?.detail as unknown as Payment | undefined })));
  let added = 0;
  for (const { orgId, first } of firsts) {
    if (!first) continue;
    const plan = getMarketingPlan(first.planId);
    const name = (await names(orgId)) ?? 'Marketing customer';
    const test = first.mode === 'test';
    const contactId = await addNewContact(store, adminOrgId, {
      name: `${name}${test ? ' (test payment)' : ''}`, company: name, email: /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(first.payer ?? '') ? first.payer : '',
      source: 'website', sourceDetail: `Marketing ${plan?.name ?? ''} plan checkout`.replace('  ', ' '), value: first.amount, nextStep: 'Plan onboarding',
      notes: `Paid for the Marketing ${plan?.name ?? first.planId} plan by ${first.provider === 'stripe' ? 'card' : 'PayPal'}${test ? ' in test mode; remove this deal when you are done testing' : ''}.`,
    }, by, `Marketing customer added: ${name}`);
    await setDealStage(store, adminOrgId, contactId, 'won', by);
    await store.audit({ id: newId(), orgId: adminOrgId, at: nowIso(), actor: by, action: 'marketing.synced', taskId: null, detail: { customerOrgId: orgId, contactId, summary: `${name} added to the CRM as a won deal` } });
    added++;
  }
  return added;
}
