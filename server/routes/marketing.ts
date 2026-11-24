// AI marketing agency for the signed-in business.
// GET  /api/marketing → the questionnaire, readiness, plan, payment setup and the goals for the Business Assessor and CMO agents.
//                        Admins also get the agency's paying businesses, which are added to their CRM as won deals.
// POST /api/marketing { action: 'save', answers }                 → save the assessment
// POST /api/marketing { action: 'checkout', planId, provider }      → a Stripe or PayPal checkout page to send the browser to
// POST /api/marketing { action: 'confirm', provider, ref }          → record a finished checkout when the browser comes back
import { isAdmin } from '../../core/automation.js';
import {
  ASSESSMENT_SECTIONS, MARKETING_PLANS, assessorGoal, cmoPlanGoal, getMarketingPlan, loadMarketing, saveAssessment, syncAgencySales, type PlanId,
} from '../../core/marketing.js';
import { confirmPaypalSubscription, confirmStripeSession, createPaypalSubscription, createStripeCheckout, paymentSetup, type PayEnv } from '../../core/payments.js';
import { loadBusinessProfile } from '../../core/profile.js';
import type { SupabaseStore } from '../../core/supabase-store.js';
import { handle, HttpError, journeyOptions, json, readJson, requireUser } from '../context.js';

const payEnv = () => process.env as PayEnv;
const rate = () => journeyOptions().inrPerUsd ?? 85;

/** Paying businesses across the platform, for the admin's agency view. Syncs new ones into the admin's CRM first. */
export async function agencyCustomers(store: SupabaseStore, adminOrgId: string, by: string) {
  const ids = await store.listOrgIds();
  const name = async (id: string) => (await loadBusinessProfile(store, id))?.name ?? null;
  const added = await syncAgencySales(store, adminOrgId, ids, name, by).catch((e) => { console.error('agency sync', e); return 0; });
  const rows = await Promise.all(ids.filter((id) => id !== adminOrgId).map(async (orgId) => {
    const profile = await loadBusinessProfile(store, orgId);
    const m = await loadMarketing(store, orgId, profile, rate());
    if (!m.subscription) return null;
    return { orgId, name: profile?.name ?? 'Unnamed business', ...m.subscription, readiness: m.readiness.score };
  }));
  const customers = rows.filter((r): r is NonNullable<typeof r> => Boolean(r));
  const live = customers.filter((c) => c.mode === 'live' && c.status === 'active');
  return { customers, added, monthlyLiveUsd: live.filter((c) => c.currency === 'USD').reduce((s, c) => s + c.amount, 0) };
}

async function view(store: SupabaseStore, orgId: string, label: string) {
  const profile = await loadBusinessProfile(store, orgId);
  const marketing = await loadMarketing(store, orgId, profile, rate());
  const admin = isAdmin(label, process.env.ADMIN_EMAILS);
  return {
    marketing, plans: MARKETING_PLANS, sections: ASSESSMENT_SECTIONS, payments: paymentSetup(payEnv()),
    goals: { assessor: assessorGoal(marketing.answers), cmo: cmoPlanGoal(marketing) },
    admin, agency: admin ? await agencyCustomers(store, orgId, label) : null,
  };
}

/** Where the provider sends the browser back: this app, on the Marketing tab. */
function returnBase(request: Request): string {
  const u = new URL(request.url);
  const local = u.hostname === 'localhost' || u.hostname === '127.0.0.1';
  if (u.protocol !== 'https:' && !local) throw new HttpError(400, 'Checkout needs a secure connection');
  return `${u.protocol}//${u.host}/app`;
}

export const GET = handle(async (request) => {
  const { orgId, label, store } = await requireUser(request);
  return json(await view(store, orgId, label));
});

interface Body { action?: string; answers?: unknown; planId?: string; provider?: string; ref?: string }

export const POST = handle(async (request) => {
  const { orgId, label, store } = await requireUser(request);
  const b = await readJson<Body>(request);
  try {
    if (b.action === 'save') {
      await saveAssessment(store, orgId, b.answers, label);
      return json(await view(store, orgId, label));
    }
    if (b.action === 'checkout') {
      const plan = getMarketingPlan(b.planId);
      if (!plan) throw new HttpError(400, 'Pick a plan');
      const base = returnBase(request);
      const cancelUrl = `${base}?marketing=cancelled`;
      if (b.provider === 'stripe') {
        const s = await createStripeCheckout(payEnv(), { planId: plan.id as PlanId, orgId, email: label.includes('@') ? label : undefined, successUrl: `${base}?marketing=stripe&ref={CHECKOUT_SESSION_ID}`, cancelUrl });
        await store.audit({ id: crypto.randomUUID(), orgId, at: new Date().toISOString(), actor: label, action: 'marketing.checkout', taskId: null, detail: { provider: 'stripe', planId: plan.id, ref: s.id, summary: `Opened card checkout for the Marketing ${plan.name} plan` } });
        return json({ url: s.url });
      }
      if (b.provider === 'paypal') {
        const s = await createPaypalSubscription(payEnv(), { planId: plan.id as PlanId, orgId, returnUrl: `${base}?marketing=paypal`, cancelUrl });
        await store.audit({ id: crypto.randomUUID(), orgId, at: new Date().toISOString(), actor: label, action: 'marketing.checkout', taskId: null, detail: { provider: 'paypal', planId: plan.id, ref: s.id, summary: `Opened PayPal checkout for the Marketing ${plan.name} plan` } });
        return json({ url: s.url });
      }
      throw new HttpError(400, 'Pay by card or PayPal');
    }
    if (b.action === 'confirm') {
      const ref = String(b.ref ?? '');
      const paid = b.provider === 'stripe' ? await confirmStripeSession(store, payEnv(), orgId, ref, label)
        : b.provider === 'paypal' ? await confirmPaypalSubscription(store, payEnv(), orgId, ref, label)
          : (() => { throw new HttpError(400, 'Unknown payment provider'); })();
      return json({ paid, ...(await view(store, orgId, label)) });
    }
  } catch (e) {
    if (e instanceof HttpError) throw e;
    throw new HttpError(400, e instanceof Error ? e.message : 'Could not update marketing');
  }
  throw new HttpError(400, 'action must be save, checkout or confirm');
});
