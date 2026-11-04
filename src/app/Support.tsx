// Support tab: open a ticket, work the queue (priority first), add notes and resolve; the agent drafts replies.
import React, { useState } from 'react';
import { Spinner } from './ui';
import { useLoad } from './useLoad';
import { AgentRun, usePost } from './AgentRun';

interface Note { at: string; by: string; text: string }
interface Ticket { id: string; number: number; subject: string; customer: string; contact: string; channel: string; priority: string; status: string; createdAt: string; notes: Note[] }
interface SupportState { tickets: Ticket[]; totals: { open: number; waiting: number; resolved: number; urgent: number; medianHoursToResolve: number | null }; replyGoal: string }

const EMPTY = { subject: '', customer: '', contact: '', channel: 'email', priority: 'normal', message: '' };
const pill = (s: string) => (s === 'resolved' ? 'done' : s === 'waiting' ? 'planned' : 'awaiting_approval');

export function Support({ goApprovals }: { goApprovals: () => void }) {
  const { data, error, reload } = useLoad<{ support: SupportState }>('/api/support');
  const { busy, msg, post } = usePost('/api/support', reload);
  const [f, setF] = useState(EMPTY);
  const [showResolved, setShowResolved] = useState(false);
  if (error) return <p className="error">{error}</p>;
  if (!data) return <Spinner label="Loading tickets…" />;
  const { support } = data;
  const t = support.totals;
  const shown = support.tickets.filter((x) => showResolved || x.status !== 'resolved');

  return (
    <div className="stack">
      <section className="panel glass-card">
        <p className="eyebrow">Support desk · Support Desk agent</p>
        <h2>Tickets</h2>
        <div className="cost-tiles">
          <div><span className="muted small">Open</span><strong>{t.open}</strong><span className="muted small">{t.urgent} high or urgent</span></div>
          <div><span className="muted small">Waiting on customer</span><strong>{t.waiting}</strong></div>
          <div><span className="muted small">Resolved</span><strong>{t.resolved}</strong></div>
          <div><span className="muted small">Median time to resolve</span><strong>{t.medianHoursToResolve === null ? '—' : `${t.medianHoursToResolve}h`}</strong></div>
        </div>
        <AgentRun agentId="support-desk" goal={support.replyGoal} label={`Draft replies to ${t.open} open ticket${t.open === 1 ? '' : 's'}`} emptyText="No open tickets. Nice." goApprovals={goApprovals} />
      </section>

      <section className="panel glass-card">
        <h2>New ticket</h2>
        <p className="muted small">Business questions only: never paste medical records, test results or card numbers into a ticket.</p>
        <form className="form" onSubmit={async (e) => { e.preventDefault(); if (await post('open', { action: 'open', ticket: f })) setF(EMPTY); }}>
          <div className="grid3">
            <label className="field"><span>Customer</span><input value={f.customer} onChange={(e) => setF({ ...f, customer: e.target.value })} maxLength={120} /></label>
            <label className="field"><span>Email or phone</span><input value={f.contact} onChange={(e) => setF({ ...f, contact: e.target.value })} maxLength={200} /></label>
            <label className="field"><span>Channel / priority</span><span className="grid2">
              <select aria-label="Channel" value={f.channel} onChange={(e) => setF({ ...f, channel: e.target.value })}>{['email', 'whatsapp', 'phone', 'website', 'walk-in'].map((c) => <option key={c}>{c}</option>)}</select>
              <select aria-label="Priority" value={f.priority} onChange={(e) => setF({ ...f, priority: e.target.value })}>{['low', 'normal', 'high', 'urgent'].map((c) => <option key={c}>{c}</option>)}</select>
            </span></label>
          </div>
          <label className="field"><span>Subject</span><input value={f.subject} onChange={(e) => setF({ ...f, subject: e.target.value })} maxLength={160} /></label>
          <label className="field"><span>Their message</span><textarea rows={3} value={f.message} onChange={(e) => setF({ ...f, message: e.target.value })} maxLength={4000} /></label>
          <div className="row-end"><button type="submit" className="btn-primary" disabled={!!busy || !f.subject.trim() || !f.customer.trim() || !f.message.trim()}>{busy === 'open' ? <Spinner label="Saving…" /> : 'Open ticket'}</button></div>
        </form>
        {msg && <p className="error" role="alert">{msg}</p>}
      </section>

      <section className="panel glass-card">
        <div className="row-between">
          <h2>Queue</h2>
          <label className="small"><input type="checkbox" checked={showResolved} onChange={(e) => setShowResolved(e.target.checked)} /> Show resolved</label>
        </div>
        {shown.length === 0 ? <p className="muted small">Nothing in the queue.</p> : (
          <ul className="stack-sm" style={{ listStyle: 'none', padding: 0, margin: 0 }}>
            {shown.map((x) => <TicketRow key={x.id} t={x} busy={!!busy} post={post} />)}
          </ul>
        )}
      </section>
    </div>
  );
}

function TicketRow({ t, busy, post }: { t: Ticket; busy: boolean; post: (k: string, b: Record<string, unknown>) => Promise<boolean> }) {
  const [note, setNote] = useState('');
  return (
    <li className="journey-step">
      <details>
        <summary className="row-between">
          <span><strong>#{t.number} {t.subject}</strong> <span className="muted small">· {t.customer} · {t.channel} · {t.priority}</span></span>
          <span className={`pill pill-${pill(t.status)}`}>{t.status}</span>
        </summary>
        <div className="stack-sm">
          {t.notes.map((n, i) => <p key={i} className="small"><span className="muted">{new Date(n.at).toLocaleString()} · {i === 0 ? 'Customer' : n.by}:</span> {n.text}</p>)}
          <textarea aria-label={`Note for ticket ${t.number}`} rows={2} value={note} onChange={(e) => setNote(e.target.value)} placeholder="Add a note or the reply you sent" />
          <div className="row-end">
            <button type="button" className="btn-mini" disabled={busy || !note.trim()} onClick={async () => { if (await post(t.id, { action: 'note', ticketId: t.id, note })) setNote(''); }}>Add note</button>
            {t.status !== 'waiting' && t.status !== 'resolved' && <button type="button" className="btn-mini" disabled={busy} onClick={() => post(t.id, { action: 'status', ticketId: t.id, status: 'waiting' })}>Waiting on customer</button>}
            {t.status !== 'resolved' ? <button type="button" className="btn-mini" disabled={busy} onClick={() => post(t.id, { action: 'status', ticketId: t.id, status: 'resolved' })}>Resolve</button>
              : <button type="button" className="btn-mini" disabled={busy} onClick={() => post(t.id, { action: 'status', ticketId: t.id, status: 'open' })}>Reopen</button>}
          </div>
        </div>
      </details>
    </li>
  );
}
