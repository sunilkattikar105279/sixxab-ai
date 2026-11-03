// Browser auth over Supabase's REST API: email one-time code or magic link, and SMS one-time code.
export interface PublicConfig {
  supabaseUrl: string | null;
  supabaseAnonKey: string | null;
  bookingUrl: string | null;
  contactEmail: string;
}

export interface Session {
  accessToken: string;
  refreshToken: string;
  expiresAt: number; // epoch seconds
  user: { id: string; email?: string; phone?: string };
}

const KEY = 'sixxab.session';
let configPromise: Promise<PublicConfig> | null = null;

export function getConfig(): Promise<PublicConfig> {
  configPromise ??= fetch('/api/config', { cache: 'no-store' })
    .then((r) => (r.ok ? r.json() : Promise.reject(new Error('config'))))
    .catch(() => ({ supabaseUrl: null, supabaseAnonKey: null, bookingUrl: null, contactEmail: 'sunil.kattikar@gmail.com' }));
  return configPromise;
}

function save(s: Session | null) {
  try {
    if (s) localStorage.setItem(KEY, JSON.stringify(s));
    else localStorage.removeItem(KEY);
  } catch {
    // Storage can be blocked (private mode); the session then lasts for this page only.
  }
  memory = s;
}
let memory: Session | null = null;

function load(): Session | null {
  if (memory) return memory;
  try {
    const raw = localStorage.getItem(KEY);
    memory = raw ? (JSON.parse(raw) as Session) : null;
  } catch {
    memory = null;
  }
  return memory;
}

interface TokenResponse {
  access_token: string;
  refresh_token: string;
  expires_in: number;
  expires_at?: number;
  user: { id: string; email?: string; phone?: string };
}

const toSession = (t: TokenResponse): Session => ({
  accessToken: t.access_token,
  refreshToken: t.refresh_token,
  expiresAt: t.expires_at ?? Math.floor(Date.now() / 1000) + t.expires_in,
  user: { id: t.user.id, email: t.user.email || undefined, phone: t.user.phone || undefined },
});

async function authCall<T>(path: string, body: unknown, token?: string): Promise<T> {
  const cfg = await getConfig();
  if (!cfg.supabaseUrl || !cfg.supabaseAnonKey) throw new Error('Sign-in is not switched on yet. Please book a call instead.');
  const res = await fetch(`${cfg.supabaseUrl}/auth/v1/${path}`, {
    method: 'POST',
    headers: { apikey: cfg.supabaseAnonKey, 'content-type': 'application/json', ...(token ? { authorization: `Bearer ${token}` } : {}) },
    body: JSON.stringify(body),
  });
  const text = await res.text();
  let data: Record<string, string> = {};
  try {
    data = text ? JSON.parse(text) : {};
  } catch {
    throw new Error('Sign-in is temporarily unavailable. Please try again shortly or book a call.');
  }
  if (!res.ok) throw new Error(friendly(res.status, data));
  return data as T;
}

function friendly(status: number, data: { msg?: string; error_description?: string; message?: string }): string {
  const raw = data.msg || data.error_description || data.message || '';
  if (status === 429) return 'Too many attempts. Please wait a minute and try again.';
  if (/expired|invalid/i.test(raw)) return 'That code is wrong or has expired. Request a new one.';
  if (/phone/i.test(raw) && /provider|disabled/i.test(raw)) return 'Mobile sign-in is not switched on yet. Please use email.';
  return raw || 'Something went wrong. Please try again.';
}

export const isEmail = (v: string) => /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(v.trim());

/** Builds an E.164 number from a country code and a local number; null if it does not look valid. */
export function toE164(countryCode: string, local: string): string | null {
  const digits = local.replace(/\D/g, '').replace(/^0+/, '');
  const cc = countryCode.replace(/\D/g, '');
  const full = `+${cc}${digits}`;
  return /^\+\d{8,15}$/.test(full) && digits.length >= 6 ? full : null;
}

export async function sendEmailCode(email: string): Promise<void> {
  const redirect = encodeURIComponent(`${location.origin}/app`);
  await authCall(`otp?redirect_to=${redirect}`, { email: email.trim().toLowerCase(), create_user: true });
}

export async function verifyEmailCode(email: string, code: string): Promise<Session> {
  const t = await authCall<TokenResponse>('verify', { type: 'email', email: email.trim().toLowerCase(), token: code.trim() });
  const s = toSession(t);
  save(s);
  return s;
}

export async function sendSmsCode(phone: string): Promise<void> {
  await authCall('otp', { phone, create_user: true });
}

export async function verifySmsCode(phone: string, code: string): Promise<Session> {
  const t = await authCall<TokenResponse>('verify', { type: 'sms', phone, token: code.trim() });
  const s = toSession(t);
  save(s);
  return s;
}

/** Picks up a session from a magic-link redirect (#access_token=…) and cleans the URL. */
export async function sessionFromRedirect(): Promise<Session | null> {
  if (!location.hash.includes('access_token=')) return null;
  const p = new URLSearchParams(location.hash.slice(1));
  const access = p.get('access_token');
  const refresh = p.get('refresh_token');
  history.replaceState(null, '', location.pathname + location.search);
  if (!access || !refresh) return null;
  const cfg = await getConfig();
  if (!cfg.supabaseUrl || !cfg.supabaseAnonKey) return null;
  const res = await fetch(`${cfg.supabaseUrl}/auth/v1/user`, { headers: { apikey: cfg.supabaseAnonKey, authorization: `Bearer ${access}` } });
  if (!res.ok) return null;
  const user = (await res.json()) as TokenResponse['user'];
  const s: Session = { accessToken: access, refreshToken: refresh, expiresAt: Number(p.get('expires_at')) || Math.floor(Date.now() / 1000) + Number(p.get('expires_in') || 3600), user: { id: user.id, email: user.email || undefined, phone: user.phone || undefined } };
  save(s);
  return s;
}

export async function getSession(): Promise<Session | null> {
  const s = load();
  if (!s) return null;
  if (s.expiresAt - 60 > Date.now() / 1000) return s;
  try {
    const t = await authCall<TokenResponse>('token?grant_type=refresh_token', { refresh_token: s.refreshToken });
    const next = toSession(t);
    save(next);
    return next;
  } catch {
    save(null);
    return null;
  }
}

export async function signOut(): Promise<void> {
  const s = load();
  save(null);
  if (s) {
    try {
      await authCall('logout', {}, s.accessToken);
    } catch {
      // Local sign-out already happened; server-side revoke is best effort.
    }
  }
}

/** Calls a SIXXAB API route with the user's token. */
export async function api<T>(path: string, init: RequestInit = {}): Promise<T> {
  const s = await getSession();
  if (!s) throw new Error('Please sign in again');
  const res = await fetch(path, { ...init, headers: { 'content-type': 'application/json', authorization: `Bearer ${s.accessToken}`, ...(init.headers ?? {}) } });
  const data = (await res.json().catch(() => ({}))) as T & { error?: string };
  if (!res.ok) throw new Error(data.error || `Request failed (${res.status})`);
  return data;
}
