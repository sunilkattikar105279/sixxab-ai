// Admin only: AI & Platform Governance, one pane for the founder, COO and SRE, with CXO reviews.
import React, { useEffect, useState } from 'react';
import { api } from '../lib/auth';
import { Rate } from './Rate';
import { Spinner } from './ui';
import { useLoad } from './useLoad';

type State = 'green' | 'amber' | 'red' | 'off';
interface Gov {
  generatedAt: string;
  status: { overall: State; checks: { key: string; label: string; state: State; detail: string }[] };
  journey: { businesses: number; byStage: Record<string, number>; onboarded: number; stepsDone: number; stepsTotal: number; pendingApprovals: number; oldestApprovalHours: number | null;
    businessesList: { orgId: string; name: string | null; stage: string; onboarded: boolean; stepsDone: number; pending: number }[] };
  workflows: { tasks7d: Record<string, number>; delivered7d: number; failed7d: number };
  integrations: { tool: string; sent: number; recorded: number; failed: number; lastError: string | null }[];
  data: { counts: Record<string, number> };
  security: { healthcareBusinesses: number; controls: { key: string; label: string; ok: boolean; detail: string }[]; recentChanges: { at: string; actor: string; summary: string }[] };
  code: { builtAt?: string; files?: number; lines?: number; tests?: number; e2e?: number; rlsTables?: number; apiRoutes?: number };
  pipeline: { env?: string; sha?: string; message?: string; region?: string; url?: string };
  cost: { modelUsd30d: number; fixedMonthlyUsd: number; totalMonthlyUsd: number; fixedCosts: Record<string, number>; inrPerUsd: number;
    byBusiness: { orgId: string; name: string; plan: { name: string; monthlyFee: number; currency: string } | null; modelUsd: number; fixedUsd: number; costUsd: number; revenueUsd: number; marginUsd: number }[] };
}

const STAGES = ['startup', 'struggle', 'scale', 'success', 'significance', 'sixxab'];
const usd = (n: number) => `$${n.toLocaleString('en-US', { minimumFractionDigits: n < 10 ? 2 : 0, maximumFractionDigits: 2 })}`;
const Dot = ({ s }: { s: State | boolean }) => {
  const st = s === true ? 'green' : s === false ? 'red' : s;
  return <span className={`dot dot-${st}`} aria-label={st} role="img" />;
};

export function Governance() {
  const { data, error, reload } = useLoad<{ governance: Gov; reviewers: { id: string; title: string }[] }>('/api/governance');
  if (error) return <p className="error">{error}</p>;
  if (!data) return <Spinner label="Checking the platform…" />;
  const g = data.governance;
  return (
    <div className="stack">
      <section className="panel glass-card">
        <div className="row-between">
          <div>
            <p className="eyebrow">AI & Platform Governance · admin only</p>
            <h2><Dot s={g.status.overall} /> Platform is {g.status.overall === 'green' ? 'healthy' : g.status.overall === 'amber' ? 'running with warnings' : 'degraded'}</h2>
            <p className="muted small">Live as of {new Date(g.generatedAt).toLocaleString()}</p>
          </div>
          <button type="button" className="btn-ghost" onClick={reload}>Refresh</button>
        </div>
        <ul className="plain checks">
          {g.status.checks.map((c) => <li key={c.key}><Dot s={c.state} /> <strong>{c.label}</strong> <span className="muted small">{c.detail}</span></li>)}
        </ul>
      </section>

      <section className="panel glass-card">
        <h2>Customer journey and workflows</h2>
        <div className="cost-tiles">
          <div><span className="muted small">Businesses</span><strong>{g.journey.businesses}</strong></div>
          <div><span className="muted small">Onboarded</span><strong>{g.journey.onboarded}</strong></div>
          <div><span className="muted small">Waiting for approval</span><strong>{g.journey.pendingApprovals}{g.journey.oldestApprovalHours !== null && <span className="muted small"> · oldest {g.journey.oldestApprovalHours}h</span>}</strong></div>
          <div><span className="muted small">Delivered / failed (7 days)</span><strong>{g.workflows.delivered7d} / {g.workflows.failed7d}</strong></div>
        </div>
        <ol className="stage-strip" aria-label="Businesses by stage">
          {STAGES.map((k) => <li key={k} className={g.journey.byStage[k] ? 'stage on' : 'stage'}><strong>{g.journey.byStage[k] ?? 0}</strong><span>{k}</span></li>)}
        </ol>
        <div className="table-wrap">
          <table>
            <thead><tr><th>Business</th><th>Stage</th><th>Steps done</th><th>Pending</th></tr></thead>
            <tbody>{g.journey.businessesList.map((b) => <tr key={b.orgId}><td>{b.name ?? <span className="muted">No profile yet</span>}</td><td>{b.stage}</td><td>{b.stepsDone}{b.onboarded ? '' : ' · not onboarded'}</td><td>{b.pending}</td></tr>)}</tbody>
          </table>
        </div>
        <p className="muted small">Tasks in the last 7 days: {Object.entries(g.workflows.tasks7d).map(([k, v]) => `${v} ${k.replace(/_/g, ' ')}`).join(', ') || 'none'}.</p>
      </section>

      <section className="panel glass-card">
        <h2>Integrations</h2>
        <p className="muted small">Approved actions sent through each business&apos;s n8n workflow, last 7 days.</p>
        <div className="table-wrap">
          <table>
            <thead><tr><th>Action</th><th>Sent</th><th>Recorded only</th><th>Failed</th><th>Last error</th></tr></thead>
            <tbody>{g.integrations.map((i) => <tr key={i.tool}><td>{i.tool.replace(/_/g, ' ')}</td><td>{i.sent}</td><td>{i.recorded}</td><td>{i.failed ? <span className="error-inline">{i.failed}</span> : 0}</td><td className="muted small">{i.lastError ?? '—'}</td></tr>)}</tbody>
          </table>
        </div>
      </section>

      <section className="panel glass-card">
        <h2>Security</h2>
        <ul className="plain checks">
          {g.security.controls.map((c) => <li key={c.key}><Dot s={c.ok} /> <strong>{c.label}</strong> <span className="muted small">{c.detail}</span></li>)}
        </ul>
        {g.security.recentChanges.length > 0 && (
          <>
            <h3 className="sub">Recent admin changes</h3>
            <ul className="plain small">{g.security.recentChanges.map((c) => <li key={c.at + c.summary}><span className="muted">{new Date(c.at).toLocaleString()}</span> · {c.actor} · {c.summary}</li>)}</ul>
          </>
        )}
      </section>

      <section className="panel glass-card">
        <h2>Technology, code, pipeline and data</h2>
        <div className="grid2">
          <dl className="profile-list">
            <div><dt>Deployed</dt><dd>{g.pipeline.env ?? 'local'} · {g.pipeline.sha ? g.pipeline.sha.slice(0, 7) : 'unknown'}{g.pipeline.region ? ` · ${g.pipeline.region}` : ''}</dd></div>
            <div><dt>Last change</dt><dd>{g.pipeline.message ?? '—'}</dd></div>
            <div><dt>Built</dt><dd>{g.code.builtAt ? new Date(g.code.builtAt).toLocaleString() : '—'}</dd></div>
            <div><dt>Code</dt><dd>{g.code.files ?? 0} files, {(g.code.lines ?? 0).toLocaleString()} lines, {g.code.apiRoutes ?? 0} API routes</dd></div>
            <div><dt>Tests</dt><dd>{g.code.tests ?? 0} unit, {g.code.e2e ?? 0} browser checks in the suite</dd></div>
          </dl>
          <dl className="profile-list">
            {Object.entries(g.data.counts).map(([t, n]) => <div key={t}><dt>{t.replace(/_/g, ' ')}</dt><dd>{n < 0 ? 'unavailable' : n.toLocaleString()}</dd></div>)}
          </dl>
        </div>
        <p className="muted small">Stack: Vercel (site and API), Supabase (Postgres, Auth, row-level security), Anthropic (agents), n8n (integrations), Resend (sign-in email).</p>
      </section>

      <CostSection cost={g.cost} onSaved={reload} />
      <Reviews reviewers={data.reviewers} />
    </div>
  );
}

function CostSection({ cost, onSaved }: { cost: Gov['cost']; onSaved: () => void }) {
  const [rows, setRows] = useState<{ name: string; amount: string }[]>([]);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  useEffect(() => {
    const r = Object.entries(cost.fixedCosts).map(([name, n]) => ({ name, amount: String(n) }));
    setRows(r.length ? r : [{ name: 'Vercel', amount: '' }, { name: 'Supabase', amount: '' }, { name: 'n8n', amount: '' }, { name: 'Resend', amount: '' }]);
  }, [cost.fixedCosts]);

  async function save() {
    setBusy(true);
    setMsg(null);
    try {
      const fixedCosts = Object.fromEntries(rows.filter((r) => r.name.trim() && r.amount !== '').map((r) => [r.name.trim(), Number(r.amount)]));
      await api('/api/governance', { method: 'POST', body: JSON.stringify({ action: 'costs', fixedCosts }) });
      setMsg('Saved');
      onSaved();
    } catch (e) {
      setMsg(e instanceof Error ? e.message : 'Could not save');
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="panel glass-card">
      <h2>Tech cost and cost per customer</h2>
      <div className="cost-tiles">
        <div><span className="muted small">AI models, last 30 days</span><strong>{usd(cost.modelUsd30d)}</strong></div>
        <div><span className="muted small">Fixed, per month</span><strong>{usd(cost.fixedMonthlyUsd)}</strong></div>
        <div><span className="muted small">Total per month</span><strong>{usd(cost.totalMonthlyUsd)}</strong></div>
        <div><span className="muted small">Rupee rate</span><strong>₹{cost.inrPerUsd} per $</strong></div>
      </div>
      <p className="muted small">Each business carries its own AI usage; fixed costs are split by each business&apos;s share of usage (equally when there is none). Revenue is the plan fee.</p>
      <div className="table-wrap">
        <table>
          <thead><tr><th>Business</th><th>Plan</th><th>AI usage</th><th>Fixed share</th><th>Cost</th><th>Revenue</th><th>Margin</th></tr></thead>
          <tbody>{cost.byBusiness.map((b) => (
            <tr key={b.orgId}><td>{b.name}</td><td>{b.plan ? `${b.plan.name} · ${b.plan.monthlyFee.toLocaleString()} ${b.plan.currency}` : <span className="muted">No plan</span>}</td>
              <td>{usd(b.modelUsd)}</td><td>{usd(b.fixedUsd)}</td><td>{usd(b.costUsd)}</td><td>{usd(b.revenueUsd)}</td><td className={b.marginUsd < 0 ? 'error-inline' : ''}>{usd(b.marginUsd)}</td></tr>
          ))}</tbody>
        </table>
      </div>
      <h3 className="sub">Fixed monthly tech costs (USD)</h3>
      <div className="cost-editor">
        {rows.map((r, i) => (
          <div key={i} className="cost-row">
            <input aria-label={`Vendor ${i + 1}`} value={r.name} onChange={(e) => setRows(rows.map((x, j) => (j === i ? { ...x, name: e.target.value } : x)))} />
            <input aria-label={`Monthly cost for ${r.name || `vendor ${i + 1}`}`} inputMode="decimal" placeholder="0" value={r.amount} onChange={(e) => setRows(rows.map((x, j) => (j === i ? { ...x, amount: e.target.value.replace(/[^\d.]/g, '') } : x)))} />
          </div>
        ))}
      </div>
      <div className="row-end">
        <button type="button" className="btn-ghost" onClick={() => setRows([...rows, { name: '', amount: '' }])}>Add vendor</button>
        <button type="button" className="btn-primary" disabled={busy} onClick={save}>{busy ? <Spinner label="Saving…" /> : 'Save costs'}</button>
      </div>
      {msg && <p className="muted small" role="status">{msg}</p>}
    </section>
  );
}

function Reviews({ reviewers }: { reviewers: { id: string; title: string }[] }) {
  const [busy, setBusy] = useState<string | null>(null);
  const [result, setResult] = useState<{ id: string; taskId: string; output: string | null } | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  async function run(id: string) {
    setBusy(id);
    setMsg(null);
    setResult(null);
    try {
      const r = await api<{ taskId: string; output: string | null }>('/api/governance', { method: 'POST', body: JSON.stringify({ action: 'review', agentId: id }) });
      setResult({ id, ...r });
    } catch (e) {
      setMsg(e instanceof Error ? e.message : 'The review could not run');
    } finally {
      setBusy(null);
    }
  }
  return (
    <section className="panel glass-card">
      <h2>CXO reviews</h2>
      <p className="muted small">Each agent reviews this live snapshot and saves its findings as a note in your workspace. They recommend; you decide.</p>
      <div className="row-end" style={{ justifyContent: 'flex-start' }}>
        {reviewers.map((r) => <button key={r.id} type="button" className="btn-ghost" disabled={!!busy} onClick={() => run(r.id)}>{busy === r.id ? <Spinner label="Reviewing…" /> : `${r.id.toUpperCase()}: ${r.title}`}</button>)}
      </div>
      {result?.output && <><p className="output">{result.output}</p><Rate taskId={result.taskId} /></>}
      {msg && <p className="error" role="alert">{msg}</p>}
    </section>
  );
}
