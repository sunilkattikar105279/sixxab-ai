// GET /api/cron-briefing → Vercel Cron: build every company's morning briefing, then let the sales autopilot
// prepare up to 3 drafts for companies that switched it on (drafts only: nothing is sent), and run the weekly
// prospect search where it is on (prospects wait for the owner's tick). Protected by CRON_SECRET.
import { buildBriefing } from '../../core/briefing.js';
import { runAutofind, runAutopilot } from '../../core/autopilot.js';
import { loadCrm } from '../../core/crm.js';
import { AnthropicClient, modelsFromEnv } from '../../core/model.js';
import { depsFor, handle, HttpError, json, store } from '../context.js';

export const GET = handle(async (request) => {
  const secret = process.env.CRON_SECRET;
  if (!secret || request.headers.get('authorization') !== `Bearer ${secret}`) throw new HttpError(401, 'Unauthorized');
  const s = store();
  const key = process.env.ANTHROPIC_API_KEY;
  const model = key ? new AnthropicClient({ apiKey: key, models: modelsFromEnv(process.env) }) : undefined;
  const started = Date.now();
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
  let drafted = 0;
  if (key) {
    for (const orgId of orgs) {
      if (Date.now() - started > 150_000) break; // leave room inside the 300-second limit
      try {
        if (!(await loadCrm(s, orgId)).flowOrg.autopilot?.on) continue;
        drafted += (await runAutopilot(await depsFor(s, orgId, 'Sales autopilot'), orgId, 3)).ran.length;
      } catch (e) {
        console.error('autopilot failed', orgId, e);
      }
    }
  }
  let searched = 0;
  if (key) {
    for (const orgId of orgs) {
      if (Date.now() - started > 170_000) break; // one search takes up to about two minutes
      try {
        if (!(await loadCrm(s, orgId)).flowOrg.autofind?.on) continue;
        const r = await runAutofind(await depsFor(s, orgId, 'Weekly prospect search'), orgId);
        if (r.status === 'done') searched++;
      } catch (e) {
        console.error('weekly prospect search failed', orgId, e);
      }
    }
  }
  return json({ orgs: orgs.length, built: ok, autopilotDrafts: drafted, prospectSearches: searched });
});
