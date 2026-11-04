// GET  /api/profile → the business profile every agent reads, its onboarding sections and what is missing
// POST /api/profile { name, industry, offer, … } → save it (choices and numbers checked)
import { loadBusinessProfile, PROFILE_FIELDS, PROFILE_SECTIONS, profileCompleteness, saveBusinessProfile, validateProfileInput } from '../../core/profile.js';
import { handle, HttpError, json, readJson, requireUser } from '../context.js';

export const GET = handle(async (request) => {
  const { orgId, store } = await requireUser(request);
  const profile = await loadBusinessProfile(store, orgId);
  return json({
    profile,
    sections: PROFILE_SECTIONS,
    fields: PROFILE_FIELDS,
    completeness: profile ? profileCompleteness(profile) : { percent: 0, missing: PROFILE_FIELDS.map((f) => f.label) },
  });
});

export const POST = handle(async (request) => {
  const { orgId, label, store } = await requireUser(request);
  const body = await readJson<Record<string, unknown>>(request);
  let input;
  try {
    input = validateProfileInput(body);
  } catch (e) {
    throw new HttpError(400, e instanceof Error ? e.message : 'Invalid profile');
  }
  const profile = await saveBusinessProfile(store, orgId, input, label);
  return json({ profile, completeness: profileCompleteness(profile) });
});
