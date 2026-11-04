// GET /api/health → which services are configured and reachable (no secrets returned).
import { handle, json } from '../context.js';
import { liveChecks } from '../checks.js';

export const GET = handle(async () => {
  const c = await liveChecks();
  return json({
    ok: true,
    database: c.database,
    signIn: c.signIn,
    model: c.model,
    automations: c.automations,
    supabaseUrlValid: c.supabaseUrlValid,
    auth: c.auth,
    tables: c.tables,
  });
});
