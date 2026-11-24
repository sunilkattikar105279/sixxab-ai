// The sales flow's actions: save onboarding plans and account reviews onto a customer, record what the
// owner sent or did, skip an action for a while, switch the autopilot, and the goals for the stage agents.
// Every write is a crm.* audit event. Nothing here sends anything to anyone.
import { newId, nowIso, type Store } from './store.js';
import { loadCrm, type Contact } from './crm.js';
import { cleanOnboarding, cleanReview, CUSTOMER_MSGS, SKIP_DAYS, wasSent, type NextAction } from './salesflow-state.js';
import { scoreGoal, sequenceGoal } from './leadgen.js';

const record = (store: Store, orgId: string, by: string, action: string, detail: Record<string, unknown>) =>
  store.audit({ id: newId(), orgId, at: nowIso(), actor: by, action, taskId: null, detail });
const label = (c: Contact) => c.company || c.name;

async function customerOf(store: Store, orgId: string, contactId: unknown): Promise<Contact> {
  const c = (await loadCrm(store, orgId)).contacts.find((x) => x.id === String(contactId ?? '').trim());
  if (!c) throw new Error(`No deal with id "${String(contactId ?? '')}" in the CRM. Use read_crm to find the right id.`);
  return c;
}

/** Onboarding Manager: saves the onboarding plan (steps, welcome email draft, kickoff agenda) onto a won deal. */
export async function saveOnboarding(store: Store, orgId: string, contactId: unknown, input: Record<string, unknown>, by: string): Promise<string> {
  const c = await customerOf(store, orgId, contactId);
  if (c.stage !== 'won') throw new Error(`${label(c)} is not a won customer yet (stage ${c.stage}). Onboarding starts after the win.`);
  const plan = { id: newId(), ...cleanOnboarding(input) };
  await record(store, orgId, by, 'crm.onboarding', { contactId: c.id, onboarding: plan, summary: `${label(c)}: onboarding plan saved` });
  return `Saved an onboarding plan with ${plan.steps.length} steps${plan.welcome ? ' and a welcome email draft' : ''} on ${label(c)}. Nothing was sent.`;
}

/** Customer Success Manager: saves an account review (health, risks, check-in, renewal, upsell, referral). */
export async function saveAccountReview(store: Store, orgId: string, contactId: unknown, input: Record<string, unknown>, by: string): Promise<string> {
  const c = await customerOf(store, orgId, contactId);
  if (c.stage !== 'won') throw new Error(`${label(c)} is not a customer yet (stage ${c.stage}). Account reviews are for won deals.`);
  const review = { id: newId(), ...cleanReview(input) };
  await record(store, orgId, by, 'crm.account', { contactId: c.id, review, summary: `${label(c)}: account review, health ${review.health}` });
  return `Saved the account review on ${label(c)}: health ${review.health} (${review.band.replace('_', ' ')}). Nothing was sent.`;
}

/** The owner ticks an onboarding step done. */
export async function markOnboardingStep(store: Store, orgId: string, contactId: string, index: number, by: string): Promise<void> {
  const c = await customerOf(store, orgId, contactId);
  const o = c.customer.onboarding;
  if (!o || !o.steps[index]) throw new Error('That onboarding step was not found');
  if (o.steps[index].doneAt) throw new Error('That step is already done');
  await record(store, orgId, by, 'crm.onboarding_step', { contactId: c.id, onboardingId: o.id, index, summary: `${label(c)}: onboarding step done` });
}

/** The owner sent a customer message themselves (welcome, check-in or referral ask) and marks it sent. */
export async function markCustomerSent(store: Store, orgId: string, contactId: string, kind: string, by: string): Promise<void> {
  const c = await customerOf(store, orgId, contactId);
  const k = CUSTOMER_MSGS.find((x) => x === kind);
  if (!k) throw new Error('Unknown message');
  const ref = k === 'welcome' ? c.customer.onboarding?.id : c.customer.review?.id;
  if (!ref) throw new Error('There is no draft of that message on this customer');
  if (wasSent(c.customer, k, ref)) throw new Error('That message is already marked as sent');
  await record(store, orgId, by, 'crm.customer_sent', { contactId: c.id, kind: k, ref, summary: `${label(c)}: ${k} sent` });
}

/** The owner skips a next action for a week (it comes back if it still applies). */
export async function skipAction(store: Store, orgId: string, key: string, by: string, days = SKIP_DAYS): Promise<void> {
  const k = String(key ?? '').trim().slice(0, 200);
  if (!k) throw new Error('Say which action to skip');
  await record(store, orgId, by, 'crm.action_skip', { key: k, until: new Date(Date.now() + days * 864e5).toISOString(), summary: `Next action skipped for ${days} days` });
}

export async function setAutopilot(store: Store, orgId: string, on: boolean, by: string): Promise<void> {
  await record(store, orgId, by, 'crm.autopilot', { on, summary: `Sales autopilot ${on ? 'on' : 'off'}` });
}

// ---- Goals for the stage agents ----

export function onboardingGoal(id: string): string {
  return `Plan the onboarding for this new customer (deal id ${id}). Read the deal with read_crm view "deal" (contactId ${id}) and the ICPs (view "icps") for the voice. Then call save_onboarding once with: 5 to 8 steps over the first 30 days, each with a day number, a short title and who owns it ("you" for the owner, "customer", or "agent" for work an agent can draft); a welcome email from the owner in the first person (subject and text: thank them, confirm what they bought as the record states it, propose the kickoff and say what happens in week one); and a 30-minute kickoff agenda. Write short and warm. Use [DATE], [PRICE] or [First name] where the record does not say; promise nothing the record does not show. These are drafts; nothing is sent.`;
}

export function accountReviewGoal(id: string): string {
  return `Review the health of this customer (deal id ${id}). Read the deal with read_crm view "deal" (contactId ${id}): its history, notes, onboarding progress and any earlier review. Then call save_account_review once with: a health score from 0 to 100 and the reasons (onboarding progress, how recently and how warmly they replied, results or problems in the notes, open issues); the risks; a short check-in message from the owner in the first person that asks one useful question; the renewal date only if the record states one, and a renewal plan; up to three upsell or cross-sell ideas tied to what they bought and their pains; and, only when health is 70 or more, a short referral ask. Base every point on the record and say what is unknown. These are drafts; nothing is sent.`;
}

/** The goal an action's agent runs on, for the autopilot (the app builds the same goals in the browser). */
export function autoGoal(a: NextAction): string {
  const id = a.contactId ?? '';
  return a.rule === 'score' ? scoreGoal([id]) : a.rule === 'sequence' ? sequenceGoal([id]) : a.rule === 'onboard' ? onboardingGoal(id) : a.rule === 'review' ? accountReviewGoal(id) : '';
}
