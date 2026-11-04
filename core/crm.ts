// CRM: contacts and deals for one business, as append-only audit events (no migration needed).
// The Sales CRM agent drafts follow-ups; each email waits for the owner's approval.
import { newId, nowIso, type Store } from './store.js';
import type { AuditEvent } from './types.js';

export const DEAL_STAGES = ['lead', 'contacted', 'qualified', 'proposal', 'won', 'lost'] as const;
export const SOURCES = ['website', 'referral', 'linkedin', 'whatsapp', 'walk-in', 'event', 'other'] as const;
export type DealStage = (typeof DEAL_STAGES)[number];

export interface ContactInput { id?: string; name: string; company?: string; email?: string; phone?: string; source?: string; value?: number | string; nextStep?: string; notes?: string }
export interface Contact { id: string; name: string; company: string; email: string; phone: string; source: string; value: number; nextStep: string; notes: string; stage: DealStage; createdAt: string; updatedAt: string; lastTouch: string | null }
export interface CrmState {
  contacts: Contact[];
  pipeline: Record<DealStage, number>;
  totals: { open: number; openValue: number; won: number; wonValue: number; winRate: number | null; followUps: number };
  followUpGoal: string;
}

export const CRM_EVENTS = ['crm.contact', 'crm.stage', 'crm.touch', 'crm.removed'];
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const PHONE_RE = /^\+?[\d\s()-]{7,20}$/;
const STALE_DAYS = 7;
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
  return { id: i.id && /^[\w-]{6,64}$/.test(i.id) ? i.id : newId(), name, company: text(i.company, 120), email, phone, source, value, nextStep: text(i.nextStep, 200), notes: text(i.notes, 2000) };
}

export async function upsertContact(store: Store, orgId: string, input: ContactInput, by: string): Promise<CrmState> {
  const c = clean(input);
  await record(store, orgId, by, 'crm.contact', { contact: c, summary: `Contact saved: ${c.name}` });
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

export async function removeContact(store: Store, orgId: string, id: string, by: string): Promise<CrmState> {
  await record(store, orgId, by, 'crm.removed', { contactId: id, summary: 'Contact removed' });
  return loadCrm(store, orgId);
}

/** Imports "name,company,email,phone,source,value" rows (header optional, at most 500). Bad rows are skipped. */
export async function importContacts(store: Store, orgId: string, csv: string, by: string): Promise<{ added: number; skipped: number }> {
  const rows = String(csv ?? '').split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  if (rows[0] && /^name\s*,/i.test(rows[0])) rows.shift();
  let added = 0;
  let skipped = 0;
  for (const row of rows.slice(0, 500)) {
    const [name, company, email, phone, source, value] = row.split(',').map((x) => x.trim());
    try {
      const c = clean({ name, company, email, phone, source, value });
      await record(store, orgId, by, 'crm.contact', { contact: c, summary: `Contact imported: ${c.name}` });
      added++;
    } catch {
      skipped++;
    }
  }
  return { added, skipped };
}

export async function loadCrm(store: Store, orgId: string, now = Date.now()): Promise<CrmState> {
  return computeCrm(await store.listAuditByActions(orgId, CRM_EVENTS), now);
}

export function computeCrm(events: AuditEvent[], now = Date.now()): CrmState {
  const map = new Map<string, Contact>();
  for (const e of events) {
    const d = e.detail;
    if (e.action === 'crm.contact') {
      const c = d.contact as Omit<Contact, 'stage' | 'createdAt' | 'updatedAt' | 'lastTouch'>;
      const prev = map.get(c.id);
      map.set(c.id, { ...c, stage: prev?.stage ?? 'lead', createdAt: prev?.createdAt ?? e.at, updatedAt: e.at, lastTouch: prev?.lastTouch ?? null });
    } else {
      const prev = map.get(String(d.contactId));
      if (!prev) continue;
      if (e.action === 'crm.stage') map.set(prev.id, { ...prev, stage: d.stage as DealStage, updatedAt: e.at, lastTouch: e.at });
      else if (e.action === 'crm.touch') map.set(prev.id, { ...prev, updatedAt: e.at, lastTouch: e.at });
      else if (e.action === 'crm.removed') map.delete(prev.id);
    }
  }
  const contacts = [...map.values()].sort((a, b) => DEAL_STAGES.indexOf(a.stage) - DEAL_STAGES.indexOf(b.stage) || b.updatedAt.localeCompare(a.updatedAt));
  const pipeline = Object.fromEntries(DEAL_STAGES.map((s) => [s, contacts.filter((c) => c.stage === s).length])) as Record<DealStage, number>;
  const open = contacts.filter((c) => OPEN.includes(c.stage));
  const won = contacts.filter((c) => c.stage === 'won');
  const closed = won.length + pipeline.lost;
  const stale = open.filter((c) => c.email && now - Date.parse(c.lastTouch ?? c.createdAt) >= STALE_DAYS * 864e5);
  return {
    contacts, pipeline,
    totals: {
      open: open.length, openValue: open.reduce((s, c) => s + c.value, 0), won: won.length, wonValue: won.reduce((s, c) => s + c.value, 0),
      winRate: closed ? Math.round((won.length / closed) * 100) : null, followUps: stale.length,
    },
    followUpGoal: followUpGoal(stale.slice(0, 10)),
  };
}

function followUpGoal(list: Contact[]): string {
  if (!list.length) return '';
  return `Draft a short, personal follow-up email to each contact below and queue each with send_message (channel "email"). Mention where we left off, offer one clear next step, and keep it under 120 words. Each email waits for the owner's approval.\n${list.map((c) => `- ${c.name}${c.company ? ` (${c.company})` : ''} <${c.email}>, stage ${c.stage}${c.nextStep ? `, next step: ${c.nextStep}` : ''}${c.notes ? `, notes: ${c.notes.slice(0, 200)}` : ''}`).join('\n')}`;
}
