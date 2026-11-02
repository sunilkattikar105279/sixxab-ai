// GET  /api/approvals            → pending approvals and drafts for the signed-in user's company
// POST /api/approvals  { approvalId, approved, edited?, reason? } → decide, learn, resume the agent
import { decide } from '../../core/runtime.js';
import { deps, handle, HttpError, json, readJson, requireUser } from '../context.js';

export const GET = handle(async (request) => {
  const { orgId, store } = await requireUser(request);
  return json({ approvals: await store.listApprovals(orgId, 'pending') });
});

export const POST = handle(async (request) => {
  const { orgId, label, store } = await requireUser(request);
  const body = await readJson<{ approvalId?: string; approved?: boolean; edited?: Record<string, unknown> | null; reason?: string }>(request);
  if (!body.approvalId || typeof body.approved !== 'boolean') throw new HttpError(400, 'approvalId and approved are required');
  const approval = await store.getApproval(body.approvalId);
  if (!approval || approval.orgId !== orgId) throw new HttpError(404, 'Approval not found');
  if (approval.status !== 'pending') throw new HttpError(409, 'Already decided');
  if (body.edited !== undefined && body.edited !== null && (typeof body.edited !== 'object' || Array.isArray(body.edited))) {
    throw new HttpError(400, 'edited must be an object');
  }
  const reason = typeof body.reason === 'string' ? body.reason.slice(0, 1000) : null;
  const res = await decide(deps(store), approval.id, { approved: body.approved, edited: body.edited ?? null, reason, by: label });
  return json({ task: { ...res.task, transcript: undefined }, nextApproval: res.approval ?? null, promotion: res.proposal });
});
