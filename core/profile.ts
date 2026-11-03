// Company profile: what every agent must know before it acts. Stored as one memory, newest wins.
import { newId, nowIso, type Store } from './store.js';

export interface CompanyProfile {
  name?: string;
  offer?: string;
  customers?: string;
  markets?: string;
  voice?: string;
  goals?: string;
  budget?: string;
  links?: string;
}

export const PROFILE_PREFIX = 'Company profile';

export const PROFILE_FIELDS: { key: keyof CompanyProfile; label: string }[] = [
  { key: 'name', label: 'Company name' },
  { key: 'offer', label: 'What we sell' },
  { key: 'customers', label: 'Who we sell to' },
  { key: 'markets', label: 'Markets' },
  { key: 'voice', label: 'Brand voice' },
  { key: 'goals', label: 'Goals for the next 90 days' },
  { key: 'budget', label: 'Monthly marketing budget' },
  { key: 'links', label: 'Website and social links' },
];

const MAX_FIELD = 1000;

export function profileText(p: CompanyProfile): string {
  const lines = PROFILE_FIELDS.map(({ key, label }) => {
    const v = (p[key] ?? '').toString().replace(/\s+/g, ' ').trim().slice(0, MAX_FIELD);
    return v ? `${label}: ${v}` : null;
  }).filter(Boolean);
  return [PROFILE_PREFIX, ...lines].join('\n');
}

export function parseProfile(text: string): CompanyProfile {
  const out: CompanyProfile = {};
  for (const line of text.split('\n').slice(1)) {
    const i = line.indexOf(': ');
    if (i < 0) continue;
    const field = PROFILE_FIELDS.find((f) => f.label === line.slice(0, i));
    if (field) out[field.key] = line.slice(i + 2);
  }
  return out;
}

export async function saveCompanyProfile(store: Store, orgId: string, p: CompanyProfile, by: string): Promise<CompanyProfile> {
  const text = profileText(p);
  await store.remember({ id: newId(), orgId, kind: 'fact', text, agentId: null, at: nowIso() });
  await store.audit({ id: newId(), orgId, at: nowIso(), actor: by, action: 'profile.updated', taskId: null, detail: { summary: 'Company profile updated' } });
  return parseProfile(text);
}

export async function loadCompanyProfile(store: Store, orgId: string): Promise<CompanyProfile | null> {
  const m = await store.latestMemoryWithPrefix(orgId, PROFILE_PREFIX);
  return m ? parseProfile(m.text) : null;
}

/** The profile as a prompt block, or a nudge to ask the founder when there is none. */
export async function profileForPrompt(store: Store, orgId: string): Promise<string> {
  const m = await store.latestMemoryWithPrefix(orgId, PROFILE_PREFIX);
  if (m) return `\n\nAbout the company (from the founder):\n${m.text.split('\n').slice(1).join('\n')}`;
  return '\n\nThe founder has not filled in the company profile yet. Make reasonable assumptions, state them briefly, and list the facts you need in your summary.';
}
