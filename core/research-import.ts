// Research import: business research done outside the app (for example by Claude Duet) arrives as one JSON file
// and is attached to the deals already in the CRM. It never creates a contact, never overwrites the deal's own
// fields (a found detail still goes on the deal only when the owner presses Add to deal), never replaces a
// proposal the owner edited or sent, and importing the same file again changes nothing. Nothing is sent.
import { createHash } from 'node:crypto';
import { newId, nowIso, type Store } from './store.js';
import { loadCrm, type Contact } from './crm.js';
import { cleanProposal, cleanResearch, type ImportResult, type ResearchImportSummary } from './research-state.js';
export type { ImportResult, ResearchImportSummary } from './research-state.js';

export const RESEARCH_IMPORT_FORMAT = 'sixxab-research/1';
const MAX_REPORTS = 100;

const text = (v: unknown, max: number) => String(v ?? '').trim().slice(0, max);
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

/** A stable fingerprint of what was imported, so the same report is never attached twice. */
function fingerprint(v: unknown): string {
  const canon = (x: unknown): unknown => (Array.isArray(x) ? x.map(canon) : x && typeof x === 'object' ? Object.fromEntries(Object.keys(x as object).sort().map((k) => [k, canon((x as Record<string, unknown>)[k])])) : x);
  return createHash('sha256').update(JSON.stringify(canon(v))).digest('hex').slice(0, 32);
}

/** Reads the file: { format, reports: [...] } or a bare list of reports. */
export function parseResearchFile(raw: string): Record<string, unknown>[] {
  let data: unknown;
  try {
    data = JSON.parse(String(raw ?? '').replace(/^﻿/, ''));
  } catch {
    throw new Error('That file is not valid JSON. Choose the research file (.json) exactly as it was delivered.');
  }
  const list = Array.isArray(data) ? data : data && typeof data === 'object' ? (data as Record<string, unknown>).reports : null;
  if (!Array.isArray(list)) throw new Error('No reports in that file. A research file has a "reports" list.');
  const reports = list.filter((r) => r && typeof r === 'object') as Record<string, unknown>[];
  if (!reports.length) throw new Error('The research file has no reports in it.');
  if (reports.length > MAX_REPORTS) throw new Error(`A research file can hold up to ${MAX_REPORTS} reports; this one has ${reports.length}. Split it into smaller files.`);
  return reports;
}

/** The one deal a report belongs to: the website first, then the business name, then the main phone. */
export function matchDeal(contacts: Contact[], r: Record<string, unknown>): { deal: Contact | null; by: ImportResult['matchedBy']; reason: string } {
  const company = text(r.company, 200);
  const site = siteKey(r.website);
  const name = companyKey(company);
  const phone = phoneKey(r.phone);
  const pick = (hits: Contact[], by: ImportResult['matchedBy']) => {
    const open = hits.length > 1 ? hits.filter((c) => c.stage !== 'lost') : hits;
    const ids = new Set(open.map((c) => c.id));
    if (ids.size === 1) return { deal: open[0], by, reason: '' };
    return { deal: null, by: null, reason: `${ids.size} deals match ${company || 'this report'}; attach it from the deal by hand` };
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
  return { deal: null, by: null, reason: `No deal in the CRM for ${company || 'this report'}. Import the lead list first, then this file again.` };
}

/**
 * Attaches each report in the file to its deal: the research report and, when there is one, the proposal draft.
 * Never adds a contact. Same file again: nothing changes. A newer report for the same deal replaces the older one,
 * except a proposal the owner edited or sent, which is kept.
 */
export async function importResearch(store: Store, orgId: string, raw: string, by: string): Promise<ResearchImportSummary> {
  const reports = parseResearchFile(raw);
  const crm = await loadCrm(store, orgId);
  const contacts = crm.contacts.map((c) => ({ ...c }));
  const results: ImportResult[] = [];
  const record = (action: string, detail: Record<string, unknown>) => store.audit({ id: newId(), orgId, at: nowIso(), actor: by, action, taskId: null, detail });

  for (const r of reports) {
    const company = text(r.company, 200) || text(r.business, 200);
    const m = matchDeal(contacts, { ...r, company });
    if (!m.deal) {
      results.push({ company, contactId: null, dealName: '', matchedBy: null, research: 'unmatched', proposal: 'unmatched', reason: m.reason });
      continue;
    }
    const c = m.deal;
    const label = c.company || c.name;
    const res: ImportResult = { company, contactId: c.id, dealName: label, matchedBy: m.by, research: 'error', proposal: 'none', reason: '' };
    const notes: string[] = [];

    // Research report
    try {
      const research = cleanResearch((r.research && typeof r.research === 'object' ? r.research : r) as Record<string, unknown>);
      const key = fingerprint(research);
      if (c.researchReport?.importKey === key) {
        res.research = 'same';
      } else {
        const report = { id: newId(), ...research, importKey: key };
        await record('crm.research', { contactId: c.id, research: report, imported: true, summary: `${label}: business research imported` });
        c.researchReport = { ...report, at: nowIso(), by };
        res.research = 'saved';
      }
    } catch (e) {
      notes.push(`research not attached: ${e instanceof Error ? e.message : 'could not read it'}`);
    }

    // Proposal draft
    if (r.proposal && typeof r.proposal === 'object') {
      try {
        const proposal = cleanProposal(r.proposal as Record<string, unknown>);
        const key = fingerprint({ ...proposal, roi: undefined });
        const prev = c.proposal;
        if (prev?.importKey === key) res.proposal = 'same';
        else if (prev?.sentAt) { res.proposal = 'kept_sent'; notes.push('kept the proposal you already sent'); }
        else if (prev?.editedAt) { res.proposal = 'kept_edited'; notes.push('kept the proposal you edited'); }
        else if (c.stage === 'lost') { res.proposal = 'lost'; notes.push('no proposal added because the deal is marked lost'); }
        else {
          const draft = { id: newId(), ...proposal, importKey: key };
          await record('crm.proposal', { contactId: c.id, proposal: draft, imported: true, summary: `${label}: proposal draft imported` });
          c.proposal = { ...draft, at: nowIso(), by, editedAt: null, editedBy: null, sentAt: null };
          res.proposal = 'saved';
        }
      } catch (e) {
        res.proposal = 'error';
        notes.push(`proposal not attached: ${e instanceof Error ? e.message : 'could not read it'}`);
      }
    }
    res.reason = notes.join('; ');
    results.push(res);
  }

  const matched = results.filter((x) => x.contactId);
  return {
    reports: reports.length,
    matched: matched.length,
    researchSaved: matched.filter((x) => x.research === 'saved').length,
    proposalsSaved: matched.filter((x) => x.proposal === 'saved').length,
    unchanged: matched.filter((x) => x.research !== 'saved' && x.proposal !== 'saved' && x.research !== 'error').length,
    results,
  };
}
