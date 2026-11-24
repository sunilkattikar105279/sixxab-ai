// Lead generation state, kept beside the CRM as crm.* audit events (no migration): ideal customer
// profiles (ICPs), prospect batches waiting for the owner's yes, and per-deal lead scores, outreach
// sequences, objection playbooks and CRM Sync suggestions. Pure functions only; nothing here contacts anyone.
import type { AuditEvent } from './types.js';

/** Org-level events: ICPs and prospect batches. */
export const LEADGEN_ORG_EVENTS = ['crm.icp', 'crm.icp_removed', 'crm.icp_notes', 'crm.prospects', 'crm.prospects_decided'];
/** Deal-level events, applied to each contact in computeCrm. */
export const LEADGEN_DEAL_EVENTS = ['crm.leadscore', 'crm.sequence', 'crm.sequence_step', 'crm.objection', 'crm.sync'];

export const ICP_FIELDS = ['summary', 'industries', 'locations', 'size', 'buyer', 'pains', 'signals', 'disqualifiers', 'offer', 'valueCase', 'voice'] as const;
export type IcpField = (typeof ICP_FIELDS)[number];
/** One ideal customer profile: who to sell to, how to spot them, what to offer and how to talk to them. */
export type Icp = { id: string; name: string; createdAt: string; updatedAt: string; by: string } & Record<IcpField, string>;

export const PROSPECT_FIELDS = ['company', 'name', 'title', 'niche', 'city', 'website', 'phone', 'email', 'size', 'whyFit', 'signal', 'sourcePage', 'checkFirst'] as const;
export type ProspectField = (typeof PROSPECT_FIELDS)[number];
export type Prospect = Record<ProspectField, string> & { key: string; status: 'pending' | 'added' | 'dismissed'; contactId?: string };
/** What the owner wrote or uploaded about who they sell to; the ICP Builder starts from it. */
export interface IcpNotes { text: string; at: string; by: string }
export const ICP_NOTES_MAX = 20000;

export interface ProspectBatch { id: string; icpId: string | null; icpName: string; at: string; by: string; items: Prospect[] }

export type Grade = 'A' | 'B' | 'C' | 'D';
export interface LeadScore { score: number; grade: Grade; reasons: string; icpId: string | null; at: string; by: string }

export const SEQUENCE_CHANNELS = ['email', 'linkedin', 'call', 'text'] as const;
export type SequenceChannel = (typeof SEQUENCE_CHANNELS)[number];
export interface SequenceStep { day: number; channel: SequenceChannel; subject: string; text: string; sentAt: string | null }
export interface Sequence { id: string; steps: SequenceStep[]; notes: string; at: string; by: string }

export interface ObjectionPlay { objection: string; responses: string[]; blocker: string; at: string; by: string }
export interface SyncSuggestion { stage: string; reason: string; at: string; by: string }

export interface DealLeadgen { leadScore: LeadScore | null; sequence: Sequence | null; objections: ObjectionPlay[]; syncSuggestion: SyncSuggestion | null }
export const EMPTY_DEAL_LEADGEN: DealLeadgen = { leadScore: null, sequence: null, objections: [], syncSuggestion: null };

export const text = (v: unknown, max: number) => String(v ?? '').trim().slice(0, max);
const OBJECTIONS_MAX = 10;
const BATCHES_SHOWN = 5;

export function gradeFor(score: number): Grade {
  return score >= 80 ? 'A' : score >= 60 ? 'B' : score >= 40 ? 'C' : 'D';
}

/** Validates an ICP from an agent or the owner. */
export function cleanIcp(input: Record<string, unknown>): Omit<Icp, 'id' | 'createdAt' | 'updatedAt' | 'by'> {
  const name = text(input.name, 80);
  if (!name) throw new Error('An ICP needs a short name, e.g. "DFW personal injury firms"');
  const out = { name } as Omit<Icp, 'id' | 'createdAt' | 'updatedAt' | 'by'>;
  for (const k of ICP_FIELDS) out[k] = text(input[k], k === 'voice' || k === 'summary' ? 2000 : 1000);
  if (!out.summary) throw new Error('An ICP needs a one-paragraph summary of who it is');
  return out;
}

const domainOf = (w: string) => w.toLowerCase().replace(/^https?:\/\//, '').replace(/^www\./, '').replace(/\/.*$/, '');
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Validates one proposed prospect; a business with no name or no source page is rejected. */
export function cleanProspect(input: Record<string, unknown>, key: string): Prospect {
  const p = { key, status: 'pending' } as Prospect;
  for (const f of PROSPECT_FIELDS) p[f] = text(input[f], f === 'whyFit' ? 1000 : f === 'sourcePage' ? 300 : 200);
  if (!p.company) throw new Error('Each prospect needs its business name');
  if (!p.sourcePage) throw new Error(`Cite the page you found ${p.company} on`);
  p.website = domainOf(p.website);
  if (p.email && !EMAIL_RE.test(p.email)) p.email = '';
  if (p.phone && !/^\+?[\d\s()-]{7,20}$/.test(p.phone)) p.phone = '';
  return p;
}

/** Validates a sequence: 2 to 7 steps, each with a day, a channel and the words to send. */
export function cleanSteps(input: unknown): SequenceStep[] {
  const raw = Array.isArray(input) ? input : [];
  const steps = raw.slice(0, 7).map((s, i) => {
    const o = (s && typeof s === 'object' ? s : {}) as Record<string, unknown>;
    const day = Math.round(Number(o.day));
    const channel = SEQUENCE_CHANNELS.find((c) => c === text(o.channel, 20).toLowerCase()) ?? 'email';
    const body = text(o.text, 3000);
    if (!body) throw new Error(`Step ${i + 1} has no text`);
    return { day: Number.isFinite(day) && day >= 0 && day <= 90 ? day : i * 3, channel, subject: channel === 'email' ? text(o.subject, 200) : '', text: body, sentAt: null };
  });
  if (steps.length < 2) throw new Error('A sequence needs at least 2 steps');
  return steps.sort((a, b) => a.day - b.day);
}

/** ICPs and the prospect batches that still have businesses waiting for the owner's yes. */
export function computeLeadgen(events: AuditEvent[]): { icps: Icp[]; prospectBatches: ProspectBatch[]; icpNotes: IcpNotes | null } {
  const icps = new Map<string, Icp>();
  let icpNotes: IcpNotes | null = null;
  const batches = new Map<string, ProspectBatch>();
  for (const e of events) {
    const d = e.detail;
    if (e.action === 'crm.icp') {
      const i = d.icp as Icp;
      const prev = icps.get(i.id);
      icps.set(i.id, { ...i, createdAt: prev?.createdAt ?? e.at, updatedAt: e.at, by: e.actor });
    } else if (e.action === 'crm.icp_removed') icps.delete(String(d.icpId));
    else if (e.action === 'crm.icp_notes') icpNotes = d.text ? { text: String(d.text), at: e.at, by: e.actor } : null;
    else if (e.action === 'crm.prospects') {
      const b = d.batch as Omit<ProspectBatch, 'at' | 'by'>;
      batches.set(b.id, { ...b, items: b.items.map((p) => ({ ...p })), at: e.at, by: e.actor });
    } else if (e.action === 'crm.prospects_decided') {
      const b = batches.get(String(d.batchId));
      if (!b) continue;
      const added = new Map(((d.added as { key: string; contactId: string }[]) ?? []).map((x) => [x.key, x.contactId]));
      const dismissed = new Set((d.dismissed as string[]) ?? []);
      b.items = b.items.map((p) => (p.status !== 'pending' ? p : added.has(p.key) ? { ...p, status: 'added', contactId: added.get(p.key) } : dismissed.has(p.key) ? { ...p, status: 'dismissed' } : p));
    }
  }
  return {
    icps: [...icps.values()].sort((a, b) => a.createdAt.localeCompare(b.createdAt)),
    icpNotes,
    prospectBatches: [...batches.values()].filter((b) => b.items.some((p) => p.status === 'pending')).sort((a, b) => b.at.localeCompare(a.at)).slice(0, BATCHES_SHOWN),
  };
}

/** Applies one deal-level lead generation event to a deal; returns the history line to add, if any. */
export function applyDealEvent(lg: DealLeadgen, e: AuditEvent, stage: string): { lg: DealLeadgen; history?: { kind: string; text: string } } {
  const d = e.detail;
  switch (e.action) {
    case 'crm.leadscore': {
      const s = d.score as Omit<LeadScore, 'at' | 'by'>;
      return { lg: { ...lg, leadScore: { ...s, at: e.at, by: e.actor } }, history: { kind: 'score', text: `Lead score ${s.score} (${s.grade}): ${s.reasons.slice(0, 400)}` } };
    }
    case 'crm.sequence': {
      const s = d.sequence as Omit<Sequence, 'at' | 'by'>;
      return { lg: { ...lg, sequence: { ...s, at: e.at, by: e.actor } }, history: { kind: 'sequence', text: `Outreach sequence drafted: ${s.steps.length} steps over ${s.steps.at(-1)?.day ?? 0} days (drafts, nothing sent)` } };
    }
    case 'crm.sequence_step': {
      const seq = lg.sequence;
      const i = Number(d.index);
      if (!seq || seq.id !== d.sequenceId || !seq.steps[i]) return { lg };
      const steps = seq.steps.map((s, n) => (n === i ? { ...s, sentAt: e.at } : s));
      return { lg: { ...lg, sequence: { ...seq, steps } } };
    }
    case 'crm.objection': {
      const o = d.play as Omit<ObjectionPlay, 'at' | 'by'>;
      const same = (x: ObjectionPlay) => x.objection.toLowerCase() !== o.objection.toLowerCase();
      return { lg: { ...lg, objections: [{ ...o, at: e.at, by: e.actor }, ...lg.objections.filter(same)].slice(0, OBJECTIONS_MAX) }, history: { kind: 'objection', text: `Objection answers ready: "${o.objection.slice(0, 200)}"` } };
    }
    case 'crm.sync': {
      if (d.dismiss) return { lg: { ...lg, syncSuggestion: null } };
      const stageTo = text(d.suggestStage, 20);
      const reason = text(d.reason, 500);
      const suggestion = stageTo && stageTo !== stage ? { stage: stageTo, reason, at: e.at, by: e.actor } : lg.syncSuggestion;
      const did = [d.filled && Array.isArray(d.filled) && d.filled.length ? `filled ${(d.filled as string[]).join(', ')}` : '', stageTo && stageTo !== stage ? `suggests moving to ${stageTo}` : ''].filter(Boolean).join('; ');
      return { lg: { ...lg, syncSuggestion: suggestion }, history: { kind: 'sync', text: `CRM Sync${did ? ` ${did}` : ''}: ${reason}` } };
    }
    default:
      return { lg };
  }
}

export interface DealView {
  id: string; name: string; company: string; email: string; phone: string; website: string; stage: string; nextStep: string;
  lastTouch: string | null; createdAt: string; meddic: unknown; leadScore: LeadScore | null; sequence: Sequence | null;
}
export interface CrmIssue { contactId: string; name: string; issue: string }
const STALE_DAYS = 14;

/** Pipeline records that disagree with themselves: what CRM Sync checks before it fixes or flags anything. */
export function crmIssues(deals: DealView[], now = Date.now()): CrmIssue[] {
  const out: CrmIssue[] = [];
  const add = (c: DealView, issue: string) => out.push({ contactId: c.id, name: c.company || c.name, issue });
  const seen = new Map<string, DealView>();
  for (const c of deals) {
    const open = !['won', 'lost'].includes(c.stage);
    if (c.stage !== 'lead' && c.stage !== 'lost' && !c.lastTouch) add(c, `Marked ${c.stage} but no call, email or meeting is logged.`);
    if ((c.stage === 'qualified' || c.stage === 'proposal') && !c.meddic) add(c, `At ${c.stage} with no MEDDIC qualification saved.`);
    if (open && c.stage !== 'lead' && !c.nextStep) add(c, 'Open deal with no next step.');
    if (c.stage === 'lead' && !c.email && !c.phone) add(c, 'No email or phone yet, so nobody can reach them.');
    if (c.stage === 'lead' && c.sequence?.steps.some((s) => s.sentAt)) add(c, 'An outreach step was sent but the deal is still a new lead.');
    if (open && c.stage !== 'lead' && now - Date.parse(c.lastTouch ?? c.createdAt) >= STALE_DAYS * 864e5) add(c, `No touch in ${STALE_DAYS}+ days.`);
    for (const key of [c.website && `w:${c.website.toLowerCase()}`, c.company && `c:${c.company.toLowerCase().trim()}`].filter(Boolean) as string[]) {
      const other = seen.get(key);
      if (other && other.id !== c.id) { add(c, `Looks like a duplicate of ${other.company || other.name}.`); break; }
      seen.set(key, c);
    }
  }
  return out;
}
