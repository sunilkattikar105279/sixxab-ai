// CRM for the signed-in business. GET /api/crm → contacts, pipeline, totals and the follow-up goal.
// POST /api/crm { action: contact | stage | touch | note | qualify | remove | import | icp_* | prospects_decide | sequence_sent | sync_*, ... }
import { addNote, importApolloPeople, importContacts, loadCrm, logTouch, qualifyDeal, removeContact, setContactEmail, setDealStage, upsertContact, type ContactInput, type DealStage } from '../../core/crm.js';
import { apolloEnrich, apolloSearch, type ApolloFilters, type ApolloPerson } from '../../core/apollo.js';
import { isAdmin } from '../../core/automation.js';
import { decideProspects, dismissSync, markStepSent, removeIcp, saveIcp, saveIcpNotes } from '../../core/leadgen.js';
import { markCustomerSent, markOnboardingStep, setAutopilot, skipAction } from '../../core/salesflow.js';
import { editProposal, markProposalSent, useResearchField } from '../../core/research.js';
import type { NextAction } from '../../core/salesflow-state.js';
import { newId, nowIso, type Store } from '../../core/store.js';
import { handle, HttpError, json, readJson, requireUser } from '../context.js';

/** Apollo uses SIXXAB's own key and credits, so only admins can search or reveal emails. */
const apolloFor = (label: string) => (isAdmin(label, process.env.ADMIN_EMAILS) && process.env.APOLLO_API_KEY?.trim()) || '';

/** The CRM plus the sales flow's queue, led by any messages that wait in Approvals. */
async function crmView(store: Store, orgId: string) {
  const [crm, pending] = await Promise.all([loadCrm(store, orgId), store.listApprovals(orgId, 'pending').catch(() => [])]);
  if (pending.length && !crm.flowOrg.skipped.approvals) {
    const n = pending.length;
    const a: NextAction = { key: 'approvals', rule: 'approvals', stage: 'outreach', kind: 'open', title: `${n} message${n === 1 ? '' : 's'} wait for your approval`, why: 'Agents drafted these; nothing goes out until you approve each one in Approvals.', priority: 0, due: nowIso(), count: n };
    crm.nextActions = [a, ...crm.nextActions];
  }
  return crm;
}

export const GET = handle(async (request) => {
  const { orgId, label, store } = await requireUser(request);
  return json({ crm: await crmView(store, orgId), apollo: Boolean(apolloFor(label)), admin: isAdmin(label, process.env.ADMIN_EMAILS) });
});

interface Body {
  action?: string; contact?: ContactInput; contactId?: string; stage?: DealStage; note?: string; kind?: string; csv?: string; meddic?: unknown; callNotes?: string; filters?: ApolloFilters; people?: ApolloPerson[];
  icp?: Record<string, unknown>; icpId?: string; notes?: string; batchId?: string; add?: string[]; dismiss?: string[]; index?: number;
  key?: string; on?: boolean; edit?: Record<string, unknown>;
}

export const POST = handle(async (request) => {
  const { orgId, label, store } = await requireUser(request);
  const b = await readJson<Body>(request, 200_000);
  const id = String(b.contactId ?? '');
  try {
    switch (b.action) {
      case 'contact': return json({ crm: await upsertContact(store, orgId, b.contact ?? ({} as ContactInput), label) });
      case 'stage': return json({ crm: await setDealStage(store, orgId, id, b.stage as DealStage, label) });
      case 'touch': return json({ crm: await logTouch(store, orgId, id, String(b.note ?? ''), label) });
      case 'note': return json({ crm: await addNote(store, orgId, id, String(b.kind ?? 'note'), String(b.note ?? ''), label) });
      case 'qualify': return json({ crm: await qualifyDeal(store, orgId, id, b.meddic, String(b.callNotes ?? ''), label) });
      case 'remove': return json({ crm: await removeContact(store, orgId, id, label) });
      case 'apollo_search': {
        const key = apolloFor(label);
        if (!key) throw new HttpError(403, 'Apollo is available to SIXXAB admins once APOLLO_API_KEY is set');
        return json(await apolloSearch(key, b.filters ?? {}));
      }
      case 'apollo_import': {
        if (!apolloFor(label)) throw new HttpError(403, 'Apollo is available to SIXXAB admins once APOLLO_API_KEY is set');
        return json({ ...(await importApolloPeople(store, orgId, b.people ?? [], label)), crm: await loadCrm(store, orgId) });
      }
      case 'apollo_enrich': {
        const key = apolloFor(label);
        if (!key) throw new HttpError(403, 'Apollo is available to SIXXAB admins once APOLLO_API_KEY is set');
        const c = (await loadCrm(store, orgId)).contacts.find((x) => x.id === id);
        if (!c) throw new HttpError(404, 'Contact not found');
        const r = await apolloEnrich(key, c.apolloId ?? '');
        await store.audit({ id: newId(), orgId, at: nowIso(), actor: label, action: 'apollo.enriched', taskId: null, detail: { contactId: id, found: Boolean(r.email), status: r.status, summary: `Apollo email ${r.email ? 'found' : 'not found'} for ${c.name} (1 credit)` } });
        if (!r.email) return json({ crm: await loadCrm(store, orgId), found: false, status: r.status });
        return json({ crm: await setContactEmail(store, orgId, id, r.email, label), found: true, status: r.status });
      }
      case 'import': return json({ ...(await importContacts(store, orgId, String(b.csv ?? ''), label)), crm: await loadCrm(store, orgId) });
      // Lead generation: the owner's side of the agents' work. Nothing here contacts anyone.
      case 'icp_notes': await saveIcpNotes(store, orgId, String(b.notes ?? ''), label); return json({ crm: await loadCrm(store, orgId) });
      case 'icp_save': await saveIcp(store, orgId, b.icp ?? {}, label); return json({ crm: await loadCrm(store, orgId) });
      case 'icp_remove': await removeIcp(store, orgId, String(b.icpId ?? ''), label); return json({ crm: await loadCrm(store, orgId) });
      case 'prospects_decide': return json({ ...(await decideProspects(store, orgId, String(b.batchId ?? ''), b.add ?? [], b.dismiss ?? [], label)), crm: await loadCrm(store, orgId) });
      case 'sequence_sent': await markStepSent(store, orgId, id, Number(b.index), label); return json({ crm: await loadCrm(store, orgId) });
      case 'sync_dismiss': await dismissSync(store, orgId, id, label); return json({ crm: await loadCrm(store, orgId) });
      case 'sync_apply': {
        const c = (await loadCrm(store, orgId)).contacts.find((x) => x.id === id);
        if (!c?.syncSuggestion) throw new HttpError(404, 'That suggestion is no longer there');
        return json({ crm: await setDealStage(store, orgId, id, c.syncSuggestion.stage as DealStage, label) });
      }
      // Sales flow: the owner's side of the next-action queue. Nothing here contacts anyone.
      case 'customer_sent': await markCustomerSent(store, orgId, id, String(b.kind ?? ''), label); return json({ crm: await crmView(store, orgId) });
      case 'onboarding_step': await markOnboardingStep(store, orgId, id, Number(b.index), label); return json({ crm: await crmView(store, orgId) });
      case 'action_skip': await skipAction(store, orgId, String(b.key ?? ''), label); return json({ crm: await crmView(store, orgId) });
      case 'autopilot': await setAutopilot(store, orgId, Boolean(b.on), label); return json({ crm: await crmView(store, orgId) });
      // Research and proposals: the owner adds a checked detail, edits the proposal, or marks it sent.
      case 'research_use': await useResearchField(store, orgId, id, Number(b.index), label); return json({ crm: await crmView(store, orgId) });
      case 'proposal_edit': await editProposal(store, orgId, id, b.edit ?? {}, label); return json({ crm: await crmView(store, orgId) });
      case 'proposal_sent': await markProposalSent(store, orgId, id, label); return json({ crm: await crmView(store, orgId) });
      default: throw new HttpError(400, 'Unknown action');
    }
  } catch (e) {
    if (e instanceof HttpError) throw e;
    throw new HttpError(400, e instanceof Error ? e.message : 'Could not update the CRM');
  }
});
