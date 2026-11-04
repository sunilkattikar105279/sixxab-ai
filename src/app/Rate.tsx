// Thumbs up or down on an agent's result, with a reason. The agent reads recent reasons next time.
import React, { useState } from 'react';
import { api } from '../lib/auth';

export function Rate({ taskId }: { taskId: string }) {
  const [mode, setMode] = useState<'idle' | 'down' | 'sent'>('idle');
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  async function send(rating: 'up' | 'down') {
    setBusy(true);
    setMsg(null);
    try {
      await api('/api/feedback', { method: 'POST', body: JSON.stringify({ taskId, rating, reason }) });
      setMode('sent');
    } catch (e) {
      setMsg(e instanceof Error ? e.message : 'Could not send feedback.');
    } finally {
      setBusy(false);
    }
  }

  if (mode === 'sent') return <p className="muted small rate-done">Thanks. The agent will use this next time.</p>;
  return (
    <div className="rate">
      {mode === 'idle' ? (
        <>
          <span className="muted small">Was this useful?</span>
          <button type="button" className="btn-mini" disabled={busy} onClick={() => send('up')} aria-label="Good result">Good</button>
          <button type="button" className="btn-mini" disabled={busy} onClick={() => setMode('down')} aria-label="Needs work">Needs work</button>
        </>
      ) : (
        <form className="rate-form" onSubmit={(e) => { e.preventDefault(); void send('down'); }}>
          <label className="sr-only" htmlFor={`why-${taskId}`}>What should change?</label>
          <input id={`why-${taskId}`} placeholder="What should change next time?" value={reason} maxLength={500} onChange={(e) => setReason(e.target.value)} autoFocus />
          <button type="submit" className="btn-mini" disabled={busy || !reason.trim()}>Send</button>
          <button type="button" className="btn-mini" onClick={() => setMode('idle')}>Cancel</button>
        </form>
      )}
      {msg && <p className="error small" role="alert">{msg}</p>}
    </div>
  );
}
