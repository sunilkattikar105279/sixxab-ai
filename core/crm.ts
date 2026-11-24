// CRM: contacts and deals for one business, as append-only audit events (no migration needed).
// The Sales CRM agent drafts follow-ups; each email waits for the owner's approval.
import { newId, nowIso, type Store } from './store.js';
import type { AuditEvent } from './types.js';
import { cleanMeddic, scoreMeddic, type Meddic } from './gtm.js';

export const DEAL_STAGES = ['lead', 'contacted', 'qualified', 'proposal', 'won', 'lost'] as const;
export const SOURCES = ['website', 'referral', 'linkedin', 'whatsapp', 'walk-in', 'event', 'apollo', 'web-search', 'other'] as const;
export type DealStage = (typeof DEAL_STAGES)[number];

export const DEAL_TIERS = ['High', 'Medium', 'Low'] as const;
export type Tier = (typeof DEAL_TIERS)[number] | '';

/** Research about the lead's business, kept beside the deal so people and agents see why it is in the pipeline. */
export interface LeadProfile {
  rank: number | null; niche: string; city: string; website: string; size: string; title: string;
  dealTier: Tier; ease: Tier; whyFit: string; pitch: string; sourceDetail: string; checkFirst: string;
  /** Deeper research kept on the customer page: their pains, what we offer them, how we open, and free notes. */
  painPoints: string; offer: string; angle: string; research: string;
}
export const EMPTY_PROFILE: LeadProfile = { rank: null, niche: '', city: '', website: '', size: '', title: '', dealTier: '', ease: '', whyFit: '', pitch: '', sourceDetail: '', checkFirst: '', painPoints: '', offer: '', angle: '', research: '' };

/** One line in a customer's history: what happened, when, and who did it. */
export interface HistoryItem { at: string; by: string; kind: string; text: string }
export const NOTE_KINDS = ['note', 'call', 'email', 'meeting', 'research'] as const;
const TOUCH_KINDS = ['call', 'email', 'meeting'];
const HISTORY_MAX = 100;

export interface ContactInput extends Partial<Omit<LeadProfile, 'rank' | 'dealTier' | 'ease'>> {
  id?: string; name: string; company?: string; email?: string; phone?: string; source?: string; value?: number | string; nextStep?: string; notes?: string; apolloId?: string;
  rank?: number | string | null; dealTier?: string; ease?: string;
}
export interface Contact extends LeadProfile {
  id: string; name: string; company: string; email: string; phone: string; source: string; value: number; nextStep: string; notes: string;
  apolloId?: string;
  stage: DealStage; createdAt: string; updatedAt: string; lastTouch: string | null;
  meddic: Meddic | null; callNotes: string; score: number | null;
  /** Newest first. */
  history: HistoryItem[];
}
export interface CrmState {
  contacts: Contact[];
  pipeline: Record<DealStage, number>;
  totals: { open: number; openValue: number; won: number; wonValue: number; winRate: number | null; followUps: number };
  followUpGoal: string;
  /** Brand-new leads (48 hours, never contacted, with an email) for the Speed-to-Lead agent. */
  newLeads: number;
  speedGoal: string;
}

export const CRM_EVENTS = ['crm.contact', 'crm.stage', 'crm.touch', 'crm.note', 'crm.qualify', 'crm.removed'];
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const PHONE_RE = /^\+?[\d\s()-]{7,20}$/;
const STALE_DAYS = 7;
const NEW_LEAD_HOURS = 48;
const OPEN: DealStage[] = ['lead', 'contacted', 'qualified', 'proposal'];

const text = (v: unknown, max: number) => String(v ?? '').trim().slice(0, max);
const record = (store: Store, orgId: string, by: string, action: string, detail: Record<string, unknown>) =>
  store.audit({ id: newId(), orgId, at: nowIso(), actor: by, action, taskId: null, detail });

function clean(i: ContactInput) {
  const name = text(i.name, 120);
  if (!name) throw new Error('A contact needs a name');
  const email = text(i.email, 200);
  if (email && !EMAIL_RE.test(email)) throw new Error('That email address does not look right');
  const phone = text(i.phone, 20);
  if (phone && !PHONE_RE.test(phone)) throw new Error('That phone number does not look right');
  const value = i.value === undefined || i.value === '' ? 0 : Number(String(i.value).replace(/[,$₹\s]/g, ''));
  if (!Number.isFinite(value) || value < 0) throw new Error('Deal value must be zero or more');
  const source = (SOURCES as readonly string[]).includes(String(i.source)) ? String(i.source) : 'other';
  const apolloId = i.apolloId && /^[a-f0-9]{24}$/.test(i.apolloId) ? i.apolloId : undefined;
  return { id: i.id && /^[\w-]{6,64}$/.test(i.id) ? i.id : newId(), name, company: text(i.company, 120), email, phone, source, value, nextStep: text(i.nextStep, 200), notes: text(i.notes, 2000), ...(apolloId ? { apolloId } : {}), ...cleanProfile(i) };
}

const tier = (v: unknown): Tier => DEAL_TIERS.find((t) => t.toLowerCase() === text(v, 10).toLowerCase()) ?? '';

function cleanProfile(i: ContactInput): LeadProfile {
  const r = i.rank === undefined || i.rank === null || i.rank === '' ? NaN : Number(i.rank);
  return {
    rank: Number.isInteger(r) && r > 0 && r < 1e6 ? r : null,
    niche: text(i.niche, 80), city: text(i.city, 120), website: text(i.website, 200).replace(/^https?:\/\//i, '').replace(/\/$/, ''),
    size: text(i.size, 80), title: text(i.title, 120), dealTier: tier(i.dealTier), ease: tier(i.ease),
    whyFit: text(i.whyFit, 1000), pitch: text(i.pitch, 300), sourceDetail: text(i.sourceDetail, 200), checkFirst: text(i.checkFirst, 300),
    painPoints: text(i.painPoints, 1000), offer: text(i.offer, 500), angle: text(i.angle, 500), research: text(i.research, 8000),
  };
}

export async function upsertContact(store: Store, orgId: string, input: ContactInput, by: string): Promise<CrmState> {
  // Editing keeps whatever the edit did not send (for example an Apollo id), so a short form never wipes research.
  const prev = input.id ? (await loadCrm(store, orgId)).contacts.find((x) => x.id === input.id) : undefined;
  const c = clean(prev ? ({ ...prev, ...input } as ContactInput) : input);
  await record(store, orgId, by, 'crm.contact', { contact: c, summary: prev ? `Contact updated: ${c.name}` : `Contact saved: ${c.name}` });
  return loadCrm(store, orgId);
}

export async function setDealStage(store: Store, orgId: string, id: string, stage: DealStage, by: string): Promise<CrmState> {
  if (!DEAL_STAGES.includes(stage)) throw new Error(`stage must be one of: ${DEAL_STAGES.join(', ')}`);
  const c = (await loadCrm(store, orgId)).contacts.find((x) => x.id === id);
  if (!c) throw new Error('Contact not found');
  await record(store, orgId, by, 'crm.stage', { contactId: id, stage, summary: `${c.name}: ${stage}` });
  return loadCrm(store, orgId);
}

/** Records a touch (call, meeting, message) so follow-ups know when you last spoke. */
export async function logTouch(store: Store, orgId: string, id: string, note: string, by: string): Promise<CrmState> {
  const c = (await loadCrm(store, orgId)).contacts.find((x) => x.id === id);
  if (!c) throw new Error('Contact not found');
  await record(store, orgId, by, 'crm.touch', { contactId: id, note: text(note, 500), summary: `Touched base with ${c.name}` });
  return loadCrm(store, orgId);
}

/** Adds a line to the customer's history. Calls, emails and meetings also count as touching base. */
export async function addNote(store: Store, orgId: string, id: string, kind: string, note: string, by: string): Promise<CrmState> {
  const c = (await loadCrm(store, orgId)).contacts.find((x) => x.id === id);
  if (!c) throw new Error('Contact not found');
  const k = (NOTE_KINDS as readonly string[]).includes(kind) ? kind : 'note';
  const body = text(note, 8000);
  if (!body) throw new Error('Write something to add to the history');
  const touch = TOUCH_KINDS.includes(k);
  await record(store, orgId, by, touch ? 'crm.touch' : 'crm.note', { contactId: id, kind: k, note: body, summary: `${touch ? 'Touched base with' : 'Note on'} ${c.name}` });
  return loadCrm(store, orgId);
}

/** Saves the deal's MEDDIC evidence and the latest call notes; counts as a touch. */
export async function qualifyDeal(store: Store, orgId: string, id: string, meddic: unknown, callNotes: string, by: string): Promise<CrmState> {
  const c = (await loadCrm(store, orgId)).contacts.find((x) => x.id === id);
  if (!c) throw new Error('Contact not found');
  const m = cleanMeddic(meddic);
  const { score, verdict } = scoreMeddic(m);
  await record(store, orgId, by, 'crm.qualify', { contactId: id, meddic: m, callNotes: text(callNotes, 4000), summary: `${c.name}: MEDDIC ${score}% (${verdict})` });
  return loadCrm(store, orgId);
}

export async function removeContact(store: Store, orgId: string, id: string, by: string): Promise<CrmState> {
  await record(store, orgId, by, 'crm.removed', { contactId: id, summary: 'Contact removed' });
  return loadCrm(store, orgId);
}

/** Adds people found in Apollo as leads; anyone already imported (same Apollo id) is skipped. */
export async function importApolloPeople(store: Store, orgId: string, people: { apolloId: string; name: string; title?: string; company?: string; domain?: string; location?: string; linkedin?: string }[], by: string): Promise<{ added: number; skipped: number }> {
  const have = new Set((await loadCrm(store, orgId)).contacts.map((c) => c.apolloId).filter(Boolean));
  let added = 0, skipped = 0;
  for (const p of (Array.isArray(people) ? people : []).slice(0, 100)) {
    if (!p || !/^[a-f0-9]{24}$/.test(String(p.apolloId)) || have.has(p.apolloId)) { skipped++; continue; }
    try {
      const notes = [p.title && `Title: ${p.title}`, p.location && `Location: ${p.location}`, p.domain && `Website: ${p.domain}`, p.linkedin && `LinkedIn: ${p.linkedin}`].filter(Boolean).join('; ');
      const c = clean({ name: p.name, company: p.company, source: 'apollo', notes, apolloId: p.apolloId });
      await record(store, orgId, by, 'crm.contact', { contact: c, summary: `Lead from Apollo: ${c.name}` });
      have.add(p.apolloId);
      added++;
    } catch {
      skipped++;
    }
  }
  return { added, skipped };
}

/** Stores an email revealed for a contact, keeping everything else as it was. */
export async function setContactEmail(store: Store, orgId: string, id: string, email: string, by: string): Promise<CrmState> {
  const c = (await loadCrm(store, orgId)).contacts.find((x) => x.id === id);
  if (!c) throw new Error('Contact not found');
  return upsertContact(store, orgId, { ...c, email, value: c.value }, by);
}

/** Splits one CSV line, honouring double-quoted fields ("a, b" and "" for a quote). */
export function splitCsvLine(line: string): string[] {
  const out: string[] = [];
  let cur = '';
  let quoted = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (quoted) {
      if (ch === '"' && line[i + 1] === '"') { cur += '"'; i++; }
      else if (ch === '"') quoted = false;
      else cur += ch;
    } else if (ch === '"' && cur.trim() === '') { cur = ''; quoted = true; }
    else if (ch === ',') { out.push(cur.trim()); cur = ''; }
    else cur += ch;
  }
  out.push(cur.trim());
  return out;
}

/** Column names a header row may use (the lead sheet's own headers included), matched without case, spaces or punctuation. */
const COLUMNS: Record<string, string[]> = {
  name: ['name', 'contact', 'contactname', 'person'],
  decisionMaker: ['decisionmaker', 'owner'],
  company: ['company', 'business', 'businessname'],
  email: ['email', 'emailaddress'],
  phone: ['phone', 'mainphone', 'mainphonepubliclisting', 'phonenumber'],
  source: ['leadsource'],
  sourceText: ['source'],
  value: ['value', 'dealvalue'],
  nextStep: ['nextstep'],
  notes: ['notes'],
  rank: ['rank'],
  niche: ['niche', 'industry'],
  city: ['city', 'location'],
  website: ['website', 'domain', 'url'],
  size: ['size', 'employees', 'companysize'],
  title: ['title', 'role'],
  dealTier: ['dealsize', 'dealtier'],
  ease: ['easeofwin', 'ease'],
  whyFit: ['whytheyfit', 'whyfit', 'why'],
  pitch: ['agenttopitch', 'pitch'],
  sourceDetail: ['sourcedetail', 'sourcepage'],
  checkFirst: ['checkbeforeoutreach', 'checkfirst'],
  painPoints: ['painpoints', 'pains', 'painpoint'],
  offer: ['offer', 'ouroffer'],
  angle: ['outreachangle', 'angle', 'openingangle'],
  research: ['research', 'researchnotes'],
};
const POSITIONAL = ['name', 'company', 'email', 'phone', 'source', 'value', 'nextStep', 'notes'];
const norm = (h: string) => h.toLowerCase().replace(/[^a-z0-9]/g, '');

/** Maps a header row to field names, or null when the first row is data. */
function headerMap(cells: string[]): (string | null)[] | null {
  const map = cells.map((h) => Object.keys(COLUMNS).find((k) => COLUMNS[k].includes(norm(h))) ?? null);
  return map.includes('name') || map.includes('company') || map.includes('decisionMaker') ? map : null;
}

/** "Jane Roe, owner and founder" -> name and title; "Not stated" -> no person. */
function splitPerson(v: string): { name: string; title: string } {
  if (!v || /^not stated/i.test(v)) return { name: '', title: '' };
  const [who, ...rest] = v.split(',');
  return { name: who.replace(/\s*\(.*?\)/g, '').trim(), title: rest.join(',').trim() };
}

/** Turns one CSV row into a contact; a business with no named person is filed under the business name. */
function rowToInput(cells: string[], map: (string | null)[]): ContactInput {
  const f: Record<string, string> = {};
  map.forEach((k, i) => { if (k && cells[i] !== undefined && f[k] === undefined) f[k] = cells[i]; });
  const person = splitPerson(f.decisionMaker ?? '');
  const phone = (f.phone ?? '').match(/^\+?[\d\s()-]{7,20}/)?.[0].trim() ?? '';
  let source = f.source ?? '';
  let sourceDetail = f.sourceDetail ?? '';
  if (f.sourceText) {
    if ((SOURCES as readonly string[]).includes(f.sourceText.toLowerCase())) source ||= f.sourceText.toLowerCase();
    else sourceDetail ||= f.sourceText;
  }
  return {
    name: map.includes('name') ? f.name ?? '' : person.name || f.company || '', company: f.company, email: f.email, phone, source: source.toLowerCase(), value: f.value,
    nextStep: f.nextStep, notes: f.notes, rank: f.rank, niche: f.niche, city: f.city, website: f.website, size: f.size,
    title: f.title || person.title, dealTier: f.dealTier, ease: f.ease, whyFit: f.whyFit, pitch: f.pitch, sourceDetail, checkFirst: f.checkFirst,
    painPoints: f.painPoints, offer: f.offer, angle: f.angle, research: f.research,
  };
}

const dupKey = (name: string, company: string) => `${name.toLowerCase().trim()}|${company.toLowerCase().trim()}`;

/**
 * Imports a CSV (at most 500 rows). With a header row, columns are matched by name, so the lead sheet's own
 * headers (Rank, Business, Niche, City, Website, Main phone, Size, Decision maker, Deal size, Ease of win,
 * Why they fit, Agent to pitch, Source, Check before outreach) work as they are. Without one, rows are
 * "name,company,email,phone,source,value[,nextStep,notes]". Fields may be double-quoted. Bad rows, and
 * contacts already in the CRM (same name and company), are skipped.
 */
export async function importContacts(store: Store, orgId: string, csv: string, by: string): Promise<{ added: number; skipped: number; duplicates: number; updated: number }> {
  const lines = String(csv ?? '').replace(/^\uFEFF/, '').split(/\r?\n/).filter((l) => l.trim());
  // Rows copied straight out of Excel or Google Sheets arrive tab-separated.
  const tabbed = !!lines[0]?.includes('\t');
  const rows = lines.map((l) => (tabbed ? l.split('\t').map((c) => c.trim().replace(/^"([\s\S]*)"$/, '$1').replace(/""/g, '"')) : splitCsvLine(l.trim())));
  const map = rows[0] ? headerMap(rows[0]) : null;
  if (map) rows.shift();
  const have = new Map((await loadCrm(store, orgId)).contacts.map((c) => [dupKey(c.name, c.company), c as unknown as Record<string, unknown>]));
  let added = 0;
  let skipped = 0;
  let duplicates = 0;
  let updated = 0;
  for (const cells of rows.slice(0, 500)) {
    try {
      const c = clean(rowToInput(cells, map ?? POSITIONAL));
      const key = dupKey(c.name, c.company);
      const prev = have.get(key);
      if (prev) {
        // Already in the CRM: a later sheet only fills in what the contact is missing, never overwrites it.
        const fill: Record<string, unknown> = {};
        for (const [k, v] of Object.entries(c)) {
          if (k === 'id') continue;
          const empty = (x: unknown) => x === undefined || x === null || x === '' || x === 0;
          if (!empty(v) && empty(prev[k])) fill[k] = v;
        }
        if (Object.keys(fill).length === 0) { duplicates++; continue; }
        const merged = clean({ ...prev, ...fill } as unknown as ContactInput);
        await record(store, orgId, by, 'crm.contact', { contact: merged, summary: `Contact updated from a list: ${merged.name}` });
        have.set(key, { ...prev, ...merged });
        updated++;
        continue;
      }
      await record(store, orgId, by, 'crm.contact', { contact: c, summary: `Contact imported: ${c.name}` });
      have.set(key, c as unknown as Record<string, unknown>);
      added++;
    } catch {
      skipped++;
    }
  }
  return { added, skipped, duplicates, updated };
}

export async function loadCrm(store: Store, orgId: string, now = Date.now()): Promise<CrmState> {
  return computeCrm(await store.listAuditByActions(orgId, CRM_EVENTS), now);
}

const addHistory = (h: HistoryItem[], item: HistoryItem) => [item, ...h].slice(0, HISTORY_MAX);

export function computeCrm(events: AuditEvent[], now = Date.now()): CrmState {
  const map = new Map<string, Contact>();
  for (const e of events) {
    const d = e.detail;
    if (e.action === 'crm.contact') {
      const c = d.contact as Omit<Contact, 'stage' | 'createdAt' | 'updatedAt' | 'lastTouch' | 'meddic' | 'callNotes' | 'score'>;
      const prev = map.get(c.id);
      const summary = String(d.summary ?? '');
      const what = !prev ? (summary.startsWith('Contact imported') ? 'Imported from a list' : 'Added to the CRM') : summary.startsWith('Contact updated from a list') ? 'Details filled in from a list' : 'Details updated';
      const history = addHistory(prev?.history ?? [], { at: e.at, by: e.actor, kind: 'update', text: what });
      map.set(c.id, { ...EMPTY_PROFILE, ...c, stage: prev?.stage ?? 'lead', createdAt: prev?.createdAt ?? e.at, updatedAt: e.at, lastTouch: prev?.lastTouch ?? null, meddic: prev?.meddic ?? null, callNotes: prev?.callNotes ?? '', score: prev?.score ?? null, history });
    } else {
      const prev = map.get(String(d.contactId));
      if (!prev) continue;
      const log = (kind: string, t: string) => addHistory(prev.history, { at: e.at, by: e.actor, kind, text: t });
      if (e.action === 'crm.stage') map.set(prev.id, { ...prev, stage: d.stage as DealStage, updatedAt: e.at, lastTouch: e.at, history: log('stage', String(d.stage)) });
      else if (e.action === 'crm.touch') map.set(prev.id, { ...prev, updatedAt: e.at, lastTouch: e.at, history: log(String(d.kind ?? 'touch'), String(d.note ?? '') || 'Touched base') });
      else if (e.action === 'crm.note') map.set(prev.id, { ...prev, updatedAt: e.at, history: log(String(d.kind ?? 'note'), String(d.note ?? '')) });
      else if (e.action === 'crm.qualify') { const m = cleanMeddic(d.meddic); const score = scoreMeddic(m).score; map.set(prev.id, { ...prev, meddic: m, callNotes: String(d.callNotes ?? ''), score, updatedAt: e.at, lastTouch: e.at, history: log('qualify', `Qualified: MEDDIC ${score}%${d.callNotes ? `. ${String(d.callNotes).slice(0, 300)}` : ''}`) }); }
      else if (e.action === 'crm.removed') map.delete(prev.id);
    }
  }
  const byRank = (a: Contact, b: Contact) => (a.rank != null && b.rank != null ? a.rank - b.rank : 0);
  const contacts = [...map.values()].sort((a, b) => DEAL_STAGES.indexOf(a.stage) - DEAL_STAGES.indexOf(b.stage) || byRank(a, b) || b.updatedAt.localeCompare(a.updatedAt));
  const pipeline = Object.fromEntries(DEAL_STAGES.map((s) => [s, contacts.filter((c) => c.stage === s).length])) as Record<DealStage, number>;
  const open = contacts.filter((c) => OPEN.includes(c.stage));
  const won = contacts.filter((c) => c.stage === 'won');
  const closed = won.length + pipeline.lost;
  const fresh = contacts.filter((c) => c.stage === 'lead' && c.email && !c.lastTouch && now - Date.parse(c.createdAt) <= NEW_LEAD_HOURS * 36e5);
  const stale = open.filter((c) => c.email && now - Date.parse(c.lastTouch ?? c.createdAt) >= STALE_DAYS * 864e5);
  return {
    contacts, pipeline,
    totals: {
      open: open.length, openValue: open.reduce((s, c) => s + c.value, 0), won: won.length, wonValue: won.reduce((s, c) => s + c.value, 0),
      winRate: closed ? Math.round((won.length / closed) * 100) : null, followUps: stale.length,
    },
    followUpGoal: followUpGoal(stale.slice(0, 10)),
    newLeads: fresh.length,
    speedGoal: speedGoal(fresh.slice(0, 10)),
  };
}

function speedGoal(list: Contact[]): string {
  if (!list.length) return '';
  return `These leads are new and have not heard from us yet. Write one short first reply to each and queue it with send_message (channel "email"): thank them, answer what they asked if the notes say, and offer one clear next step such as a call time. Under 90 words each. Each email waits for the owner's approval.\n${list.map((c) => `- ${c.name}${c.company ? ` (${c.company})` : ''} <${c.email}>, came from ${c.source}${c.notes ? `, notes: ${c.notes.slice(0, 300)}` : ''}`).join('\n')}`;
}

/** The Lead Finder's goal for a search the owner describes. */
export function leadSearchGoal(query: string): string {
  return `Find up to 10 businesses that match: "${query.slice(0, 300)}". Use web search. For each: business name, city, website, public business phone or email if listed, and why it fits, with the page you found it on. Save the list as a note titled "Leads: ${query.slice(0, 60)}" with the rows also as CSV lines (name,company,email,phone,source,value) ready to import into the CRM; leave a field empty when it is not published.`;
}

function followUpGoal(list: Contact[]): string {
  if (!list.length) return '';
  return `Draft a short, personal follow-up email to each contact below and queue each with send_message (channel "email"). Mention where we left off, offer one clear next step, and keep it under 120 words. Each email waits for the owner's approval.\n${list.map((c) => `- ${c.name}${c.company ? ` (${c.company})` : ''} <${c.email}>, stage ${c.stage}${c.nextStep ? `, next step: ${c.nextStep}` : ''}${c.notes ? `, notes: ${c.notes.slice(0, 200)}` : ''}`).join('\n')}`;
}
