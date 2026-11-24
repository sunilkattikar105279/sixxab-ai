// One deal's lead agents on the customer page: the lead score and why, the outreach sequence drafted for it
// (the owner sends each step and marks it sent), and what CRM Sync suggests. Nothing here sends anything.
import React, { useState } from 'react';
import { scoreGoal, sequenceGoal, syncDealGoal } from '../../core/leadgen';
import { AgentRun } from './AgentRun';
import { stageName, type Contact } from './Customer';

type Post = (k: string, b: Record<string, unknown>) => Promise<boolean>;
const CHANNEL: Record<string, string> = { email: 'Email', linkedin: 'LinkedIn', call: 'Call', text: 'Text message' };
const day = (iso: string) => { const d = new Date(iso); return Number.isNaN(d.getTime()) ? iso : d.toLocaleDateString(undefined, { dateStyle: 'medium' }); };

export const gradeTone = (g?: string) => (g === 'A' ? 'pill-done' : g === 'B' ? 'pill-awaiting_approval' : g === 'D' ? 'pill-failed' : '');

export function CopyButton({ text }: { text: string }) {
  const [done, setDone] = useState(false);
  return (
    <button type="button" className="btn-mini" onClick={async () => { try { await navigator.clipboard.writeText(text); setDone(true); setTimeout(() => setDone(false), 1500); } catch { /* clipboard blocked */ } }}>
      {done ? 'Copied' : 'Copy'}
    </button>
  );
}

export function DealAgents({ c, busy, post, reload, goApprovals }: { c: Contact; busy: boolean; post: Post; reload: () => void; goApprovals: () => void }) {
  const s = c.leadScore;
  const seq = c.sequence;
  const sync = c.syncSuggestion;
  return (
    <section className="panel glass-card">
      <h3>Lead agents</h3>
      <div className="stack">
        <div className="stack-sm">
          <div className="row-between"><strong>Lead score · Lead Scorer</strong>{s && <span className={`pill ${gradeTone(s.grade)}`}>{s.score} · {s.grade}</span>}</div>
          {s ? <p className="small prewrap">{s.reasons}<br /><span className="muted small">Scored {day(s.at)} by {s.by}</span></p> : <p className="muted small">Not scored yet. The score weighs ICP fit, deal size, ease of win, reachability and momentum.</p>}
          <AgentRun agentId="lead-scorer" goal={scoreGoal([c.id])} label={s ? 'Rescore' : 'Score this lead'} emptyText="" goApprovals={goApprovals} contactId={c.id} onDone={reload} />
        </div>

        <div className="stack-sm">
          <strong>Outreach sequence · Outreach Sequencer</strong>
          {seq ? (
            <>
              <p className="muted small">Drafts in your voice; nothing is sent. Copy each step into your email or LinkedIn, send it yourself, then mark it sent so the history and stage stay right.</p>
              {seq.notes && <p className="small"><span className="muted">Check first: </span>{seq.notes}</p>}
              <ol className="sequence">
                {seq.steps.map((st, i) => (
                  <li key={i} className={st.sentAt ? 'sent' : ''}>
                    <div className="row-between">
                      <strong className="small">Day {st.day} · {CHANNEL[st.channel] ?? st.channel}</strong>
                      <span className="row-wrap">
                        <CopyButton text={st.subject ? `Subject: ${st.subject}\n\n${st.text}` : st.text} />
                        {st.sentAt ? <span className="pill pill-done">Sent {day(st.sentAt)}</span> : <button type="button" className="btn-mini" disabled={busy} onClick={() => post(`step-${i}`, { action: 'sequence_sent', contactId: c.id, index: i })}>Mark sent</button>}
                      </span>
                    </div>
                    {st.subject && <p className="small"><span className="muted">Subject: </span>{st.subject}</p>}
                    <p className="small prewrap">{st.text}</p>
                  </li>
                ))}
              </ol>
            </>
          ) : <p className="muted small">No sequence yet. The agent drafts four or five steps over about two weeks, by email, LinkedIn and phone, from this record's research.</p>}
          <AgentRun agentId="outreach-sequencer" goal={sequenceGoal([c.id])} label={seq ? 'Redraft the sequence' : 'Draft a sequence'} emptyText="" goApprovals={goApprovals} contactId={c.id} onDone={reload} />
        </div>

        <div className="stack-sm">
          <strong>CRM Sync</strong>
          {sync ? (
            <div className="notice">
              <p className="small">Suggests moving this deal to <strong>{stageName(sync.stage)}</strong>: {sync.reason}</p>
              <div className="row-end">
                <button type="button" className="btn-ghost" disabled={busy} onClick={() => post('sync-dismiss', { action: 'sync_dismiss', contactId: c.id })}>Dismiss</button>
                <button type="button" className="btn-primary" disabled={busy} onClick={() => post('sync-apply', { action: 'sync_apply', contactId: c.id })}>Move to {stageName(sync.stage)}</button>
              </div>
            </div>
          ) : <p className="muted small">Fills fields this record already answers, sets a missing next step and suggests a stage when the history shows the deal has moved. It never deletes or moves anything itself.</p>}
          <AgentRun agentId="crm-sync" goal={syncDealGoal(c.id)} label="Check this record" emptyText="" goApprovals={goApprovals} contactId={c.id} onDone={reload} />
        </div>
      </div>
    </section>
  );
}
