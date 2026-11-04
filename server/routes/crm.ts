// CRM for the signed-in business. GET /api/crm → contacts, pipeline, totals and the follow-up goal.
// POST /api/crm { action: contact | stage | touch | remove | import, ... }
import { importContacts, loadCrm, logTouch, removeContact, setDealStage, upsertContact, type ContactInput, type DealStage } from '../../core/crm.js';
import { handle, HttpError, json, readJson, requireUser } from '../context.js';

export const GET = handle(async (request) => {
  const { orgId, store } = await requireUser(request);
  return json({ crm: await loadCrm(store, orgId) });
});

interface Body { action?: string; contact?: ContactInput; contactId?: string; stage?: DealStage; note?: string; csv?: string }

export const POST = handle(async (request) => {
  const { orgId, label, store } = await requireUser(request);
  const b = await readJson<Body>(request, 200_000);
  const id = String(b.contactId ?? '');
  try {
    switch (b.action) {
      case 'contact': return json({ crm: await upsertContact(store, orgId, b.contact ?? ({} as ContactInput), label) });
      case 'stage': return json({ crm: await setDealStage(store, orgId, id, b.stage as DealStage, label) });
      case 'touch': return json({ crm: await logTouch(store, orgId, id, String(b.note ?? ''), label) });
      case 'remove': return json({ crm: await removeContact(store, orgId, id, label) });
      case 'import': return json({ ...(await importContacts(store, orgId, String(b.csv ?? ''), label)), crm: await loadCrm(store, orgId) });
      default: throw new HttpError(400, 'Unknown action');
    }
  } catch (e) {
    if (e instanceof HttpError) throw e;
    throw new HttpError(400, e instanceof Error ? e.message : 'Could not update the CRM');
  }
});
