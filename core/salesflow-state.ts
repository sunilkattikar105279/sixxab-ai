// The sales flow, from finding a lead to keeping the customer: which stage each deal is in, the customer
// records after a win (onboarding plan, account reviews), and one queue of next actions for the owner.
// Agents prepare the work on their own; anything that leaves the app or changes a stage waits for the owner.
// Pure: everything is built from crm.* audit events, so it needs no migration.
import type { AuditEvent } from './types.js';
import { fmtMoney, proposalMessage } from './research-state.js';
import type { Contact } from './crm.js';
import type { Icp, ProspectBatch } from './leadgen-state.js';
import { text } from './leadgen-state.js';

/** Org-level events: the owner skipping an action for a while, the autopilot switch and the weekly prospect search. */
export const FLOW_ORG_EVENTS = ['crm.action_skip', 'crm.autopilot', 'crm.autofind'];
/** Deal-level events for customers: onboarding plan and steps, account reviews, customer messages sent. */
export const FLOW_DEAL_EVENTS = ['crm.onboarding', 'crm.onboarding_step', 'crm.account', 'crm.customer_sent'];

export const FLOW_STAGES = [
  { key: 'find', name: 'Find', does: 'Set who you sell to, then find businesses that fit: press Find 10 prospects, or switch on the weekly search.', agents: ['ICP Builder', 'Prospect Generator'], gate: 'You tick which prospects join the CRM.' },
  { key: 'research', name: 'Research', does: 'Research each new lead from public pages using the owner, phone and website: the business, pain points, missing email, phone and address (each with its source) and where AI agents would help.', agents: ['Business Research'], gate: 'You check each found detail before it goes on the deal.' },
  { key: 'qualify', name: 'Qualify', does: 'Score each researched lead on fit, size, ease of win and reach; answer new enquiries fast.', agents: ['Lead Scorer', 'Speed-to-Lead'], gate: 'First replies wait in Approvals.' },
  { key: 'outreach', name: 'Outreach', does: 'Personal email, LinkedIn and call steps in your voice.', agents: ['Outreach Sequencer', 'Follow-up Writer'], gate: 'You send each step and mark it sent.' },
  { key: 'discovery', name: 'Discovery', does: 'Prep the call, capture MEDDIC, debrief the notes.', agents: ['Call Prepper', 'Deal Qualifier'], gate: 'You approve the move to Proposal.' },
  { key: 'proposal', name: 'Proposal and close', does: 'Proposal with opportunities, benefits and ROI, objection answers and the follow-up to a yes.', agents: ['Proposal Writer', 'Objection Handler', 'Win-Loss Analyst'], gate: 'You edit and send the proposal, and mark it won or lost.' },
  { key: 'onboard', name: 'Onboard', does: 'Welcome email, kickoff agenda and a first-30-days plan.', agents: ['Onboarding Manager'], gate: 'You send the welcome and tick steps done.' },
  { key: 'retain', name: 'Retain', does: 'Monthly health check, check-in message and renewal plan.', agents: ['Customer Success Manager'], gate: 'You send each check-in.' },
  { key: 'expand', name: 'Expand', does: 'Upsell ideas and a referral ask for healthy customers.', agents: ['Customer Success Manager'], gate: 'You choose what to offer and send it.' },
] as const;
export type FlowStage = (typeof FLOW_STAGES)[number]['key'];

// ---- Customer records after a win ----

export const STEP_OWNERS = ['you', 'customer', 'agent'] as const;
export type StepOwner = (typeof STEP_OWNERS)[number];
export interface OnboardStep { title: string; owner: StepOwner; day: number; doneAt: string | null }
export interface Draft { subject: string; text: string }
export interface Onboarding { id: string; steps: OnboardStep[]; welcome: Draft | null; kickoff: string; notes: string; at: string; by: string }
export type HealthBand = 'healthy' | 'watch' | 'at_risk';
export interface AccountReview {
  id: string; health: number; band: HealthBand; reasons: string; risks: string; checkIn: Draft | null;
  renewalDate: string; renewalPlan: string; upsell: string[]; referral: Draft | null; at: string; by: string;
}
export const CUSTOMER_MSGS = ['welcome', 'checkin', 'referral'] as const;
export type CustomerMsg = (typeof CUSTOMER_MSGS)[number];
export interface CustomerFlow { wonAt: string | null; onboarding: Onboarding | null; review: AccountReview | null; sent: { kind: CustomerMsg; ref: string; at: string }[] }
export const EMPTY_CUSTOMER: CustomerFlow = { wonAt: null, onboarding: null, review: null, sent: [] };

const num = (v: unknown, lo: number, hi: number, dflt: number) => { const n = Math.round(Number(v)); return Number.isFinite(n) ? Math.min(hi, Math.max(lo, n)) : dflt; };
const draft = (v: unknown): Draft | null => {
  if (!v || typeof v !== 'object') return null;
  const d = v as Record<string, unknown>;
  const t = text(d.text, 4000);
  return t ? { subject: text(d.subject, 200), text: t } : null;
};

export function bandFor(health: number): HealthBand {
  return health >= 70 ? 'healthy' : health >= 45 ? 'watch' : 'at_risk';
}

/** Validates an onboarding plan from the Onboarding Manager. */
export function cleanOnboarding(input: Record<string, unknown>): Omit<Onboarding, 'id' | 'at' | 'by'> {
  const raw = Array.isArray(input.steps) ? input.steps : [];
  const steps: OnboardStep[] = raw.slice(0, 12).map((s) => {
    const o = (s && typeof s === 'object' ? s : {}) as Record<string, unknown>;
    const owner = STEP_OWNERS.find((x) => x === String(o.owner ?? '').toLowerCase()) ?? 'you';
    return { title: text(o.title, 300), owner, day: num(o.day, 0, 90, 0), doneAt: null };
  }).filter((s) => s.title).sort((a, b) => a.day - b.day);
  if (steps.length < 2) throw new Error('An onboarding plan needs at least two steps, each with a title');
  return { steps, welcome: draft(input.welcome), kickoff: text(input.kickoff, 3000), notes: text(input.notes, 1000) };
}

/** Validates an account review from the Customer Success Manager. */
export function cleanReview(input: Record<string, unknown>): Omit<AccountReview, 'id' | 'at' | 'by'> {
  const reasons = text(input.reasons, 2000);
  if (!reasons) throw new Error('Give the reasons behind the health score');
  const health = num(input.health, 0, 100, 50);
  const date = text(input.renewalDate, 10);
  const upsell = (Array.isArray(input.upsell) ? input.upsell : []).map((u) => text(u, 400)).filter(Boolean).slice(0, 3);
  return {
    health, band: bandFor(health), reasons, risks: text(input.risks, 1500), checkIn: draft(input.checkIn),
    renewalDate: /^\d{4}-\d{2}-\d{2}$/.test(date) ? date : '', renewalPlan: text(input.renewalPlan, 1500), upsell,
    referral: health >= 70 ? draft(input.referral) : null,
  };
}

const MSG_NAME: Record<CustomerMsg, string> = { welcome: 'the welcome email', checkin: 'the check-in message', referral: 'the referral ask' };

/** Applies one customer event to a deal; returns the new customer record and a line for its history. */
export function applyFlowEvent(cf: CustomerFlow, e: AuditEvent): { cf: CustomerFlow; history?: { kind: string; text: string }; touch?: boolean } {
  const d = e.detail;
  if (e.action === 'crm.onboarding') {
    const o = d.onboarding as Omit<Onboarding, 'at' | 'by'>;
    return { cf: { ...cf, onboarding: { ...o, at: e.at, by: e.actor } }, history: { kind: 'agent', text: `Onboarding plan saved: ${o.steps.length} steps${o.welcome ? ' and a welcome email draft' : ''}` } };
  }
  if (e.action === 'crm.onboarding_step') {
    const o = cf.onboarding;
    const i = Number(d.index);
    if (!o || o.id !== d.onboardingId || !o.steps[i]) return { cf };
    const steps = o.steps.map((s, n) => (n === i ? { ...s, doneAt: e.at } : s));
    return { cf: { ...cf, onboarding: { ...o, steps } }, history: { kind: 'onboarding', text: `Onboarding step done: ${o.steps[i].title}` } };
  }
  if (e.action === 'crm.account') {
    const r = d.review as Omit<AccountReview, 'at' | 'by'>;
    return { cf: { ...cf, review: { ...r, at: e.at, by: e.actor } }, history: { kind: 'health', text: `Account review: health ${r.health} (${r.band.replace('_', ' ')}). ${r.reasons.slice(0, 200)}` } };
  }
  if (e.action === 'crm.customer_sent') {
    const kind = CUSTOMER_MSGS.find((k) => k === d.kind);
    if (!kind) return { cf };
    return { cf: { ...cf, sent: [...cf.sent, { kind, ref: String(d.ref ?? ''), at: e.at }].slice(-30) }, history: { kind: 'email', text: `Sent ${MSG_NAME[kind]}` }, touch: true };
  }
  return { cf };
}

export const wasSent = (cf: CustomerFlow, kind: CustomerMsg, ref: string) => cf.sent.some((s) => s.kind === kind && s.ref === ref);

// ---- Org settings: autopilot and skipped actions ----

type Switch = { on: boolean; at: string; by: string } | null;
/** autofind: the weekly prospect search, off until the owner switches it on. */
export interface FlowOrg { autopilot: Switch; autofind?: Switch; skipped: Record<string, string> }

export function computeFlowOrg(events: AuditEvent[]): FlowOrg {
  const out: FlowOrg = { autopilot: null, autofind: null, skipped: {} };
  for (const e of events) {
    if (e.action === 'crm.autopilot') out.autopilot = { on: Boolean(e.detail.on), at: e.at, by: e.actor };
    else if (e.action === 'crm.autofind') out.autofind = { on: Boolean(e.detail.on), at: e.at, by: e.actor };
    else if (e.action === 'crm.action_skip') out.skipped[String(e.detail.key)] = String(e.detail.until ?? '');
  }
  return out;
}

// ---- Where each deal is, and the next-action queue ----

const DAY = 864e5;
const daysSince = (iso: string | null | undefined, now: number) => (iso ? (now - Date.parse(iso)) / DAY : Infinity);
const ranBy = (c: Contact, agentName: string, sinceIso?: string | null) => c.history.some((h) => h.by === agentName && (!sinceIso || h.at >= sinceIso));
const label = (c: Contact) => c.company || c.name;

export function flowStageOf(c: Contact, now = Date.now()): FlowStage | 'closed' {
  if (c.stage === 'lost') return 'closed';
  if (c.stage === 'lead') return c.sequence ? 'outreach' : c.researchReport || c.leadScore ? 'qualify' : 'research';
  if (c.stage === 'contacted') return 'outreach';
  if (c.stage === 'qualified') return 'discovery';
  if (c.stage === 'proposal') return 'proposal';
  const cf = c.customer ?? EMPTY_CUSTOMER;
  const onboarded = !!cf.onboarding && cf.onboarding.steps.every((s) => s.doneAt);
  const days = daysSince(cf.wonAt, now);
  if (!onboarded && days < 30) return 'onboard';
  if (cf.review && cf.review.health >= 70 && days >= 45) return 'expand';
  return 'retain';
}

export type Rule =
  | 'icp' | 'find' | 'prospects' | 'approvals' | 'score' | 'sequence' | 'send_step' | 'sync' | 'quiet' | 'discovery' | 'advance'
  | 'research' | 'research_import' | 'proposal' | 'proposal_send' | 'proposal_stage' | 'proposal_quiet' | 'winloss' | 'onboard' | 'welcome' | 'onboard_task' | 'review' | 'checkin' | 'renewal' | 'referral';
export type ActionKind = 'agent' | 'send' | 'approve' | 'task' | 'open';

export interface NextAction {
  key: string; rule: Rule; stage: FlowStage; kind: ActionKind; title: string; why: string; priority: number; due: string;
  contactId?: string; company?: string; agentId?: string;
  /** For a prospect search: the ICP it matches. */
  icp?: { id: string; name: string };
  /** For a message the owner sends: the draft to copy, and where it goes. */
  draft?: { channel: string; subject: string; text: string; to: string };
  stepIndex?: number; msg?: CustomerMsg; ref?: string; suggestStage?: string; count?: number;
}

/** Agent work that only saves a draft or a record onto the deal, so the autopilot may run it on its own. */
export const AUTO_RULES: Rule[] = ['score', 'sequence', 'onboard', 'review'];
export const SKIP_DAYS = 7;
const QUIET_DAYS = 7;
const PROPOSAL_QUIET_DAYS = 5;
const REVIEW_EVERY_DAYS = 30;
/** A new prospect search is suggested (and the weekly search runs) once the last one is this old. */
export const FIND_EVERY_DAYS = 7;
/** How many prospects one search asks for. */
export const FIND_COUNT = 10;
const RENEWAL_WINDOW_DAYS = 45;
/** Leads wait for research and no research file was imported this long ago: the queue offers Import research. */
export const RESEARCH_IMPORT_EVERY_DAYS = 7;

interface QueueInput { contacts: Contact[]; icps: Icp[]; prospectBatches: ProspectBatch[]; flowOrg: FlowOrg; pendingApprovals?: number; lastProspectSearch?: string | null }

/** Every next action across the flow, most urgent first, without the ones the owner skipped. */
export function nextActions(q: QueueInput, now = Date.now()): NextAction[] {
  const out: NextAction[] = [];
  const iso = (t: number) => new Date(t).toISOString();
  const today = iso(now);
  const add = (a: Omit<NextAction, 'due'> & { due?: string }) => out.push({ due: today, ...a });

  if (q.pendingApprovals) add({ key: 'approvals', rule: 'approvals', stage: 'outreach', kind: 'open', title: `${q.pendingApprovals} message${q.pendingApprovals === 1 ? '' : 's'} wait for your approval`, why: 'Agents drafted these emails; nothing goes out until you approve each one.', priority: 0, count: q.pendingApprovals });
  if (!q.icps.length) add({ key: 'icp', rule: 'icp', stage: 'find', kind: 'open', agentId: 'icp-builder', title: 'Define who you sell to', why: 'Every agent scores, writes and searches from your ICP. Upload your lead workbook or paste notes, then build it.', priority: 5 });
  const pending = q.prospectBatches.reduce((n, b) => n + b.items.filter((p) => p.status === 'pending').length, 0);
  if (pending) add({ key: 'prospects', rule: 'prospects', stage: 'find', kind: 'open', title: `Review ${pending} new prospect${pending === 1 ? '' : 's'}`, why: 'The Prospect Generator found them on public pages. Tick the ones to add to New lead.', priority: 18, count: pending });
  const icp = q.icps[0];
  const lastFind = q.lastProspectSearch ? Date.parse(q.lastProspectSearch) : NaN;
  if (icp && !pending && !(now - lastFind < FIND_EVERY_DAYS * DAY)) {
    const newLeads = q.contacts.filter((c) => c.stage === 'lead').length;
    add({
      key: `find:${icp.id}`, rule: 'find', stage: 'find', kind: 'agent', agentId: 'lead-finder', icp: { id: icp.id, name: icp.name },
      title: `Find ${FIND_COUNT} new prospects for ${icp.name}`,
      why: `${Number.isNaN(lastFind) ? 'No prospect search yet.' : `Last search ${Math.floor((now - lastFind) / DAY)} days ago.`} The Prospect Generator searches public pages for businesses that fit, skipping ones already in the CRM. Nothing is added until you tick them. Uses a few web searches.`,
      priority: newLeads < 5 ? 19 : 45,
    });
  }

  const waiting = q.contacts.filter((c) => flowStageOf(c, now) === 'research').length;
  const lastImport = q.contacts.reduce((t, c) => (c.researchReport?.importKey ? Math.max(t, Date.parse(c.researchReport.at) || 0) : t), 0);
  if (waiting && now - lastImport >= RESEARCH_IMPORT_EVERY_DAYS * DAY) {
    add({
      key: 'research_import', rule: 'research_import', stage: 'research', kind: 'open', count: waiting,
      title: `Import research for your leads`,
      why: `${waiting} lead${waiting === 1 ? ' waits' : 's wait'} for research. Have a research file (.json), for example from Claude Duet? Import it and each report goes on its deal: pain points, found contact details and a proposal draft with ROI. Nothing is sent, and no contact is added.`,
      priority: 19,
    });
  }

  for (const c of q.contacts) {
    const stage = flowStageOf(c, now);
    if (stage === 'closed') {
      if (!ranBy(c, 'Win-Loss Analyst')) add({ key: `${c.id}:winloss`, rule: 'winloss', stage: 'proposal', kind: 'agent', agentId: 'win-loss', contactId: c.id, company: label(c), title: `Learn why ${label(c)} was lost`, why: 'A short win-loss review sharpens the ICP and the next pitch.', priority: 60 });
      continue;
    }
    const base = { contactId: c.id, company: label(c), stage };
    if (c.stage !== 'won' && !c.researchReport) add({ ...base, stage: 'research', key: `${c.id}:research`, rule: 'research', kind: 'agent', agentId: 'business-research', title: `Research ${label(c)}`, why: 'A sourced report on the owner and the business: pain points, missing contact details and where AI agents would help. Uses a few web searches.', priority: c.stage === 'lead' ? 38 + Math.min(19, c.rank ?? 19) / 100 : 27 });
    const prop = c.proposal;
    if (prop && !prop.sentAt && c.stage !== 'won') add({ ...base, key: `${c.id}:psend:${prop.id}`, rule: 'proposal_send', kind: 'send', draft: { channel: 'email', subject: prop.subject, text: proposalMessage(prop), to: c.email }, title: `Send the proposal to ${label(c)}`, why: `Net ${fmtMoney(prop.roi.netMonthly, prop.currency)} a month for them${prop.roi.roiPct !== null ? `, first-year return ${prop.roi.roiPct}%` : ''}. Check the ROI assumptions on the customer page first.`, priority: 12 });
    if (prop?.sentAt && ['lead', 'contacted', 'qualified'].includes(c.stage)) add({ ...base, key: `${c.id}:pstage:${prop.id}`, rule: 'proposal_stage', kind: 'approve', suggestStage: 'proposal', title: `Move ${label(c)} to Proposal?`, why: 'You sent them the proposal.', priority: 14 });
    if (c.syncSuggestion) add({ ...base, key: `${c.id}:sync`, rule: 'sync', kind: 'approve', suggestStage: c.syncSuggestion.stage, title: `Move ${label(c)} to ${c.syncSuggestion.stage}?`, why: c.syncSuggestion.reason, priority: 15 });

    if (c.stage === 'lead' || c.stage === 'contacted') {
      if (!c.leadScore && c.stage === 'lead') add({ ...base, key: `${c.id}:score`, rule: 'score', kind: 'agent', agentId: 'lead-scorer', title: `Score ${label(c)}`, why: 'Scoring tells you which leads to work first.', priority: 40 + Math.min(19, c.rank ?? 19) / 100 });
      else if (c.leadScore && c.leadScore.score >= 60 && !c.sequence) add({ ...base, key: `${c.id}:sequence`, rule: 'sequence', kind: 'agent', agentId: 'outreach-sequencer', title: `Draft outreach for ${label(c)}`, why: `Lead score ${c.leadScore.score} (${c.leadScore.grade}): worth a personal sequence.`, priority: 35 - c.leadScore.score / 100 });
      const seq = c.sequence;
      const i = seq ? seq.steps.findIndex((s) => !s.sentAt) : -1;
      if (seq && i >= 0) {
        const st = seq.steps[i];
        const prevSent = i === 0 ? seq.at : seq.steps[i - 1].sentAt ?? seq.at;
        const dueAt = Date.parse(prevSent) + (i === 0 ? 0 : Math.max(0, st.day - seq.steps[i - 1].day)) * DAY;
        if (dueAt <= now) {
          const to = st.channel === 'email' ? c.email : st.channel === 'linkedin' ? 'LinkedIn' : c.phone;
          add({ ...base, key: `${c.id}:step:${seq.id}:${i}`, rule: 'send_step', kind: 'send', stepIndex: i, draft: { channel: st.channel, subject: st.subject, text: st.text, to: to || '' }, title: `Send step ${i + 1} of ${seq.steps.length} to ${label(c)}`, why: `Day ${st.day} ${st.channel === 'linkedin' ? 'LinkedIn message' : st.channel}, drafted in your voice.`, priority: 10 - Math.min(5, (now - dueAt) / DAY) / 10, due: iso(dueAt) });
        }
      } else if (c.stage === 'contacted' && daysSince(c.lastTouch ?? c.createdAt, now) >= QUIET_DAYS) {
        add({ ...base, key: `${c.id}:quiet:${(c.lastTouch ?? c.createdAt).slice(0, 10)}`, rule: 'quiet', kind: 'agent', agentId: 'follow-up-writer', title: `${label(c)} has gone quiet`, why: `No touch for ${Math.floor(daysSince(c.lastTouch ?? c.createdAt, now))} days. Draft a follow-up, or mark it lost.`, priority: 25 });
      }
    } else if (c.stage === 'qualified') {
      const s = c.score ?? 0;
      if (s >= 70) add({ ...base, key: `${c.id}:advance`, rule: 'advance', kind: 'approve', suggestStage: 'proposal', title: `Move ${label(c)} to Proposal?`, why: `MEDDIC ${s}%: the deal is qualified enough to propose.`, priority: 15 });
      else if (!c.callNotes && !ranBy(c, 'Call Prepper')) add({ ...base, key: `${c.id}:discovery`, rule: 'discovery', kind: 'agent', agentId: 'call-prepper', title: `Prep the discovery call with ${label(c)}`, why: 'Questions to fill the MEDDIC gaps: the pain, the number, who decides and by when.', priority: 30 });
    } else if (c.stage === 'proposal') {
      if (!prop && !ranBy(c, 'Proposal Writer')) add({ ...base, key: `${c.id}:proposal`, rule: 'proposal', kind: 'agent', agentId: 'proposal-writer', title: `Draft the proposal for ${label(c)}`, why: c.researchReport ? 'Built from the research, MEDDIC and your offer: opportunities, benefits and an ROI with its assumptions.' : 'Opportunities, benefits and an ROI with its assumptions. Research the business first for real pain points.', priority: 28 });
      else if ((!prop || prop.sentAt) && daysSince(c.lastTouch ?? c.updatedAt, now) >= PROPOSAL_QUIET_DAYS) add({ ...base, key: `${c.id}:pquiet:${(c.lastTouch ?? c.updatedAt).slice(0, 10)}`, rule: 'proposal_quiet', kind: 'agent', agentId: 'follow-up-writer', title: `Follow up on the proposal to ${label(c)}`, why: `Quiet for ${Math.floor(daysSince(c.lastTouch ?? c.updatedAt, now))} days since the proposal.`, priority: 22 });
    } else if (c.stage === 'won') {
      const cf = c.customer ?? EMPTY_CUSTOMER;
      const o = cf.onboarding;
      if (!o) add({ ...base, key: `${c.id}:onboard`, rule: 'onboard', kind: 'agent', agentId: 'onboarding-manager', title: `Plan onboarding for ${label(c)}`, why: 'A welcome email, kickoff agenda and first-30-days plan, so the start feels looked after.', priority: 16 });
      else {
        if (o.welcome && !wasSent(cf, 'welcome', o.id)) add({ ...base, key: `${c.id}:welcome:${o.id}`, rule: 'welcome', kind: 'send', msg: 'welcome', ref: o.id, draft: { channel: 'email', subject: o.welcome.subject, text: o.welcome.text, to: c.email }, title: `Send the welcome email to ${label(c)}`, why: 'First impression after the yes. Drafted from the deal record.', priority: 12 });
        const won = Date.parse(cf.wonAt ?? o.at);
        const n = o.steps.findIndex((s) => !s.doneAt && s.owner !== 'customer');
        if (n >= 0 && won + o.steps[n].day * DAY <= now) add({ ...base, key: `${c.id}:ostep:${o.id}:${n}`, rule: 'onboard_task', kind: 'task', stepIndex: n, ref: o.id, title: o.steps[n].title, why: `Onboarding day ${o.steps[n].day} for ${label(c)}${o.steps[n].owner === 'agent' ? ' (an agent can draft it; you confirm)' : ''}.`, priority: 20, due: iso(won + o.steps[n].day * DAY) });
      }
      const r = cf.review;
      const reviewDue = r ? daysSince(r.at, now) >= REVIEW_EVERY_DAYS : (!!o && o.steps.every((s) => s.doneAt)) || daysSince(cf.wonAt, now) >= 21;
      if (reviewDue) add({ ...base, key: `${c.id}:review:${r?.id ?? 'first'}`, rule: 'review', kind: 'agent', agentId: 'customer-success', title: `Health check on ${label(c)}`, why: r ? `Last review ${Math.floor(daysSince(r.at, now))} days ago (health ${r.health}).` : 'First account review since the win.', priority: r && r.band === 'at_risk' ? 13 : 26 });
      if (r) {
        if (r.checkIn && !wasSent(cf, 'checkin', r.id)) add({ ...base, key: `${c.id}:checkin:${r.id}`, rule: 'checkin', kind: 'send', msg: 'checkin', ref: r.id, draft: { channel: 'email', subject: r.checkIn.subject, text: r.checkIn.text, to: c.email }, title: `Check in with ${label(c)}`, why: `Health ${r.health} (${r.band.replace('_', ' ')}). ${r.risks ? `Risk: ${r.risks.slice(0, 120)}` : 'Keep the relationship warm.'}`, priority: r.band === 'at_risk' ? 11 : 14 });
        if (r.renewalDate) {
          const until = (Date.parse(r.renewalDate) - now) / DAY;
          if (until >= -7 && until <= RENEWAL_WINDOW_DAYS) add({ ...base, key: `${c.id}:renewal:${r.renewalDate}`, rule: 'renewal', kind: 'open', title: `${label(c)} renews ${until < 0 ? 'now' : `in ${Math.ceil(until)} days`}`, why: r.renewalPlan || 'Plan the renewal conversation before the date.', priority: 17, due: new Date(Date.parse(r.renewalDate)).toISOString() });
        }
        if (r.referral && !wasSent(cf, 'referral', r.id)) add({ ...base, key: `${c.id}:referral:${r.id}`, rule: 'referral', kind: 'send', msg: 'referral', ref: r.id, draft: { channel: 'email', subject: r.referral.subject, text: r.referral.text, to: c.email }, title: `Ask ${label(c)} for a referral`, why: `Health ${r.health}: a happy customer is the best source of the next one.${r.upsell.length ? ` Upsell idea: ${r.upsell[0].slice(0, 100)}` : ''}`, priority: 30 });
      }
    }
  }
  return out
    .filter((a) => { const until = q.flowOrg.skipped[a.key]; return !until || Date.parse(until) <= now; })
    .sort((a, b) => a.priority - b.priority || a.due.localeCompare(b.due));
}

/** How many deals sit in each stage of the flow (Find counts prospects waiting for a yes). */
export function flowCounts(q: QueueInput, now = Date.now()): Record<FlowStage, number> {
  const counts = Object.fromEntries(FLOW_STAGES.map((s) => [s.key, 0])) as Record<FlowStage, number>;
  counts.find = q.prospectBatches.reduce((n, b) => n + b.items.filter((p) => p.status === 'pending').length, 0);
  for (const c of q.contacts) { const s = flowStageOf(c, now); if (s !== 'closed') counts[s]++; }
  return counts;
}
