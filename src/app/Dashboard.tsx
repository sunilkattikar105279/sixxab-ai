import React, { useCallback, useEffect, useState } from 'react';
import { api, getSession, sessionFromRedirect, signOut, type Session } from '../lib/auth';
import type { Approval, AuditEvent, Briefing, RoleCard, TaskType } from '../../core/types';
import { Brand, Spinner } from './ui';

type Tab = 'today' | 'approvals' | 'agents' | 'activity';
type AgentInfo = Omit<RoleCard, 'instructions'>;
interface TaskRow { id: string; agentId: string; goal: string; status: string; output: string | null; updatedAt: string }

const LEVEL = { 1: 'L1 Assist', 2: 'L2 Approve', 3: 'L3 Autonomous' } as const;
const STATUS: Record<string, string> = {
  done: 'Done', running: 'Running', planned: 'Planned', awaiting_approval: 'Waiting for you', draft_for_human: 'Draft for you', failed: 'Stopped', rejected: 'Rejected',
};

export default function Dashboard() {
  const [session, setSession] = useState<Session | null>(null);
  const [checked, setChecked] = useState(false);
  const [tab, setTab] = useState<Tab>('today');
  const [pendingCount, setPendingCount] = useState(0);

  useEffect(() => {
    (async () => {
      const s = (await sessionFromRedirect()) ?? (await getSession());
      if (!s) {
        location.replace('/login');
        return;
      }
      setSession(s);
      setChecked(true);
    })();
  }, []);

  if (!checked || !session) return <div className="center-page"><Spinner label="Opening your workspace…" /></div>;
  const who = session.user.email ?? session.user.phone ?? 'Founder';

  return (
    <div className="app">
      <header className="app-top">
        <Brand />
        <div className="app-user">
          <span className="muted small">{who}</span>
          <button type="button" className="btn-ghost" onClick={async () => { await signOut(); location.replace('/'); }}>Sign out</button>
        </div>
      </header>
      <nav className="app-tabs" aria-label="Workspace">
        {(['today', 'approvals', 'agents', 'activity'] as Tab[]).map((t) => (
          <button key={t} type="button" className={tab === t ? 'app-tab on' : 'app-tab'} aria-current={tab === t ? 'page' : undefined} onClick={() => setTab(t)}>
            {t === 'today' ? 'Today' : t === 'approvals' ? `Approvals${pendingCount ? ` (${pendingCount})` : ''}` : t === 'agents' ? 'Agents' : 'Activity'}
          </button>
        ))}
      </nav>
      <main className="app-main">
        {tab === 'today' && <Today onPending={setPendingCount} goApprovals={() => setTab('approvals')} />}
        {tab === 'approvals' && <Approvals onCount={setPendingCount} />}
        {tab === 'agents' && <Agents />}
        {tab === 'activity' && <Activity />}
      </main>
    </div>
  );
}

function useLoad<T>(path: string) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  const reload = useCallback(() => {
    setError(null);
    api<T>(path).then(setData).catch((e: Error) => setError(e.message));
  }, [path]);
  useEffect(reload, [reload]);
  return { data, error, reload };
}

interface ProfileField { key: string; label: string }
const HINTS: Record<string, string> = {
  name: 'e.g. SIXXAB AI',
  offer: 'e.g. AI agents that start, scale and run a company, with a founder approving what matters',
  customers: 'e.g. Solo founders and small businesses; healthcare clinics',
  markets: 'e.g. United States and India',
  voice: 'e.g. Confident, plain-spoken, practical; no hype',
  goals: 'e.g. 10 paying Founder-plan customers and 3 certified consultants',
  budget: 'e.g. $1,000 per month',
  links: 'e.g. https://sixxab.ai, linkedin.com/in/…',
};

function CompanyProfileCard() {
  const { data, error, reload } = useLoad<{ profile: Record<string, string> | null; fields: ProfileField[] }>('/api/profile');
  const [editing, setEditing] = useState(false);
  const [vals, setVals] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  useEffect(() => {
    if (!data) return;
    setVals(data.profile ?? {});
    if (!data.profile) setEditing(true);
  }, [data]);

  if (error) return <p className="error">{error}</p>;
  if (!data) return null;

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setMsg(null);
    try {
      await api('/api/profile', { method: 'POST', body: JSON.stringify(vals) });
      setEditing(false);
      reload();
    } catch (err) {
      setMsg(err instanceof Error ? err.message : 'Could not save.');
    } finally {
      setBusy(false);
    }
  }

  if (!editing && data.profile) {
    return (
      <section className="panel glass-card">
        <div className="row-between">
          <h2>About your company</h2>
          <button type="button" className="btn-ghost" onClick={() => setEditing(true)}>Edit</button>
        </div>
        <p className="muted small">Every agent reads this before it works.</p>
        <dl className="profile-list">
          {data.fields.filter((f) => data.profile?.[f.key]).map((f) => (
            <div key={f.key}><dt>{f.label}</dt><dd>{data.profile![f.key]}</dd></div>
          ))}
        </dl>
      </section>
    );
  }

  return (
    <section className="panel glass-card">
      <h2>{data.profile ? 'Edit your company profile' : 'First, tell your agents about your company'}</h2>
      <p className="muted small">Every agent reads this before it works. Two minutes here makes every plan and post specific to you.</p>
      <form onSubmit={save} className="form">
        <div className="grid2">
          {data.fields.map((f) => (
            <label key={f.key} className="field">
              <span>{f.label}{f.key === 'name' || f.key === 'offer' ? ' *' : ''}</span>
              {f.key === 'offer' || f.key === 'customers' || f.key === 'goals' ? (
                <textarea rows={2} placeholder={HINTS[f.key]} value={vals[f.key] ?? ''} maxLength={1000} onChange={(e) => setVals({ ...vals, [f.key]: e.target.value })} />
              ) : (
                <input placeholder={HINTS[f.key]} value={vals[f.key] ?? ''} maxLength={1000} onChange={(e) => setVals({ ...vals, [f.key]: e.target.value })} />
              )}
            </label>
          ))}
        </div>
        <div className="row-end">
          {data.profile && <button type="button" className="btn-ghost" onClick={() => { setVals(data.profile ?? {}); setEditing(false); }}>Cancel</button>}
          <button type="submit" className="btn-primary" disabled={busy || !vals.name?.trim() || !vals.offer?.trim()}>{busy ? <Spinner label="Saving…" /> : 'Save profile'}</button>
        </div>
        {msg && <p className="error" role="alert">{msg}</p>}
      </form>
    </section>
  );
}

interface Step { taskId: string; agentId: string; goal: string; status: string; output?: string | null; queued?: number }

function Today({ onPending, goApprovals }: { onPending: (n: number) => void; goApprovals: () => void }) {
  const brief = useLoad<{ briefing: Briefing }>('/api/briefing');
  const [goal, setGoal] = useState('');
  const [busy, setBusy] = useState(false);
  const [steps, setSteps] = useState<Step[] | null>(null);
  const [phase, setPhase] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const refreshPending = useCallback(() => {
    api<{ approvals: Approval[] }>('/api/approvals').then((r) => onPending(r.approvals.length)).catch(() => undefined);
  }, [onPending]);
  useEffect(refreshPending, [refreshPending]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (goal.trim().length < 3) return;
    setBusy(true);
    setError(null);
    setSteps(null);
    try {
      setPhase('Planning…');
      const plan = await api<{ steps: Step[] }>('/api/agents', { method: 'POST', body: JSON.stringify({ goal }) });
      let current = plan.steps;
      setSteps(current);
      setGoal('');
      for (let i = 0; i < current.length; i++) {
        setPhase(`Step ${i + 1} of ${current.length}: ${current[i].agentId} is working…`);
        current = current.map((s, j) => (j === i ? { ...s, status: 'running' } : s));
        setSteps(current);
        try {
          const r = await api<{ status: string; output: string | null; queued: number }>('/api/agents', { method: 'POST', body: JSON.stringify({ taskId: current[i].taskId }) });
          current = current.map((s, j) => (j === i ? { ...s, status: r.status, output: r.output, queued: r.queued } : s));
        } catch (err) {
          current = current.map((s, j) => (j === i ? { ...s, status: 'failed', output: err instanceof Error ? err.message : 'Step failed' } : s));
        }
        setSteps(current);
        refreshPending();
      }
      setPhase(null);
      brief.reload();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not start the agents.');
      setPhase(null);
    } finally {
      setBusy(false);
    }
  }

  const queuedTotal = (steps ?? []).reduce((n, s) => n + (s.queued ?? 0), 0);

  const b = brief.data?.briefing;
  return (
    <div className="stack">
      <CompanyProfileCard />
      <section className="panel glass-card">
        <h2>What should your company get done?</h2>
        <form onSubmit={submit} className="goal-form">
          <label className="sr-only" htmlFor="goal">Goal</label>
          <textarea id="goal" rows={3} placeholder="e.g. Plan our launch week and draft three LinkedIn posts" value={goal} onChange={(e) => setGoal(e.target.value)} maxLength={4000} />
          <button type="submit" className="btn-primary" disabled={busy || goal.trim().length < 3}>{busy ? <Spinner label={phase ?? 'Working…'} /> : 'Hand it to the agents'}</button>
        </form>
        {error && <p className="error" role="alert">{error}</p>}
        {steps && (
          <ol className="steps">
            {steps.map((s) => (
              <li key={s.taskId}>
                <strong>{s.agentId}</strong> <span className={`pill pill-${s.status}`}>{s.status === 'running' ? 'Working…' : STATUS[s.status] ?? s.status}</span>
                {!!s.queued && <span className="pill pill-awaiting_approval">{s.queued} for your approval</span>}
                <div className="muted small">{s.goal}</div>
                {s.output && <p className="output">{s.output}</p>}
              </li>
            ))}
          </ol>
        )}
        {!busy && queuedTotal > 0 && (
          <button type="button" className="btn-primary" onClick={goApprovals}>Review {queuedTotal} item{queuedTotal === 1 ? '' : 's'} waiting for your yes</button>
        )}
      </section>

      <section className="panel glass-card">
        <h2>Morning briefing</h2>
        {brief.error && <p className="error">{brief.error}</p>}
        {!b && !brief.error && <Spinner label="Loading…" />}
        {b && (
          <>
            <p className="lead">{b.summary}</p>
            <div className="grid3">
              <BriefList title="Done" items={b.shipped} empty="Nothing yet today." />
              <BriefList title="Needs you" items={b.needsYou} empty="Nothing is waiting on you." />
              <BriefList title="Learned" items={b.learned} empty="No new lessons." />
            </div>
          </>
        )}
      </section>
    </div>
  );
}

const BriefList = ({ title, items, empty }: { title: string; items: string[]; empty: string }) => (
  <div>
    <h3>{title}</h3>
    {items.length ? <ul className="plain">{items.map((t, i) => <li key={i}>{t}</li>)}</ul> : <p className="muted small">{empty}</p>}
  </div>
);

function Approvals({ onCount }: { onCount: (n: number) => void }) {
  const { data, error, reload } = useLoad<{ approvals: Approval[] }>('/api/approvals');
  useEffect(() => { if (data) onCount(data.approvals.length); }, [data, onCount]);
  if (error) return <p className="error">{error}</p>;
  if (!data) return <Spinner label="Loading approvals…" />;
  if (!data.approvals.length) return <section className="panel glass-card"><h2>All clear</h2><p className="muted">Nothing needs your yes right now.</p></section>;
  return (
    <div className="stack">
      {data.approvals.map((a) => <ApprovalCard key={a.id} a={a} onDone={reload} />)}
    </div>
  );
}

function ApprovalCard({ a, onDone }: { a: Approval; onDone: () => void }) {
  const fields = Object.entries(a.proposed).filter(([, v]) => typeof v === 'string' || typeof v === 'number');
  const [vals, setVals] = useState<Record<string, string>>(Object.fromEntries(fields.map(([k, v]) => [k, String(v)])));
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  const changed = fields.some(([k, v]) => String(v) !== vals[k]);
  async function decide(approved: boolean) {
    setBusy(true);
    setMsg(null);
    const edited = changed
      ? Object.fromEntries(Object.entries(a.proposed).map(([k, v]) => [k, k in vals ? (typeof v === 'number' ? Number(vals[k]) : vals[k]) : v]))
      : null;
    try {
      const r = await api<{ promotion: { taskType: string; from: number; to: number; because: string } | null }>('/api/approvals', {
        method: 'POST', body: JSON.stringify({ approvalId: a.id, approved, edited, reason: reason || undefined }),
      });
      if (r.promotion) setMsg(`This task has earned an upgrade to L${r.promotion.to} (${r.promotion.because}). Confirm it in Agents.`);
      setTimeout(onDone, r.promotion ? 2500 : 0);
    } catch (e) {
      setMsg(e instanceof Error ? e.message : 'Could not save your decision.');
      setBusy(false);
    }
  }

  return (
    <article className="panel glass-card approval">
      <div className="row-between">
        <span className={`pill ${a.kind === 'draft' ? 'pill-draft_for_human' : 'pill-awaiting_approval'}`}>{a.kind === 'draft' ? 'Draft for you to send' : 'Needs your approval'}</span>
        <span className="muted small">{new Date(a.createdAt).toLocaleString()}</span>
      </div>
      <h3>{a.summary}</h3>
      {fields.map(([k]) => (
        <label key={k} className="field">
          <span>{k}</span>
          {String(vals[k]).length > 60 ? (
            <textarea rows={4} value={vals[k]} onChange={(e) => setVals({ ...vals, [k]: e.target.value })} />
          ) : (
            <input value={vals[k]} onChange={(e) => setVals({ ...vals, [k]: e.target.value })} />
          )}
        </label>
      ))}
      <label className="field">
        <span>Note to the agent (optional)</span>
        <input value={reason} placeholder="Why, or what to change next time" onChange={(e) => setReason(e.target.value)} maxLength={1000} />
      </label>
      <div className="row-end">
        <button type="button" className="btn-ghost" disabled={busy} onClick={() => decide(false)}>Reject</button>
        <button type="button" className="btn-primary" disabled={busy} onClick={() => decide(true)}>
          {busy ? <Spinner label="Saving…" /> : a.kind === 'draft' ? 'Accept draft' : changed ? 'Approve with my edits' : 'Approve'}
        </button>
      </div>
      {msg && <p className="notice" role="status">{msg}</p>}
    </article>
  );
}

function Agents() {
  const { data, error, reload } = useLoad<{ agents: AgentInfo[]; taskTypes: TaskType[]; tasks: TaskRow[] }>('/api/agents');
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  if (error) return <p className="error">{error}</p>;
  if (!data) return <Spinner label="Loading agents…" />;

  async function setLevel(t: TaskType, to: number) {
    setBusy(t.key);
    setMsg(null);
    try {
      await api('/api/autonomy', { method: 'POST', body: JSON.stringify({ taskType: t.key, from: t.level, to }) });
      reload();
    } catch (e) {
      setMsg(e instanceof Error ? e.message : 'Could not change the level.');
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="stack">
      <section className="panel glass-card">
        <h2>Autonomy</h2>
        <p className="muted small">Each kind of action earns autonomy on its own. Money stays capped at L2.</p>
        <div className="table-wrap">
          <table>
            <thead><tr><th>Action</th><th>Level</th><th>Change</th></tr></thead>
            <tbody>
              {data.taskTypes.map((t) => (
                <tr key={t.key}>
                  <td>{t.label}</td>
                  <td><span className={`lvl lvl-${t.level}`}>{LEVEL[t.level]}</span></td>
                  <td className="nowrap">
                    <button type="button" className="btn-mini" disabled={busy === t.key || t.level <= 1} onClick={() => setLevel(t, t.level - 1)} aria-label={`Lower ${t.label}`}>Lower</button>
                    <button type="button" className="btn-mini" disabled={busy === t.key || t.level >= t.maxLevel} onClick={() => setLevel(t, t.level + 1)} aria-label={`Raise ${t.label}`}>Raise</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {msg && <p className="error">{msg}</p>}
      </section>
      <section className="panel glass-card">
        <h2>Your agents</h2>
        <div className="grid2">
          {data.agents.map((a) => (
            <div key={a.id} className="agent">
              <div className="row-between"><strong>{a.name}</strong><span className="muted small">{a.layer}</span></div>
              <p className="muted small">{a.job}</p>
            </div>
          ))}
        </div>
      </section>
      <section className="panel glass-card">
        <h2>Recent tasks</h2>
        {data.tasks.length ? (
          <ul className="plain">
            {data.tasks.map((t) => (
              <li key={t.id}><span className={`pill pill-${t.status}`}>{STATUS[t.status] ?? t.status}</span> <strong>{t.agentId}</strong>: {t.goal}</li>
            ))}
          </ul>
        ) : <p className="muted">No tasks yet. Give the agents a goal on the Today tab.</p>}
      </section>
    </div>
  );
}

function Activity() {
  const { data, error } = useLoad<{ events: AuditEvent[] }>('/api/activity');
  if (error) return <p className="error">{error}</p>;
  if (!data) return <Spinner label="Loading activity…" />;
  return (
    <section className="panel glass-card">
      <h2>Activity</h2>
      <p className="muted small">Every action and who approved it. This log cannot be edited.</p>
      <ul className="plain activity">
        {data.events.map((e) => (
          <li key={e.id}>
            <span className="muted small">{new Date(e.at).toLocaleString()}</span>
            <span>
              <strong>{e.actor}</strong> {e.action.replace('.', ' ')}
              {typeof e.detail.summary === 'string' ? `: ${e.detail.summary}` : typeof e.detail.tool === 'string' ? `: ${e.detail.tool}` : ''}
              {typeof e.detail.error === 'string' && <span className="error-inline"> ({e.detail.error})</span>}
            </span>
          </li>
        ))}
      </ul>
    </section>
  );
}
