// Support desk: customer tickets for one business, as append-only audit events.
// The Support agent drafts replies; each reply waits for the owner's approval before it is sent.
import { newId, nowIso, type Store } from './store.js';
import type { AuditEvent } from './types.js';

export const TICKET_STATUSES = ['open', 'waiting', 'resolved'] as const;
export const PRIORITIES = ['low', 'normal', 'high', 'urgent'] as const;
export const CHANNELS = ['email', 'whatsapp', 'phone', 'website', 'walk-in'] as const;
export type TicketStatus = (typeof TICKET_STATUSES)[number];

export interface TicketInput { subject: string; customer: string; contact?: string; channel?: string; priority?: string; message: string }
export interface TicketNote { at: string; by: string; text: string }
export interface Ticket {
  id: string; number: number; subject: string; customer: string; contact: string; channel: string; priority: string;
  status: TicketStatus; createdAt: string; updatedAt: string; resolvedAt: string | null; notes: TicketNote[];
}
export interface SupportState {
  tickets: Ticket[];
  totals: { open: number; waiting: number; resolved: number; urgent: number; medianHoursToResolve: number | null };
  replyGoal: string;
}

export const SUPPORT_EVENTS = ['support.ticket', 'support.status', 'support.note'];
const SLA_ORDER = ['urgent', 'high', 'normal', 'low'];

const text = (v: unknown, max: number) => String(v ?? '').trim().slice(0, max);
const oneOf = (list: readonly string[], v: unknown, fallback: string) => (list.includes(String(v)) ? String(v) : fallback);
const record = (store: Store, orgId: string, by: string, action: string, detail: Record<string, unknown>) =>
  store.audit({ id: newId(), orgId, at: nowIso(), actor: by, action, taskId: null, detail });

export async function openTicket(store: Store, orgId: string, input: TicketInput, by: string): Promise<SupportState> {
  const subject = text(input.subject, 160);
  const customer = text(input.customer, 120);
  const message = text(input.message, 4000);
  if (!subject || !customer || !message) throw new Error('A ticket needs a subject, a customer and their message');
  const number = (await loadSupport(store, orgId)).tickets.reduce((m, t) => Math.max(m, t.number), 1000) + 1;
  const ticket = {
    id: newId(), number, subject, customer, contact: text(input.contact, 200),
    channel: oneOf(CHANNELS, input.channel, 'email'), priority: oneOf(PRIORITIES, input.priority, 'normal'), message,
  };
  await record(store, orgId, by, 'support.ticket', { ticket, summary: `Ticket #${number} opened: ${subject}` });
  return loadSupport(store, orgId);
}

export async function setTicketStatus(store: Store, orgId: string, id: string, status: TicketStatus, by: string): Promise<SupportState> {
  if (!TICKET_STATUSES.includes(status)) throw new Error(`status must be one of: ${TICKET_STATUSES.join(', ')}`);
  const t = (await loadSupport(store, orgId)).tickets.find((x) => x.id === id);
  if (!t) throw new Error('Ticket not found');
  await record(store, orgId, by, 'support.status', { ticketId: id, status, summary: `Ticket #${t.number} ${status}` });
  return loadSupport(store, orgId);
}

export async function addTicketNote(store: Store, orgId: string, id: string, note: string, by: string): Promise<SupportState> {
  const t = (await loadSupport(store, orgId)).tickets.find((x) => x.id === id);
  if (!t) throw new Error('Ticket not found');
  const body = text(note, 4000);
  if (!body) throw new Error('Write a note first');
  await record(store, orgId, by, 'support.note', { ticketId: id, text: body, summary: `Note on ticket #${t.number}` });
  return loadSupport(store, orgId);
}

export async function loadSupport(store: Store, orgId: string): Promise<SupportState> {
  return computeSupport(await store.listAuditByActions(orgId, SUPPORT_EVENTS));
}

export function computeSupport(events: AuditEvent[]): SupportState {
  const map = new Map<string, Ticket>();
  for (const e of events) {
    const d = e.detail;
    if (e.action === 'support.ticket') {
      const t = d.ticket as Omit<Ticket, 'status' | 'createdAt' | 'updatedAt' | 'resolvedAt' | 'notes'> & { message: string };
      const { message, ...rest } = t;
      map.set(t.id, { ...rest, status: 'open', createdAt: e.at, updatedAt: e.at, resolvedAt: null, notes: [{ at: e.at, by: t.customer, text: message }] });
      continue;
    }
    const prev = map.get(String(d.ticketId));
    if (!prev) continue;
    if (e.action === 'support.status') {
      const status = d.status as TicketStatus;
      map.set(prev.id, { ...prev, status, updatedAt: e.at, resolvedAt: status === 'resolved' ? e.at : null });
    } else if (e.action === 'support.note') {
      map.set(prev.id, { ...prev, updatedAt: e.at, notes: [...prev.notes, { at: e.at, by: e.actor, text: String(d.text) }] });
    }
  }
  const tickets = [...map.values()].sort((a, b) =>
    (a.status === 'resolved' ? 1 : 0) - (b.status === 'resolved' ? 1 : 0) || SLA_ORDER.indexOf(a.priority) - SLA_ORDER.indexOf(b.priority) || a.createdAt.localeCompare(b.createdAt));
  const hours = tickets.filter((t) => t.resolvedAt).map((t) => (Date.parse(t.resolvedAt!) - Date.parse(t.createdAt)) / 36e5).sort((a, b) => a - b);
  const open = tickets.filter((t) => t.status === 'open');
  return {
    tickets,
    totals: {
      open: open.length, waiting: tickets.filter((t) => t.status === 'waiting').length, resolved: tickets.filter((t) => t.status === 'resolved').length,
      urgent: open.filter((t) => t.priority === 'urgent' || t.priority === 'high').length,
      medianHoursToResolve: hours.length ? Math.round(hours[Math.floor(hours.length / 2)] * 10) / 10 : null,
    },
    replyGoal: replyGoal(open.slice(0, 8)),
  };
}

function replyGoal(open: Ticket[]): string {
  const emailable = open.filter((t) => t.channel === 'email' && /@/.test(t.contact));
  if (!open.length) return '';
  const lines = open.map((t) => `- #${t.number} [${t.priority}] ${t.subject}, from ${t.customer}${t.contact ? ` <${t.contact}>` : ''} via ${t.channel}: "${t.notes.at(-1)?.text.slice(0, 400) ?? ''}"`);
  return `Draft a reply for each open ticket below: answer the question accurately and kindly, say what happens next, and never guess. For tickets that arrived by email with an address, queue the reply with send_message (channel "email"); each waits for the owner's approval. For the rest, save the drafts as one note titled "Support: reply drafts". Never give medical, legal or financial advice, and never ask for or repeat medical details: hand those to staff.${emailable.length ? '' : ' None of these can be emailed directly.'}\n${lines.join('\n')}`;
}
