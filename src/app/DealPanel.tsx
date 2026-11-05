// One deal's sales loop: MEDDIC checklist and call notes, then the GTM agents — prep the call,
// debrief the notes, write the follow-up, answer an objection. Emails wait in Approvals.
import React, { useState } from 'react';
import { MEDDIC, EMPTY_MEDDIC, scoreMeddic, callPrepGoal, debriefGoal, followUpGoal, objectionGoal, proposalGoal, winLossGoal, type Meddic, type DealContext } from '../../core/gtm';
import { Spinner } from './ui';
import { AgentRun } from './AgentRun';

export interface DealContact extends DealContext { id: string; meddic: Meddic | null; callNotes: string }

const LABEL: Record<string, string> = { unknown: 'Unknown', partial: 'Partly', confirmed: 'Confirmed' };

export function DealPanel({ c, busy, post, goApprovals }: { c: DealContact; busy: boolean; post: (k: string, b: Record<string, unknown>) => Promise<boolean>; goApprovals: () => void }) {
  const [m, setM] = useState<Meddic>({ ...EMPTY_MEDDIC, ...(c.meddic ?? {}) });
  const [notes, setNotes] = useState(c.callNotes ?? '');
  const [objection, setObjection] = useState('');
  const [saved, setSaved] = useState(false);
  const live = scoreMeddic(m);
  const deal: DealContext = { ...c, meddic: m, callNotes: notes };

  return (
    <div className="stack-sm deal-panel">
      <div className="row-between">
        <strong>Qualification (MEDDIC)</strong>
        <span className={`pill pill-${live.verdict === 'Qualified' ? 'done' : live.verdict === 'Developing' ? 'awaiting_approval' : 'planned'}`}>{live.score}% · {live.verdict}</span>
      </div>
      <div className="grid3">
        {MEDDIC.map((e) => (
          <label key={e.key} className="field" title={e.question}>
            <span>{e.letter} · {e.name}</span>
            <select aria-label={`${e.name} for ${c.name}`} value={m[e.key]} onChange={(ev) => { setSaved(false); setM({ ...m, [e.key]: ev.target.value as Meddic[typeof e.key] }); }}>
              {['unknown', 'partial', 'confirmed'].map((v) => <option key={v} value={v}>{LABEL[v]}</option>)}
            </select>
          </label>
        ))}
      </div>
      <label className="field"><span>Latest call notes</span>
        <textarea aria-label={`Call notes for ${c.name}`} rows={3} maxLength={4000} value={notes} onChange={(e) => { setSaved(false); setNotes(e.target.value); }} placeholder="What they said, in their words: the problem, the number, who decides, by when." />
      </label>
      <div className="row-end">
        {saved && <span className="muted small" role="status">Saved</span>}
        <button type="button" className="btn-ghost" disabled={busy} onClick={async () => { if (await post(`q-${c.id}`, { action: 'qualify', contactId: c.id, meddic: m, callNotes: notes })) setSaved(true); }}>{busy ? <Spinner label="Saving…" /> : 'Save qualification'}</button>
      </div>
      <div className="grid2 gtm-actions">
        <div className="stack-sm"><span className="muted small">Before the call · Call Prepper</span><AgentRun agentId="call-prepper" goal={callPrepGoal(deal)} label="Prep the call" emptyText="" goApprovals={goApprovals} /></div>
        <div className="stack-sm"><span className="muted small">After the call · Deal Qualifier</span><AgentRun agentId="deal-qualifier" goal={notes.trim() ? debriefGoal(deal) : ''} label="Debrief my notes" emptyText="Add call notes to debrief them." goApprovals={goApprovals} /></div>
        <div className="stack-sm"><span className="muted small">Recap and next steps · Follow-up Writer</span><AgentRun agentId="follow-up-writer" goal={followUpGoal(deal)} label={c.email ? 'Draft the follow-up email' : 'Draft the follow-up'} emptyText="" goApprovals={goApprovals} /></div>
        <div className="stack-sm"><span className="muted small">Objection · Objection Handler</span>
          <label className="field"><span className="sr-only">Objection</span><input aria-label={`Objection from ${c.name}`} value={objection} maxLength={500} onChange={(e) => setObjection(e.target.value)} placeholder="e.g. It's too expensive for a clinic our size" /></label>
          <AgentRun agentId="objection-handler" goal={objection.trim() ? objectionGoal(deal, objection) : ''} label="Answer it" emptyText="Type the objection they raised." goApprovals={goApprovals} />
        </div>
        <div className="stack-sm"><span className="muted small">Proposal · Proposal Writer</span><AgentRun agentId="proposal-writer" goal={proposalGoal(deal)} label="Draft the proposal" emptyText="" goApprovals={goApprovals} /></div>
        <div className="stack-sm"><span className="muted small">Won or lost · Win-Loss Analyst</span><AgentRun agentId="win-loss" goal={c.stage === 'won' || c.stage === 'lost' ? winLossGoal(deal) : ''} label="Review this deal" emptyText="Available once the deal is won or lost." goApprovals={goApprovals} /></div>
      </div>
    </div>
  );
}
