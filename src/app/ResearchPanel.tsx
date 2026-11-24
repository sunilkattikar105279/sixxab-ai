// On the customer page: the Business Research agent's sourced report (owner, business, pain points, details
// found on public pages, opportunities) and the Proposal Writer's draft with an ROI the owner can adjust.
// Nothing here sends anything: found details go on the deal only when the owner presses, and the owner sends
// the proposal themselves.
import React, { useMemo, useState } from 'react';
import { AgentRun } from './AgentRun';
import { CopyButton } from './DealAgents';
import type { Contact } from './Customer';
import { proposalDraftGoal, researchGoal } from '../../core/research';
import {
  APPLY_FIELD, computeRoi, CURRENCIES, FIELD_LABEL, fmtMoney, hostOf, proposalMessage,
  type BenefitLine, type CostLine, type Currency, type ProposalDraft,
} from '../../core/research-state';

type Post = (k: string, b: Record<string, unknown>) => Promise<boolean>;
const day = (iso: string) => { const d = new Date(iso); return Number.isNaN(d.getTime()) ? iso : d.toLocaleDateString(undefined, { dateStyle: 'medium' }); };
const Src = ({ url }: { url: string }) => (url ? <a className="small" href={url} target="_blank" rel="noopener noreferrer nofollow">{hostOf(url)}</a> : null);

function Research({ c, busy, post, reload, goApprovals }: { c: Contact; busy: boolean; post: Post; reload: () => void; goApprovals: () => void }) {
  const r = c.researchReport;
  return (
    <div className="stack-sm">
      <div className="row-between"><strong>Business research · Business Research agent</strong>{r && <span className="muted small">{day(r.at)}</span>}</div>
      {r ? (
        <>
          <p className="small prewrap">{r.summary}</p>
          {r.owner && <p className="small"><span className="muted">Owner: </span>{r.owner}</p>}
          {r.presence && <p className="small"><span className="muted">Online presence: </span>{r.presence}</p>}
          {r.pains.length > 0 && (
            <div className="small"><span className="muted">Pain points</span>
              <ul className="research-list">{r.pains.map((p, i) => <li key={i}><strong>{p.point}</strong>{p.evidence ? `. ${p.evidence}` : ''} <Src url={p.source} /></li>)}</ul>
            </div>
          )}
          {r.found.length > 0 && (
            <div className="small"><span className="muted">Details found on public pages (check the source before adding)</span>
              <ul className="research-list">
                {r.found.map((f, i) => {
                  const field = APPLY_FIELD[f.field];
                  const current = field ? String((c as unknown as Record<string, unknown>)[field] ?? '') : '';
                  const same = !!current && current.trim().toLowerCase() === f.value.trim().toLowerCase();
                  return (
                    <li key={i} className="row-between">
                      <span><span className="muted">{FIELD_LABEL[f.field]}: </span>{f.value} <Src url={f.source} />{f.note ? <span className="muted"> · {f.note}</span> : null}</span>
                      {f.usedAt ? <span className="pill pill-done">Added</span>
                        : !field ? null
                        : same ? <span className="pill">On the deal</span>
                        : <button type="button" className="btn-mini" disabled={busy} onClick={() => post(`ruse-${i}`, { action: 'research_use', contactId: c.id, index: i })}>{current ? 'Use this instead' : 'Add to deal'}</button>}
                    </li>
                  );
                })}
              </ul>
            </div>
          )}
          {r.opportunities.length > 0 && (
            <div className="small"><span className="muted">Opportunities for AI agents</span>
              <ul className="research-list">{r.opportunities.map((o, i) => <li key={i}><strong>{o.title}:</strong> {o.how}{o.impact ? <span className="muted"> Impact: {o.impact}</span> : null}</li>)}</ul>
            </div>
          )}
          {r.unknowns && <p className="small"><span className="muted">Could not confirm: </span>{r.unknowns}</p>}
          {r.sources.length > 0 && (
            <details><summary className="small">Sources ({r.sources.length})</summary>
              <ul className="research-list">{r.sources.map((s, i) => <li key={i} className="small"><a href={s.url} target="_blank" rel="noopener noreferrer nofollow">{s.title || hostOf(s.url)}</a></li>)}</ul>
            </details>
          )}
        </>
      ) : <p className="muted small">No research yet. The agent searches public pages using the owner's name, phone and website, and writes up the business, its pain points, contact details the deal is missing (each with its source) and where AI agents would help. Uses up to eight web searches.</p>}
      <AgentRun agentId="business-research" goal={researchGoal(c.id)} label={r ? 'Research again' : 'Research this business'} emptyText="" goApprovals={goApprovals} contactId={c.id} onDone={reload} />
    </div>
  );
}

function ProposalEditor({ c, p, busy, post }: { c: Contact; p: ProposalDraft; busy: boolean; post: Post }) {
  const [subject, setSubject] = useState(p.subject);
  const [body, setBody] = useState(p.text);
  const [currency, setCurrency] = useState<Currency>(p.currency);
  const [benefits, setBenefits] = useState<BenefitLine[]>(p.benefits);
  const [costs, setCosts] = useState<CostLine[]>(p.costs);
  const roi = useMemo(() => computeRoi(benefits, costs), [benefits, costs]);
  const sent = !!p.sentAt;
  const dirty = subject !== p.subject || body !== p.text || currency !== p.currency || JSON.stringify(benefits) !== JSON.stringify(p.benefits) || JSON.stringify(costs) !== JSON.stringify(p.costs);
  const current: ProposalDraft = { ...p, subject, text: body, currency, benefits, costs, roi };
  const message = proposalMessage(current);
  const m = (n: number) => fmtMoney(n, currency);
  const num = (v: string) => Math.max(0, Number(v) || 0);
  const setB = (i: number, k: keyof BenefitLine, v: string) => setBenefits(benefits.map((b, j) => (j === i ? { ...b, [k]: k === 'monthly' ? num(v) : v } : b)));
  const setC = (i: number, k: keyof CostLine, v: string) => setCosts(costs.map((x, j) => (j === i ? { ...x, [k]: k === 'monthly' || k === 'oneTime' ? num(v) : v } : x)));
  const href = c.email ? `mailto:${encodeURIComponent(c.email)}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(message.slice(0, 1800))}` : '';
  return (
    <div className="stack-sm">
      <div className="row-between"><strong>{p.title}</strong>{sent ? <span className="pill pill-done">Sent {day(p.sentAt!)}</span> : <span className="muted small">Draft by {p.by}, {day(p.editedAt ?? p.at)}{p.editedAt ? ' (edited)' : ''}</span>}</div>
      {p.summary && <p className="small">{p.summary}</p>}
      {p.opportunities.length > 0 && (
        <ul className="research-list small">{p.opportunities.map((o, i) => <li key={i}><strong>{o.title}:</strong> {o.what}{o.benefit ? <span className="muted"> Benefit: {o.benefit}</span> : null}</li>)}</ul>
      )}
      <div className="roi">
        <div className="row-between"><span className="muted small">Return on investment · every number has its basis</span>
          {!sent && <select aria-label="Currency" className="roi-cur" value={currency} onChange={(e) => setCurrency(e.target.value as Currency)}>{CURRENCIES.map((x) => <option key={x}>{x}</option>)}</select>}
        </div>
        <table className="roi-table">
          <thead><tr><th>Line</th><th>A month</th><th>One-time</th><th>Basis</th></tr></thead>
          <tbody>
            {benefits.map((b, i) => (
              <tr key={`b${i}`}><td>{b.label}</td>
                <td>{sent ? m(b.monthly) : <input aria-label={`${b.label} a month`} type="number" min={0} step="any" value={b.monthly} onChange={(e) => setB(i, 'monthly', e.target.value)} />}</td>
                <td className="muted">gain</td>
                <td>{sent ? b.basis : <input aria-label={`${b.label} basis`} value={b.basis} onChange={(e) => setB(i, 'basis', e.target.value)} />}</td></tr>
            ))}
            {costs.map((x, i) => (
              <tr key={`c${i}`}><td>{x.label}</td>
                <td>{sent ? m(x.monthly) : <input aria-label={`${x.label} a month`} type="number" min={0} step="any" value={x.monthly} onChange={(e) => setC(i, 'monthly', e.target.value)} />}</td>
                <td>{sent ? m(x.oneTime) : <input aria-label={`${x.label} one-time`} type="number" min={0} step="any" value={x.oneTime} onChange={(e) => setC(i, 'oneTime', e.target.value)} />}</td>
                <td>{sent ? x.basis : <input aria-label={`${x.label} basis`} value={x.basis} onChange={(e) => setC(i, 'basis', e.target.value)} />}</td></tr>
            ))}
          </tbody>
        </table>
        <div className="cost-tiles roi-tiles">
          <div><span className="muted small">Net gain a month</span><strong>{m(roi.netMonthly)}</strong></div>
          <div><span className="muted small">First-year return</span><strong>{roi.roiPct === null ? '—' : `${roi.roiPct}%`}</strong></div>
          <div><span className="muted small">Setup pays back</span><strong>{roi.paybackMonths === null ? '—' : roi.oneTime > 0 ? `${roi.paybackMonths} mo` : 'at once'}</strong></div>
        </div>
      </div>
      {p.plan && <details><summary className="small">Plan and timeline</summary><p className="small prewrap">{p.plan}</p></details>}
      {p.nextStep && <p className="small"><span className="muted">Next step to sign: </span>{p.nextStep}</p>}
      {sent ? <details><summary className="small">What you sent</summary><p className="small prewrap">{message}</p></details> : (
        <>
          <label className="small muted" htmlFor={`ps-${p.id}`}>Email subject</label>
          <input id={`ps-${p.id}`} className="path-input" value={subject} onChange={(e) => setSubject(e.target.value)} />
          <label className="small muted" htmlFor={`pt-${p.id}`}>Proposal (the ROI section above is added when you copy or email it)</label>
          <textarea id={`pt-${p.id}`} className="proposal-text" rows={12} value={body} onChange={(e) => setBody(e.target.value)} />
        </>
      )}
      {!sent && (
        <div className="row-end">
          {dirty && <button type="button" className="btn-ghost" disabled={busy} onClick={() => post(`pedit-${p.id}`, { action: 'proposal_edit', contactId: c.id, edit: { subject, text: body, currency, benefits, costs } })}>Save changes</button>}
          <CopyButton text={`Subject: ${subject}\n\n${message}`} />
          {href && <a className="btn-mini" href={href}>Open in email</a>}
          <button type="button" className="btn-primary" disabled={busy || dirty} title={dirty ? 'Save your changes first' : undefined} onClick={() => post(`psent-${p.id}`, { action: 'proposal_sent', contactId: c.id })}>I sent it</button>
        </div>
      )}
      {!sent && message.length > 1800 && href && <p className="muted small">Long proposals may be cut short in "Open in email"; use Copy for the full text.</p>}
    </div>
  );
}

export function ResearchPanel({ c, busy, post, reload, goApprovals }: { c: Contact; busy: boolean; post: Post; reload: () => void; goApprovals: () => void }) {
  const p = c.proposal;
  return (
    <section className="panel glass-card" id="research-and-proposal">
      <p className="eyebrow">Research and proposal</p>
      <h3>Know them, then propose</h3>
      <div className="stack">
        <Research c={c} busy={busy} post={post} reload={reload} goApprovals={goApprovals} />
        <div className="stack-sm">
          <strong>Proposal · Proposal Writer</strong>
          {p ? <ProposalEditor key={`${p.id}:${p.editedAt ?? ''}:${p.sentAt ?? ''}`} c={c} p={p} busy={busy} post={post} />
            : <p className="muted small">No proposal yet. The agent turns the research, call notes and your offer into opportunities, benefits and an ROI. The app works out the ROI from lines you can adjust, and you edit and send the proposal yourself.</p>}
          {c.stage !== 'lost' && <AgentRun agentId="proposal-writer" goal={proposalDraftGoal(c.id)} label={p ? 'Redraft the proposal' : 'Draft the proposal'} emptyText="" goApprovals={goApprovals} contactId={c.id} onDone={reload} />}
        </div>
      </div>
    </section>
  );
}
