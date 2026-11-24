// Customer page: everything the CRM knows about one business — its data, the research, the history — and the deal tools.
import React, { useState } from 'react';
import { Spinner } from './ui';
import { money } from './AgentRun';
import { DealPanel } from './DealPanel';
import { fileToCsv } from '../lib/sheet';
import type { Meddic } from '../../core/gtm';
import type { LeadScore, ObjectionPlay, Sequence, SyncSuggestion } from '../../core/leadgen-state';
import { DealAgents, gradeTone } from './DealAgents';
import { CustomerSuccess } from './CustomerSuccess';
import { ActionCard } from './SalesFlow';
import type { CustomerFlow, NextAction } from '../../core/salesflow-state';

export interface HistoryItem { at: string; by: string; kind: string; text: string }
export interface LeadProfile {
  rank?: number | null; niche?: string; city?: string; website?: string; size?: string; title?: string; dealTier?: string; ease?: string;
  whyFit?: string; pitch?: string; sourceDetail?: string; checkFirst?: string; painPoints?: string; offer?: string; angle?: string; research?: string;
}
export interface Contact extends LeadProfile {
  id: string; name: string; company: string; email: string; phone: string; source: string; value: number; nextStep: string; notes: string;
  stage: string; lastTouch: string | null; createdAt: string; meddic: Meddic | null; callNotes: string; score: number | null; apolloId?: string; history?: HistoryItem[];
  /** Saved by the lead agents. */
  leadScore?: LeadScore | null; sequence?: Sequence | null; objections?: ObjectionPlay[]; syncSuggestion?: SyncSuggestion | null;
  /** After the win: onboarding plan, account reviews and customer messages sent. */
  customer?: CustomerFlow;
}

export const STAGES = ['lead', 'contacted', 'qualified', 'proposal', 'won', 'lost'];
/** How each stage reads in the pipeline; the stored keys stay the same. */
const STAGE_LABEL: Record<string, string> = { lead: 'New lead', contacted: 'Contacted', qualified: 'Discovery call', proposal: 'Proposal sent', won: 'Won', lost: 'Lost' };
export const stageName = (s: string) => STAGE_LABEL[s] ?? s;
export const webHref = (w: string) => (/^https?:\/\//i.test(w) ? w : `https://${w}`);
const SOURCES = ['website', 'referral', 'linkedin', 'whatsapp', 'walk-in', 'event', 'apollo', 'web-search', 'other'];
const KIND_LABEL: Record<string, string> = { note: 'Note', call: 'Call', email: 'Email', meeting: 'Meeting', research: 'Research', stage: 'Stage', update: 'Update', qualify: 'Qualified', touch: 'Touch', score: 'Lead score', sequence: 'Outreach', objection: 'Objection', sync: 'CRM Sync', agent: 'Agent', onboarding: 'Onboarding', health: 'Account health' };
const when = (iso: string) => { const d = new Date(iso); return Number.isNaN(d.getTime()) ? iso : d.toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' }); };

type Post = (k: string, b: Record<string, unknown>) => Promise<boolean>;
type Form = Record<string, string>;
const FIELDS: { key: string; label: string; long?: boolean; options?: string[] }[] = [
  { key: 'company', label: 'Business' }, { key: 'name', label: 'Decision maker' }, { key: 'title', label: 'Their role' },
  { key: 'phone', label: 'Phone' }, { key: 'email', label: 'Email' }, { key: 'website', label: 'Website' },
  { key: 'city', label: 'City' }, { key: 'niche', label: 'Niche' }, { key: 'size', label: 'Size' },
  { key: 'value', label: 'Deal value ($)' }, { key: 'dealTier', label: 'Deal size', options: ['', 'High', 'Medium', 'Low'] }, { key: 'ease', label: 'Ease of win', options: ['', 'High', 'Medium', 'Low'] },
  { key: 'rank', label: 'Rank' }, { key: 'source', label: 'Lead source', options: SOURCES }, { key: 'sourceDetail', label: 'Source page' },
  { key: 'nextStep', label: 'Next step' },
  { key: 'whyFit', label: 'Why they fit', long: true }, { key: 'painPoints', label: 'Pain points', long: true }, { key: 'offer', label: 'Our offer', long: true },
  { key: 'angle', label: 'Outreach angle', long: true }, { key: 'pitch', label: 'Agent to pitch', long: true }, { key: 'checkFirst', label: 'Check before outreach', long: true },
  { key: 'research', label: 'Research notes', long: true }, { key: 'notes', label: 'Other notes', long: true },
];
const toForm = (c: Contact): Form => Object.fromEntries(FIELDS.map(({ key }) => { const v = (c as unknown as Record<string, unknown>)[key]; return [key, v == null || v === 0 ? '' : String(v)]; }));

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <div><dt>{label}</dt><dd>{children}</dd></div>;
}

export function CustomerPage({ c, busy, msg, post, back, goApprovals, reload, actions = [] }: { c: Contact; busy: boolean; msg: string | null; post: Post; back: () => void; goApprovals: () => void; reload: () => void; actions?: NextAction[] }) {
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState<Form>(() => toForm(c));
  const [kind, setKind] = useState('note');
  const [note, setNote] = useState('');
  const [fileMsg, setFileMsg] = useState<string | null>(null);
  const history = c.history ?? [];
  const person = [c.name !== c.company ? c.name : '', c.title].filter(Boolean).join(', ');
  const research: [string, string | undefined][] = [
    ['Why they fit', c.whyFit], ['Pain points', c.painPoints], ['Our offer', c.offer], ['Outreach angle', c.angle],
    ['Agent to pitch', c.pitch], ['Check before outreach', c.checkFirst], ['Research notes', c.research], ['Other notes', c.notes],
  ];
  async function save() {
    const contact: Record<string, unknown> = { id: c.id, ...form };
    if (await post('save', { action: 'contact', contact })) setEditing(false);
  }
  async function addNote() {
    if (await post('note', { action: 'note', contactId: c.id, kind, note })) { setNote(''); setFileMsg(null); }
  }
  return (
    <div className="stack customer">
      <div><button type="button" className="link-btn" onClick={back}>← Back to pipeline</button></div>

      <section className="panel glass-card">
        <p className="eyebrow">Customer · {stageName(c.stage)}{c.rank ? ` · #${c.rank}` : ''}</p>
        <h2>{c.company || c.name}</h2>
        {person && <p>{person}</p>}
        {(c.niche || c.city) && <p className="muted small">{[c.niche, c.city].filter(Boolean).join(' · ')}</p>}
        <div className="row-wrap">
          {c.value > 0 && <span className="pill">{money(c.value)}</span>}
          {c.dealTier && <span className="pill">Deal {c.dealTier}</span>}
          {c.ease && <span className="pill">Win {c.ease}</span>}
          {c.leadScore && <span className={`pill ${gradeTone(c.leadScore.grade)}`}>Lead score {c.leadScore.score} · {c.leadScore.grade}</span>}
          {c.score != null && <span className="pill">MEDDIC {c.score}%</span>}
          {c.syncSuggestion && <span className="pill pill-awaiting_approval">CRM Sync suggests {stageName(c.syncSuggestion.stage)}</span>}
        </div>
        <div className="row-wrap">
          <label className="field inline"><span>Stage</span>
            <select aria-label={`Stage of ${c.company || c.name}`} value={c.stage} disabled={busy} onChange={(e) => post('stage', { action: 'stage', contactId: c.id, stage: e.target.value })}>{STAGES.map((s) => <option key={s} value={s}>{stageName(s)}</option>)}</select>
          </label>
          {!editing && <button type="button" className="btn-ghost" onClick={() => { setForm(toForm(c)); setEditing(true); }}>Edit details and research</button>}
        </div>
        {msg && <p className="error" role="alert">{msg}</p>}
      </section>

      {actions.length > 0 && (
        <section className="panel glass-card">
          <p className="eyebrow">Sales flow</p>
          <h3>Next for {c.company || c.name}</h3>
          <ol className="action-list">{actions.map((a) => <ActionCard key={a.key} a={a} c={c} busy={busy} post={post} reload={reload} goApprovals={goApprovals} showCompany={false} />)}</ol>
        </section>
      )}

      {c.stage === 'won' && <CustomerSuccess c={c} busy={busy} post={post} reload={reload} goApprovals={goApprovals} />}

      {editing ? (
        <section className="panel glass-card">
          <h3>Edit {c.company || c.name}</h3>
          <div className="customer-form">
            {FIELDS.map(({ key, label, long, options }) => (
              <label key={key} className={`field${long ? ' wide' : ''}`}><span>{label}</span>
                {options ? <select value={form[key]} onChange={(e) => setForm({ ...form, [key]: e.target.value })}>{options.map((o) => <option key={o} value={o}>{o || '—'}</option>)}</select>
                  : long ? <textarea rows={key === 'research' ? 8 : 3} value={form[key]} onChange={(e) => setForm({ ...form, [key]: e.target.value })} />
                  : <input value={form[key]} onChange={(e) => setForm({ ...form, [key]: e.target.value })} />}
              </label>
            ))}
          </div>
          <div className="row-end">
            <button type="button" className="btn-ghost" onClick={() => setEditing(false)}>Cancel</button>
            <button type="button" className="btn-primary" disabled={busy || !form.name.trim()} onClick={save}>{busy ? <Spinner label="Saving…" /> : 'Save changes'}</button>
          </div>
        </section>
      ) : (
        <>
          <section className="panel glass-card">
            <h3>Customer data</h3>
            <dl className="lead-facts">
              <Field label="Decision maker">{person || '—'}</Field>
              <Field label="Phone">{c.phone ? <a href={`tel:${c.phone.replace(/[^\d+]/g, '')}`}>{c.phone}</a> : '—'}</Field>
              <Field label="Email">{c.email ? <a href={`mailto:${c.email}`}>{c.email}</a> : '—'}</Field>
              <Field label="Website">{c.website ? <a href={webHref(c.website)} target="_blank" rel="noopener noreferrer">{c.website}</a> : '—'}</Field>
              <Field label="City">{c.city || '—'}</Field>
              <Field label="Niche">{c.niche || '—'}</Field>
              <Field label="Size">{c.size || '—'}</Field>
              <Field label="Deal value">{c.value > 0 ? money(c.value) : '—'}</Field>
              <Field label="Deal size">{c.dealTier || '—'}</Field>
              <Field label="Ease of win">{c.ease || '—'}</Field>
              <Field label="Lead source">{[c.source, c.sourceDetail].filter(Boolean).join(' · ') || '—'}</Field>
              <Field label="Next step">{c.nextStep || '—'}</Field>
              <Field label="Added">{when(c.createdAt)}</Field>
              <Field label="Last touch">{c.lastTouch ? when(c.lastTouch) : 'Not yet'}</Field>
            </dl>
          </section>
          <section className="panel glass-card">
            <h3>Research</h3>
            {research.map(([k, v]) => (
              <div key={k} className="research-item"><span className="muted small">{k}</span>{v ? <p className="prewrap">{v}</p> : <p className="muted small">Not filled in yet.</p>}</div>
            ))}
          </section>
        </>
      )}

      <section className="panel glass-card">
        <h3>History</h3>
        <div className="row-wrap">
          <label className="field inline"><span>Type</span>
            <select aria-label="History entry type" value={kind} onChange={(e) => setKind(e.target.value)}>{['note', 'call', 'email', 'meeting', 'research'].map((k) => <option key={k} value={k}>{KIND_LABEL[k]}</option>)}</select>
          </label>
          <label className="field inline"><span>Add text from a file</span>
            <input type="file" accept=".txt,.md,.csv,.tsv,.xlsx,text/plain,text/csv" onChange={async (e) => {
              const file = e.target.files?.[0];
              e.target.value = '';
              if (!file) return;
              try {
                const t = await fileToCsv(file);
                setNote((n) => (n ? `${n}\n\n` : '') + t.slice(0, 8000));
                setKind((k) => (k === 'note' ? 'research' : k));
                setFileMsg(`Added the text of ${file.name}${t.length > 8000 ? ' (first 8,000 characters)' : ''}. Press Add to history to save it.`);
              } catch (err) {
                setFileMsg(err instanceof Error ? err.message : 'Could not read that file.');
              }
            }} />
          </label>
        </div>
        <textarea aria-label="History entry" rows={4} value={note} maxLength={8000} onChange={(e) => setNote(e.target.value)} placeholder="What happened, what you learned, or research to keep" />
        {fileMsg && <p className="muted small">{fileMsg}</p>}
        <div className="row-end"><button type="button" className="btn-primary" disabled={busy || !note.trim()} onClick={addNote}>Add to history</button></div>
        {history.length === 0 ? <p className="muted small">Nothing yet.</p> : (
          <ol className="history">
            {history.map((h, i) => (
              <li key={`${h.at}-${i}`}>
                <div className="row-between"><strong className="small">{KIND_LABEL[h.kind] ?? h.kind}</strong><span className="muted small">{when(h.at)}{h.by ? ` · ${h.by}` : ''}</span></div>
                <p className="small prewrap">{h.kind === 'stage' ? `Moved to ${stageName(h.text)}` : h.text}</p>
              </li>
            ))}
          </ol>
        )}
      </section>

      <DealAgents c={c} busy={busy} post={post} reload={reload} goApprovals={goApprovals} />

      <section className="panel glass-card">
        <h3>Sell</h3>
        <DealPanel c={c} busy={busy} post={post} goApprovals={goApprovals} reload={reload} />
      </section>
    </div>
  );
}
