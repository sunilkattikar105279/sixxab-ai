// Lead capture and results: form ids that carry the business id, turning the form off and giving it a new link, the
// public form page (no scripts, escaped names, bot traps, healthcare form with no free text), enquiries landing in the
// CRM with their source (repeat enquiries become notes), the hourly cap, tracked links in drafted posts, the results
// dashboard, and the Ads Manager's plan staying inside the budget. Nothing is sent or spent.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { MemoryStore } from '../core/store.js';
import { getAgent } from '../core/agents.js';
import { TOOLS } from '../core/tools.js';
import { loadCrm } from '../core/crm.js';
import { saveBusinessProfile } from '../core/profile.js';
import { decideCreative, loadCreatives, requestCreative, saveCreativeResult } from '../core/creatives.js';
import { draftPosts, loadPublishing, postLeadLink } from '../core/publishing.js';
import {
  captureLead, changeLeadForm, checkLead, cleanOrigin, computeDashboard, ensureLeadForm, findOpenForm, formUrl, LeadLimitError, LIMITS, loadLeads,
  newFormId, orgFromFormId,
} from '../core/leads.js';
import { adsGoal, cleanAdsPlan, loadAdsPlan, saveAdsPlan } from '../core/ads.js';
import { showForm, submitForm } from '../server/routes/leads.js';

const ORG = '3f2a9c1e-7b4d-4e8a-9c0f-1a2b3c4d5e6f';
const SITE = 'https://sixxab.ai';
const IMG = 'https://media.viewmax.io/users/u1/generated/abc.jpg';

async function setup(industry = 'Retail shop') {
  const s = new MemoryStore();
  await saveBusinessProfile(s, ORG, { name: 'Bread & <Co>', industry }, 'owner');
  const form = await ensureLeadForm(s, ORG, SITE, 'owner');
  return { s, form };
}

async function approvedAd(s: MemoryStore) {
  await requestCreative(s, ORG, { kind: 'image', brief: 'A baker hands a warm loaf to a customer', headline: 'Fresh bread, every morning', primaryText: 'Come by before 9.', cta: 'Book now' }, await loadCreatives(s, ORG, 'growth'), 'owner');
  const c = (await loadCreatives(s, ORG, 'growth')).creatives[0];
  await saveCreativeResult(s, ORG, { id: c.id, mediaUrl: IMG }, 'Ad studio');
  await decideCreative(s, ORG, c.id, 'approved', '', 'owner');
  return (await loadCreatives(s, ORG, 'growth')).creatives;
}

const post = (form: string, fields: Record<string, string>, q = '') =>
  new Request(`${SITE}/api/platform?route=leads&form=${form}${q}`, { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams(fields).toString() });

test('form ids carry the business id, are hard to guess, and only the current, open form answers', async () => {
  const id = newFormId(ORG);
  assert.match(id, /^[A-Za-z0-9_-]{32}$/);
  assert.equal(orgFromFormId(id), ORG);
  assert.notEqual(newFormId(ORG), id);
  assert.equal(orgFromFormId('short'), null);
  assert.throws(() => newFormId('not-a-uuid'));
  assert.throws(() => cleanOrigin('http://sixxab.ai'));
  assert.equal(cleanOrigin('https://sixxab.ai/app?x=1'), SITE);

  const { s, form } = await setup();
  assert.equal(formUrl(form), `${SITE}/l/${form.id}`);
  assert.equal((await ensureLeadForm(s, ORG, 'https://other.example', 'owner')).id, form.id, 'made once');
  assert.ok(await findOpenForm(s, form.id));
  assert.equal(await findOpenForm(s, newFormId(ORG)), null, 'a made-up id for the same business does not answer');

  await changeLeadForm(s, ORG, 'off', SITE, 'owner');
  assert.equal(await findOpenForm(s, form.id), null);
  await changeLeadForm(s, ORG, 'on', SITE, 'owner');
  assert.ok(await findOpenForm(s, form.id));
  await changeLeadForm(s, ORG, 'new', SITE, 'owner');
  const next = (await loadLeads(s, ORG)).form!;
  assert.notEqual(next.id, form.id);
  assert.equal(await findOpenForm(s, form.id), null, 'the old link stops working');
  assert.ok(await findOpenForm(s, next.id));
  await assert.rejects(changeLeadForm(s, ORG, 'delete', SITE, 'owner'));
});

test('the public form page: escaped name, no scripts, attribution kept, bot traps and a healthcare form without free text', async () => {
  const { s, form } = await setup();
  const get = await showForm(new Request(`${SITE}/api/platform?route=leads&form=${form.id}&s=Instagram&p=ABCDEF12&m=paid`), s);
  assert.equal(get.status, 200);
  assert.match(get.headers.get('content-type') ?? '', /text\/html/);
  const html = await get.text();
  assert.ok(html.includes('Bread &amp; &lt;Co&gt;'), 'business name escaped');
  assert.ok(!html.includes('<Co>'));
  assert.ok(!/<script/i.test(html), 'no scripts');
  assert.ok(html.includes('name="s" value="instagram"') && html.includes('name="p" value="abcdef12"') && html.includes('name="m" value="paid"'));
  assert.ok(html.includes('name="message"'));
  assert.equal((await showForm(new Request(`${SITE}/api/platform?route=leads&form=${newFormId(ORG)}`), s)).status, 404);

  const t = 1_800_000_000_000;
  // The hidden field is filled: thanked, nothing recorded.
  const bot = await submitForm(post(form.id, { name: 'Bot', email: 'bot@spam.test', consent: 'yes', website: 'x', t: String(t - 10_000) }), s, t);
  assert.equal(bot.status, 200);
  assert.equal((await loadLeads(s, ORG)).leads.length, 0);
  // Too quick: asked again, nothing recorded.
  const quick = await submitForm(post(form.id, { name: 'Ann', email: 'ann@example.com', consent: 'yes', t: String(t - 500) }), s, t);
  assert.equal(quick.status, 400);
  assert.match(await quick.text(), /press Send again/);
  // No consent: asked again with the values kept.
  const noConsent = await submitForm(post(form.id, { name: 'Ann', email: 'ann@example.com', t: String(t - 10_000) }), s, t);
  assert.equal(noConsent.status, 400);
  assert.match(await noConsent.text(), /value="ann@example.com"/);
  assert.equal((await loadLeads(s, ORG)).leads.length, 0);

  const ok = await submitForm(post(form.id, { name: 'Ann Lee', email: 'Ann@Example.com', message: 'Two loaves for Saturday <b>please</b>', consent: 'yes', t: String(t - 10_000), s: 'facebook' }), s, t);
  assert.equal(ok.status, 200);
  assert.match(await ok.text(), /Thank you, Ann/);
  const crm = await loadCrm(s, ORG);
  assert.equal(crm.contacts.length, 1);
  const c = crm.contacts[0];
  assert.equal(c.email, 'ann@example.com');
  assert.equal(c.stage, 'lead');
  assert.equal(c.source, 'social');
  assert.equal(c.sourceDetail, 'Facebook Page lead form');
  assert.equal(c.nextStep, 'Reply within 5 minutes');
  assert.ok(c.notes.includes('Two loaves'));
  const leads = await loadLeads(s, ORG);
  assert.equal(leads.leads[0].source, 'facebook');
  assert.equal(leads.leads[0].contactId, c.id);

  // A healthcare business: a time to call instead of a message box, and no free text kept.
  const h = await setup('Healthcare: hospital or clinic');
  const page = await (await showForm(new Request(`${SITE}/api/platform?route=leads&form=${h.form.id}`), h.s)).text();
  assert.ok(!page.includes('name="message"'));
  assert.ok(page.includes('name="when"'));
  await submitForm(post(h.form.id, { name: 'Raj', phone: '+1 214 555 0100', message: 'I have chest pain', when: 'Evening', consent: 'yes', t: String(t - 10_000) }), h.s, t);
  const hc = (await loadCrm(h.s, ORG)).contacts[0];
  assert.equal(hc.notes, 'Best time to call: Evening');
  assert.ok(!JSON.stringify(h.s.auditLog).includes('chest pain'), 'the free text never reaches the log');
});

test('enquiries: checks, repeat enquiries become notes, paid ads and posts are attributed, and the hourly cap holds', async () => {
  assert.deepEqual(checkLead({ name: '', email: 'a@b.co', consent: 'yes' }, false), { ok: false, error: 'Please add your name.' });
  assert.equal(checkLead({ name: 'A', consent: 'yes' }, false).ok, false);
  assert.equal(checkLead({ name: 'A', email: 'nope', consent: 'yes' }, false).ok, false);
  assert.equal(checkLead({ name: 'A', phone: '12', consent: 'yes' }, false).ok, false);
  const weird = checkLead({ name: 'A', email: 'a@b.co', consent: 'yes', s: 'myspace', p: 'zz', m: 'free' }, false);
  assert.ok(weird.ok && weird.lead.source === 'direct' && weird.lead.postRef === '' && !weird.lead.paid);

  const { s, form } = await setup();
  const creatives = await approvedAd(s);
  const [postId] = await draftPosts(s, ORG, { creativeId: creatives[0].id, networks: ['linkedin'], text: 'Warm bread for your team.', leadLink: formUrl(form) }, 'owner');
  const posts = (await loadPublishing(s, ORG)).posts;
  const drafted = posts.find((p) => p.id === postId)!;
  assert.ok(drafted.text.endsWith(postLeadLink(formUrl(form), 'linkedin', postId)), 'the draft ends with its tracked link');

  const now = new Date('2026-11-24T18:00:00Z');
  const one = checkLead({ name: 'Bo', phone: '(214) 555-0101', consent: 'yes', s: 'linkedin', p: postId.replace(/-/g, '').slice(0, 8), m: 'paid' }, false);
  assert.ok(one.ok);
  const first = await captureLead(s, ORG, await loadLeads(s, ORG), one.lead, posts, now);
  assert.equal(first.repeat, false);
  let crm = await loadCrm(s, ORG);
  assert.equal(crm.contacts[0].source, 'ads');
  assert.equal(crm.contacts[0].sourceDetail, 'LinkedIn ad: Fresh bread, every morning');
  // Same phone again, written differently: a note on the same deal, not a second deal.
  const again = checkLead({ name: 'Bo Smith', phone: '214-555-0101', message: 'Still keen', consent: 'yes' }, false);
  assert.ok(again.ok);
  const second = await captureLead(s, ORG, await loadLeads(s, ORG), again.lead, posts, now);
  assert.equal(second.repeat, true);
  assert.equal(second.contactId, first.contactId);
  crm = await loadCrm(s, ORG);
  assert.equal(crm.contacts.length, 1);
  assert.ok(crm.contacts[0].history.some((h) => h.text.includes('Still keen')));

  // The hourly cap: a flood stops at the limit.
  const full = await loadLeads(s, ORG);
  const flood = { ...full, leads: Array.from({ length: LIMITS.perHour }, (_, i) => ({ ...full.leads[0], id: `x${i}`, at: new Date(now.getTime() - 60_000).toISOString() })) };
  const three = checkLead({ name: 'Cy', email: 'cy@example.com', consent: 'yes' }, false);
  assert.ok(three.ok);
  await assert.rejects(captureLead(s, ORG, flood, three.lead, posts, now), LeadLimitError);
});

test('drafted posts get the tracked link only where links can be clicked, and the agent tool adds it itself', async () => {
  const { s, form } = await setup();
  const creatives = await approvedAd(s);
  const ids = await draftPosts(s, ORG, { creativeId: creatives[0].id, networks: ['instagram', 'x'], text: 'Fresh bread at 7.', leadLink: formUrl(form) }, 'owner');
  const posts = (await loadPublishing(s, ORG)).posts;
  assert.equal(posts.find((p) => p.id === ids[0])!.text, 'Fresh bread at 7.', 'Instagram keeps the link in the bio');
  assert.ok(posts.find((p) => p.id === ids[1])!.text.includes(`${formUrl(form)}?s=x&p=`));
  await assert.rejects(draftPosts(s, ORG, { creativeId: creatives[0].id, networks: ['x'], text: 'a'.repeat(250), leadLink: formUrl(form) }, 'owner'), /with the lead form link/);

  const tool = TOOLS.draft_social_post;
  const agent = getAgent('social-publisher')!;
  await tool.execute({ creativeId: creatives[0].id, network: 'facebook', text: 'Bread for breakfast.' }, { store: s, orgId: ORG, agent, taskId: null } as never);
  const fb = (await loadPublishing(s, ORG)).posts.find((p) => p.network === 'facebook')!;
  assert.ok(fb.text.startsWith('Bread for breakfast.\n\nhttps://sixxab.ai/l/'));
});

test('results dashboard: leads in 30 days, cost per lead against the ceiling, funnel and wins', () => {
  const now = new Date('2026-11-24T18:00:00Z');
  const ago = (d: number) => new Date(now.getTime() - d * 86_400_000).toISOString();
  const lead = (id: string, d: number, source: string, contactId: string, repeat = false) => ({ id, at: ago(d), formId: 'f', source, paid: false, postId: '', contactId, repeat });
  const contact = (id: string, stage: string, value = 0) => ({ id, name: `N${id}`, stage, value }) as never;
  const d = computeDashboard({
    leads: { form: null, leads: [lead('1', 1, 'instagram', 'a'), lead('2', 3, 'instagram', 'b'), lead('3', 5, 'site', 'c'), lead('4', 2, 'instagram', 'a', true), lead('5', 40, 'facebook', 'd')] },
    crm: { contacts: [contact('a', 'won', 900), contact('b', 'qualified'), contact('c', 'lead'), contact('d', 'lost')] } as never,
    creatives: [{ mediaUrl: IMG, status: 'approved' }, { mediaUrl: IMG, status: 'rejected' }, { mediaUrl: '', status: 'queued' }] as never,
    posts: [{ status: 'sent' }, { status: 'draft' }] as never,
    currency: 'USD', ceiling: 60, target: 20, spend: { plan: 249, ads: 300 }, now,
  });
  assert.equal(d.leads30, 3, 'repeat enquiries are not new leads');
  assert.equal(d.leadsPrev30, 1);
  assert.equal(d.cpl, 183);
  assert.deepEqual(d.funnel, { made: 2, approved: 1, posted: 1, leads: 4, qualified: 2, won: 1, wonValue: 900 });
  assert.deepEqual(d.bySource[0], { source: 'instagram', label: 'Instagram', leads: 2, won: 1 });
  assert.equal(d.recent[0].name, 'Na');
  assert.equal(d.recent.find((r) => r.repeat)?.label, 'Instagram');
  assert.equal(computeDashboard({ leads: { form: null, leads: [] }, crm: { contacts: [] } as never, creatives: [], posts: [], currency: 'USD', ceiling: null, target: null, spend: { plan: 0, ads: 0 } }).cpl, null);
});

test('Ads Manager: plans only inside the budget with approved ads, and its goal and card spend nothing', async () => {
  const { s } = await setup();
  const creatives = await approvedAd(s);
  const approved = creatives.filter((c) => c.status === 'approved');
  const good = { summary: 'Most of it on Instagram.', campaigns: [
    { platform: 'meta', objective: 'leads', audience: 'Within 5 miles, 25 to 55', dailyBudget: 10, days: 20, creativeIds: [approved[0].id, 'not-approved'], why: 'Where they scroll' },
    { platform: 'google', objective: 'calls', audience: 'Searches for bakery near me', dailyBudget: 5, days: 20, why: 'People ready to buy' },
  ] };
  const plan = cleanAdsPlan(good, approved, 300);
  assert.equal(plan.total, 300);
  assert.deepEqual(plan.campaigns[0].creativeIds, [approved[0].id], 'only approved ads');
  assert.throws(() => cleanAdsPlan(good, approved, 250), /add up to 300/);
  assert.throws(() => cleanAdsPlan(good, approved, 0), /monthly ad budget/);
  assert.throws(() => cleanAdsPlan({ campaigns: [{ platform: 'meta', dailyBudget: 5, days: 10 }] }, approved, 300), /approved ad/);
  assert.throws(() => cleanAdsPlan({ campaigns: [{ platform: 'snapchat', dailyBudget: 5, days: 10 }] }, approved, 300), /platform/);
  await saveAdsPlan(s, ORG, good, approved, 300, 'Ads Manager');
  const saved = await loadAdsPlan(s, ORG);
  assert.equal(saved?.campaigns.length, 2);
  assert.equal(saved?.by, 'Ads Manager');

  const goal = adsGoal({ business: 'Bread', offer: 'Bread', bestCustomer: 'Families', area: 'Dallas', currency: 'USD', budget: 300, ceiling: 40, leadsTarget: 10, channels: ['Instagram'], approved });
  assert.ok(goal.includes('save_ads_plan') && goal.includes(approved[0].id) && goal.includes('300 USD'));
  assert.equal(adsGoal({ business: 'B', offer: '', bestCustomer: '', area: '', currency: 'USD', budget: 0, ceiling: null, leadsTarget: null, channels: [], approved }), '');
  const agent = getAgent('ads-manager')!;
  assert.deepEqual(agent.tools, ['recall', 'save_ads_plan']);
  assert.equal(agent.reportsTo, 'cmo');
  assert.ok(TOOLS.save_ads_plan && !TOOLS.save_ads_plan.taskType, 'saving a plan needs no approval because it spends nothing');
});
