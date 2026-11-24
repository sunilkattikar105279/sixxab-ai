// The end-to-end sales flow: find, qualify, outreach, discovery, proposal, onboard, retain, expand.
// Each stage's agent saves drafts onto the deal; one queue of next actions tells the owner what to approve,
// send or skip. Nothing is ever sent by the app, and stages move only when the owner says so.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { MemoryStore } from '../core/store.js';
import { DEFAULT_TASK_TYPES } from '../core/policy.js';
import { getAgent } from '../core/agents.js';
import { TOOLS } from '../core/tools.js';
import { loadCrm, setDealStage, upsertContact, type Contact } from '../core/crm.js';
import { markStepSent, saveIcp, saveLeadScore, saveSequence } from '../core/leadgen.js';
import {
  accountReviewGoal, autoGoal, markCustomerSent, markOnboardingStep, onboardingGoal, saveAccountReview, saveOnboarding, setAutopilot, skipAction,
} from '../core/salesflow.js';
import { runAutopilot } from '../core/autopilot.js';
import { bandFor, flowStageOf, nextActions, AUTO_RULES, FLOW_STAGES } from '../core/salesflow-state.js';
import type { ContentBlock, ModelClient, ModelRequest, ModelResponse } from '../core/types.js';

const ORG = '00000000-0000-0000-0000-000000000001';
const DAY = 864e5;
const fresh = () => new MemoryStore({ orgId: ORG, taskTypes: DEFAULT_TASK_TYPES });
const NO_SEND = { dispatch: async () => { throw new Error('nothing may be dispatched'); } };

class Model implements ModelClient {
  calls: ModelRequest[] = [];
  constructor(private readonly replies: { content: ContentBlock[]; stopReason: string }[]) {}
  async complete(req: ModelRequest): Promise<ModelResponse> {
    this.calls.push(req);
    const r = this.replies.shift() ?? { content: [{ type: 'text', text: 'Done.' }], stopReason: 'end_turn' };
    return { ...r, model: 'claude-sonnet-5-5', usage: { inputTokens: 10, outputTokens: 10 } };
  }
}
const use = (id: string, name: string, input: Record<string, unknown>): ContentBlock => ({ type: 'tool_use', id, name, input } as ContentBlock);

async function seed(store: MemoryStore) {
  await upsertContact(store, ORG, { name: 'Dana Reyes', company: 'Reyes Injury Law', email: 'dana@reyeslaw.example', city: 'Dallas', rank: 1 }, 'owner');
  await upsertContact(store, ORG, { name: 'Lone Star Roofing', company: 'Lone Star Roofing', city: 'Fort Worth', rank: 2 }, 'owner');
  const crm = await loadCrm(store, ORG);
  return { law: crm.contacts.find((c) => c.company === 'Reyes Injury Law')!, roof: crm.contacts.find((c) => c.company === 'Lone Star Roofing')! };
}
const deal = async (store: MemoryStore, id: string) => (await loadCrm(store, ORG)).contacts.find((c) => c.id === id)!;
const plan = (contactId: string) => ({
  contactId,
  steps: [{ day: 0, title: 'Send the welcome email', owner: 'you' }, { day: 2, title: 'Kickoff call', owner: 'you' }, { day: 3, title: 'Share call recordings', owner: 'customer' }, { day: 7, title: 'Go live', owner: 'agent' }],
  welcome: { subject: 'Welcome to SIXXAB', text: 'Hi Dana, thank you for choosing us.' },
  kickoff: 'Goals, access, first week.',
  notes: 'Confirm the start date.',
});

test('the Onboarding Manager and Customer Success Manager exist and can only save drafts', () => {
  for (const id of ['onboarding-manager', 'customer-success']) {
    const a = getAgent(id);
    assert.ok(a && a.usesModel, `${id} runs`);
    for (const t of a!.tools) assert.ok(TOOLS[t], `${id} tool ${t} exists`);
    assert.ok(!a!.tools.some((t) => ['send_message', 'publish_post', 'reply_comment', 'send_email_campaign', 'spend_money'].includes(t)), `${id} must not send or spend`);
  }
  assert.equal(getAgent('onboarding-manager')!.name, 'Onboarding Manager');
  assert.equal(getAgent('customer-success')!.name, 'Customer Success Manager');
  for (const name of ['save_onboarding', 'save_account_review']) {
    assert.equal(TOOLS[name].taskType, undefined, `${name} sends nothing`);
    assert.ok(!name.includes('re_'));
  }
  for (const s of FLOW_STAGES) for (const a of s.agents) assert.ok(a.length > 3, `${s.key} names its agents`);
  assert.deepEqual(FLOW_STAGES.map((s) => s.key), ['find', 'qualify', 'outreach', 'discovery', 'proposal', 'onboard', 'retain', 'expand']);
});

test('onboarding starts only after the win; steps are ticked off and the welcome email is marked sent by the owner', async () => {
  const store = fresh();
  const { law } = await seed(store);
  await assert.rejects(saveOnboarding(store, ORG, law.id, plan(law.id), 'Onboarding Manager'), /not a won customer/);
  await setDealStage(store, ORG, law.id, 'won', 'owner');
  let c = await deal(store, law.id);
  const touchedAtWin = c.lastTouch;
  assert.ok(c.customer.wonAt, 'the win date is kept');
  assert.equal(flowStageOf(c), 'onboard');
  await assert.rejects(saveOnboarding(store, ORG, law.id, { steps: [{ day: 0, title: 'One', owner: 'you' }] }, 'Onboarding Manager'), /at least two steps/);
  const out = await saveOnboarding(store, ORG, law.id, plan(law.id), 'Onboarding Manager');
  assert.match(out, /Nothing was sent/);
  c = await deal(store, law.id);
  const o = c.customer.onboarding!;
  assert.equal(o.steps.length, 4);
  assert.equal(o.steps[2].owner, 'customer');
  assert.equal(o.by, 'Onboarding Manager');
  assert.equal(c.lastTouch, touchedAtWin, 'a draft is not a touch');

  let q = nextActions({ contacts: [c], icps: [], prospectBatches: [], flowOrg: { autopilot: null, skipped: {} } } as never);
  const welcome = q.find((a) => a.rule === 'welcome')!;
  assert.equal(welcome.kind, 'send');
  assert.equal(welcome.draft!.to, 'dana@reyeslaw.example');
  assert.ok(q.some((a) => a.rule === 'onboard_task' && a.stepIndex === 0), 'day 0 step is due');

  await markCustomerSent(store, ORG, law.id, 'welcome', 'owner');
  await assert.rejects(markCustomerSent(store, ORG, law.id, 'welcome', 'owner'), /already/);
  await assert.rejects(markCustomerSent(store, ORG, law.id, 'checkin', 'owner'), /no draft/);
  await markOnboardingStep(store, ORG, law.id, 0, 'owner');
  await assert.rejects(markOnboardingStep(store, ORG, law.id, 0, 'owner'), /already/);
  await assert.rejects(markOnboardingStep(store, ORG, law.id, 9, 'owner'), /not found/);
  c = await deal(store, law.id);
  assert.ok(c.customer.onboarding!.steps[0].doneAt);
  assert.ok(c.lastTouch && c.lastTouch >= touchedAtWin!, 'sending the welcome is a touch');
  assert.ok(c.history.some((h) => /welcome/i.test(h.text)));
  q = nextActions({ contacts: [c], icps: [], prospectBatches: [], flowOrg: { autopilot: null, skipped: {} } } as never);
  assert.ok(!q.some((a) => a.rule === 'welcome'));
  assert.ok(!q.some((a) => a.rule === 'onboard_task'), 'the day 2 step is not due yet, and customer steps are theirs');

  await setDealStage(store, ORG, law.id, 'proposal', 'owner');
  assert.equal((await deal(store, law.id)).customer.wonAt, null, 'leaving Won clears the win date');
});

test('account reviews: health band, check-in, renewal and a referral ask only for healthy customers', async () => {
  const store = fresh();
  const { law } = await seed(store);
  await assert.rejects(saveAccountReview(store, ORG, law.id, { health: 80, reasons: 'x' }, 'Customer Success Manager'), /not a customer/);
  await setDealStage(store, ORG, law.id, 'won', 'owner');
  await assert.rejects(saveAccountReview(store, ORG, law.id, { health: 80, reasons: '' }, 'Customer Success Manager'), /reasons/);
  assert.deepEqual([bandFor(85), bandFor(55), bandFor(30)], ['healthy', 'watch', 'at_risk']);

  const renew = new Date(Date.now() + 20 * DAY).toISOString().slice(0, 10);
  await saveAccountReview(store, ORG, law.id, {
    health: 40, reasons: 'Slow replies since kickoff.', risks: 'Champion on leave', checkIn: { subject: 'Quick check-in', text: 'How is the first month going?' },
    renewalDate: renew, renewalPlan: 'Review results in week 3', upsell: ['Add the Spanish line'], referral: { subject: 'A favour', text: 'Who else should hear about this?' },
  }, 'Customer Success Manager');
  let c = await deal(store, law.id);
  let r = c.customer.review!;
  assert.equal(r.band, 'at_risk');
  assert.equal(r.referral, null, 'no referral ask below health 70');
  let q = nextActions({ contacts: [c], icps: [], prospectBatches: [], flowOrg: { autopilot: null, skipped: {} } } as never);
  const checkin = q.find((a) => a.rule === 'checkin')!;
  assert.equal(checkin.priority, 11, 'at-risk check-ins come first');
  assert.ok(q.some((a) => a.rule === 'renewal'));
  assert.ok(!q.some((a) => a.rule === 'referral'));

  await saveAccountReview(store, ORG, law.id, { health: 88, reasons: 'Live and happy.', referral: { subject: 'A favour', text: 'Who else?' }, upsell: ['Second location'] }, 'Customer Success Manager');
  c = await deal(store, law.id);
  r = c.customer.review!;
  assert.equal(r.band, 'healthy');
  assert.ok(r.referral);
  q = nextActions({ contacts: [c], icps: [], prospectBatches: [], flowOrg: { autopilot: null, skipped: {} } } as never);
  assert.ok(q.some((a) => a.rule === 'referral'));
  assert.ok(!q.some((a) => a.rule === 'review'), 'just reviewed');
  await markCustomerSent(store, ORG, law.id, 'referral', 'owner');
  c = await deal(store, law.id);
  assert.ok(!nextActions({ contacts: [c], icps: [], prospectBatches: [], flowOrg: { autopilot: null, skipped: {} } } as never).some((a) => a.rule === 'referral'));
  const later = Date.now() + 60 * DAY;
  assert.equal(flowStageOf({ ...c, customer: { ...c.customer, onboarding: null } } as Contact, later), 'expand');
  assert.ok(nextActions({ contacts: [c], icps: [], prospectBatches: [], flowOrg: { autopilot: null, skipped: {} } } as never, later).some((a) => a.rule === 'review'), 'reviewed again after 30 days');
});

test('the queue walks a lead from score to outreach, puts approvals first, and hides skipped actions for a week', async () => {
  const store = fresh();
  const { law, roof } = await seed(store);
  let crm = await loadCrm(store, ORG);
  assert.equal(crm.nextActions[0].rule, 'icp', 'no ICP yet: define who you sell to first');
  assert.equal(crm.flowCounts.qualify, 2);
  assert.ok(crm.nextActions.some((a) => a.key === `${law.id}:score` && a.kind === 'agent' && a.agentId === 'lead-scorer'));

  await saveIcp(store, ORG, { name: 'DFW PI firms', summary: 'Personal injury firms in Dallas-Fort Worth with 5 to 30 staff.', industries: 'Personal injury law', locations: 'Dallas-Fort Worth' }, 'ICP Builder');
  await saveLeadScore(store, ORG, law.id, 82, 'Strong fit', null, 'Lead Scorer');
  await saveLeadScore(store, ORG, roof.id, 30, 'Outside the ICP', null, 'Lead Scorer');
  crm = await loadCrm(store, ORG);
  assert.ok(!crm.nextActions.some((a) => a.rule === 'icp'));
  assert.ok(crm.nextActions.some((a) => a.key === `${law.id}:sequence`), 'a good lead gets outreach drafted');
  assert.ok(!crm.nextActions.some((a) => a.contactId === roof.id), 'a weak lead waits');

  await saveSequence(store, ORG, law.id, [{ day: 0, channel: 'email', subject: 'Calls after 6 PM', text: 'Hi Dana' }, { day: 3, channel: 'email', subject: 'Following up', text: 'Second note' }], '', 'Outreach Sequencer');
  crm = await loadCrm(store, ORG);
  const step = crm.nextActions.find((a) => a.rule === 'send_step')!;
  assert.equal(step.kind, 'send');
  assert.equal(step.stepIndex, 0);
  assert.equal(step.draft!.to, 'dana@reyeslaw.example');
  assert.equal(crm.flowCounts.outreach, 1);
  await markStepSent(store, ORG, law.id, 0, 'owner');
  crm = await loadCrm(store, ORG);
  assert.ok(!crm.nextActions.some((a) => a.rule === 'send_step'), 'step 2 is due in 3 days');
  assert.ok(nextActions({ ...crm, pendingApprovals: 0 }, Date.now() + 4 * DAY).some((a) => a.rule === 'send_step' && a.stepIndex === 1));

  const withApprovals = nextActions({ ...crm, pendingApprovals: 2 });
  assert.equal(withApprovals[0].rule, 'approvals');
  assert.match(withApprovals[0].title, /2 messages/);

  await setDealStage(store, ORG, law.id, 'won', 'owner');
  crm = await loadCrm(store, ORG);
  const onboard = crm.nextActions.find((a) => a.rule === 'onboard')!;
  assert.equal(onboard.agentId, 'onboarding-manager');
  await skipAction(store, ORG, onboard.key, 'owner');
  crm = await loadCrm(store, ORG);
  assert.ok(!crm.nextActions.some((a) => a.key === onboard.key), 'skipped for now');
  assert.ok(nextActions(crm, Date.now() + 8 * DAY).some((a) => a.key === onboard.key), 'and back after a week');
  await assert.rejects(skipAction(store, ORG, '  ', 'owner'), /which action/);
});

test('autopilot is off by default, prepares only internal drafts, and never sends or asks for approval', async () => {
  const store = fresh();
  const { law, roof } = await seed(store);
  const idle = new Model([]);
  assert.deepEqual(await runAutopilot({ store, model: idle, integrations: NO_SEND }, ORG, 3), { ran: [], skipped: 'Autopilot is off' });
  assert.equal(idle.calls.length, 0);
  await setAutopilot(store, ORG, true, 'owner');
  let crm = await loadCrm(store, ORG);
  assert.equal(crm.flowOrg.autopilot?.on, true);
  const auto = crm.nextActions.filter((a) => AUTO_RULES.includes(a.rule));
  assert.deepEqual(auto.map((a) => a.rule), ['score', 'score']);
  for (const a of auto) assert.ok(autoGoal(a).includes(a.contactId!));

  const model = new Model([
    { content: [use('a', 'save_lead_score', { contactId: law.id, score: 80, reasons: 'Fit' })], stopReason: 'tool_use' },
    { content: [{ type: 'text', text: 'Scored.' }], stopReason: 'end_turn' },
    { content: [use('b', 'save_lead_score', { contactId: roof.id, score: 40, reasons: 'Weak fit' })], stopReason: 'tool_use' },
    { content: [{ type: 'text', text: 'Scored.' }], stopReason: 'end_turn' },
  ]);
  const res = await runAutopilot({ store, model, integrations: NO_SEND }, ORG, 3);
  assert.deepEqual(res.ran.map((r) => r.status), ['done', 'done']);
  crm = await loadCrm(store, ORG);
  assert.deepEqual(crm.contacts.map((c) => c.leadScore?.score), [80, 40]);
  assert.equal((await store.listApprovals(ORG, 'pending')).length, 0);
  assert.ok(crm.contacts.every((c) => c.stage === 'lead'), 'the autopilot never moves a stage');
  await setAutopilot(store, ORG, false, 'owner');
  assert.equal((await loadCrm(store, ORG)).flowOrg.autopilot?.on, false);
});

test('stage goals fit and say nothing is sent', () => {
  const id = '00000000-0000-0000-0000-000000000009';
  for (const g of [onboardingGoal(id), accountReviewGoal(id)]) {
    assert.ok(g.length > 100 && g.length < 4000);
    assert.match(g, /nothing is sent/);
    assert.ok(g.includes(id));
  }
});
