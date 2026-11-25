// Where a deal came from, in one place for sales and marketing: inbound (the customer came to the business through a form,
// call, WhatsApp, email, walk-in, referral, post, ad or event) or outbound (the business went to them: Apollo, web search,
// LinkedIn, a bought or imported list). Both kinds live in the same CRM and the same deal stages; this module only reads them.
// Pure, with type-only imports, so the sales flow, the marketing flow and the browser can all use it.
import type { Contact } from './crm.js';
import type { Icp } from './leadgen-state.js';

/** Contact sources that mean the customer came to the business. Everything else counts as outbound. */
export const INBOUND_SOURCES = ['website', 'referral', 'whatsapp', 'walk-in', 'event', 'social', 'ads', 'phone', 'email'] as const;
export const SOURCE_LABEL: Record<string, string> = {
  website: 'Website or lead form', referral: 'Referral', whatsapp: 'WhatsApp', 'walk-in': 'Walk-in', event: 'Event', social: 'Social post', ads: 'Paid ad',
  phone: 'Phone call', email: 'Email', linkedin: 'LinkedIn', apollo: 'Apollo', 'web-search': 'Prospect search', other: 'Other or imported list',
};
export const sourceName = (s: string) => SOURCE_LABEL[s] ?? s;

/** The ways an enquiry reaches the business, for the entry point the 24/7 attendant and the owner use. */
export const INBOUND_CHANNELS = ['call', 'whatsapp', 'email', 'chat', 'walk-in', 'form'] as const;
export type InboundChannel = (typeof INBOUND_CHANNELS)[number];
export const CHANNEL_LABEL: Record<InboundChannel, string> = { call: 'Phone call', whatsapp: 'WhatsApp', email: 'Email', chat: 'Website chat', 'walk-in': 'Walk-in', form: 'Lead form' };
/** The CRM source an enquiry's channel files under. */
export const CHANNEL_SOURCE: Record<InboundChannel, string> = { call: 'phone', whatsapp: 'whatsapp', email: 'email', chat: 'website', 'walk-in': 'walk-in', form: 'website' };

export const isInbound = (c: Pick<Contact, 'source'>) => (INBOUND_SOURCES as readonly string[]).includes(c.source);

export interface OriginTotals { leads30: number; open: number; won: number; wonValue: number; lost: number; winRate: number | null }
export interface SourceRow { source: string; label: string; leads: number; won: number }
export interface OriginPipeline { inbound: OriginTotals; outbound: OriginTotals; inboundBySource: SourceRow[] }

const DAY = 864e5;
const OPEN = ['lead', 'contacted', 'qualified', 'proposal'];

function totals(list: Contact[], now: number): OriginTotals {
  const won = list.filter((c) => c.stage === 'won');
  const lost = list.filter((c) => c.stage === 'lost').length;
  return {
    leads30: list.filter((c) => now - Date.parse(c.createdAt) <= 30 * DAY).length,
    open: list.filter((c) => OPEN.includes(c.stage)).length,
    won: won.length, wonValue: won.reduce((s, c) => s + (c.value || 0), 0), lost,
    winRate: won.length + lost ? Math.round((won.length / (won.length + lost)) * 100) : null,
  };
}

/** Inbound against outbound across the whole pipeline, and inbound leads and wins by source. */
export function pipelineByOrigin(contacts: Contact[], now = Date.now()): OriginPipeline {
  const inbound = contacts.filter(isInbound);
  const outbound = contacts.filter((c) => !isInbound(c));
  const rows = new Map<string, SourceRow>();
  for (const c of inbound) {
    const r = rows.get(c.source) ?? { source: c.source, label: sourceName(c.source), leads: 0, won: 0 };
    r.leads++;
    if (c.stage === 'won') r.won++;
    rows.set(c.source, r);
  }
  return { inbound: totals(inbound, now), outbound: totals(outbound, now), inboundBySource: [...rows.values()].sort((a, b) => b.won - a.won || b.leads - a.leads) };
}

/**
 * What sales knows, for the marketing agents: who the business sells to (its first ICP) and which inbound sources turn into
 * customers. Business data only: no names, emails or phone numbers of leads.
 */
export function salesContext(icps: Icp[], contacts: Contact[], now = Date.now()): string {
  const icp = icps[0];
  const p = pipelineByOrigin(contacts, now);
  const lines: string[] = [];
  if (icp) lines.push(`Sales ICP "${icp.name}": ${[icp.summary, icp.industries && `industries ${icp.industries}`, icp.locations && `where ${icp.locations}`, icp.buyer && `buyer ${icp.buyer}`, icp.pains && `pains ${icp.pains}`].filter(Boolean).join('; ').slice(0, 700)}.`);
  if (p.inboundBySource.length) lines.push(`Inbound so far by source (leads, won): ${p.inboundBySource.slice(0, 8).map((r) => `${r.label} ${r.leads}, ${r.won}`).join('; ')}.`);
  if (p.inbound.winRate !== null || p.outbound.winRate !== null) lines.push(`Win rate: inbound ${p.inbound.winRate ?? 'n/a'}%, outbound ${p.outbound.winRate ?? 'n/a'}%.`);
  return lines.length ? `What sales knows:\n${lines.join('\n')}\nPut budget and effort where these sources already turn into customers, and speak to the ICP's pains.` : '';
}
