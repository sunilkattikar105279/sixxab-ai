// GET /api/health → which services are configured (no secrets returned).
import { handle, json } from '../context.js';

export const GET = handle(async () =>
  json({
    ok: true,
    database: Boolean(process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY),
    signIn: Boolean(process.env.SUPABASE_URL && process.env.SUPABASE_ANON_KEY),
    model: Boolean(process.env.ANTHROPIC_API_KEY),
    automations: Boolean(process.env.N8N_WEBHOOK_URL),
  }),
);
