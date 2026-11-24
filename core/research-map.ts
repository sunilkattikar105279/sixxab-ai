// Mapping a research report onto a customer's CRM details, pure (no store, no Node built-ins), so the import
// preview in the browser and the import on the server work out the same rows. A row is one CRM field the report
// can fill: a found contact detail (email, phone, address, website, owner, owner title) or a profile field the
// report answers (pain points, offer, research notes). Rows already equal to the customer's detail are "same";
// the owner ticks which of the others to copy, and nothing is copied without that tick.
import type { Contact } from './crm.js';
import { APPLY_FIELD, type BusinessResearch, type ImportResult } from './research-state.js';

const text = (v: unknown, max: number) => String(v ?? '').trim().slice(0, max);
/** The checks a contact's email and phone must pass to be saved (crm.ts uses the same ones). */
export const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
export const PHONE_RE = /^\+?[\d\s()-]{7,20}$/;
const SUFFIX = /\b(the|llc|l l c|inc|incorporated|pllc|pc|p c|plc|co|company|corp|corporation|ltd|limited|lp|llp)\b/g;
/** "The Barber Law Firm, PLLC" and "barber law firm" give the same key. */
export function companyKey(v: unknown): string {
  return text(v, 200).toLowerCase().replace(/&/g, ' and ').replace(/[^a-z0-9 ]+/g, ' ').replace(SUFFIX, ' ').replace(/\s+/g, '');
}
/** "https://www.TotalAir.com/about" and "totalair.com" give "totalair.com". */
export function siteKey(v: unknown): string {
  const s = text(v, 300).toLowerCase();
  if (!s) return '';
  try {
    return new URL(/^[a-z]+:\/\//.test(s) ? s : `https://${s}`).hostname.replace(/^www\./, '');
  } catch { return ''; }
}
/** The last ten digits of a phone number, or '' when it has fewer than ten. */
export function phoneKey(v: unknown): string {
  const d = text(v, 40).replace(/\D/g, '');
  return d.length >= 10 ? d.slice(-10) : '';
}

/** The fields of a deal a report is matched on. */
export type MatchView = Pick<Contact, 'id' | 'name' | 'company' | 'phone'> & { stage: string; website?: string };

/** The one deal a report belongs to: the website first, then the business name, then the main phone. */
export function matchDeal<C extends MatchView>(contacts: C[], r: Record<string, unknown>): { deal: C | null; by: ImportResult['matchedBy']; reason: string } {
  const company = text(r.company, 200);
  const site = siteKey(r.website);
  const name = companyKey(company);
  const phone = phoneKey(r.phone);
  const pick = (hits: C[], by: ImportResult['matchedBy']) => {
    const open = hits.length > 1 ? hits.filter((c) => c.stage !== 'lost') : hits;
    const ids = new Set(open.map((c) => c.id));
    if (ids.size === 1) return { deal: open[0], by, reason: '' };
    return { deal: null, by: null, reason: `${ids.size} deals match ${company || 'this report'}; pick the right one` };
  };
  if (site) {
    const hits = contacts.filter((c) => siteKey(c.website) === site);
    if (hits.length) return pick(hits, 'website');
  }
  if (name) {
    const hits = contacts.filter((c) => companyKey(c.company) === name || (!c.company && companyKey(c.name) === name));
    if (hits.length) return pick(hits, 'name');
  }
  if (phone) {
    const hits = contacts.filter((c) => phoneKey(c.phone) === phone);
    if (hits.length) return pick(hits, 'phone');
  }
  return { deal: null, by: null, reason: `No deal in the CRM for ${company || 'this report'}. Import the lead list first, or pick the customer.` };
}

/** The customer fields a mapping row can fill. */
export type MapTarget = 'email' | 'phone' | 'address' | 'website' | 'name' | 'title' | 'painPoints' | 'offer' | 'research';
export type MapStatus = 'empty' | 'same' | 'different';
export interface MapRow {
  /** "found:2" (the report's third found detail) or "profile:painPoints". */
  key: string;
  target: MapTarget; label: string; value: string; source: string; current: string; status: MapStatus;
  /** For a found detail: its place in the report's found list (marked used once copied). */
  foundIndex: number | null;
}
export type MapCustomer = Partial<Record<MapTarget | 'company', string | null>>;

const TARGET_LABEL: Record<MapTarget, string> = {
  email: 'Email', phone: 'Phone', address: 'Address', website: 'Website', name: 'Contact name', title: 'Contact title',
  painPoints: 'Pain points', offer: 'Offer', research: 'Research notes',
};
const PROFILE_MAX: Record<'painPoints' | 'offer' | 'research', number> = { painPoints: 1000, offer: 500, research: 8000 };

function same(target: MapTarget, a: string, b: string): boolean {
  if (target === 'phone') return !!phoneKey(a) && phoneKey(a) === phoneKey(b);
  if (target === 'website') return !!siteKey(a) && siteKey(a) === siteKey(b);
  const n = (s: string) => s.toLowerCase().replace(/\s+/g, ' ').trim();
  return n(a) === n(b);
}

/** The rows a report can fill on a customer, in report order. */
export function mapRows(research: Pick<BusinessResearch, 'found' | 'pains' | 'opportunities' | 'summary'>, c: MapCustomer | null | undefined): MapRow[] {
  const rows: MapRow[] = [];
  const add = (key: string, target: MapTarget, value: string, source: string, foundIndex: number | null, label = TARGET_LABEL[target]) => {
    if (!value) return;
    // A detail the CRM would refuse is left out, so ticking it can never stop the rest from saving.
    if (target === 'email' && !EMAIL_RE.test(text(value, 200))) return;
    if (target === 'phone' && !PHONE_RE.test(text(value, 20))) return;
    let current = text(c?.[target], 8000);
    // A lead list without a named person stores the business name as the contact name; that counts as empty.
    if (target === 'name' && current && companyKey(current) === companyKey(c?.company)) current = '';
    rows.push({ key, target, label, value, source, current, status: !current ? 'empty' : same(target, value, current) ? 'same' : 'different', foundIndex });
  };
  research.found.forEach((f, i) => {
    const target = APPLY_FIELD[f.field];
    if (!target || f.usedAt) return;
    add(`found:${i}`, target, f.value, f.source, i, target === 'name' ? 'Contact name (owner)' : TARGET_LABEL[target]);
  });
  add('profile:painPoints', 'painPoints', research.pains.map((p) => p.point).filter(Boolean).join('; ').slice(0, PROFILE_MAX.painPoints), '', null);
  add('profile:offer', 'offer', research.opportunities.map((o) => o.title).filter(Boolean).join('; ').slice(0, PROFILE_MAX.offer), '', null);
  add('profile:research', 'research', research.summary.slice(0, PROFILE_MAX.research), '', null);
  return rows;
}

/** What is ticked to start with: each field that is empty on the customer, once (the first value for it). */
export function defaultPicks(rows: MapRow[]): string[] {
  const taken = new Set<MapTarget>();
  const out: string[] = [];
  for (const r of rows) {
    if (r.status !== 'empty' || taken.has(r.target)) continue;
    taken.add(r.target);
    out.push(r.key);
  }
  return out;
}
