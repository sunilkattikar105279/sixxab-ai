// GET /api/cron-briefing → Vercel Cron: build every company's morning briefing. Protected by CRON_SECRET.
import { buildBriefing } from '../../core/briefing.js';
import { AnthropicClient, modelsFromEnv } from '../../core/model.js';
import { handle, HttpError, json, store } from '../context.js';

export const GET = handle(async (request) => {
  const secret = process.env.CRON_SECRET;
  if (!secret || request.headers.get('authorization') !== `Bearer ${secret}`) throw new HttpError(401, 'Unauthorized');
  const s = store();
  const key = process.env.ANTHROPIC_API_KEY;
  const model = key ? new AnthropicClient({ apiKey: key, models: modelsFromEnv(process.env) }) : undefined;
  const orgs = await s.listOrgIds();
  let ok = 0;
  for (const orgId of orgs) {
    try {
      await buildBriefing(s, orgId, new Date(), model);
      ok++;
    } catch (e) {
      console.error('briefing failed', orgId, e);
    }
  }
  return json({ orgs: orgs.length, built: ok });
});
