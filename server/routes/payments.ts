// Payment provider webhooks. No sign-in: each notice is checked with the provider before anything is recorded.
// POST /api/payments?provider=stripe   (Stripe-Signature header, STRIPE_WEBHOOK_SECRET)
// POST /api/payments?provider=paypal   (verified with PayPal's verify-webhook-signature API, PAYPAL_WEBHOOK_ID)
// Events handled: first payment, monthly renewals and cancellations of a marketing plan.
import { handlePaypalEvent, handleStripeEvent, verifyPaypalWebhook, verifyStripeSignature, type PayEnv } from '../../core/payments.js';
import { handle, HttpError, json, store } from '../context.js';

const MAX_BODY = 256_000;

export const GET = handle(async () => json({ ok: true, accepts: 'POST from Stripe or PayPal' }));

export const POST = handle(async (request) => {
  const env = process.env as PayEnv;
  const provider = new URL(request.url).searchParams.get('provider');
  const raw = await request.text();
  if (raw.length > MAX_BODY) throw new HttpError(413, 'Request too large');
  if (provider === 'stripe') {
    const secret = env.STRIPE_WEBHOOK_SECRET?.trim();
    if (!secret || !env.STRIPE_SECRET_KEY?.trim()) throw new HttpError(503, 'Card payments are not connected');
    if (!(await verifyStripeSignature(raw, request.headers.get('stripe-signature') ?? '', secret))) throw new HttpError(400, 'Signature check failed');
    const s = store();
    const result = await handleStripeEvent(s, JSON.parse(raw), await s.listOrgIds());
    return json({ received: true, result });
  }
  if (provider === 'paypal') {
    if (!env.PAYPAL_WEBHOOK_ID?.trim()) throw new HttpError(503, 'PayPal is not connected');
    if (!(await verifyPaypalWebhook(env, request.headers, raw))) throw new HttpError(400, 'Signature check failed');
    const s = store();
    const result = await handlePaypalEvent(s, env, JSON.parse(raw), await s.listOrgIds());
    return json({ received: true, result });
  }
  throw new HttpError(404, 'Unknown provider');
});
