// Inbound against outbound, from the one CRM both flows share, and the definitions both tabs use. Shown in the sales flow
// (CRM tab) and the marketing flow (Marketing tab), so both read the same numbers in the same words.
import React from 'react';
import { money } from './AgentRun';
import type { OriginPipeline } from '../../core/channels';
import { FLOW_TERMS } from '../../core/marketingflow';

export function OriginStrip({ origin, currency = 'USD' }: { origin: OriginPipeline; currency?: string }) {
  const row = (name: string, t: OriginPipeline['inbound'], who: string) => (
    <div>
      <span className="muted small">{name}</span>
      <strong>{t.leads30}</strong>
      <span className="muted small">new in 30 days · {t.open} open · {t.won} won{t.wonValue ? ` (${money(t.wonValue, currency)})` : ''}{t.winRate !== null ? ` · ${t.winRate}% win rate` : ''}</span>
      <span className="muted small">{who}</span>
    </div>
  );
  const top = origin.inboundBySource.slice(0, 4);
  return (
    <div className="stack-xs">
      <div className="cost-tiles origin-tiles">
        {row('Inbound', origin.inbound, 'They came to you: marketing')}
        {row('Outbound', origin.outbound, 'You went to them: sales')}
      </div>
      {top.length > 0 && <p className="muted small">Inbound by source: {top.map((r) => `${r.label} ${r.leads}${r.won ? ` (${r.won} won)` : ''}`).join(' · ')}</p>}
    </div>
  );
}

export function Definitions() {
  return (
    <details className="head-group">
      <summary>Definitions</summary>
      <dl className="lead-facts flow-terms">
        {FLOW_TERMS.map((t) => <div key={t.term}><dt>{t.term}</dt><dd className="small">{t.means}</dd></div>)}
      </dl>
    </details>
  );
}
