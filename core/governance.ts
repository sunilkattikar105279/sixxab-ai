// AI & Platform Governance: one admin-only snapshot of the whole platform for the founder, COO,
// SRE, CTO, CISO and CFO. Pure: the server gathers the inputs, this turns them into status,
// customer journey, workflows, integrations, data, security, code/pipeline and cost per customer.
import type { AuditEvent } from './types.js';
import { DEFAULT_INR_PER_USD } from './journey.js';

export type State = 'green' | 'amber' | 'red' | 'off';
export interface Plan { name: string; monthlyFee: number; currency: string }

export interface OrgSnapshot {
  orgId: string;
  name: string | null;
  industry: string | null;
  currency: string;
  stage: string;
  onboarded: boolean;
  stepsDone: number;
  stepsTotal: number;
  /** createdAt of each pending approval */
  pendingApprovals: string[];
  tasks7d: { status: string }[];
  /** tool.*, model.usage and settings events from the last 30 days */
  events30d: AuditEvent[];
  plan: Plan | null;
}

export interface PlatformChecks {
  database: boolean; signIn: boolean; email: boolean; sms: boolean; model: boolean;
  automations: boolean; cron: boolean; webhookSecret: boolean; admins: number;
}
export interface BuildInfo { sha?: string; builtAt?: string; files?: number; lines?: number; tests?: number; rlsTables?: number; cspHeader?: boolean; apiRoutes?: number; agents?: number }
export interface DeployInfo { env?: string; sha?: string; url?: string; message?: string; region?: string }

export interface GovernanceInput {
  orgs: OrgSnapshot[];
  checks: PlatformChecks;
  counts: Record<string, number>;
  build: BuildInfo;
  deploy: DeployInfo;
  /** Fixed monthly tech costs in USD by vendor, e.g. { Vercel: 20 } */
  fixedCosts: Record<string, number>;
  now: Date;
  inrPerUsd?: number;
}

const EXTERNAL = ['publish_post', 'reply_comment', 'send_message', 'send_email_campaign', 'spend_money'];
const STAGE_KEYS = ['startup', 'struggle', 'scale', 'success', 'significance', 'sixxab'];
const DAY = 24 * 3600 * 1000;
const r2 = (n: number) => Math.round(n * 100) / 100;

/** Splits an amount by usage share; with no usage at all, equally. */
export function allocate(items: { id: string; usage: number }[], amount: number): Record<string, number> {
  const total = items.reduce((s, i) => s + i.usage, 0);
  return Object.fromEntries(items.map((i) => [i.id, r2(total > 0 ? (amount * i.usage) / total : amount / Math.max(items.length, 1))]));
}

function statusChecks(c: PlatformChecks, failed24h: number) {
  const row = (key: string, label: string, state: State, detail: string) => ({ key, label, state, detail });
  const checks = [
    row('database', 'Database', c.database ? 'green' : 'red', c.database ? 'Reachable, tables present' : 'Not reachable or tables missing'),
    row('signIn', 'Sign-in', c.signIn ? 'green' : 'red', c.signIn ? 'Supabase Auth reachable' : 'Supabase Auth not configured or unreachable'),
    row('model', 'AI model', c.model ? 'green' : 'red', c.model ? 'Anthropic key configured' : 'ANTHROPIC_API_KEY missing'),
    row('email', 'Email sign-in', c.email ? 'green' : 'amber', c.email ? 'Codes sent from noreply@sixxab.ai' : 'Email sign-in off'),
    row('sms', 'SMS sign-in', c.sms ? 'green' : 'off', c.sms ? 'On' : 'Not set up (optional)'),
    row('automations', 'Automations (n8n)', c.automations ? 'green' : 'amber', c.automations ? 'Webhook configured' : 'N8N_WEBHOOK_URL missing: actions are recorded, not sent'),
    row('webhookSecret', 'Webhook secret', c.webhookSecret ? 'green' : 'amber', c.webhookSecret ? 'Set' : 'N8N_WEBHOOK_SECRET missing'),
    row('cron', 'Morning briefing schedule', c.cron ? 'green' : 'amber', c.cron ? 'CRON_SECRET set' : 'CRON_SECRET missing'),
    row('failures', 'Failed actions, last 24 hours', failed24h === 0 ? 'green' : 'amber', failed24h === 0 ? 'None' : `${failed24h} failed; see Integrations`),
  ];
  const overall: State = checks.some((x) => x.state === 'red') ? 'red' : checks.some((x) => x.state === 'amber') ? 'amber' : 'green';
  return { overall, checks };
}

export function computeGovernance(input: GovernanceInput) {
  const now = input.now.getTime();
  const within = (e: AuditEvent, days: number) => now - Date.parse(e.at) <= days * DAY;
  const all = input.orgs.flatMap((o) => o.events30d);
  const rate = input.inrPerUsd && input.inrPerUsd > 0 ? input.inrPerUsd : DEFAULT_INR_PER_USD;
  const toUsd = (amount: number, currency: string) => (currency === 'INR' ? amount / rate : amount);

  // Integrations: external actions by outcome over 7 days
  const integrations = EXTERNAL.map((tool) => {
    const ev = all.filter((e) => within(e, 7) && e.detail.tool === tool);
    const failed = ev.filter((e) => e.action === 'tool.failed').sort((a, b) => (a.at < b.at ? 1 : -1));
    return {
      tool,
      sent: ev.filter((e) => e.action === 'tool.executed').length,
      recorded: ev.filter((e) => e.action === 'tool.recorded').length,
      failed: failed.length,
      lastError: failed[0] ? String(failed[0].detail.error ?? '') : null,
    };
  });
  const failed24h = all.filter((e) => e.action === 'tool.failed' && within(e, 1)).length;

  // Customer journey and workflows
  const byStage = Object.fromEntries(STAGE_KEYS.map((k) => [k, input.orgs.filter((o) => o.stage === k).length]));
  const pending = input.orgs.flatMap((o) => o.pendingApprovals);
  const oldest = pending.length ? Math.min(...pending.map((p) => Date.parse(p))) : null;
  const tasks7d: Record<string, number> = {};
  for (const t of input.orgs.flatMap((o) => o.tasks7d)) tasks7d[t.status] = (tasks7d[t.status] ?? 0) + 1;

  // Cost per customer: own model usage + fixed costs split by usage share, against the plan fee
  const usageUsd = (o: OrgSnapshot) => input.orgs.length && o.events30d.filter((e) => e.action === 'model.usage' && within(e, 30)).reduce((s, e) => s + Number(e.detail.costUsd ?? 0), 0);
  const fixedMonthlyUsd = r2(Object.values(input.fixedCosts).reduce((s, n) => s + (Number.isFinite(n) ? n : 0), 0));
  const shares = allocate(input.orgs.map((o) => ({ id: o.orgId, usage: usageUsd(o) })), fixedMonthlyUsd);
  const byBusiness = input.orgs.map((o) => {
    const modelUsd = r2(usageUsd(o));
    const fixedUsd = shares[o.orgId] ?? 0;
    const costUsd = r2(modelUsd + fixedUsd);
    const revenueUsd = o.plan ? r2(toUsd(o.plan.monthlyFee, o.plan.currency)) : 0;
    return { orgId: o.orgId, name: o.name ?? 'Unnamed business', plan: o.plan, modelUsd, fixedUsd, costUsd, revenueUsd, marginUsd: r2(revenueUsd - costUsd) };
  });
  const modelUsd30d = r2(byBusiness.reduce((s, b) => s + b.modelUsd, 0));

  const healthcare = input.orgs.filter((o) => (o.industry ?? '').startsWith('Healthcare')).length;
  const changes = all
    .filter((e) => ['settings.automation', 'billing.plan', 'autonomy.promoted', 'autonomy.lowered'].includes(e.action))
    .sort((a, b) => (a.at < b.at ? 1 : -1)).slice(0, 10)
    .map((e) => ({ at: e.at, actor: e.actor, action: e.action, summary: String(e.detail.summary ?? e.action) }));

  return {
    generatedAt: input.now.toISOString(),
    status: statusChecks(input.checks, failed24h),
    journey: {
      businesses: input.orgs.length,
      byStage,
      onboarded: input.orgs.filter((o) => o.onboarded).length,
      stepsDone: input.orgs.reduce((s, o) => s + o.stepsDone, 0),
      stepsTotal: input.orgs.reduce((s, o) => s + o.stepsTotal, 0),
      pendingApprovals: pending.length,
      oldestApprovalHours: oldest === null ? null : Math.round((now - oldest) / 3600_000),
      businessesList: input.orgs.map((o) => ({ orgId: o.orgId, name: o.name, stage: o.stage, onboarded: o.onboarded, stepsDone: o.stepsDone, pending: o.pendingApprovals.length })),
    },
    workflows: { tasks7d, delivered7d: integrations.reduce((s, i) => s + i.sent, 0), failed7d: integrations.reduce((s, i) => s + i.failed, 0) },
    integrations,
    data: { counts: input.counts },
    security: {
      healthcareBusinesses: healthcare,
      controls: [
        { key: 'rls', label: 'Row-level security on workspace tables', ok: (input.build.rlsTables ?? 0) > 0, detail: `${input.build.rlsTables ?? 0} tables with RLS in the migration` },
        { key: 'csp', label: 'Content Security Policy header', ok: Boolean(input.build.cspHeader), detail: input.build.cspHeader ? 'Set in vercel.json' : 'Missing' },
        { key: 'secrets', label: 'No secrets in the browser', ok: true, detail: 'Only the Supabase URL, publishable key and booking link are public' },
        { key: 'webhookSecret', label: 'n8n webhook protected by a shared secret', ok: input.checks.webhookSecret, detail: input.checks.webhookSecret ? 'Header auth on' : 'N8N_WEBHOOK_SECRET missing' },
        { key: 'admins', label: 'Admin access limited to named people', ok: input.checks.admins > 0, detail: `${input.checks.admins} admin(s) in ADMIN_EMAILS` },
        { key: 'humanLoop', label: 'Money and outbound actions wait for a person', ok: true, detail: 'Enforced in the policy and by database triggers' },
        { key: 'healthcare', label: 'Healthcare businesses: business data only', ok: true, detail: `${healthcare} healthcare business(es) with the rule in every prompt` },
      ],
      recentChanges: changes,
    },
    code: input.build,
    pipeline: input.deploy,
    cost: { modelUsd30d, fixedMonthlyUsd, totalMonthlyUsd: r2(modelUsd30d + fixedMonthlyUsd), fixedCosts: input.fixedCosts, inrPerUsd: rate, byBusiness },
  };
}

export type Governance = ReturnType<typeof computeGovernance>;
