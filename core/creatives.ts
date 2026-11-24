// AI Marketing Agency, phase 2: the ad studio. The owner (or the Ad Creative Producer agent) queues a creative brief:
// a single image or a short video, its shape and the ad copy. A studio run, a Claude session working the owner's
// Viewmax connector, makes each queued creative and saves its link back here. The owner then approves or rejects it.
// Approving only marks it ready for publishing; nothing here posts, publishes or spends.
// Everything is an append-only audit event in the business's workspace.
import { newId, nowIso, type Store } from './store.js';
import { getMarketingPlan, type PlanId } from './marketing.js';

export type CreativeKind = 'image' | 'video';
export type CreativeStatus = 'queued' | 'made' | 'approved' | 'rejected' | 'failed';
export const CREATIVE_FORMATS = ['4:5', '1:1', '9:16', '16:9'] as const;
export type CreativeFormat = (typeof CREATIVE_FORMATS)[number];
export const CREATIVE_CTAS = ['Book now', 'Call now', 'Get a quote', 'Send a message', 'Learn more', 'Shop now'];
/** Where finished creatives may live. Viewmax serves its generations from this host. */
export const MEDIA_HOSTS = ['media.viewmax.io'];
/** Credits a creative costs on the studio's default models (Nano Banana 2 image; Kling 3.0 Turbo 8-second 720p video). */
export const CREDITS = { image: 2, video: 15 } as const;

export interface Creative {
  id: string; kind: CreativeKind; format: CreativeFormat; brief: string; headline: string; primaryText: string; cta: string;
  status: CreativeStatus; requestedBy: string; requestedAt: string;
  mediaUrl: string; model: string; credits: number; madeAt: string | null; failReason: string;
  decidedBy: string; decidedAt: string | null; note: string;
}
export interface Allowance { images: number; videos: number; usedImages: number; usedVideos: number; month: string; planName: string | null }
export interface CreativesState { creatives: Creative[]; allowance: Allowance; queued: number; awaiting: number; approved: number; adminWorkspace: boolean }

export const CREATIVE_EVENTS = ['creative.requested', 'creative.made', 'creative.failed', 'creative.decided', 'creative.admin'];

/** Marks the SIXXAB admin's own workspace once, so its agents can queue ads without a paid plan. Written only for an admin. */
export async function markAdminStudio(store: Store, orgId: string, state: CreativesState, by: string): Promise<void> {
  if (state.adminWorkspace) return;
  await store.audit({ id: newId(), orgId, at: nowIso(), actor: by, action: 'creative.admin', taskId: null, detail: { summary: 'Ad studio opened for the SIXXAB admin workspace' } });
}

const text = (v: unknown, max: number): string => (typeof v === 'string' ? v.trim().replace(/\s+\n/g, '\n').slice(0, max) : '');

/** A finished creative's link: https, on the studio's media host, with no login or query in it. */
export function mediaUrlOk(raw: unknown): string {
  const s = typeof raw === 'string' ? raw.trim() : '';
  try {
    const u = new URL(s);
    if (u.protocol !== 'https:' || !MEDIA_HOSTS.includes(u.hostname) || u.username || u.password || u.search || u.hash) return '';
    if (!/\.(jpe?g|png|webp|mp4|mov|webm)$/i.test(u.pathname)) return '';
    return u.toString();
  } catch { return ''; }
}

/** Rebuilds the creatives from their events (oldest first). */
export function computeCreatives(events: { action: string; at: string; actor: string; detail: Record<string, unknown> }[], planId: PlanId | null, now = new Date(), unlimited = false): CreativesState {
  const map = new Map<string, Creative>();
  const adminWorkspace = events.some((e) => e.action === 'creative.admin');
  unlimited = unlimited || adminWorkspace;
  for (const e of events) {
    const d = e.detail;
    const id = String(d.id ?? '');
    if (e.action === 'creative.requested') {
      map.set(id, {
        id, kind: d.kind as CreativeKind, format: d.format as CreativeFormat, brief: String(d.brief ?? ''), headline: String(d.headline ?? ''), primaryText: String(d.primaryText ?? ''), cta: String(d.cta ?? ''),
        status: 'queued', requestedBy: e.actor, requestedAt: e.at, mediaUrl: '', model: '', credits: 0, madeAt: null, failReason: '', decidedBy: '', decidedAt: null, note: '',
      });
      continue;
    }
    const c = map.get(id);
    if (!c) continue;
    if (e.action === 'creative.made') Object.assign(c, { status: 'made', mediaUrl: String(d.mediaUrl ?? ''), model: String(d.model ?? ''), credits: Number(d.credits) || 0, madeAt: e.at });
    if (e.action === 'creative.failed') Object.assign(c, { status: 'failed', failReason: String(d.reason ?? '') });
    if (e.action === 'creative.decided') Object.assign(c, { status: d.decision === 'approved' ? 'approved' : 'rejected', decidedBy: e.actor, decidedAt: e.at, note: String(d.note ?? '') });
  }
  const creatives = [...map.values()].reverse();
  const month = now.toISOString().slice(0, 7);
  const thisMonth = creatives.filter((c) => c.requestedAt.startsWith(month) && c.status !== 'failed');
  const plan = planId ? getMarketingPlan(planId) : undefined;
  const big = 9999;
  const allowance: Allowance = {
    images: unlimited ? big : plan?.images ?? 0, videos: unlimited ? big : plan?.videos ?? 0,
    usedImages: thisMonth.filter((c) => c.kind === 'image').length, usedVideos: thisMonth.filter((c) => c.kind === 'video').length,
    month, planName: unlimited ? 'SIXXAB admin' : plan?.name ?? null,
  };
  return {
    creatives, allowance, adminWorkspace,
    queued: creatives.filter((c) => c.status === 'queued').length,
    awaiting: creatives.filter((c) => c.status === 'made').length,
    approved: creatives.filter((c) => c.status === 'approved').length,
  };
}

export async function loadCreatives(store: Store, orgId: string, planId: PlanId | null, unlimited = false): Promise<CreativesState> {
  return computeCreatives(await store.listAuditByActions(orgId, CREATIVE_EVENTS), planId, new Date(), unlimited);
}

/** Queues one creative brief, within the plan's monthly images and videos. */
export async function requestCreative(store: Store, orgId: string, input: Record<string, unknown>, state: CreativesState, by: string): Promise<string> {
  const kind = input.kind === 'video' ? 'video' : input.kind === 'image' ? 'image' : null;
  if (!kind) throw new Error('Pick an image or a video');
  const format = (CREATIVE_FORMATS as readonly string[]).includes(String(input.format)) ? input.format as CreativeFormat : kind === 'video' ? '9:16' : '4:5';
  const brief = text(input.brief, 1200);
  if (brief.length < 10) throw new Error('Describe the ad in a sentence or two: who is in it, what happens and the mood');
  const headline = text(input.headline, 60);
  const primaryText = text(input.primaryText, 300);
  const cta = CREATIVE_CTAS.includes(String(input.cta)) ? String(input.cta) : 'Learn more';
  const a = state.allowance;
  if (!a.planName) throw new Error('Pick a marketing plan first; ads come out of its monthly images and videos');
  if (kind === 'image' && a.usedImages >= a.images) throw new Error(`This month's ${a.images} images are used. More come on the 1st, or move up a plan.`);
  if (kind === 'video' && a.usedVideos >= a.videos) throw new Error(`This month's ${a.videos} videos are used. More come on the 1st, or move up a plan.`);
  const id = newId();
  await store.audit({ id: newId(), orgId, at: nowIso(), actor: by, action: 'creative.requested', taskId: null, detail: { id, kind, format, brief, headline, primaryText, cta, summary: `Queued a ${kind === 'video' ? 'video' : 'image'} ad: ${headline || brief.slice(0, 60)}` } });
  return id;
}

/** Saves a finished creative from the studio. Only queued creatives, and only links on the studio's media host. */
export async function saveCreativeResult(store: Store, orgId: string, input: Record<string, unknown>, by: string): Promise<void> {
  const id = String(input.id ?? '');
  const c = (await loadCreatives(store, orgId, null)).creatives.find((x) => x.id === id);
  if (!c) throw new Error('No such creative');
  if (c.status !== 'queued') throw new Error('This creative is not waiting to be made');
  const mediaUrl = mediaUrlOk(input.mediaUrl);
  if (!mediaUrl) throw new Error(`The link must be https on ${MEDIA_HOSTS.join(' or ')}`);
  const credits = Math.max(0, Math.min(200, Math.round(Number(input.credits) || 0)));
  await store.audit({ id: newId(), orgId, at: nowIso(), actor: by, action: 'creative.made', taskId: null, detail: { id, mediaUrl, model: text(input.model, 80), credits, generationId: text(input.generationId, 80), summary: `Made the ${c.kind} ad "${c.headline || c.brief.slice(0, 40)}" (${credits} credits); waiting for the owner's yes` } });
}

export async function failCreative(store: Store, orgId: string, id: string, reason: string, by: string): Promise<void> {
  const c = (await loadCreatives(store, orgId, null)).creatives.find((x) => x.id === id);
  if (!c || c.status !== 'queued') throw new Error('This creative is not waiting to be made');
  await store.audit({ id: newId(), orgId, at: nowIso(), actor: by, action: 'creative.failed', taskId: null, detail: { id, reason: text(reason, 300), summary: `Could not make the ${c.kind} ad: ${text(reason, 120)}` } });
}

/** The owner's yes or no on a finished creative. Approving marks it ready to publish; it does not publish. */
export async function decideCreative(store: Store, orgId: string, id: string, decision: unknown, note: unknown, by: string): Promise<void> {
  if (decision !== 'approved' && decision !== 'rejected') throw new Error('Approve or reject');
  const c = (await loadCreatives(store, orgId, null)).creatives.find((x) => x.id === id);
  if (!c) throw new Error('No such creative');
  if (c.status !== 'made' && !(c.status === 'approved' && decision === 'rejected') && !(c.status === 'rejected' && decision === 'approved')) throw new Error('Only a finished creative can be approved or rejected');
  await store.audit({ id: newId(), orgId, at: nowIso(), actor: by, action: 'creative.decided', taskId: null, detail: { id, decision, note: text(note, 300), summary: `${decision === 'approved' ? 'Approved' : 'Rejected'} the ${c.kind} ad "${c.headline || c.brief.slice(0, 40)}"` } });
}

export interface StudioJob { orgId: string; business: string; id: string; kind: CreativeKind; format: CreativeFormat; brief: string; headline: string; cta: string; voice: string; avoid: string; requestedAt: string }

/** Everything queued across businesses, oldest first, for the studio run. */
export async function studioQueue(store: Store, orgIds: string[], about: (orgId: string) => Promise<{ business: string; voice: string; avoid: string }>): Promise<StudioJob[]> {
  const jobs: StudioJob[] = [];
  await Promise.all(orgIds.map(async (orgId) => {
    const queued = (await loadCreatives(store, orgId, null)).creatives.filter((c) => c.status === 'queued');
    if (!queued.length) return;
    const a = await about(orgId);
    for (const c of queued) jobs.push({ orgId, business: a.business, id: c.id, kind: c.kind, format: c.format, brief: c.brief, headline: c.headline, cta: c.cta, voice: a.voice, avoid: a.avoid, requestedAt: c.requestedAt });
  }));
  return jobs.sort((x, y) => x.requestedAt.localeCompare(y.requestedAt));
}

/** The Ad Creative Producer's task: turn the plan into a few briefs within what is left this month. */
export function creativesGoal(o: { business: string; offer: string; bestCustomer: string; voice: string; avoid: string; channels: string[]; weekFocus: string; allowance: Allowance }): string {
  const a = o.allowance;
  const images = Math.max(0, Math.min(3, a.images - a.usedImages));
  const videos = Math.max(0, Math.min(1, a.videos - a.usedVideos));
  if (!a.planName || images + videos === 0) return '';
  return [
    `Write ${images} image ad brief${images === 1 ? '' : 's'}${videos ? ' and 1 short video brief' : ''} for ${o.business || 'this business'}, and queue each with save_creative_brief.`,
    `Offer: ${o.offer || 'see the company profile'}. Best customer: ${o.bestCustomer || 'not given'}. Channels: ${o.channels.join(', ') || 'Instagram and Facebook'}. This week's focus: ${o.weekFocus || 'first creatives'}.`,
    `Brand voice: ${o.voice || 'friendly and plain'}. Claims to avoid: ${o.avoid || 'none given'}.`,
    'Each brief says who is in the picture, what happens, the setting, light and mood, with no real brand logos, and no text in a video. An image may carry the headline. Write a headline of up to 8 words, a primary text of one or two sentences and a call to action.',
    'Never invent prices, discounts, guarantees or results; write [OFFER] where one belongs. You only queue briefs: nothing is made, posted or spent in this task.',
  ].join('\n');
}
