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
import { Fold, reveal } from './Fold';
import { ResearchMapper } from './ResearchMapper';
import { researchImpact, RESEARCH_SCORER } from '../../core/research-score';
import { researchGoal } from '../../core/research';
import type { FlowOrg, FlowStage, NextAction } from '../../core/salesflow-state';
import type { ResearchImportSummary } from '../../core/research-state';

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

type Open = (c: Contact, section?: string) => void;

/** On each board card: run the Business Research agent for this deal, or open its report. Nothing is sent. */
function BoardResearch({ c, open, reload }: { c: Contact; open: Open; reload: () => void }) {
  const [running, setRunning] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  if (c.stage === 'lost') return null;
  if (c.researchReport) return <div className="board-research"><span className="pill pill-done">Researched</span><button type="button" className="btn-mini" onClick={() => open(c, 'research-and-proposal')}>See report</button></div>;
  if (c.stage === 'won') return null;
  async function go() {
    setRunning(true);
    setErr(null);
    try {
      await api('/api/agents', { method: 'POST', body: JSON.stringify({ goal: researchGoal(c.id), agentId: 'business-research', contactId: c.id }) });
      reload();
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'The research could not run.');
    } finally {
      setRunning(false);
    }
  }
  return (
    <div className="board-research">
      <button type="button" className="btn-mini" disabled={running} onClick={go} title="Public pages only, up to eight web searches. Nothing is sent.">{running ? <Spinner label="Researching…" /> : 'Research this business'}</button>
      {err && <span className="error small" role="alert">{err}</span>}
    </div>
  );
}

/** Pipeline board: one column per stage, a card per deal, moved with its stage menu. */
export function Board({ contacts, busy, move, open, reload }: { contacts: Contact[]; busy: boolean; move: (c: Contact, stage: string) => void; open: Open; reload: () => void }) {
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
                  <BoardResearch c={c} open={open} reload={reload} />
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
  const [researchFile, setResearchFile] = useState<{ name: string; json: string; count: number; reports: Record<string, unknown>[] } | null>(null);
  const [importingResearch, setImportingResearch] = useState(false);
  const [researchMsg, setResearchMsg] = useState<{ ok: boolean; text: string; lines: string[] } | null>(null);
  async function importResearchFile(deals: Record<string, string>, fill: Record<string, string[]>): Promise<void> {
    if (!researchFile) return;
    setImportingResearch(true);
    setResearchMsg(null);
    try {
      const r = await api<ResearchImportSummary>('/api/crm', { method: 'POST', body: JSON.stringify({ action: 'import_research', json: researchFile.json, deals, fill }) });
      const notPlaced = r.reports - r.matched - r.skipped;
      const parts = [
        `Attached research to ${r.researchSaved} customer${r.researchSaved === 1 ? '' : 's'}`,
        r.proposalsSaved ? `proposal drafts to ${r.proposalsSaved}` : '',
        r.detailsFilled ? `copied ${r.detailsFilled} detail${r.detailsFilled === 1 ? '' : 's'} onto their records` : '',
        r.unchanged ? `${r.unchanged} already had this research` : '',
        r.skipped ? `${r.skipped} skipped` : '',
        notPlaced ? `${notPlaced} not placed` : '',
      ].filter(Boolean);
      const moved = r.scored ? ` Scored ${r.scored} researched lead${r.scored === 1 ? '' : 's'} from the research with no agent run: ${r.workNow} worth working now${r.workNow ? ' moved on (send the proposal next)' : ''}${r.scored - r.workNow ? `, ${r.scored - r.workNow} scored under 60 stay in Qualify` : ''}.` : '';
      const lines = r.results.filter((x) => x.filled.length || x.reason).map((x) => `${x.dealName || x.company}: ${[x.filled.length ? `copied ${x.filled.join(', ').toLowerCase()}` : '', x.reason].filter(Boolean).join('; ')}`);
      setResearchMsg({ ok: r.matched > 0 || r.skipped > 0, text: `${parts.join(', ')}.${moved} No contacts were added and nothing was sent.`, lines });
      setResearchFile(null);
      reload();
    } catch (e) {
      setResearchMsg({ ok: false, text: e instanceof Error ? e.message : 'Could not import the research.', lines: [] });
    } finally {
      setImportingResearch(false);
    }
  }
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
  const openCustomer = (c: Contact, section?: string) => {
    setCustomerId(c.id);
    window.scrollTo?.({ top: 0 });
    if (section) setTimeout(() => document.getElementById(section)?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 80);
  };
  if (customer) return <CustomerPage key={customer.id} c={customer} busy={!!busy} msg={msg} post={post} back={() => setCustomerId(null)} goApprovals={goApprovals} reload={reload} actions={(crm.nextActions ?? []).filter((a) => a.contactId === customer.id)} />;
  const shown = crm.contacts.filter((c) => (filter === 'open' ? !['won', 'lost'].includes(c.stage) : filter === 'all' ? true : filter === 'researched' ? !!c.researchReport : c.stage === filter));
  const impact = researchImpact(crm.contacts);

  return (
    <div className="stack">
      <SalesFlow crm={crm} busy={!!busy} post={post} reload={reload} goApprovals={goApprovals} open={openCustomer} admin={data.admin} />
      {msg && <p className="error" role="alert">{msg}</p>}

      <Fold id="import" title="Import leads and research" hint={impact.researched ? `${impact.researched} researched · ${impact.workNow} moved on to Outreach` : 'Excel, CSV or a research file'}>
        {impact.researched > 0 && (
          <div className="research-impact" id="research-impact">
            <h3>What the research has done</h3>
            <div className="cost-tiles">
              <div><span className="muted small">Researched leads</span><strong>{impact.researched}</strong><span className="muted small">{impact.imported === impact.researched ? 'all from research files' : `${impact.imported} from research files`}</span></div>
              <div><span className="muted small">Details copied</span><strong>{impact.detailsCopied}</strong><span className="muted small">onto customer records</span></div>
              <div><span className="muted small">Moved on</span><strong>{impact.workNow}</strong><span className="muted small">{impact.scored ? `of ${impact.scored} scored, now in Outreach` : 'none scored yet'}</span></div>
              <div><span className="muted small">Agent runs not needed</span><strong>{impact.agentRunsSaved}</strong><span className="muted small">research, scoring and proposals</span></div>
            </div>
            <p className="muted small">{impact.proposals} proposal draft{impact.proposals === 1 ? '' : 's'} wait for you to edit and send. Researched leads are scored from their research with no agent run and no tokens used ({RESEARCH_SCORER.toLowerCase()} shows as the scorer). Those scoring 60 or more with a proposal draft move to Outreach; the rest stay in Qualify, as does a lead whose proposal shows no net gain for them.</p>
            <div className="row-end">
              <button type="button" className="btn-ghost" onClick={() => { setFilter('researched'); reveal('contacts'); }}>Show researched leads</button>
              {impact.waiting > 0 && <button type="button" className="btn-primary" disabled={!!busy} onClick={() => post('research_advance', { action: 'research_advance' })}>Move {impact.waiting} researched lead{impact.waiting === 1 ? '' : 's'} on</button>}
            </div>
          </div>
        )}
        <div className="grid2 import-grid">
          <div className="import-box" id="import-list">
            <h3>1. Import a list</h3>
            <p className="muted small">Your lead sheet as an Excel (.xlsx) or CSV file, or rows pasted from a spreadsheet. Adds each lead as a deal.</p>
            <details><summary className="small">Which columns are kept</summary><p className="muted small">Columns are matched by their header, so a lead sheet with Rank, Business, Niche, City, Website, Main phone, Size, Decision maker, Deal size, Ease of win, Why they fit, Agent to pitch, Source and Check before outreach keeps every column, and Pain points, Offer, Outreach angle and Research columns are kept too. Importing a list again never duplicates anyone: it only fills in details a customer is missing.</p></details>
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
          </div>
          <div className="import-box" id="import-research">
            <h3>2. Import research</h3>
            <p className="muted small">A research file (.json), for example from Claude Duet. Each report goes on a customer already in the CRM, so import the list first.</p>
            <details><summary className="small">How reports are matched</summary><p className="muted small">Each report is matched to the customer with the same website, business name or main phone, and you can pick a different customer or skip it before anything is saved. The report brings pain points, opportunities, missing contact details with the page each came from, and a proposal draft with ROI when the file has one. Tick the details to copy onto the customer, such as an email, phone or address; nothing else on the customer changes. It never adds a contact. Importing the same file again changes nothing, and a proposal you edited or sent is kept.</p></details>
            <label className="field"><span>Choose a research file</span><input type="file" accept=".json,application/json" onChange={async (e) => {
              const file = e.target.files?.[0];
              e.target.value = '';
              if (!file) return;
              setResearchMsg(null);
              try {
                const json = await file.text();
                const data = JSON.parse(json) as { reports?: unknown[] } | unknown[];
                const list = Array.isArray(data) ? data : Array.isArray(data?.reports) ? data.reports : null;
                if (!list?.length) throw new Error('No reports in that file. A research file has a "reports" list.');
                setResearchFile({ name: file.name, json, count: list.length, reports: list.filter((r): r is Record<string, unknown> => !!r && typeof r === 'object') });
                setResearchMsg({ ok: true, text: `Loaded ${file.name}: ${list.length} report${list.length === 1 ? '' : 's'}. Check where each one goes below, then import.`, lines: [] });
                setTimeout(() => reveal('research-map'), 80);
              } catch (err) {
                setResearchFile(null);
                setResearchMsg({ ok: false, text: err instanceof SyntaxError ? 'That file is not valid JSON. Choose the research file (.json) exactly as it was delivered.' : err instanceof Error ? err.message : 'Could not read that file.', lines: [] });
              }
            }} /></label>
            {researchFile && <div className="row-end"><button type="button" className="btn-ghost" onClick={() => reveal('research-map')}>Check the {researchFile.count} report{researchFile.count === 1 ? '' : 's'} below</button></div>}
            {researchMsg && <div role={researchMsg.ok ? 'status' : 'alert'}><p className={researchMsg.ok ? 'small' : 'error'}>{researchMsg.text}</p>{researchMsg.lines.length > 0 && <ul className="small">{researchMsg.lines.map((l) => <li key={l}>{l}</li>)}</ul>}</div>}
          </div>
        </div>
        {researchFile && <ResearchMapper key={researchFile.json.length + researchFile.name} fileName={researchFile.name} reports={researchFile.reports} contacts={crm.contacts} importing={importingResearch} onImport={importResearchFile} onCancel={() => { setResearchFile(null); setResearchMsg(null); }} />}
      </Fold>

      <Fold id="pipeline" title="Pipeline" eyebrow="CRM · Sales CRM agent" hint={`${t.open} open · ${money(t.openValue)}${t.followUps ? ` · ${t.followUps} need a follow-up` : ''}`}>
        <div className="cost-tiles">
          <div><span className="muted small">Open deals</span><strong>{t.open}</strong><span className="muted small">{money(t.openValue)} in play</span></div>
          <div><span className="muted small">Won</span><strong>{t.won}</strong><span className="muted small">{money(t.wonValue)}</span></div>
          <div><span className="muted small">Win rate</span><strong>{t.winRate === null ? '—' : `${t.winRate}%`}</strong></div>
          <div><span className="muted small">Need a follow-up</span><strong>{t.followUps}</strong><span className="muted small">quiet 7+ days</span></div>
        </div>
        <AgentRun agentId="sales-crm" goal={crm.followUpGoal} label={`Draft ${t.followUps} follow-up${t.followUps === 1 ? '' : 's'}`} emptyText="No open deal with an email has gone quiet for a week." goApprovals={goApprovals} />
        <details className="head-group">
          <summary>Weekly pipeline review <span className="muted small">Head of GTM</span></summary>
          <p className="muted small">Focus deals, stuck deals and the forecast weighted by each deal's MEDDIC score. Open a contact below to prep a call, debrief it, send the follow-up or answer an objection.</p>
          <AgentRun agentId="head-of-gtm" goal={pipelineReviewGoal(crm.contacts)} label="Run the weekly review" emptyText="Add an open deal to review the pipeline." goApprovals={goApprovals} />
        </details>
      </Fold>

      <Fold id="board" title="Deals by stage" eyebrow="Pipeline board" hint={`${t.open} open deal${t.open === 1 ? '' : 's'}`}>
        <p className="muted small">Tap a card to open the customer's full record. "Research this business" on a card runs the Business Research agent on public pages and saves the report on the deal.</p>
        <Board contacts={crm.contacts} busy={!!busy} move={(c, stage) => post(c.id, { action: 'stage', contactId: c.id, stage })} open={openCustomer} reload={reload} />
      </Fold>

      <Fold id="contacts" title="Contacts" hint={`${crm.contacts.length} in the CRM`}>
        <div className="row-end">
          <select aria-label="Show" value={filter} onChange={(e) => setFilter(e.target.value)}>
            <option value="open">Open deals</option><option value="all">All</option><option value="researched">Researched ({impact.researched})</option>{STAGES.map((s) => <option key={s} value={s}>{stageName(s)} ({crm.pipeline[s] ?? 0})</option>)}
          </select>
        </div>
        <details className="head-group">
          <summary>Add a contact</summary>
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
        </details>
        {msg && <p className="error" role="alert">{msg}</p>}
        {shown.length === 0 ? <p className="muted small">No contacts here yet.</p> : (
          <div className="table-wrap">
            <table>
              <thead><tr><th>Name</th><th>Value</th><th>Stage</th><th>MEDDIC</th><th>Last touch</th><th>Next step</th><th /></tr></thead>
              <tbody>{shown.map((c) => (
                <React.Fragment key={c.id}>
                <tr>
                  <td><strong>{c.name}</strong>{c.company && c.company !== c.name ? <span className="muted small"> · {c.company}</span> : null}{c.researchReport && <> <span className="pill pill-done">Researched</span></>}<br /><span className="muted small">{[c.leadScore && `Score ${c.leadScore.score} ${c.leadScore.grade}`, [c.niche, c.city].filter(Boolean).join(' · ') || c.email || c.phone || c.source].filter(Boolean).join(' · ')}</span></td>
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
      </Fold>

      <LeadAgents crm={crm} busy={!!busy} post={post} reload={reload} goApprovals={goApprovals} />

      <Fold id="new-leads" title="Answer new leads" eyebrow="New business · Speed-to-Lead" hint={crm.newLeads ? `${crm.newLeads} new` : 'None waiting'}>
        <AgentRun agentId="speed-to-lead" goal={crm.speedGoal ?? ''} label={`Reply to ${crm.newLeads ?? 0} new lead${crm.newLeads === 1 ? '' : 's'}`} emptyText="No new leads from the last 48 hours are waiting for a first reply." goApprovals={goApprovals} />
      </Fold>

      {data.apollo && <ApolloSearch onImported={reload} />}
    </div>
  );
}
