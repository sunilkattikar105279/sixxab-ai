// Billing: a plan per business and monthly invoices with draft → sent → paid (or void) status.
// Records are append-only audit events in the business's workspace. Nothing is emailed or
// charged here; the admin sends the printable invoice and marks it paid.
import { newId, nowIso, type Store } from './store.js';
import type { Plan } from './governance.js';

export type InvoiceStatus = 'draft' | 'sent' | 'paid' | 'void';
export interface Invoice {
  id: string; number: string; orgId: string; period: string; currency: string;
  lines: { description: string; amount: number }[]; total: number;
  status: InvoiceStatus; createdAt: string; sentAt: string | null; paidAt: string | null;
}

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const CURRENCIES = ['USD', 'INR'];

export async function setPlan(store: Store, orgId: string, plan: Plan, by: string): Promise<void> {
  const name = String(plan.name ?? '').trim().slice(0, 60);
  const fee = Number(plan.monthlyFee);
  if (!name || !Number.isFinite(fee) || fee < 0 || !CURRENCIES.includes(plan.currency)) throw new Error('A plan needs a name, a monthly fee of zero or more, and USD or INR');
  await store.audit({ id: newId(), orgId, at: nowIso(), actor: by, action: 'billing.plan', taskId: null, detail: { name, monthlyFee: fee, currency: plan.currency, summary: `Plan set: ${name}, ${fee} ${plan.currency} a month` } });
}

export async function loadPlan(store: Store, orgId: string): Promise<Plan | null> {
  const last = (await store.listAuditByActions(orgId, ['billing.plan'])).at(-1);
  return last ? { name: String(last.detail.name), monthlyFee: Number(last.detail.monthlyFee), currency: String(last.detail.currency) } : null;
}

export async function listInvoices(store: Store, orgId: string): Promise<Invoice[]> {
  const events = await store.listAuditByActions(orgId, ['invoice.drafted', 'invoice.status']);
  const map = new Map<string, Invoice>();
  for (const e of events) {
    const d = e.detail;
    if (e.action === 'invoice.drafted') {
      map.set(String(d.invoiceId), {
        id: String(d.invoiceId), number: String(d.number), orgId, period: String(d.period), currency: String(d.currency),
        lines: d.lines as Invoice['lines'], total: Number(d.total), status: 'draft', createdAt: e.at, sentAt: null, paidAt: null,
      });
    } else {
      const inv = map.get(String(d.invoiceId));
      if (!inv) continue;
      inv.status = d.status as InvoiceStatus;
      if (d.status === 'sent') inv.sentAt = e.at;
      if (d.status === 'paid') inv.paidAt = e.at;
    }
  }
  return [...map.values()].sort((a, b) => (a.period < b.period ? 1 : -1));
}

/** Drafts the plan invoice for a month; the same business and month always return the same invoice. */
export async function draftInvoice(store: Store, orgId: string, period: string, by: string): Promise<Invoice> {
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(period)) throw new Error('period must look like 2026-11');
  const existing = (await listInvoices(store, orgId)).find((i) => i.period === period && i.status !== 'void');
  if (existing) return existing;
  const plan = await loadPlan(store, orgId);
  if (!plan) throw new Error('Set a plan for this business before invoicing');
  const id = newId();
  const number = `SIX-${period.replace('-', '')}-${orgId.replace(/-/g, '').slice(0, 6).toUpperCase()}`;
  const lines = [{ description: `${plan.name} plan, ${MONTHS[Number(period.slice(5)) - 1]} ${period.slice(0, 4)}`, amount: plan.monthlyFee }];
  const total = lines.reduce((s, l) => s + l.amount, 0);
  await store.audit({ id: newId(), orgId, at: nowIso(), actor: by, action: 'invoice.drafted', taskId: null, detail: { invoiceId: id, number, period, currency: plan.currency, lines, total, summary: `Invoice ${number} drafted: ${total} ${plan.currency}` } });
  return (await listInvoices(store, orgId)).find((i) => i.id === id)!;
}

export async function setInvoiceStatus(store: Store, orgId: string, invoiceId: string, status: Exclude<InvoiceStatus, 'draft'>, by: string): Promise<Invoice> {
  if (!['sent', 'paid', 'void'].includes(status)) throw new Error('status must be sent, paid or void');
  const inv = (await listInvoices(store, orgId)).find((i) => i.id === invoiceId);
  if (!inv) throw new Error('Invoice not found');
  await store.audit({ id: newId(), orgId, at: nowIso(), actor: by, action: 'invoice.status', taskId: null, detail: { invoiceId, status, summary: `Invoice ${inv.number} marked ${status}` } });
  return (await listInvoices(store, orgId)).find((i) => i.id === invoiceId)!;
}
