// GET /api/briefing → today's morning briefing for the signed-in user's company.
import { buildBriefing } from '../../core/briefing.js';
import { AnthropicClient, modelsFromEnv } from '../../core/model.js';
import { handle, json, requireUser } from '../context.js';

export const GET = handle(async (request) => {
  const { orgId, store } = await requireUser(request);
  const key = process.env.ANTHROPIC_API_KEY;
  const model = key ? new AnthropicClient({ apiKey: key, models: modelsFromEnv(process.env) }) : undefined;
  return json({ briefing: await buildBriefing(store, orgId, new Date(), model) });
});
