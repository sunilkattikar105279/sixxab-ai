// Model cost per call, task and agent. Prices are USD per million tokens, from the published
// model pages (Nov 2026): Haiku 5.5 $0.10/$0.50 (prompts up to 100K tokens, $0.50/$2.50 above),
// Sonnet 5.5 $2/$10, Opus 5.5 $4/$20.
import { newId, nowIso, type Store } from './store.js';
import type { ModelResponse } from './types.js';

interface Price { in: number; out: number; longIn?: number; longOut?: number; longOver?: number }
const PRICES: Record<string, Price> = {
  'claude-haiku-5-5': { in: 0.1, out: 0.5, longIn: 0.5, longOut: 2.5, longOver: 100_000 },
  'claude-sonnet-5-5': { in: 2, out: 10 },
  'claude-opus-5-5': { in: 4, out: 20 },
};

const round = (n: number) => Math.round(n * 1e6) / 1e6;

/** USD cost of one call, or null for a model without a known price. */
export function costUsd(model: string, inputTokens: number, outputTokens: number): number | null {
  const key = Object.keys(PRICES).find((k) => model === k || model.startsWith(`${k}-`));
  if (!key) return null;
  const p = PRICES[key];
  const long = p.longOver !== undefined && inputTokens > p.longOver;
  return round((inputTokens * (long ? p.longIn! : p.in) + outputTokens * (long ? p.longOut! : p.out)) / 1e6);
}

/** Records one model call's tokens and cost against its task and agent (no-op when the API reported no usage). */
export async function recordUsage(store: Store, orgId: string, taskId: string | null, agentId: string, resp: ModelResponse): Promise<void> {
  if (!resp.usage) return;
  const model = resp.model ?? 'unknown';
  const { inputTokens, outputTokens } = resp.usage;
  await store.audit({
    id: newId(), orgId, at: nowIso(), actor: agentId, action: 'model.usage', taskId,
    detail: { model, inputTokens, outputTokens, costUsd: costUsd(model, inputTokens, outputTokens) },
  });
}

export interface CostSummary {
  last30Days: { costUsd: number; tasks: number; avgPerTaskUsd: number; inputTokens: number; outputTokens: number };
  byAgent: { agentId: string; costUsd: number; tasks: number }[];
}

export async function costSummary(store: Store, orgId: string, now: Date = new Date()): Promise<CostSummary> {
  const since = new Date(now.getTime() - 30 * 24 * 3600 * 1000).toISOString();
  const events = (await store.listAuditByActions(orgId, ['model.usage'])).filter((e) => e.at >= since && e.at <= now.toISOString());
  const agents = new Map<string, { costUsd: number; tasks: Set<string> }>();
  const tasks = new Set<string>();
  let cost = 0, inTok = 0, outTok = 0;
  for (const e of events) {
    const c = Number(e.detail.costUsd ?? 0);
    cost += c;
    inTok += Number(e.detail.inputTokens ?? 0);
    outTok += Number(e.detail.outputTokens ?? 0);
    const key = e.taskId ?? e.id;
    tasks.add(key);
    const a = agents.get(e.actor) ?? { costUsd: 0, tasks: new Set<string>() };
    a.costUsd += c;
    a.tasks.add(key);
    agents.set(e.actor, a);
  }
  return {
    last30Days: { costUsd: round(cost), tasks: tasks.size, avgPerTaskUsd: tasks.size ? round(cost / tasks.size) : 0, inputTokens: inTok, outputTokens: outTok },
    byAgent: [...agents.entries()].map(([agentId, a]) => ({ agentId, costUsd: round(a.costUsd), tasks: a.tasks.size })).sort((x, y) => y.costUsd - x.costUsd),
  };
}
