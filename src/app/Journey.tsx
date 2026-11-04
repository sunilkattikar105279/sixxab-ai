// The SIXXAB journey: stage, the guided steps with dependencies, revenue and milestones.
import React, { useState } from 'react';
import { api } from '../lib/auth';
import { BusinessProfile } from './BusinessProfile';
import { Rate } from './Rate';
import { Spinner } from './ui';
import { useLoad } from './useLoad';

interface Stage { key: string; name: string; head: string; level: string; opensAt: string; summary: string; live: boolean }
interface Step {
  id: string; stage: 'Start' | 'Scale' | 'Run'; title: string; summary: string; agentId: string | null; agents: string; ownerDecides: string; output: string;
  goal: string; status: 'done' | 'ready' | 'blocked'; blockedBy: string[]; warnings: string[]; doneAt: string | null;
}
interface JourneyData {
  stage: Stage; nextGate: string; stages: Stage[]; steps: Step[];
  revenue: { currency: string; months: { month: string; amount: number; currency: string }[]; bestRecentMonthUsd: number; last12Usd: number; inrPerUsd: number };
  milestones: { key: string; title: string; reachedAt: string | null }[];
}
interface RunResult { taskId: string; status: string; output: string | null; queued: number }

const RECENT_MS = 7 * 24 * 3600 * 1000;
const HEADS = ['Start', 'Scale', 'Run'] as const;
const usd = (n: number) => `$${Math.round(n).toLocaleString('en-US')}`;

export function Journey({ goApprovals }: { goApprovals: () => void }) {
  const { data, error, reload } = useLoad<{ journey: JourneyData }>('/api/journey');
  if (error) return <p className="error">{error}</p>;
  if (!data) return <Spinner label="Loading your journey…" />;
  const j = data.journey;
  const onboarded = j.steps.find((s) => s.id === 'onboard')?.status === 'done';
  const recent = j.milestones.filter((m) => m.reachedAt && Date.now() - Date.parse(m.reachedAt) < RECENT_MS);

  return (
    <div className="stack">
      <section className="panel glass-card">
        <p className="eyebrow">{j.stage.head} the business</p>
        <h2>You are in {j.stage.name}: {j.stage.summary.toLowerCase()}.</h2>
        <p className="muted small">{j.nextGate}</p>
        <ol className="stage-strip" aria-label="SIXXAB stages">
          {j.stages.map((s) => (
            <li key={s.key} className={s.key === j.stage.key ? 'stage on' : s.live ? 'stage' : 'stage later'} aria-current={s.key === j.stage.key ? 'step' : undefined}>
              <strong>{s.name}</strong>
              <span>{s.key === 'startup' ? '6S $0 · day one' : `6S ${s.level} · opens at ${s.opensAt}`}</span>
            </li>
          ))}
        </ol>
        {recent.length > 0 && (
          <div className="celebrate" role="status">
            {recent.map((m) => <p key={m.key}>Milestone reached: <strong>{m.title}</strong> · {new Date(m.reachedAt!).toLocaleDateString()}</p>)}
          </div>
        )}
      </section>

      {!onboarded && <BusinessProfile startOpen onSaved={reload} />}

      <section className="panel glass-card">
        <h2>Your steps</h2>
        <p className="muted small">Each step unlocks when the steps it depends on are done. Notes in gold are worth doing first but never block you.</p>
        {HEADS.map((head) => {
          const steps = j.steps.filter((s) => s.stage === head);
          const done = steps.filter((s) => s.status === 'done').length;
          return (
            <details key={head} className="head-group" open={head === j.stage.head}>
              <summary><strong>{head} the business</strong> <span className="muted small">{done} of {steps.length} steps done</span></summary>
              <ol className="journey-steps">
                {steps.map((s) => <StepCard key={s.id} n={j.steps.indexOf(s) + 1} s={s} onChange={reload} goApprovals={goApprovals} />)}
              </ol>
            </details>
          );
        })}
      </section>

      <Revenue currency={j.revenue.currency} months={j.revenue.months} bestUsd={j.revenue.bestRecentMonthUsd} yearUsd={j.revenue.last12Usd} rate={j.revenue.inrPerUsd} onSaved={reload} />

      <section className="panel glass-card">
        <h2>Milestones</h2>
        <ul className="plain milestones">
          {j.milestones.map((m) => (
            <li key={m.key} className={m.reachedAt ? 'reached' : ''}>
              <span aria-hidden="true">{m.reachedAt ? '●' : '○'}</span> {m.title}
              {m.reachedAt && <span className="muted small"> · {new Date(m.reachedAt).toLocaleDateString()}</span>}
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}

function StepCard({ n, s, onChange, goApprovals }: { n: number; s: Step; onChange: () => void; goApprovals: () => void }) {
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [run, setRun] = useState<RunResult | null>(null);

  async function act(action: 'complete' | 'reopen') {
    setBusy(action);
    setMsg(null);
    try {
      await api('/api/journey', { method: 'POST', body: JSON.stringify({ action, step: s.id }) });
      onChange();
    } catch (e) {
      setMsg(e instanceof Error ? e.message : 'Could not update the step.');
    } finally {
      setBusy(null);
    }
  }

  async function runAgent() {
    setBusy('run');
    setMsg(null);
    setRun(null);
    try {
      setRun(await api<RunResult>('/api/agents', { method: 'POST', body: JSON.stringify({ goal: s.goal, agentId: s.agentId }) }));
      onChange();
    } catch (e) {
      setMsg(e instanceof Error ? e.message : 'The agent could not run.');
    } finally {
      setBusy(null);
    }
  }

  const pill = s.status === 'done' ? 'Done' : s.status === 'ready' ? 'Ready' : `Finish first: ${s.blockedBy.join(', ')}`;
  return (
    <li className={`journey-step ${s.status}`}>
      <div className="row-between">
        <h3><span className="step-n">{n}</span> {s.title}</h3>
        <span className={`pill pill-${s.status === 'done' ? 'done' : s.status === 'ready' ? 'awaiting_approval' : 'planned'}`}>{pill}</span>
      </div>
      <p>{s.summary}</p>
      <dl className="step-meta">
        <div><dt>Agents</dt><dd>{s.agents}</dd></div>
        <div><dt>You decide</dt><dd>{s.ownerDecides}</dd></div>
        <div><dt>You get</dt><dd>{s.output}</dd></div>
      </dl>
      {s.warnings.length > 0 && <ul className="warnings">{s.warnings.map((w) => <li key={w}>{w}</li>)}</ul>}
      {s.status !== 'blocked' && s.id !== 'onboard' && (
        <div className="row-end">
          {s.agentId && s.status === 'ready' && (
            <button type="button" className="btn-ghost" disabled={!!busy} onClick={runAgent}>{busy === 'run' ? <Spinner label="Agent working…" /> : 'Run with agents'}</button>
          )}
          {s.status === 'ready' && <button type="button" className="btn-primary" disabled={!!busy} onClick={() => act('complete')}>{busy === 'complete' ? <Spinner label="Saving…" /> : 'Mark done'}</button>}
          {s.status === 'done' && <button type="button" className="btn-ghost" disabled={!!busy} onClick={() => act('reopen')}>Reopen</button>}
        </div>
      )}
      {run && (
        <div className="notice" role="status">
          {run.output && <p className="output">{run.output}</p>}
          {run.output && run.status === 'done' && <Rate taskId={run.taskId} />}
          {run.queued > 0 && <button type="button" className="btn-primary" onClick={goApprovals}>Review {run.queued} item{run.queued === 1 ? '' : 's'} waiting for your yes</button>}
        </div>
      )}
      {msg && <p className="error" role="alert">{msg}</p>}
    </li>
  );
}

function Revenue({ currency, months, bestUsd, yearUsd, rate, onSaved }: { currency: string; months: { month: string; amount: number }[]; bestUsd: number; yearUsd: number; rate: number; onSaved: () => void }) {
  const lastMonth = new Date(Date.now() - 28 * 24 * 3600 * 1000).toISOString().slice(0, 7);
  const [month, setMonth] = useState(lastMonth);
  const [amount, setAmount] = useState('');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const fmt = (n: number) => { try { return new Intl.NumberFormat(currency === 'INR' ? 'en-IN' : 'en-US', { style: 'currency', currency, maximumFractionDigits: 0 }).format(n); } catch { return `${n} ${currency}`; } };

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setMsg(null);
    try {
      await api('/api/journey', { method: 'POST', body: JSON.stringify({ action: 'revenue', month, amount }) });
      setAmount('');
      onSaved();
    } catch (err) {
      setMsg(err instanceof Error ? err.message : 'Could not save.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="panel glass-card">
      <h2>Revenue</h2>
      <p className="muted small">Record each month&apos;s revenue ({currency}). It moves you through the stages and shows up in every agent&apos;s plan.</p>
      {months.length > 0 && (
        <p className="small">Best recent month <strong>{usd(bestUsd)}</strong> · last 12 months <strong>{usd(yearUsd)}</strong>{currency === 'INR' ? <span className="muted"> (at ₹{rate} per $)</span> : null}</p>
      )}
      <form className="revenue-form" onSubmit={save}>
        <label className="field"><span>Month</span><input type="month" value={month} onChange={(e) => setMonth(e.target.value)} required /></label>
        <label className="field"><span>Revenue ({currency})</span><input inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value.replace(/[^\d.,]/g, ''))} required placeholder="e.g. 250000" /></label>
        <button type="submit" className="btn-primary" disabled={busy || !amount}>{busy ? <Spinner label="Saving…" /> : 'Save revenue'}</button>
      </form>
      {msg && <p className="error" role="alert">{msg}</p>}
      {months.length > 0 && (
        <div className="table-wrap">
          <table>
            <thead><tr><th>Month</th><th>Revenue</th></tr></thead>
            <tbody>{[...months].reverse().map((m) => <tr key={m.month}><td>{m.month}</td><td>{fmt(m.amount)}</td></tr>)}</tbody>
          </table>
        </div>
      )}
    </section>
  );
}
