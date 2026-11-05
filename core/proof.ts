// Proof that each agent works in production, from real activity: a model agent is proven once it has
// finished a real task; a platform service is proven by its own evidence (memories saved, approvals
// decided, briefings sent, audit trail). Feeds the admin Governance tab and the build plan.
import { AGENTS } from './agents.js';
import type { AuditEvent, RoleCard } from './types.js';

export const PROOF_EVENTS = ['task.done', 'plan.created', 'task.rated', 'approval.approved', 'approval.rejected'];
export const PROOF_PREFIX = 'Proof run for the SIXXAB build plan. Do not send, post, publish or spend anything in this run; if your job normally sends messages, write the draft into a note instead.';
const STAGE_NAME: Record<number, string> = { 1: 'S1 Startup', 2: 'S2 Struggle', 3: 'S3 Scale', 4: 'S4 Success', 5: 'S5 Significance', 6: 'S6 SIXXAB' };

export interface AgentProof {
  id: string; name: string; group: string; layer: string; job: string;
  runs: number; lastRunAt: string | null; proven: boolean; evidence: string;
  /** The goal for a proof run, for agents that can run one. */
  proofGoal: string | null;
}

export function starterFor(a: RoleCard): string {
  return a.starter ?? `In five bullet points, say what you will do for this business in the next 30 days, given its profile, stage and goals. Save it as a note titled "Plan: ${a.name}".`;
}

export function proofGoal(a: RoleCard): string | null {
  return a.usesModel ? `${PROOF_PREFIX}\n\n${starterFor(a)}` : null;
}

/** Counts are table row counts across the platform (-1 when unknown). */
export function computeAgentProof(events: AuditEvent[], counts: Record<string, number>, agents: RoleCard[] = AGENTS): AgentProof[] {
  const done = new Map<string, { runs: number; last: string }>();
  for (const e of events) {
    if (e.action !== 'task.done') continue;
    const cur = done.get(e.actor) ?? { runs: 0, last: '' };
    done.set(e.actor, { runs: cur.runs + 1, last: e.at > cur.last ? e.at : cur.last });
  }
  const plans = events.filter((e) => e.action === 'plan.created' && e.actor === 'founder-orchestrator').length;
  const decided = events.filter((e) => e.action === 'approval.approved' || e.action === 'approval.rejected').length;
  const rated = events.filter((e) => e.action === 'task.rated').length;
  const service: Record<string, [boolean, string]> = {
    'founder-orchestrator': [plans > 0, `${plans} plan${plans === 1 ? '' : 's'} made`],
    'shared-memory': [(counts.memories ?? 0) > 0, `${Math.max(0, counts.memories ?? 0)} memories saved`],
    'learning-engine': [decided + rated > 0, `${decided} approval decisions and ${rated} ratings learned from`],
    'approvals-guardrails': [decided > 0, `${decided} approvals decided`],
    'morning-briefing': [(counts.briefings ?? 0) > 0, `${Math.max(0, counts.briefings ?? 0)} briefings sent`],
    'audit-log': [(counts.audit_log ?? 0) > 0, `${Math.max(0, counts.audit_log ?? 0)} actions recorded`],
  };
  return agents.map((a) => {
    const d = done.get(a.id);
    const svc = service[a.id];
    const runs = d?.runs ?? 0;
    const proven = svc ? svc[0] || runs > 0 : runs > 0;
    const evidence = svc && !runs ? svc[1] : runs ? `${runs} task${runs === 1 ? '' : 's'} finished` : 'No finished task yet';
    return {
      id: a.id, name: a.name, layer: a.layer, job: a.job,
      group: a.layer === 'core' ? 'Always on' : STAGE_NAME[a.stage] ?? `Stage ${a.stage}`,
      runs, lastRunAt: d?.last ?? null, proven, evidence, proofGoal: proofGoal(a),
    };
  });
}
