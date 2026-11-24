// AI marketing agency: the assessment, readiness, plan maths, the CMO and Business Assessor tools, Stripe and PayPal
// checkout (with fetch mocked, so nothing leaves the test), webhooks, and paying businesses joining the admin's CRM.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import { MemoryStore } from '../core/store.js';
import { getAgent } from '../core/agents.js';
import { TOOLS } from '../core/tools.js';
import {
  computeMarketing, costPerLead, draftThirtyDayPlan, loadMarketing, MARKETING_PLANS, prefillAnswers, recommendPlan, recordPayment,
  saveAssessment, scoreReadiness, syncAgencySales, validateAnswers, cmoPlanGoal, assessorGoal,
} from '../core/marketing.js';
import {
  confirmPaypalSubscription, confirmStripeSession, createPaypalSubscription, createStripeCheckout, handlePaypalEvent, handleStripeEvent,
  paymentSetup, verifyStripeSignature, PAYPAL_PRODUCT_ID,
} from '../core/payments.js';
import { listInvoices, loadPlan } from '../core/billing.js';
import { loadCrm } from '../core/crm.js';

const ORG = 'org-shop';
const ADMIN = 'org-admin';
const STRIPE_TEST = { STRIPE_SECRET_KEY: 'sk_test_abc', STRIPE_WEBHOOK_SECRET: 'whsec_test' };
const PAYPAL_TEST = { PAYPAL_CLIENT_ID: 'cid', PAYPAL_CLIENT_SECRET: 'csecret', PAYPAL_WEBHOOK_ID: 'WH-1' };

const FULL = {
  name: 'Lone Star Dental', industry: 'Dentist', location: 'Dallas, TX', services: 'Cleaning $120, whitening $400, implants $3,000',
  averageSale: '450', closeRate: '3', bestCustomer: 'Families nearby', sources: 'Google, referrals', leadsWanted: '30', adBudget: '1,200',
  website: 'https://example.com', booking: 'https://example.com/book', googleProfile: 'https://g.page/x', social: 'https://instagram.com/x', reviews: '42',
  pixel: 'Yes', assets: 'Logo, photos and videos', replySpeed: 'Within 5 minutes',
};

/** A tiny fetch double: routes by method and URL, records every call. */
function fakeFetch(routes: Record<string, (body: string, init: RequestInit) => { status?: number; json: unknown }>) {
  const calls: { method: string; url: string; body: string; headers: Record<string, string> }[] = [];
  const f = (async (input: string | URL, init: RequestInit = {}) => {
    const url = String(input);
    const method = init.method ?? 'GET';
    const body = typeof init.body === 'string' ? init.body : '';
    calls.push({ method, url, body, headers: (init.headers ?? {}) as Record<string, string> });
    const key = Object.keys(routes).find((k) => { const [m, u] = k.split(' '); return m === method && url.startsWith(u); });
    if (!key) return new Response(JSON.stringify({ message: `no route for ${method} ${url}` }), { status: 500 });
    const r = routes[key](body, init);
    return new Response(JSON.stringify(r.json), { status: r.status ?? 200, headers: { 'content-type': 'application/json' } });
  }) as typeof fetch;
  return { f, calls };
}

test('assessment: answers are checked, prefilled from the profile, and need a few before saving', async () => {
  assert.throws(() => validateAnswers({ closeRate: '11' }), /10/);
  assert.throws(() => validateAnswers({ adBudget: '-5' }), /number/);
  assert.throws(() => validateAnswers({ pixel: 'Maybe' }), /pixel|choose/i);
  const a = validateAnswers({ ...FULL, unknownKey: 'x' });
  assert.equal(a.adBudget, '1200');
  assert.equal(a.unknownKey, undefined);
  assert.equal(prefillAnswers({ name: 'Acme', location: 'Pune' }).name, 'Acme');
  const s = new MemoryStore();
  await assert.rejects(saveAssessment(s, ORG, { name: 'A' }, 'owner'), /few questions/);
  await saveAssessment(s, ORG, FULL, 'owner');
  const m = await loadMarketing(s, ORG, null);
  assert.equal(m.answers.name, 'Lone Star Dental');
  assert.ok(m.savedAt);
});

test('readiness, cost per lead, recommended plan and the 30-day draft follow the answers', () => {
  const full = scoreReadiness(validateAnswers(FULL));
  assert.equal(full.score, 100);
  assert.equal(full.gaps.length, 0);
  const empty = scoreReadiness({});
  assert.equal(empty.score, 0);
  assert.ok(empty.gaps[0].length > 10);
  // The online check overrides what the owner said.
  const checked = scoreReadiness(validateAnswers(FULL), { checks: [{ item: 'google', status: 'missing', note: 'No profile', source: '' }], summary: '', at: '', by: '' });
  assert.equal(checked.score, 85);
  assert.equal(checked.checks.find((c) => c.key === 'google')!.confirmed, false);

  const cpl = costPerLead(validateAnswers(FULL));
  assert.equal(cpl.ceiling, 41); // 450 × 30% close × 30%
  assert.equal(cpl.assumedClose, false);
  assert.match(cpl.budgetNote, /29 leads/);
  assert.equal(costPerLead({ averageSale: '1000' }).ceiling, 60); // assumes 2 in 10 close
  assert.equal(costPerLead({}).ceiling, null);

  assert.equal(recommendPlan({ adBudget: '200' }).planId, 'starter');
  assert.equal(recommendPlan({ adBudget: '1200' }).planId, 'growth');
  assert.equal(recommendPlan({ adBudget: '3000' }).planId, 'agency');
  assert.equal(recommendPlan({ adBudget: '20000' }).planId, 'scale');
  assert.equal(recommendPlan({ adBudget: '100000' }, 'INR', 85).planId, 'growth'); // about 1,176 USD

  const plan = draftThirtyDayPlan(validateAnswers(FULL), 'growth');
  assert.equal(plan.weeks.length, 4);
  assert.ok(plan.channels.length > 0);
  assert.equal(MARKETING_PLANS.find((p) => p.id === 'agency')!.credits, 400);
  assert.equal(MARKETING_PLANS.find((p) => p.id === 'scale')!.checkout, false);
});

test('agents: the Business Assessor reports to the CMO and only saves; the CMO saves its plan', async () => {
  const assessor = getAgent('business-assessor')!;
  assert.equal(assessor.reportsTo, 'cmo');
  assert.deepEqual(assessor.tools.filter((t) => /send|publish|spend|email/.test(t)), []);
  assert.ok(getAgent('cmo')!.tools.includes('save_marketing_plan'));
  const s = new MemoryStore();
  const ctx = { store: s, orgId: ORG, agent: assessor } as never;
  await assert.rejects(TOOLS.save_assessment_check.execute({ checks: [] }, ctx), /at least one check/);
  const out = await TOOLS.save_assessment_check.execute({ checks: [
    { item: 'website', status: 'found', note: 'Loads', source: 'https://example.com' },
    { item: 'google', status: 'found', note: 'Said so', source: '' },
    { item: 'pixel', status: 'unclear', note: 'Cannot see code', source: '' },
  ], summary: 'Website fine; claim Google' }, ctx);
  assert.match(String(out), /website found, google unclear/);
  await assert.rejects(TOOLS.save_marketing_plan.execute({ summary: 'x', weeks: [{ focus: 'a', actions: ['b'] }] }, ctx), /four weeks/);
  const weeks = [1, 2, 3, 4].map((w) => ({ week: w, focus: `Week ${w}`, actions: ['Do a thing'] }));
  await TOOLS.save_marketing_plan.execute({ summary: 'Local search first', channels: ['Google'], weeks, kpis: ['Leads'] }, ctx);
  await saveAssessment(s, ORG, FULL, 'owner');
  const m = await loadMarketing(s, ORG, null);
  assert.equal(m.validation!.checks.find((c) => c.item === 'google')!.status, 'unclear');
  assert.equal(m.tailored!.summary, 'Local search first');
  assert.match(cmoPlanGoal(m), /do not draft posts/);
  assert.match(assessorGoal(m.answers), /save_assessment_check/);
});

test('payment setup: nothing connected without keys, and live keys stay off until switched on', () => {
  assert.equal(paymentSetup({}).stripe.connected, false);
  assert.deepEqual(paymentSetup(STRIPE_TEST).stripe, { connected: true, mode: 'test', note: 'Test mode: no real money moves.' });
  assert.equal(paymentSetup({ STRIPE_SECRET_KEY: 'sk_live_x' }).stripe.connected, false);
  assert.equal(paymentSetup({ STRIPE_SECRET_KEY: 'sk_live_x', PAYMENTS_LIVE: 'yes' }).stripe.mode, 'live');
  assert.equal(paymentSetup({ STRIPE_SECRET_KEY: 'pk_test_x' }).stripe.connected, false);
  assert.equal(paymentSetup(PAYPAL_TEST).paypal.mode, 'test');
  assert.equal(paymentSetup({ ...PAYPAL_TEST, PAYPAL_ENV: 'live' }).paypal.connected, false);
  assert.ok(!JSON.stringify(paymentSetup({ ...STRIPE_TEST, ...PAYPAL_TEST })).includes('sk_test_abc'));
});

test('Stripe: checkout is a monthly subscription for the plan price; a finished session is recorded once, test or live', async () => {
  const { f, calls } = fakeFetch({ 'POST https://api.stripe.com/v1/checkout/sessions': () => ({ json: { id: 'cs_test_1', url: 'https://checkout.stripe.com/c/pay/cs_test_1' } }) });
  await assert.rejects(createStripeCheckout({}, { planId: 'starter', orgId: ORG, successUrl: 'https://x/app', cancelUrl: 'https://x/app' }, f), /aren't connected/);
  await assert.rejects(createStripeCheckout(STRIPE_TEST, { planId: 'scale', orgId: ORG, successUrl: 'https://x/app', cancelUrl: 'https://x/app' }, f), /on a call/);
  const s = await createStripeCheckout(STRIPE_TEST, { planId: 'starter', orgId: ORG, email: 'o@example.com', successUrl: 'https://x/app?ref={CHECKOUT_SESSION_ID}', cancelUrl: 'https://x/app' }, f);
  assert.equal(s.url, 'https://checkout.stripe.com/c/pay/cs_test_1');
  const form = new URLSearchParams(calls[0].body);
  assert.equal(form.get('mode'), 'subscription');
  assert.equal(form.get('line_items[0][price_data][unit_amount]'), '7900');
  assert.equal(form.get('line_items[0][price_data][recurring][interval]'), 'month');
  assert.equal(form.get('client_reference_id'), ORG);
  assert.equal(form.get('subscription_data[metadata][plan]'), 'starter');

  const session = (over: Record<string, unknown>) => ({ id: 'cs_test_1', status: 'complete', payment_status: 'paid', client_reference_id: ORG, metadata: { orgId: ORG, plan: 'growth' }, subscription: 'sub_1', amount_total: 24900, currency: 'usd', livemode: false, customer_details: { email: 'o@example.com' }, ...over });
  const store = new MemoryStore();
  const open = fakeFetch({ 'GET https://api.stripe.com/v1/checkout/sessions/': () => ({ json: session({ status: 'open', payment_status: 'unpaid' }) }) });
  assert.equal(await confirmStripeSession(store, STRIPE_TEST, ORG, 'cs_test_1', 'owner', open.f), false);
  const paid = fakeFetch({ 'GET https://api.stripe.com/v1/checkout/sessions/': () => ({ json: session({}) }) });
  await assert.rejects(confirmStripeSession(store, STRIPE_TEST, 'org-other', 'cs_test_1', 'owner', paid.f), /another workspace/);
  await assert.rejects(confirmStripeSession(store, STRIPE_TEST, ORG, '../evil', 'owner', paid.f), /doesn't look right/);
  assert.equal(await confirmStripeSession(store, STRIPE_TEST, ORG, 'cs_test_1', 'owner', paid.f), true);
  assert.equal(await confirmStripeSession(store, STRIPE_TEST, ORG, 'cs_test_1', 'owner', paid.f), true);
  let m = await loadMarketing(store, ORG, null);
  assert.equal(m.payments.length, 1);
  assert.equal(m.subscription!.planId, 'growth');
  assert.equal(m.subscription!.mode, 'test');
  assert.equal(await loadPlan(store, ORG), null); // a test payment never sets the billing plan

  // A live payment sets the plan and a paid invoice for the month.
  await recordPayment(store, ORG, { provider: 'stripe', ref: 'cs_live_9', subscriptionId: 'sub_9', planId: 'growth', amount: 249, currency: 'USD', mode: 'live', kind: 'first', payer: '' }, 'stripe');
  assert.equal((await loadPlan(store, ORG))!.name, 'Marketing Growth');
  assert.equal((await listInvoices(store, ORG))[0].status, 'paid');
  m = await loadMarketing(store, ORG, null);
  assert.equal(m.subscription!.mode, 'live');
});

test('Stripe webhooks: the signature is checked, renewals are recorded and a cancellation ends the plan', async () => {
  const body = JSON.stringify({ id: 'evt_1' });
  const t = 1_800_000_000;
  const sig = createHmac('sha256', 'whsec_test').update(`${t}.${body}`).digest('hex');
  assert.equal(await verifyStripeSignature(body, `t=${t},v1=${sig}`, 'whsec_test', t), true);
  assert.equal(await verifyStripeSignature(body + ' ', `t=${t},v1=${sig}`, 'whsec_test', t), false);
  assert.equal(await verifyStripeSignature(body, `t=${t},v1=${sig}`, 'whsec_other', t), false);
  assert.equal(await verifyStripeSignature(body, `t=${t},v1=${sig}`, 'whsec_test', t + 3600), false);
  assert.equal(await verifyStripeSignature(body, '', 'whsec_test', t), false);

  const store = new MemoryStore();
  const orgs = [ORG];
  const completed = { id: 'evt_a', type: 'checkout.session.completed', livemode: false, data: { object: { id: 'cs_test_2', status: 'complete', payment_status: 'paid', client_reference_id: ORG, metadata: { orgId: ORG, plan: 'starter' }, subscription: 'sub_2', amount_total: 7900, currency: 'usd' } } };
  assert.equal(await handleStripeEvent(store, completed, orgs), 'recorded');
  assert.equal(await handleStripeEvent(store, { ...completed, data: { object: { ...completed.data.object, client_reference_id: 'org-x' } } }, orgs), 'ignored: unknown workspace');
  const meta = { orgId: ORG, plan: 'starter' };
  assert.match(await handleStripeEvent(store, { id: 'e', type: 'invoice.paid', data: { object: { id: 'in_0', billing_reason: 'subscription_create', parent: { subscription_details: { metadata: meta, subscription: 'sub_2' } } } } }, orgs), /first payment/);
  assert.equal(await handleStripeEvent(store, { id: 'e', type: 'invoice.paid', data: { object: { id: 'in_1', billing_reason: 'subscription_cycle', amount_paid: 7900, currency: 'usd', parent: { subscription_details: { metadata: meta, subscription: 'sub_2' } } } } }, orgs), 'recorded renewal');
  let m = await loadMarketing(store, ORG, null);
  assert.equal(m.payments.length, 2);
  assert.equal(m.payments[0].kind, 'renewal');
  assert.equal(m.subscription!.status, 'active');
  assert.equal(await handleStripeEvent(store, { id: 'e', type: 'customer.subscription.deleted', data: { object: { id: 'sub_2', metadata: meta } } }, orgs), 'recorded cancellation');
  m = await loadMarketing(store, ORG, null);
  assert.equal(m.subscription!.status, 'cancelled');
  assert.equal(await handleStripeEvent(store, { id: 'e', type: 'charge.refunded', data: { object: {} } }, orgs), 'ignored: charge.refunded');
});

test('PayPal: the product and monthly plan are found or created, the subscription is recorded, renewals and cancellations follow', async () => {
  const paypalPlans: { id: string; name: string; status: string }[] = [];
  let productExists = false;
  const sub = { id: 'I-ABC12345', status: 'ACTIVE', custom_id: `${ORG}|agency`, subscriber: { email_address: 'payer@example.com' }, billing_info: { last_payment: { amount: { value: '999.00', currency_code: 'USD' } } } };
  const { f, calls } = fakeFetch({
    'POST https://api-m.sandbox.paypal.com/v1/oauth2/token': () => ({ json: { access_token: 'tok' } }),
    [`GET https://api-m.sandbox.paypal.com/v1/catalogs/products/${PAYPAL_PRODUCT_ID}`]: () => (productExists ? { json: { id: PAYPAL_PRODUCT_ID } } : { status: 404, json: { name: 'RESOURCE_NOT_FOUND' } }),
    'POST https://api-m.sandbox.paypal.com/v1/catalogs/products': () => { productExists = true; return { json: { id: PAYPAL_PRODUCT_ID } }; },
    'GET https://api-m.sandbox.paypal.com/v1/billing/plans': () => ({ json: { plans: paypalPlans } }),
    'POST https://api-m.sandbox.paypal.com/v1/billing/plans': (b) => { const p = { id: 'P-1', name: JSON.parse(b).name, status: 'ACTIVE' }; paypalPlans.push(p); return { json: p }; },
    'POST https://api-m.sandbox.paypal.com/v1/billing/subscriptions': () => ({ json: { id: 'I-ABC12345', links: [{ rel: 'approve', href: 'https://www.sandbox.paypal.com/webapps/billing/subscriptions?ba_token=BA-1' }] } }),
    'GET https://api-m.sandbox.paypal.com/v1/billing/subscriptions/': () => ({ json: sub }),
  });
  await assert.rejects(createPaypalSubscription({}, { planId: 'agency', orgId: ORG, returnUrl: 'https://x/app', cancelUrl: 'https://x/app' }, f), /isn't connected/);
  const s1 = await createPaypalSubscription(PAYPAL_TEST, { planId: 'agency', orgId: ORG, returnUrl: 'https://x/app?marketing=paypal', cancelUrl: 'https://x/app' }, f);
  assert.match(s1.url, /^https:\/\/www\.sandbox\.paypal\.com\//);
  const planBody = JSON.parse(calls.find((c) => c.method === 'POST' && c.url.endsWith('/v1/billing/plans'))!.body);
  assert.equal(planBody.billing_cycles[0].pricing_scheme.fixed_price.value, '999');
  assert.equal(planBody.billing_cycles[0].frequency.interval_unit, 'MONTH');
  const subBody = JSON.parse(calls.find((c) => c.url.endsWith('/v1/billing/subscriptions'))!.body);
  assert.equal(subBody.custom_id, `${ORG}|agency`);
  // The second checkout reuses the product and the plan.
  await createPaypalSubscription(PAYPAL_TEST, { planId: 'agency', orgId: ORG, returnUrl: 'https://x/app', cancelUrl: 'https://x/app' }, f);
  assert.equal(calls.filter((c) => c.method === 'POST' && c.url.endsWith('/v1/billing/plans')).length, 1);
  assert.equal(calls.filter((c) => c.method === 'POST' && c.url.endsWith('/v1/catalogs/products')).length, 1);

  const store = new MemoryStore();
  await assert.rejects(confirmPaypalSubscription(store, PAYPAL_TEST, ORG, 'not-an-id', 'owner', f), /doesn't look right/);
  await assert.rejects(confirmPaypalSubscription(store, PAYPAL_TEST, 'org-other', 'I-ABC12345', 'owner', f), /another workspace/);
  assert.equal(await confirmPaypalSubscription(store, PAYPAL_TEST, ORG, 'I-ABC12345', 'owner', f), true);
  // The activation webhook for the same subscription is not counted twice.
  assert.equal(await handlePaypalEvent(store, PAYPAL_TEST, { id: 'WH-a', event_type: 'BILLING.SUBSCRIPTION.ACTIVATED', resource: sub }, [ORG], f), 'recorded');
  let m = await loadMarketing(store, ORG, null);
  assert.equal(m.payments.length, 1);
  assert.equal(m.subscription!.planId, 'agency');
  assert.equal(m.subscription!.provider, 'paypal');
  assert.equal(await handlePaypalEvent(store, PAYPAL_TEST, { id: 'WH-b', event_type: 'PAYMENT.SALE.COMPLETED', resource: { id: 'SALE-2', billing_agreement_id: 'I-ABC12345', amount: { total: '999.00', currency: 'USD' } } }, [ORG], f), 'recorded renewal');
  assert.equal(await handlePaypalEvent(store, PAYPAL_TEST, { id: 'WH-c', event_type: 'BILLING.SUBSCRIPTION.CANCELLED', resource: { id: 'I-ABC12345', custom_id: `${ORG}|agency` } }, [ORG], f), 'recorded cancellation');
  m = await loadMarketing(store, ORG, null);
  assert.equal(m.payments.length, 2);
  assert.equal(m.subscription!.status, 'cancelled');
});

test('agency sales: a business that paid joins the admin CRM once as a won deal, which queues its onboarding', async () => {
  const store = new MemoryStore();
  await recordPayment(store, ORG, { provider: 'stripe', ref: 'cs_test_7', subscriptionId: 'sub_7', planId: 'growth', amount: 249, currency: 'USD', mode: 'test', kind: 'first', payer: 'owner@lonestar.example' }, 'stripe');
  const names = async (id: string) => (id === ORG ? 'Lone Star Dental' : null);
  assert.equal(await syncAgencySales(store, ADMIN, [ADMIN, ORG, 'org-unpaid'], names, 'admin'), 1);
  assert.equal(await syncAgencySales(store, ADMIN, [ADMIN, ORG, 'org-unpaid'], names, 'admin'), 0);
  const crm = await loadCrm(store, ADMIN);
  assert.equal(crm.contacts.length, 1);
  const c = crm.contacts[0];
  assert.equal(c.name, 'Lone Star Dental (test payment)');
  assert.equal(c.stage, 'won');
  assert.equal(c.value, 249);
  assert.equal(c.email, 'owner@lonestar.example');
  assert.ok(crm.nextActions.some((a) => a.rule === 'onboard' && a.agentId === 'onboarding-manager'));
});

test('marketing state: the newest payment sets the plan; with none, the recommendation drives the draft', () => {
  const empty = computeMarketing([], { name: 'Acme', currency: 'INR' });
  assert.equal(empty.currency, 'INR');
  assert.equal(empty.subscription, null);
  assert.equal(empty.answers.name, 'Acme');
  assert.equal(empty.plan30.planId, empty.recommended.planId);
  const paidAt = '2026-11-01T00:00:00.000Z';
  const withPay = computeMarketing([{ action: 'marketing.payment', at: paidAt, actor: 'stripe', detail: { provider: 'stripe', ref: 'r', subscriptionId: 's', planId: 'agency', amount: 999, currency: 'USD', mode: 'test', kind: 'first', payer: '' } }], null);
  assert.equal(withPay.subscription!.planName, 'Agency');
  assert.equal(withPay.plan30.planId, 'agency');
  assert.equal(withPay.subscription!.startedAt, paidAt);
});
