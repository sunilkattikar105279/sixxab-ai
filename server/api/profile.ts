// GET  /api/profile → the company profile every agent reads
// POST /api/profile { name, offer, customers, markets, voice, goals, budget, links } → save it
import { loadCompanyProfile, PROFILE_FIELDS, saveCompanyProfile, type CompanyProfile } from '../../core/profile.js';
import { handle, HttpError, json, readJson, requireUser } from '../context.js';

export const GET = handle(async (request) => {
  const { orgId, store } = await requireUser(request);
  return json({ profile: await loadCompanyProfile(store, orgId), fields: PROFILE_FIELDS });
});

export const POST = handle(async (request) => {
  const { orgId, label, store } = await requireUser(request);
  const body = await readJson<Record<string, unknown>>(request);
  const profile: CompanyProfile = {};
  for (const { key } of PROFILE_FIELDS) {
    const v = body[key];
    if (v === undefined || v === null || v === '') continue;
    if (typeof v !== 'string') throw new HttpError(400, `${key} must be text`);
    profile[key] = v.slice(0, 1000);
  }
  if (!profile.name || !profile.offer) throw new HttpError(400, 'Company name and what you sell are required');
  return json({ profile: await saveCompanyProfile(store, orgId, profile, label) });
});
