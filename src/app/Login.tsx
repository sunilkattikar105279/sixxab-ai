import React, { useEffect, useState } from 'react';
import { getConfig, getSession, isEmail, sendEmailCode, sendSmsCode, toE164, verifyEmailCode, verifySmsCode, type PublicConfig } from '../lib/auth';
import { Brand, Spinner } from './ui';

type Method = 'email' | 'mobile';
type Step = 'enter' | 'code';

const COUNTRIES = [
  { code: '1', label: 'United States +1' },
  { code: '91', label: 'India +91' },
  { code: '44', label: 'United Kingdom +44' },
  { code: '971', label: 'UAE +971' },
  { code: '65', label: 'Singapore +65' },
  { code: '61', label: 'Australia +61' },
  { code: '1', label: 'Canada +1' },
];

export default function Login() {
  const [cfg, setCfg] = useState<PublicConfig | null>(null);
  const [method, setMethod] = useState<Method>('email');
  const [step, setStep] = useState<Step>('enter');
  const [email, setEmail] = useState('');
  const [country, setCountry] = useState('1');
  const [local, setLocal] = useState('');
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  useEffect(() => {
    getConfig().then(setCfg);
    getSession().then((s) => {
      if (s) location.replace('/app');
    });
    try {
      if (Intl.DateTimeFormat().resolvedOptions().timeZone.startsWith('Asia/Kolkata')) setCountry('91');
    } catch {
      // Default stays +1.
    }
  }, []);

  const phone = toE164(country, local);
  const ready = cfg ? Boolean(cfg.supabaseUrl && cfg.supabaseAnonKey) : true;

  const switchMethod = (m: Method) => {
    setMethod(m);
    setStep('enter');
    setCode('');
    setError(null);
    setNotice(null);
  };

  async function send(e?: React.FormEvent) {
    e?.preventDefault();
    setError(null);
    if (method === 'email' && !isEmail(email)) return setError('Enter a valid email address.');
    if (method === 'mobile' && !phone) return setError('Enter a valid mobile number.');
    setBusy(true);
    try {
      if (method === 'email') await sendEmailCode(email);
      else await sendSmsCode(phone!);
      setStep('code');
      setNotice(method === 'email' ? `We sent a 6-digit code and a sign-in link to ${email.trim()}.` : `We sent a 6-digit code by SMS to ${phone}.`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not send the code.');
    } finally {
      setBusy(false);
    }
  }

  async function verify(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!/^\d{6,10}$/.test(code.trim())) return setError('Enter the code from your message.');
    setBusy(true);
    try {
      if (method === 'email') await verifyEmailCode(email, code);
      else await verifySmsCode(phone!, code);
      location.replace('/app');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not verify the code.');
      setBusy(false);
    }
  }

  return (
    <div className="auth-page">
      <header className="auth-top">
        <Brand />
        <a href="/#begin" className="link-quiet">Book a strategy call</a>
      </header>
      <main className="auth-card glass-card">
        <h1>Sign in to SIXXAB AI</h1>
        <p className="muted">New here? Signing in creates your workspace.</p>

        {!ready && (
          <p className="notice" role="status">
            Sign-in opens at launch. <a href="/#begin">Book a strategy call</a> to get early access.
          </p>
        )}

        <div className="tabs" role="tablist" aria-label="Sign-in method">
          <button type="button" role="tab" aria-selected={method === 'email'} className={method === 'email' ? 'tab on' : 'tab'} onClick={() => switchMethod('email')}>Email</button>
          <button type="button" role="tab" aria-selected={method === 'mobile'} className={method === 'mobile' ? 'tab on' : 'tab'} onClick={() => switchMethod('mobile')}>Mobile</button>
        </div>

        {step === 'enter' ? (
          <form onSubmit={send} className="form" noValidate>
            {method === 'email' ? (
              <label className="field">
                <span>Work email</span>
                <input type="email" inputMode="email" autoComplete="email" placeholder="you@company.com" value={email} onChange={(e) => setEmail(e.target.value)} required />
              </label>
            ) : (
              <div className="field">
                <span id="mobile-label">Mobile number</span>
                <div className="phone-row">
                  <select aria-label="Country code" value={country} onChange={(e) => setCountry(e.target.value)}>
                    {COUNTRIES.map((c) => (
                      <option key={c.label} value={c.code}>{c.label}</option>
                    ))}
                  </select>
                  <input aria-labelledby="mobile-label" type="tel" inputMode="tel" autoComplete="tel-national" placeholder={country === '91' ? '98765 43210' : '(555) 123-4567'} value={local} onChange={(e) => setLocal(e.target.value)} required />
                </div>
              </div>
            )}
            <button type="submit" className="btn-primary" disabled={busy || !ready}>
              {busy ? <Spinner label="Sending…" /> : 'Send code'}
            </button>
          </form>
        ) : (
          <form onSubmit={verify} className="form" noValidate>
            {notice && <p className="notice" role="status">{notice}</p>}
            <label className="field">
              <span>6-digit code</span>
              <input className="code-input" inputMode="numeric" autoComplete="one-time-code" pattern="[0-9]*" maxLength={10} placeholder="123456" value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))} autoFocus />
            </label>
            <button type="submit" className="btn-primary" disabled={busy}>
              {busy ? <Spinner label="Checking…" /> : 'Sign in'}
            </button>
            <div className="row-between">
              <button type="button" className="link-btn" onClick={() => { setStep('enter'); setCode(''); setError(null); }}>Change {method === 'email' ? 'email' : 'number'}</button>
              <button type="button" className="link-btn" disabled={busy} onClick={() => send()}>Resend code</button>
            </div>
          </form>
        )}

        {error && <p className="error" role="alert">{error}</p>}
        <p className="fine">By signing in you agree to our <a href="/terms">Terms</a> and <a href="/privacy">Privacy Policy</a>. Message and data rates may apply.</p>
      </main>
    </div>
  );
}
