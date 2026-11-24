// Research import: business research done outside the app (for example by Claude Duet) arrives as one JSON file
// and is attached to the deals already in the CRM. It never creates a contact. It copies a detail onto the
// customer only when the owner ticked it in the import preview (or presses Add to deal later), never replaces a
// proposal the owner edited or sent, and importing the same file again changes nothing. Nothing is sent.
import { createHash } from 'node:crypto';
import { newId, nowIso, type Store } from './store.js';
import { loadCrm, updateContactFields, type Contact, type ContactInput } from './crm.js';
import { cleanProposal, cleanResearch, FIELD_LABEL, type ImportResult, type ResearchImportSummary } from './research-state.js';
import { mapRows, matchDeal, type MapTarget } from './research-map.js';
export type { ImportResult, ResearchImportSummary } from './research-state.js';
export { companyKey, matchDeal, phoneKey, siteKey } from './research-map.js';

export const RESEARCH_IMPORT_FORMAT = 'sixxab-research/1';
const MAX_REPORTS = 100;

const text = (v: unknown, max: number) => String(v ?? '').trim().slice(0, max);

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

/** The owner's choices from the import preview, by report number (0 for the first report in the file). */
export interface ImportChoices {
  /** The customer each report goes on; '' skips the report. A report not listed is matched automatically. */
  deals?: Record<string, string>;
  /** Which mapping rows (see research-map.ts) to copy onto the customer, for example ["found:0", "profile:painPoints"]. */
  fill?: Record<string, string[]>;
}

/**
 * Attaches each report in the file to its deal: the research report and, when there is one, the proposal draft,
 * then copies the customer details the owner ticked in the preview. Never adds a contact. Same file again:
 * nothing changes. A newer report for the same deal replaces the older one, except a proposal the owner edited
 * or sent, which is kept.
 */
export async function importResearch(store: Store, orgId: string, raw: string, by: string, choices: ImportChoices = {}): Promise<ResearchImportSummary> {
  const reports = parseResearchFile(raw);
  const crm = await loadCrm(store, orgId);
  const contacts = crm.contacts.map((c) => ({ ...c }));
  const results: ImportResult[] = [];
  const record = (action: string, detail: Record<string, unknown>) => store.audit({ id: newId(), orgId, at: nowIso(), actor: by, action, taskId: null, detail });
  const chosen = choices.deals && typeof choices.deals === 'object' ? choices.deals : {};
  const fills = choices.fill && typeof choices.fill === 'object' ? choices.fill : {};

  for (let n = 0; n < reports.length; n++) {
    const r = reports[n];
    const company = text(r.company, 200) || text(r.business, 200);
    const empty = { company, contactId: null, dealName: '', matchedBy: null, filled: [] as string[] };
    let deal: Contact | null;
    let matchedBy: ImportResult['matchedBy'];
    if (Object.prototype.hasOwnProperty.call(chosen, String(n))) {
      const id = text(chosen[String(n)], 64);
      if (!id) {
        results.push({ ...empty, research: 'skipped', proposal: 'none', reason: 'Skipped in the preview' });
        continue;
      }
      deal = contacts.find((c) => c.id === id) ?? null;
      if (!deal) {
        results.push({ ...empty, research: 'unmatched', proposal: 'unmatched', reason: 'That customer is no longer in the CRM; reload and pick again' });
        continue;
      }
      const auto = matchDeal(contacts, { ...r, company });
      matchedBy = auto.deal?.id === deal.id ? auto.by : 'chosen';
    } else {
      const m = matchDeal(contacts, { ...r, company });
      if (!m.deal) {
        results.push({ ...empty, research: 'unmatched', proposal: 'unmatched', reason: m.reason });
        continue;
      }
      deal = m.deal;
      matchedBy = m.by;
    }
    const c = deal;
    const label = c.company || c.name;
    const res: ImportResult = { company, contactId: c.id, dealName: label, matchedBy, research: 'error', proposal: 'none', filled: [], reason: '' };
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

    // Customer details the owner ticked in the preview
    const want = (Array.isArray(fills[String(n)]) ? fills[String(n)] : []).slice(0, 20).map((k) => text(k, 40));
    const report = c.researchReport;
    if (want.length && report && res.research !== 'error') {
      const rows = mapRows(report, c);
      const fields: Partial<Record<MapTarget, string>> = {};
      const used: number[] = [];
      const labels: string[] = [];
      for (const k of want) {
        const row = rows.find((x) => x.key === k);
        if (!row || row.status === 'same' || fields[row.target] !== undefined) continue;
        fields[row.target] = row.value;
        labels.push(row.label);
        if (row.foundIndex !== null) used.push(row.foundIndex);
      }
      if (labels.length) {
        try {
          await updateContactFields(store, orgId, c, fields as Partial<ContactInput>, by, `${label}: ${labels.join(', ').toLowerCase()} filled from the research`);
          Object.assign(c, fields);
          for (const i of used) {
            await record('crm.research_used', { contactId: c.id, researchId: report.id, index: i, summary: `${label}: ${FIELD_LABEL[report.found[i].field].toLowerCase()} added from the research` });
            report.found[i] = { ...report.found[i], usedAt: nowIso() };
          }
          res.filled = labels;
        } catch (e) {
          notes.push(`details not filled: ${e instanceof Error ? e.message : 'could not save them'}`);
        }
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
    unchanged: matched.filter((x) => x.research !== 'saved' && x.proposal !== 'saved' && x.research !== 'error' && !x.filled.length).length,
    detailsFilled: matched.reduce((t, x) => t + x.filled.length, 0),
    skipped: results.filter((x) => x.research === 'skipped').length,
    results,
  };
}
