// Front Desk panel (top of the Support tab): the 24/7 AI attendant's hours, numbers, languages and approved answers,
// the voice agent script to paste into Retell, the missed-call text, and the setup steps. Nothing here calls or texts.
import React, { useEffect, useState } from 'react';
import { Spinner } from './ui';
import { AgentRun, usePost } from './AgentRun';

type Day = 'mon' | 'tue' | 'wed' | 'thu' | 'fri' | 'sat' | 'sun';
interface Answer { q: string; a: string }
export interface FrontDeskSettings {
  on: boolean; vertical: string; languages: string[]; timezone: string; hours: Record<Day, string>;
  transferNumber: string; onCallNumber: string; callbackOpen: string; callbackClosed: string; bookingUrl: string;
  textBack: { on: boolean; template: string }; answers: Answer[];
}
export interface FrontDeskState {
  settings: FrontDeskSettings; saved: boolean; updatedAt: string | null; openNow: boolean; healthcare: boolean;
  script: string; textBackPreview: string; postCallFields: { name: string; type: string; values?: readonly string[]; description: string }[];
  checklist: { step: string; done: boolean }[]; answersGoal: string; orgId: string;
}

const DAYS: [Day, string][] = [['mon', 'Mon'], ['tue', 'Tue'], ['wed', 'Wed'], ['thu', 'Thu'], ['fri', 'Fri'], ['sat', 'Sat'], ['sun', 'Sun']];
const VERTICALS: [string, string][] = [
  ['hvac', 'HVAC and plumbing'], ['roofing', 'Roofing'], ['home', 'Other home services'], ['dental', 'Dental practice'], ['medspa', 'Med spa'],
  ['clinic', 'Clinic or hospital'], ['law', 'Law firm'], ['agency', 'B2B or agency'], ['other', 'Other'],
];
const LANGS: [string, string][] = [['en', 'English'], ['es', 'Spanish'], ['hi', 'Hindi'], ['mr', 'Marathi']];
const ZONES = ['America/New_York', 'America/Chicago', 'America/Denver', 'America/Los_Angeles', 'Asia/Kolkata'];

export function FrontDesk({ state, reload, goApprovals }: { state: FrontDeskState; reload: () => void; goApprovals: () => void }) {
  const [f, setF] = useState<FrontDeskSettings>(state.settings);
  const [copied, setCopied] = useState(false);
  const { busy, msg, post } = usePost('/api/support', reload);
  useEffect(() => setF(state.settings), [state.settings]);
  const set = <K extends keyof FrontDeskSettings>(k: K, v: FrontDeskSettings[K]) => setF({ ...f, [k]: v });
  const done = state.checklist.filter((c) => c.done).length;

  async function copy() {
    try { await navigator.clipboard.writeText(state.script); setCopied(true); setTimeout(() => setCopied(false), 2000); } catch { setCopied(false); }
  }

  return (
    <section className="panel glass-card">
      <p className="eyebrow">Front Desk · 24/7 AI attendant</p>
      <div className="row-between">
        <h2>Calls, WhatsApp, email and website chat</h2>
        <span className={`pill pill-${f.on ? 'done' : 'planned'}`}>{f.on ? 'On' : 'Off'}</span>
      </div>
      <p className="muted small">
        The voice agent answers your phone day and night from the answers you approve here, books or takes a message, and every caller lands in your CRM.
        Each call and message joins your sales flow as an enquiry, and every reply waits for your yes in Approvals. Right now you are {state.openNow ? 'open' : 'closed'} by these hours.
      </p>

      <details open={!state.saved}>
        <summary><strong>Setup</strong> <span className="muted small">· {done} of {state.checklist.length} done</span></summary>
        <ol className="small">{state.checklist.map((c) => <li key={c.step}>{c.done ? '✓ ' : ''}{c.step}</li>)}</ol>
        {state.orgId && <p className="muted small">Your business ID for the n8n workflow: <code>{state.orgId}</code></p>}
      </details>

      <form className="form" onSubmit={(e) => { e.preventDefault(); void post('frontdesk', { action: 'frontdesk', settings: f }); }}>
        <div className="grid3">
          <label className="field"><span>Kind of business</span>
            <select value={f.vertical} onChange={(e) => set('vertical', e.target.value)}>{VERTICALS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select>
          </label>
          <label className="field"><span>Time zone</span>
            <select value={f.timezone} onChange={(e) => set('timezone', e.target.value)}>
              {[...new Set([f.timezone, ...ZONES])].map((z) => <option key={z}>{z}</option>)}
            </select>
          </label>
          <fieldset className="field"><span>Languages</span>
            <span className="row-end" style={{ justifyContent: 'flex-start', flexWrap: 'wrap', gap: '.75rem' }}>
              {LANGS.map(([code, label]) => (
                <label key={code} className="small"><input type="checkbox" checked={f.languages.includes(code)}
                  onChange={(e) => set('languages', e.target.checked ? [...f.languages, code] : f.languages.filter((l) => l !== code))} /> {label}</label>
              ))}
            </span>
          </fieldset>
        </div>

        <p className="small"><strong>Opening hours</strong> <span className="muted">· like 09:00-18:00, 24h, or empty for closed</span></p>
        <div className="grid3" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(8rem, 1fr))' }}>
          {DAYS.map(([d, label]) => (
            <label key={d} className="field"><span>{label}</span>
              <input value={f.hours[d]} placeholder="closed" maxLength={11} onChange={(e) => set('hours', { ...f.hours, [d]: e.target.value })} />
            </label>
          ))}
        </div>

        <div className="grid3">
          <label className="field"><span>Transfer to (open hours)</span><input type="tel" value={f.transferNumber} maxLength={20} onChange={(e) => set('transferNumber', e.target.value)} placeholder="+1 214 555 0100" /></label>
          <label className="field"><span>On-call number (emergencies, any hour)</span><input type="tel" value={f.onCallNumber} maxLength={20} onChange={(e) => set('onCallNumber', e.target.value)} /></label>
          <label className="field"><span>Booking link</span><input type="url" value={f.bookingUrl} maxLength={300} onChange={(e) => set('bookingUrl', e.target.value)} placeholder="https://cal.com/you" /></label>
        </div>
        <div className="grid2">
          <label className="field"><span>Callback promise when open</span><input value={f.callbackOpen} maxLength={80} onChange={(e) => set('callbackOpen', e.target.value)} /></label>
          <label className="field"><span>Callback promise when closed</span><input value={f.callbackClosed} maxLength={80} onChange={(e) => set('callbackClosed', e.target.value)} /></label>
        </div>

        <p className="small"><strong>Approved answers</strong> <span className="muted">· the only facts the attendant may give ({f.answers.length} of 40)</span></p>
        {state.healthcare && <p className="muted small">Healthcare: business answers only (hours, location, services, insurance taken, payment). No medical advice.</p>}
        <ul className="stack-sm" style={{ listStyle: 'none', padding: 0, margin: 0 }}>
          {f.answers.map((x, i) => (
            <li key={i} className="grid2">
              <input aria-label={`Question ${i + 1}`} value={x.q} maxLength={200} placeholder="Question" onChange={(e) => set('answers', f.answers.map((y, j) => (j === i ? { ...y, q: e.target.value } : y)))} />
              <span className="row-end" style={{ gap: '.5rem' }}>
                <input aria-label={`Answer ${i + 1}`} style={{ flex: 1 }} value={x.a} maxLength={600} placeholder="Answer" onChange={(e) => set('answers', f.answers.map((y, j) => (j === i ? { ...y, a: e.target.value } : y)))} />
                <button type="button" className="btn-mini" aria-label={`Remove answer ${i + 1}`} onClick={() => set('answers', f.answers.filter((_, j) => j !== i))}>Remove</button>
              </span>
            </li>
          ))}
        </ul>
        <div className="row-end"><button type="button" className="btn-mini" disabled={f.answers.length >= 40} onClick={() => set('answers', [...f.answers, { q: '', a: '' }])}>Add an answer</button></div>

        <label className="small"><input type="checkbox" checked={f.textBack.on} onChange={(e) => set('textBack', { ...f.textBack, on: e.target.checked })} /> Text back missed or dropped calls</label>
        <p className="muted small">Nothing texts anyone from here yet. Each missed call lands in your CRM as a call-back to make, and this is the text to send them. Sending it automatically is a choice you can make later.</p>
        <label className="field"><span>Missed-call text <span className="muted">· use {'{business}'} and {'{booking}'}</span></span>
          <textarea rows={2} maxLength={320} value={f.textBack.template} onChange={(e) => set('textBack', { ...f.textBack, template: e.target.value })} />
        </label>
        <p className="muted small">Preview of the saved text: {state.textBackPreview}</p>

        <div className="row-between">
          <label className="small"><input type="checkbox" checked={f.on} onChange={(e) => set('on', e.target.checked)} /> Front Desk is on</label>
          <button type="submit" className="btn-primary" disabled={!!busy}>{busy === 'frontdesk' ? <Spinner label="Saving…" /> : 'Save Front Desk'}</button>
        </div>
        {msg && <p className="error" role="alert">{msg}</p>}
      </form>

      <AgentRun agentId="front-desk" goal={state.answersGoal} label="Suggest approved answers from my profile" emptyText="" goApprovals={goApprovals} />

      <details>
        <summary><strong>Voice agent script</strong> <span className="muted small">· paste into Retell as the agent's prompt (updates when you save)</span></summary>
        <div className="row-end"><button type="button" className="btn-mini" onClick={copy}>{copied ? 'Copied' : 'Copy script'}</button></div>
        <textarea readOnly rows={14} value={state.script} aria-label="Voice agent script" style={{ width: '100%' }} />
        <p className="small"><strong>Post-call fields to add in Retell</strong></p>
        <ul className="small">{state.postCallFields.map((p) => <li key={p.name}><code>{p.name}</code> ({p.type}{p.values ? `: ${p.values.join(', ')}` : ''}): {p.description}</li>)}</ul>
      </details>
    </section>
  );
}
