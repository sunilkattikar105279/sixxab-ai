// Support desk for the signed-in business. GET /api/support → tickets, totals, the reply goal and the Front Desk settings.
// POST /api/support { action: open | status | note | frontdesk, ... }; frontdesk saves the 24/7 attendant's settings.
import { addTicketNote, loadSupport, openTicket, setTicketStatus, type TicketInput, type TicketStatus } from '../../core/support.js';
import { loadFrontDesk, saveFrontDesk, type FrontDeskSettings } from '../../core/frontdesk.js';
import { handle, HttpError, json, readJson, requireUser } from '../context.js';

export const GET = handle(async (request) => {
  const { orgId, store } = await requireUser(request);
  const [support, frontDesk] = await Promise.all([loadSupport(store, orgId), loadFrontDesk(store, orgId)]);
  return json({ support, frontDesk });
});

interface Body { action?: string; ticket?: TicketInput; ticketId?: string; status?: TicketStatus; note?: string; settings?: Partial<Record<keyof FrontDeskSettings, unknown>> }

export const POST = handle(async (request) => {
  const { orgId, label, store } = await requireUser(request);
  const b = await readJson<Body>(request, 50_000);
  const id = String(b.ticketId ?? '');
  try {
    switch (b.action) {
      case 'open': return json({ support: await openTicket(store, orgId, b.ticket ?? ({} as TicketInput), label) });
      case 'status': return json({ support: await setTicketStatus(store, orgId, id, b.status as TicketStatus, label) });
      case 'note': return json({ support: await addTicketNote(store, orgId, id, String(b.note ?? ''), label) });
      case 'frontdesk': return json({ frontDesk: await saveFrontDesk(store, orgId, b.settings ?? {}, label) });
      default: throw new HttpError(400, 'Unknown action');
    }
  } catch (e) {
    if (e instanceof HttpError) throw e;
    throw new HttpError(400, e instanceof Error ? e.message : 'Could not save that');
  }
});
