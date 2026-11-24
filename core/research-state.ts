// Business research and proposals on a deal, pure (no store): the Business Research agent's sourced report
// (owner, business, pain points, missing contact details with the page each came from, opportunities) and the
// Proposal Writer's draft (opportunities, benefits and an ROI the app computes from plain assumptions).
// Nothing here sends anything; the owner adds a found detail to the deal or sends the proposal themselves.
import type { AuditEvent } from './types.js';

export const RESEARCH_DEAL_EVENTS = ['crm.research', 'crm.research_used', 'crm.proposal', 'crm.proposal_edit', 'crm.proposal_sent'];

const text = (v: unknown, max: number) => String(v ?? '').trim().slice(0, max);
const list = (v: unknown, max: number): Record<string, unknown>[] => (Array.isArray(v) ? v : []).filter((x) => x && typeof x === 'object').slice(0, max) as Record<string, unknown>[];
/** A public page address, or '' (only http and https, no credentials in the address). */
export function pageUrl(v: unknown): string {
  const s = text(v, 500);
  try {
    const u = new URL(s);
    return (u.protocol === 'https:' || u.protocol === 'http:') && !u.username && !u.password ? u.toString() : '';
  } catch { return ''; }
}

/** Details the research can find, and the deal field each fills when the owner says yes. */
export const FOUND_FIELDS = ['email', 'phone', 'address', 'website', 'owner', 'title', 'linkedin', 'other'] as const;
export type FoundField = (typeof FOUND_FIELDS)[number];
export const APPLY_FIELD: Partial<Record<FoundField, 'email' | 'phone' | 'address' | 'website' | 'name' | 'title'>> = {
  email: 'email', phone: 'phone', address: 'address', website: 'website', owner: 'name', title: 'title',
};
export const FIELD_LABEL: Record<FoundField, string> = { email: 'Email', phone: 'Phone', address: 'Address', website: 'Website', owner: 'Owner', title: 'Owner title', linkedin: 'LinkedIn', other: 'Other' };

export interface Found { field: FoundField; value: string; source: string; note: string; usedAt: string | null }
export interface Pain { point: string; evidence: string; source: string }
export interface Opportunity { title: string; how: string; impact: string }
export interface Source { title: string; url: string }
export interface BusinessResearch {
  id: string; summary: string; owner: string; presence: string;
  pains: Pain[]; found: Found[]; opportunities: Opportunity[]; unknowns: string; sources: Source[];
  at: string; by: string;
}

const EMAIL = /^[^\s@]+@[^\s@]+\.[a-z]{2,}$/i;

/** Validates the Business Research agent's report. A found detail without a page to check it against is dropped. */
export function cleanResearch(input: Record<string, unknown>): Omit<BusinessResearch, 'id' | 'at' | 'by'> {
  const summary = text(input.summary, 2000);
  if (summary.length < 30) throw new Error('The research needs a summary of the business (a few sentences)');
  const pains = list(input.pains ?? input.painPoints, 8).map((p) => ({ point: text(p.point ?? p.title, 200), evidence: text(p.evidence, 500), source: pageUrl(p.source) })).filter((p) => p.point);
  const found = list(input.found ?? input.missing, 12)
    .map((f) => {
      const raw = text(f.field, 20).toLowerCase();
      const field = (FOUND_FIELDS.find((k) => k === raw) ?? (raw === 'name' ? 'owner' : 'other')) as FoundField;
      return { field, value: text(f.value, 200), source: pageUrl(f.source), note: text(f.note, 200), usedAt: null };
    })
    .filter((f) => f.value && f.source && (f.field !== 'email' || EMAIL.test(f.value)));
  const opportunities = list(input.opportunities, 6).map((o) => ({ title: text(o.title, 120), how: text(o.how ?? o.what, 500), impact: text(o.impact ?? o.benefit, 300) })).filter((o) => o.title);
  if (!pains.length && !opportunities.length) throw new Error('The research needs at least one pain point or opportunity');
  const sources = list(input.sources, 15).map((s) => ({ title: text(s.title, 120), url: pageUrl(s.url) })).filter((s) => s.url);
  return { summary, owner: text(input.owner, 1000), presence: text(input.presence, 1000), pains, found, opportunities, unknowns: text(input.unknowns, 1000), sources };
}

// ---- Proposal and ROI ----

export const CURRENCIES = ['USD', 'INR', 'EUR', 'GBP', 'CAD', 'AUD'] as const;
export type Currency = (typeof CURRENCIES)[number];
const SYMBOL: Record<Currency, string> = { USD: '$', INR: '₹', EUR: '€', GBP: '£', CAD: 'C$', AUD: 'A$' };

/** A monthly gain for the customer and the assumption behind it ("8 missed calls a week x 25% booked x $400"). */
export interface BenefitLine { label: string; monthly: number; basis: string }
/** What the customer pays: a monthly fee and/or a one-time setup. */
export interface CostLine { label: string; monthly: number; oneTime: number; basis: string }
export interface Roi { monthlyBenefit: number; monthlyCost: number; oneTime: number; netMonthly: number; firstYearNet: number; roiPct: number | null; paybackMonths: number | null }
export interface ProposalOpp { title: string; what: string; benefit: string }
export interface ProposalDraft {
  id: string; title: string; subject: string; summary: string; opportunities: ProposalOpp[];
  benefits: BenefitLine[]; costs: CostLine[]; currency: Currency; roi: Roi;
  plan: string; nextStep: string; text: string;
  at: string; by: string; editedAt: string | null; editedBy: string | null; sentAt: string | null;
}

const money = (v: unknown) => { const n = Number(String(v ?? '').replace(/[^0-9.-]/g, '')); return Number.isFinite(n) ? Math.max(0, Math.min(1e9, Math.round(n * 100) / 100)) : 0; };
const cleanBenefits = (v: unknown): BenefitLine[] => list(v, 8).map((b) => ({ label: text(b.label, 120), monthly: money(b.monthly), basis: text(b.basis, 300) })).filter((b) => b.label);
const cleanCosts = (v: unknown): CostLine[] => list(v, 6).map((c) => ({ label: text(c.label, 120), monthly: money(c.monthly), oneTime: money(c.oneTime), basis: text(c.basis, 300) })).filter((c) => c.label);

/** The ROI from the lines, worked out by the app (never by the model): first-year return and months to pay back. */
export function computeRoi(benefits: BenefitLine[], costs: CostLine[]): Roi {
  const sum = (xs: number[]) => Math.round(xs.reduce((a, b) => a + b, 0) * 100) / 100;
  const monthlyBenefit = sum(benefits.map((b) => b.monthly));
  const monthlyCost = sum(costs.map((c) => c.monthly));
  const oneTime = sum(costs.map((c) => c.oneTime));
  const netMonthly = Math.round((monthlyBenefit - monthlyCost) * 100) / 100;
  const yearCost = monthlyCost * 12 + oneTime;
  const firstYearNet = Math.round((monthlyBenefit * 12 - yearCost) * 100) / 100;
  const roiPct = yearCost > 0 ? Math.round((firstYearNet / yearCost) * 100) : null;
  const paybackMonths = netMonthly > 0 ? Math.round((oneTime / netMonthly) * 10) / 10 : null;
  return { monthlyBenefit, monthlyCost, oneTime, netMonthly, firstYearNet, roiPct, paybackMonths };
}

export function fmtMoney(n: number, cur: Currency): string {
  const s = SYMBOL[cur] ?? '';
  return `${n < 0 ? '-' : ''}${s}${Math.abs(n).toLocaleString(cur === 'INR' ? 'en-IN' : 'en-US', { maximumFractionDigits: 0 })}`;
}

/** Validates the Proposal Writer's draft (also used for the owner's edits) and works out the ROI. */
export function cleanProposal(input: Record<string, unknown>): Omit<ProposalDraft, 'id' | 'at' | 'by' | 'editedAt' | 'editedBy' | 'sentAt'> {
  const body = text(input.text, 12000);
  if (body.length < 80) throw new Error('The proposal needs its full text (a page or so)');
  const benefits = cleanBenefits(input.benefits);
  const costs = cleanCosts(input.costs);
  if (!benefits.length) throw new Error('The proposal needs at least one benefit line with its basis, for the ROI');
  const cur = text(input.currency, 3).toUpperCase();
  const currency = (CURRENCIES.find((c) => c === cur) ?? 'USD') as Currency;
  const title = text(input.title, 160) || 'Proposal';
  return {
    title, subject: text(input.subject, 160) || title, summary: text(input.summary, 800),
    opportunities: list(input.opportunities, 6).map((o) => ({ title: text(o.title, 120), what: text(o.what ?? o.how, 500), benefit: text(o.benefit ?? o.impact, 300) })).filter((o) => o.title),
    benefits, costs, currency, roi: computeRoi(benefits, costs),
    plan: text(input.plan, 2000), nextStep: text(input.nextStep, 300), text: body,
  };
}

/** The ROI section the app adds to the proposal when it is copied or emailed, with every assumption spelled out. */
export function roiSection(p: Pick<ProposalDraft, 'benefits' | 'costs' | 'currency' | 'roi'>): string {
  const m = (n: number) => fmtMoney(n, p.currency);
  const lines = [
    'Return on investment (estimates; the basis for each number is shown)',
    ...p.benefits.map((b) => `- ${b.label}: ${m(b.monthly)} a month${b.basis ? ` (${b.basis})` : ''}`),
    ...p.costs.map((c) => `- ${c.label}: ${[c.monthly ? `${m(c.monthly)} a month` : '', c.oneTime ? `${m(c.oneTime)} one-time` : ''].filter(Boolean).join(' + ') || m(0)}${c.basis ? ` (${c.basis})` : ''}`),
    `Net gain: ${m(p.roi.netMonthly)} a month; ${m(p.roi.firstYearNet)} in the first year.`,
  ];
  if (p.roi.roiPct !== null) lines.push(`First-year return: ${p.roi.roiPct}% on ${m(p.roi.monthlyCost * 12 + p.roi.oneTime)}.`);
  if (p.roi.paybackMonths !== null && p.roi.oneTime > 0) lines.push(`Setup pays back in about ${p.roi.paybackMonths} month${p.roi.paybackMonths === 1 ? '' : 's'}.`);
  return lines.join('\n');
}

/** The proposal as the owner sends it: their edited text, then the ROI section. */
export function proposalMessage(p: ProposalDraft): string {
  return `${p.text}\n\n${roiSection(p)}`;
}

// ---- Folding events onto a deal ----

export interface DealResearch { researchReport: BusinessResearch | null; proposal: ProposalDraft | null }
export const EMPTY_DEAL_RESEARCH: DealResearch = { researchReport: null, proposal: null };

export function applyResearchEvent(dr: DealResearch, e: AuditEvent): { dr: DealResearch; history?: { kind: string; text: string }; touch?: boolean } {
  const d = e.detail;
  if (e.action === 'crm.research') {
    const r = { ...(d.research as Omit<BusinessResearch, 'at' | 'by'>), at: e.at, by: e.actor };
    return { dr: { ...dr, researchReport: r }, history: { kind: 'research', text: `Business research: ${r.pains.length} pain point${r.pains.length === 1 ? '' : 's'}, ${r.found.length} detail${r.found.length === 1 ? '' : 's'} found, ${r.opportunities.length} opportunit${r.opportunities.length === 1 ? 'y' : 'ies'}` } };
  }
  if (e.action === 'crm.research_used') {
    const r = dr.researchReport;
    const i = Number(d.index);
    if (!r || r.id !== d.researchId || !r.found[i]) return { dr };
    const found = r.found.map((f, j) => (j === i ? { ...f, usedAt: e.at } : f));
    return { dr: { ...dr, researchReport: { ...r, found } }, history: { kind: 'update', text: `Added ${FIELD_LABEL[r.found[i].field].toLowerCase()} from research (${hostOf(r.found[i].source)})` } };
  }
  if (e.action === 'crm.proposal') {
    const p = { ...(d.proposal as Omit<ProposalDraft, 'at' | 'by' | 'editedAt' | 'editedBy' | 'sentAt'>), at: e.at, by: e.actor, editedAt: null, editedBy: null, sentAt: null };
    return { dr: { ...dr, proposal: p }, history: { kind: 'proposal', text: `Proposal drafted: ${p.title}${p.roi.roiPct !== null ? ` (first-year return ${p.roi.roiPct}%)` : ''}` } };
  }
  if (e.action === 'crm.proposal_edit') {
    const p = dr.proposal;
    if (!p || p.id !== d.proposalId) return { dr };
    const edit = d.edit as Omit<ProposalDraft, 'id' | 'at' | 'by' | 'editedAt' | 'editedBy' | 'sentAt'>;
    return { dr: { ...dr, proposal: { ...p, ...edit, editedAt: e.at, editedBy: e.actor } }, history: { kind: 'proposal', text: 'Proposal edited' } };
  }
  if (e.action === 'crm.proposal_sent') {
    const p = dr.proposal;
    if (!p || p.id !== d.proposalId || p.sentAt) return { dr };
    return { dr: { ...dr, proposal: { ...p, sentAt: e.at } }, history: { kind: 'email', text: `Sent proposal: ${p.subject}` }, touch: true };
  }
  return { dr };
}

export function hostOf(url: string): string {
  try { return new URL(url).hostname.replace(/^www\./, ''); } catch { return url.slice(0, 40); }
}

/** The research and proposal as agents read them with read_crm (view "deal"). */
export function researchLines(dr: DealResearch): string[] {
  const out: string[] = [];
  const r = dr.researchReport;
  if (r) {
    out.push(`Business research (${r.at.slice(0, 10)}, by ${r.by}): ${r.summary}`);
    if (r.owner) out.push(`Owner: ${r.owner}`);
    if (r.presence) out.push(`Online presence: ${r.presence}`);
    for (const p of r.pains) out.push(`Pain: ${p.point}${p.evidence ? `. Evidence: ${p.evidence}` : ''}${p.source ? ` (${p.source})` : ''}`);
    for (const f of r.found) out.push(`Found ${FIELD_LABEL[f.field].toLowerCase()}: ${f.value} (${f.source})${f.usedAt ? ', added to the deal' : ', not yet confirmed by the owner'}`);
    for (const o of r.opportunities) out.push(`Opportunity: ${o.title}. ${o.how}${o.impact ? ` Impact: ${o.impact}` : ''}`);
    if (r.unknowns) out.push(`Research could not confirm: ${r.unknowns}`);
  }
  const p = dr.proposal;
  if (p) out.push(`Proposal "${p.title}" (${p.at.slice(0, 10)}${p.sentAt ? `, sent ${p.sentAt.slice(0, 10)}` : ', not sent yet'}): net ${fmtMoney(p.roi.netMonthly, p.currency)} a month${p.roi.roiPct !== null ? `, first-year return ${p.roi.roiPct}%` : ''}.`);
  return out;
}
