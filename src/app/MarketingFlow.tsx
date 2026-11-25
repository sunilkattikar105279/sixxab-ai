// Marketing flow at the top of the Marketing tab: the eight inbound stages from the assessment to measuring results, defined
// the same way as the sales flow in the CRM tab, with one queue of next actions. Enquiries are answered and handed to sales
// in the same CRM; the queue sends the owner there. Agents only plan and draft; nothing posts, spends or sends from here.
import React, { useState } from 'react';
import { Fold, reveal } from './Fold';
import { AgentRun } from './AgentRun';
import { OriginStrip, Definitions } from './OriginStrip';
import { MKT_STAGES, type MktAction, type MktFlow, type MktStage } from '../../core/marketingflow';

type Goals = { assessor: string; cmo: string; creatives: string; publishing: string; ads: string };
const STAGE_OF = Object.fromEntries(MKT_STAGES.map((s) => [s.key, s])) as Record<MktStage, (typeof MKT_STAGES)[number]>;
const AGENT_LABEL: Record<string, string> = {
  'business-assessor': 'Check my online presence', cmo: 'Have the CMO agent plan it', 'ad-creative-producer': 'Brief the ads', 'social-publisher': 'Draft the posts', 'ads-manager': 'Plan the paid ads',
};
const OPEN_LABEL: Record<string, string> = { 'mk-assess': 'Go to the assessment', 'mk-plans': 'See the plans', 'mk-studio': 'Open the ad studio', 'mk-publish': 'Open social publishing', 'mk-leadform': 'Open the lead form' };

function MktCard({ a, goals, goCrm, goApprovals, reload }: { a: MktAction; goals: Goals; goCrm: () => void; goApprovals: () => void; reload: () => void }) {
  return (
    <li className="action-card">
      <div className="row-between"><span className="pill">{STAGE_OF[a.stage]?.name ?? a.stage}</span></div>
      <strong>{a.title}</strong>
      <p className="muted small">{a.why}</p>
      {a.kind === 'agent' && a.agentId && a.goal && <AgentRun agentId={a.agentId} goal={goals[a.goal]} label={AGENT_LABEL[a.agentId] ?? 'Run the agent'} emptyText="Finish the step above it first." goApprovals={goApprovals} onDone={reload} />}
      {a.kind === 'open' && a.target && <div className="row-end"><button type="button" className="btn-primary" onClick={() => reveal(a.target!)}>{OPEN_LABEL[a.target] ?? 'Open it'}</button></div>}
      {a.kind === 'crm' && <div className="row-end"><button type="button" className="btn-primary" onClick={goCrm}>Answer them in the CRM</button></div>}
    </li>
  );
}

export function MarketingFlow({ flow, goals, currency, goCrm, goApprovals, reload }: {
  flow: MktFlow; goals: Goals; currency: string; goCrm: () => void; goApprovals: () => void; reload: () => void;
}) {
  const [stage, setStage] = useState<MktStage | 'all'>('all');
  const [all, setAll] = useState(false);
  const list = stage === 'all' ? flow.actions : flow.actions.filter((a) => a.stage === stage);
  const shown = all ? list : list.slice(0, 5);
  const todoIn = (s: MktStage) => flow.actions.filter((a) => a.stage === s).length;
  return (
    <Fold id="mk-flow" open title="Marketing flow" eyebrow="From first impression to an enquiry handed to sales · agents prepare, you approve" hint={flow.actions.length ? `${flow.actions.length} next action${flow.actions.length === 1 ? '' : 's'}` : 'Nothing to do'}>
      <div className="flow-strip" role="list" aria-label="Marketing flow stages">
        {MKT_STAGES.map((s, i) => (
          <button key={s.key} type="button" role="listitem" className={`flow-tile${stage === s.key ? ' on' : ''}`} aria-pressed={stage === s.key} onClick={() => { setStage(stage === s.key ? 'all' : s.key); setAll(false); }}>
            <span className="muted small">{i + 1}. {s.name}</span>
            <strong>{flow.stats[s.key].value}</strong>
            <span className="muted small">{todoIn(s.key) ? `${todoIn(s.key)} to do` : flow.stats[s.key].note}</span>
          </button>
        ))}
      </div>

      <div className="row-between" style={{ marginTop: 18 }}>
        <h3>Next actions{stage !== 'all' ? ` · ${STAGE_OF[stage].name}` : ''}</h3>
        {stage !== 'all' && <button type="button" className="link-btn small" onClick={() => setStage('all')}>Show every stage</button>}
      </div>
      {stage !== 'all' && <p className="muted small">{STAGE_OF[stage].does} Agents: {STAGE_OF[stage].agents.join(', ')}. {STAGE_OF[stage].gate}</p>}
      {list.length === 0 ? <p className="muted small">Nothing to do here right now.</p> : (
        <ol className="action-list">{shown.map((a) => <MktCard key={a.key} a={a} goals={goals} goCrm={goCrm} goApprovals={goApprovals} reload={reload} />)}</ol>
      )}
      {list.length > shown.length && <div className="row-end"><button type="button" className="btn-ghost" onClick={() => setAll(true)}>Show all {list.length}</button></div>}

      <details className="head-group">
        <summary>Inbound and outbound <span className="muted small">{flow.origin.inbound.leads30} inbound · {flow.origin.outbound.leads30} outbound in 30 days</span></summary>
        <OriginStrip origin={flow.origin} currency={currency} />
        <p className="muted small">One CRM for both. Enquiries land as new leads with their source; once answered they move to Contacted and the sales flow takes over. Sales results feed back here: the CMO agent and the Ads Manager plan from your ICP and the sources that win.</p>
      </details>

      <details className="head-group">
        <summary>How the marketing flow works</summary>
        <ol className="flow-how">
          {MKT_STAGES.map((s) => <li key={s.key} className="small"><strong>{s.name}:</strong> {s.does} <span className="muted">Agents: {s.agents.join(', ')}. {s.gate}</span></li>)}
        </ol>
        <p className="muted small">The hand-off: an answered enquiry moves from New lead to Contacted in the CRM. From there it is a sales deal: discovery, proposal, close, onboarding and retention, the same as an outbound prospect.</p>
        <Definitions />
      </details>
    </Fold>
  );
}
