// Runs one agent on a prepared goal and shows what it produced; emails it queued wait in Approvals.
import React, { useState } from 'react';
import { api } from '../lib/auth';
import { Rate } from './Rate';
import { Spinner } from './ui';

interface RunResult { taskId: string; status: string; output: string | null; queued: number }
interface Props { agentId: string; goal: string; label: string; emptyText: string; goApprovals: () => void; extra?: (output: string) => React.ReactNode }

export function AgentRun({ agentId, goal, label, emptyText, goApprovals, extra }: Props) {
  const [busy, setBusy] = useState(false);
  const [run, setRun] = useState<RunResult | null>(null);
  const [msg, setMsg] = useState<string | null>(null);

  async function go() {
    setBusy(true);
    setMsg(null);
    setRun(null);
    try {
      setRun(await api<RunResult>('/api/agents', { method: 'POST', body: JSON.stringify({ goal, agentId }) }));
    } catch (e) {
      setMsg(e instanceof Error ? e.message : 'The agent could not run.');
    } finally {
      setBusy(false);
    }
  }

  if (!goal) return <p className="muted small">{emptyText}</p>;
  return (
    <div className="stack-sm">
      <div className="row-end"><button type="button" className="btn-primary" disabled={busy} onClick={go}>{busy ? <Spinner label="Agent working…" /> : label}</button></div>
      {run && (
        <div className="notice" role="status">
          {run.output && <p className="output">{run.output}</p>}
          {run.output && extra?.(run.output)}
          {run.output && run.status === 'done' && <Rate taskId={run.taskId} />}
          {run.queued > 0 && <button type="button" className="btn-primary" onClick={goApprovals}>Review {run.queued} message{run.queued === 1 ? '' : 's'} waiting for your yes</button>}
        </div>
      )}
      {msg && <p className="error" role="alert">{msg}</p>}
    </div>
  );
}

/** Posts an action to one of the business endpoints and reports errors inline. */
export function usePost(path: string, onDone: () => void) {
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  async function post(key: string, body: Record<string, unknown>): Promise<boolean> {
    setBusy(key);
    setMsg(null);
    try {
      await api(path, { method: 'POST', body: JSON.stringify(body) });
      onDone();
      return true;
    } catch (e) {
      setMsg(e instanceof Error ? e.message : 'Could not save.');
      return false;
    } finally {
      setBusy(null);
    }
  }
  return { busy, msg, post };
}

export const money = (n: number, c = 'USD') => {
  try { return new Intl.NumberFormat(c === 'INR' ? 'en-IN' : 'en-US', { style: 'currency', currency: c, maximumFractionDigits: 0 }).format(n); } catch { return `${n} ${c}`; }
};
