// Inbound marketing and outbound sales in one CRM: enquiries from calls, WhatsApp, email, chat and walk-ins land as leads
// with their source, the sales flow answers them and hands them to sales, and the marketing agents learn from sales.
// The webhook for the 24/7 attendant stays closed until its key is set. Nothing here sends anything to anyone.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { MemoryStore } from '../core/store.js';
import { DEFAULT_TASK_TYPES } from '../core/policy.js';
import { loadCrm, logTouch, upsertContact, setDealStage, type Contact } from '../core/crm.js';
import { captureInbound, checkInbound, computeDashboard, loadLeads, LeadLimitError, LIMITS, INBOUND_ACTOR } from '../core/leads.js';
import { isInbound, pipelineByOrigin, salesContext } from '../core/channels.js';
import { flowStageOf, AUTO_RULES } from '../core/salesflow-state.js';
import { replyGoal, autoGoal } from '../core/salesflow.js';
import { marketingFlow, MKT_STAGES, FLOW_TERMS } from '../core/marketingflow.js';
import { goLiveChecklist, goLiveEnv } from '../core/golive.js';
import { paymentSetup } from '../core/payments.js';
import { publishSetup } from '../core/publishing.js';
import { loadMarketing, cmoPlanGoal } from '../core/marketing.js';
import { loadCreatives } from '../core/creatives.js';
import { receiveInbound } from '../server/routes/inbound.js';
import { HttpError } from '../server/context.js';

const ORG = '00000000-0000-0000-0000-0000000000a1';
const fresh = () => new MemoryStore({ orgId: ORG, taskTypes: DEFAULT_TASK_TYPES });
const KEY = 'k'.repeat(40);
const enquiry = (i: Record<string, unknown>) => { const r = checkInbound(i, false); assert.ok(r.ok, r.ok ? '' : r.error); return r.lead; };

test('origin: inbound is decided by source, and the pipeline splits inbound from outbound with win rates', async () => {
  assert.ok(isInbound({ source: 'whatsapp' }) && isInbound({ source: 'phone' }) && isInbound({ source: 'email' }));
  assert.ok(!isInbound({ source: 'apollo' }) && !isInbound({ source: 'other' }));
  const now = Date.parse('2026-11-25T00:00:00Z');
  const c = (id: string, source: string, stage: string, value = 0) => ({ id, name: id, source, stage, value, createdAt: new Date(now - 864e5).toISOString() }) as unknown as Contact;
  const p = pipelineByOrigin([c('a', 'website', 'won', 900), c('b', 'website', 'lost'), c('d', 'phone', 'lead'), c('e', 'apollo', 'lost'), c('f', 'apollo', 'contacted')], now);
  assert.equal(p.inbound.won, 1);
  assert.equal(p.inbound.winRate, 50, 'one won out of two closed');
  assert.equal(p.outbound.winRate, 0);
  assert.deepEqual(p.inboundBySource[0], { source: 'website', label: 'Website or lead form', leads: 2, won: 1 });
  const ctx = salesContext([{ name: 'Clinics', summary: 'Small clinics', pains: 'missed calls' } as never], [c('a', 'website', 'won', 900)], now);
  assert.match(ctx, /Sales ICP "Clinics"/);
  assert.match(ctx, /Website or lead form 1, 1/);
  assert.ok(!ctx.includes('@'), 'no lead details reach the marketing agents');
  assert.equal(salesContext([], [], now), '');
  assert.match(cmoPlanGoal(await loadMarketing(fresh(), ORG, null), ctx), /What sales knows/);
});

test('checkInbound: calls and WhatsApp need a phone, email needs an address, a clinic keeps no free text', () => {
  assert.equal(checkInbound({ channel: 'fax', phone: '+15551234567' }, false).ok, false);
  assert.match((checkInbound({ channel: 'call' }, false) as { error: string }).error, /phone number/);
  assert.match((checkInbound({ channel: 'email', phone: '+15551234567' }, false) as { error: string }).error, /email address/);
  assert.match((checkInbound({ channel: 'chat' }, false) as { error: string }).error, /email address or a phone/);
  const caller = enquiry({ channel: 'call', phone: '+1 555 123 4567', message: 'Do you do weekends?', when: 'Evening', ref: 'call/42 x' });
  assert.equal(caller.name, 'Phone call +1 555 123 4567', 'a caller who gave no name still gets a label');
  assert.equal(caller.message, 'Do you do weekends?\nBest time to call: Evening');
  assert.equal(caller.ref, 'call42x', 'refs are cleaned');
  const clinic = checkInbound({ channel: 'whatsapp', phone: '+919876543210', message: 'Knee pain for weeks', when: 'Morning' }, true);
  assert.ok(clinic.ok);
  assert.equal(clinic.lead.message, 'Best time to call: Morning', 'no symptoms are stored for a clinic');
});

test('captureInbound: lands in the CRM with its source, dedupes retries by ref, notes repeats, walk-ins count as answered', async () => {
  const s = fresh();
  const call = await captureInbound(s, ORG, await loadLeads(s, ORG), enquiry({ channel: 'call', name: 'Priya', phone: '+919876543210', ref: 'c-1' }));
  assert.equal(call.duplicate, false);
  let crm = await loadCrm(s, ORG);
  const priya = crm.contacts.find((c) => c.id === call.contactId)!;
  assert.equal(priya.source, 'phone');
  assert.equal(priya.stage, 'lead');
  assert.equal(priya.nextStep, 'Reply within 5 minutes');

  const again = await captureInbound(s, ORG, await loadLeads(s, ORG), enquiry({ channel: 'call', name: 'Priya', phone: '+919876543210', ref: 'c-1' }));
  assert.deepEqual(again, { contactId: call.contactId, repeat: false, duplicate: true }, 'a retried webhook records nothing new');
  const repeat = await captureInbound(s, ORG, await loadLeads(s, ORG), enquiry({ channel: 'whatsapp', phone: '+91 98765 43210', ref: 'w-1' }));
  assert.equal(repeat.repeat, true, 'the same number is the same person');
  assert.equal(repeat.contactId, call.contactId);
  const leads = await loadLeads(s, ORG);
  assert.equal(leads.leads.length, 2);
  assert.deepEqual(leads.leads.map((l) => l.channel).sort(), ['call', 'whatsapp']);

  const walk = await captureInbound(s, ORG, leads, enquiry({ channel: 'walk-in', name: 'Ravi', phone: '+919811111111' }), { by: 'owner@shop.example' });
  crm = await loadCrm(s, ORG);
  const ravi = crm.contacts.find((c) => c.id === walk.contactId)!;
  assert.equal(ravi.source, 'walk-in');
  assert.ok(ravi.lastTouch, 'they spoke in person');
  assert.ok(crm.nextActions.some((a) => a.key === `${ravi.id}:handoff`), 'an answered enquiry is offered to sales');
  const events = await s.listAuditByActions(ORG, ['crm.contact']);
  assert.equal(events.find((e) => e.detail.contact && (e.detail.contact as Contact).name === 'Priya')!.actor, INBOUND_ACTOR);
});

test('captureInbound: the webhook is capped, the owner is not', async () => {
  const s = fresh();
  const now = new Date();
  for (let i = 0; i < LIMITS.perHour; i++) await captureInbound(s, ORG, await loadLeads(s, ORG), enquiry({ channel: 'email', email: `p${i}@x.example` }), { capped: true, now });
  await assert.rejects(captureInbound(s, ORG, await loadLeads(s, ORG), enquiry({ channel: 'email', email: 'late@x.example' }), { capped: true, now }), LeadLimitError);
  await captureInbound(s, ORG, await loadLeads(s, ORG), enquiry({ channel: 'email', email: 'owner-typed@x.example' }), { by: 'owner', now });
});

test('sales flow: an enquiry joins at Qualify, gets a call-back or a drafted reply, then a hand-off to Contacted', async () => {
  const s = fresh();
  const { contactId: phoneId } = await captureInbound(s, ORG, await loadLeads(s, ORG), enquiry({ channel: 'whatsapp', name: 'Asha', phone: '+919822222222' }));
  const { contactId: mailId } = await captureInbound(s, ORG, await loadLeads(s, ORG), enquiry({ channel: 'email', name: 'Dev', email: 'dev@clinic.example', message: 'Price for a website?' }));
  await upsertContact(s, ORG, { name: 'Cold prospect', company: 'Far Away Ltd', source: 'apollo', email: 'cold@far.example' }, 'owner');
  let crm = await loadCrm(s, ORG);
  const asha = crm.contacts.find((c) => c.id === phoneId)!;
  const dev = crm.contacts.find((c) => c.id === mailId)!;
  const cold = crm.contacts.find((c) => c.source === 'apollo')!;
  assert.equal(flowStageOf(asha), 'qualify', 'inbound skips Find and Research');
  assert.equal(flowStageOf(cold), 'research', 'outbound is unchanged');

  const call = crm.nextActions.find((a) => a.key === `${phoneId}:callback`)!;
  assert.equal(call.kind, 'send');
  assert.equal(call.draft!.channel, 'whatsapp');
  assert.equal(call.draft!.to, '+919822222222');
  assert.match(call.draft!.text, /Asha/);
  const reply = crm.nextActions.find((a) => a.key === `${mailId}:reply`)!;
  assert.equal(reply.kind, 'agent');
  assert.equal(reply.agentId, 'speed-to-lead');
  assert.ok(crm.nextActions.indexOf(reply) < crm.nextActions.findIndex((a) => a.contactId === cold.id), 'fresh enquiries come before cold prospects');
  for (const id of [phoneId, mailId]) {
    assert.ok(!crm.nextActions.some((a) => a.contactId === id && (a.rule === 'score' || a.rule === 'research')), 'a person who asked is not scored or researched');
  }
  assert.ok(AUTO_RULES.includes('reply'), 'autopilot drafts first replies too');
  const goal = autoGoal(reply, dev);
  assert.equal(goal, replyGoal(dev));
  assert.match(goal, /send_message/);
  assert.match(goal, /dev@clinic\.example/);
  assert.match(goal, /Price for a website\?/);
  assert.equal(replyGoal({ ...dev, email: '' }), '', 'no email, no drafted reply');

  await logTouch(s, ORG, phoneId, 'Called back on WhatsApp', 'owner', 'call');
  crm = await loadCrm(s, ORG);
  assert.ok(!crm.nextActions.some((a) => a.key === `${phoneId}:callback`));
  const hand = crm.nextActions.find((a) => a.key === `${phoneId}:handoff`)!;
  assert.equal(hand.suggestStage, 'contacted');
  await setDealStage(s, ORG, phoneId, 'contacted', 'owner');
  crm = await loadCrm(s, ORG);
  assert.ok(!crm.nextActions.some((a) => a.key === `${phoneId}:handoff`), 'once handed off, the sales flow takes over');
});

test('marketing flow: eight stages, an enquiry to answer comes first, then the setup steps', async () => {
  const s = fresh();
  const build = async () => {
    const marketing = await loadMarketing(s, ORG, null);
    const creatives = await loadCreatives(s, ORG, null);
    const crm = await loadCrm(s, ORG);
    const leads = await loadLeads(s, ORG);
    const dashboard = computeDashboard({ leads, crm, creatives: creatives.creatives, posts: [], currency: marketing.currency, ceiling: marketing.cpl.ceiling, target: marketing.cpl.leadsTarget, spend: { plan: 0, ads: 0 } });
    return marketingFlow({ marketing, creatives, posts: [], linked: 0, publishConnected: false, leadForm: null, adsPlan: null, dashboard, contacts: crm.contacts, goals: { assessor: 'a', cmo: 'c', creatives: 'cr', publishing: 'p', ads: 'ad' } });
  };
  assert.deepEqual(MKT_STAGES.map((x) => x.key), ['assess', 'plan', 'create', 'publish', 'promote', 'capture', 'respond', 'measure']);
  assert.ok(FLOW_TERMS.some((t) => t.term === 'Hand-off') && FLOW_TERMS.some((t) => t.term === 'Inbound lead'));
  let flow = await build();
  assert.ok(flow.actions.some((a) => a.key === 'assess'));
  assert.ok(flow.actions.some((a) => a.key === 'lead_form'));
  assert.ok(!flow.actions.some((a) => a.key === 'respond'));

  const { contactId } = await captureInbound(s, ORG, await loadLeads(s, ORG), enquiry({ channel: 'call', name: 'Meera', phone: '+919833333333' }));
  flow = await build();
  assert.equal(flow.actions[0].key, 'respond');
  assert.equal(flow.actions[0].kind, 'crm');
  assert.equal(flow.waiting, 1);
  assert.equal(flow.origin.inbound.leads30, 1);
  await logTouch(s, ORG, contactId, 'Called back', 'owner', 'call');
  flow = await build();
  assert.ok(!flow.actions.some((a) => a.key === 'respond'), 'answered: nothing waits on marketing');
});

test('go-live checklist: built from which settings exist, split between the owner and the build', () => {
  const none = goLiveChecklist({ pay: paymentSetup({}), publish: publishSetup({}), env: goLiveEnv({}), origin: 'https://sixxab.ai', testPaid: false, leadFormOn: true, linkedNetworks: 0 });
  const by = (k: string) => none.items.find((i) => i.key === k)!;
  assert.equal(by('stripe').status, 'todo');
  assert.match(by('razorpay').how, /https:\/\/sixxab\.ai\/api\/payments\?provider=razorpay/);
  assert.equal(by('policies').status, 'decide');
  assert.equal(by('inbound').status, 'optional');
  assert.equal(by('lead_form').status, 'done');
  assert.equal(by('redeploy').owner, 'claude');
  assert.ok(none.yours > 5 && none.ours === 2);
  assert.ok(!JSON.stringify(goLiveEnv({ STRIPE_WEBHOOK_SECRET: 'whsec_secret' })).includes('whsec_secret'), 'only true or false, never a value');

  const keys = { STRIPE_SECRET_KEY: 'sk_test_x', STRIPE_WEBHOOK_SECRET: 'whsec_x', POSTIZ_API_KEY: 'pk', POSTIZ_URL: 'https://postiz.example/public/v1', INBOUND_KEY: KEY };
  const some = goLiveChecklist({ pay: paymentSetup(keys), publish: publishSetup(keys), env: goLiveEnv(keys), origin: 'https://sixxab.ai', testPaid: true, leadFormOn: true, linkedNetworks: 2 });
  for (const k of ['stripe', 'postiz', 'social', 'inbound', 'redeploy', 'webhooks', 'test_checkout']) assert.equal(some.items.find((i) => i.key === k)!.status, 'done', k);
  assert.equal(some.items.find((i) => i.key === 'live')!.status, 'todo', 'live needs its own switch');
  assert.equal(goLiveEnv({ PAYMENTS_LIVE: 'YES' }).paymentsLive, true);
});

test('inbound webhook: closed without a key, refuses a wrong key or unknown business, records a good enquiry', async () => {
  const s = fresh();
  const orgIds = async () => [ORG];
  const req = (body: unknown, key = KEY) => new Request('https://sixxab.ai/api/inbound', { method: 'POST', headers: { 'content-type': 'application/json', 'x-inbound-key': key }, body: JSON.stringify(body) });
  const status = async (p: Promise<Response>) => { try { return (await p).status; } catch (e) { assert.ok(e instanceof HttpError); return e.status; } };
  const good = { orgId: ORG, channel: 'whatsapp', name: 'Kiran', phone: '+919844444444', ref: 'wa-77' };
  assert.equal(await status(receiveInbound(req(good), s, orgIds, undefined)), 503);
  assert.equal(await status(receiveInbound(req(good), s, orgIds, 'short')), 503);
  assert.equal(await status(receiveInbound(req(good, 'x'.repeat(40)), s, orgIds, KEY)), 401);
  assert.equal(await status(receiveInbound(req({ ...good, orgId: '00000000-0000-0000-0000-00000000ffff' }), s, orgIds, KEY)), 404);
  assert.equal(await status(receiveInbound(req({ ...good, phone: '' }), s, orgIds, KEY)), 400);
  const r = await receiveInbound(req(good), s, orgIds, KEY);
  assert.equal(r.status, 200);
  const body = await r.json() as { ok: boolean; contactId: string; duplicate: boolean };
  assert.equal(body.ok, true);
  assert.equal(body.duplicate, false);
  assert.equal((await loadCrm(s, ORG)).contacts.find((c) => c.id === body.contactId)!.source, 'whatsapp');
  const retry = await (await receiveInbound(req(good), s, orgIds, KEY)).json() as { duplicate: boolean };
  assert.equal(retry.duplicate, true);
});
