// Admin: which agents have done real work in production, and a proof run for those that have not.
// A proof run is one real task in the admin's own workspace; nothing is sent, posted or spent.
import React, { useRef, useState } from 'react';
import { api } from '../lib/auth';
import { Spinner } from './ui';

const ORCHESTRATOR = 'founder-orchestrator';

export interface AgentProofRow { id: string; name: string; group: string; layer: string; job: string; runs: number; lastRunAt: string | null; proven: boolean; evidence: string; proofGoal: string | null }
interface RunResult { taskId: string; status: string; output: string | null; queued: number }

const SCOPE = ['Always on', 'S1 Startup', 'S2 Struggle'];

export function AgentProof({ agents, onDone }: { agents: AgentProofRow[]; onDone: () => void }) {
  const [group, setGroup] = useState('scope');
  const [running, setRunning] = useState<string | null>(null);
  const [results, setResults] = useState<Record<string, string>>({});
  const stop = useRef(false);
  const [stopping, setStopping] = useState(false);
  const shown = agents.filter((a) => (group === 'scope' ? SCOPE.includes(a.group) : group === 'all' ? true : a.group === group));
  const todo = shown.filter((a) => !a.proven && a.proofGoal);
  const proven = shown.filter((a) => a.proven).length;

  async function prove(a: AgentProofRow): Promise<void> {
    setRunning(a.id);
    try {
      if (a.id === ORCHESTRATOR) {
        // The orchestrator proves itself by planning: it assigns steps but runs none of them.
        const p = await api<{ steps: unknown[] }>('/api/agents', { method: 'POST', body: JSON.stringify({ goal: a.proofGoal }) });
        setResults((x) => ({ ...x, [a.id]: `Done; planned ${p.steps.length} step${p.steps.length === 1 ? '' : 's'} (on Today, not run)` }));
        return;
      }
      const r = await api<RunResult>('/api/agents', { method: 'POST', body: JSON.stringify({ goal: a.proofGoal, agentId: a.id }) });
      setResults((x) => ({ ...x, [a.id]: r.status === 'done' ? `Done${r.queued ? `; ${r.queued} waiting in Approvals` : ''}` : `Ended: ${r.status}` }));
    } catch (e) {
      setResults((x) => ({ ...x, [a.id]: e instanceof Error ? `Failed: ${e.message}` : 'Failed' }));
    } finally {
      setRunning(null);
    }
  }

  async function proveAll() {
    stop.current = false;
    setStopping(false);
    for (const a of todo) {
      if (stop.current) break;
      await prove(a);
    }
    onDone();
  }

  return (
    <section className="panel glass-card">
      <div className="row-between">
        <div>
          <p className="eyebrow">Agent proof · build plan</p>
          <h2>{proven} of {shown.length} agents proven live</h2>
        </div>
        <select aria-label="Agent group" value={group} onChange={(e) => setGroup(e.target.value)}>
          <option value="scope">Always on, S1 and S2</option>
          <option value="all">All agents</option>
          {[...new Set(agents.map((a) => a.group))].map((g) => <option key={g} value={g}>{g}</option>)}
        </select>
      </div>
      <p className="muted small">Proven means real work in production: a finished task, or for platform services their own evidence. A proof run gives each unproven agent one real task in your workspace, using its suggested first task; nothing is sent, posted or spent, and anything an agent drafts to send waits in Approvals. Each run costs a few cents of model time.</p>
      <div className="row-end">
        {running && <button type="button" className="btn-ghost" disabled={stopping} onClick={() => { stop.current = true; setStopping(true); }}>{stopping ? 'Stopping…' : 'Stop after this one'}</button>}
        <button type="button" className="btn-primary" disabled={!!running || todo.length === 0} onClick={proveAll}>
          {running ? <Spinner label={`Running ${agents.find((a) => a.id === running)?.name ?? ''}…`} /> : todo.length ? `Run proof for ${todo.length} agent${todo.length === 1 ? '' : 's'}` : 'All agents here are proven'}
        </button>
      </div>
      <div className="table-wrap">
        <table>
          <thead><tr><th>Agent</th><th>Group</th><th>Status</th><th>Evidence</th><th /></tr></thead>
          <tbody>{shown.map((a) => (
            <tr key={a.id}>
              <td><strong>{a.name}</strong><br /><span className="muted small">{a.job}</span></td>
              <td className="nowrap">{a.group}</td>
              <td><span className={`pill pill-${a.proven ? 'done' : 'planned'}`}>{a.proven ? 'Proven live' : 'Built'}</span></td>
              <td className="small">{results[a.id] ?? a.evidence}{a.lastRunAt && !results[a.id] ? <span className="muted"> · last {new Date(a.lastRunAt).toLocaleDateString()}</span> : null}</td>
              <td>{a.proofGoal && !a.proven && <button type="button" className="btn-mini" disabled={!!running} onClick={async () => { await prove(a); onDone(); }}>Prove</button>}</td>
            </tr>
          ))}</tbody>
        </table>
      </div>
    </section>
  );
}
