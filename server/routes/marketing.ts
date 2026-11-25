// AI marketing agency for the signed-in business.
// GET  /api/marketing → the questionnaire, readiness, plan, payment setup and the goals for the Business Assessor and CMO agents.
//                        Admins also get the agency's paying businesses, which are added to their CRM as won deals.
// POST /api/marketing { action: 'save', answers }                 → save the assessment
// POST /api/marketing { action: 'checkout', planId, provider, app? } → a Stripe, PayPal or Razorpay (INR) payment page to send
//                                                                      the browser to; app 'marketing' comes back to the marketing app
// POST /api/marketing { action: 'confirm', provider, ref }          → record a finished checkout when the browser comes back, or when
//                                                                      the owner presses "Check my payment" after Razorpay
// POST /api/marketing { action: 'request_creative', creative }      → queue an image or video ad brief for the studio
// POST /api/marketing { action: 'decide_creative', id, decision }   → approve or reject a finished ad (approving does not publish)
// POST /api/marketing { action: 'draft_posts', creativeId, networks, text } → draft one social post per network from an approved ad
// POST /api/marketing { action: 'discard_post', id }                → drop a draft
// POST /api/marketing { action: 'publish_draft', id, when? }        → the owner's yes for one post: send it now or scheduled
// POST /api/marketing { action: 'lead_form', change: 'off'|'on'|'new' } → turn the public lead form off or on, or give it a new link
// The view also carries the results dashboard (posts, leads, cost per lead, wins), the lead form and the Ads Manager's plan.
// Admin only: { action: 'studio_save', orgId, id, mediaUrl, ... } and { action: 'studio_fail', orgId, id, reason } save a studio
// result for any business; { action: 'publishing_link', orgId, link } links a business to its social accounts in the
// publishing service, and { action: 'publishing_channels' } lists the Postiz channels to pick from. A studio run can do the same with the x-studio-key header (env STUDIO_KEY) and no sign-in:
// GET ?studio=queue lists queued ads across businesses; POST { action: 'studio_result' | 'studio_failed', orgId, ... }.
import { isAdmin } from '../../core/automation.js';
import {
  ASSESSMENT_SECTIONS, MARKETING_PLANS, assessorGoal, cmoPlanGoal, getMarketingPlan, loadMarketing, num, saveAssessment, syncAgencySales, type MarketingState, type PlanId,
} from '../../core/marketing.js';
import { changeLeadForm, cleanOrigin, computeDashboard, ensureLeadForm, formUrl, loadLeads } from '../../core/leads.js';
import { adsGoal, AD_PLATFORMS, loadAdsPlan } from '../../core/ads.js';
import { loadCrm } from '../../core/crm.js';
import { salesContext } from '../../core/channels.js';
import { marketingFlow } from '../../core/marketingflow.js';
import { goLiveChecklist, goLiveEnv } from '../../core/golive.js';
import { creativesGoal, decideCreative, failCreative, loadCreatives, markAdminStudio, requestCreative, saveCreativeResult, studioQueue } from '../../core/creatives.js';
import {
  channelNetworks, discardPost, draftPosts, linkedNetworks, listPostizChannels, loadPublishing, loadPublishLink, publicLink, publishDraft, publishingGoal,
  publishSetup, setPublishLink, type PublishEnv,
} from '../../core/publishing.js';
import {
  confirmPaypalSubscription, confirmRazorpaySubscription, confirmStripeSession, createPaypalSubscription, createRazorpaySubscription, createStripeCheckout,
  paymentSetup, type PayEnv,
} from '../../core/payments.js';
import { loadBusinessProfile } from '../../core/profile.js';
import type { SupabaseStore } from '../../core/supabase-store.js';
import { handle, HttpError, journeyOptions, json, readJson, requireUser, store as platformStore } from '../context.js';

const payEnv = () => process.env as PayEnv;
const pubEnv = () => process.env as PublishEnv;
const rate = () => journeyOptions().inrPerUsd ?? 85;

/** What the business pays a month for marketing, in its own currency: the plan (while active) and the ad budget it set. */
function monthlySpend(m: MarketingState) {
  const sub = m.subscription?.status === 'active' ? m.subscription : null;
  const plan = !sub ? 0 : sub.currency === m.currency ? sub.amount : m.currency === 'INR' ? Math.round(sub.amount * rate()) : Math.round(sub.amount / rate());
  return { plan, ads: num(m.answers, 'adBudget') ?? 0 };
}

/** Paying businesses across the platform, for the admin's agency view. Syncs new ones into the admin's CRM first. */
export async function agencyCustomers(store: SupabaseStore, adminOrgId: string, by: string) {
  const ids = await store.listOrgIds();
  const name = async (id: string) => (await loadBusinessProfile(store, id))?.name ?? null;
  const added = await syncAgencySales(store, adminOrgId, ids, name, by).catch((e) => { console.error('agency sync', e); return 0; });
  const rows = await Promise.all(ids.filter((id) => id !== adminOrgId).map(async (orgId) => {
    const profile = await loadBusinessProfile(store, orgId);
    const m = await loadMarketing(store, orgId, profile, rate());
    if (!m.subscription) return null;
    const [leads, publishing] = await Promise.all([loadLeads(store, orgId), loadPublishing(store, orgId)]);
    const since = Date.now() - 30 * 86_400_000;
    return {
      orgId, name: profile?.name ?? 'Unnamed business', ...m.subscription, readiness: m.readiness.score,
      leads30: leads.leads.filter((l) => !l.repeat && Date.parse(l.at) >= since).length, posted: publishing.posts.filter((p) => p.status === 'sent').length,
    };
  }));
  const customers = rows.filter((r): r is NonNullable<typeof r> => Boolean(r));
  const active = customers.filter((c) => c.status === 'active');
  const live = active.filter((c) => c.mode === 'live');
  const sum = (cur: string) => live.filter((c) => c.currency === cur).reduce((s, c) => s + c.amount, 0);
  const usd = sum('USD');
  const inr = sum('INR');
  const byPlan: Record<string, number> = {};
  for (const c of active) byPlan[c.planName] = (byPlan[c.planName] ?? 0) + 1;
  return {
    customers, added, monthlyLiveUsd: usd, monthlyLiveInr: inr, monthlyLiveTotalUsd: Math.round(usd + inr / rate()),
    active: active.length, live: live.length, test: active.length - live.length, byPlan,
    leads30: customers.reduce((s, c) => s + c.leads30, 0), posted: customers.reduce((s, c) => s + c.posted, 0),
  };
}

/** A Razorpay page opened in the last three days that hasn't been paid yet: the app offers "Check my payment" for it. */
async function pendingRazorpay(store: SupabaseStore, orgId: string, m: MarketingState) {
  const last = (await store.listAuditByActions(orgId, ['marketing.checkout'])).filter((e) => e.detail.provider === 'razorpay').at(-1);
  if (!last || Date.now() - Date.parse(last.at) > 72 * 3_600_000) return null;
  const ref = String(last.detail.ref ?? '');
  if (m.payments.some((p) => p.provider === 'razorpay' && p.subscriptionId === ref)) return null;
  return { ref, planId: String(last.detail.planId ?? ''), at: last.at };
}

/** What the studio needs to know about a business to make its ads. */
async function aboutBusiness(store: SupabaseStore, orgId: string) {
  const profile = await loadBusinessProfile(store, orgId);
  const m = await loadMarketing(store, orgId, profile, rate());
  return { business: profile?.name ?? 'Unnamed business', voice: m.answers.voice ?? '', avoid: m.answers.avoid ?? '' };
}

async function view(store: SupabaseStore, orgId: string, label: string, origin = 'https://sixxab.ai') {
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
  const setup = publishSetup(pubEnv());
  const link = await loadPublishLink(store, orgId);
  const linked = linkedNetworks(link, setup);
  const publishing = await loadPublishing(store, orgId);
  const agency = admin ? await agencyCustomers(store, orgId, label) : null;
  const [leads, crm, adsPlan, pending] = await Promise.all([loadLeads(store, orgId), loadCrm(store, orgId), loadAdsPlan(store, orgId), pendingRazorpay(store, orgId, marketing)]);
  const approved = creatives.creatives.filter((c) => c.status === 'approved');
  const spend = monthlySpend(marketing);
  const dashboard = computeDashboard({
    leads, crm, creatives: creatives.creatives, posts: publishing.posts, currency: marketing.currency,
    ceiling: marketing.cpl.ceiling, target: marketing.cpl.leadsTarget, spend,
  });
  const sales = salesContext(crm.icps, crm.contacts);
  const goals = {
    assessor: assessorGoal(marketing.answers), cmo: cmoPlanGoal(marketing, sales),
    creatives: creativesGoal({ business: profile?.name ?? '', offer: a.services ?? '', bestCustomer: a.bestCustomer ?? '', voice: a.voice ?? '', avoid: a.avoid ?? '', channels: plan.channels, weekFocus: plan.weeks[0]?.focus ?? '', allowance: creatives.allowance }),
    publishing: publishingGoal({ business: profile?.name ?? '', voice: a.voice ?? '', avoid: a.avoid ?? '', creatives: creatives.creatives, posts: publishing.posts, networks: linked.length ? linked : channelNetworks(plan.channels) }),
    ads: adsGoal({ business: profile?.name ?? '', offer: a.services ?? '', bestCustomer: a.bestCustomer ?? '', area: a.location ?? '', currency: marketing.currency, budget: spend.ads, ceiling: marketing.cpl.ceiling, leadsTarget: marketing.cpl.leadsTarget, channels: plan.channels, approved, sales }),
  };
  const payments = paymentSetup(payEnv());
  // The marketing flow's stages and queue, and inbound against outbound from the same CRM the sales flow works.
  const flow = marketingFlow({
    marketing, creatives, posts: publishing.posts, linked: linked.length, publishConnected: setup.connected, leadForm: leads.form, adsPlan, dashboard, contacts: crm.contacts, goals,
  });
  // Admins see the go-live checklist: built from which settings exist (true or false only), never their values.
  const golive = admin ? goLiveChecklist({
    pay: payments, publish: setup, env: goLiveEnv(process.env), origin, leadFormOn: Boolean(leads.form?.on), linkedNetworks: linked.length,
    testPaid: marketing.payments.some((p) => p.mode === 'test') || Boolean(agency?.test),
  }) : null;
  return {
    marketing, plans: MARKETING_PLANS, sections: ASSESSMENT_SECTIONS, payments, pendingRazorpay: pending, inrPerUsd: rate(), creatives,
    flow, golive,
    publishing, publishSetup: setup, publishLink: publicLink(link), linked,
    dashboard, leadForm: leads.form ? { id: leads.form.id, on: leads.form.on, url: formUrl(leads.form) } : null,
    adsPlan, adPlatforms: AD_PLATFORMS,
    goals,
    admin, agency,
    studio: admin ? await studioQueue(store, await store.listOrgIds(), (id) => aboutBusiness(store, id)) : null,
    publishAdmin: admin ? await Promise.all([{ orgId, name: `${profile?.name ?? 'Your workspace'} (yours)` }, ...(agency?.customers ?? [])].map(async (c) => ({ orgId: c.orgId, name: c.name, link: publicLink(await loadPublishLink(store, c.orgId)) }))) : null,
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

/** Where the provider sends the browser back: the workspace's Marketing tab, or the marketing app. */
function returnBase(request: Request, app?: string): string {
  const u = new URL(request.url);
  const local = u.hostname === 'localhost' || u.hostname === '127.0.0.1';
  if (u.protocol !== 'https:' && !local) throw new HttpError(400, 'Checkout needs a secure connection');
  return `${u.protocol}//${u.host}${app === 'marketing' ? '/marketing' : '/app'}`;
}

export const GET = handle(async (request) => {
  if (request.headers.has('x-studio-key')) {
    if (!(await studioKeyOk(request))) throw new HttpError(401, 'Wrong studio key');
    if (new URL(request.url).searchParams.get('studio') !== 'queue') throw new HttpError(400, 'Use ?studio=queue');
    const s = platformStore();
    return json({ queue: await studioQueue(s, await s.listOrgIds(), (id) => aboutBusiness(s, id)) });
  }
  const { orgId, label, store } = await requireUser(request);
  // The lead form is made the first time the Marketing tab opens, at this site's address.
  await ensureLeadForm(store, orgId, siteOrigin(request), label).catch((e) => console.error('lead form', e));
  return json(await view(store, orgId, label, new URL(request.url).origin));
});

/** This site's address (https), for lead form links. */
function siteOrigin(request: Request): string {
  try { return cleanOrigin(request.url); } catch { throw new HttpError(400, 'The lead form needs a secure connection'); }
}

interface Body {
  action?: string; answers?: unknown; planId?: string; provider?: string; ref?: string;
  creative?: Record<string, unknown>; id?: string; decision?: string; note?: string;
  orgId?: string; mediaUrl?: string; model?: string; credits?: number; generationId?: string; reason?: string;
  creativeId?: string; networks?: unknown; text?: string; when?: string; link?: unknown; leadLink?: boolean; change?: string; app?: string;
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
      return json(await view(store, orgId, label, new URL(request.url).origin));
    }
    if (b.action === 'decide_creative') {
      await decideCreative(store, orgId, String(b.id ?? ''), b.decision, b.note, label);
      return json(await view(store, orgId, label, new URL(request.url).origin));
    }
    if (b.action === 'studio_save' || b.action === 'studio_fail') {
      if (!isAdmin(label, process.env.ADMIN_EMAILS)) throw new HttpError(403, 'Only the SIXXAB admin can save studio results');
      await studioWrite(store, b, label, b.action === 'studio_save');
      return json(await view(store, orgId, label, new URL(request.url).origin));
    }
    if (b.action === 'draft_posts') {
      const { form } = await loadLeads(store, orgId);
      await draftPosts(store, orgId, { creativeId: b.creativeId, networks: b.networks, text: b.text, leadLink: b.leadLink && form?.on ? formUrl(form) : undefined }, label);
      return json(await view(store, orgId, label, new URL(request.url).origin));
    }
    if (b.action === 'lead_form') {
      await changeLeadForm(store, orgId, b.change, siteOrigin(request), label);
      return json(await view(store, orgId, label, new URL(request.url).origin));
    }
    if (b.action === 'discard_post') {
      await discardPost(store, orgId, String(b.id ?? ''), label);
      return json(await view(store, orgId, label, new URL(request.url).origin));
    }
    if (b.action === 'publish_draft') {
      // The signed-in owner pressed Publish on this one draft: that press is their yes for this post.
      const post = await publishDraft(store, orgId, String(b.id ?? ''), b.when, pubEnv(), label);
      return json({ post, ...(await view(store, orgId, label, new URL(request.url).origin)) });
    }
    if (b.action === 'publishing_link' || b.action === 'publishing_channels') {
      if (!isAdmin(label, process.env.ADMIN_EMAILS)) throw new HttpError(403, 'Only the SIXXAB admin can link social accounts');
      if (b.action === 'publishing_channels') return json({ channels: await listPostizChannels(pubEnv()) });
      const target = String(b.orgId ?? '');
      if (!(await store.listOrgIds()).includes(target)) throw new HttpError(404, 'No such business');
      await setPublishLink(store, target, b.link, label);
      return json(await view(store, orgId, label, new URL(request.url).origin));
    }
    if (b.action === 'save') {
      await saveAssessment(store, orgId, b.answers, label);
      return json(await view(store, orgId, label, new URL(request.url).origin));
    }
    if (b.action === 'checkout') {
      const plan = getMarketingPlan(b.planId);
      if (!plan) throw new HttpError(400, 'Pick a plan');
      const base = returnBase(request, b.app);
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
      if (b.provider === 'razorpay') {
        const s = await createRazorpaySubscription(payEnv(), { planId: plan.id as PlanId, orgId });
        await store.audit({ id: crypto.randomUUID(), orgId, at: new Date().toISOString(), actor: label, action: 'marketing.checkout', taskId: null, detail: { provider: 'razorpay', planId: plan.id, ref: s.id, summary: `Opened Razorpay checkout for the Marketing ${plan.name} plan in INR` } });
        return json({ url: s.url });
      }
      throw new HttpError(400, 'Pay by card, PayPal or Razorpay');
    }
    if (b.action === 'confirm') {
      const ref = String(b.ref ?? '');
      const paid = b.provider === 'stripe' ? await confirmStripeSession(store, payEnv(), orgId, ref, label)
        : b.provider === 'paypal' ? await confirmPaypalSubscription(store, payEnv(), orgId, ref, label)
          : b.provider === 'razorpay' ? await confirmRazorpaySubscription(store, payEnv(), orgId, ref, label)
            : (() => { throw new HttpError(400, 'Unknown payment provider'); })();
      return json({ paid, ...(await view(store, orgId, label, new URL(request.url).origin)) });
    }
  } catch (e) {
    if (e instanceof HttpError) throw e;
    throw new HttpError(400, e instanceof Error ? e.message : 'Could not update marketing');
  }
  throw new HttpError(400, 'Unknown marketing action');
});
