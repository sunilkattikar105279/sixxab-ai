// After the win, on the customer page: the onboarding plan (welcome email, kickoff, dated steps) and the
// latest account review (health, risks, check-in, renewal, upsell, referral). Drafts only: the owner sends.
import React from 'react';
import { AgentRun } from './AgentRun';
import { CopyButton } from './DealAgents';
import type { Contact } from './Customer';
import { accountReviewGoal, onboardingGoal } from '../../core/salesflow';
import { wasSent, type CustomerFlow, type CustomerMsg, type Draft } from '../../core/salesflow-state';

type Post = (k: string, b: Record<string, unknown>) => Promise<boolean>;
const day = (iso: string) => { const d = new Date(iso); return Number.isNaN(d.getTime()) ? iso : d.toLocaleDateString(undefined, { dateStyle: 'medium' }); };
const OWNER: Record<string, string> = { you: 'You', customer: 'Customer', agent: 'Agent drafts, you confirm' };
const BAND: Record<string, [string, string]> = { healthy: ['Healthy', 'pill-done'], watch: ['Watch', 'pill-awaiting_approval'], at_risk: ['At risk', 'pill-failed'] };

function DraftBlock({ title, d, sent, kind, c, busy, post }: { title: string; d: Draft; sent: boolean; kind: CustomerMsg; c: Contact; busy: boolean; post: Post }) {
  const href = c.email ? `mailto:${encodeURIComponent(c.email)}?${d.subject ? `subject=${encodeURIComponent(d.subject)}&` : ''}body=${encodeURIComponent(d.text.slice(0, 1800))}` : '';
  return (
    <div className="stack-xs">
      <div className="row-between">
        <strong className="small">{title}</strong>
        <span className="row-wrap">
          <CopyButton text={d.subject ? `Subject: ${d.subject}\n\n${d.text}` : d.text} />
          {href && !sent && <a className="btn-mini" href={href}>Open in email</a>}
          {sent ? <span className="pill pill-done">Sent</span> : <button type="button" className="btn-mini" disabled={busy} onClick={() => post(`sent-${kind}`, { action: 'customer_sent', contactId: c.id, kind })}>I sent it</button>}
        </span>
      </div>
      {d.subject && <p className="small"><span className="muted">Subject: </span>{d.subject}</p>}
      <p className="small prewrap">{d.text}</p>
    </div>
  );
}

export function CustomerSuccess({ c, busy, post, reload, goApprovals }: { c: Contact; busy: boolean; post: Post; reload: () => void; goApprovals: () => void }) {
  const cf: CustomerFlow = c.customer ?? { wonAt: null, onboarding: null, review: null, sent: [] };
  const o = cf.onboarding;
  const r = cf.review;
  const done = o ? o.steps.filter((s) => s.doneAt).length : 0;
  return (
    <section className="panel glass-card">
      <p className="eyebrow">Customer success{cf.wonAt ? ` · customer since ${day(cf.wonAt)}` : ''}</p>
      <h3>Onboard, retain and grow</h3>
      <div className="stack">
        <div className="stack-sm">
          <div className="row-between"><strong>Onboarding · Onboarding Manager</strong>{o && <span className={`pill ${done === o.steps.length ? 'pill-done' : ''}`}>{done} of {o.steps.length} done</span>}</div>
          {o ? (
            <>
              {o.welcome && <DraftBlock title="Welcome email" d={o.welcome} sent={wasSent(cf, 'welcome', o.id)} kind="welcome" c={c} busy={busy} post={post} />}
              <ol className="sequence">
                {o.steps.map((s, i) => (
                  <li key={i} className={s.doneAt ? 'sent' : ''}>
                    <div className="row-between">
                      <span className="small"><strong>Day {s.day}</strong> · {s.title} <span className="muted">({OWNER[s.owner] ?? s.owner})</span></span>
                      {s.doneAt ? <span className="pill pill-done">Done {day(s.doneAt)}</span> : <button type="button" className="btn-mini" disabled={busy} onClick={() => post(`ostep-${i}`, { action: 'onboarding_step', contactId: c.id, index: i })}>Mark done</button>}
                    </div>
                  </li>
                ))}
              </ol>
              {o.kickoff && <details><summary className="small">Kickoff agenda</summary><p className="small prewrap">{o.kickoff}</p></details>}
              {o.notes && <p className="small"><span className="muted">Check first: </span>{o.notes}</p>}
            </>
          ) : <p className="muted small">No plan yet. The agent drafts a welcome email, a kickoff agenda and five to eight dated steps for the first 30 days from this record.</p>}
          <AgentRun agentId="onboarding-manager" goal={onboardingGoal(c.id)} label={o ? 'Redraft the plan' : 'Plan onboarding'} emptyText="" goApprovals={goApprovals} contactId={c.id} onDone={reload} />
        </div>

        <div className="stack-sm">
          <div className="row-between"><strong>Account health · Customer Success Manager</strong>{r && <span className={`pill ${BAND[r.band]?.[1] ?? ''}`}>Health {r.health} · {BAND[r.band]?.[0] ?? r.band}</span>}</div>
          {r ? (
            <>
              <p className="small prewrap">{r.reasons}<br /><span className="muted small">Reviewed {day(r.at)} by {r.by}</span></p>
              {r.risks && <p className="small"><span className="muted">Risks: </span>{r.risks}</p>}
              {r.checkIn && <DraftBlock title="Check-in message" d={r.checkIn} sent={wasSent(cf, 'checkin', r.id)} kind="checkin" c={c} busy={busy} post={post} />}
              {(r.renewalDate || r.renewalPlan) && <p className="small"><span className="muted">Renewal{r.renewalDate ? ` on ${day(r.renewalDate)}` : ''}: </span>{r.renewalPlan || 'No plan yet.'}</p>}
              {r.upsell.length > 0 && <div className="small"><span className="muted">Ways to grow the account:</span><ul>{r.upsell.map((u, i) => <li key={i}>{u}</li>)}</ul></div>}
              {r.referral && <DraftBlock title="Referral ask" d={r.referral} sent={wasSent(cf, 'referral', r.id)} kind="referral" c={c} busy={busy} post={post} />}
            </>
          ) : <p className="muted small">No review yet. Once a month the agent scores health from this record, names the risks, drafts a check-in and plans the renewal; for healthy customers it adds upsell ideas and a referral ask.</p>}
          <AgentRun agentId="customer-success" goal={accountReviewGoal(c.id)} label={r ? 'Run a new health check' : 'Run the health check'} emptyText="" goApprovals={goApprovals} contactId={c.id} onDone={reload} />
        </div>
      </div>
    </section>
  );
}
