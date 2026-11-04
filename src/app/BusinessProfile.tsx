// Business onboarding: a guided, sectioned profile every agent reads before it works.
import React, { useEffect, useState } from 'react';
import { api } from '../lib/auth';
import { Spinner } from './ui';
import { useLoad } from './useLoad';

interface Field { key: string; label: string; kind: 'text' | 'long' | 'choice' | 'number'; required?: boolean; options?: string[]; hint?: string }
interface Section { title: string; fields: Field[] }
interface ProfileData {
  profile: Record<string, string> | null;
  sections: Section[];
  completeness: { percent: number; missing: string[] };
}

export function BusinessProfile({ startOpen = false, onSaved }: { startOpen?: boolean; onSaved?: () => void }) {
  const { data, error, reload } = useLoad<ProfileData>('/api/profile');
  const [editing, setEditing] = useState(false);
  const [step, setStep] = useState(0);
  const [vals, setVals] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  useEffect(() => {
    if (!data) return;
    setVals(data.profile ?? {});
    if (!data.profile || (startOpen && data.completeness.percent < 100)) setEditing(true);
  }, [data, startOpen]);

  if (error) return <p className="error">{error}</p>;
  if (!data) return null;

  const sections = data.sections;
  const section = sections[step];
  const essentialsMissing = !vals.name?.trim() || !vals.offer?.trim();

  async function save(finish: boolean) {
    setBusy(true);
    setMsg(null);
    try {
      await api('/api/profile', { method: 'POST', body: JSON.stringify(vals) });
      if (finish) {
        setEditing(false);
        setStep(0);
      }
      reload();
      onSaved?.();
    } catch (err) {
      setMsg(err instanceof Error ? err.message : 'Could not save.');
    } finally {
      setBusy(false);
    }
  }

  if (!editing && data.profile) {
    const p = data.profile;
    return (
      <section className="panel glass-card">
        <div className="row-between">
          <h2>About your business</h2>
          <button type="button" className="btn-ghost" onClick={() => setEditing(true)}>Edit</button>
        </div>
        <Completeness percent={data.completeness.percent} />
        {data.completeness.missing.length > 0 && (
          <p className="muted small">Still to add: {data.completeness.missing.slice(0, 4).join(', ')}{data.completeness.missing.length > 4 ? ` and ${data.completeness.missing.length - 4} more` : ''}.</p>
        )}
        {sections.map((s) => {
          const filled = s.fields.filter((f) => p[f.key]);
          if (!filled.length) return null;
          return (
            <div key={s.title} className="profile-section">
              <h3>{s.title}</h3>
              <dl className="profile-list">
                {filled.map((f) => <div key={f.key}><dt>{f.label}</dt><dd>{p[f.key]}</dd></div>)}
              </dl>
            </div>
          );
        })}
      </section>
    );
  }

  return (
    <section className="panel glass-card" aria-labelledby="onboard-title">
      <h2 id="onboard-title">{data.profile ? 'Your business profile' : 'Start your business on SIXXAB'}</h2>
      <p className="muted small">Every agent reads this before it works. About five minutes; you can save and finish later.</p>
      <ol className="onboard-steps" aria-label="Profile sections">
        {sections.map((s, i) => (
          <li key={s.title}>
            <button type="button" className={i === step ? 'onboard-step on' : 'onboard-step'} aria-current={i === step ? 'step' : undefined} onClick={() => setStep(i)}>
              {i + 1}. {s.title}
            </button>
          </li>
        ))}
      </ol>
      <form className="form" onSubmit={(e) => { e.preventDefault(); if (step < sections.length - 1) setStep(step + 1); else void save(true); }}>
        <div className="grid2">
          {section.fields.map((f) => <FieldInput key={f.key} f={f} value={vals[f.key] ?? ''} onChange={(v) => setVals({ ...vals, [f.key]: v })} />)}
        </div>
        <div className="row-end">
          {step > 0 && <button type="button" className="btn-ghost" onClick={() => setStep(step - 1)}>Back</button>}
          <button type="button" className="btn-ghost" disabled={busy || essentialsMissing} onClick={() => void save(true)}>Save and finish later</button>
          <button type="submit" className="btn-primary" disabled={busy || (step === sections.length - 1 && essentialsMissing)}>
            {busy ? <Spinner label="Saving…" /> : step < sections.length - 1 ? 'Next' : 'Save profile'}
          </button>
        </div>
        {essentialsMissing && <p className="muted small">Business name and what you sell are needed to save.</p>}
        {msg && <p className="error" role="alert">{msg}</p>}
      </form>
    </section>
  );
}

function Completeness({ percent }: { percent: number }) {
  return (
    <div className="complete" role="img" aria-label={`Profile ${percent}% complete`}>
      <div className="complete-bar"><span style={{ width: `${percent}%` }} /></div>
      <span className="muted small">Profile {percent}% complete</span>
    </div>
  );
}

function FieldInput({ f, value, onChange }: { f: Field; value: string; onChange: (v: string) => void }) {
  const label = <span>{f.label}{f.required ? ' *' : ''}</span>;
  if (f.kind === 'choice') {
    return (
      <label className="field">
        {label}
        <select value={value} onChange={(e) => onChange(e.target.value)}>
          <option value="">Choose…</option>
          {f.options!.map((o) => <option key={o} value={o}>{o}</option>)}
        </select>
      </label>
    );
  }
  if (f.kind === 'long') {
    return (
      <label className="field">
        {label}
        <textarea rows={3} placeholder={f.hint} value={value} maxLength={1000} onChange={(e) => onChange(e.target.value)} />
      </label>
    );
  }
  return (
    <label className="field">
      {label}
      <input inputMode={f.kind === 'number' ? 'decimal' : undefined} placeholder={f.hint} value={value} maxLength={1000} onChange={(e) => onChange(f.kind === 'number' ? e.target.value.replace(/[^\d.,]/g, '') : e.target.value)} />
    </label>
  );
}
