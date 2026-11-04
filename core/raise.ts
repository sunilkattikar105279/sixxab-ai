// Raise: the founder → CFO capital-raising workflow for one business. Round terms, an investor
// pipeline, a founding-member pre-order campaign and the step checklist are all append-only audit
// events, so nothing here needs a migration. Securities rules are surfaced as warnings and hard stops
// where they are clear-cut (506(b) cold outreach, 506(c) money before verification). Pre-orders are
// sales of the product, never equity, and are kept out of the investment totals.
import { newId, nowIso, type Store } from './store.js';
import type { AuditEvent } from './types.js';
import { RAISE_STEPS, type RaiseTrack } from './raise-steps.js';

export const INSTRUMENTS = ['priced', 'safe-post', 'safe-pre', 'note'] as const;
export const EXEMPTIONS = ['506b', '506c'] as const;
export const INVESTOR_TYPES = ['angel', 'syndicate', 'vc', 'accelerator', 'strategic', 'family'] as const;
export const STAGES = ['target', 'contacted', 'meeting', 'diligence', 'committed', 'signed', 'funded', 'passed'] as const;
export const ACCREDITATION = ['unknown', 'self-certified', 'verified'] as const;
export const CHANNELS = ['Own page (Stripe link)', 'Own page (Razorpay link)', 'Kickstarter', 'Indiegogo'] as const;
export const CAMPAIGN_STAGES = ['planning', 'prelaunch', 'live', 'fulfilling', 'closed', 'cancelled'] as const;
const MAX_TIERS = 6;

export type Instrument = (typeof INSTRUMENTS)[number];
export type Exemption = (typeof EXEMPTIONS)[number];
export type InvestorType = (typeof INVESTOR_TYPES)[number];
export type InvestorStage = (typeof STAGES)[number];

/** cap is the valuation cap for SAFEs and notes; preMoney is the pre-money valuation for a priced round. */
export interface Round { name: string; instrument: Instrument; exemption: Exemption; target: number; cap?: number; preMoney?: number; discount?: number; minCheck?: number; currency?: 'USD' }
export interface InvestorInput {
  id?: string; name: string; firm?: string; email?: string; type: InvestorType; relationship?: string;
  accredited?: (typeof ACCREDITATION)[number]; nextStep?: string; notes?: string;
}
export interface Investor extends Required<Omit<InvestorInput, 'id'>> { id: string; stage: InvestorStage; amount: number; updatedAt: string }
export interface Tier { name: string; price: number; limit?: number; reward: string }
/** A founding-member pre-order campaign: customers pay for the product in advance. Not equity. */
export interface Campaign {
  channel: (typeof CHANNELS)[number]; stage: (typeof CAMPAIGN_STAGES)[number]; url?: string;
  goal?: number; pledged?: number; backers?: number; deadline?: string; deliverBy?: string; tiers?: Tier[];
}
export interface RaiseStep { id: string; track: RaiseTrack; title: string; summary: string; agentId: string | null; owner: string; status: 'done' | 'ready' | 'blocked'; blockedBy: string[]; goal: string }
export interface InvestorView extends Investor { canEmail: boolean; warnings: string[] }
export interface RaiseState {
  round: (Round & { setAt: string }) | null;
  investors: InvestorView[];
  campaign: (Campaign & { setAt: string }) | null;
  steps: RaiseStep[];
  pipeline: Record<InvestorStage, number>;
  totals: { target: number; committed: number; funded: number; preorders: number; pctCommitted: number; dilutionPct: number | null; postMoney: number | null };
}

export const RAISE_EVENTS = ['raise.round', 'raise.investor', 'raise.investor_stage', 'raise.investor_removed', 'raise.campaign', 'raise.step'];
const COMMITTED: InvestorStage[] = ['committed', 'signed', 'funded'];
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const MAX_MONEY = 1e10;

const text = (v: unknown, max: number): string => String(v ?? '').trim().slice(0, max);
const money = (v: unknown, label: string, required = false): number | undefined => {
  if (v === undefined || v === null || v === '') {
    if (required) throw new Error(`${label} must be more than zero`);
    return undefined;
  }
  const n = typeof v === 'string' ? Number(v.replace(/[,$\s]/g, '')) : Number(v);
  if (!Number.isFinite(n) || n < 0 || n > MAX_MONEY || (required && n === 0)) throw new Error(`${label} must be ${required ? 'more than zero' : 'zero or more'}`);
  return n;
};
const oneOf = <T extends string>(list: readonly T[], v: unknown, label: string): T => {
  if (!list.includes(v as T)) throw new Error(`${label} must be one of: ${list.join(', ')}`);
  return v as T;
};
const fmt = (n: number) => n.toLocaleString('en-US', { maximumFractionDigits: 0 });
const record = (store: Store, orgId: string, by: string, action: string, detail: Record<string, unknown>) =>
  store.audit({ id: newId(), orgId, at: nowIso(), actor: by, action, taskId: null, detail });

// ---------- writes ----------

export async function setRound(store: Store, orgId: string, r: Round, by: string): Promise<RaiseState> {
  const round = {
    name: text(r.name, 60) || 'Pre-seed',
    instrument: oneOf(INSTRUMENTS, r.instrument, 'instrument'),
    exemption: oneOf(EXEMPTIONS, r.exemption, 'exemption'),
    target: money(r.target, 'The target', true)!,
    cap: r.instrument === 'priced' ? undefined : money(r.cap, 'The valuation cap'),
    preMoney: r.instrument === 'priced' ? money(r.preMoney, 'The pre-money valuation') : undefined,
    discount: r.discount === undefined || r.discount === null ? undefined : Number(r.discount),
    minCheck: money(r.minCheck, 'The minimum cheque'),
    currency: 'USD' as const,
  };
  if (round.discount !== undefined && !(round.discount >= 0 && round.discount <= 50)) throw new Error('The discount must be between 0 and 50 percent');
  await record(store, orgId, by, 'raise.round', { ...round, summary: `Round set: ${round.name}, $${fmt(round.target)} (${round.instrument}, ${round.exemption})${round.preMoney ? ` at $${fmt(round.preMoney)} pre-money` : ''}` });
  return loadRaise(store, orgId);
}

function cleanInvestor(i: InvestorInput): Omit<Investor, 'stage' | 'amount' | 'updatedAt'> {
  const name = text(i.name, 120);
  if (!name) throw new Error('An investor needs a name');
  const email = text(i.email, 200);
  if (email && !EMAIL_RE.test(email)) throw new Error('That email address does not look right');
  return {
    id: i.id && /^[\w-]{6,64}$/.test(i.id) ? i.id : newId(),
    name, email, firm: text(i.firm, 120),
    type: oneOf(INVESTOR_TYPES, i.type, 'type'),
    relationship: text(i.relationship, 200),
    accredited: i.accredited ? oneOf(ACCREDITATION, i.accredited, 'accredited') : 'unknown',
    nextStep: text(i.nextStep, 200),
    notes: text(i.notes, 2000),
  };
}

export async function upsertInvestor(store: Store, orgId: string, input: InvestorInput, by: string): Promise<Investor> {
  const inv = cleanInvestor(input);
  await record(store, orgId, by, 'raise.investor', { investor: inv, summary: `Investor saved: ${inv.name}` });
  const found = (await loadRaise(store, orgId)).investors.find((x) => x.id === inv.id);
  return found!;
}

export async function removeInvestor(store: Store, orgId: string, id: string, by: string): Promise<void> {
  await record(store, orgId, by, 'raise.investor_removed', { investorId: id, summary: 'Investor removed from the pipeline' });
}

export async function setInvestorStage(store: Store, orgId: string, id: string, stage: InvestorStage, by: string, amount?: number): Promise<RaiseState> {
  const st = oneOf(STAGES, stage, 'stage');
  const state = await loadRaise(store, orgId);
  const inv = state.investors.find((x) => x.id === id);
  if (!inv) throw new Error('Investor not found');
  const amt = money(amount, 'The amount') ?? inv.amount;
  if (st === 'funded' && state.round?.exemption === '506c' && inv.accredited !== 'verified') {
    throw new Error('Under 506(c), verify this investor is accredited before accepting their money');
  }
  await record(store, orgId, by, 'raise.investor_stage', { investorId: id, stage: st, amount: amt, summary: `${inv.name}: ${st}${amt ? ` ($${fmt(amt)})` : ''}` });
  return loadRaise(store, orgId);
}

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

function cleanTiers(tiers: unknown): Tier[] {
  if (!Array.isArray(tiers)) return [];
  if (tiers.length > MAX_TIERS) throw new Error(`A campaign can have at most ${MAX_TIERS} tiers`);
  return tiers.map((t: Partial<Tier>, i) => {
    const name = text(t?.name, 60);
    const reward = text(t?.reward, 300);
    if (!name || !reward) throw new Error(`Tier ${i + 1} needs a name and what the backer gets`);
    return { name, reward, price: money(t?.price, `Tier ${i + 1} price`, true)!, limit: money(t?.limit, `Tier ${i + 1} limit`) };
  });
}

export async function setCampaign(store: Store, orgId: string, c: Campaign, by: string): Promise<RaiseState> {
  const channel = oneOf(CHANNELS, c.channel, 'The channel');
  const url = text(c.url, 300);
  if (url && !/^https:\/\/[\w.-]+(\/[\w\-./?=&%#]*)?$/i.test(url)) throw new Error('The campaign url must start with https://');
  const campaign = {
    channel, url, stage: oneOf(CAMPAIGN_STAGES, c.stage, 'The campaign stage'),
    goal: money(c.goal, 'The goal'), pledged: money(c.pledged, 'The amount pledged'), backers: money(c.backers, 'The number of backers'),
    deadline: DATE_RE.test(String(c.deadline ?? '')) ? String(c.deadline) : undefined,
    deliverBy: DATE_RE.test(String(c.deliverBy ?? '')) ? String(c.deliverBy) : undefined,
    tiers: cleanTiers(c.tiers),
  };
  if (campaign.stage === 'live' && (!campaign.tiers.length || !campaign.deliverBy)) {
    throw new Error('Before going live, add at least one tier and the date you promise to deliver by');
  }
  await record(store, orgId, by, 'raise.campaign', { ...campaign, summary: `Founding-member pre-orders (${channel}): ${campaign.stage}` });
  return loadRaise(store, orgId);
}

export async function completeRaiseStep(store: Store, orgId: string, stepId: string, by: string): Promise<RaiseState> {
  const state = await loadRaise(store, orgId);
  const step = state.steps.find((s) => s.id === stepId);
  if (!step) throw new Error('Unknown step');
  if (step.status === 'blocked') throw new Error(`Finish first: ${step.blockedBy.join(', ')}`);
  if (stepId === 'terms' && !state.round) throw new Error('Set the round terms before marking this done');
  await record(store, orgId, by, 'raise.step', { step: stepId, done: true, summary: `Raise step done: ${step.title}` });
  return loadRaise(store, orgId);
}

export async function reopenRaiseStep(store: Store, orgId: string, stepId: string, by: string): Promise<RaiseState> {
  if (!RAISE_STEPS.some((s) => s.id === stepId)) throw new Error('Unknown step');
  await record(store, orgId, by, 'raise.step', { step: stepId, done: false, summary: `Raise step reopened: ${stepId}` });
  return loadRaise(store, orgId);
}

/** Imports "name,firm,email,type,relationship" rows (header optional, at most 200). Bad rows are skipped. */
export async function importInvestors(store: Store, orgId: string, csv: string, by: string): Promise<{ added: number; skipped: number }> {
  const rows = String(csv ?? '').split(/\r?\n/).map((l) => l.trim()).filter(Boolean).slice(0, 201);
  if (rows[0] && /^name\s*,/i.test(rows[0])) rows.shift();
  let added = 0;
  let skipped = 0;
  for (const row of rows.slice(0, 200)) {
    const [name, firm, email, type, relationship] = row.split(',').map((x) => x.trim());
    try {
      const inv = cleanInvestor({ name, firm, email, type: (INVESTOR_TYPES as readonly string[]).includes(type) ? (type as InvestorType) : 'angel', relationship });
      await record(store, orgId, by, 'raise.investor', { investor: inv, summary: `Investor imported: ${inv.name}` });
      added++;
    } catch {
      skipped++;
    }
  }
  return { added, skipped };
}

// ---------- reads ----------

export async function loadRaise(store: Store, orgId: string): Promise<RaiseState> {
  return computeRaise(await store.listAuditByActions(orgId, RAISE_EVENTS));
}

function investorWarnings(inv: Investor, exemption: Exemption | undefined): { canEmail: boolean; warnings: string[] } {
  const warnings: string[] = [];
  let canEmail = Boolean(inv.email) && inv.stage !== 'passed';
  if ((exemption ?? '506b') === '506b' && !inv.relationship) {
    canEmail = false;
    warnings.push('Under 506(b), approach only people you already know or were introduced to. Add how you know them before reaching out.');
  }
  if (exemption === '506c' && COMMITTED.includes(inv.stage) && inv.accredited !== 'verified') {
    warnings.push('Under 506(c), verify accreditation (for example through a verification service or a CPA or lawyer letter) before accepting money.');
  }
  return { canEmail, warnings };
}

export function computeRaise(events: AuditEvent[]): RaiseState {
  let round: RaiseState['round'] = null;
  let campaign: RaiseState['campaign'] = null;
  const investors = new Map<string, Investor>();
  const done = new Set<string>();
  for (const e of events) {
    const d = e.detail;
    if (e.action === 'raise.round') round = { ...(d as unknown as Round), setAt: e.at };
    else if (e.action === 'raise.campaign') campaign = { ...(d as unknown as Campaign), setAt: e.at };
    else if (e.action === 'raise.investor') {
      const inv = d.investor as Omit<Investor, 'stage' | 'amount' | 'updatedAt'>;
      const prev = investors.get(inv.id);
      investors.set(inv.id, { ...inv, stage: prev?.stage ?? 'target', amount: prev?.amount ?? 0, updatedAt: e.at });
    } else if (e.action === 'raise.investor_stage') {
      const prev = investors.get(String(d.investorId));
      if (prev) investors.set(prev.id, { ...prev, stage: d.stage as InvestorStage, amount: Number(d.amount) || 0, updatedAt: e.at });
    } else if (e.action === 'raise.investor_removed') investors.delete(String(d.investorId));
    else if (e.action === 'raise.step') (d.done ? done.add(String(d.step)) : done.delete(String(d.step)));
  }

  const list: InvestorView[] = [...investors.values()]
    .map((i) => ({ ...i, ...investorWarnings(i, round?.exemption) }))
    .sort((a, b) => STAGES.indexOf(b.stage) - STAGES.indexOf(a.stage) || a.name.localeCompare(b.name));
  const pipeline = Object.fromEntries(STAGES.map((s) => [s, list.filter((i) => i.stage === s).length])) as Record<InvestorStage, number>;
  // Pre-orders are product sales, so they never count toward the equity round.
  const preorders = campaign && campaign.stage !== 'cancelled' ? Number(campaign.pledged ?? 0) : 0;
  const committed = list.filter((i) => COMMITTED.includes(i.stage)).reduce((s, i) => s + i.amount, 0);
  const funded = list.filter((i) => i.stage === 'funded').reduce((s, i) => s + i.amount, 0);
  const target = round?.target ?? 0;
  const cap = round?.cap ?? 0;
  const pre = round?.preMoney ?? 0;
  // Priced: investors own committed / (pre-money + committed). SAFEs: estimated at the cap.
  const dilution = round?.instrument === 'priced' ? (pre ? committed / (pre + committed) : null)
    : !cap ? null : round?.instrument === 'safe-post' ? committed / cap : committed / (cap + committed);
  const totals = {
    target, committed, funded, preorders,
    pctCommitted: target ? Math.round((committed / target) * 1000) / 10 : 0,
    dilutionPct: dilution === null ? null : Math.round(dilution * 10000) / 100,
    postMoney: round?.instrument === 'priced' && pre ? pre + target : null,
  };

  const state: RaiseState = { round, investors: list, campaign, steps: [], pipeline, totals };
  const context = raiseForPrompt(state);
  // Pre-order steps feed public posts, so they never see the private round terms.
  const preorderContext = raiseForPrompt({ ...state, round: null }).replace(/^Raise: No round[^\n]*\n?/, '') || 'No pre-order campaign is recorded yet.';
  state.steps = RAISE_STEPS.map((s) => {
    const blockedBy = s.hard.filter((h) => !done.has(h)).map((h) => RAISE_STEPS.find((x) => x.id === h)!.title);
    const base = s.id === 'outreach' ? outreachGoal(list) : s.goal;
    if (s.track === 'Pre-orders') {
      return {
        id: s.id, track: s.track, title: s.title, summary: s.summary, agentId: s.agentId, owner: s.owner, blockedBy,
        status: done.has(s.id) ? 'done' : blockedBy.length ? 'blocked' : 'ready',
        goal: `${base}\n\n${preorderContext}`,
      };
    }
    return {
      id: s.id, track: s.track, title: s.title, summary: s.summary, agentId: s.agentId, owner: s.owner, blockedBy,
      status: done.has(s.id) ? 'done' : blockedBy.length ? 'blocked' : 'ready',
      goal: base ? `${base}\n\n${context}` : '',
    };
  });
  return state;
}

function outreachGoal(list: InvestorView[]): string {
  const ready = list.filter((i) => i.canEmail && (i.stage === 'target' || i.stage === 'contacted')).slice(0, 10);
  if (!ready.length) return 'No investors can be emailed yet. Explain what to add to the pipeline (name, email and how the founder knows them) and save it as a note titled "Raise: outreach".';
  return `Draft a short, personal first email to each investor below and queue each with send_message (channel "email"). Each email: who we are in one line, why this investor, the traction we have recorded, and a request for a 20-minute call. Share terms only with these known investors, never in public posts. Each email waits for the founder's approval.\n${ready.map((i) => `- ${i.name}${i.firm ? ` (${i.firm})` : ''} <${i.email}>, ${i.type}; how we know them: ${i.relationship || 'n/a'}`).join('\n')}`;
}

/** Plain-text raise context for agents: only what the founder recorded. */
export function raiseForPrompt(s: Pick<RaiseState, 'round' | 'totals' | 'pipeline' | 'campaign'>): string {
  const preorders = s.campaign ? `Founding-member pre-orders (product sales, not investment; never call backers investors or promise them shares): ${s.campaign.channel}, ${s.campaign.stage}${s.campaign.pledged ? `, $${fmt(s.campaign.pledged)} pre-sold to ${s.campaign.backers ?? 0} backers` : ''}${s.campaign.deliverBy ? `, delivery promised by ${s.campaign.deliverBy}` : ''}${s.campaign.tiers?.length ? `. Tiers: ${s.campaign.tiers.map((t) => `${t.name} $${fmt(t.price)} (${t.reward})`).join('; ')}` : ''}.` : '';
  if (!s.round) return ['Raise: No round is set yet. Do not state a round size, valuation or instrument; mark them as to be decided by the founder.', preorders].filter(Boolean).join('\n');
  const r = s.round;
  const exemption = r.exemption === '506b' ? 'Rule 506(b): private, no public mention of the raise' : 'Rule 506(c): may be public, accredited investors only and verified';
  const priced = r.instrument === 'priced';
  const lines = [
    `Raise: ${r.name}, target $${fmt(r.target)} USD as a ${r.instrument === 'safe-post' ? 'post-money SAFE' : r.instrument === 'safe-pre' ? 'pre-money SAFE' : r.instrument === 'note' ? 'convertible note' : 'priced equity round'}${priced && r.preMoney ? ` at a $${fmt(r.preMoney)} pre-money valuation ($${fmt(r.preMoney + r.target)} post-money, ${Math.round((r.target / (r.preMoney + r.target)) * 1000) / 10}% for investors)` : ''}${!priced && r.cap ? `, valuation cap $${fmt(r.cap)}` : ''}${r.discount ? `, ${r.discount}% discount` : ''}${r.minCheck ? `, minimum cheque $${fmt(r.minCheck)}` : ''}.`,
    `Exemption: ${exemption}.`,
    `Progress: $${fmt(s.totals.committed)} committed (${s.totals.pctCommitted}%), $${fmt(s.totals.funded)} received. Pipeline: ${STAGES.filter((k) => s.pipeline[k]).map((k) => `${s.pipeline[k]} ${k}`).join(', ') || 'empty'}.`,
  ];
  if (preorders) lines.push(preorders);
  return lines.join('\n');
}

/** Third-party services the raise uses. "live" ones run through the platform; the rest are links. */
export const RAISE_SOURCES = [
  { id: 'gmail', name: 'Gmail (via n8n)', kind: 'Outreach', status: 'live', url: '', use: 'Investor emails go out from your Gmail after you approve each one.' },
  { id: 'csv', name: 'CSV import', kind: 'Investor lists', status: 'live', url: '', use: 'Paste lists exported from Crunchbase, Signal, AngelList or your contacts.' },
  { id: 'signal', name: 'Signal by NFX', kind: 'Investor discovery', status: 'link', url: 'https://signal.nfx.com', use: 'Find seed investors by stage and sector, then import.' },
  { id: 'crunchbase', name: 'Crunchbase', kind: 'Investor discovery', status: 'link', url: 'https://www.crunchbase.com', use: 'Funds and angels active at seed, then import.' },
  { id: 'angellist', name: 'AngelList', kind: 'Angels and syndicates', status: 'link', url: 'https://www.angellist.com', use: 'Roll many small cheques into one line on the cap table.' },
  { id: 'carta', name: 'Carta', kind: 'Cap table', status: 'link', url: 'https://carta.com', use: 'Cap table, share issuance and 409A.' },
  { id: 'documenso', name: 'Documenso', kind: 'E-signature', status: 'link', url: 'https://documenso.com', use: 'Sign the round documents; open source.' },
  { id: 'stripe', name: 'Stripe Payment Links', kind: 'Pre-orders (US)', status: 'link', url: 'https://stripe.com/payments/payment-links', use: 'Take founding-member pre-orders in USD from your own page.' },
  { id: 'razorpay', name: 'Razorpay Payment Pages', kind: 'Pre-orders (India)', status: 'link', url: 'https://razorpay.com/payment-pages/', use: 'Take founding-member pre-orders in INR.' },
  { id: 'kickstarter', name: 'Kickstarter', kind: 'Reward crowdfunding', status: 'link', url: 'https://www.kickstarter.com', use: 'All-or-nothing reward campaign with a built-in audience.' },
  { id: 'indiegogo', name: 'Indiegogo', kind: 'Reward crowdfunding', status: 'link', url: 'https://www.indiegogo.com', use: 'Reward campaign; flexible funding allowed.' },
] as const;
