// GET /api/health → which services are configured and reachable (no secrets returned).
import { handle, json, normalizeSupabaseUrl } from '../context.js';

const TIMEOUT_MS = 5000;

async function probe(url: string, headers: Record<string, string>): Promise<{ ok: boolean; status: number; body: unknown }> {
  try {
    const res = await fetch(url, { headers, signal: AbortSignal.timeout(TIMEOUT_MS) });
    const text = await res.text();
    let body: unknown = null;
    try {
      body = JSON.parse(text);
    } catch {
      body = null;
    }
    return { ok: res.ok, status: res.status, body };
  } catch {
    return { ok: false, status: 0, body: null };
  }
}

export const GET = handle(async () => {
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

  return json({
    ok: true,
    database: Boolean(url && service),
    signIn: Boolean(url && anon),
    model: Boolean(process.env.ANTHROPIC_API_KEY),
    automations: Boolean(process.env.N8N_WEBHOOK_URL),
    supabaseUrlValid: Boolean(url),
    auth,
    tables,
  });
});
