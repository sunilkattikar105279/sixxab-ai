// AI Marketing Agency, phase 3: publishing approved ads to social media through one publishing service, Ayrshare or
// Postiz (self-hosted or cloud), whichever has its key set. The Social Publisher agent (or the owner) drafts posts from
// approved ads; nothing leaves until the owner presses Publish on a draft, which is their yes for that one post.
// The SIXXAB admin links each business to its social accounts in the service (an Ayrshare profile, or Postiz channels).
// Everything is an append-only audit event; keys stay in env (AYRSHARE_API_KEY, or POSTIZ_API_KEY with POSTIZ_URL).
import { newId, nowIso, type Store } from './store.js';
import { loadCreatives, type Creative } from './creatives.js';

export type Network = 'instagram' | 'facebook' | 'tiktok' | 'linkedin' | 'x' | 'youtube' | 'threads' | 'google';
export type PublishProvider = 'ayrshare' | 'postiz';

interface NetworkInfo { label: string; maxChars: number; image: boolean; video: boolean; ayrshare: string | null; postiz: string[] }
export const NETWORKS: Record<Network, NetworkInfo> = {
  instagram: { label: 'Instagram', maxChars: 2200, image: true, video: true, ayrshare: 'instagram', postiz: ['instagram', 'instagram-standalone'] },
  facebook: { label: 'Facebook Page', maxChars: 5000, image: true, video: true, ayrshare: 'facebook', postiz: ['facebook'] },
  tiktok: { label: 'TikTok', maxChars: 2200, image: false, video: true, ayrshare: 'tiktok', postiz: ['tiktok'] },
  linkedin: { label: 'LinkedIn', maxChars: 3000, image: true, video: true, ayrshare: 'linkedin', postiz: ['linkedin', 'linkedin-page'] },
  // Ayrshare needs the business's own X developer keys for X since March 2026, so X goes through Postiz only.
  x: { label: 'X', maxChars: 280, image: true, video: true, ayrshare: null, postiz: ['x'] },
  youtube: { label: 'YouTube Shorts', maxChars: 5000, image: false, video: true, ayrshare: 'youtube', postiz: ['youtube'] },
  threads: { label: 'Threads', maxChars: 500, image: true, video: true, ayrshare: 'threads', postiz: ['threads'] },
  google: { label: 'Google Business Profile', maxChars: 1500, image: true, video: false, ayrshare: 'gmb', postiz: ['gmb'] },
};
export const NETWORK_IDS = Object.keys(NETWORKS) as Network[];

export interface PublishEnv { AYRSHARE_API_KEY?: string; POSTIZ_API_KEY?: string; POSTIZ_URL?: string }
export interface PublishSetup { provider: PublishProvider | null; connected: boolean; note: string }

const POSTIZ_CLOUD = 'https://api.postiz.com/public/v1';

/** The Postiz API base: the cloud by default, or a self-hosted https address ending in /public/v1. */
export function postizBase(env: PublishEnv): string | null {
  const raw = env.POSTIZ_URL?.trim().replace(/\/+$/, '') || POSTIZ_CLOUD;
  try {
    const u = new URL(raw);
    if (u.protocol !== 'https:' || u.username || u.password || u.search || u.hash || !/\/public\/v1$/.test(u.pathname)) return null;
    return `${u.origin}${u.pathname}`;
  } catch { return null; }
}

/** Which publishing service is connected. Ayrshare wins when both keys are set. */
export function publishSetup(env: PublishEnv): PublishSetup {
  if (env.AYRSHARE_API_KEY?.trim()) return { provider: 'ayrshare', connected: true, note: 'Publishing through Ayrshare.' };
  if (env.POSTIZ_API_KEY?.trim()) {
    return postizBase(env)
      ? { provider: 'postiz', connected: true, note: 'Publishing through Postiz.' }
      : { provider: 'postiz', connected: false, note: 'POSTIZ_URL must be an https address ending in /public/v1.' };
  }
  return { provider: null, connected: false, note: 'Publishing is not connected yet: it needs Ayrshare or Postiz.' };
}

// ── Each business's link to its social accounts in the service (set by the admin) ──────────────────────────

export interface PostizChannel { id: string; identifier: string; name: string }
export type PublishLink =
  | { provider: 'ayrshare'; profileKey: string; networks: Network[] }
  | { provider: 'postiz'; channels: Partial<Record<Network, PostizChannel>> };
/** What the browser may see of a link: never the Ayrshare profile key. (The key only works with SIXXAB's own API key.) */
export interface PublicLink { provider: PublishProvider; networks: Network[]; channels: Partial<Record<Network, string>> }

export const LINK_EVENT = 'publishing.link';

export function publicLink(link: PublishLink | null): PublicLink | null {
  if (!link) return null;
  if (link.provider === 'ayrshare') return { provider: 'ayrshare', networks: link.networks, channels: {} };
  const networks = NETWORK_IDS.filter((n) => link.channels[n]);
  return { provider: 'postiz', networks, channels: Object.fromEntries(networks.map((n) => [n, link.channels[n]!.name])) };
}

function cleanLink(raw: unknown): PublishLink | null {
  if (raw === null) return null;
  const r = (raw ?? {}) as Record<string, unknown>;
  if (r.provider === 'ayrshare') {
    const profileKey = String(r.profileKey ?? '').trim();
    if (!/^[A-Za-z0-9-]{8,80}$/.test(profileKey)) throw new Error('Paste the Ayrshare profile key for this business');
    const networks = (Array.isArray(r.networks) ? r.networks : []).filter((n): n is Network => NETWORK_IDS.includes(n as Network) && NETWORKS[n as Network].ayrshare !== null);
    if (!networks.length) throw new Error('Tick the networks linked in that Ayrshare profile');
    return { provider: 'ayrshare', profileKey, networks: [...new Set(networks)] };
  }
  if (r.provider === 'postiz') {
    const channels: Partial<Record<Network, PostizChannel>> = {};
    for (const [net, c] of Object.entries((r.channels ?? {}) as Record<string, Record<string, unknown> | null>)) {
      if (!NETWORK_IDS.includes(net as Network) || !c) continue;
      const id = String(c.id ?? '').trim(); const identifier = String(c.identifier ?? '').trim();
      if (!/^[A-Za-z0-9_-]{4,80}$/.test(id) || !NETWORKS[net as Network].postiz.includes(identifier)) throw new Error(`That ${NETWORKS[net as Network].label} channel doesn't match`);
      channels[net as Network] = { id, identifier, name: String(c.name ?? '').slice(0, 80) };
    }
    if (!Object.keys(channels).length) throw new Error('Pick at least one Postiz channel');
    return { provider: 'postiz', channels };
  }
  throw new Error('Pick Ayrshare or Postiz');
}

export async function setPublishLink(store: Store, orgId: string, raw: unknown, by: string): Promise<void> {
  const link = cleanLink(raw);
  const p = publicLink(link);
  await store.audit({ id: newId(), orgId, at: nowIso(), actor: by, action: LINK_EVENT, taskId: null, detail: { link, summary: p ? `Social accounts linked through ${p.provider === 'ayrshare' ? 'Ayrshare' : 'Postiz'}: ${p.networks.map((n) => NETWORKS[n].label).join(', ')}` : 'Social accounts unlinked' } });
}

export async function loadPublishLink(store: Store, orgId: string): Promise<PublishLink | null> {
  const last = (await store.listAuditByActions(orgId, [LINK_EVENT])).at(-1);
  return (last?.detail.link as PublishLink | null | undefined) ?? null;
}

/** The networks a business can post to now: linked, and supported by the connected service. */
export function linkedNetworks(link: PublishLink | null, setup: PublishSetup): Network[] {
  if (!link || !setup.connected || link.provider !== setup.provider) return [];
  return publicLink(link)!.networks;
}

// ── Posts ───────────────────────────────────────────────────────────────────────────────────────────────

export type PostStatus = 'draft' | 'sent' | 'failed' | 'discarded';
export interface SocialPost {
  id: string; creativeId: string; network: Network; text: string; kind: Creative['kind']; mediaUrl: string; headline: string;
  status: PostStatus; draftedBy: string; draftedAt: string;
  sentBy: string; sentAt: string | null; scheduledFor: string | null; provider: PublishProvider | null; providerId: string; postUrl: string; error: string; attempts: number;
}
export interface PublishingState { posts: SocialPost[]; drafts: number; sent: number; failed: number }
export const POST_EVENTS = ['post.drafted', 'post.discarded', 'post.sent', 'post.failed'];

export function computePublishing(events: { action: string; at: string; actor: string; detail: Record<string, unknown> }[]): PublishingState {
  const map = new Map<string, SocialPost>();
  for (const e of events) {
    const d = e.detail; const id = String(d.id ?? '');
    if (e.action === 'post.drafted') {
      map.set(id, {
        id, creativeId: String(d.creativeId ?? ''), network: d.network as Network, text: String(d.text ?? ''), kind: d.kind as Creative['kind'], mediaUrl: String(d.mediaUrl ?? ''), headline: String(d.headline ?? ''),
        status: 'draft', draftedBy: e.actor, draftedAt: e.at, sentBy: '', sentAt: null, scheduledFor: null, provider: null, providerId: '', postUrl: '', error: '', attempts: 0,
      });
      continue;
    }
    const p = map.get(id);
    if (!p) continue;
    if (e.action === 'post.discarded') p.status = 'discarded';
    if (e.action === 'post.sent') Object.assign(p, { status: 'sent', sentBy: e.actor, sentAt: e.at, scheduledFor: (d.scheduledFor as string | null) ?? null, provider: d.provider as PublishProvider, providerId: String(d.providerId ?? ''), postUrl: String(d.postUrl ?? ''), error: '' });
    if (e.action === 'post.failed') Object.assign(p, { status: 'failed', error: String(d.reason ?? ''), attempts: p.attempts + 1 });
  }
  const posts = [...map.values()].filter((p) => p.status !== 'discarded').reverse();
  return { posts, drafts: posts.filter((p) => p.status === 'draft').length, sent: posts.filter((p) => p.status === 'sent').length, failed: posts.filter((p) => p.status === 'failed').length };
}

export async function loadPublishing(store: Store, orgId: string): Promise<PublishingState> {
  return computePublishing(await store.listAuditByActions(orgId, POST_EVENTS));
}

/** Whether an ad's media fits a network (TikTok and YouTube take video; Google takes images). */
export const fits = (network: Network, kind: Creative['kind']): boolean => (kind === 'video' ? NETWORKS[network].video : NETWORKS[network].image);

/** Drafts one post per network from an approved ad. Sends nothing. */
export async function draftPosts(store: Store, orgId: string, input: { creativeId?: unknown; networks?: unknown; text?: unknown }, by: string): Promise<string[]> {
  const creative = (await loadCreatives(store, orgId, null)).creatives.find((c) => c.id === input.creativeId);
  if (!creative) throw new Error('Pick an ad from the ad studio');
  if (creative.status !== 'approved') throw new Error('Approve the ad in the ad studio before drafting posts');
  const networks = [...new Set((Array.isArray(input.networks) ? input.networks : [input.networks]).filter((n): n is Network => NETWORK_IDS.includes(n as Network)))];
  if (!networks.length) throw new Error('Pick at least one network');
  const text = typeof input.text === 'string' ? input.text.trim() : '';
  if (!text) throw new Error('Write the caption');
  for (const n of networks) {
    if (!fits(n, creative.kind)) throw new Error(`${NETWORKS[n].label} doesn't take ${creative.kind === 'video' ? 'videos' : 'images'} here`);
    if (text.length > NETWORKS[n].maxChars) throw new Error(`The caption is ${text.length} characters; ${NETWORKS[n].label} allows ${NETWORKS[n].maxChars}`);
  }
  const ids: string[] = [];
  for (const network of networks) {
    const id = newId();
    ids.push(id);
    await store.audit({ id: newId(), orgId, at: nowIso(), actor: by, action: 'post.drafted', taskId: null, detail: { id, creativeId: creative.id, network, text, kind: creative.kind, mediaUrl: creative.mediaUrl, headline: creative.headline, summary: `Drafted a ${NETWORKS[network].label} post for the ad "${creative.headline || creative.brief.slice(0, 40)}"; waiting for the owner's yes` } });
  }
  return ids;
}

export async function discardPost(store: Store, orgId: string, id: string, by: string): Promise<void> {
  const p = (await loadPublishing(store, orgId)).posts.find((x) => x.id === id);
  if (!p || p.status === 'sent') throw new Error('Only a draft can be discarded');
  await store.audit({ id: newId(), orgId, at: nowIso(), actor: by, action: 'post.discarded', taskId: null, detail: { id, summary: `Discarded the ${NETWORKS[p.network].label} draft` } });
}

/** A publish time: undefined or past means now; otherwise between 10 minutes and 90 days ahead. Ayrshare's format has no milliseconds. */
export function scheduleTime(raw: unknown, now = new Date()): string | null {
  if (raw === undefined || raw === null || raw === '' || raw === 'now') return null;
  const t = new Date(String(raw));
  if (Number.isNaN(t.getTime())) throw new Error('Pick a valid time');
  const ms = t.getTime() - now.getTime();
  if (ms < 10 * 60_000) throw new Error('Pick a time at least 10 minutes from now, or post now');
  if (ms > 90 * 86_400_000) throw new Error('Pick a time within 90 days');
  return t.toISOString().replace(/\.\d{3}Z$/, 'Z');
}

interface SendResult { providerId: string; postUrl: string; scheduledFor: string | null }

async function readJsonSafe(res: Response): Promise<Record<string, unknown>> {
  try { return (await res.json()) as Record<string, unknown>; } catch { return {}; }
}

async function sendAyrshare(env: PublishEnv, link: Extract<PublishLink, { provider: 'ayrshare' }>, p: SocialPost, when: string | null, fetchImpl: typeof fetch): Promise<SendResult> {
  const body: Record<string, unknown> = { post: p.text, platforms: [NETWORKS[p.network].ayrshare], mediaUrls: [p.mediaUrl], isVideo: p.kind === 'video', idempotencyKey: p.attempts ? `${p.id}-${p.attempts}` : p.id };
  if (when) body.scheduleDate = when;
  if (p.network === 'youtube') body.youTubeOptions = { title: (p.headline || p.text).slice(0, 100) };
  const res = await fetchImpl('https://api.ayrshare.com/api/post', {
    method: 'POST', signal: AbortSignal.timeout(25_000),
    headers: { 'content-type': 'application/json', authorization: `Bearer ${env.AYRSHARE_API_KEY!.trim()}`, 'profile-key': link.profileKey },
    body: JSON.stringify(body),
  });
  const r = await readJsonSafe(res);
  const entry = (Array.isArray(r.posts) ? r.posts[0] : r) as Record<string, unknown> | undefined;
  const errors = (entry?.errors ?? r.errors) as { message?: string }[] | undefined;
  const status = String(entry?.status ?? r.status ?? '');
  if (!res.ok || status === 'error') throw new Error(`Ayrshare: ${errors?.[0]?.message ?? `error ${res.status}`}`);
  const first = ((entry?.postIds ?? []) as { postUrl?: string }[])[0];
  return { providerId: String(entry?.id ?? r.id ?? ''), postUrl: typeof first?.postUrl === 'string' && first.postUrl.startsWith('https://') ? first.postUrl : '', scheduledFor: when };
}

/** Postiz provider settings for each network, with the required fields filled safely (public, comments on, no AI-made flag). */
export function postizSettings(network: Network, identifier: string, p: Pick<SocialPost, 'headline' | 'text'>): Record<string, unknown> {
  const title = (p.headline || p.text).slice(0, 100).padEnd(2, '.');
  switch (network) {
    case 'x': return { __type: 'x', who_can_reply_post: 'everyone' };
    case 'instagram': return { __type: identifier, post_type: 'post' };
    case 'linkedin': return { __type: identifier };
    case 'youtube': return { __type: 'youtube', title, type: 'public' };
    case 'tiktok': return { __type: 'tiktok', privacy_level: 'PUBLIC_TO_EVERYONE', duet: false, stitch: false, comment: true, autoAddMusic: 'no', brand_content_toggle: false, brand_organic_toggle: false, content_posting_method: 'DIRECT_POST', title: (p.headline || p.text).slice(0, 90) };
    default: return { __type: identifier };
  }
}

async function sendPostiz(env: PublishEnv, link: Extract<PublishLink, { provider: 'postiz' }>, p: SocialPost, when: string | null, fetchImpl: typeof fetch, now: Date): Promise<SendResult> {
  const base = postizBase(env)!;
  const channel = link.channels[p.network]!;
  const headers = { 'content-type': 'application/json', authorization: env.POSTIZ_API_KEY!.trim() };
  const up = await fetchImpl(`${base}/upload-from-url`, { method: 'POST', headers, body: JSON.stringify({ url: p.mediaUrl }), signal: AbortSignal.timeout(25_000) });
  const media = await readJsonSafe(up);
  if (!up.ok || typeof media.id !== 'string' || typeof media.path !== 'string') throw new Error(`Postiz could not take the ad's media (${up.status}${media.message ? `: ${String(media.message)}` : ''})`);
  const res = await fetchImpl(`${base}/posts`, {
    method: 'POST', headers, signal: AbortSignal.timeout(25_000),
    body: JSON.stringify({
      type: when ? 'schedule' : 'now', date: when ?? now.toISOString(), shortLink: false, tags: [],
      posts: [{ integration: { id: channel.id }, value: [{ content: p.text, image: [{ id: media.id, path: media.path }] }], settings: postizSettings(p.network, channel.identifier, p) }],
    }),
  });
  const r = (await res.json().catch(() => null)) as { postId?: string }[] | { message?: string } | null;
  if (!res.ok || !Array.isArray(r) || !r[0]?.postId) throw new Error(`Postiz: ${(!Array.isArray(r) && r?.message) || `error ${res.status}`}`);
  return { providerId: String(r[0].postId), postUrl: '', scheduledFor: when };
}

/**
 * Publishes one draft: the owner's press of Publish is their yes for this post. Checks the ad is still approved and the
 * network is linked on the connected service, then sends it now or scheduled. Failures are recorded and can be retried.
 */
export async function publishDraft(store: Store, orgId: string, id: string, rawWhen: unknown, env: PublishEnv, by: string, fetchImpl: typeof fetch = fetch, now = new Date()): Promise<SocialPost> {
  const setup = publishSetup(env);
  if (!setup.connected) throw new Error("Publishing isn't connected yet");
  const link = await loadPublishLink(store, orgId);
  const p = (await loadPublishing(store, orgId)).posts.find((x) => x.id === id);
  if (!p || (p.status !== 'draft' && p.status !== 'failed')) throw new Error('This post is not a draft');
  if (!linkedNetworks(link, setup).includes(p.network)) throw new Error(`${NETWORKS[p.network].label} isn't linked for this business yet`);
  const creative = (await loadCreatives(store, orgId, null)).creatives.find((c) => c.id === p.creativeId);
  if (creative?.status !== 'approved') throw new Error('The ad is no longer approved in the ad studio');
  const when = scheduleTime(rawWhen, now);
  try {
    const r = link!.provider === 'ayrshare' ? await sendAyrshare(env, link as Extract<PublishLink, { provider: 'ayrshare' }>, p, when, fetchImpl)
      : await sendPostiz(env, link as Extract<PublishLink, { provider: 'postiz' }>, p, when, fetchImpl, now);
    await store.audit({ id: newId(), orgId, at: nowIso(), actor: by, action: 'post.sent', taskId: null, detail: { id, provider: setup.provider, providerId: r.providerId, postUrl: r.postUrl, scheduledFor: r.scheduledFor, summary: `${r.scheduledFor ? 'Scheduled' : 'Published'} the ${NETWORKS[p.network].label} post for "${p.headline || 'an ad'}"${r.scheduledFor ? ` for ${r.scheduledFor}` : ''}` } });
  } catch (e) {
    const reason = (e instanceof Error ? e.message : 'The service did not take the post').slice(0, 300);
    await store.audit({ id: newId(), orgId, at: nowIso(), actor: by, action: 'post.failed', taskId: null, detail: { id, reason, summary: `The ${NETWORKS[p.network].label} post did not go out: ${reason.slice(0, 120)}` } });
    throw new Error(reason);
  }
  return (await loadPublishing(store, orgId)).posts.find((x) => x.id === id)!;
}

/** Postiz channels on the connected account, for the admin to link to businesses. */
export async function listPostizChannels(env: PublishEnv, fetchImpl: typeof fetch = fetch): Promise<{ id: string; name: string; identifier: string; profile: string; customer: string; disabled: boolean }[]> {
  const base = postizBase(env);
  if (!env.POSTIZ_API_KEY?.trim() || !base) throw new Error('Postiz is not connected');
  const res = await fetchImpl(`${base}/integrations`, { headers: { authorization: env.POSTIZ_API_KEY.trim() }, signal: AbortSignal.timeout(15_000) });
  if (!res.ok) throw new Error(`Postiz: error ${res.status}`);
  const rows = (await res.json()) as Record<string, unknown>[];
  return (Array.isArray(rows) ? rows : []).map((c) => ({
    id: String(c.id ?? ''), name: String(c.name ?? ''), identifier: String(c.identifier ?? ''), profile: String(c.profile ?? ''),
    customer: String((c.customer as { name?: string } | undefined)?.name ?? ''), disabled: Boolean(c.disabled),
  }));
}

/** The networks a marketing plan's channel names point to, for drafting before any account is linked. */
export function channelNetworks(channels: string[]): Network[] {
  const words: [RegExp, Network][] = [[/insta/i, 'instagram'], [/facebook|meta\b/i, 'facebook'], [/tiktok/i, 'tiktok'], [/linkedin/i, 'linkedin'], [/\bx\b|twitter/i, 'x'], [/youtube|shorts/i, 'youtube'], [/threads/i, 'threads'], [/google|gbp|maps/i, 'google']];
  return NETWORK_IDS.filter((n) => channels.some((c) => words.some(([re, net]) => net === n && re.test(c))));
}

/** The Social Publisher's task: draft posts for approved ads that have none yet, on the networks that fit. */
export function publishingGoal(o: { business: string; voice: string; avoid: string; creatives: Creative[]; posts: SocialPost[]; networks: Network[] }): string {
  const done = new Set(o.posts.map((p) => p.creativeId));
  const ads = o.creatives.filter((c) => c.status === 'approved' && !done.has(c.id)).slice(0, 5);
  if (!ads.length || !o.networks.length) return '';
  return [
    `Draft social posts for ${o.business || 'this business'} from these approved ads, and save each with draft_social_post. Networks: ${o.networks.map((n) => `${n} (${NETWORKS[n].label}, up to ${NETWORKS[n].maxChars} characters)`).join(', ')}.`,
    ...ads.map((c) => `- Ad ${c.id}: ${c.kind}, headline "${c.headline}", text "${c.primaryText}", button "${c.cta}".`),
    'For each ad, draft one post per network that fits its media (TikTok and YouTube take video only; Google takes images only). Write a caption native to each network: a hook in the first line, the offer from the ad text, the call to action, and two to four relevant hashtags on Instagram, TikTok and Threads only.',
    `Brand voice: ${o.voice || 'friendly and plain'}. Claims to avoid: ${o.avoid || 'none given'}. Never invent prices, discounts, guarantees or results.`,
    'You only draft. Nothing is posted in this task: the owner publishes each draft, now or at a time they pick.',
  ].join('\n');
}
