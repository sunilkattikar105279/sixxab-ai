// AI marketing agency for the signed-in business.
// GET  /api/marketing → the questionnaire, readiness, plan, payment setup and the goals for the Business Assessor and CMO agents.
//                        Admins also get the agency's paying businesses, which are added to their CRM as won deals.
// POST /api/marketing { action: 'save', answers }                 → save the assessment
// POST /api/marketing { action: 'checkout', planId, provider }      → a Stripe or PayPal checkout page to send the browser to
// POST /api/marketing { action: 'confirm', provider, ref }          → record a finished checkout when the browser comes back
// POST /api/marketing { action: 'request_creative', creative }      → queue an image or video ad brief for the studio
// POST /api/marketing { action: 'decide_creative', id, decision }   → approve or reject a finished ad (approving does not publish)
// Admin only: { action: 'studio_save', orgId, id, mediaUrl, ... } and { action: 'studio_fail', orgId, id, reason } save a studio
// result for any business. A studio run can do the same with the x-studio-key header (env STUDIO_KEY) and no sign-in:
// GET ?studio=queue lists queued ads across businesses; POST { action: 'studio_result' | 'studio_failed', orgId, ... }.
import { isAdmin } from '../../core/automation.js';
import {
  ASSESSMENT_SECTIONS, MARKETING_PLANS, assessorGoal, cmoPlanGoal, getMarketingPlan, loadMarketing, saveAssessment, syncAgencySales, type PlanId,
} from '../../core/marketing.js';
import { creativesGoal, decideCreative, failCreative, loadCreatives, markAdminStudio, requestCreative, saveCreativeResult, studioQueue } from '../../core/creatives.js';
import { confirmPaypalSubscription, confirmStripeSession, createPaypalSubscription, createStripeCheckout, paymentSetup, type PayEnv } from '../../core/payments.js';
import { loadBusinessProfile } from '../../core/profile.js';
import type { SupabaseStore } from '../../core/supabase-store.js';
import { handle, HttpError, journeyOptions, json, readJson, requireUser, store as platformStore } from '../context.js';

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

/** What the studio needs to know about a business to make its ads. */
async function aboutBusiness(store: SupabaseStore, orgId: string) {
  const profile = await loadBusinessProfile(store, orgId);
  const m = await loadMarketing(store, orgId, profile, rate());
  return { business: profile?.name ?? 'Unnamed business', voice: m.answers.voice ?? '', avoid: m.answers.avoid ?? '' };
}

async function view(store: SupabaseStore, orgId: string, label: string) {
  const profile = await loadBusinessProfile(store, orgId);
  const marketing = await loadMarketing(store, orgId, profile, rate());
  const admin = isAdmin(label, process.env.ADMIN_EMAILS);
  const planId = marketing.subscription?.status === 'active' ? marketing.subscription.planId : null;
  let creatives = await loadCreatives(store, orgId, planId, admin);
  if (admin && !creatives.adminWorkspace) {
    await markAdminStudio(store, orgId, creatives, label);
    creatives = await loadCreatives(store, orgId, planId, admin);
  }
  const plan = marketing.tailored ?? marketing.plan30;
  const a = marketing.answers;
  return {
    marketing, plans: MARKETING_PLANS, sections: ASSESSMENT_SECTIONS, payments: paymentSetup(payEnv()), creatives,
    goals: {
      assessor: assessorGoal(marketing.answers), cmo: cmoPlanGoal(marketing),
      creatives: creativesGoal({ business: profile?.name ?? '', offer: a.services ?? '', bestCustomer: a.bestCustomer ?? '', voice: a.voice ?? '', avoid: a.avoid ?? '', channels: plan.channels, weekFocus: plan.weeks[0]?.focus ?? '', allowance: creatives.allowance }),
    },
    admin, agency: admin ? await agencyCustomers(store, orgId, label) : null,
    studio: admin ? await studioQueue(store, await store.listOrgIds(), (id) => aboutBusiness(store, id)) : null,
  };
}

/** Constant-time check of the studio key; the key must be set and long. */
async function studioKeyOk(request: Request): Promise<boolean> {
  const want = process.env.STUDIO_KEY?.trim() ?? '';
  if (want.length < 32) throw new HttpError(503, "The studio isn't connected yet");
  const enc = new TextEncoder();
  const [x, y] = await Promise.all([crypto.subtle.digest('SHA-256', enc.encode(request.headers.get('x-studio-key') ?? '')), crypto.subtle.digest('SHA-256', enc.encode(want))]);
  const u = new Uint8Array(x), v = new Uint8Array(y);
  let d = 0;
  for (let i = 0; i < u.length; i++) d |= u[i] ^ v[i];
  return d === 0;
}

/** Saves or fails a studio result for one business, after checking that the business exists. */
async function studioWrite(store: SupabaseStore, b: Body, by: string, ok: boolean) {
  const target = String(b.orgId ?? '');
  if (!(await store.listOrgIds()).includes(target)) throw new HttpError(404, 'No such business');
  if (ok) await saveCreativeResult(store, target, { id: b.id, mediaUrl: b.mediaUrl, model: b.model, credits: b.credits, generationId: b.generationId }, by);
  else await failCreative(store, target, String(b.id ?? ''), String(b.reason ?? ''), by);
}

/** Where the provider sends the browser back: this app, on the Marketing tab. */
function returnBase(request: Request): string {
  const u = new URL(request.url);
  const local = u.hostname === 'localhost' || u.hostname === '127.0.0.1';
  if (u.protocol !== 'https:' && !local) throw new HttpError(400, 'Checkout needs a secure connection');
  return `${u.protocol}//${u.host}/app`;
}

export const GET = handle(async (request) => {
  if (request.headers.has('x-studio-key')) {
    if (!(await studioKeyOk(request))) throw new HttpError(401, 'Wrong studio key');
    if (new URL(request.url).searchParams.get('studio') !== 'queue') throw new HttpError(400, 'Use ?studio=queue');
    const s = platformStore();
    return json({ queue: await studioQueue(s, await s.listOrgIds(), (id) => aboutBusiness(s, id)) });
  }
  const { orgId, label, store } = await requireUser(request);
  return json(await view(store, orgId, label));
});

interface Body {
  action?: string; answers?: unknown; planId?: string; provider?: string; ref?: string;
  creative?: Record<string, unknown>; id?: string; decision?: string; note?: string;
  orgId?: string; mediaUrl?: string; model?: string; credits?: number; generationId?: string; reason?: string;
}

export const POST = handle(async (request) => {
  if (request.headers.has('x-studio-key')) {
    if (!(await studioKeyOk(request))) throw new HttpError(401, 'Wrong studio key');
    const b = await readJson<Body>(request);
    if (b.action !== 'studio_result' && b.action !== 'studio_failed') throw new HttpError(400, 'action must be studio_result or studio_failed');
    try { await studioWrite(platformStore(), b, 'Ad studio', b.action === 'studio_result'); } catch (e) {
      if (e instanceof HttpError) throw e;
      throw new HttpError(400, e instanceof Error ? e.message : 'Could not save the studio result');
    }
    return json({ ok: true });
  }
  const { orgId, label, store } = await requireUser(request);
  const b = await readJson<Body>(request);
  try {
    if (b.action === 'request_creative') {
      const m = await loadMarketing(store, orgId, null, rate());
      const planId = m.subscription?.status === 'active' ? m.subscription.planId : null;
      await requestCreative(store, orgId, b.creative ?? {}, await loadCreatives(store, orgId, planId, isAdmin(label, process.env.ADMIN_EMAILS)), label);
      return json(await view(store, orgId, label));
    }
    if (b.action === 'decide_creative') {
      await decideCreative(store, orgId, String(b.id ?? ''), b.decision, b.note, label);
      return json(await view(store, orgId, label));
    }
    if (b.action === 'studio_save' || b.action === 'studio_fail') {
      if (!isAdmin(label, process.env.ADMIN_EMAILS)) throw new HttpError(403, 'Only the SIXXAB admin can save studio results');
      await studioWrite(store, b, label, b.action === 'studio_save');
      return json(await view(store, orgId, label));
    }
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
  throw new HttpError(400, 'Unknown marketing action');
});
