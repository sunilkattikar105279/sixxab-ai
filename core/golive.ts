// The marketing agency's go-live checklist, for SIXXAB admins: what is done, what waits on the owner (keys, accounts and
// decisions only they can make) and what waits on the build. Built from which settings exist (true or false only, never their
// values) and from what the workspace already shows, so it stays current without anyone ticking boxes.
import type { PaySetup } from './payments.js';
import type { PublishSetup } from './publishing.js';

export type GoLiveStatus = 'done' | 'todo' | 'decide' | 'optional';
export type GoLiveOwner = 'you' | 'claude';
export interface GoLiveItem { key: string; group: string; title: string; how: string; owner: GoLiveOwner; status: GoLiveStatus }

/** Settings looked at by name only: each is true when it is set. No value ever leaves the server. */
export const GOLIVE_ENV = ['STRIPE_WEBHOOK_SECRET', 'PAYPAL_WEBHOOK_ID', 'RAZORPAY_WEBHOOK_SECRET', 'N8N_WEBHOOK_URL', 'N8N_WEBHOOK_SECRET', 'STUDIO_KEY', 'INBOUND_KEY'] as const;
export type GoLiveEnv = Record<(typeof GOLIVE_ENV)[number], boolean> & { paymentsLive: boolean };

export function goLiveEnv(env: Record<string, string | undefined>): GoLiveEnv {
  const has = (k: string) => Boolean(env[k]?.trim());
  return { ...(Object.fromEntries(GOLIVE_ENV.map((k) => [k, has(k)])) as Record<(typeof GOLIVE_ENV)[number], boolean>), paymentsLive: env.PAYMENTS_LIVE?.trim().toLowerCase() === 'yes' };
}

export interface GoLiveInput {
  pay: PaySetup; publish: PublishSetup; env: GoLiveEnv; origin: string;
  /** A finished checkout in test mode anywhere on the platform. */
  testPaid: boolean; leadFormOn: boolean; linkedNetworks: number;
}

const WEBHOOK = (origin: string, provider: string) => `${origin}/api/payments?provider=${provider}`;

export function goLiveChecklist(i: GoLiveInput): { items: GoLiveItem[]; yours: number; ours: number; done: number } {
  const p = i.pay;
  const anyPay = p.stripe.connected || p.paypal.connected || p.razorpay.connected;
  const allKeys = anyPay && i.publish.connected;
  const items: GoLiveItem[] = [
    { key: 'stripe', group: 'Payments', owner: 'you', status: p.stripe.connected && i.env.STRIPE_WEBHOOK_SECRET ? 'done' : 'todo', title: 'Connect Stripe for cards, Apple Pay and Google Pay',
      how: `Add STRIPE_SECRET_KEY (a test key, sk_test_, first) and STRIPE_WEBHOOK_SECRET in Vercel. Webhook: ${WEBHOOK(i.origin, 'stripe')}. Apple Pay and Google Pay show in Stripe Checkout once you turn them on under Payment methods in Stripe.` },
    { key: 'paypal', group: 'Payments', owner: 'you', status: p.paypal.connected && i.env.PAYPAL_WEBHOOK_ID ? 'done' : 'todo', title: 'Connect PayPal',
      how: `Add PAYPAL_CLIENT_ID, PAYPAL_CLIENT_SECRET and PAYPAL_WEBHOOK_ID in Vercel; PAYPAL_ENV=sandbox while testing. Webhook: ${WEBHOOK(i.origin, 'paypal')}.` },
    { key: 'razorpay', group: 'Payments', owner: 'you', status: p.razorpay.connected && i.env.RAZORPAY_WEBHOOK_SECRET ? 'done' : 'todo', title: 'Connect Razorpay for UPI and Indian cards',
      how: `Open the Razorpay account yourself, then add RAZORPAY_KEY_ID (rzp_test_ first), RAZORPAY_KEY_SECRET and RAZORPAY_WEBHOOK_SECRET in Vercel. Webhook: ${WEBHOOK(i.origin, 'razorpay')} with the subscription activated, authenticated, charged, cancelled, completed and expired events. Live payments need Razorpay's KYC first.` },
    { key: 'policies', group: 'Payments', owner: 'you', status: 'decide', title: 'Decide the refund and cancellation terms',
      how: 'Your terms page says paid plans are 12-month contracts, but marketing plans bill monthly. Payment providers, Razorpay above all, ask for a refund and cancellation policy before going live. Decide the terms you want and the policy page is added to the site.' },
    { key: 'test_checkout', group: 'Payments', owner: 'you', status: i.testPaid ? 'done' : 'todo', title: 'Run one test checkout end to end',
      how: 'After a test key is in: pick a plan in the Marketing tab, pay with a provider test card or UPI test ID, and check the plan shows as active. No real money moves in test mode.' },
    { key: 'live', group: 'Payments', owner: 'you', status: i.env.paymentsLive ? 'done' : 'todo', title: 'Switch payments to live',
      how: 'Only after a test checkout works: swap in the live keys and set PAYMENTS_LIVE=yes in Vercel. Until then live keys are refused, so nobody can be charged by mistake.' },
    { key: 'postiz', group: 'Publishing', owner: 'you', status: i.publish.connected ? 'done' : 'todo', title: 'Connect Postiz for social publishing',
      how: 'Add POSTIZ_API_KEY and POSTIZ_URL (an https address ending in /public/v1) in Vercel.' },
    { key: 'social', group: 'Publishing', owner: 'you', status: i.linkedNetworks ? 'done' : 'todo', title: 'Link your social accounts in Postiz',
      how: 'Connect Facebook, Instagram, LinkedIn and the rest inside Postiz, then pick them under Social publishing. Each post still goes out only when you press Publish.' },
    { key: 'studio', group: 'Ad studio', owner: 'you', status: i.env.STUDIO_KEY ? 'done' : 'optional', title: 'Studio key for unattended ad runs (optional)',
      how: 'Only if you want the studio to run on a schedule: a STUDIO_KEY of 32+ random characters in Vercel. Ask Claude first; without it, ads are made from the admin view.' },
    { key: 'viewmax', group: 'Ad studio', owner: 'you', status: 'decide', title: 'Confirm what a Viewmax credit costs you',
      how: 'Each image or video uses Viewmax credits. The price per credit sets the margin on each plan.' },
    { key: 'setup_fee', group: 'Pricing', owner: 'you', status: 'decide', title: 'Decide on an Agency plan setup fee',
      how: 'Prices are confirmed: $79, $249 and $999 a month, and ₹2,999, ₹9,999 and ₹39,999 (Nov 24). Decide whether Agency also has a one-time setup fee.' },
    { key: 'email', group: 'Leads', owner: 'you', status: i.env.N8N_WEBHOOK_URL && i.env.N8N_WEBHOOK_SECRET ? 'done' : 'todo', title: 'Email sending through n8n',
      how: 'Approved emails go out through your n8n workflow (N8N_WEBHOOK_URL and N8N_WEBHOOK_SECRET).' },
    { key: 'lead_form', group: 'Leads', owner: 'you', status: i.leadFormOn ? 'done' : 'todo', title: 'Lead form on',
      how: 'Every post and ad links to it; enquiries land in the CRM with their source.' },
    { key: 'inbound', group: 'Leads', owner: 'you', status: i.env.INBOUND_KEY ? 'done' : 'optional', title: 'Inbound key for the 24/7 attendant (when it is ready)',
      how: `When the call, WhatsApp or email attendant is set up: an INBOUND_KEY of 32+ random characters in Vercel, and the attendant posts each enquiry to ${i.origin}/api/inbound. Until then that address stays closed.` },
    { key: 'redeploy', group: 'Build', owner: 'claude', status: allKeys ? 'done' : 'todo', title: 'Redeploy and check each provider once your keys are in',
      how: 'Vercel reads new settings only on a new deployment. Claude redeploys, then checks each checkout opens and each webhook answers, in test mode.' },
    { key: 'webhooks', group: 'Build', owner: 'claude', status: i.testPaid ? 'done' : 'todo', title: 'Confirm the payment webhooks record a test payment',
      how: 'After your test checkout: check the payment, the active plan and the won deal in your CRM all appear.' },
  ];
  return {
    items, done: items.filter((x) => x.status === 'done').length,
    yours: items.filter((x) => x.owner === 'you' && x.status !== 'done' && x.status !== 'optional').length,
    ours: items.filter((x) => x.owner === 'claude' && x.status !== 'done').length,
  };
}
