// Accounts tab: record income and expenses, see this month's profit and loss and the last 12 months;
// the Accounting agent writes the monthly review. Nothing here moves money.
import React, { useState } from 'react';
import { Spinner } from './ui';
import { useLoad } from './useLoad';
import { AgentRun, money, usePost } from './AgentRun';

interface Entry { id: string; kind: 'income' | 'expense'; date: string; amount: number; category: string; party: string; note: string }
interface Month { month: string; income: number; expenses: number; profit: number; margin: number | null }
interface AccountsState { currency: string; entries: Entry[]; months: Month[]; thisMonth: Month; expensesByCategory: { category: string; amount: number }[]; reviewGoal: string }

const INCOME = ['sales', 'services', 'subscriptions', 'other income'];
const EXPENSE = ['salaries', 'rent', 'marketing', 'software', 'supplies', 'travel', 'professional fees', 'taxes', 'other'];
const today = () => new Date().toISOString().slice(0, 10);

export function Accounts({ goApprovals }: { goApprovals: () => void }) {
  const { data, error, reload } = useLoad<{ accounts: AccountsState }>('/api/accounts');
  const { busy, msg, post } = usePost('/api/accounts', reload);
  const [csv, setCsv] = useState('');
  const [f, setF] = useState({ kind: 'income' as 'income' | 'expense', date: today(), amount: '', category: 'sales', party: '', note: '' });
  if (error) return <p className="error">{error}</p>;
  if (!data) return <Spinner label="Loading your books…" />;
  const a = data.accounts;
  const c = a.currency;
  const m = a.thisMonth;

  return (
    <div className="stack">
      <section className="panel glass-card">
        <p className="eyebrow">Accounts · Accounting agent</p>
        <h2>This month</h2>
        <div className="cost-tiles">
          <div><span className="muted small">Income</span><strong>{money(m.income, c)}</strong></div>
          <div><span className="muted small">Expenses</span><strong>{money(m.expenses, c)}</strong></div>
          <div><span className="muted small">Profit</span><strong>{money(m.profit, c)}</strong>{m.margin !== null && <span className="muted small">{m.margin}% margin</span>}</div>
          <div><span className="muted small">Biggest cost</span><strong>{a.expensesByCategory[0] ? a.expensesByCategory[0].category : '—'}</strong>{a.expensesByCategory[0] && <span className="muted small">{money(a.expensesByCategory[0].amount, c)}</span>}</div>
        </div>
        <AgentRun agentId="accountant" goal={a.reviewGoal} label="Write the monthly review" emptyText="Record income and expenses and the Accounting agent will review them." goApprovals={goApprovals} />
        <p className="muted small">A management view of your books, not tax or legal advice. Revenue for your journey stages is still recorded on the Journey tab.</p>
      </section>

      <section className="panel glass-card">
        <h2>Record income or an expense</h2>
        <form className="form" onSubmit={async (e) => { e.preventDefault(); if (await post('add', { action: 'entry', entry: f })) setF({ ...f, amount: '', party: '', note: '' }); }}>
          <div className="grid3">
            <label className="field"><span>Type</span><select value={f.kind} onChange={(e) => { const kind = e.target.value as 'income' | 'expense'; setF({ ...f, kind, category: kind === 'income' ? 'sales' : 'other' }); }}><option value="income">Income</option><option value="expense">Expense</option></select></label>
            <label className="field"><span>Date</span><input type="date" value={f.date} onChange={(e) => setF({ ...f, date: e.target.value })} /></label>
            <label className="field"><span>Amount ({c})</span><input inputMode="decimal" value={f.amount} onChange={(e) => setF({ ...f, amount: e.target.value.replace(/[^\d.]/g, '') })} /></label>
            <label className="field"><span>Category</span><select value={f.category} onChange={(e) => setF({ ...f, category: e.target.value })}>{(f.kind === 'income' ? INCOME : EXPENSE).map((x) => <option key={x}>{x}</option>)}</select></label>
            <label className="field"><span>{f.kind === 'income' ? 'From' : 'Paid to'}</span><input value={f.party} onChange={(e) => setF({ ...f, party: e.target.value })} maxLength={120} /></label>
            <label className="field"><span>Note</span><input value={f.note} onChange={(e) => setF({ ...f, note: e.target.value })} maxLength={300} /></label>
          </div>
          <div className="row-end"><button type="submit" className="btn-primary" disabled={!!busy || !f.amount}>{busy === 'add' ? <Spinner label="Saving…" /> : 'Record'}</button></div>
        </form>
        <details>
          <summary>Import a bank statement <span className="muted small">CSV: date, description, amount (money out below zero)</span></summary>
          <textarea aria-label="Bank statement CSV" rows={4} value={csv} onChange={(e) => setCsv(e.target.value)} placeholder="2026-11-02,UPI payment received from Patel,15000&#10;2026-11-03,Office rent November,-30000" />
          <p className="muted small">Lines are sorted into categories automatically; anything unclear is marked "other" for the Accounting agent to suggest. Lines already in the ledger are skipped.</p>
          <div className="row-end"><button type="button" className="btn-ghost" disabled={!!busy || !csv.trim()} onClick={async () => { if (await post('import', { action: 'import', csv })) setCsv(''); }}>Import statement</button></div>
        </details>
        {msg && <p className="error" role="alert">{msg}</p>}
      </section>

      {a.months.length > 0 && (
        <section className="panel glass-card">
          <h2>Profit and loss by month</h2>
          <div className="table-wrap"><table>
            <thead><tr><th>Month</th><th>Income</th><th>Expenses</th><th>Profit</th><th>Margin</th></tr></thead>
            <tbody>{a.months.map((x) => <tr key={x.month}><td>{x.month}</td><td>{money(x.income, c)}</td><td>{money(x.expenses, c)}</td><td>{money(x.profit, c)}</td><td>{x.margin === null ? '—' : `${x.margin}%`}</td></tr>)}</tbody>
          </table></div>
        </section>
      )}

      <section className="panel glass-card">
        <h2>Ledger</h2>
        {a.entries.length === 0 ? <p className="muted small">No entries yet.</p> : (
          <div className="table-wrap"><table>
            <thead><tr><th>Date</th><th>Type</th><th>Category</th><th>Who</th><th>Amount</th><th /></tr></thead>
            <tbody>{a.entries.slice(0, 100).map((e) => (
              <tr key={e.id}>
                <td className="nowrap">{e.date}</td><td>{e.kind}</td><td>{e.category}</td><td>{e.party || <span className="muted small">—</span>}{e.note ? <span className="muted small"> · {e.note}</span> : null}</td>
                <td className="nowrap">{e.kind === 'expense' ? '−' : ''}{money(e.amount, c)}</td>
                <td><button type="button" className="btn-mini" disabled={!!busy} onClick={() => post(e.id, { action: 'remove', entryId: e.id })}>Remove</button></td>
              </tr>
            ))}</tbody>
          </table></div>
        )}
      </section>
    </div>
  );
}
