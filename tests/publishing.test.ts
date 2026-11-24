// Social publishing: which service is connected, per-business links that never show the Ayrshare profile key, drafting
// rules, publish times, sending through Ayrshare and Postiz (with fetch mocked, so nothing leaves), the Social
// Publisher's tool and goal. Nothing is posted.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { MemoryStore } from '../core/store.js';
import { getAgent } from '../core/agents.js';
import { TOOLS } from '../core/tools.js';
import { decideCreative, loadCreatives, requestCreative, saveCreativeResult } from '../core/creatives.js';
import {
  channelNetworks, discardPost, draftPosts, fits, linkedNetworks, listPostizChannels, loadPublishing, loadPublishLink, postizBase, postizSettings,
  publicLink, publishDraft, publishingGoal, publishSetup, scheduleTime, setPublishLink,
} from '../core/publishing.js';

const ORG = 'org-shop';
const IMG = 'https://media.viewmax.io/users/u1/generated/abc.jpg';
const VID = 'https://media.viewmax.io/users/u1/sora-videos/1/clip.mp4';
const AYR = { AYRSHARE_API_KEY: 'ayr-primary-key-123' };
const PZ = { POSTIZ_API_KEY: 'pz-key-456' };
const NOW = new Date('2026-11-24T18:00:00Z');

async function approvedAd(s: MemoryStore, kind: 'image' | 'video' = 'image', approve = true) {
  await requestCreative(s, ORG, { kind, brief: 'A baker hands a warm loaf to a smiling customer at dawn', headline: 'Fresh bread, every morning', primaryText: 'Come by before 9.', cta: 'Book now' }, await loadCreatives(s, ORG, 'growth'), 'owner');
  const c = (await loadCreatives(s, ORG, 'growth')).creatives[0];
  await saveCreativeResult(s, ORG, { id: c.id, mediaUrl: kind === 'video' ? VID : IMG }, 'Ad studio');
  if (approve) await decideCreative(s, ORG, c.id, 'approved', '', 'owner');
  return c.id;
}

interface Call { url: string; init: RequestInit }
function mockFetch(responses: { status?: number; body: unknown }[]) {
  const calls: Call[] = [];
  const impl = (async (url: string | URL, init?: RequestInit) => {
    calls.push({ url: String(url), init: init ?? {} });
    const r = responses.shift() ?? { status: 500, body: {} };
    return new Response(JSON.stringify(r.body), { status: r.status ?? 200, headers: { 'content-type': 'application/json' } });
  }) as typeof fetch;
  return { calls, impl, body: (i: number) => JSON.parse(String(calls[i].init.body)) as Record<string, unknown>, header: (i: number, h: string) => (calls[i].init.headers as Record<string, string>)[h] };
}

test('setup: nothing connected by default; Ayrshare wins over Postiz; a self-hosted Postiz needs https and /public/v1', () => {
  assert.deepEqual(publishSetup({}), { provider: null, connected: false, note: 'Publishing is not connected yet: it needs Ayrshare or Postiz.' });
  assert.equal(publishSetup({ ...AYR, ...PZ }).provider, 'ayrshare');
  assert.equal(publishSetup(PZ).connected, true);
  assert.equal(postizBase(PZ), 'https://api.postiz.com/public/v1');
  assert.equal(postizBase({ POSTIZ_URL: 'https://post.example.com/api/public/v1/' }), 'https://post.example.com/api/public/v1');
  assert.equal(postizBase({ POSTIZ_URL: 'http://post.example.com/api/public/v1' }), null);
  assert.equal(postizBase({ POSTIZ_URL: 'https://post.example.com/api' }), null);
  assert.equal(publishSetup({ ...PZ, POSTIZ_URL: 'https://user:pw@post.example.com/public/v1' }).connected, false);
});

test('links: the admin links a business; the browser view never carries the Ayrshare profile key', async () => {
  const s = new MemoryStore();
  await assert.rejects(setPublishLink(s, ORG, { provider: 'ayrshare', profileKey: 'short', networks: ['instagram'] }, 'admin'), /profile key/);
  await assert.rejects(setPublishLink(s, ORG, { provider: 'ayrshare', profileKey: 'PROFILE-KEY-1234', networks: ['x'] }, 'admin'), /Tick the networks/);
  await setPublishLink(s, ORG, { provider: 'ayrshare', profileKey: 'PROFILE-KEY-1234', networks: ['instagram', 'x', 'facebook', 'instagram'] }, 'admin');
  const link = await loadPublishLink(s, ORG);
  assert.deepEqual(link, { provider: 'ayrshare', profileKey: 'PROFILE-KEY-1234', networks: ['instagram', 'facebook'] });
  const pub = publicLink(link);
  assert.equal(JSON.stringify(pub).includes('PROFILE-KEY'), false);
  assert.deepEqual(linkedNetworks(link, publishSetup(AYR)), ['instagram', 'facebook']);
  assert.deepEqual(linkedNetworks(link, publishSetup(PZ)), [], 'a link for another service does not count');
  assert.deepEqual(linkedNetworks(link, publishSetup({})), []);

  await assert.rejects(setPublishLink(s, ORG, { provider: 'postiz', channels: { x: { id: 'ch_123456', identifier: 'linkedin', name: 'Shop' } } }, 'admin'), /doesn't match/);
  await setPublishLink(s, ORG, { provider: 'postiz', channels: { x: { id: 'ch_123456', identifier: 'x', name: '@shop' }, tiktok: { id: 'ch_789012', identifier: 'tiktok', name: 'shop' } } }, 'admin');
  assert.deepEqual(publicLink(await loadPublishLink(s, ORG)), { provider: 'postiz', networks: ['tiktok', 'x'], channels: { tiktok: 'shop', x: '@shop' } });
  await setPublishLink(s, ORG, null, 'admin');
  assert.equal(await loadPublishLink(s, ORG), null);
  await assert.rejects(setPublishLink(s, ORG, { provider: 'buffer' }, 'admin'), /Pick Ayrshare or Postiz/);
});

test('drafting: only approved ads, one draft per network, media must fit, captions within the limit; drafts can be discarded', async () => {
  const s = new MemoryStore();
  const pending = await approvedAd(s, 'image', false);
  await assert.rejects(draftPosts(s, ORG, { creativeId: pending, networks: ['instagram'], text: 'Hi' }, 'owner'), /Approve the ad/);
  await assert.rejects(draftPosts(s, ORG, { creativeId: 'nope', networks: ['instagram'], text: 'Hi' }, 'owner'), /Pick an ad/);
  await decideCreative(s, ORG, pending, 'approved', '', 'owner');
  await assert.rejects(draftPosts(s, ORG, { creativeId: pending, networks: ['tiktok'], text: 'Hi' }, 'owner'), /TikTok doesn't take images/);
  await assert.rejects(draftPosts(s, ORG, { creativeId: pending, networks: ['x'], text: 'x'.repeat(281) }, 'owner'), /X allows 280/);
  await assert.rejects(draftPosts(s, ORG, { creativeId: pending, networks: [], text: 'Hi' }, 'owner'), /at least one network/);
  await assert.rejects(draftPosts(s, ORG, { creativeId: pending, networks: ['x'], text: '  ' }, 'owner'), /Write the caption/);
  const ids = await draftPosts(s, ORG, { creativeId: pending, networks: ['instagram', 'x', 'instagram'], text: 'Fresh bread at dawn' }, 'owner');
  assert.equal(ids.length, 2);
  let st = await loadPublishing(s, ORG);
  assert.equal(st.drafts, 2);
  assert.deepEqual(st.posts.map((p) => [p.network, p.mediaUrl, p.status]).sort(), [['instagram', IMG, 'draft'], ['x', IMG, 'draft']]);
  await discardPost(s, ORG, ids[0], 'owner');
  st = await loadPublishing(s, ORG);
  assert.deepEqual([st.drafts, st.posts.length], [1, 1]);
  assert.equal(fits('youtube', 'video'), true);
  assert.equal(fits('google', 'video'), false);
});

test('publish times: now by default, otherwise 10 minutes to 90 days ahead, with no milliseconds', () => {
  assert.equal(scheduleTime(undefined, NOW), null);
  assert.equal(scheduleTime('', NOW), null);
  assert.equal(scheduleTime('2026-11-25T09:30:00.000Z', NOW), '2026-11-25T09:30:00Z');
  assert.throws(() => scheduleTime('2026-11-24T18:05:00Z', NOW), /at least 10 minutes/);
  assert.throws(() => scheduleTime('2027-03-01T00:00:00Z', NOW), /within 90 days/);
  assert.throws(() => scheduleTime('soon', NOW), /valid time/);
});

test('publishing through Ayrshare: needs a connected service and a linked network; sends the ad with the profile key; failures can be retried', async () => {
  const s = new MemoryStore();
  const ad = await approvedAd(s, 'video');
  const [id] = await draftPosts(s, ORG, { creativeId: ad, networks: ['youtube'], text: 'Fresh bread at dawn #bakery' }, 'Social Publisher');
  const none = mockFetch([]);
  await assert.rejects(publishDraft(s, ORG, id, undefined, {}, 'owner', none.impl, NOW), /isn't connected yet/);
  await assert.rejects(publishDraft(s, ORG, id, undefined, AYR, 'owner', none.impl, NOW), /YouTube Shorts isn't linked/);
  assert.equal(none.calls.length, 0);
  await setPublishLink(s, ORG, { provider: 'ayrshare', profileKey: 'PROFILE-KEY-1234', networks: ['youtube'] }, 'admin');

  const bad = mockFetch([{ status: 400, body: { status: 'error', errors: [{ code: 156, message: 'YouTube is not linked in this profile', platform: 'youtube' }] } }]);
  await assert.rejects(publishDraft(s, ORG, id, undefined, AYR, 'owner', bad.impl, NOW), /Ayrshare: YouTube is not linked/);
  let p = (await loadPublishing(s, ORG)).posts[0];
  assert.deepEqual([p.status, p.attempts], ['failed', 1]);
  assert.equal(bad.header(0, 'authorization'), 'Bearer ayr-primary-key-123');
  assert.equal(bad.header(0, 'profile-key'), 'PROFILE-KEY-1234');
  assert.deepEqual(bad.body(0), { post: 'Fresh bread at dawn #bakery', platforms: ['youtube'], mediaUrls: [VID], isVideo: true, idempotencyKey: id, youTubeOptions: { title: 'Fresh bread, every morning' } });

  const ok = mockFetch([{ body: { status: 'scheduled', posts: [{ status: 'scheduled', id: 'ayr_post_1', postIds: [] }] } }]);
  p = await publishDraft(s, ORG, id, '2026-11-25T15:00:00Z', AYR, 'owner', ok.impl, NOW);
  assert.equal(ok.calls[0].url, 'https://api.ayrshare.com/api/post');
  assert.equal(ok.body(0).scheduleDate, '2026-11-25T15:00:00Z');
  assert.equal(ok.body(0).idempotencyKey, `${id}-1`, 'a retry gets a fresh idempotency key');
  assert.deepEqual([p.status, p.scheduledFor, p.provider, p.providerId, p.sentBy], ['sent', '2026-11-25T15:00:00Z', 'ayrshare', 'ayr_post_1', 'owner']);
  await assert.rejects(publishDraft(s, ORG, id, undefined, AYR, 'owner', ok.impl, NOW), /not a draft/);
  await assert.rejects(discardPost(s, ORG, id, 'owner'), /Only a draft/);

  // An ad that is no longer approved can't go out.
  const [id2] = await draftPosts(s, ORG, { creativeId: ad, networks: ['youtube'], text: 'Second' }, 'owner');
  await decideCreative(s, ORG, ad, 'rejected', 'Wrong mood', 'owner');
  await assert.rejects(publishDraft(s, ORG, id2, undefined, AYR, 'owner', ok.impl, NOW), /no longer approved/);
  const actions = (await s.listAuditByActions(ORG, ['post.drafted', 'post.sent', 'post.failed'])).map((e) => e.action);
  assert.deepEqual(actions, ['post.drafted', 'post.failed', 'post.sent', 'post.drafted']);
});

test('publishing through Postiz: uploads the ad from its link, then posts to the linked channel with safe settings', async () => {
  const s = new MemoryStore();
  const ad = await approvedAd(s, 'video');
  await setPublishLink(s, ORG, { provider: 'postiz', channels: { tiktok: { id: 'ch_789012', identifier: 'tiktok', name: 'shop' } } }, 'admin');
  const [id] = await draftPosts(s, ORG, { creativeId: ad, networks: ['tiktok'], text: 'Warm loaves at 6 AM #bakery' }, 'owner');
  const m = mockFetch([{ body: { id: 'med_1', path: 'https://uploads.postiz.com/clip.mp4', status: 'done' } }, { body: [{ postId: 'pz_post_1', integration: 'ch_789012' }] }]);
  const p = await publishDraft(s, ORG, id, undefined, PZ, 'owner', m.impl, NOW);
  assert.deepEqual(m.calls.map((c) => c.url), ['https://api.postiz.com/public/v1/upload-from-url', 'https://api.postiz.com/public/v1/posts']);
  assert.equal(m.header(1, 'authorization'), 'pz-key-456');
  assert.deepEqual(m.body(0), { url: VID });
  const body = m.body(1) as { type: string; date: string; posts: { integration: { id: string }; value: { content: string; image: unknown[] }[]; settings: Record<string, unknown> }[] };
  assert.deepEqual([body.type, body.date], ['now', NOW.toISOString()]);
  assert.deepEqual(body.posts[0].integration, { id: 'ch_789012' });
  assert.deepEqual(body.posts[0].value[0], { content: 'Warm loaves at 6 AM #bakery', image: [{ id: 'med_1', path: 'https://uploads.postiz.com/clip.mp4' }] });
  assert.equal(body.posts[0].settings.__type, 'tiktok');
  assert.equal(body.posts[0].settings.privacy_level, 'PUBLIC_TO_EVERYONE');
  assert.deepEqual([p.status, p.provider, p.providerId], ['sent', 'postiz', 'pz_post_1']);

  // A media upload that fails records the failure and posts nothing.
  const [id2] = await draftPosts(s, ORG, { creativeId: ad, networks: ['tiktok'], text: 'Again' }, 'owner');
  const up = mockFetch([{ status: 400, body: { message: 'Unsupported file' } }]);
  await assert.rejects(publishDraft(s, ORG, id2, undefined, PZ, 'owner', up.impl, NOW), /could not take the ad's media \(400: Unsupported file\)/);
  assert.equal(up.calls.length, 1);

  assert.deepEqual(postizSettings('x', 'x', { headline: '', text: 'Hi' }), { __type: 'x', who_can_reply_post: 'everyone' });
  assert.deepEqual(postizSettings('youtube', 'youtube', { headline: 'Fresh bread', text: '' }), { __type: 'youtube', title: 'Fresh bread', type: 'public' });
  assert.deepEqual(postizSettings('linkedin', 'linkedin-page', { headline: '', text: '' }), { __type: 'linkedin-page' });

  const list = mockFetch([{ body: [{ id: 'ch_789012', name: 'shop', identifier: 'tiktok', profile: 'shop', disabled: false, customer: { id: 'c1', name: 'Lone Star Bakery' } }] }]);
  assert.deepEqual(await listPostizChannels(PZ, list.impl), [{ id: 'ch_789012', name: 'shop', identifier: 'tiktok', profile: 'shop', customer: 'Lone Star Bakery', disabled: false }]);
  await assert.rejects(listPostizChannels({}, list.impl), /not connected/);
});

test('agent: the Social Publisher reports to the CMO, only drafts, and its goal covers approved ads without posts', async () => {
  const agent = getAgent('social-publisher')!;
  assert.equal(agent.reportsTo, 'cmo');
  assert.deepEqual(agent.tools, ['recall', 'draft_social_post']);
  assert.equal(TOOLS.draft_social_post.taskType, undefined);
  const s = new MemoryStore();
  const ad = await approvedAd(s, 'image');
  const ctx = { store: s, orgId: ORG, agent } as never;
  assert.match(String(await TOOLS.draft_social_post.execute({ creativeId: ad, network: 'instagram', text: 'Fresh bread at dawn' }, ctx)), /Drafted the Instagram post/);
  const st = await loadPublishing(s, ORG);
  assert.equal(st.posts[0].draftedBy, 'Social Publisher');

  const creatives = (await loadCreatives(s, ORG, 'growth')).creatives;
  assert.equal(publishingGoal({ business: 'Lone Star Bakery', voice: 'warm', avoid: '', creatives, posts: st.posts, networks: ['instagram'] }), '', 'the ad already has a draft');
  const goal = publishingGoal({ business: 'Lone Star Bakery', voice: 'warm', avoid: 'health claims', creatives, posts: [], networks: ['instagram', 'x'] });
  assert.match(goal, /Draft social posts for Lone Star Bakery/);
  assert.match(goal, new RegExp(`Ad ${ad}: image`));
  assert.match(goal, /x \(X, up to 280 characters\)/);
  assert.match(goal, /You only draft/);
  assert.equal(publishingGoal({ business: '', voice: '', avoid: '', creatives, posts: [], networks: [] }), '');
  assert.deepEqual(channelNetworks(['Instagram Reels', 'Google Business Profile', 'Email', 'TikTok', 'X (Twitter)']), ['instagram', 'tiktok', 'x', 'google']);
});
