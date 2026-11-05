// Gathers the platform-wide inputs for the admin Governance snapshot (core/governance.ts).
import { computeGovernance, type GovernanceInput, type OrgSnapshot } from '../core/governance.js';
import { computeJourney } from '../core/journey.js';
import { PROOF_EVENTS } from '../core/proof.js';
import { loadBusinessProfile } from '../core/profile.js';
import type { SupabaseStore } from '../core/supabase-store.js';
import { BUILD_INFO } from './build-info.js';
import { liveChecks } from './checks.js';
import { journeyOptions } from './context.js';

const TABLES = ['orgs', 'org_members', 'tasks', 'approvals', 'audit_log', 'memories', 'feedback', 'briefings'];
const EVENTS = [
  'profile.updated', 'journey.step_done', 'journey.step_reopened', 'revenue.recorded', 'milestone.reached', 'autonomy.promoted', 'autonomy.lowered',
  'tool.executed', 'tool.failed', 'tool.recorded', 'model.usage', 'settings.automation', 'billing.plan',
];
const DAY = 24 * 3600 * 1000;

/** Fixed monthly tech costs (USD by vendor), set by an admin in their own workspace. */
export async function loadFixedCosts(store: SupabaseStore, adminOrgId: string): Promise<Record<string, number>> {
  const last = (await store.listAuditByActions(adminOrgId, ['settings.techcost'])).at(-1);
  const costs = (last?.detail.costs ?? {}) as Record<string, unknown>;
  return Object.fromEntries(Object.entries(costs).map(([k, v]) => [k, Number(v)]).filter(([, v]) => Number.isFinite(v as number)));
}

async function orgSnapshot(store: SupabaseStore, orgId: string, now: number): Promise<OrgSnapshot> {
  const since7 = new Date(now - 7 * DAY).toISOString();
  const [profile, events, tasks, approvals, proofEvents] = await Promise.all([
    loadBusinessProfile(store, orgId), store.listAuditByActions(orgId, EVENTS), store.listTasks(orgId, since7), store.listApprovals(orgId, 'pending'),
    store.listAuditByActions(orgId, PROOF_EVENTS),
  ]);
  const j = computeJourney(profile, events, journeyOptions());
  const lastPlan = events.filter((e) => e.action === 'billing.plan').at(-1);
  return {
    orgId,
    name: profile?.name ?? null,
    industry: profile?.industry ?? null,
    currency: profile?.currency ?? 'USD',
    stage: j.stage.key,
    onboarded: j.steps.find((s) => s.id === 'onboard')?.status === 'done',
    stepsDone: j.steps.filter((s) => s.status === 'done').length,
    stepsTotal: j.steps.length,
    pendingApprovals: approvals.map((a) => a.createdAt),
    tasks7d: tasks.map((t) => ({ status: t.status })),
    events30d: events.filter((e) => now - Date.parse(e.at) <= 30 * DAY),
    proofEvents,
    plan: lastPlan ? { name: String(lastPlan.detail.name), monthlyFee: Number(lastPlan.detail.monthlyFee), currency: String(lastPlan.detail.currency) } : null,
  };
}

export async function governanceSnapshot(store: SupabaseStore, adminOrgId: string) {
  const now = Date.now();
  const [checks, ids, fixedCosts, counts] = await Promise.all([
    liveChecks(),
    store.listOrgIds(),
    loadFixedCosts(store, adminOrgId),
    Promise.all(TABLES.map(async (t) => [t, await store.countRows(t).catch(() => -1)] as const)).then(Object.fromEntries),
  ]);
  const orgs = await Promise.all(ids.map((id) => orgSnapshot(store, id, now)));
  const input: GovernanceInput = {
    orgs,
    checks: {
      database: Boolean(checks.database && checks.tables), signIn: Boolean(checks.signIn && checks.auth?.reachable), email: Boolean(checks.auth?.email),
      sms: Boolean(checks.auth?.phone), model: checks.model, automations: checks.automations, cron: checks.cron, webhookSecret: checks.webhookSecret, admins: checks.admins,
    },
    counts,
    build: BUILD_INFO,
    deploy: {
      env: process.env.VERCEL_ENV, sha: process.env.VERCEL_GIT_COMMIT_SHA, url: process.env.VERCEL_URL,
      message: process.env.VERCEL_GIT_COMMIT_MESSAGE?.split('\n')[0], region: process.env.VERCEL_REGION,
    },
    fixedCosts,
    now: new Date(now),
    inrPerUsd: journeyOptions().inrPerUsd,
  };
  return computeGovernance(input);
}
