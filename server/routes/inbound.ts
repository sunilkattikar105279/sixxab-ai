// The one entry point for enquiries that don't come through the lead form: phone calls, WhatsApp, email, website chat and
// walk-ins. The 24/7 attendant (a phone or WhatsApp bot, an email parser, n8n) posts each one here and it lands in the same
// CRM as every other lead, as a deal at the lead stage with its source, so the sales flow answers it and hands it on.
//
// POST /api/inbound   header x-inbound-key: <INBOUND_KEY>   (server to server; no sign-in)
//   { orgId, channel: call|whatsapp|email|chat|walk-in|form, name?, email?, phone?, message?, when?, ref? }
//   → 200 { ok, contactId, repeat, duplicate }   repeat: the person was already in the CRM (a note is added instead)
//                                                duplicate: this ref was recorded before (a retried webhook), nothing new
//   → 503 until INBOUND_KEY (32+ characters) is set in the environment; 401 on a wrong key; 404 for an unknown business;
//     400 with a plain reason for a bad entry; 429 past 30 enquiries an hour or 200 a day for one business.
// A healthcare business keeps no free text (only "when": Morning, Afternoon, Evening or Any time), so no symptoms are stored.
// Nothing is sent to the person or anyone else here: the deal waits in the CRM for the owner and the Speed-to-Lead agent.
import { captureInbound, checkInbound, LeadLimitError, loadLeads, type InboundInput } from '../../core/leads.js';
import { isHealthcare, loadBusinessProfile } from '../../core/profile.js';
import type { Store } from '../../core/store.js';
import { handle, HttpError, json, readJson, store as platformStore } from '../context.js';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Constant-time check of the inbound key; the key must be set and long. */
export async function inboundKeyOk(given: string, want: string | undefined): Promise<boolean> {
  const w = want?.trim() ?? '';
  if (w.length < 32) throw new HttpError(503, "Inbound capture isn't connected yet");
  const enc = new TextEncoder();
  const [x, y] = await Promise.all([crypto.subtle.digest('SHA-256', enc.encode(given)), crypto.subtle.digest('SHA-256', enc.encode(w))]);
  const u = new Uint8Array(x), v = new Uint8Array(y);
  let d = 0;
  for (let i = 0; i < u.length; i++) d |= u[i] ^ v[i];
  return d === 0;
}

/** The webhook, with the store, the business list and the key passed in so tests can run it on a memory store. */
export async function receiveInbound(request: Request, s: Store, orgIds: () => Promise<string[]>, key: string | undefined, now = new Date()): Promise<Response> {
  if (!(await inboundKeyOk(request.headers.get('x-inbound-key') ?? '', key))) throw new HttpError(401, 'Wrong inbound key');
  const b = await readJson<InboundInput & { orgId?: unknown }>(request, 16_000);
  const orgId = String(b.orgId ?? '');
  if (!UUID_RE.test(orgId) || !(await orgIds()).includes(orgId)) throw new HttpError(404, 'No such business');
  const checked = checkInbound(b, isHealthcare(await loadBusinessProfile(s, orgId)));
  if (!checked.ok) throw new HttpError(400, checked.error);
  try {
    const r = await captureInbound(s, orgId, await loadLeads(s, orgId), checked.lead, { capped: true, now });
    return json({ ok: true, ...r });
  } catch (e) {
    if (e instanceof LeadLimitError) throw new HttpError(429, 'Too many enquiries for this business just now');
    throw e;
  }
}

export const POST = handle((request) => {
  const s = platformStore();
  return receiveInbound(request, s, () => s.listOrgIds(), process.env.INBOUND_KEY);
});
