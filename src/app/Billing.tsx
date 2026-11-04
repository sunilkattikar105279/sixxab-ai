// Admin only: a plan per business and monthly invoices (draft → sent → paid, or void), printable as PDF.
import React, { useState } from 'react';
import { api } from '../lib/auth';
import { Spinner } from './ui';
import { useLoad } from './useLoad';

interface Plan { name: string; monthlyFee: number; currency: string }
interface Invoice { id: string; number: string; period: string; currency: string; lines: { description: string; amount: number }[]; total: number; status: string; createdAt: string; sentAt: string | null; paidAt: string | null }
interface Business { orgId: string; name: string | null; location: string | null; plan: Plan | null; invoices: Invoice[] }

const money = (n: number, c: string) => { try { return new Intl.NumberFormat(c === 'INR' ? 'en-IN' : 'en-US', { style: 'currency', currency: c }).format(n); } catch { return `${n} ${c}`; } };
const thisMonth = () => new Date().toISOString().slice(0, 7);
const esc = (s: string) => s.replace(/[&<>"']/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[ch]!);

/** Opens a printable invoice; the browser's Print saves it as PDF. Text is escaped. */
function printInvoice(b: Business, inv: Invoice) {
  const w = window.open('', '_blank', 'noopener=no,width=820,height=1000');
  if (!w) return;
  const rows = inv.lines.map((l) => `<tr><td>${esc(l.description)}</td><td class="r">${esc(money(l.amount, inv.currency))}</td></tr>`).join('');
  w.document.write(`<!doctype html><html><head><meta charset="utf-8"><title>${esc(inv.number)}</title><style>
    body{font-family:system-ui,-apple-system,Segoe UI,sans-serif;color:#111;margin:48px;max-width:720px}
    h1{font-size:28px;margin:0 0 4px} .muted{color:#666} table{width:100%;border-collapse:collapse;margin-top:28px}
    td,th{padding:10px 0;border-bottom:1px solid #ddd;text-align:left} .r{text-align:right} .total td{font-weight:700;border-bottom:0}
    .row{display:flex;justify-content:space-between;gap:24px;margin-top:28px}</style></head><body>
    <h1>Invoice</h1><div class="muted">${esc(inv.number)} · ${esc(inv.period)} · issued ${esc(new Date(inv.createdAt).toLocaleDateString())}</div>
    <div class="row"><div><strong>SIXXAB AI</strong><br><span class="muted">sixxab.ai · sunil.kattikar@gmail.com</span></div>
    <div><strong>Bill to</strong><br>${esc(b.name ?? 'Customer')}${b.location ? `<br><span class="muted">${esc(b.location)}</span>` : ''}</div></div>
    <table><thead><tr><th>Description</th><th class="r">Amount</th></tr></thead><tbody>${rows}
    <tr class="total"><td>Total (${esc(inv.currency)})</td><td class="r">${esc(money(inv.total, inv.currency))}</td></tr></tbody></table>
    <p class="muted" style="margin-top:28px">Status: ${esc(inv.status)}. Taxes are not included unless listed above.</p></body></html>`);
  w.document.close();
  w.focus();
  w.print();
}

export function Billing() {
  const { data, error, reload } = useLoad<{ businesses: Business[] }>('/api/billing');
  if (error) return <p className="error">{error}</p>;
  if (!data) return <Spinner label="Loading billing…" />;
  return (
    <div className="stack">
      <section className="panel glass-card">
        <p className="eyebrow">Billing · admin only</p>
        <h2>Plans and invoices</h2>
        <p className="muted small">Set each business&apos;s plan, draft the monthly invoice, print it as a PDF to send, and mark it paid. Nothing is emailed or charged automatically.</p>
      </section>
      {data.businesses.map((b) => <BusinessBilling key={b.orgId} b={b} onChange={reload} />)}
    </div>
  );
}

function BusinessBilling({ b, onChange }: { b: Business; onChange: () => void }) {
  const [plan, setPlan] = useState({ name: b.plan?.name ?? '', monthlyFee: b.plan ? String(b.plan.monthlyFee) : '', currency: b.plan?.currency ?? 'USD' });
  const [period, setPeriod] = useState(thisMonth());
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);

  async function post(key: string, body: Record<string, unknown>) {
    setBusy(key);
    setMsg(null);
    try {
      await api('/api/billing', { method: 'POST', body: JSON.stringify({ orgId: b.orgId, ...body }) });
      onChange();
    } catch (e) {
      setMsg(e instanceof Error ? e.message : 'Could not update billing');
    } finally {
      setBusy(null);
    }
  }

  const label = b.name ?? b.orgId.slice(0, 8);
  return (
    <section className="panel glass-card">
      <h2>{label}</h2>
      <div className="plan-form">
        <label className="field"><span>Plan</span><input aria-label={`Plan name for ${label}`} placeholder="e.g. Founder, Pilot" value={plan.name} onChange={(e) => setPlan({ ...plan, name: e.target.value })} /></label>
        <label className="field"><span>Monthly fee</span><input aria-label={`Monthly fee for ${label}`} inputMode="decimal" value={plan.monthlyFee} onChange={(e) => setPlan({ ...plan, monthlyFee: e.target.value.replace(/[^\d.]/g, '') })} /></label>
        <label className="field"><span>Currency</span><select aria-label={`Currency for ${label}`} value={plan.currency} onChange={(e) => setPlan({ ...plan, currency: e.target.value })}><option>USD</option><option>INR</option></select></label>
        <button type="button" className="btn-ghost" disabled={!!busy || !plan.name.trim() || plan.monthlyFee === ''} onClick={() => post('plan', { action: 'plan', ...plan })}>{busy === 'plan' ? <Spinner label="Saving…" /> : 'Save plan'}</button>
      </div>
      <div className="plan-form">
        <label className="field"><span>Invoice month</span><input type="month" aria-label={`Invoice month for ${label}`} value={period} onChange={(e) => setPeriod(e.target.value)} /></label>
        <button type="button" className="btn-primary" disabled={!!busy || !b.plan} onClick={() => post('draft', { action: 'draft', period })}>{busy === 'draft' ? <Spinner label="Drafting…" /> : 'Draft invoice'}</button>
      </div>
      {!b.plan && <p className="muted small">Save a plan to start invoicing.</p>}
      {b.invoices.length > 0 && (
        <div className="table-wrap">
          <table>
            <thead><tr><th>Invoice</th><th>Month</th><th>Total</th><th>Status</th><th /></tr></thead>
            <tbody>{b.invoices.map((inv) => (
              <tr key={inv.id}>
                <td>{inv.number}</td><td>{inv.period}</td><td>{money(inv.total, inv.currency)}</td>
                <td><span className={`pill pill-${inv.status === 'paid' ? 'done' : inv.status === 'void' ? 'failed' : 'awaiting_approval'}`}>{inv.status}</span></td>
                <td className="nowrap">
                  <button type="button" className="btn-mini" onClick={() => printInvoice(b, inv)}>Print</button>
                  {inv.status === 'draft' && <button type="button" className="btn-mini" disabled={!!busy} onClick={() => post(inv.id, { action: 'status', invoiceId: inv.id, status: 'sent' })}>Mark sent</button>}
                  {(inv.status === 'draft' || inv.status === 'sent') && <button type="button" className="btn-mini" disabled={!!busy} onClick={() => post(inv.id, { action: 'status', invoiceId: inv.id, status: 'paid' })}>Mark paid</button>}
                  {inv.status !== 'paid' && inv.status !== 'void' && <button type="button" className="btn-mini" disabled={!!busy} onClick={() => post(inv.id, { action: 'status', invoiceId: inv.id, status: 'void' })}>Void</button>}
                </td>
              </tr>
            ))}</tbody>
          </table>
        </div>
      )}
      {msg && <p className="error" role="alert">{msg}</p>}
    </section>
  );
}
