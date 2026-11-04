// Support desk for the signed-in business. GET /api/support → tickets, totals and the reply goal.
// POST /api/support { action: open | status | note, ... }
import { addTicketNote, loadSupport, openTicket, setTicketStatus, type TicketInput, type TicketStatus } from '../../core/support.js';
import { handle, HttpError, json, readJson, requireUser } from '../context.js';

export const GET = handle(async (request) => {
  const { orgId, store } = await requireUser(request);
  return json({ support: await loadSupport(store, orgId) });
});

interface Body { action?: string; ticket?: TicketInput; ticketId?: string; status?: TicketStatus; note?: string }

export const POST = handle(async (request) => {
  const { orgId, label, store } = await requireUser(request);
  const b = await readJson<Body>(request, 50_000);
  const id = String(b.ticketId ?? '');
  try {
    switch (b.action) {
      case 'open': return json({ support: await openTicket(store, orgId, b.ticket ?? ({} as TicketInput), label) });
      case 'status': return json({ support: await setTicketStatus(store, orgId, id, b.status as TicketStatus, label) });
      case 'note': return json({ support: await addTicketNote(store, orgId, id, String(b.note ?? ''), label) });
      default: throw new HttpError(400, 'Unknown action');
    }
  } catch (e) {
    if (e instanceof HttpError) throw e;
    throw new HttpError(400, e instanceof Error ? e.message : 'Could not update the ticket');
  }
});
