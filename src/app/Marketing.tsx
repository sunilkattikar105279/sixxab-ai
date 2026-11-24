// Marketing tab: the AI marketing agency under the CMO agent. The owner answers the assessment, sees readiness and gaps,
// gets a 30-day plan (tailored by the CMO agent), and picks a plan at a Stripe or PayPal checkout. Nothing is posted or
// spent from here; ads and posts the agents draft wait in Approvals.
import React, { useEffect, useRef, useState } from 'react';
import { api } from '../lib/auth';
import type { Answers, MarketingPlan, MarketingState, Question } from '../../core/marketing';
import type { PaySetup } from '../../core/payments';
import { Fold } from './Fold';
import { Spinner } from './ui';
import { useLoad } from './useLoad';
import { AgentRun, money } from './AgentRun';

interface Customer { orgId: string; name: string; planName: string; provider: string; mode: string; status: string; amount: number; currency: string; lastPaidAt: string; readiness: number }
interface View {
  marketing: MarketingState; plans: MarketingPlan[]; sections: { title: string; questions: Question[] }[]; payments: PaySetup;
  goals: { assessor: string; cmo: string }; admin: boolean; agency: { customers: Customer[]; added: number; monthlyLiveUsd: number } | null;
}

const CHECKOUT_HOSTS = /^https:\/\/(checkout\.stripe\.com|(www\.)?(sandbox\.)?paypal\.com)\//;
const day = (iso: string) => new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });

export function Marketing({ goApprovals }: { goApprovals: () => void }) {
  const { data, error, reload } = useLoad<View>('/api/marketing');
  const [answers, setAnswers] = useState<Answers | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [booking, setBooking] = useState<string | null>(null);
  const returned = useRef(false);

  useEffect(() => { if (data && !answers) setAnswers(data.marketing.answers); }, [data, answers]);
  useEffect(() => { fetch('/api/config').then((r) => r.json()).then((c: { bookingUrl?: string | null }) => setBooking(c.bookingUrl ?? null)).catch(() => setBooking(null)); }, []);

  // Coming back from Stripe or PayPal: record the payment once, then tidy the address bar.
  useEffect(() => {
    if (returned.current) return;
    returned.current = true;
    const q = new URLSearchParams(location.search);
    const from = q.get('marketing');
    if (!from) return;
    history.replaceState(null, '', '/app');
    if (from === 'cancelled') { setNotice('Checkout was cancelled. Nothing was charged.'); return; }
    const provider = from === 'stripe' ? 'stripe' : from === 'paypal' ? 'paypal' : '';
    const ref = provider === 'stripe' ? q.get('ref') : q.get('subscription_id');
    if (!provider || !ref) return;
    setBusy('confirm');
    api<{ paid: boolean }>('/api/marketing', { method: 'POST', body: JSON.stringify({ action: 'confirm', provider, ref }) })
      .then((r) => { setNotice(r.paid ? 'Payment received. Your marketing plan is active and onboarding has started.' : 'The payment is still processing. This page updates once it clears.'); reload(); })
      .catch((e: Error) => setMsg(e.message))
      .finally(() => setBusy(null));
  }, [reload]);

  if (error) return <p className="error">{error}</p>;
  if (!data || !answers) return <Spinner label="Loading marketing…" />;
  const m = data.marketing;
  const plan = m.tailored ?? { summary: '', channels: m.plan30.channels, weeks: m.plan30.weeks, kpis: m.plan30.kpis };
  const current = m.subscription && m.subscription.status === 'active' ? m.subscription : null;
  const recommended = data.plans.find((p) => p.id === m.recommended.planId);

  async function save() {
    setBusy('save'); setMsg(null);
    try {
      await api('/api/marketing', { method: 'POST', body: JSON.stringify({ action: 'save', answers }) });
      setNotice('Assessment saved.');
      reload();
    } catch (e) { setMsg(e instanceof Error ? e.message : 'Could not save.'); } finally { setBusy(null); }
  }

  async function checkout(planId: string, provider: 'stripe' | 'paypal') {
    setBusy(`${planId}:${provider}`); setMsg(null);
    try {
      const r = await api<{ url: string }>('/api/marketing', { method: 'POST', body: JSON.stringify({ action: 'checkout', planId, provider }) });
      if (!CHECKOUT_HOSTS.test(r.url)) throw new Error('The checkout page address looked wrong, so it was not opened.');
      location.assign(r.url);
    } catch (e) { setMsg(e instanceof Error ? e.message : 'Could not open checkout.'); setBusy(null); }
  }

  const testOnly = [data.payments.stripe, data.payments.paypal].some((p) => p.connected && p.mode === 'test');

  return (
    <div className="stack">
      <section className="panel glass-card">
        <p className="eyebrow">AI marketing agency · CMO agent</p>
        <h2>Marketing</h2>
        <div className="cost-tiles">
          <div><span className="muted small">Readiness</span><strong>{m.readiness.score}/100</strong><span className="muted small">{m.validation ? 'checked online' : 'from your answers'}</span></div>
          <div><span className="muted small">Assessment</span><strong>{m.answered}/{m.total}</strong><span className="muted small">{m.savedAt ? `saved ${day(m.savedAt)}` : 'not saved yet'}</span></div>
          <div><span className="muted small">Cost per lead to stay under</span><strong>{m.cpl.ceiling === null ? '—' : money(m.cpl.ceiling, m.currency)}</strong><span className="muted small">{m.cpl.assumedClose ? 'assumes 2 in 10 close' : `you close ${Math.round(m.cpl.closeRate * 10)} in 10`}</span></div>
          <div><span className="muted small">Plan</span><strong>{current ? current.planName : recommended?.name ?? '—'}</strong><span className="muted small">{current ? `${current.mode === 'test' ? 'test, ' : ''}active` : 'recommended'}</span></div>
        </div>
        {busy === 'confirm' && <Spinner label="Checking your payment…" />}
        {notice && <p className="notice" role="status">{notice}</p>}
        {msg && <p className="error" role="alert">{msg}</p>}
        <p className="muted small">Nothing is posted, published or spent from this tab. Anything the agents draft waits for your yes in Approvals.</p>
      </section>

      <Fold id="mk-assess" title="Assessment" hint={`${m.answered} of ${m.total} answered`} open={m.answered < 6}>
        <p className="muted small">A few minutes now lets the agents plan around your real numbers. Fields from your company profile are filled in already.</p>
        {data.sections.map((s) => (
          <fieldset key={s.title} className="mk-section">
            <legend>{s.title}</legend>
            <div className="grid2">
              {s.questions.map((q) => <Field key={q.key} q={q} value={answers[q.key] ?? ''} onChange={(v) => setAnswers({ ...answers, [q.key]: v })} />)}
            </div>
          </fieldset>
        ))}
        <div className="row-end"><button type="button" className="btn-primary" disabled={!!busy} onClick={save}>{busy === 'save' ? <Spinner label="Saving…" /> : 'Save assessment'}</button></div>
      </Fold>

      <Fold id="mk-ready" title="Readiness and gaps" hint={`${m.readiness.score}/100 · ${m.readiness.gaps.length} to fix`}>
        <ul className="mk-checks">
          {m.readiness.checks.map((c) => (
            <li key={c.key} className={c.earned >= c.weight ? 'ok' : c.earned > 0 ? 'part' : 'gap'}>
              <span><strong>{c.label}</strong> <span className="muted small">{c.earned}/{c.weight}{c.confirmed === true ? ' · confirmed online' : c.confirmed === false ? ' · not found online' : ''}</span></span>
              {c.earned < c.weight && <span className="muted small">{c.fix}</span>}
            </li>
          ))}
        </ul>
        {m.validation && <p className="notice">{m.validation.summary || 'Online check saved.'} <span className="muted small">Checked {day(m.validation.at)}.</span></p>}
        <AgentRun agentId="business-assessor" goal={m.savedAt ? data.goals.assessor : ''} label="Check my online presence" emptyText="Save the assessment first, then the Business Assessor checks your links on public pages." goApprovals={goApprovals} onDone={reload} />
      </Fold>

      <Fold id="mk-plan" title="30-day plan" hint={m.tailored ? `tailored by the CMO agent ${day(m.tailored.at)}` : 'starter draft'}>
        {plan.summary && <p>{plan.summary}</p>}
        <p className="muted small">Channels: {plan.channels.join(', ') || '—'}. {m.cpl.budgetNote}</p>
        <ol className="mk-weeks">
          {plan.weeks.map((w) => <li key={w.week}><strong>Week {w.week}: {w.focus}</strong><ul>{w.actions.map((a, i) => <li key={i}>{a}</li>)}</ul></li>)}
        </ol>
        {plan.kpis.length > 0 && <p className="muted small">Measured by: {plan.kpis.join('; ')}.</p>}
        <AgentRun agentId="cmo" goal={m.savedAt ? data.goals.cmo : ''} label={m.tailored ? 'Tailor it again' : 'Have the CMO agent tailor it'} emptyText="Save the assessment first, then the CMO agent tailors this plan to your numbers." goApprovals={goApprovals} onDone={reload} />
      </Fold>

      <Fold id="mk-plans" title="Plans" hint={current ? `${current.planName} active` : `${recommended?.name ?? ''} recommended`} open={!current}>
        <p className="muted small">{m.recommended.reason}</p>
        {testOnly && <p className="notice">Test mode: checkout uses test cards and PayPal sandbox accounts, so no real money moves.</p>}
        <div className="mk-plans">
          {data.plans.map((p) => (
            <div key={p.id} className={`mk-plan${p.id === m.recommended.planId ? ' rec' : ''}${current?.planId === p.id ? ' on' : ''}`}>
              <p className="eyebrow">{p.id === m.recommended.planId ? 'Recommended' : current?.planId === p.id ? 'Your plan' : p.for}</p>
              <h3>{p.name}</h3>
              <p className="mk-price">{money(p.priceUsd)}<span className="muted small"> a month</span></p>
              <ul>{p.includes.map((x) => <li key={x}>{x}</li>)}</ul>
              {current?.planId === p.id ? <p className="muted small">Active since {day(current.startedAt)}.</p> : p.checkout ? (
                <div className="stack-sm">
                  <button type="button" className="btn-primary" disabled={!!busy || !data.payments.stripe.connected} onClick={() => checkout(p.id, 'stripe')}>{busy === `${p.id}:stripe` ? <Spinner label="Opening…" /> : 'Card, Apple Pay or Google Pay'}</button>
                  <button type="button" className="btn-ghost" disabled={!!busy || !data.payments.paypal.connected} onClick={() => checkout(p.id, 'paypal')}>{busy === `${p.id}:paypal` ? <Spinner label="Opening…" /> : 'PayPal'}</button>
                </div>
              ) : booking ? <a className="btn-ghost" href={booking} target="_blank" rel="noopener noreferrer">Book a setup call</a> : <p className="muted small">Set up with you on a call.</p>}
            </div>
          ))}
        </div>
        {(!data.payments.stripe.connected || !data.payments.paypal.connected) && (
          <p className="muted small">{[data.payments.stripe, data.payments.paypal].filter((x) => !x.connected).map((x) => x.note).join(' ')}</p>
        )}
        {m.payments.length > 0 && (
          <ul className="mk-pays">
            {m.payments.slice(0, 12).map((p) => <li key={`${p.provider}:${p.ref}`}><span>{day(p.at)} · {p.provider === 'stripe' ? 'Card' : 'PayPal'}{p.kind === 'renewal' ? ' renewal' : ''}{p.mode === 'test' ? ' · test' : ''}</span><strong>{money(p.amount, p.currency)}</strong></li>)}
          </ul>
        )}
      </Fold>

      <Fold id="mk-next" title="Ad creatives and publishing" hint="coming next">
        <p className="muted small">Next, the creative studio makes single-image and short-video ads for your plan with Viewmax, then publishing sends approved posts to your social channels. Every ad and post waits for your yes before it goes out.</p>
      </Fold>

      {data.admin && data.agency && (
        <Fold id="mk-agency" title="Agency customers" hint={`${data.agency.customers.length} paying · ${money(data.agency.monthlyLiveUsd)} a month live`}>
          {data.agency.added > 0 && <p className="notice">{data.agency.added} new customer{data.agency.added === 1 ? '' : 's'} added to your CRM as won deals.</p>}
          {data.agency.customers.length === 0 ? <p className="muted small">No business has paid for a marketing plan yet. Paying businesses show here and join your CRM as won deals.</p> : (
            <ul className="mk-pays">
              {data.agency.customers.map((c) => <li key={c.orgId}><span><strong>{c.name}</strong> <span className="muted small">· {c.planName} · {c.provider === 'stripe' ? 'card' : 'PayPal'}{c.mode === 'test' ? ' · test' : ''} · {c.status} · readiness {c.readiness}</span></span><strong>{money(c.amount, c.currency)}</strong></li>)}
            </ul>
          )}
        </Fold>
      )}
    </div>
  );
}

function Field({ q, value, onChange }: { q: Question; value: string; onChange: (v: string) => void }) {
  const wide = q.kind === 'long';
  return (
    <label className={`field${wide ? ' mk-wide' : ''}`}>
      <span>{q.label}{q.hint && <span className="muted small"> · {q.hint}</span>}</span>
      {q.kind === 'long' ? <textarea rows={3} value={value} maxLength={1500} onChange={(e) => onChange(e.target.value)} />
        : q.kind === 'choice' ? (
          <select value={value} onChange={(e) => onChange(e.target.value)}>
            <option value="">Choose…</option>
            {(q.options ?? []).map((o) => <option key={o}>{o}</option>)}
          </select>
        ) : <input type={q.kind === 'number' ? 'number' : 'text'} inputMode={q.kind === 'number' ? 'decimal' : undefined} min={q.kind === 'number' ? 0 : undefined} value={value} maxLength={300} onChange={(e) => onChange(e.target.value)} />}
    </label>
  );
}
