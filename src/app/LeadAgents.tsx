// Lead generation on the CRM tab: who to sell to (ICP Builder), new businesses to add (Prospect Generator,
// each one added only when the owner ticks it), scores, outreach drafts and CRM Sync across the pipeline.
// Nothing here contacts anyone: sequences are drafts the owner sends personally.
import React, { useState } from 'react';
import { icpGoal, pickDeals, prospectGoal, scoreGoal, sequenceGoal, syncGoal } from '../../core/leadgen';
import { leadSearchGoal } from '../../core/crm';
import { ICP_FIELDS, type CrmIssue, type Icp, type IcpNotes, type ProspectBatch } from '../../core/leadgen-state';
import { fileToText } from '../lib/sheet';
import { AgentRun } from './AgentRun';
import { Spinner } from './ui';
import type { Contact } from './Customer';

type Post = (k: string, b: Record<string, unknown>) => Promise<boolean>;
export interface LeadgenState { contacts: Contact[]; icps?: Icp[]; icpNotes?: IcpNotes | null; prospectBatches?: ProspectBatch[]; issues?: CrmIssue[] }

const ICP_LABEL: Record<string, string> = {
  summary: 'Who they are', industries: 'Industries', locations: 'Locations', size: 'Size', buyer: 'Who decides', pains: 'Their pains',
  signals: 'Buying signals', disqualifiers: 'Rule out', offer: 'Offer to lead with', valueCase: 'Why it pays', voice: 'How we write to them',
};
/** Sheets that describe the customer or the owner's voice go first, so they survive the length limit. */
const ICP_SHEETS = /icp|ideal|customer|persona|segment|outreach|draft|email|voice|offer/i;
const NOTES_MAX = 20000;

function IcpCard({ icp, busy, post }: { icp: Icp; busy: boolean; post: Post }) {
  const [edit, setEdit] = useState<Record<string, string> | null>(null);
  if (edit) {
    return (
      <div className="icp-card stack-sm">
        <label className="field"><span>Name</span><input value={edit.name} maxLength={80} onChange={(e) => setEdit({ ...edit, name: e.target.value })} /></label>
        {ICP_FIELDS.map((k) => (
          <label key={k} className="field"><span>{ICP_LABEL[k]}</span><textarea rows={k === 'summary' || k === 'voice' ? 3 : 2} value={edit[k] ?? ''} onChange={(e) => setEdit({ ...edit, [k]: e.target.value })} /></label>
        ))}
        <div className="row-end">
          <button type="button" className="btn-ghost" onClick={() => setEdit(null)}>Cancel</button>
          <button type="button" className="btn-primary" disabled={busy || !edit.name.trim() || !edit.summary?.trim()} onClick={async () => { if (await post('icp-save', { action: 'icp_save', icp: { ...edit, id: icp.id } })) setEdit(null); }}>Save ICP</button>
        </div>
      </div>
    );
  }
  return (
    <details className="icp-card">
      <summary><strong>{icp.name}</strong> <span className="muted small">{icp.summary.slice(0, 140)}{icp.summary.length > 140 ? '…' : ''}</span></summary>
      <dl className="lead-facts">{ICP_FIELDS.filter((k) => icp[k]).map((k) => <div key={k}><dt>{ICP_LABEL[k]}</dt><dd className="prewrap">{icp[k]}</dd></div>)}</dl>
      <div className="row-end">
        <button type="button" className="btn-mini" disabled={busy} onClick={() => post('icp-remove', { action: 'icp_remove', icpId: icp.id })}>Remove</button>
        <button type="button" className="btn-mini" onClick={() => setEdit({ name: icp.name, ...Object.fromEntries(ICP_FIELDS.map((k) => [k, icp[k] ?? ''])) })}>Edit</button>
      </div>
    </details>
  );
}

function ProspectBatchCard({ b, busy, post }: { b: ProspectBatch; busy: boolean; post: Post }) {
  const pending = b.items.filter((p) => p.status === 'pending');
  const [pick, setPick] = useState<Set<string>>(() => new Set(pending.map((p) => p.key)));
  const toggle = (k: string) => setPick((s) => { const n = new Set(s); if (n.has(k)) n.delete(k); else n.add(k); return n; });
  const rest = pending.filter((p) => !pick.has(p.key)).map((p) => p.key);
  return (
    <div className="stack-sm prospect-batch">
      <p className="small"><strong>{pending.length} waiting for your yes</strong>{b.icpName ? <span className="muted"> · {b.icpName}</span> : null}<span className="muted"> · found by {b.by}</span></p>
      <ul className="prospects">
        {pending.map((p) => (
          <li key={p.key}>
            <label className="row-start">
              <input type="checkbox" checked={pick.has(p.key)} onChange={() => toggle(p.key)} aria-label={`Add ${p.company}`} />
              <span className="stack-xs">
                <strong className="small">{p.company}</strong>
                <span className="muted small">{[p.name && `${p.name}${p.title ? `, ${p.title}` : ''}`, p.niche, p.city, p.size].filter(Boolean).join(' · ')}</span>
                {p.whyFit && <span className="small">{p.whyFit}</span>}
                {p.signal && <span className="small"><span className="muted">Signal: </span>{p.signal}</span>}
                <span className="muted small">{[p.website, p.phone, p.email].filter(Boolean).join(' · ') || 'No public contact listed'}{p.checkFirst ? ` · Check first: ${p.checkFirst}` : ''}</span>
                {p.sourcePage && <span className="muted small">Source: {p.sourcePage}</span>}
              </span>
            </label>
          </li>
        ))}
      </ul>
      <div className="row-end">
        <button type="button" className="btn-ghost" disabled={busy || !rest.length} onClick={() => post(`dismiss-${b.id}`, { action: 'prospects_decide', batchId: b.id, add: [], dismiss: rest })}>Dismiss {rest.length} unticked</button>
        <button type="button" className="btn-primary" disabled={busy || !pick.size} onClick={() => post(`add-${b.id}`, { action: 'prospects_decide', batchId: b.id, add: [...pick], dismiss: [] })}>Add {pick.size} to New lead</button>
      </div>
    </div>
  );
}

export function LeadAgents({ crm, busy, post, reload, goApprovals }: { crm: LeadgenState; busy: boolean; post: Post; reload: () => void; goApprovals: () => void }) {
  const icps = crm.icps ?? [];
  const batches = crm.prospectBatches ?? [];
  const issues = crm.issues ?? [];
  const [notes, setNotes] = useState(crm.icpNotes?.text ?? '');
  const [notesMsg, setNotesMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [icpId, setIcpId] = useState(icps[0]?.id ?? '');
  const [query, setQuery] = useState('');
  const [count, setCount] = useState(10);
  const icp = icps.find((i) => i.id === icpId) ?? null;
  const unscored = pickDeals(crm.contacts, 'unscored', 10);
  const toSequence = pickDeals(crm.contacts, 'no_sequence', 3);
  const prospectAsk = query.trim() ? (icp ? `${prospectGoal(icp, '', count)} Focus on: ${query.trim().slice(0, 200)}.` : leadSearchGoal(query.trim())) : icp ? prospectGoal(icp, '', count) : '';
  const notesChanged = notes.trim() !== (crm.icpNotes?.text ?? '').trim();
  const run = { goApprovals, onDone: reload };

  return (
    <>
      <section className="panel glass-card" id="who-you-sell-to">
        <p className="eyebrow">Lead generation · ICP Builder</p>
        <h2>Who you sell to</h2>
        <p className="muted small">Add what you know about your ideal customers: paste notes, or upload your lead workbook (every sheet is read, the ICP and outreach sheets first). The ICP Builder turns it and your pipeline into profiles the other agents work from.</p>
        <label className="field"><span>Upload a workbook or text file</span>
          <input type="file" accept=".xlsx,.csv,.tsv,.txt,.md,text/plain,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" onChange={async (e) => {
            const file = e.target.files?.[0];
            e.target.value = '';
            if (!file) return;
            try {
              const t = await fileToText(file, ICP_SHEETS);
              setNotes(t.slice(0, NOTES_MAX));
              setNotesMsg({ ok: true, text: `Loaded ${file.name}${t.length > NOTES_MAX ? ` (first ${NOTES_MAX.toLocaleString()} characters)` : ''}. Check it, then press Save notes.` });
            } catch (err) {
              setNotesMsg({ ok: false, text: err instanceof Error ? err.message : 'Could not read that file.' });
            }
          }} />
        </label>
        <textarea aria-label="ICP notes" rows={5} maxLength={NOTES_MAX} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="e.g. Personal injury law firms in Dallas-Fort Worth with 5 to 30 staff; the managing partner decides; they lose cases when calls after 6 PM go to voicemail…" />
        <div className="row-end">
          {crm.icpNotes && !notesChanged && <span className="muted small">Saved</span>}
          <button type="button" className={notesChanged ? 'btn-primary' : 'btn-ghost'} disabled={busy || !notesChanged} onClick={async () => { if (await post('icp-notes', { action: 'icp_notes', notes })) setNotesMsg({ ok: true, text: 'Notes saved.' }); }}>{busy ? <Spinner label="Saving…" /> : 'Save notes'}</button>
        </div>
        {notesMsg && <p className={notesMsg.ok ? 'muted small' : 'error'} role={notesMsg.ok ? 'status' : 'alert'}>{notesMsg.text}</p>}
        {icps.length > 0 && <div className="stack-sm">{icps.map((i) => <IcpCard key={i.id} icp={i} busy={busy} post={post} />)}</div>}
        <AgentRun agentId="icp-builder" goal={crm.icpNotes || crm.contacts.length ? icpGoal({ icps, contacts: crm.contacts }) : ''} label={icps.length ? 'Update the ICPs' : 'Build the ICPs'} emptyText="Save notes about your ideal customers, or add some deals, to build an ICP." {...run} />
      </section>

      <section className="panel glass-card" id="find-prospects">
        <p className="eyebrow">Lead generation · Prospect Generator</p>
        <h2>Find new prospects</h2>
        <p className="muted small">The agent searches public business pages for companies that match. Nothing is added or contacted until you tick who to add. To run it every week on your first ICP, turn on Weekly prospect search in the Sales flow above.</p>
        <div className="grid3">
          <label className="field"><span>Match this ICP</span>
            <select aria-label="ICP to match" value={icpId} onChange={(e) => setIcpId(e.target.value)}>
              <option value="">No ICP: use my description</option>
              {icps.map((i) => <option key={i.id} value={i.id}>{i.name}</option>)}
            </select>
          </label>
          <label className="field"><span>How many</span>
            <select aria-label="How many prospects" value={count} onChange={(e) => setCount(Number(e.target.value))}>{[5, 10, 15, 20].map((n) => <option key={n} value={n}>{n}</option>)}</select>
          </label>
        </div>
        <label className="field"><span>{icp ? 'Narrow it down (optional)' : 'Who should it look for?'}</span>
          <input aria-label="Lead search" value={query} maxLength={300} onChange={(e) => setQuery(e.target.value)} placeholder={icp ? 'e.g. only Fort Worth, firms with a contact form but no live chat' : 'e.g. physiotherapy clinics in Pune with a website'} />
        </label>
        <AgentRun agentId="lead-finder" goal={prospectAsk} label="Find prospects" emptyText="Pick an ICP or describe the businesses to find." {...run} />
        {batches.map((b) => <ProspectBatchCard key={b.id} b={b} busy={busy} post={post} />)}
      </section>

      <section className="panel glass-card">
        <p className="eyebrow">Lead generation · Lead Scorer and Outreach Sequencer</p>
        <h2>Score and reach out</h2>
        <div className="grid2">
          <div className="stack-sm">
            <span className="muted small">Scores 0 to 100 against your ICP, with the reasons, on each customer page. Best first.</span>
            <AgentRun agentId="lead-scorer" goal={unscored.length ? scoreGoal(unscored) : ''} label={`Score ${unscored.length} lead${unscored.length === 1 ? '' : 's'}`} emptyText="Every open lead has a score. Rescore one from its customer page." {...run} />
          </div>
          <div className="stack-sm">
            <span className="muted small">Drafts a 4 to 5 step email and LinkedIn sequence in your voice for the top new leads. You send each step yourself.</span>
            <AgentRun agentId="outreach-sequencer" goal={toSequence.length ? sequenceGoal(toSequence) : ''} label={`Draft sequences for ${toSequence.length} lead${toSequence.length === 1 ? '' : 's'}`} emptyText="Every new lead has a sequence. Redraft one from its customer page." {...run} />
          </div>
        </div>
      </section>

      <section className="panel glass-card">
        <p className="eyebrow">Lead generation · CRM Sync</p>
        <h2>Keep the CRM consistent</h2>
        {issues.length === 0 ? <p className="muted small">No records disagree with themselves right now. Every agent run on a deal is logged in its history.</p> : (
          <>
            <p className="small">{issues.length} thing{issues.length === 1 ? '' : 's'} to tidy:</p>
            <ul className="small">{issues.slice(0, 8).map((i, n) => <li key={`${i.contactId}-${n}`}><strong>{i.name}</strong>: {i.issue}</li>)}</ul>
            {issues.length > 8 && <p className="muted small">and {issues.length - 8} more.</p>}
          </>
        )}
        <AgentRun agentId="crm-sync" goal={issues.length ? syncGoal(issues.length) : ''} label="Fix what the records answer" emptyText="" {...run} />
        <p className="muted small">CRM Sync fills fields a record already states and suggests stages; it never deletes, merges or moves a deal. Suggestions wait on each customer page.</p>
      </section>
    </>
  );
}
