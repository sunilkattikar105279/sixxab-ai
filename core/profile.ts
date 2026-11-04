// Business profile: what every agent must know before it acts, collected at onboarding.
// Stored as one memory ("Business profile" + "Label: value" lines), newest wins.
import { newId, nowIso, type Store } from './store.js';
import type { Memory } from './types.js';

export interface BusinessProfile {
  name?: string;
  industry?: string;
  businessStage?: string;
  location?: string;
  founded?: string;
  team?: string;
  offer?: string;
  pricing?: string;
  customers?: string;
  sources?: string;
  markets?: string;
  currency?: string;
  revenueMonthly?: string;
  revenueGoal?: string;
  budget?: string;
  goals?: string;
  problem?: string;
  voice?: string;
  links?: string;
  whatsapp?: string;
  googleProfile?: string;
  instagram?: string;
  facebook?: string;
  linkedin?: string;
}
/** @deprecated use BusinessProfile */
export type CompanyProfile = BusinessProfile;

export type ProfileKey = keyof BusinessProfile;

export interface ProfileField {
  key: ProfileKey;
  label: string;
  kind: 'text' | 'long' | 'choice' | 'number';
  required?: boolean;
  options?: string[];
  hint?: string;
  /** Older labels this field was saved under. */
  aliases?: string[];
}

export const INDUSTRIES = [
  'Healthcare: hospital or clinic',
  'Healthcare: laboratory or diagnostics',
  'Professional services',
  'Home services',
  'Retail or e-commerce',
  'Real estate',
  'Technology or software',
  'Education or coaching',
  'Food and hospitality',
  'Other',
];

export const BUSINESS_STAGES = [
  'Idea, not launched yet',
  'Launched, no paying customers yet',
  'Paying customers',
  'Growing steadily',
];

export const PROFILE_SECTIONS: { title: string; fields: ProfileField[] }[] = [
  {
    title: 'Basics',
    fields: [
      { key: 'name', label: 'Business name', kind: 'text', required: true, aliases: ['Company name'] },
      { key: 'industry', label: 'Industry', kind: 'choice', options: INDUSTRIES },
      { key: 'businessStage', label: 'Where the business is today', kind: 'choice', options: BUSINESS_STAGES },
      { key: 'location', label: 'City and country', kind: 'text', hint: 'e.g. Tasgaon, Sangli, India' },
      { key: 'founded', label: 'Year started', kind: 'number' },
      { key: 'team', label: 'Team size', kind: 'text', hint: 'e.g. 1 founder, 2 staff' },
    ],
  },
  {
    title: 'Offer',
    fields: [
      { key: 'offer', label: 'What you sell', kind: 'long', required: true, aliases: ['What we sell'], hint: 'Your main products or services, in plain words' },
      { key: 'pricing', label: 'Prices', kind: 'text', hint: 'e.g. Consultation ₹500, packages from ₹5,000' },
    ],
  },
  {
    title: 'Customers',
    fields: [
      { key: 'customers', label: 'Who you sell to', kind: 'long', aliases: ['Who we sell to'], hint: 'Who buys, where they are, why they choose you' },
      { key: 'sources', label: 'Where customers come from today', kind: 'text', hint: 'e.g. referrals, Google search, walk-ins' },
      { key: 'markets', label: 'Markets', kind: 'text', aliases: ['Markets'], hint: 'Cities, regions or countries you serve' },
    ],
  },
  {
    title: 'Numbers',
    fields: [
      { key: 'currency', label: 'Currency', kind: 'choice', options: ['USD', 'INR'] },
      { key: 'revenueMonthly', label: 'Revenue last month', kind: 'number', hint: 'Whole amount, e.g. 250000' },
      { key: 'revenueGoal', label: 'Monthly revenue goal in 90 days', kind: 'number' },
      { key: 'budget', label: 'Monthly marketing budget', kind: 'text', aliases: ['Monthly marketing budget'] },
    ],
  },
  {
    title: 'Goals',
    fields: [
      { key: 'goals', label: 'Main goal for the next 90 days', kind: 'long', aliases: ['Goals for the next 90 days'] },
      { key: 'problem', label: 'Biggest thing holding you back', kind: 'long' },
    ],
  },
  {
    title: 'Brand and channels',
    fields: [
      { key: 'voice', label: 'Brand voice', kind: 'text', aliases: ['Brand voice'], hint: 'e.g. Warm, expert, simple English and Marathi' },
      { key: 'links', label: 'Website', kind: 'text', aliases: ['Website and social links'] },
      { key: 'whatsapp', label: 'WhatsApp Business number', kind: 'text' },
      { key: 'googleProfile', label: 'Google Business Profile link', kind: 'text' },
      { key: 'instagram', label: 'Instagram', kind: 'text' },
      { key: 'facebook', label: 'Facebook page', kind: 'text' },
      { key: 'linkedin', label: 'LinkedIn', kind: 'text' },
    ],
  },
];

export const PROFILE_FIELDS: ProfileField[] = PROFILE_SECTIONS.flatMap((s) => s.fields);

export const PROFILE_PREFIX = 'Business profile';
const LEGACY_PREFIX = 'Company profile';
const MAX_FIELD = 1000;

export function profileText(p: BusinessProfile): string {
  const lines = PROFILE_FIELDS.map(({ key, label }) => {
    const v = (p[key] ?? '').toString().replace(/\s+/g, ' ').trim().slice(0, MAX_FIELD);
    return v ? `${label}: ${v}` : null;
  }).filter(Boolean);
  return [PROFILE_PREFIX, ...lines].join('\n');
}

export function parseProfile(text: string): BusinessProfile {
  const out: BusinessProfile = {};
  for (const line of text.split('\n').slice(1)) {
    const i = line.indexOf(': ');
    if (i < 0) continue;
    const label = line.slice(0, i);
    const field = PROFILE_FIELDS.find((f) => f.label === label) ?? PROFILE_FIELDS.find((f) => f.aliases?.includes(label));
    if (field) out[field.key] = line.slice(i + 2);
  }
  return out;
}

/** Cleans onboarding input: text trimmed and capped, choices checked, the two essentials required. */
export function validateProfileInput(body: Record<string, unknown>): BusinessProfile {
  const out: BusinessProfile = {};
  for (const f of PROFILE_FIELDS) {
    const raw = body[f.key];
    if (raw === undefined || raw === null || raw === '') continue;
    if (typeof raw !== 'string' && typeof raw !== 'number') throw new Error(`${f.label} must be text`);
    const v = String(raw).trim().slice(0, MAX_FIELD);
    if (!v) continue;
    if (f.kind === 'choice' && !f.options!.includes(v)) throw new Error(`${f.label} (${f.key}) must be one of: ${f.options!.join(', ')}`);
    if (f.kind === 'number' && !/^\d[\d,]*(\.\d+)?$/.test(v)) throw new Error(`${f.label} must be a number`);
    out[f.key] = v;
  }
  for (const f of PROFILE_FIELDS.filter((x) => x.required)) if (!out[f.key]) throw new Error(`${f.label} is required`);
  return out;
}

export function profileCompleteness(p: BusinessProfile): { percent: number; missing: string[] } {
  const missing = PROFILE_FIELDS.filter((f) => !p[f.key]).map((f) => f.label);
  return { percent: Math.round((100 * (PROFILE_FIELDS.length - missing.length)) / PROFILE_FIELDS.length), missing };
}

export function isHealthcare(p: BusinessProfile | null): boolean {
  return Boolean(p?.industry?.startsWith('Healthcare'));
}

export async function saveBusinessProfile(store: Store, orgId: string, p: BusinessProfile, by: string): Promise<BusinessProfile> {
  const text = profileText(p);
  await store.remember({ id: newId(), orgId, kind: 'fact', text, agentId: null, at: nowIso() });
  await store.audit({ id: newId(), orgId, at: nowIso(), actor: by, action: 'profile.updated', taskId: null, detail: { summary: 'Business profile updated' } });
  return parseProfile(text);
}

async function latestProfileMemory(store: Store, orgId: string): Promise<Memory | null> {
  const [now, old] = await Promise.all([store.latestMemoryWithPrefix(orgId, PROFILE_PREFIX), store.latestMemoryWithPrefix(orgId, LEGACY_PREFIX)]);
  if (now && old) return now.at >= old.at ? now : old;
  return now ?? old;
}

export async function loadBusinessProfile(store: Store, orgId: string): Promise<BusinessProfile | null> {
  const m = await latestProfileMemory(store, orgId);
  return m ? parseProfile(m.text) : null;
}

const HEALTHCARE_RULE = `This is a healthcare business. Work with business data only: marketing, reviews, general enquiries, revenue and operations. Never ask for, store or repeat patient names, symptoms, diagnoses, test results or reports. Give no medical advice; send anything medical to the clinic's staff. Posts are educational and informational, never promotional claims about outcomes.`;

/** The profile as a prompt block, or a nudge to ask the owner when there is none. */
export async function profileForPrompt(store: Store, orgId: string): Promise<string> {
  const m = await latestProfileMemory(store, orgId);
  if (!m) return '\n\nThe owner has not filled in the business profile yet. Make reasonable assumptions, state them briefly, and list the facts you need in your summary.';
  const p = parseProfile(m.text);
  const body = profileText(p).split('\n').slice(1).join('\n');
  return `\n\nAbout the business (from the owner):\n${body}${isHealthcare(p) ? `\n\n${HEALTHCARE_RULE}` : ''}`;
}

/** @deprecated use saveBusinessProfile */
export const saveCompanyProfile = saveBusinessProfile;
/** @deprecated use loadBusinessProfile */
export const loadCompanyProfile = loadBusinessProfile;
