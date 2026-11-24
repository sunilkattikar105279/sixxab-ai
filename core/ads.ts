// Paid ads plan from the Ads Manager agent: which campaigns to run, on which platform, for whom, with which approved ads and
// how much a day, kept inside the business's monthly ad budget. Nothing is launched or paid here: the owner sets each
// campaign up in the platform's own ads tool with the tracked lead form link, so its leads land in the CRM marked as paid.
import { newId, nowIso, type Store } from './store.js';
import type { Creative } from './creatives.js';

export const ADS_EVENT = 'ads.plan';
export const AD_PLATFORMS: Record<string, { label: string; source: string; tool: string }> = {
  meta: { label: 'Facebook and Instagram', source: 'meta', tool: 'Meta Ads Manager' },
  google: { label: 'Google Search and Maps', source: 'google', tool: 'Google Ads' },
  tiktok: { label: 'TikTok', source: 'tiktok', tool: 'TikTok Ads Manager' },
  youtube: { label: 'YouTube', source: 'youtube', tool: 'Google Ads' },
  linkedin: { label: 'LinkedIn', source: 'linkedin', tool: 'LinkedIn Campaign Manager' },
};
export const AD_PLATFORM_IDS = Object.keys(AD_PLATFORMS);
export const AD_OBJECTIVES = ['leads', 'calls', 'messages', 'traffic'] as const;

export interface Campaign { platform: string; objective: string; audience: string; dailyBudget: number; days: number; creativeIds: string[]; why: string; total: number }
export interface AdsPlan { summary: string; campaigns: Campaign[]; total: number; budget: number; at: string; by: string }

const text = (v: unknown, max: number) => String(v ?? '').trim().slice(0, max);

/** Checks a plan against the approved ads and the monthly budget. Throws in plain words when it doesn't fit. */
export function cleanAdsPlan(raw: unknown, approved: Creative[], budget: number): Omit<AdsPlan, 'at' | 'by'> {
  if (!(budget > 0)) throw new Error('Add a monthly ad budget to the marketing assessment before planning paid ads');
  const i = (raw ?? {}) as Record<string, unknown>;
  const list = Array.isArray(i.campaigns) ? i.campaigns.slice(0, 4) : [];
  if (!list.length) throw new Error('A plan needs at least one campaign');
  const ok = new Set(approved.map((c) => c.id));
  const campaigns = list.map((c: Record<string, unknown>) => {
    const platform = text(c.platform, 20).toLowerCase();
    if (!AD_PLATFORMS[platform]) throw new Error(`platform must be one of: ${AD_PLATFORM_IDS.join(', ')}`);
    const objective = (AD_OBJECTIVES as readonly string[]).includes(String(c.objective)) ? String(c.objective) : 'leads';
    const dailyBudget = Math.round(Number(c.dailyBudget) * 100) / 100;
    const days = Math.round(Number(c.days));
    if (!(dailyBudget > 0)) throw new Error('Each campaign needs a daily budget above zero');
    if (!(days >= 3 && days <= 31)) throw new Error('Each campaign runs 3 to 31 days');
    const creativeIds = (Array.isArray(c.creativeIds) ? c.creativeIds : []).map(String).filter((id) => ok.has(id)).slice(0, 4);
    if (platform !== 'google' && !creativeIds.length) throw new Error(`The ${AD_PLATFORMS[platform].label} campaign needs at least one approved ad`);
    return { platform, objective, audience: text(c.audience, 300), dailyBudget, days, creativeIds, why: text(c.why, 300), total: Math.round(dailyBudget * days * 100) / 100 };
  });
  const total = Math.round(campaigns.reduce((s, c) => s + c.total, 0) * 100) / 100;
  if (total > budget) throw new Error(`The campaigns add up to ${total}; the monthly ad budget is ${budget}. Trim the daily budgets or the days.`);
  return { summary: text(i.summary, 600), campaigns, total, budget };
}

export async function saveAdsPlan(store: Store, orgId: string, raw: unknown, approved: Creative[], budget: number, by: string): Promise<string> {
  const plan = cleanAdsPlan(raw, approved, budget);
  await store.audit({ id: newId(), orgId, at: nowIso(), actor: by, action: ADS_EVENT, taskId: null, detail: { plan, summary: `Paid ads plan saved: ${plan.campaigns.length} campaign${plan.campaigns.length === 1 ? '' : 's'}, ${plan.total} of ${plan.budget} a month. Nothing launched or paid` } });
  return `Saved the paid ads plan: ${plan.campaigns.length} campaign(s), ${plan.total} of the ${plan.budget} monthly budget. Nothing is launched; the owner sets each campaign up.`;
}

export async function loadAdsPlan(store: Store, orgId: string): Promise<AdsPlan | null> {
  const last = (await store.listAuditByActions(orgId, [ADS_EVENT])).at(-1);
  return last ? { ...(last.detail.plan as Omit<AdsPlan, 'at' | 'by'>), at: last.at, by: last.actor } : null;
}

/** The goal for the Ads Manager agent. */
export function adsGoal(o: {
  business: string; offer: string; bestCustomer: string; area: string; currency: string; budget: number; ceiling: number | null;
  leadsTarget: number | null; channels: string[]; approved: Creative[];
}): string {
  if (!(o.budget > 0)) return '';
  if (!o.approved.length) return '';
  const ads = o.approved.slice(0, 12).map((c) => `- ${c.id}: ${c.kind} ${c.format}, "${c.headline || c.brief.slice(0, 60)}"`).join('\n');
  return [
    `Plan this month's paid ads for ${o.business || 'this business'} and save the plan with save_ads_plan.`,
    `What they sell: ${o.offer || 'not given'}. Best customer: ${o.bestCustomer || 'not given'}. Where: ${o.area || 'not given'}.`,
    `Monthly ad budget: ${o.budget} ${o.currency}. The plan's total must not go over it. Most a lead can cost and still pay: ${o.ceiling ?? 'unknown'} ${o.currency}.${o.leadsTarget ? ` Leads wanted a month: ${o.leadsTarget}.` : ''}`,
    `Channels in their marketing plan: ${o.channels.join(', ') || 'none yet'}.`,
    `Approved ads you may use (by id):\n${ads}`,
    'Use one to three campaigns: put most of the budget where their customers already look, give each campaign enough per day to learn (at least a few leads a week at the ceiling), and say in one line why. Prefer the leads objective; use calls for businesses people phone. Name the audience by place, age range and interests in plain words. Never promise results. You only plan: nothing is launched or paid.',
  ].join('\n');
}
