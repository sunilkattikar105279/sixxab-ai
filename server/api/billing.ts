// Admin only (ADMIN_EMAILS): plans and invoices for every business.
// GET  /api/billing                                         → businesses with their plan and invoices
// POST /api/billing { action: 'plan', orgId, name, monthlyFee, currency }
// POST /api/billing { action: 'draft', orgId, period }       → draft (or return) that month's invoice
// POST /api/billing { action: 'status', orgId, invoiceId, status: 'sent' | 'paid' | 'void' }
import { draftInvoice, listInvoices, loadPlan, setInvoiceStatus, setPlan } from '../../core/billing.js';
import { loadBusinessProfile } from '../../core/profile.js';
import { handle, HttpError, json, readJson, requireAdmin, requireUser } from '../context.js';

export const GET = handle(async (request) => {
  const { label, store } = await requireUser(request);
  requireAdmin(label);
  const ids = await store.listOrgIds();
  const businesses = await Promise.all(ids.map(async (orgId) => {
    const [profile, plan, invoices] = await Promise.all([loadBusinessProfile(store, orgId), loadPlan(store, orgId), listInvoices(store, orgId)]);
    return { orgId, name: profile?.name ?? null, location: profile?.location ?? null, plan, invoices };
  }));
  return json({ businesses });
});

export const POST = handle(async (request) => {
  const { label, store } = await requireUser(request);
  requireAdmin(label);
  const b = await readJson<{ action?: string; orgId?: string; name?: string; monthlyFee?: number | string; currency?: string; period?: string; invoiceId?: string; status?: string }>(request);
  if (!b.orgId || !(await store.listOrgIds()).includes(b.orgId)) throw new HttpError(404, 'Business not found');
  try {
    if (b.action === 'plan') {
      await setPlan(store, b.orgId, { name: String(b.name ?? ''), monthlyFee: Number(String(b.monthlyFee ?? '').replace(/,/g, '')), currency: String(b.currency ?? '') }, label);
      return json({ plan: await loadPlan(store, b.orgId) });
    }
    if (b.action === 'draft') return json({ invoice: await draftInvoice(store, b.orgId, String(b.period ?? ''), label) });
    if (b.action === 'status' && b.invoiceId) return json({ invoice: await setInvoiceStatus(store, b.orgId, b.invoiceId, b.status as 'sent', label) });
  } catch (e) {
    throw new HttpError(400, e instanceof Error ? e.message : 'Could not update billing');
  }
  throw new HttpError(400, 'action must be plan, draft or status');
});
