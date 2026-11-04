// Shared server helpers for the API functions: config, auth, and wiring the core.
import { AnthropicClient, modelsFromEnv } from '../core/model.js';
import { SupabaseStore, verifyUser } from '../core/supabase-store.js';
import { webhookIntegrations } from '../core/tools.js';
import { automationPath, defaultPath, isAdmin, webhookFor } from '../core/automation.js';
import { loadBusinessProfile } from '../core/profile.js';
import type { RuntimeDeps } from '../core/runtime.js';

const env = (k: string): string | undefined => {
  const v = process.env[k];
  return v && v.trim() ? v.trim() : undefined;
};

/**
 * Accepts the Supabase project URL in the forms people paste: the full URL, the host without https://,
 * or just the project ref. Returns https://<ref>.supabase.co (no trailing slash), or undefined if unusable.
 */
export function normalizeSupabaseUrl(raw: string | undefined): string | undefined {
  if (!raw) return undefined;
  let v = raw.trim().replace(/\/+$/, '');
  if (/^[a-z0-9]{15,40}$/i.test(v)) v = `https://${v.toLowerCase()}.supabase.co`;
  else if (!/^https?:\/\//i.test(v)) v = `https://${v}`;
  try {
    const u = new URL(v);
    if (u.protocol !== 'https:' && u.hostname !== 'localhost') return undefined;
    return `${u.protocol}//${u.host}`;
  } catch {
    return undefined;
  }
}

const supabaseUrl = () => normalizeSupabaseUrl(env('SUPABASE_URL'));

export const json =(body: unknown, status = 200): Response =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json', 'cache-control': 'no-store' } });

export class HttpError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

export function publicConfig() {
  return {
    supabaseUrl: supabaseUrl() ?? null,
    supabaseAnonKey: env('SUPABASE_ANON_KEY') ?? null,
    bookingUrl: env('BOOKING_URL') ?? null,
    contactEmail: env('CONTACT_EMAIL') ?? 'sunil.kattikar@gmail.com',
  };
}

export function store(): SupabaseStore {
  const url = supabaseUrl();
  const key = env('SUPABASE_SERVICE_ROLE_KEY');
  if (!url || !key) throw new HttpError(503, 'The platform database is not configured yet');
  return new SupabaseStore(url, key);
}

/**
 * Runtime wiring for one business. Approved actions go to that business's own n8n workflow;
 * an admin's own business falls back to the default path in N8N_WEBHOOK_URL. Any other business
 * without an assigned workflow is recorded, never sent.
 */
export async function depsFor(s: SupabaseStore, orgId: string, label: string): Promise<RuntimeDeps> {
  const apiKey = env('ANTHROPIC_API_KEY');
  if (!apiKey) throw new HttpError(503, 'The AI model is not configured yet');
  const base = env('N8N_WEBHOOK_URL');
  const [assigned, profile] = await Promise.all([automationPath(s, orgId), loadBusinessProfile(s, orgId)]);
  const path = assigned ?? (isAdmin(label, env('ADMIN_EMAILS')) ? defaultPath(base) : null);
  return {
    store: s,
    model: new AnthropicClient({ apiKey, models: modelsFromEnv(process.env) }),
    integrations: webhookIntegrations(webhookFor(base, path), env('N8N_WEBHOOK_SECRET'), fetch, { orgId, name: profile?.name }),
    journey: journeyOptions(),
  };
}

export function requireAdmin(label: string): void {
  if (!isAdmin(label, env('ADMIN_EMAILS'))) throw new HttpError(403, 'Admins only');
}

/** Journey settings from the environment: INR_PER_USD converts rupee revenue for stage gates (default 85). */
export function journeyOptions(): { inrPerUsd?: number } {
  const rate = Number(env('INR_PER_USD'));
  return Number.isFinite(rate) && rate > 0 ? { inrPerUsd: rate } : {};
}

/** Resolves the signed-in user and their org from the Bearer token, or throws 401. */
export async function requireUser(request: Request): Promise<{ userId: string; orgId: string; label: string; store: SupabaseStore }> {
  const url = supabaseUrl();
  const anon = env('SUPABASE_ANON_KEY');
  if (!url || !anon) throw new HttpError(503, 'Sign-in is not configured yet');
  const token = (request.headers.get('authorization') ?? '').replace(/^Bearer\s+/i, '');
  const user = await verifyUser(url, anon, token);
  if (!user) throw new HttpError(401, 'Please sign in again');
  const s = store();
  const label = user.email ?? user.phone ?? user.id;
  let orgId = await s.orgForUser(user.id);
  if (!orgId) {
    // Two first requests can race; both then settle on the oldest workspace so the user always sees one.
    const created = await s.provisionWorkspace(user.id, label);
    orgId = (await s.orgForUser(user.id)) ?? created;
  }
  return { userId: user.id, orgId, label, store: s };
}

export async function readJson<T>(request: Request, maxBytes = 64_000): Promise<T> {
  const text = await request.text();
  if (text.length > maxBytes) throw new HttpError(413, 'Request too large');
  try {
    return JSON.parse(text || '{}') as T;
  } catch {
    throw new HttpError(400, 'Invalid JSON');
  }
}

export function handle(fn: (request: Request) => Promise<Response>) {
  return async (request: Request): Promise<Response> => {
    try {
      return await fn(request);
    } catch (err) {
      if (err instanceof HttpError) return json({ error: err.message }, err.status);
      console.error(err);
      return json({ error: 'Something went wrong. Please try again.' }, 500);
    }
  };
}
