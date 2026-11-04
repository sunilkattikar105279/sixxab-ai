// Governance (admin single pane) and billing: pure calculations plus invoice records.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { MemoryStore } from '../core/store.js';
import { DEFAULT_TASK_TYPES } from '../core/policy.js';
import type { AuditEvent } from '../core/types.js';

const NOW = new Date('2026-11-04T16:00:00Z');
const ev = (action: string, detail: Record<string, unknown>, at = '2026-11-03T10:00:00Z', taskId: string | null = null): AuditEvent => ({ id: Math.random().toString(36).slice(2), orgId: 'o', at, actor: 'a', action, taskId, detail });
const okChecks = { database: true, signIn: true, email: true, sms: false, model: true, automations: true, cron: true, webhookSecret: true, admins: 1 };

const org = (over: Record<string, unknown> = {}) => ({
  orgId: 'o1', name: 'SIXXAB AI', industry: 'Technology or software', currency: 'USD', stage: 'startup', onboarded: true, stepsDone: 3, stepsTotal: 21,
  pendingApprovals: [] as string[], tasks7d: [] as { status: string }[], events30d: [] as AuditEvent[], plan: null, ...over,
});

test('platform status is red when a core service is down, amber when a channel is missing, green otherwise', async () => {
  const { computeGovernance } = await import('../core/governance.js');
  const base = { orgs: [org()], counts: {}, build: {}, deploy: {}, fixedCosts: {}, now: NOW };
  assert.equal(computeGovernance({ ...base, checks: okChecks }).status.overall, 'green', 'SMS off is optional');
  assert.equal(computeGovernance({ ...base, checks: { ...okChecks, automations: false } }).status.overall, 'amber');
  const red = computeGovernance({ ...base, checks: { ...okChecks, model: false } });
  assert.equal(red.status.overall, 'red');
  assert.ok(red.status.checks.find((c) => c.key === 'model' && c.state === 'red'));
});

test('customer journey and workflows roll up across businesses', async () => {
  const { computeGovernance } = await import('../core/governance.js');
  const g = computeGovernance({
    orgs: [
      org({ pendingApprovals: ['2026-11-04T10:00:00Z', '2026-11-02T16:00:00Z'], tasks7d: [{ status: 'done' }, { status: 'done' }, { status: 'failed' }] }),
      org({ orgId: 'o2', name: 'More Laboratory', industry: 'Healthcare: laboratory or diagnostics', stage: 'struggle', onboarded: false, stepsDone: 0 }),
    ],
    checks: okChecks, counts: {}, build: {}, deploy: {}, fixedCosts: {}, now: NOW,
  });
  assert.equal(g.journey.businesses, 2);
  assert.deepEqual(g.journey.byStage, { startup: 1, struggle: 1, scale: 0, success: 0, significance: 0, sixxab: 0 });
  assert.equal(g.journey.onboarded, 1);
  assert.equal(g.journey.pendingApprovals, 2);
  assert.equal(g.journey.oldestApprovalHours, 48);
  assert.deepEqual(g.workflows.tasks7d, { done: 2, failed: 1 });
  assert.equal(g.security.healthcareBusinesses, 1);
});

test('integrations show sent, recorded-only and failed actions per action type over 7 days', async () => {
  const { computeGovernance } = await import('../core/governance.js');
  const g = computeGovernance({
    orgs: [org({ events30d: [
      ev('tool.executed', { tool: 'publish_post' }), ev('tool.executed', { tool: 'publish_post' }),
      ev('tool.failed', { tool: 'reply_comment', error: 'LinkedIn reply failed: Bad request' }, '2026-11-04T14:00:00Z'),
      ev('tool.recorded', { tool: 'send_message' }),
      ev('tool.executed', { tool: 'publish_post' }, '2026-10-01T00:00:00Z'),
    ] })],
    checks: okChecks, counts: {}, build: {}, deploy: {}, fixedCosts: {}, now: NOW,
  });
  const by = Object.fromEntries(g.integrations.map((i) => [i.tool, i]));
  assert.equal(by.publish_post.sent, 2, 'older than 7 days not counted');
  assert.equal(by.reply_comment.failed, 1);
  assert.match(by.reply_comment.lastError!, /Bad request/);
  assert.equal(by.send_message.recorded, 1);
});

test('cost per customer: own model usage plus fixed tech costs split by usage share, against the plan fee', async () => {
  const { computeGovernance } = await import('../core/governance.js');
  const usage = (usd: number) => ev('model.usage', { costUsd: usd, inputTokens: 1, outputTokens: 1 }, '2026-11-01T00:00:00Z', 't');
  const g = computeGovernance({
    orgs: [
      org({ events30d: [usage(3), usage(3)], plan: { name: 'Founder', monthlyFee: 5000, currency: 'USD' } }),
      org({ orgId: 'o2', name: 'Radhakrishna Ortho', currency: 'INR', events30d: [usage(2)], plan: { name: 'Pilot', monthlyFee: 8500, currency: 'INR' } }),
    ],
    checks: okChecks, counts: {}, build: {}, deploy: {}, fixedCosts: { Vercel: 20, Supabase: 25, n8n: 35 }, now: NOW, inrPerUsd: 85,
  });
  assert.equal(g.cost.modelUsd30d, 8);
  assert.equal(g.cost.fixedMonthlyUsd, 80);
  assert.equal(g.cost.totalMonthlyUsd, 88);
  const [a, b] = g.cost.byBusiness;
  assert.deepEqual([a.name, a.modelUsd, a.fixedUsd, a.costUsd, a.revenueUsd, a.marginUsd], ['SIXXAB AI', 6, 60, 66, 5000, 4934]);
  assert.deepEqual([b.name, b.modelUsd, b.fixedUsd, b.costUsd, b.revenueUsd, b.marginUsd], ['Radhakrishna Ortho', 2, 20, 22, 100, 78]);
});

test('with no usage yet, fixed costs split equally across businesses', async () => {
  const { allocate } = await import('../core/governance.js');
  assert.deepEqual(allocate([{ id: 'a', usage: 0 }, { id: 'b', usage: 0 }], 50), { a: 25, b: 25 });
});

test('security controls report what is configured, never the secrets themselves', async () => {
  const { computeGovernance } = await import('../core/governance.js');
  const g = computeGovernance({ orgs: [org()], checks: { ...okChecks, webhookSecret: false }, counts: {}, build: { rlsTables: 9, cspHeader: true }, deploy: {}, fixedCosts: {}, now: NOW });
  const c = Object.fromEntries(g.security.controls.map((x) => [x.key, x.ok]));
  assert.equal(c.webhookSecret, false);
  assert.equal(c.rls, true);
  assert.equal(c.csp, true);
  assert.equal(c.admins, true);
  assert.ok(!JSON.stringify(g).includes('re_'), 'no secret values');
});

// ---------- billing ----------

test('a plan is set per business and a monthly invoice is drafted once per period', async () => {
  const { setPlan, loadPlan, draftInvoice, listInvoices, setInvoiceStatus } = await import('../core/billing.js');
  const store = new MemoryStore({ orgId: 'o2', taskTypes: DEFAULT_TASK_TYPES });
  await assert.rejects(draftInvoice(store, 'o2', '2026-11', 'sunil'), /plan/);
  await setPlan(store, 'o2', { name: 'Pilot', monthlyFee: 8500, currency: 'INR' }, 'sunil');
  assert.deepEqual(await loadPlan(store, 'o2'), { name: 'Pilot', monthlyFee: 8500, currency: 'INR' });
  const inv = await draftInvoice(store, 'o2', '2026-11', 'sunil');
  assert.equal(inv.status, 'draft');
  assert.equal(inv.total, 8500);
  assert.match(inv.number, /^SIX-202611-/);
  assert.deepEqual(inv.lines, [{ description: 'Pilot plan, November 2026', amount: 8500 }]);
  const again = await draftInvoice(store, 'o2', '2026-11', 'sunil');
  assert.equal(again.id, inv.id, 'one invoice per business per month');
  await setInvoiceStatus(store, 'o2', inv.id, 'sent', 'sunil');
  await setInvoiceStatus(store, 'o2', inv.id, 'paid', 'sunil');
  const list = await listInvoices(store, 'o2');
  assert.equal(list.length, 1);
  assert.equal(list[0].status, 'paid');
  assert.ok(list[0].paidAt);
  await assert.rejects(setInvoiceStatus(store, 'o2', inv.id, 'refunded' as 'paid', 'sunil'), /status/);
  await assert.rejects(setPlan(store, 'o2', { name: '', monthlyFee: -1, currency: 'INR' }, 'sunil'), /plan/i);
  await assert.rejects(draftInvoice(store, 'o2', '2026-13', 'sunil'), /period/);
});
