// GET /api/me → who is signed in and whether they are an admin (shows the Governance and Billing tabs).
import { isAdmin } from '../../core/automation.js';
import { handle, json, requireUser } from '../context.js';

export const GET = handle(async (request) => {
  const { label } = await requireUser(request);
  return json({ label, admin: isAdmin(label, process.env.ADMIN_EMAILS) });
});
