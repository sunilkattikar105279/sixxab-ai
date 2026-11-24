// Payments for the marketing plans: Stripe Checkout (cards, Apple Pay, Google Pay), PayPal Subscriptions and, for
// Indian businesses in INR, Razorpay Subscriptions (UPI AutoPay, cards, netbanking), over their REST APIs with fetch (no SDKs). Keys are optional environment variables: without them the app
// says payments aren't connected. Live keys stay switched off until PAYMENTS_LIVE is "yes".
// Server side only: secrets never reach the browser.
import { getMarketingPlan, recordCancellation, recordPayment, type MarketingPlan, type PlanId, type Provider } from './marketing.js';
import type { Store } from './store.js';

export interface PayEnv {
  STRIPE_SECRET_KEY?: string; STRIPE_WEBHOOK_SECRET?: string;
  PAYPAL_CLIENT_ID?: string; PAYPAL_CLIENT_SECRET?: string; PAYPAL_WEBHOOK_ID?: string; PAYPAL_ENV?: string;
  RAZORPAY_KEY_ID?: string; RAZORPAY_KEY_SECRET?: string; RAZORPAY_WEBHOOK_SECRET?: string;
  PAYMENTS_LIVE?: string;
}
export interface ProviderSetup { connected: boolean; mode: 'test' | 'live' | null; note: string }
export interface PaySetup { stripe: ProviderSetup; paypal: ProviderSetup; razorpay: ProviderSetup }

const val = (v: string | undefined) => (v && v.trim() ? v.trim() : '');
const liveOn = (env: PayEnv) => val(env.PAYMENTS_LIVE).toLowerCase() === 'yes';
const LIVE_OFF = 'Live keys are set, but live charges stay off until you switch them on.';

/** Which providers can take a payment now, in which mode. Never returns a key. */
export function paymentSetup(env: PayEnv): PaySetup {
  const sk = val(env.STRIPE_SECRET_KEY);
  const sMode = /^(sk|rk)_test_/.test(sk) ? 'test' : /^(sk|rk)_live_/.test(sk) ? 'live' : null;
  const stripe: ProviderSetup = !sk ? { connected: false, mode: null, note: 'Card payments aren\'t connected yet.' }
    : !sMode ? { connected: false, mode: null, note: 'The Stripe key doesn\'t look like a Stripe secret key.' }
      : sMode === 'live' && !liveOn(env) ? { connected: false, mode: 'live', note: LIVE_OFF }
        : { connected: true, mode: sMode, note: sMode === 'test' ? 'Test mode: no real money moves.' : 'Live: real charges.' };
  const hasPaypal = Boolean(val(env.PAYPAL_CLIENT_ID) && val(env.PAYPAL_CLIENT_SECRET));
  const pMode = val(env.PAYPAL_ENV).toLowerCase() === 'live' ? 'live' : 'test';
  const paypal: ProviderSetup = !hasPaypal ? { connected: false, mode: null, note: 'PayPal isn\'t connected yet.' }
    : pMode === 'live' && !liveOn(env) ? { connected: false, mode: 'live', note: LIVE_OFF }
      : { connected: true, mode: pMode, note: pMode === 'test' ? 'PayPal sandbox: no real money moves.' : 'Live: real charges.' };
  const kid = val(env.RAZORPAY_KEY_ID);
  const rMode = /^rzp_test_/.test(kid) ? 'test' : /^rzp_live_/.test(kid) ? 'live' : null;
  const razorpay: ProviderSetup = !kid || !val(env.RAZORPAY_KEY_SECRET) ? { connected: false, mode: null, note: 'UPI and Indian card payments (Razorpay) aren\'t connected yet.' }
    : !rMode ? { connected: false, mode: null, note: 'The Razorpay key ID doesn\'t look right: it starts with rzp_test_ or rzp_live_.' }
      : rMode === 'live' && !liveOn(env) ? { connected: false, mode: 'live', note: LIVE_OFF }
        : { connected: true, mode: rMode, note: rMode === 'test' ? 'Razorpay test mode: no real money moves.' : 'Live: real charges.' };
  return { stripe, paypal, razorpay };
}

const checkoutPlan = (planId: unknown): MarketingPlan => {
  const plan = getMarketingPlan(planId);
  if (!plan) throw new Error('Pick a plan');
  if (!plan.checkout) throw new Error(`${plan.name} is set up with you on a call, not at checkout`);
  return plan;
};

const planName = (p: MarketingPlan) => `SIXXAB Marketing ${p.name}`;

// ── Stripe ──────────────────────────────────────────────────────────────────

const STRIPE = 'https://api.stripe.com/v1';

async function stripeCall<T>(key: string, path: string, init: { method?: string; form?: Record<string, string> }, fetchImpl: typeof fetch): Promise<T> {
  const res = await fetchImpl(`${STRIPE}${path}`, {
    method: init.method ?? (init.form ? 'POST' : 'GET'),
    headers: { authorization: `Bearer ${key}`, ...(init.form ? { 'content-type': 'application/x-www-form-urlencoded' } : {}) },
    body: init.form ? new URLSearchParams(init.form).toString() : undefined,
    signal: AbortSignal.timeout(20_000),
  });
  const body = await res.json().catch(() => ({})) as Record<string, unknown>;
  if (!res.ok) throw new Error(`Stripe ${res.status}: ${String((body.error as { message?: string } | undefined)?.message ?? 'request failed').slice(0, 200)}`);
  return body as T;
}

/** Starts a Stripe Checkout subscription for one plan. Apple Pay and Google Pay show when enabled in Stripe. */
export async function createStripeCheckout(env: PayEnv, o: { planId: PlanId; orgId: string; email?: string; successUrl: string; cancelUrl: string }, fetchImpl: typeof fetch = fetch): Promise<{ id: string; url: string }> {
  const setup = paymentSetup(env).stripe;
  if (!setup.connected) throw new Error(setup.note);
  const plan = checkoutPlan(o.planId);
  const form: Record<string, string> = {
    mode: 'subscription',
    'line_items[0][quantity]': '1',
    'line_items[0][price_data][currency]': 'usd',
    'line_items[0][price_data][unit_amount]': String(plan.priceUsd * 100),
    'line_items[0][price_data][recurring][interval]': 'month',
    'line_items[0][price_data][product_data][name]': planName(plan),
    client_reference_id: o.orgId,
    'metadata[orgId]': o.orgId,
    'metadata[plan]': plan.id,
    'subscription_data[metadata][orgId]': o.orgId,
    'subscription_data[metadata][plan]': plan.id,
    success_url: o.successUrl,
    cancel_url: o.cancelUrl,
    allow_promotion_codes: 'false',
  };
  if (o.email && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(o.email)) form.customer_email = o.email;
  const s = await stripeCall<{ id: string; url: string }>(val(env.STRIPE_SECRET_KEY), '/checkout/sessions', { form }, fetchImpl);
  if (!s.url) throw new Error('Stripe did not return a checkout page');
  return { id: s.id, url: s.url };
}

interface StripeSession {
  id: string; status?: string; payment_status?: string; client_reference_id?: string | null; livemode?: boolean;
  metadata?: Record<string, string>; subscription?: string | null; amount_total?: number | null; currency?: string | null;
  customer_details?: { email?: string | null } | null;
}

/** Records a finished Stripe Checkout for this business. Returns false when it isn't paid yet. */
export async function confirmStripeSession(store: Store, env: PayEnv, orgId: string, sessionId: string, by: string, fetchImpl: typeof fetch = fetch): Promise<boolean> {
  if (!/^cs_(test|live)_[\w]+$/.test(sessionId)) throw new Error('That checkout reference doesn\'t look right');
  const setup = paymentSetup(env).stripe;
  if (!setup.connected) throw new Error(setup.note);
  const s = await stripeCall<StripeSession>(val(env.STRIPE_SECRET_KEY), `/checkout/sessions/${sessionId}`, {}, fetchImpl);
  return recordStripeSession(store, s, orgId, by);
}

async function recordStripeSession(store: Store, s: StripeSession, orgId: string, by: string): Promise<boolean> {
  if (s.client_reference_id !== orgId || s.metadata?.orgId !== orgId) throw new Error('This checkout belongs to another workspace');
  if (s.status !== 'complete' || !['paid', 'no_payment_required'].includes(String(s.payment_status))) return false;
  const plan = checkoutPlan(s.metadata?.plan);
  await recordPayment(store, orgId, {
    provider: 'stripe', ref: s.id, subscriptionId: s.subscription ?? s.id, planId: plan.id,
    amount: typeof s.amount_total === 'number' ? s.amount_total / 100 : plan.priceUsd, currency: (s.currency ?? 'usd').toUpperCase(),
    mode: s.livemode ? 'live' : 'test', kind: 'first', payer: s.customer_details?.email ?? '',
  }, by);
  return true;
}

const enc = new TextEncoder();
const hex = (buf: ArrayBuffer) => [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
function sameText(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

/** Checks a Stripe-Signature header (t=…,v1=…) against the raw body, within five minutes. */
export async function verifyStripeSignature(rawBody: string, header: string, secret: string, nowSec = Math.floor(Date.now() / 1000), toleranceSec = 300): Promise<boolean> {
  if (!header || !secret) return false;
  const parts = header.split(',').map((p) => p.trim().split('='));
  const t = Number(parts.find(([k]) => k === 't')?.[1]);
  const sigs = parts.filter(([k]) => k === 'v1').map(([, v]) => v ?? '');
  if (!Number.isFinite(t) || !sigs.length || Math.abs(nowSec - t) > toleranceSec) return false;
  const key = await globalThis.crypto.subtle.importKey('raw', enc.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const expected = hex(await globalThis.crypto.subtle.sign('HMAC', key, enc.encode(`${t}.${rawBody}`)));
  return sigs.some((s) => sameText(s, expected));
}

interface StripeEvent { id: string; type: string; livemode?: boolean; data: { object: Record<string, unknown> } }

/** Handles a verified Stripe event: first payment, monthly renewals and cancellations. */
export async function handleStripeEvent(store: Store, event: StripeEvent, orgIds: string[]): Promise<string> {
  const o = event.data?.object ?? {};
  const meta = (o.metadata ?? {}) as Record<string, string>;
  if (event.type === 'checkout.session.completed') {
    const orgId = String(o.client_reference_id ?? '');
    if (!orgIds.includes(orgId)) return 'ignored: unknown workspace';
    return (await recordStripeSession(store, o as unknown as StripeSession, orgId, 'stripe')) ? 'recorded' : 'not paid yet';
  }
  if (event.type === 'invoice.paid') {
    if (o.billing_reason === 'subscription_create') return 'ignored: first payment comes with checkout';
    const parent = (o.parent ?? {}) as { subscription_details?: { metadata?: Record<string, string>; subscription?: string } };
    const subMeta = parent.subscription_details?.metadata ?? (o.subscription_details as { metadata?: Record<string, string> } | undefined)?.metadata ?? {};
    const orgId = subMeta.orgId ?? '';
    if (!orgIds.includes(orgId)) return 'ignored: unknown workspace';
    const plan = checkoutPlan(subMeta.plan);
    await recordPayment(store, orgId, {
      provider: 'stripe', ref: String(o.id), subscriptionId: String(parent.subscription_details?.subscription ?? o.subscription ?? ''), planId: plan.id,
      amount: Number(o.amount_paid ?? plan.priceUsd * 100) / 100, currency: String(o.currency ?? 'usd').toUpperCase(),
      mode: event.livemode ? 'live' : 'test', kind: 'renewal', payer: String(o.customer_email ?? ''),
    }, 'stripe');
    return 'recorded renewal';
  }
  if (event.type === 'customer.subscription.deleted') {
    const orgId = meta.orgId ?? '';
    if (!orgIds.includes(orgId)) return 'ignored: unknown workspace';
    await recordCancellation(store, orgId, 'stripe', String(o.id), 'stripe');
    return 'recorded cancellation';
  }
  return `ignored: ${event.type}`;
}

// ── PayPal ──────────────────────────────────────────────────────────────────

const paypalBase = (env: PayEnv) => (val(env.PAYPAL_ENV).toLowerCase() === 'live' ? 'https://api-m.paypal.com' : 'https://api-m.sandbox.paypal.com');
export const PAYPAL_PRODUCT_ID = 'SIXXAB-MARKETING';

async function paypalToken(env: PayEnv, fetchImpl: typeof fetch): Promise<string> {
  const basic = btoa(`${val(env.PAYPAL_CLIENT_ID)}:${val(env.PAYPAL_CLIENT_SECRET)}`);
  const res = await fetchImpl(`${paypalBase(env)}/v1/oauth2/token`, {
    method: 'POST', headers: { authorization: `Basic ${basic}`, 'content-type': 'application/x-www-form-urlencoded' }, body: 'grant_type=client_credentials', signal: AbortSignal.timeout(20_000),
  });
  const body = await res.json().catch(() => ({})) as { access_token?: string };
  if (!res.ok || !body.access_token) throw new Error(`PayPal sign-in failed (${res.status}); check the PayPal keys`);
  return body.access_token;
}

async function paypalCall<T>(env: PayEnv, token: string, path: string, init: { method?: string; json?: unknown; requestId?: string }, fetchImpl: typeof fetch): Promise<{ status: number; body: T }> {
  const res = await fetchImpl(`${paypalBase(env)}${path}`, {
    method: init.method ?? (init.json ? 'POST' : 'GET'),
    headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json', ...(init.requestId ? { 'paypal-request-id': init.requestId } : {}) },
    body: init.json ? JSON.stringify(init.json) : undefined,
    signal: AbortSignal.timeout(20_000),
  });
  const body = await res.json().catch(() => ({})) as T;
  if (!res.ok && res.status !== 404) throw new Error(`PayPal ${res.status}: ${String((body as { message?: string }).message ?? 'request failed').slice(0, 200)}`);
  return { status: res.status, body };
}

/** Finds or creates the PayPal product and the monthly plan for one marketing plan, so nothing needs storing. */
export async function ensurePaypalPlan(env: PayEnv, token: string, plan: MarketingPlan, fetchImpl: typeof fetch): Promise<string> {
  const product = await paypalCall(env, token, `/v1/catalogs/products/${PAYPAL_PRODUCT_ID}`, {}, fetchImpl);
  if (product.status === 404) {
    await paypalCall(env, token, '/v1/catalogs/products', { json: { id: PAYPAL_PRODUCT_ID, name: 'SIXXAB AI Marketing Agency', type: 'SERVICE', category: 'SOFTWARE' }, requestId: `sixxab-product-${PAYPAL_PRODUCT_ID}` }, fetchImpl);
  }
  const name = `${planName(plan)} ${plan.priceUsd} USD`;
  const list = await paypalCall<{ plans?: { id: string; name: string; status: string }[] }>(env, token, `/v1/billing/plans?product_id=${PAYPAL_PRODUCT_ID}&page_size=20`, {}, fetchImpl);
  const found = (list.body.plans ?? []).find((p) => p.name === name && p.status === 'ACTIVE');
  if (found) return found.id;
  const created = await paypalCall<{ id?: string }>(env, token, '/v1/billing/plans', {
    requestId: `sixxab-plan-${plan.id}-${plan.priceUsd}`,
    json: {
      product_id: PAYPAL_PRODUCT_ID, name, status: 'ACTIVE', description: `${plan.name} plan, billed monthly`,
      billing_cycles: [{ frequency: { interval_unit: 'MONTH', interval_count: 1 }, tenure_type: 'REGULAR', sequence: 1, total_cycles: 0, pricing_scheme: { fixed_price: { value: String(plan.priceUsd), currency_code: 'USD' } } }],
      payment_preferences: { auto_bill_outstanding: true, setup_fee_failure_action: 'CANCEL', payment_failure_threshold: 2 },
    },
  }, fetchImpl);
  if (!created.body.id) throw new Error('PayPal did not create the plan');
  return created.body.id;
}

/** Starts a PayPal subscription and returns the page where the customer approves it. */
export async function createPaypalSubscription(env: PayEnv, o: { planId: PlanId; orgId: string; returnUrl: string; cancelUrl: string }, fetchImpl: typeof fetch = fetch): Promise<{ id: string; url: string }> {
  const setup = paymentSetup(env).paypal;
  if (!setup.connected) throw new Error(setup.note);
  const plan = checkoutPlan(o.planId);
  const token = await paypalToken(env, fetchImpl);
  const paypalPlanId = await ensurePaypalPlan(env, token, plan, fetchImpl);
  const sub = await paypalCall<{ id?: string; links?: { rel: string; href: string }[] }>(env, token, '/v1/billing/subscriptions', {
    json: {
      plan_id: paypalPlanId, custom_id: `${o.orgId}|${plan.id}`,
      application_context: { brand_name: 'SIXXAB AI', user_action: 'SUBSCRIBE_NOW', shipping_preference: 'NO_SHIPPING', return_url: o.returnUrl, cancel_url: o.cancelUrl },
    },
  }, fetchImpl);
  const url = sub.body.links?.find((l) => l.rel === 'approve')?.href ?? '';
  if (!sub.body.id || !/^https:\/\/(www\.)?(sandbox\.)?paypal\.com\//.test(url)) throw new Error('PayPal did not return an approval page');
  return { id: sub.body.id, url };
}

interface PaypalSubscription { id: string; status?: string; custom_id?: string; subscriber?: { email_address?: string }; billing_info?: { last_payment?: { amount?: { value?: string; currency_code?: string } } } }

const customOrg = (custom: string | undefined) => {
  const [orgId, planId] = String(custom ?? '').split('|');
  return { orgId: orgId ?? '', planId: planId ?? '' };
};

async function recordPaypalSubscription(store: Store, env: PayEnv, s: PaypalSubscription, orgId: string, ref: string, kind: 'first' | 'renewal', by: string): Promise<boolean> {
  const c = customOrg(s.custom_id);
  if (c.orgId !== orgId) throw new Error('This subscription belongs to another workspace');
  if (s.status !== 'ACTIVE') return false;
  const plan = checkoutPlan(c.planId);
  const last = s.billing_info?.last_payment?.amount;
  await recordPayment(store, orgId, {
    provider: 'paypal', ref, subscriptionId: s.id, planId: plan.id, amount: last?.value ? Number(last.value) : plan.priceUsd, currency: last?.currency_code ?? 'USD',
    mode: paymentSetup(env).paypal.mode === 'live' ? 'live' : 'test', kind, payer: s.subscriber?.email_address ?? '',
  }, by);
  return true;
}

/** Records an approved PayPal subscription for this business. Returns false until PayPal shows it active. */
export async function confirmPaypalSubscription(store: Store, env: PayEnv, orgId: string, subscriptionId: string, by: string, fetchImpl: typeof fetch = fetch): Promise<boolean> {
  if (!/^I-[A-Z0-9]{6,40}$/.test(subscriptionId)) throw new Error('That PayPal reference doesn\'t look right');
  const setup = paymentSetup(env).paypal;
  if (!setup.connected) throw new Error(setup.note);
  const token = await paypalToken(env, fetchImpl);
  const s = await paypalCall<PaypalSubscription>(env, token, `/v1/billing/subscriptions/${subscriptionId}`, {}, fetchImpl);
  if (s.status === 404) throw new Error('PayPal has no such subscription');
  return recordPaypalSubscription(store, env, s.body, orgId, subscriptionId, 'first', by);
}

/** Asks PayPal whether a webhook notice really came from it, for this app's webhook. */
export async function verifyPaypalWebhook(env: PayEnv, headers: Headers, rawBody: string, fetchImpl: typeof fetch = fetch): Promise<boolean> {
  const webhookId = val(env.PAYPAL_WEBHOOK_ID);
  if (!webhookId || !paymentSetup(env).paypal.connected) return false;
  let event: unknown;
  try { event = JSON.parse(rawBody); } catch { return false; }
  const h = (k: string) => headers.get(k) ?? '';
  const token = await paypalToken(env, fetchImpl);
  const r = await paypalCall<{ verification_status?: string }>(env, token, '/v1/notifications/verify-webhook-signature', {
    json: { auth_algo: h('paypal-auth-algo'), cert_url: h('paypal-cert-url'), transmission_id: h('paypal-transmission-id'), transmission_sig: h('paypal-transmission-sig'), transmission_time: h('paypal-transmission-time'), webhook_id: webhookId, webhook_event: event },
  }, fetchImpl);
  return r.body.verification_status === 'SUCCESS';
}

interface PaypalEvent { id: string; event_type: string; resource: Record<string, unknown> }

/** Handles a verified PayPal event: activation, monthly payments and cancellations. */
export async function handlePaypalEvent(store: Store, env: PayEnv, event: PaypalEvent, orgIds: string[], fetchImpl: typeof fetch = fetch): Promise<string> {
  const r = event.resource ?? {};
  if (event.event_type === 'BILLING.SUBSCRIPTION.ACTIVATED') {
    const { orgId } = customOrg(r.custom_id as string);
    if (!orgIds.includes(orgId)) return 'ignored: unknown workspace';
    return (await recordPaypalSubscription(store, env, r as unknown as PaypalSubscription, orgId, String(r.id), 'first', 'paypal')) ? 'recorded' : 'not active yet';
  }
  if (event.event_type === 'PAYMENT.SALE.COMPLETED') {
    const subId = String(r.billing_agreement_id ?? '');
    if (!subId) return 'ignored: not a subscription payment';
    const token = await paypalToken(env, fetchImpl);
    const s = (await paypalCall<PaypalSubscription>(env, token, `/v1/billing/subscriptions/${subId}`, {}, fetchImpl)).body;
    const { orgId } = customOrg(s.custom_id);
    if (!orgIds.includes(orgId)) return 'ignored: unknown workspace';
    const firstDone = (await store.listAuditByActions(orgId, ['marketing.payment'])).some((e) => e.detail.provider === 'paypal' && e.detail.subscriptionId === subId);
    const amount = (r.amount ?? {}) as { total?: string; currency?: string };
    const sub = { ...s, billing_info: { last_payment: { amount: { value: amount.total, currency_code: amount.currency } } } };
    await recordPaypalSubscription(store, env, sub, orgId, firstDone ? String(r.id) : subId, firstDone ? 'renewal' : 'first', 'paypal');
    return firstDone ? 'recorded renewal' : 'recorded';
  }
  if (event.event_type === 'BILLING.SUBSCRIPTION.CANCELLED' || event.event_type === 'BILLING.SUBSCRIPTION.EXPIRED') {
    const { orgId } = customOrg(r.custom_id as string);
    if (!orgIds.includes(orgId)) return 'ignored: unknown workspace';
    await recordCancellation(store, orgId, 'paypal', String(r.id), 'paypal');
    return 'recorded cancellation';
  }
  return `ignored: ${event.event_type}`;
}

// ── Razorpay (INR) ──────────────────────────────────────────────────────────
// A Razorpay plan per marketing plan and price (found by its notes, so nothing needs storing), then a subscription whose
// hosted page (short_url) takes UPI AutoPay, cards or netbanking. That page has no return address, so the payment is
// recorded by the webhook, or when the owner presses "Check my payment" back in the app.

const RAZORPAY = 'https://api.razorpay.com/v1';
/** Razorpay needs an end for a subscription: 120 monthly payments (10 years), cancellable any time. */
export const RAZORPAY_TOTAL_COUNT = 120;
const RZP_PAGE = /^https:\/\/(rzp\.io|([a-z0-9-]+\.)?razorpay\.com)\//;

async function razorpayCall<T>(env: PayEnv, path: string, init: { method?: string; json?: unknown }, fetchImpl: typeof fetch): Promise<T> {
  const basic = btoa(`${val(env.RAZORPAY_KEY_ID)}:${val(env.RAZORPAY_KEY_SECRET)}`);
  const res = await fetchImpl(`${RAZORPAY}${path}`, {
    method: init.method ?? (init.json ? 'POST' : 'GET'),
    headers: { authorization: `Basic ${basic}`, 'content-type': 'application/json' },
    body: init.json ? JSON.stringify(init.json) : undefined,
    signal: AbortSignal.timeout(20_000),
  });
  const body = await res.json().catch(() => ({})) as Record<string, unknown>;
  if (res.status === 401) throw new Error('Razorpay sign-in failed; check the Razorpay keys');
  if (!res.ok) throw new Error(`Razorpay ${res.status}: ${String((body.error as { description?: string } | undefined)?.description ?? 'request failed').slice(0, 200)}`);
  return body as T;
}

interface RzpPlan { id: string; period?: string; interval?: number; item?: { amount?: number; currency?: string }; notes?: Record<string, string> | unknown[] }
interface RzpSubscription { id: string; status?: string; paid_count?: number; notes?: Record<string, string> | unknown[]; short_url?: string }
interface RzpPayment { id?: string; amount?: number; currency?: string; email?: string }

/** Razorpay sends empty notes as [] rather than {}. */
const rzpNotes = (n: RzpSubscription['notes']): Record<string, string> => (n && !Array.isArray(n) && typeof n === 'object' ? n : {});

/** Finds or creates the monthly Razorpay plan for one marketing plan at its INR price. */
export async function ensureRazorpayPlan(env: PayEnv, plan: MarketingPlan, fetchImpl: typeof fetch): Promise<string> {
  const amount = Math.round(plan.priceInr * 100);
  if (!(amount > 0)) throw new Error(`${plan.name} has no INR price yet`);
  const list = await razorpayCall<{ items?: RzpPlan[] }>(env, '/plans?count=100', {}, fetchImpl);
  const found = (list.items ?? []).find((p) => p.period === 'monthly' && p.interval === 1 && p.item?.amount === amount && p.item?.currency === 'INR' && rzpNotes(p.notes).sixxab_plan === plan.id);
  if (found) return found.id;
  const created = await razorpayCall<{ id?: string }>(env, '/plans', {
    json: { period: 'monthly', interval: 1, item: { name: planName(plan), amount, currency: 'INR', description: `${plan.name} plan, billed monthly` }, notes: { sixxab_plan: plan.id } },
  }, fetchImpl);
  if (!created.id || !/^plan_\w+$/.test(created.id)) throw new Error('Razorpay did not create the plan');
  return created.id;
}

/** Starts a Razorpay subscription in INR and returns its hosted payment page. */
export async function createRazorpaySubscription(env: PayEnv, o: { planId: PlanId; orgId: string }, fetchImpl: typeof fetch = fetch): Promise<{ id: string; url: string }> {
  const setup = paymentSetup(env).razorpay;
  if (!setup.connected) throw new Error(setup.note);
  const plan = checkoutPlan(o.planId);
  const rzpPlan = await ensureRazorpayPlan(env, plan, fetchImpl);
  const sub = await razorpayCall<RzpSubscription>(env, '/subscriptions', {
    json: { plan_id: rzpPlan, total_count: RAZORPAY_TOTAL_COUNT, quantity: 1, customer_notify: 1, notes: { orgId: o.orgId, plan: plan.id } },
  }, fetchImpl);
  const url = sub.short_url ?? '';
  if (!/^sub_\w+$/.test(sub.id ?? '') || !RZP_PAGE.test(url)) throw new Error('Razorpay did not return a payment page');
  return { id: sub.id, url };
}

/** Records a Razorpay payment once the subscription has been charged. Returns false before the first charge. */
async function recordRazorpay(store: Store, env: PayEnv, s: RzpSubscription, orgId: string, o: { ref: string; kind: 'first' | 'renewal'; payment?: RzpPayment }, by: string): Promise<boolean> {
  const notes = rzpNotes(s.notes);
  if (notes.orgId !== orgId) throw new Error('This subscription belongs to another workspace');
  if (!((s.paid_count ?? 0) >= 1)) return false;
  const plan = checkoutPlan(notes.plan);
  await recordPayment(store, orgId, {
    provider: 'razorpay', ref: o.ref, subscriptionId: s.id, planId: plan.id,
    amount: typeof o.payment?.amount === 'number' ? o.payment.amount / 100 : plan.priceInr, currency: (o.payment?.currency ?? 'INR').toUpperCase(),
    mode: paymentSetup(env).razorpay.mode === 'live' ? 'live' : 'test', kind: o.kind, payer: o.payment?.email ?? '',
  }, by);
  return true;
}

/** Checks a Razorpay subscription for this business and records its first payment. Returns false until it is charged. */
export async function confirmRazorpaySubscription(store: Store, env: PayEnv, orgId: string, subscriptionId: string, by: string, fetchImpl: typeof fetch = fetch): Promise<boolean> {
  if (!/^sub_[A-Za-z0-9]{6,40}$/.test(subscriptionId)) throw new Error('That Razorpay reference doesn\'t look right');
  const setup = paymentSetup(env).razorpay;
  if (!setup.connected) throw new Error(setup.note);
  const s = await razorpayCall<RzpSubscription>(env, `/subscriptions/${subscriptionId}`, {}, fetchImpl);
  return recordRazorpay(store, env, s, orgId, { ref: s.id, kind: 'first' }, by);
}

/** Checks the X-Razorpay-Signature header: the hex HMAC-SHA256 of the raw body with the webhook secret. */
export async function verifyRazorpaySignature(rawBody: string, header: string, secret: string): Promise<boolean> {
  if (!header || !secret) return false;
  const key = await globalThis.crypto.subtle.importKey('raw', enc.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const expected = hex(await globalThis.crypto.subtle.sign('HMAC', key, enc.encode(rawBody)));
  return sameText(header.trim().toLowerCase(), expected);
}

interface RzpEvent { event: string; payload?: { subscription?: { entity?: RzpSubscription }; payment?: { entity?: RzpPayment } } }

/** Handles a verified Razorpay event. The first charge is recorded under the subscription id, so the activation and
 * charge notices for it count once; later charges are renewals under their payment id. */
export async function handleRazorpayEvent(store: Store, env: PayEnv, event: RzpEvent, orgIds: string[]): Promise<string> {
  const s = event.payload?.subscription?.entity;
  if (!s?.id) return `ignored: ${event.event}`;
  const orgId = rzpNotes(s.notes).orgId ?? '';
  if (!orgIds.includes(orgId)) return 'ignored: unknown workspace';
  const payment = event.payload?.payment?.entity;
  if (event.event === 'subscription.activated' || event.event === 'subscription.authenticated') {
    return (await recordRazorpay(store, env, s, orgId, { ref: s.id, kind: 'first', payment }, 'razorpay')) ? 'recorded' : 'not charged yet';
  }
  if (event.event === 'subscription.charged') {
    const first = (s.paid_count ?? 0) <= 1;
    if (!first && !payment?.id) return 'ignored: charge without a payment';
    const ok = await recordRazorpay(store, env, s, orgId, { ref: first ? s.id : String(payment?.id), kind: first ? 'first' : 'renewal', payment }, 'razorpay');
    return !ok ? 'not charged yet' : first ? 'recorded' : 'recorded renewal';
  }
  if (['subscription.cancelled', 'subscription.completed', 'subscription.expired'].includes(event.event)) {
    await recordCancellation(store, orgId, 'razorpay', s.id, 'razorpay');
    return 'recorded cancellation';
  }
  return `ignored: ${event.event}`;
}

export type { Provider };
