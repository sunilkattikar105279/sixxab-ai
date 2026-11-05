// Live platform checks shared by /api/health (public, no secrets) and /api/governance (admin).
import { normalizeSupabaseUrl } from './context.js';

const TIMEOUT_MS = 5000;

async function probe(url: string, headers: Record<string, string>): Promise<{ ok: boolean; body: unknown }> {
  try {
    const res = await fetch(url, { headers, signal: AbortSignal.timeout(TIMEOUT_MS) });
    const text = await res.text();
    try {
      return { ok: res.ok, body: JSON.parse(text) };
    } catch {
      return { ok: res.ok, body: null };
    }
  } catch {
    return { ok: false, body: null };
  }
}

const has = (k: string) => Boolean(process.env[k]?.trim());

export async function liveChecks() {
  const url = normalizeSupabaseUrl(process.env.SUPABASE_URL);
  const anon = process.env.SUPABASE_ANON_KEY?.trim();
  const service = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  let auth: { reachable: boolean; email: boolean; phone: boolean } | null = null;
  let tables: boolean | null = null;
  if (url && anon) {
    const s = await probe(`${url}/auth/v1/settings`, { apikey: anon });
    const ext = (s.body as { external?: Record<string, boolean> } | null)?.external ?? {};
    auth = { reachable: s.ok, email: Boolean(ext.email), phone: Boolean(ext.phone) };
  }
  if (url && service) {
    const headers: Record<string, string> = { apikey: service };
    if (service.startsWith('eyJ')) headers.authorization = `Bearer ${service}`;
    tables = (await probe(`${url}/rest/v1/orgs?select=id&limit=1`, headers)).ok;
  }
  return {
    database: Boolean(url && service),
    signIn: Boolean(url && anon),
    model: has('ANTHROPIC_API_KEY'),
    automations: has('N8N_WEBHOOK_URL'),
    apollo: has('APOLLO_API_KEY'),
    supabaseUrlValid: Boolean(url),
    auth,
    tables,
    webhookSecret: has('N8N_WEBHOOK_SECRET'),
    cron: has('CRON_SECRET'),
    admins: (process.env.ADMIN_EMAILS ?? '').split(',').map((e) => e.trim()).filter(Boolean).length,
  };
}
