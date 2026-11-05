// CRM for the signed-in business. GET /api/crm → contacts, pipeline, totals and the follow-up goal.
// POST /api/crm { action: contact | stage | touch | qualify | remove | import, ... }
import { importApolloPeople, importContacts, loadCrm, logTouch, qualifyDeal, removeContact, setContactEmail, setDealStage, upsertContact, type ContactInput, type DealStage } from '../../core/crm.js';
import { apolloEnrich, apolloSearch, type ApolloFilters, type ApolloPerson } from '../../core/apollo.js';
import { isAdmin } from '../../core/automation.js';
import { newId, nowIso } from '../../core/store.js';
import { handle, HttpError, json, readJson, requireUser } from '../context.js';

/** Apollo uses SIXXAB's own key and credits, so only admins can search or reveal emails. */
const apolloFor = (label: string) => (isAdmin(label, process.env.ADMIN_EMAILS) && process.env.APOLLO_API_KEY?.trim()) || '';

export const GET = handle(async (request) => {
  const { orgId, label, store } = await requireUser(request);
  return json({ crm: await loadCrm(store, orgId), apollo: Boolean(apolloFor(label)) });
});

interface Body { action?: string; contact?: ContactInput; contactId?: string; stage?: DealStage; note?: string; csv?: string; meddic?: unknown; callNotes?: string; filters?: ApolloFilters; people?: ApolloPerson[] }

export const POST = handle(async (request) => {
  const { orgId, label, store } = await requireUser(request);
  const b = await readJson<Body>(request, 200_000);
  const id = String(b.contactId ?? '');
  try {
    switch (b.action) {
      case 'contact': return json({ crm: await upsertContact(store, orgId, b.contact ?? ({} as ContactInput), label) });
      case 'stage': return json({ crm: await setDealStage(store, orgId, id, b.stage as DealStage, label) });
      case 'touch': return json({ crm: await logTouch(store, orgId, id, String(b.note ?? ''), label) });
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
      default: throw new HttpError(400, 'Unknown action');
    }
  } catch (e) {
    if (e instanceof HttpError) throw e;
    throw new HttpError(400, e instanceof Error ? e.message : 'Could not update the CRM');
  }
});
