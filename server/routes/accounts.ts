// Accounting ledger for the signed-in business, in its profile currency.
// GET /api/accounts → entries, monthly profit and loss, this month's costs and the review goal.
// POST /api/accounts { action: entry | remove, ... }
import { addEntry, loadAccounts, removeEntry, type EntryInput } from '../../core/accounting.js';
import { loadBusinessProfile } from '../../core/profile.js';
import { handle, HttpError, json, readJson, requireUser } from '../context.js';

export const GET = handle(async (request) => {
  const { orgId, store } = await requireUser(request);
  const currency = (await loadBusinessProfile(store, orgId))?.currency ?? 'USD';
  return json({ accounts: await loadAccounts(store, orgId, currency) });
});

interface Body { action?: string; entry?: EntryInput; entryId?: string }

export const POST = handle(async (request) => {
  const { orgId, label, store } = await requireUser(request);
  const b = await readJson<Body>(request, 20_000);
  const currency = (await loadBusinessProfile(store, orgId))?.currency ?? 'USD';
  try {
    switch (b.action) {
      case 'entry': return json({ accounts: await addEntry(store, orgId, b.entry ?? ({} as EntryInput), label, currency) });
      case 'remove': return json({ accounts: await removeEntry(store, orgId, String(b.entryId ?? ''), label, currency) });
      default: throw new HttpError(400, 'Unknown action');
    }
  } catch (e) {
    if (e instanceof HttpError) throw e;
    throw new HttpError(400, e instanceof Error ? e.message : 'Could not update the books');
  }
});
