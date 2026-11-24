// Business research and proposals: the agents save onto the deal; the owner adds a found detail to the deal,
// edits the proposal and sends it themselves. Every write is a crm.* audit event. Nothing here contacts anyone.
import { newId, nowIso, type Store } from './store.js';
import { loadCrm, upsertContact, type Contact } from './crm.js';
import { APPLY_FIELD, cleanProposal, cleanResearch, FIELD_LABEL, fmtMoney, hostOf } from './research-state.js';

const record = (store: Store, orgId: string, by: string, action: string, detail: Record<string, unknown>) =>
  store.audit({ id: newId(), orgId, at: nowIso(), actor: by, action, taskId: null, detail });
const label = (c: Contact) => c.company || c.name;

async function dealOf(store: Store, orgId: string, contactId: unknown): Promise<Contact> {
  const c = (await loadCrm(store, orgId)).contacts.find((x) => x.id === String(contactId ?? '').trim());
  if (!c) throw new Error(`No deal with id "${String(contactId ?? '')}" in the CRM. Use read_crm to find the right id.`);
  return c;
}

/** Business Research agent: saves the sourced report onto the deal (it replaces the previous one). */
export async function saveResearch(store: Store, orgId: string, contactId: unknown, input: Record<string, unknown>, by: string): Promise<string> {
  const c = await dealOf(store, orgId, contactId);
  const research = { id: newId(), ...cleanResearch(input) };
  await record(store, orgId, by, 'crm.research', { contactId: c.id, research, summary: `${label(c)}: business research saved` });
  const missing = research.found.filter((f) => APPLY_FIELD[f.field] && !c[APPLY_FIELD[f.field]!]).length;
  return `Saved the research on ${label(c)}: ${research.pains.length} pain points, ${research.opportunities.length} opportunities, ${research.found.length} details with sources${missing ? ` (${missing} the deal is missing; the owner adds them after checking the source)` : ''}. Nothing was sent.`;
}

/** The owner checked the source and adds a found detail to the deal. */
export async function useResearchField(store: Store, orgId: string, contactId: string, index: number, by: string): Promise<void> {
  const c = await dealOf(store, orgId, contactId);
  const r = c.researchReport;
  const f = r?.found[index];
  if (!r || !f) throw new Error('That detail is no longer in the research');
  if (f.usedAt) throw new Error('That detail is already on the deal');
  const field = APPLY_FIELD[f.field];
  if (!field) throw new Error(`${FIELD_LABEL[f.field]} has no field on the deal; copy it into the notes instead`);
  await upsertContact(store, orgId, { id: c.id, name: c.name, [field]: f.value }, by, `Contact updated from research: ${c.name}`);
  await record(store, orgId, by, 'crm.research_used', { contactId: c.id, researchId: r.id, index, summary: `${label(c)}: ${FIELD_LABEL[f.field].toLowerCase()} added from ${hostOf(f.source)}` });
}

/** Proposal Writer: saves the proposal draft onto the deal; the app works out the ROI. */
export async function saveProposal(store: Store, orgId: string, contactId: unknown, input: Record<string, unknown>, by: string): Promise<string> {
  const c = await dealOf(store, orgId, contactId);
  if (c.stage === 'lost') throw new Error(`${label(c)} is marked lost; reopen the deal before writing a proposal`);
  const proposal = { id: newId(), ...cleanProposal(input) };
  await record(store, orgId, by, 'crm.proposal', { contactId: c.id, proposal, summary: `${label(c)}: proposal drafted` });
  const r = proposal.roi;
  return `Saved the proposal on ${label(c)}. ROI worked out by the app from your lines: net ${fmtMoney(r.netMonthly, proposal.currency)} a month${r.roiPct !== null ? `, first-year return ${r.roiPct}%` : ''}${r.paybackMonths !== null && r.oneTime > 0 ? `, setup pays back in about ${r.paybackMonths} months` : ''}. Nothing was sent; the owner edits and sends it.`;
}

/** The owner edits the proposal: text, subject and the ROI lines (the ROI is worked out again). */
export async function editProposal(store: Store, orgId: string, contactId: string, input: Record<string, unknown>, by: string): Promise<void> {
  const c = await dealOf(store, orgId, contactId);
  const p = c.proposal;
  if (!p) throw new Error('There is no proposal on this deal yet');
  if (p.sentAt) throw new Error('This proposal was already sent; ask the agent for a new one to change it');
  const edit = cleanProposal({ ...p, ...input });
  await record(store, orgId, by, 'crm.proposal_edit', { contactId: c.id, proposalId: p.id, edit, summary: `${label(c)}: proposal edited` });
}

/** The owner sent the proposal themselves and marks it sent. */
export async function markProposalSent(store: Store, orgId: string, contactId: string, by: string): Promise<void> {
  const c = await dealOf(store, orgId, contactId);
  const p = c.proposal;
  if (!p) throw new Error('There is no proposal on this deal yet');
  if (p.sentAt) throw new Error('That proposal is already marked as sent');
  await record(store, orgId, by, 'crm.proposal_sent', { contactId: c.id, proposalId: p.id, summary: `${label(c)}: proposal sent` });
}

// ---- Goals ----

export function researchGoal(id: string): string {
  return `Research this business and its owner from public sources (deal id ${id}). First read the deal with read_crm view "deal" (contactId ${id}) for the owner's name, the company, phone, website and city, and the ICPs (view "icps") for what we sell. Then search the web, eight searches at most: the business's own website, its Google Business or Maps listing, directories and review sites, local news, and the owner's public professional profile. Use the phone number and website to make sure every page is about this business. Then call save_research once with:
- summary: what the business does, where, how long, and size signals;
- owner: the owner's role and public professional background, only as pages state it;
- presence: website quality, booking and contact options, reviews (rating and count), social activity;
- pains: three to six pain points, each with the evidence (for example review complaints about missed calls or slow replies, no online booking, an outdated site) and the page it came from;
- found: contact details the deal is missing (business email, phone, address, website, owner name, owner title, LinkedIn page) only where a page publishes them, each with that page's address; never guess or construct an email address;
- opportunities: two to five ways AI agents would help, each tied to a pain, with the likely impact;
- unknowns: what you could not confirm; sources: the pages you used.
Business information only: skip people-search and reverse-lookup sites, personal social accounts, home addresses and family details, and never open a page behind a login. This is research for the owner; nothing is sent.`;
}

export function proposalDraftGoal(id: string): string {
  return `Draft the proposal for this deal (deal id ${id}). Read the deal with read_crm view "deal" (contactId ${id}); it includes the business research and call notes when there are any. Read the ICPs (view "icps") for the offer, value case and the owner's voice, and recall the business profile for prices. Then call save_proposal once with: a title and email subject; a two-line summary of their situation; three to five opportunities, each tied to a pain from the research or the record, with what we will do and the benefit to them; the ROI as benefit lines (each a monthly amount with its basis written out, for example "8 missed calls a week x 25% booked x $400 average job", marked as an estimate unless it comes from their own numbers) and cost lines (monthly fee and one-time setup from the recorded offer and price; when no price is recorded, give your best estimate and say "price to be set by the owner" in the basis); the currency (USD unless the business is in India, then INR); a plan with a timeline; the next step to sign; and the full proposal text from the owner, in the first person, plain language, two pages at most. Do not write ROI totals in the text: the app works them out from your lines and adds an ROI section with every assumption. Never invent results, customers or guarantees. This is a draft; nothing is sent.`;
}
