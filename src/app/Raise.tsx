// Raise: the founder → CFO capital-raising workspace. Round terms, the step checklist (Prepare,
// Raise, Pre-orders), the investor pipeline, the founding-member campaign and the third-party sources.
import React, { useState } from 'react';
import { api } from '../lib/auth';
import { Rate } from './Rate';
import { Spinner } from './ui';
import { useLoad } from './useLoad';
import { Campaign, Investors, Sources } from './RaiseParts';
import { raiseAction, usd, type RaiseState, type Source } from './raiseApi';

interface RunResult { taskId: string; status: string; output: string | null; queued: number }

const EXEMPTION_NOTE: Record<string, string> = {
  '506b': 'Private round (Rule 506(b)): approach only people you know or were introduced to, and don’t mention the raise publicly. Up to 35 non-accredited investors are allowed but need extra disclosure, so most founders take accredited investors only.',
  '506c': 'Public round (Rule 506(c)): you may talk about the raise publicly, but every investor must be accredited and verified before you accept their money.',
};

export function Raise({ goApprovals }: { goApprovals: () => void }) {
  const { data, error, reload } = useLoad<{ raise: RaiseState; sources: Source[] }>('/api/raise');
  if (error) return <p className="error">{error}</p>;
  if (!data) return <Spinner label="Loading your raise…" />;
  const { raise, sources } = data;
  const t = raise.totals;
  const tracks = ['Prepare', 'Raise', 'Pre-orders'] as const;
  return (
    <div className="stack">
      <section className="panel glass-card">
        <p className="eyebrow">Raise · founder and CFO</p>
        <h2>{raise.round ? `${raise.round.name} round` : 'Plan your raise'}</h2>
        <p className="muted small">Your CFO agent models the round, the Fundraising agent drafts every investor email, and nothing goes out until you approve it.</p>
        <div className="cost-tiles">
          <div><span className="muted small">Target</span><strong>{t.target ? usd(t.target) : 'Not set'}</strong></div>
          <div><span className="muted small">Committed</span><strong>{usd(t.committed)}</strong><span className="muted small">{t.pctCommitted}% of target</span></div>
          <div><span className="muted small">Received</span><strong>{usd(t.funded)}</strong></div>
          <div><span className="muted small">{raise.round?.instrument === 'priced' ? 'Investors own' : 'Est. dilution'}</span><strong>{t.dilutionPct === null ? '—' : `${t.dilutionPct}%`}</strong>{t.postMoney ? <span className="muted small">{usd(t.postMoney)} post-money</span> : null}</div>
          {t.preorders > 0 && <div><span className="muted small">Pre-orders (sales)</span><strong>{usd(t.preorders)}</strong></div>}
        </div>
        {t.target > 0 && <div className="complete"><div className="complete-bar" aria-hidden="true"><span style={{ width: `${Math.min(100, t.pctCommitted)}%` }} /></div><span className="muted small">{t.pctCommitted}% committed</span></div>}
        {raise.round && <p className="notice">{EXEMPTION_NOTE[raise.round.exemption]}</p>}
      </section>

      <RoundForm round={raise.round} onSaved={reload} />

      <section className="panel glass-card">
        <p className="eyebrow">Workflow</p>
        <h2>From model to money in the bank</h2>
        {tracks.map((track) => {
          const steps = raise.steps.filter((s) => s.track === track);
          const done = steps.filter((s) => s.status === 'done').length;
          return (
            <details key={track} className="head-group" open={track !== 'Pre-orders' || Boolean(raise.campaign)}>
              <summary>{track === 'Prepare' ? 'Prepare: founder and CFO' : track === 'Raise' ? 'Raise: investors to close' : 'Pre-orders: founding members (optional)'} <span className="muted small">{done} of {steps.length} done</span></summary>
              <ol className="journey-steps">{steps.map((s) => <Step key={s.id} s={s} onChange={reload} goApprovals={goApprovals} />)}</ol>
            </details>
          );
        })}
      </section>

      <Investors investors={raise.investors} pipeline={raise.pipeline} onChange={reload} />
      <Campaign campaign={raise.campaign} onChange={reload} />
      <Sources sources={sources} />
      <p className="muted small">SIXXAB is not a broker-dealer or funding portal and does not give legal or investment advice. Have a securities lawyer review your round before you take money.</p>
    </div>
  );
}

function RoundForm({ round, onSaved }: { round: RaiseState['round']; onSaved: () => void }) {
  const [f, setF] = useState({
    name: round?.name ?? 'Seed', instrument: round?.instrument ?? 'priced', exemption: round?.exemption ?? '506b',
    target: round ? String(round.target) : '', cap: round?.cap ? String(round.cap) : '', preMoney: round?.preMoney ? String(round.preMoney) : '', discount: round?.discount ? String(round.discount) : '', minCheck: round?.minCheck ? String(round.minCheck) : '',
  });
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const num = (v: string) => v.replace(/[^\d.]/g, '');

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setMsg(null);
    try {
      await raiseAction({ action: 'round', round: { ...f, discount: f.discount === '' ? undefined : Number(f.discount), cap: f.cap || undefined, preMoney: f.preMoney || undefined, minCheck: f.minCheck || undefined } });
      setMsg('Saved.');
      onSaved();
    } catch (err) {
      setMsg(err instanceof Error ? err.message : 'Could not save the round.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="panel glass-card">
      <p className="eyebrow">Round terms · you decide</p>
      <h2>{round ? 'Round terms' : 'Set the round'}</h2>
      <form className="form" onSubmit={save}>
        <div className="grid3">
          <label className="field"><span>Round name</span><input value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} maxLength={60} /></label>
          <label className="field"><span>Instrument</span><select value={f.instrument} onChange={(e) => setF({ ...f, instrument: e.target.value })}>
            <option value="priced">Priced equity round</option><option value="safe-post">Post-money SAFE</option><option value="safe-pre">Pre-money SAFE</option><option value="note">Convertible note</option>
          </select></label>
          <label className="field"><span>How you raise</span><select value={f.exemption} onChange={(e) => setF({ ...f, exemption: e.target.value })}>
            <option value="506b">Private: Rule 506(b)</option><option value="506c">Public, accredited only: Rule 506(c)</option>
          </select></label>
          <label className="field"><span>Target (USD)</span><input inputMode="numeric" value={f.target} onChange={(e) => setF({ ...f, target: num(e.target.value) })} placeholder="100000" /></label>
          {f.instrument === 'priced' ? (
            <label className="field"><span>Pre-money valuation (USD)</span><input inputMode="numeric" value={f.preMoney} onChange={(e) => setF({ ...f, preMoney: num(e.target.value) })} placeholder="1900000" /></label>
          ) : (
            <label className="field"><span>Valuation cap (USD)</span><input inputMode="numeric" value={f.cap} onChange={(e) => setF({ ...f, cap: num(e.target.value) })} placeholder="2000000" /></label>
          )}
          {f.instrument === 'priced' ? (
            <label className="field"><span>Minimum cheque (USD)</span><input inputMode="numeric" value={f.minCheck} onChange={(e) => setF({ ...f, minCheck: num(e.target.value) })} placeholder="10000" /></label>
          ) : (
            <label className="field"><span>Discount % / minimum cheque</span><span className="grid2"><input aria-label="Discount percent" inputMode="decimal" value={f.discount} onChange={(e) => setF({ ...f, discount: num(e.target.value) })} placeholder="0" /><input aria-label="Minimum cheque" inputMode="numeric" value={f.minCheck} onChange={(e) => setF({ ...f, minCheck: num(e.target.value) })} placeholder="10000" /></span></label>
          )}
        </div>
        {f.instrument === 'priced' && Number(f.target) > 0 && Number(f.preMoney) > 0 && (
          <p className="muted small">{usd(Number(f.target))} at {usd(Number(f.preMoney))} pre-money is {usd(Number(f.target) + Number(f.preMoney))} post-money: investors get {Math.round((Number(f.target) / (Number(f.target) + Number(f.preMoney))) * 1000) / 10}%.</p>
        )}
        <div className="row-end">
          {msg && <span className={msg === 'Saved.' ? 'muted small' : 'error'} role="status">{msg}</span>}
          <button type="submit" className="btn-primary" disabled={busy || !f.target}>{busy ? <Spinner label="Saving…" /> : 'Save round'}</button>
        </div>
      </form>
    </section>
  );
}

function Step({ s, onChange, goApprovals }: { s: RaiseState['steps'][number]; onChange: () => void; goApprovals: () => void }) {
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [run, setRun] = useState<RunResult | null>(null);

  async function act(action: 'complete' | 'reopen') {
    setBusy(action);
    setMsg(null);
    try {
      await raiseAction({ action, step: s.id });
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
        <h3>{s.title}</h3>
        <span className={`pill pill-${s.status === 'done' ? 'done' : s.status === 'ready' ? 'awaiting_approval' : 'planned'}`}>{pill}</span>
      </div>
      <p>{s.summary} <span className="muted small">· {s.owner}</span></p>
      {s.status !== 'blocked' && (
        <div className="row-end">
          {s.agentId && s.goal && s.status === 'ready' && <button type="button" className="btn-ghost" disabled={!!busy} onClick={runAgent}>{busy === 'run' ? <Spinner label="Agent working…" /> : 'Run with agents'}</button>}
          {s.status === 'ready' && <button type="button" className="btn-primary" disabled={!!busy} onClick={() => act('complete')}>{busy === 'complete' ? <Spinner label="Saving…" /> : 'Mark done'}</button>}
          {s.status === 'done' && <button type="button" className="btn-ghost" disabled={!!busy} onClick={() => act('reopen')}>Reopen</button>}
        </div>
      )}
      {run && (
        <div className="notice" role="status">
          {run.output && <p className="output">{run.output}</p>}
          {run.output && run.status === 'done' && <Rate taskId={run.taskId} />}
          {run.queued > 0 && <button type="button" className="btn-primary" onClick={goApprovals}>Review {run.queued} email{run.queued === 1 ? '' : 's'} waiting for your yes</button>}
        </div>
      )}
      {msg && <p className="error" role="alert">{msg}</p>}
    </li>
  );
}
