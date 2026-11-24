// Lead capture for the AI marketing agency. Each business gets one public lead form at <site>/l/<formId>. Links in posts,
// bios and ads carry ?s=<source>&p=<post>&m=paid, so every enquiry lands in the CRM as a deal that says where it came from.
// The form id starts with the business's id (so a visit reads one business's events, never the whole log) and ends with a
// random part; a new link retires the old one. Nothing is sent to the visitor or the business: the lead waits in the CRM.
import { newId, nowIso, type Store } from './store.js';
import { addNewContact, loadCrm, type CrmState, type DealStage } from './crm.js';
import { EMAIL_RE, PHONE_RE } from './research-map.js';
import { NETWORKS, NETWORK_IDS, type Network, type SocialPost } from './publishing.js';
import type { Creative } from './creatives.js';

export const FORM_EVENT = 'leads.form';
export const LEAD_EVENT = 'lead.captured';
export const LEAD_EVENTS = [FORM_EVENT, LEAD_EVENT];
export const LEAD_ACTOR = 'Lead form';

/** Where a lead came from: a social network, a paid ads platform, or the business's own site, email or printed QR code. */
export const LEAD_SOURCES: Record<string, string> = {
  ...Object.fromEntries(NETWORK_IDS.map((n) => [n, NETWORKS[n].label])),
  meta: 'Meta ads', site: 'Your website', email: 'Email', qr: 'QR code', direct: 'Direct link',
};
export const sourceLabel = (s: string) => LEAD_SOURCES[s] ?? 'Direct link';

/** Caps so a flood of fake enquiries can't bury a business's CRM. */
export const LIMITS = { perHour: 30, perDay: 200 };

export interface LeadForm { id: string; on: boolean; origin: string; since: string }
export interface Lead { id: string; at: string; formId: string; source: string; paid: boolean; postId: string; contactId: string; repeat: boolean }
export interface LeadsState { form: LeadForm | null; leads: Lead[] }

const B64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const FORM_ID_RE = /^[A-Za-z0-9_-]{32}$/;

function b64url(bytes: Uint8Array): string {
  let bits = 0, value = 0, out = '';
  for (const b of bytes) {
    value = (value << 8) | b; bits += 8;
    while (bits >= 6) { out += B64[(value >>> (bits - 6)) & 63]; bits -= 6; }
    value &= (1 << bits) - 1;
  }
  return bits > 0 ? out + B64[(value << (6 - bits)) & 63] : out;
}

/** A new public form id for a business: its id in 22 characters, then 10 random ones. */
export function newFormId(orgId: string): string {
  if (!UUID_RE.test(orgId)) throw new Error('Unknown business');
  const hex = orgId.replace(/-/g, '');
  const bytes = new Uint8Array(16);
  for (let i = 0; i < 16; i++) bytes[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  const rand = globalThis.crypto.getRandomValues(new Uint8Array(10));
  return b64url(bytes) + Array.from(rand, (b) => B64[b & 63]).join('');
}

/** The business id inside a form id, or null when it isn't one of ours. */
export function orgFromFormId(formId: string): string | null {
  if (!FORM_ID_RE.test(formId)) return null;
  let bits = 0, value = 0;
  const bytes: number[] = [];
  for (const ch of formId.slice(0, 22)) {
    value = (value << 6) | B64.indexOf(ch); bits += 6;
    if (bits >= 8) { bytes.push((value >>> (bits - 8)) & 255); bits -= 8; value &= (1 << bits) - 1; }
  }
  const hex = bytes.slice(0, 16).map((b) => b.toString(16).padStart(2, '0')).join('');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

/** The site address saved with the form: https only (or localhost while testing), no path. */
export function cleanOrigin(raw: string): string {
  const u = new URL(raw);
  const local = u.hostname === 'localhost' || u.hostname === '127.0.0.1';
  if (u.protocol !== 'https:' && !local) throw new Error('The lead form needs a secure address');
  return `${u.protocol}//${u.host}`;
}

export const formUrl = (f: LeadForm) => `${f.origin}/l/${f.id}`;

export function computeLeads(events: { action: string; at: string; detail: Record<string, unknown> }[]): LeadsState {
  let form: LeadForm | null = null;
  const leads: Lead[] = [];
  for (const e of events) {
    const d = e.detail;
    if (e.action === FORM_EVENT) {
      const prev = form as LeadForm | null;
      const id = String(d.formId ?? '');
      form = { id, on: d.on !== false, origin: String(d.origin ?? ''), since: prev && prev.id === id ? prev.since : e.at };
    }
    if (e.action === LEAD_EVENT) leads.push({
      id: String(d.id ?? ''), at: e.at, formId: String(d.formId ?? ''), source: String(d.source ?? 'direct'), paid: d.paid === true,
      postId: String(d.postId ?? ''), contactId: String(d.contactId ?? ''), repeat: d.repeat === true,
    });
  }
  return { form, leads: leads.reverse() };
}

export async function loadLeads(store: Store, orgId: string): Promise<LeadsState> {
  return computeLeads(await store.listAuditByActions(orgId, LEAD_EVENTS));
}

const formEvent = (store: Store, orgId: string, by: string, formId: string, on: boolean, origin: string, summary: string) =>
  store.audit({ id: newId(), orgId, at: nowIso(), actor: by, action: FORM_EVENT, taskId: null, detail: { formId, on, origin, summary } });

/** Makes the business's lead form the first time its Marketing tab opens. Returns the form. */
export async function ensureLeadForm(store: Store, orgId: string, origin: string, by: string, state?: LeadsState): Promise<LeadForm> {
  const now = state ?? (await loadLeads(store, orgId));
  if (now.form) return now.form;
  const formId = newFormId(orgId);
  const o = cleanOrigin(origin);
  await formEvent(store, orgId, by, formId, true, o, 'Lead form made: enquiries from posts and ads land in the CRM');
  return { id: formId, on: true, origin: o, since: nowIso() };
}

/** Turns the form off or on, or gives it a new link (old links then stop working). */
export async function changeLeadForm(store: Store, orgId: string, change: unknown, origin: string, by: string): Promise<void> {
  const { form } = await loadLeads(store, orgId);
  if (!form) throw new Error('The lead form is not set up yet');
  if (change === 'off') return formEvent(store, orgId, by, form.id, false, form.origin, 'Lead form turned off');
  if (change === 'on') return formEvent(store, orgId, by, form.id, true, form.origin, 'Lead form turned on');
  if (change === 'new') return formEvent(store, orgId, by, newFormId(orgId), true, cleanOrigin(origin), 'Lead form given a new link; the old link stopped working');
  throw new Error('change must be off, on or new');
}

/** The form behind a public id, if it is that business's current form and it is on. */
export async function findOpenForm(store: Store, formId: string): Promise<{ orgId: string; state: LeadsState } | null> {
  const orgId = orgFromFormId(formId);
  if (!orgId) return null;
  const state = await loadLeads(store, orgId);
  return state.form && state.form.id === formId && state.form.on ? { orgId, state } : null;
}

export class LeadLimitError extends Error {}

export interface LeadInput { name?: unknown; email?: unknown; phone?: unknown; message?: unknown; when?: unknown; consent?: unknown; s?: unknown; p?: unknown; m?: unknown }
const text = (v: unknown, max: number) => String(v ?? '').replace(/\s+/g, ' ').trim().slice(0, max);
const digits = (s: string) => s.replace(/\D/g, '');
export const CALL_TIMES = ['Morning', 'Afternoon', 'Evening', 'Any time'];

/** Checks a form entry; returns the clean values or the first problem in plain words. */
export function checkLead(i: LeadInput, healthcare: boolean): { ok: true; lead: { name: string; email: string; phone: string; message: string; source: string; paid: boolean; postRef: string } } | { ok: false; error: string } {
  const name = text(i.name, 120);
  const email = text(i.email, 200).toLowerCase();
  const phone = text(i.phone, 20);
  if (!name) return { ok: false, error: 'Please add your name.' };
  if (!email && !phone) return { ok: false, error: 'Please add an email address or a phone number so they can reach you.' };
  if (email && !EMAIL_RE.test(email)) return { ok: false, error: 'That email address does not look right.' };
  if (phone && !PHONE_RE.test(phone)) return { ok: false, error: 'That phone number does not look right.' };
  if (i.consent !== 'yes' && i.consent !== true) return { ok: false, error: 'Please tick the box so they may contact you.' };
  // A healthcare business gets no free-text box, so no one types symptoms into it; just a good time to call.
  const message = healthcare ? (CALL_TIMES.includes(String(i.when)) ? `Best time to call: ${i.when}` : '') : String(i.message ?? '').trim().slice(0, 1000);
  const s = text(i.s, 20).toLowerCase();
  return { ok: true, lead: { name, email, phone, message, source: s in LEAD_SOURCES ? s : 'direct', paid: i.m === 'paid', postRef: /^[0-9a-f]{8}$/i.test(text(i.p, 8)) ? text(i.p, 8).toLowerCase() : '' } };
}

/**
 * Records one enquiry: a new CRM deal at the lead stage, or a note on the deal that already has this email or phone.
 * The caller has checked the entry with checkLead and found the form open. Throws LeadLimitError past the caps.
 */
export async function captureLead(
  store: Store, orgId: string, state: LeadsState, lead: Extract<ReturnType<typeof checkLead>, { ok: true }>['lead'],
  posts: SocialPost[], now = new Date(),
): Promise<{ contactId: string; repeat: boolean }> {
  const t = now.getTime();
  const lastHour = state.leads.filter((l) => t - Date.parse(l.at) < 3_600_000).length;
  const lastDay = state.leads.filter((l) => t - Date.parse(l.at) < 86_400_000).length;
  if (lastHour >= LIMITS.perHour || lastDay >= LIMITS.perDay) throw new LeadLimitError('Too many enquiries just now');

  const post = lead.postRef ? posts.find((p) => p.id.replace(/-/g, '').toLowerCase().startsWith(lead.postRef)) : undefined;
  const src = sourceLabel(post?.network ?? lead.source);
  const what = post ? `${src} ${lead.paid ? 'ad' : 'post'}${post.headline ? `: ${post.headline}` : ''}` : `${src}${lead.paid ? ' ad' : ''} lead form`;
  const crm = await loadCrm(store, orgId);
  const match = crm.contacts.find((c) => (lead.email && c.email.toLowerCase() === lead.email) || (lead.phone && digits(c.phone).length >= 7 && digits(c.phone) === digits(lead.phone)));
  let contactId: string;
  if (match) {
    contactId = match.id;
    await store.audit({ id: newId(), orgId, at: nowIso(), actor: LEAD_ACTOR, action: 'crm.note', taskId: null, detail: {
      contactId, kind: 'note', note: `Asked again through the ${what}.${lead.message ? ` They wrote: ${lead.message}` : ''}`, summary: `Note on ${match.name}`,
    } });
  } else {
    const network = (post?.network ?? lead.source) as string;
    contactId = await addNewContact(store, orgId, {
      name: lead.name, email: lead.email, phone: lead.phone, notes: lead.message,
      source: lead.paid ? 'ads' : NETWORK_IDS.includes(network as Network) ? 'social' : network === 'site' ? 'website' : 'other',
      sourceDetail: what.slice(0, 200), nextStep: 'Reply within 5 minutes',
    }, LEAD_ACTOR, `New lead from the ${what.slice(0, 120)}`);
  }
  await store.audit({ id: newId(), orgId, at: nowIso(), actor: LEAD_ACTOR, action: LEAD_EVENT, taskId: null, detail: {
    id: newId(), formId: state.form?.id ?? '', source: post?.network ?? lead.source, paid: lead.paid, postId: post?.id ?? '', contactId, repeat: Boolean(match),
    summary: `${match ? 'Repeat enquiry' : 'New lead'} from the ${what.slice(0, 120)}`,
  } });
  return { contactId, repeat: Boolean(match) };
}

// ---------- results dashboard ----------

export interface Dashboard {
  currency: string;
  leads30: number; leadsPrev30: number; leadsMonth: number; target: number | null;
  funnel: { made: number; approved: number; posted: number; leads: number; qualified: number; won: number; wonValue: number };
  bySource: { source: string; label: string; leads: number; won: number }[];
  spend: { plan: number; ads: number; total: number };
  cpl: number | null; ceiling: number | null;
  recent: { at: string; name: string; label: string; stage: DealStage | null; contactId: string; repeat: boolean }[];
  /** New leads per week for the last 8 weeks, oldest first; each week starts on the date given (UTC, Monday). */
  weekly: { start: string; leads: number; won: number }[];
}

/** New leads (and how many of them were won) per week, Monday to Sunday UTC, for the last `weeks` weeks. */
export function weeklyLeads(leads: { at: string; contactId: string; repeat: boolean }[], wonIds: Set<string>, now: Date, weeks = 8): Dashboard['weekly'] {
  const DAY = 86_400_000;
  const today = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  const monday = today - ((now.getUTCDay() + 6) % 7) * DAY;
  const rows = Array.from({ length: weeks }, (_, i) => ({ start: new Date(monday - (weeks - 1 - i) * 7 * DAY).toISOString().slice(0, 10), leads: 0, won: 0 }));
  const first = monday - (weeks - 1) * 7 * DAY;
  for (const l of leads) {
    if (l.repeat) continue;
    const i = Math.floor((Date.parse(l.at) - first) / (7 * DAY));
    if (i < 0 || i >= weeks) continue;
    rows[i].leads++;
    if (wonIds.has(l.contactId)) rows[i].won++;
  }
  return rows;
}

const REACHED: DealStage[] = ['qualified', 'proposal', 'won'];

/** One page of results: what was made and posted, the leads it brought, what each lead cost against the ceiling, and the wins. */
export function computeDashboard(o: {
  leads: LeadsState; crm: CrmState; creatives: Creative[]; posts: SocialPost[];
  currency: string; ceiling: number | null; target: number | null; spend: { plan: number; ads: number }; now?: Date;
}): Dashboard {
  const now = o.now ?? new Date();
  const t = now.getTime();
  const DAY = 86_400_000;
  const fresh = o.leads.leads.filter((l) => !l.repeat);
  const in30 = fresh.filter((l) => t - Date.parse(l.at) < 30 * DAY);
  const prev30 = fresh.filter((l) => { const a = t - Date.parse(l.at); return a >= 30 * DAY && a < 60 * DAY; });
  const monthStart = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1);
  const byId = new Map(o.crm.contacts.map((c) => [c.id, c]));
  const deals = [...new Set(fresh.map((l) => l.contactId))].map((id) => byId.get(id)).filter((c): c is NonNullable<typeof c> => Boolean(c));
  const won = deals.filter((c) => c.stage === 'won');
  const counts = new Map<string, { leads: number; won: number }>();
  for (const l of fresh) {
    const row = counts.get(l.source) ?? { leads: 0, won: 0 };
    row.leads++;
    if (byId.get(l.contactId)?.stage === 'won') row.won++;
    counts.set(l.source, row);
  }
  const total = Math.max(0, o.spend.plan) + Math.max(0, o.spend.ads);
  return {
    currency: o.currency,
    leads30: in30.length, leadsPrev30: prev30.length, leadsMonth: fresh.filter((l) => Date.parse(l.at) >= monthStart).length, target: o.target,
    funnel: {
      made: o.creatives.filter((c) => c.mediaUrl).length, approved: o.creatives.filter((c) => c.status === 'approved').length,
      posted: o.posts.filter((p) => p.status === 'sent').length, leads: deals.length,
      qualified: deals.filter((c) => REACHED.includes(c.stage)).length, won: won.length, wonValue: won.reduce((s, c) => s + c.value, 0),
    },
    bySource: [...counts.entries()].map(([source, r]) => ({ source, label: sourceLabel(source), ...r })).sort((a, b) => b.leads - a.leads),
    spend: { plan: o.spend.plan, ads: o.spend.ads, total },
    cpl: in30.length && total > 0 ? Math.round(total / in30.length) : null, ceiling: o.ceiling,
    recent: o.leads.leads.slice(0, 8).map((l) => {
      const c = byId.get(l.contactId);
      return { at: l.at, name: c?.name ?? 'Removed contact', label: `${sourceLabel(l.source)}${l.paid ? ' ad' : ''}`, stage: c?.stage ?? null, contactId: l.contactId, repeat: l.repeat };
    }),
    weekly: weeklyLeads(o.leads.leads, new Set(won.map((c) => c.id)), now),
  };
}
