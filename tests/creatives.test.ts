// Ad studio: briefs within the plan's monthly allowance, studio results only from Viewmax's media host, the owner's yes
// or no, the studio queue across businesses, the Ad Creative Producer's tool and goal. Nothing is made, posted or spent.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { MemoryStore } from '../core/store.js';
import { getAgent } from '../core/agents.js';
import { TOOLS } from '../core/tools.js';
import { recordPayment } from '../core/marketing.js';
import {
  computeCreatives, creativesGoal, decideCreative, failCreative, loadCreatives, markAdminStudio, mediaUrlOk, requestCreative, saveCreativeResult, studioQueue,
} from '../core/creatives.js';

const ORG = 'org-shop';
const IMG = 'https://media.viewmax.io/users/u1/generated/abc.jpg';
const VID = 'https://media.viewmax.io/users/u1/sora-videos/1/clip.mp4';
const brief = (kind: 'image' | 'video', headline = 'Fresh bread, every morning') => ({ kind, brief: 'A baker hands a warm loaf to a smiling customer at dawn', headline, primaryText: 'Come by before 9.', cta: 'Book now' });

test('media links: only https on Viewmax media, with no login, query or odd file type', () => {
  assert.equal(mediaUrlOk(IMG), IMG);
  assert.equal(mediaUrlOk(VID), VID);
  assert.equal(mediaUrlOk('http://media.viewmax.io/a.jpg'), '');
  assert.equal(mediaUrlOk('https://evil.example/a.jpg'), '');
  assert.equal(mediaUrlOk('https://media.viewmax.io.evil.example/a.jpg'), '');
  assert.equal(mediaUrlOk('https://user:pw@media.viewmax.io/a.jpg'), '');
  assert.equal(mediaUrlOk('https://media.viewmax.io/a.jpg?token=1'), '');
  assert.equal(mediaUrlOk('https://media.viewmax.io/a.html'), '');
  assert.equal(mediaUrlOk(42), '');
});

test('allowance: no plan means no ads; a plan caps images and videos each month; the admin workspace has no cap', async () => {
  const s = new MemoryStore();
  const none = await loadCreatives(s, ORG, null);
  assert.equal(none.allowance.planName, null);
  await assert.rejects(requestCreative(s, ORG, brief('image'), none, 'owner'), /Pick a marketing plan first/);

  const starter = await loadCreatives(s, ORG, 'starter');
  assert.deepEqual([starter.allowance.images, starter.allowance.videos], [20, 4]);
  await assert.rejects(requestCreative(s, ORG, { kind: 'gif', brief: 'x'.repeat(20) }, starter, 'owner'), /image or a video/);
  await assert.rejects(requestCreative(s, ORG, { kind: 'image', brief: 'short' }, starter, 'owner'), /Describe the ad/);
  for (let i = 0; i < 4; i++) await requestCreative(s, ORG, brief('video'), await loadCreatives(s, ORG, 'starter'), 'owner');
  const full = await loadCreatives(s, ORG, 'starter');
  assert.equal(full.allowance.usedVideos, 4);
  assert.equal(full.creatives[0].format, '9:16');
  await assert.rejects(requestCreative(s, ORG, brief('video'), full, 'owner'), /4 videos are used/);
  await requestCreative(s, ORG, brief('image'), full, 'owner');
  assert.equal((await loadCreatives(s, ORG, 'starter')).creatives[0].format, '4:5');

  // A failed creative gives its slot back.
  const id = (await loadCreatives(s, ORG, 'starter')).creatives.find((c) => c.kind === 'video')!.id;
  await failCreative(s, ORG, id, 'Model error', 'Ad studio');
  assert.equal((await loadCreatives(s, ORG, 'starter')).allowance.usedVideos, 3);

  const admin = new MemoryStore();
  const open = await loadCreatives(admin, 'org-admin', null, true);
  assert.equal(open.allowance.planName, 'SIXXAB admin');
  await markAdminStudio(admin, 'org-admin', open, 'admin@sixxab.ai');
  const marked = await loadCreatives(admin, 'org-admin', null);
  assert.equal(marked.adminWorkspace, true);
  assert.equal(marked.allowance.images, 9999);
  await markAdminStudio(admin, 'org-admin', marked, 'admin@sixxab.ai');
  assert.equal((await admin.listAuditByActions('org-admin', ['creative.admin'])).length, 1);
});

test('studio and approval: results only for queued ads; approving marks ready and can be undone', async () => {
  const s = new MemoryStore();
  await requestCreative(s, ORG, brief('image'), await loadCreatives(s, ORG, 'growth'), 'owner');
  const c = (await loadCreatives(s, ORG, 'growth')).creatives[0];
  assert.equal(c.status, 'queued');
  await assert.rejects(decideCreative(s, ORG, c.id, 'approved', '', 'owner'), /Only a finished creative/);
  await assert.rejects(saveCreativeResult(s, ORG, { id: c.id, mediaUrl: 'https://evil.example/x.jpg' }, 'Ad studio'), /must be https on media.viewmax.io/);
  await saveCreativeResult(s, ORG, { id: c.id, mediaUrl: IMG, model: 'Nano Banana 2', credits: 2 }, 'Ad studio');
  await assert.rejects(saveCreativeResult(s, ORG, { id: c.id, mediaUrl: IMG }, 'Ad studio'), /not waiting to be made/);
  let st = await loadCreatives(s, ORG, 'growth');
  assert.deepEqual([st.creatives[0].status, st.creatives[0].mediaUrl, st.creatives[0].credits, st.awaiting], ['made', IMG, 2, 1]);
  await assert.rejects(decideCreative(s, ORG, c.id, 'maybe', '', 'owner'), /Approve or reject/);
  await decideCreative(s, ORG, c.id, 'approved', '', 'owner');
  st = await loadCreatives(s, ORG, 'growth');
  assert.deepEqual([st.creatives[0].status, st.approved, st.awaiting], ['approved', 1, 0]);
  await decideCreative(s, ORG, c.id, 'rejected', 'Wrong mood', 'owner');
  assert.equal((await loadCreatives(s, ORG, 'growth')).creatives[0].note, 'Wrong mood');
  const actions = (await s.listAuditByActions(ORG, ['creative.requested', 'creative.made', 'creative.decided'])).map((e) => e.action);
  assert.deepEqual(actions, ['creative.requested', 'creative.made', 'creative.decided', 'creative.decided']);
});

test('studio queue: queued ads across businesses, oldest first, with each brand voice', async () => {
  const s = new MemoryStore();
  const tick = () => new Promise((r) => setTimeout(r, 5));
  await requestCreative(s, 'org-a', brief('image', 'First'), await loadCreatives(s, 'org-a', 'starter'), 'a');
  await tick();
  await requestCreative(s, 'org-b', brief('video', 'Second'), await loadCreatives(s, 'org-b', 'growth'), 'b');
  const made = (await loadCreatives(s, 'org-a', 'starter')).creatives[0].id;
  await tick();
  await requestCreative(s, 'org-a', brief('image', 'Third'), await loadCreatives(s, 'org-a', 'starter'), 'a');
  await saveCreativeResult(s, 'org-a', { id: made, mediaUrl: IMG }, 'Ad studio');
  const q = await studioQueue(s, ['org-a', 'org-b', 'org-c'], async (id) => ({ business: id.toUpperCase(), voice: 'warm', avoid: 'no guarantees' }));
  assert.deepEqual(q.map((j) => j.headline), ['Second', 'Third']);
  assert.deepEqual([q[0].business, q[0].kind, q[0].voice], ['ORG-B', 'video', 'warm']);
});

test('agent: the Ad Creative Producer reports to the CMO, only queues briefs, and its goal fits the allowance', async () => {
  const producer = getAgent('ad-creative-producer')!;
  assert.equal(producer.reportsTo, 'cmo');
  assert.deepEqual(producer.tools, ['recall', 'save_creative_brief']);
  assert.equal(TOOLS.save_creative_brief.taskType, undefined);
  const s = new MemoryStore();
  const ctx = { store: s, orgId: ORG, agent: producer } as never;
  await assert.rejects(TOOLS.save_creative_brief.execute(brief('image'), ctx), /Pick a marketing plan first/);
  await recordPayment(s, ORG, { provider: 'stripe', ref: 'cs_test_1', subscriptionId: 'sub_1', planId: 'starter', amount: 79, currency: 'USD', mode: 'test', kind: 'first', payer: '' }, 'stripe');
  assert.match(String(await TOOLS.save_creative_brief.execute(brief('image'), ctx)), /Queued the image ad "Fresh bread, every morning"/);
  const st = await loadCreatives(s, ORG, 'starter');
  assert.equal(st.creatives[0].requestedBy, 'Ad Creative Producer');

  const goal = creativesGoal({ business: 'Lone Star Bakery', offer: 'Sourdough $9', bestCustomer: 'Neighbors', voice: 'warm', avoid: 'health claims', channels: ['Instagram'], weekFocus: 'Launch', allowance: st.allowance });
  assert.match(goal, /Write 3 image ad briefs and 1 short video brief for Lone Star Bakery/);
  assert.match(goal, /Never invent prices/);
  const spent = computeCreatives([], 'starter').allowance;
  assert.equal(creativesGoal({ business: '', offer: '', bestCustomer: '', voice: '', avoid: '', channels: [], weekFocus: '', allowance: { ...spent, usedImages: 20, usedVideos: 4 } }), '');
  assert.equal(creativesGoal({ business: '', offer: '', bestCustomer: '', voice: '', avoid: '', channels: [], weekFocus: '', allowance: computeCreatives([], null).allowance }), '');
});
