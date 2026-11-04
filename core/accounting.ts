// Accounting: a simple income and expense ledger for one business, with a monthly profit and loss,
// as append-only audit events. The Accounting agent explains the numbers; it never moves money.
import { newId, nowIso, type Store } from './store.js';
import type { AuditEvent } from './types.js';

export const INCOME_CATEGORIES = ['sales', 'services', 'subscriptions', 'other income'] as const;
export const EXPENSE_CATEGORIES = ['salaries', 'rent', 'marketing', 'software', 'supplies', 'travel', 'professional fees', 'taxes', 'other'] as const;
export type EntryKind = 'income' | 'expense';

export interface EntryInput { kind: EntryKind; date: string; amount: number | string; category: string; party?: string; note?: string }
export interface Entry { id: string; kind: EntryKind; date: string; amount: number; category: string; party: string; note: string; recordedAt: string }
export interface MonthPnl { month: string; income: number; expenses: number; profit: number; margin: number | null }
export interface AccountsState {
  currency: string;
  entries: Entry[];
  months: MonthPnl[];
  thisMonth: MonthPnl;
  expensesByCategory: { category: string; amount: number }[];
  reviewGoal: string;
}

export const ACCOUNT_EVENTS = ['acct.entry', 'acct.removed'];
const DATE_RE = /^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/;
const MAX_AMOUNT = 1e11;
const round2 = (n: number) => Math.round(n * 100) / 100;

const text = (v: unknown, max: number) => String(v ?? '').trim().slice(0, max);
const record = (store: Store, orgId: string, by: string, action: string, detail: Record<string, unknown>) =>
  store.audit({ id: newId(), orgId, at: nowIso(), actor: by, action, taskId: null, detail });

export async function addEntry(store: Store, orgId: string, input: EntryInput, by: string, currency = 'USD'): Promise<AccountsState> {
  if (input.kind !== 'income' && input.kind !== 'expense') throw new Error('kind must be income or expense');
  const date = text(input.date, 10);
  if (!DATE_RE.test(date)) throw new Error('date must look like 2026-11-04');
  const amount = Number(String(input.amount).replace(/[,$₹\s]/g, ''));
  if (!Number.isFinite(amount) || amount <= 0 || amount > MAX_AMOUNT) throw new Error('amount must be more than zero');
  const cats: readonly string[] = input.kind === 'income' ? INCOME_CATEGORIES : EXPENSE_CATEGORIES;
  const category = cats.includes(input.category) ? input.category : input.kind === 'income' ? 'other income' : 'other';
  const entry = { id: newId(), kind: input.kind, date, amount: round2(amount), category, party: text(input.party, 120), note: text(input.note, 300) };
  await record(store, orgId, by, 'acct.entry', { entry, summary: `${input.kind === 'income' ? 'Income' : 'Expense'} recorded: ${entry.amount} ${currency} (${category})` });
  return loadAccounts(store, orgId, currency);
}

export async function removeEntry(store: Store, orgId: string, id: string, by: string, currency = 'USD'): Promise<AccountsState> {
  await record(store, orgId, by, 'acct.removed', { entryId: id, summary: 'Ledger entry removed' });
  return loadAccounts(store, orgId, currency);
}

export async function loadAccounts(store: Store, orgId: string, currency = 'USD', today = new Date()): Promise<AccountsState> {
  return computeAccounts(await store.listAuditByActions(orgId, ACCOUNT_EVENTS), currency, today);
}

export function computeAccounts(events: AuditEvent[], currency = 'USD', today = new Date()): AccountsState {
  const map = new Map<string, Entry>();
  for (const e of events) {
    if (e.action === 'acct.entry') {
      const en = e.detail.entry as Omit<Entry, 'recordedAt'>;
      map.set(en.id, { ...en, recordedAt: e.at });
    } else if (e.action === 'acct.removed') map.delete(String(e.detail.entryId));
  }
  const entries = [...map.values()].sort((a, b) => b.date.localeCompare(a.date) || b.recordedAt.localeCompare(a.recordedAt));
  const byMonth = new Map<string, { income: number; expenses: number }>();
  for (const en of entries) {
    const m = en.date.slice(0, 7);
    const cur = byMonth.get(m) ?? { income: 0, expenses: 0 };
    if (en.kind === 'income') cur.income += en.amount;
    else cur.expenses += en.amount;
    byMonth.set(m, cur);
  }
  const pnl = (month: string): MonthPnl => {
    const v = byMonth.get(month) ?? { income: 0, expenses: 0 };
    const profit = round2(v.income - v.expenses);
    return { month, income: round2(v.income), expenses: round2(v.expenses), profit, margin: v.income ? Math.round((profit / v.income) * 100) : null };
  };
  const months = [...byMonth.keys()].sort().reverse().slice(0, 12).map(pnl);
  const current = today.toISOString().slice(0, 7);
  const cats = new Map<string, number>();
  for (const en of entries) if (en.kind === 'expense' && en.date.startsWith(current)) cats.set(en.category, (cats.get(en.category) ?? 0) + en.amount);
  const expensesByCategory = [...cats.entries()].map(([category, amount]) => ({ category, amount: round2(amount) })).sort((a, b) => b.amount - a.amount);
  return { currency, entries, months, thisMonth: pnl(current), expensesByCategory, reviewGoal: reviewGoal(months, currency) };
}

function reviewGoal(months: MonthPnl[], currency: string): string {
  if (!months.length) return '';
  const lines = months.slice(0, 6).map((m) => `- ${m.month}: income ${m.income}, expenses ${m.expenses}, profit ${m.profit}${m.margin === null ? '' : ` (${m.margin}% margin)`}`);
  return `Write this month's finance review for the owner from the recorded ledger below (amounts in ${currency}): profit and loss, the trend against earlier months, the three biggest costs and whether each is worth it, cash to watch, and two concrete actions. Use only these numbers; mark anything missing. This is not tax or legal advice. Save it as a note titled "Finance: monthly review".\n${lines.join('\n')}`;
}
