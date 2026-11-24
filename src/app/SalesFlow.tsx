// Sales flow at the top of the CRM tab: the nine stages from finding a lead to keeping the customer, and
// one queue of next actions. Agents prepare each action on their own; the owner sends, approves or skips.
// Nothing here sends anything: messages are copied (or opened in the owner's email) and marked sent.
import React, { useState } from 'react';
import { api } from '../lib/auth';
import { Spinner } from './ui';
import { Fold, reveal } from './Fold';
import { AgentRun } from './AgentRun';
import { CopyButton } from './DealAgents';
import { stageName, type Contact } from './Customer';
import { scoreGoal, sequenceGoal } from '../../core/leadgen';
import { accountReviewGoal, findGoal, onboardingGoal } from '../../core/salesflow';
import { proposalDraftGoal, researchGoal } from '../../core/research';
import { callPrepGoal, followUpGoal, winLossGoal } from '../../core/gtm';
import { AUTO_RULES, FIND_COUNT, FLOW_STAGES, type FlowOrg, type FlowStage, type NextAction } from '../../core/salesflow-state';

type Post = (k: string, b: Record<string, unknown>) => Promise<boolean>;
export interface FlowState { contacts: Contact[]; flowOrg: FlowOrg; flowCounts: Record<FlowStage, number>; nextActions: NextAction[]; icps?: { id: string; name: string }[]; lastProspectSearch?: string | null }

/** The sales process write-up, shown to SIXXAB admins only (it lives in the owner's own Claude account). */
const PROCESS_DOC = 'https://claude.ai/artifact/FiaUvmmdRJC66JoMRhbATW';
const STAGE_OF = Object.fromEntries(FLOW_STAGES.map((s) => [s.key, s])) as Record<FlowStage, (typeof FLOW_STAGES)[number]>;
const AGENT_LABEL: Record<string, string> = {
  'lead-finder': `Find ${FIND_COUNT} prospects`, 'business-research': 'Research it', 'lead-scorer': 'Score it', 'outreach-sequencer': 'Draft the outreach', 'onboarding-manager': 'Plan onboarding', 'customer-success': 'Run the health check',
  'call-prepper': 'Prep the call', 'follow-up-writer': 'Draft the follow-up', 'proposal-writer': 'Draft the proposal', 'win-loss': 'Review the loss',
};
const CHANNEL: Record<string, string> = { email: 'Email', linkedin: 'LinkedIn', call: 'Call', text: 'Text message' };

/** The prompt each agent action runs on, built from the deal (the same goals the server's autopilot uses). */
export function goalFor(a: NextAction, c?: Contact): string {
  if (a.rule === 'find') return findGoal(a);
  if (!c) return '';
  switch (a.rule) {
    case 'score': return scoreGoal([c.id]);
    case 'sequence': return sequenceGoal([c.id]);
    case 'onboard': return onboardingGoal(c.id);
    case 'review': return accountReviewGoal(c.id);
    case 'discovery': return callPrepGoal(c);
    case 'quiet': case 'proposal_quiet': return followUpGoal(c);
    case 'research': return researchGoal(c.id);
    case 'proposal': return proposalDraftGoal(c.id);
    case 'winloss': return winLossGoal(c);
    default: return '';
  }
}

const mailto = (to: string, subject: string, body: string) => `mailto:${encodeURIComponent(to)}?${subject ? `subject=${encodeURIComponent(subject)}&` : ''}body=${encodeURIComponent(body.slice(0, 1800))}`;
const dueText = (iso: string) => { const days = Math.floor((Date.now() - Date.parse(iso)) / 864e5); return days >= 1 ? `Due ${days} day${days === 1 ? '' : 's'} ago` : days <= -1 ? `Due in ${-days} day${days === -1 ? '' : 's'}` : 'Due today'; };

function SendDraft({ a, busy, post }: { a: NextAction; busy: boolean; post: Post }) {
  const d = a.draft!;
  const [body, setBody] = useState(d.text);
  const email = d.channel === 'email' && d.to.includes('@');
  const markSent = () => post(a.key, a.rule === 'send_step' ? { action: 'sequence_sent', contactId: a.contactId, index: a.stepIndex } : a.rule === 'proposal_send' ? { action: 'proposal_sent', contactId: a.contactId } : { action: 'customer_sent', contactId: a.contactId, kind: a.msg });
  return (
    <div className="stack-xs">
      <details>
        <summary className="small">{CHANNEL[d.channel] ?? d.channel}{d.to ? ` to ${d.to}` : ''}: read or edit the draft</summary>
        {d.subject && <p className="small"><span className="muted">Subject: </span>{d.subject}</p>}
        <textarea aria-label="Draft message" rows={7} value={body} onChange={(e) => setBody(e.target.value)} />
        <p className="muted small">Edits here are copied with the message; the saved draft stays as the agent wrote it.</p>
      </details>
      <div className="row-end">
        <CopyButton text={d.subject ? `Subject: ${d.subject}\n\n${body}` : body} />
        {email && <a className="btn-mini" href={mailto(d.to, d.subject, body)}>Open in email</a>}
        <button type="button" className="btn-primary" disabled={busy} onClick={markSent}>I sent it</button>
      </div>
    </div>
  );
}

/** One next action, with the one control it needs: run the agent, send the draft, approve, mark done or open. */
export function ActionCard({ a, c, busy, post, reload, goApprovals, open, showCompany = true }: {
  a: NextAction; c?: Contact; busy: boolean; post: Post; reload: () => void; goApprovals: () => void; open?: (c: Contact) => void; showCompany?: boolean;
}) {
  const skip = () => post(`skip-${a.key}`, { action: 'action_skip', key: a.key });
  const goto = reveal;
  const gotoImport = () => { goto('import-research'); setTimeout(() => document.querySelector<HTMLInputElement>('#import-research input[type="file"]')?.focus({ preventScroll: true }), 450); };
  return (
    <li className="action-card">
      <div className="row-between">
        <span className="row-wrap"><span className="pill">{STAGE_OF[a.stage]?.name ?? a.stage}</span>{showCompany && a.company && c && open && <button type="button" className="link-btn small" onClick={() => open(c)}>{a.company}</button>}</span>
        <span className="muted small">{dueText(a.due)}</span>
      </div>
      <strong>{a.title}</strong>
      <p className="muted small">{a.why}</p>
      {a.kind === 'agent' && a.agentId && <AgentRun agentId={a.agentId} goal={goalFor(a, c)} label={AGENT_LABEL[a.agentId] ?? 'Run the agent'} emptyText="Open the record to run this." goApprovals={goApprovals} contactId={a.contactId} onDone={reload} />}
      {a.kind === 'send' && a.draft && <SendDraft a={a} busy={busy} post={post} />}
      {a.kind === 'approve' && (
        <div className="row-end">
          <button type="button" className="btn-ghost" disabled={busy} onClick={() => (a.rule === 'sync' ? post(a.key, { action: 'sync_dismiss', contactId: a.contactId }) : skip())}>Not now</button>
          <button type="button" className="btn-primary" disabled={busy} onClick={() => post(a.key, a.rule === 'sync' ? { action: 'sync_apply', contactId: a.contactId } : { action: 'stage', contactId: a.contactId, stage: a.suggestStage })}>Move to {stageName(a.suggestStage ?? '')}</button>
        </div>
      )}
      {a.kind === 'task' && <div className="row-end"><button type="button" className="btn-primary" disabled={busy} onClick={() => post(a.key, { action: 'onboarding_step', contactId: a.contactId, index: a.stepIndex })}>Mark done</button></div>}
      {a.kind === 'open' && (
        <div className="row-end">
          {a.rule === 'approvals' && <button type="button" className="btn-primary" onClick={goApprovals}>Open Approvals</button>}
          {a.rule === 'icp' && <button type="button" className="btn-primary" onClick={() => goto('who-you-sell-to')}>Go to Who you sell to</button>}
          {a.rule === 'prospects' && <button type="button" className="btn-primary" onClick={() => goto('find-prospects')}>Review the prospects</button>}
          {a.rule === 'research_import' && <button type="button" className="btn-primary" onClick={gotoImport}>Import research</button>}
          {a.rule === 'renewal' && c && open && <button type="button" className="btn-primary" onClick={() => open(c)}>Open the customer</button>}
        </div>
      )}
      {a.rule !== 'icp' && <div className="row-end"><button type="button" className="link-btn small" disabled={busy} onClick={skip}>Skip for a week</button></div>}
    </li>
  );
}

export function SalesFlow({ crm, busy, post, reload, goApprovals, open, admin }: { crm: FlowState; busy: boolean; post: Post; reload: () => void; goApprovals: () => void; open: (c: Contact) => void; admin?: boolean }) {
  const [stage, setStage] = useState<FlowStage | 'all'>('all');
  const [all, setAll] = useState(false);
  const [auto, setAuto] = useState<{ running: boolean; done: number; total: number; error?: string } | null>(null);
  const byId = new Map(crm.contacts.map((c) => [c.id, c]));
  const actions = crm.nextActions ?? [];
  const list = stage === 'all' ? actions : actions.filter((a) => a.stage === stage);
  const shown = all ? list : list.slice(0, 6);
  const todoIn = (s: FlowStage) => actions.filter((a) => a.stage === s).length;
  const autoTodo = actions.filter((a) => AUTO_RULES.includes(a.rule) && a.contactId && byId.has(a.contactId)).slice(0, 3);
  const on = !!crm.flowOrg?.autopilot?.on;
  const findOn = !!crm.flowOrg?.autofind?.on;
  const icp = crm.icps?.[0];
  const goto = reveal;
  const lastSearch = crm.lastProspectSearch ? Math.floor((Date.now() - Date.parse(crm.lastProspectSearch)) / 864e5) : null;

  async function prepareNow() {
    setAuto({ running: true, done: 0, total: autoTodo.length });
    try {
      for (let i = 0; i < autoTodo.length; i++) {
        const a = autoTodo[i];
        await api('/api/agents', { method: 'POST', body: JSON.stringify({ goal: goalFor(a, byId.get(a.contactId!)), agentId: a.agentId, contactId: a.contactId }) });
        setAuto({ running: true, done: i + 1, total: autoTodo.length });
      }
      setAuto({ running: false, done: autoTodo.length, total: autoTodo.length });
    } catch (e) {
      setAuto((s) => ({ running: false, done: s?.done ?? 0, total: autoTodo.length, error: e instanceof Error ? e.message : 'An agent could not run.' }));
    } finally {
      reload();
    }
  }

  return (
    <Fold id="sales-flow" open title="Sales flow" eyebrow="From first lead to loyal customer · agents prepare, you approve" hint={actions.length ? `${actions.length} next action${actions.length === 1 ? '' : 's'}` : 'Nothing to do'}>
      <div className="flow-strip" role="list" aria-label="Sales flow stages">
        {FLOW_STAGES.map((s, i) => (
          <button key={s.key} type="button" role="listitem" className={`flow-tile${stage === s.key ? ' on' : ''}`} aria-pressed={stage === s.key} onClick={() => { setStage(stage === s.key ? 'all' : s.key); setAll(false); }}>
            <span className="muted small">{i + 1}. {s.name}</span>
            <strong>{crm.flowCounts?.[s.key] ?? 0}</strong>
            <span className="muted small">{todoIn(s.key) ? `${todoIn(s.key)} to do` : s.key === 'find' ? 'prospects waiting' : 'deals'}</span>
          </button>
        ))}
      </div>

      <div className="row-between" style={{ marginTop: 18 }}>
        <h3>Next actions{stage !== 'all' ? ` · ${STAGE_OF[stage].name}` : ''}</h3>
        {stage !== 'all' && <button type="button" className="link-btn small" onClick={() => setStage('all')}>Show every stage</button>}
      </div>
      {stage !== 'all' && <p className="muted small">{STAGE_OF[stage].does} Agents: {STAGE_OF[stage].agents.join(', ')}. {STAGE_OF[stage].gate}</p>}
      {list.length === 0 ? <p className="muted small">Nothing to do here right now.</p> : (
        <ol className="action-list">
          {shown.map((a) => <ActionCard key={a.key} a={a} c={a.contactId ? byId.get(a.contactId) : undefined} busy={busy} post={post} reload={reload} goApprovals={goApprovals} open={open} />)}
        </ol>
      )}
      {list.length > shown.length && <div className="row-end"><button type="button" className="btn-ghost" onClick={() => setAll(true)}>Show all {list.length}</button></div>}

      <details className="head-group">
        <summary>Autopilot and weekly search <span className="muted small">autopilot {on ? 'on' : 'off'} · weekly search {findOn ? 'on' : 'off'}</span></summary>
        <div className="flow-auto">
          <div className="stack-xs">
            <strong>Autopilot {on ? 'is on' : 'is off'}</strong>
            <p className="muted small">Each morning it prepares up to 3 drafts from the top of this queue: lead scores, outreach drafts, onboarding plans and health checks. It never sends a message or moves a deal; those stay with you.</p>
            {auto && <p className={auto.error ? 'error' : 'muted small'} role="status">{auto.error ? `Stopped after ${auto.done} of ${auto.total}: ${auto.error}` : auto.running ? `Preparing ${auto.done + 1} of ${auto.total}…` : `Prepared ${auto.done} draft${auto.done === 1 ? '' : 's'}. They are in the queue above.`}</p>}
          </div>
          <div className="row-end">
            <button type="button" className="btn-ghost" disabled={busy} onClick={() => post('autopilot', { action: 'autopilot', on: !on })}>{on ? 'Turn autopilot off' : 'Turn autopilot on'}</button>
            <button type="button" className="btn-primary" disabled={busy || auto?.running || autoTodo.length === 0} onClick={prepareNow}>{auto?.running ? <Spinner label="Agents working…" /> : autoTodo.length ? `Prepare ${autoTodo.length} draft${autoTodo.length === 1 ? '' : 's'} now` : 'Nothing to prepare'}</button>
          </div>
        </div>

        <div className="flow-auto" id="weekly-prospects">
          <div className="stack-xs">
            <strong>Weekly prospect search {findOn ? 'is on' : 'is off'}</strong>
            <p className="muted small">{icp
              ? `Once a week, early in the morning, the Prospect Generator looks on public pages for ${FIND_COUNT} new businesses that fit "${icp.name}", skipping ones already in the CRM. They wait under Find new prospects for your tick; nothing is added or contacted until then. Each search uses a few web searches.`
              : 'Build an ICP under Who you sell to first. The weekly search looks for businesses that fit it.'}
              {lastSearch !== null ? ` Last search: ${lastSearch === 0 ? 'today' : `${lastSearch} day${lastSearch === 1 ? '' : 's'} ago`}.` : ''}</p>
          </div>
          <div className="row-end">
            <button type="button" className="btn-ghost" disabled={busy || (!icp && !findOn)} onClick={() => post('autofind', { action: 'autofind', on: !findOn })}>{findOn ? 'Turn weekly search off' : 'Turn weekly search on'}</button>
            <button type="button" className="btn-primary" onClick={() => goto('find-prospects')}>Find prospects now</button>
          </div>
        </div>
      </details>

      <details className="head-group">
        <summary>How the sales flow works</summary>
        <ol className="flow-how">
          {FLOW_STAGES.map((s) => <li key={s.key} className="small"><strong>{s.name}:</strong> {s.does} <span className="muted">Agents: {s.agents.join(', ')}. {s.gate}</span></li>)}
        </ol>
        <p className="muted small">Every agent action is logged in the deal's history. Agents work only from what the record says and mark what they don't know.</p>
        {admin && <p className="small"><a href={PROCESS_DOC} target="_blank" rel="noopener noreferrer">Read the full sales process</a> <span className="muted">(your Claude Doc, visible to admins only)</span></p>}
      </details>
    </Fold>
  );
}
