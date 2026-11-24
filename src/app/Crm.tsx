// CRM tab: pipeline board, contacts and deals by stage with their lead research, CSV import, the lead
// generation agents (ICP, prospects, scoring, outreach drafts, CRM Sync) and agent follow-ups.
import React, { useState } from 'react';
import { Spinner } from './ui';
import { useLoad } from './useLoad';
import { AgentRun, money, usePost } from './AgentRun';
import { DealPanel } from './DealPanel';
import { pipelineReviewGoal, type Meddic } from '../../core/gtm';
import { ApolloSearch } from './ApolloSearch';
import { api } from '../lib/auth';
import { fileToCsv } from '../lib/sheet';
import { CustomerPage, STAGES, stageName, webHref, type Contact } from './Customer';
import { LeadAgents, type LeadgenState } from './LeadAgents';
import { SalesFlow } from './SalesFlow';
import type { FlowOrg, FlowStage, NextAction } from '../../core/salesflow-state';

interface CrmState extends LeadgenState { contacts: Contact[]; flowOrg: FlowOrg; flowCounts: Record<FlowStage, number>; nextActions: NextAction[]; pipeline: Record<string, number>; totals: { open: number; openValue: number; won: number; wonValue: number; winRate: number | null; followUps: number }; followUpGoal: string; newLeads?: number; speedGoal?: string }

/** Everything the lead research recorded about a business, shown when a deal is opened. */
export function LeadDetails({ c }: { c: Contact }) {
  const facts: [string, React.ReactNode][] = [
    ['Rank', c.rank ?? ''], ['Niche', c.niche], ['City', c.city],
    ['Website', c.website ? <a href={webHref(c.website)} target="_blank" rel="noopener noreferrer">{c.website}</a> : ''],
    ['Phone', c.phone], ['Size', c.size], ['Decision maker', [c.name, c.title].filter(Boolean).join(', ')],
    ['Deal size', c.dealTier], ['Ease of win', c.ease], ['Source', c.sourceDetail || c.source],
  ];
  const long: [string, string | undefined][] = [['Why they fit', c.whyFit], ['Agent to pitch', c.pitch], ['Check before outreach', c.checkFirst], ['Notes', c.notes]];
  return (
    <div className="stack-sm lead-details">
      <strong>Lead research</strong>
      <dl className="lead-facts">{facts.filter(([, v]) => v !== '' && v != null).map(([k, v]) => <div key={k}><dt>{k}</dt><dd>{v}</dd></div>)}</dl>
      {long.filter(([, v]) => v).map(([k, v]) => <p key={k} className="small"><span className="muted">{k}: </span>{v}</p>)}
    </div>
  );
}

/** Pipeline board: one column per stage, a card per deal, moved with its stage menu. */
export function Board({ contacts, busy, move, open }: { contacts: Contact[]; busy: boolean; move: (c: Contact, stage: string) => void; open: (c: Contact) => void }) {
  return (
    <div className="board" role="list" aria-label="Pipeline board">
      {STAGES.map((s) => {
        const list = contacts.filter((c) => c.stage === s);
        return (
          <div key={s} className="board-col" role="listitem">
            <div className="board-head"><strong>{stageName(s)}</strong><span className="muted small">{list.length}</span></div>
            <div className="board-cards">
              {list.length === 0 ? <p className="muted small">Nothing here.</p> : list.map((c) => (
                <div key={c.id} className="board-card">
                  <button type="button" className="board-open" aria-label={`Open ${c.company || c.name}`} onClick={() => open(c)}>
                    <span className="row-between" style={{ width: '100%' }}><strong className="small">{c.company || c.name}</strong>{c.rank ? <span className="muted small">#{c.rank}</span> : null}</span>
                    {c.company && c.name !== c.company ? <span className="small">{c.name}</span> : null}
                    {(c.niche || c.city) && <span className="muted small">{[c.niche, c.city].filter(Boolean).join(' · ')}</span>}
                    {(c.dealTier || c.ease || c.value > 0) && <span className="muted small">{[c.value > 0 && money(c.value), c.dealTier && `Deal ${c.dealTier}`, c.ease && `Win ${c.ease}`].filter(Boolean).join(' · ')}</span>}
                    {(c.leadScore || c.sequence) && <span className="muted small">{[c.leadScore && `Score ${c.leadScore.score} ${c.leadScore.grade}`, c.sequence && `Outreach ${c.sequence.steps.filter((x) => x.sentAt).length}/${c.sequence.steps.length} sent`].filter(Boolean).join(' · ')}</span>}
                    <span className="muted small">Tap to open the full record</span>
                  </button>
                  <select aria-label={`Move ${c.name}`} value={c.stage} disabled={busy} onChange={(e) => move(c, e.target.value)}>{STAGES.map((x) => <option key={x} value={x}>{stageName(x)}</option>)}</select>
                </div>
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}
const SOURCES = ['website', 'referral', 'linkedin', 'whatsapp', 'walk-in', 'event', 'other'];
const EMPTY = { name: '', company: '', email: '', phone: '', source: 'website', value: '', nextStep: '' };
const since = (iso: string | null) => (iso ? `${Math.max(0, Math.round((Date.now() - Date.parse(iso)) / 864e5))}d ago` : 'never');

export function Crm({ goApprovals }: { goApprovals: () => void }) {
  const { data, error, reload } = useLoad<{ crm: CrmState; apollo?: boolean; admin?: boolean }>('/api/crm');
  const { busy, msg, post } = usePost('/api/crm', reload);
  const [f, setF] = useState(EMPTY);
  const [csv, setCsv] = useState('');
  const [filter, setFilter] = useState('open');
  const [openId, setOpenId] = useState<string | null>(null);
  const [importing, setImporting] = useState(false);
  const [importMsg, setImportMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [fileName, setFileName] = useState('');
  const [customerId, setCustomerId] = useState<string | null>(null);
  async function importCsv(text: string): Promise<boolean> {
    setImporting(true);
    setImportMsg(null);
    try {
      const r = await api<{ added: number; skipped: number; duplicates?: number; updated?: number }>('/api/crm', { method: 'POST', body: JSON.stringify({ action: 'import', csv: text }) });
      const summary = `Added ${r.added} contact${r.added === 1 ? '' : 's'}${r.updated ? `, filled in details for ${r.updated}` : ''}${r.duplicates ? `, ${r.duplicates} already in the CRM` : ''}${r.skipped ? `, ${r.skipped} row${r.skipped === 1 ? '' : 's'} skipped` : ''}.`;
      setImportMsg({ ok: r.added > 0 || !!r.duplicates || !!r.updated, text: r.added === 0 && !r.duplicates && !r.updated ? `${summary} No row had a name or business we could read. Check the first row holds the column headers.` : summary });
      reload();
      return r.added > 0 || !!r.duplicates || !!r.updated;
    } catch (e) {
      setImportMsg({ ok: false, text: e instanceof Error ? e.message : 'Could not import the list.' });
      return false;
    } finally {
      setImporting(false);
    }
  }
  if (error) return <p className="error">{error}</p>;
  if (!data) return <Spinner label="Loading your CRM…" />;
  const { crm } = data;
  const t = crm.totals;
  const customer = customerId ? crm.contacts.find((c) => c.id === customerId) : undefined;
  const openCustomer = (c: Contact) => { setCustomerId(c.id); window.scrollTo?.({ top: 0 }); };
  if (customer) return <CustomerPage key={customer.id} c={customer} busy={!!busy} msg={msg} post={post} back={() => setCustomerId(null)} goApprovals={goApprovals} reload={reload} actions={(crm.nextActions ?? []).filter((a) => a.contactId === customer.id)} />;
  const shown = crm.contacts.filter((c) => (filter === 'open' ? !['won', 'lost'].includes(c.stage) : filter === 'all' ? true : c.stage === filter));

  return (
    <div className="stack">
      <SalesFlow crm={crm} busy={!!busy} post={post} reload={reload} goApprovals={goApprovals} open={openCustomer} admin={data.admin} />
      {msg && <p className="error" role="alert">{msg}</p>}

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
        <p className="eyebrow">Pipeline board</p>
        <h2>Deals by stage</h2>
        <p className="muted small">Tap a card to open the customer's full record: data, research and history.</p>
        <Board contacts={crm.contacts} busy={!!busy} move={(c, stage) => post(c.id, { action: 'stage', contactId: c.id, stage })} open={openCustomer} />
      </section>

      <section className="panel glass-card">
        <p className="eyebrow">Go-to-market · Head of GTM</p>
        <h2>Weekly pipeline review</h2>
        <p className="muted small">Focus deals, stuck deals and the forecast weighted by each deal's MEDDIC score. Open a contact below to prep a call, debrief it, send the follow-up or answer an objection.</p>
        <AgentRun agentId="head-of-gtm" goal={pipelineReviewGoal(crm.contacts)} label="Run the weekly review" emptyText="Add an open deal to review the pipeline." goApprovals={goApprovals} />
      </section>

      {data.apollo && <ApolloSearch onImported={reload} />}

      <LeadAgents crm={crm} busy={!!busy} post={post} reload={reload} goApprovals={goApprovals} />

      <section className="panel glass-card">
        <p className="eyebrow">New business · Speed-to-Lead</p>
        <h2>Answer new leads</h2>
        <AgentRun agentId="speed-to-lead" goal={crm.speedGoal ?? ''} label={`Reply to ${crm.newLeads ?? 0} new lead${crm.newLeads === 1 ? '' : 's'}`} emptyText="No new leads from the last 48 hours are waiting for a first reply." goApprovals={goApprovals} />
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
        <details open>
          <summary>Import a list <span className="muted small">Excel (.xlsx) or CSV file, or rows pasted from a spreadsheet</span></summary>
          <p className="muted small">Columns are matched by their header, so a lead sheet with Rank, Business, Niche, City, Website, Main phone, Size, Decision maker, Deal size, Ease of win, Why they fit, Agent to pitch, Source and Check before outreach keeps every column, and Pain points, Offer, Outreach angle and Research columns are kept too. Importing a list again never duplicates anyone: it only fills in details a customer is missing.</p>
          <label className="field"><span>Choose a file</span><input type="file" accept=".xlsx,.csv,.tsv,.txt,text/csv,text/plain,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" onChange={async (e) => {
            const file = e.target.files?.[0];
            e.target.value = '';
            if (!file) return;
            setImportMsg(null);
            try {
              const text = await fileToCsv(file);
              setCsv(text);
              setFileName(file.name);
              const rows = text.split(/\r?\n/).filter((l) => l.trim()).length;
              setImportMsg({ ok: true, text: `Loaded ${file.name}: ${Math.max(0, rows - 1)} rows under the header. Press Import to add them.` });
            } catch (err) {
              setImportMsg({ ok: false, text: err instanceof Error ? err.message : 'Could not read that file.' });
            }
          }} /></label>
          <textarea aria-label="Contacts CSV" rows={4} value={csv} onChange={(e) => { setCsv(e.target.value); setFileName(''); }} placeholder="Or paste rows here, header row first" />
          <div className="row-end"><button type="button" className={csv.trim() ? 'btn-primary' : 'btn-ghost'} disabled={!!busy || importing || !csv.trim()} onClick={async () => { if (await importCsv(csv)) { setCsv(''); setFileName(''); } }}>{importing ? <Spinner label="Importing…" /> : fileName ? `Import ${fileName}` : 'Import'}</button></div>
          {importMsg && <p className={importMsg.ok ? 'small' : 'error'} role={importMsg.ok ? 'status' : 'alert'}>{importMsg.text}</p>}
        </details>
        {msg && <p className="error" role="alert">{msg}</p>}
      </section>

      <section className="panel glass-card">
        <div className="row-between">
          <h2>Contacts</h2>
          <select aria-label="Show" value={filter} onChange={(e) => setFilter(e.target.value)}>
            <option value="open">Open deals</option><option value="all">All</option>{STAGES.map((s) => <option key={s} value={s}>{stageName(s)} ({crm.pipeline[s] ?? 0})</option>)}
          </select>
        </div>
        {shown.length === 0 ? <p className="muted small">No contacts here yet.</p> : (
          <div className="table-wrap">
            <table>
              <thead><tr><th>Name</th><th>Value</th><th>Stage</th><th>MEDDIC</th><th>Last touch</th><th>Next step</th><th /></tr></thead>
              <tbody>{shown.map((c) => (
                <React.Fragment key={c.id}>
                <tr>
                  <td><strong>{c.name}</strong>{c.company && c.company !== c.name ? <span className="muted small"> · {c.company}</span> : null}<br /><span className="muted small">{[c.leadScore && `Score ${c.leadScore.score} ${c.leadScore.grade}`, [c.niche, c.city].filter(Boolean).join(' · ') || c.email || c.phone || c.source].filter(Boolean).join(' · ')}</span></td>
                  <td>{c.value ? money(c.value) : '—'}</td>
                  <td><select aria-label={`Stage for ${c.name}`} value={c.stage} disabled={!!busy} onChange={(e) => post(c.id, { action: 'stage', contactId: c.id, stage: e.target.value })}>{STAGES.map((s) => <option key={s} value={s}>{stageName(s)}</option>)}</select></td>
                  <td>{c.score == null ? <span className="muted small">—</span> : `${c.score}%`}</td>
                  <td className="nowrap">{since(c.lastTouch)}</td>
                  <td>{c.nextStep || <span className="muted small">—</span>}</td>
                  <td className="nowrap">
                    <button type="button" className="btn-mini" aria-label={`Open record for ${c.name}`} onClick={() => openCustomer(c)}>Open</button>
                    <button type="button" className="btn-mini" aria-expanded={openId === c.id} onClick={() => setOpenId(openId === c.id ? null : c.id)}>{openId === c.id ? 'Close' : 'Sell'}</button>
                    <button type="button" className="btn-mini" disabled={!!busy} onClick={() => post(c.id, { action: 'touch', contactId: c.id, note: 'Spoke today' })}>Spoke today</button>
                    {data.apollo && c.apolloId && !c.email && <button type="button" className="btn-mini" disabled={!!busy} onClick={() => post(c.id, { action: 'apollo_enrich', contactId: c.id })}>Find email (1 credit)</button>}
                    <button type="button" className="btn-mini" disabled={!!busy} onClick={() => post(c.id, { action: 'remove', contactId: c.id })}>Remove</button>
                  </td>
                </tr>
                {openId === c.id && <tr><td colSpan={7}><LeadDetails c={c} /><DealPanel c={c} busy={!!busy} post={post} goApprovals={goApprovals} reload={reload} /></td></tr>}
                </React.Fragment>
              ))}</tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
