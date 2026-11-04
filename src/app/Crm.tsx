// CRM tab: contacts and deals by stage, quick stage moves, CSV import and agent follow-ups.
import React, { useState } from 'react';
import { Spinner } from './ui';
import { useLoad } from './useLoad';
import { AgentRun, money, usePost } from './AgentRun';

interface Contact { id: string; name: string; company: string; email: string; phone: string; source: string; value: number; nextStep: string; notes: string; stage: string; lastTouch: string | null; createdAt: string }
interface CrmState { contacts: Contact[]; pipeline: Record<string, number>; totals: { open: number; openValue: number; won: number; wonValue: number; winRate: number | null; followUps: number }; followUpGoal: string }

const STAGES = ['lead', 'contacted', 'qualified', 'proposal', 'won', 'lost'];
const SOURCES = ['website', 'referral', 'linkedin', 'whatsapp', 'walk-in', 'event', 'other'];
const EMPTY = { name: '', company: '', email: '', phone: '', source: 'website', value: '', nextStep: '' };
const since = (iso: string | null) => (iso ? `${Math.max(0, Math.round((Date.now() - Date.parse(iso)) / 864e5))}d ago` : 'never');

export function Crm({ goApprovals }: { goApprovals: () => void }) {
  const { data, error, reload } = useLoad<{ crm: CrmState }>('/api/crm');
  const { busy, msg, post } = usePost('/api/crm', reload);
  const [f, setF] = useState(EMPTY);
  const [csv, setCsv] = useState('');
  const [filter, setFilter] = useState('open');
  if (error) return <p className="error">{error}</p>;
  if (!data) return <Spinner label="Loading your CRM…" />;
  const { crm } = data;
  const t = crm.totals;
  const shown = crm.contacts.filter((c) => (filter === 'open' ? !['won', 'lost'].includes(c.stage) : filter === 'all' ? true : c.stage === filter));

  return (
    <div className="stack">
      <section className="panel glass-card">
        <p className="eyebrow">CRM · Sales CRM agent</p>
        <h2>Pipeline</h2>
        <div className="cost-tiles">
          <div><span className="muted small">Open deals</span><strong>{t.open}</strong><span className="muted small">{money(t.openValue)} in play</span></div>
          <div><span className="muted small">Won</span><strong>{t.won}</strong><span className="muted small">{money(t.wonValue)}</span></div>
          <div><span className="muted small">Win rate</span><strong>{t.winRate === null ? '—' : `${t.winRate}%`}</strong></div>
          <div><span className="muted small">Need a follow-up</span><strong>{t.followUps}</strong><span className="muted small">quiet 7+ days</span></div>
        </div>
        <AgentRun agentId="sales-crm" goal={crm.followUpGoal} label={`Draft ${t.followUps} follow-up${t.followUps === 1 ? '' : 's'}`} emptyText="No open deal with an email has gone quiet for a week." goApprovals={goApprovals} />
      </section>

      <section className="panel glass-card">
        <h2>Add a contact</h2>
        <form className="form" onSubmit={async (e) => { e.preventDefault(); if (await post('add', { action: 'contact', contact: f })) setF(EMPTY); }}>
          <div className="grid3">
            <label className="field"><span>Name</span><input value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} maxLength={120} /></label>
            <label className="field"><span>Company</span><input value={f.company} onChange={(e) => setF({ ...f, company: e.target.value })} maxLength={120} /></label>
            <label className="field"><span>Email</span><input type="email" value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} /></label>
            <label className="field"><span>Phone</span><input type="tel" value={f.phone} onChange={(e) => setF({ ...f, phone: e.target.value })} /></label>
            <label className="field"><span>Source</span><select value={f.source} onChange={(e) => setF({ ...f, source: e.target.value })}>{SOURCES.map((s) => <option key={s}>{s}</option>)}</select></label>
            <label className="field"><span>Deal value</span><input inputMode="numeric" value={f.value} onChange={(e) => setF({ ...f, value: e.target.value.replace(/[^\d.]/g, '') })} /></label>
          </div>
          <label className="field"><span>Next step</span><input value={f.nextStep} onChange={(e) => setF({ ...f, nextStep: e.target.value })} maxLength={200} placeholder="e.g. send price list on Friday" /></label>
          <div className="row-end"><button type="submit" className="btn-primary" disabled={!!busy || !f.name.trim()}>{busy === 'add' ? <Spinner label="Saving…" /> : 'Add contact'}</button></div>
        </form>
        <details>
          <summary>Import a list <span className="muted small">CSV: name, company, email, phone, source, value</span></summary>
          <textarea aria-label="Contacts CSV" rows={4} value={csv} onChange={(e) => setCsv(e.target.value)} placeholder="Asha Rao,Rao Clinic,asha@example.com,+91 98xxxxxx,referral,5000" />
          <div className="row-end"><button type="button" className="btn-ghost" disabled={!!busy || !csv.trim()} onClick={async () => { if (await post('import', { action: 'import', csv })) setCsv(''); }}>Import</button></div>
        </details>
        {msg && <p className="error" role="alert">{msg}</p>}
      </section>

      <section className="panel glass-card">
        <div className="row-between">
          <h2>Contacts</h2>
          <select aria-label="Show" value={filter} onChange={(e) => setFilter(e.target.value)}>
            <option value="open">Open deals</option><option value="all">All</option>{STAGES.map((s) => <option key={s} value={s}>{s} ({crm.pipeline[s] ?? 0})</option>)}
          </select>
        </div>
        {shown.length === 0 ? <p className="muted small">No contacts here yet.</p> : (
          <div className="table-wrap">
            <table>
              <thead><tr><th>Name</th><th>Value</th><th>Stage</th><th>Last touch</th><th>Next step</th><th /></tr></thead>
              <tbody>{shown.map((c) => (
                <tr key={c.id}>
                  <td><strong>{c.name}</strong>{c.company ? <span className="muted small"> · {c.company}</span> : null}<br /><span className="muted small">{c.email || c.phone || c.source}</span></td>
                  <td>{c.value ? money(c.value) : '—'}</td>
                  <td><select aria-label={`Stage for ${c.name}`} value={c.stage} disabled={!!busy} onChange={(e) => post(c.id, { action: 'stage', contactId: c.id, stage: e.target.value })}>{STAGES.map((s) => <option key={s}>{s}</option>)}</select></td>
                  <td className="nowrap">{since(c.lastTouch)}</td>
                  <td>{c.nextStep || <span className="muted small">—</span>}</td>
                  <td className="nowrap">
                    <button type="button" className="btn-mini" disabled={!!busy} onClick={() => post(c.id, { action: 'touch', contactId: c.id, note: 'Spoke today' })}>Spoke today</button>
                    <button type="button" className="btn-mini" disabled={!!busy} onClick={() => post(c.id, { action: 'remove', contactId: c.id })}>Remove</button>
                  </td>
                </tr>
              ))}</tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
