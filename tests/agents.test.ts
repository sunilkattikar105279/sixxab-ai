// Agent roster for Always on, S1 Startup and S2 Struggle: every agent is real, safe and runnable,
// and research agents can search the web (Claude's server tool), with its cost recorded.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { MemoryStore } from '../core/store.js';
import { DEFAULT_TASK_TYPES } from '../core/policy.js';
import { createTask, runTask } from '../core/runtime.js';
import { AGENTS, getAgent } from '../core/agents.js';
import { TOOLS, WEB_SEARCH_TOOL } from '../core/tools.js';
import { costUsd, recordUsage } from '../core/cost.js';
import type { ContentBlock, ModelClient, ModelRequest, ModelResponse } from '../core/types.js';

const ORG = 'org-1';
const NEW = ['ceo', 'offer-pricing', 'brand-builder', 'website-builder', 'decision-advisor', 'cso', 'cpo', 'lead-finder', 'speed-to-lead', 'competitive-intel', 'founder-story'];

test('every role card is unique, reports to a real agent and lists only real tools', () => {
  const ids = new Set<string>();
  for (const a of AGENTS) {
    assert.ok(!ids.has(a.id), `duplicate ${a.id}`);
    ids.add(a.id);
    if (a.reportsTo) assert.ok(getAgent(a.reportsTo), `${a.id} reports to ${a.reportsTo}`);
    for (const t of a.tools) assert.ok(TOOLS[t] || t === 'web_search', `${a.id} tool ${t}`);
  }
  for (const id of NEW) assert.ok(getAgent(id)?.usesModel, id);
});

test('S1 and S2 agents stay safe: no spending, and only outreach agents can message or post', () => {
  const MAY_SEND = new Set(['speed-to-lead', 'founder-story', 'sales-crm', 'support-desk', 'follow-up-writer', 'customer-reply', 'fundraising', 'social-poster', 'comment-responder', 'cmo']);
  for (const a of AGENTS.filter((x) => x.stage <= 2)) {
    if (a.id !== 'cmo') assert.ok(!a.tools.includes('spend_money'), `${a.id} must not spend`);
    if (!MAY_SEND.has(a.id)) assert.ok(!a.tools.some((t) => ['send_message', 'publish_post', 'reply_comment', 'send_email_campaign'].includes(t)), `${a.id} must not contact anyone`);
  }
  for (const id of ['lead-finder', 'competitive-intel', 'cso', 'offer-pricing', 'niche-offer']) assert.ok(getAgent(id)!.tools.includes('web_search'), `${id} researches the web`);
  assert.match(getAgent('lead-finder')!.instructions, /never guess or construct an email/);
});

class Model implements ModelClient {
  calls: ModelRequest[] = [];
  constructor(private readonly replies: { content: ContentBlock[]; stopReason: string; usage?: ModelResponse['usage'] }[]) {}
  async complete(req: ModelRequest): Promise<ModelResponse> {
    this.calls.push(req);
    const r = this.replies.shift() ?? { content: [{ type: 'text', text: 'Done.' }], stopReason: 'end_turn' };
    return { ...r, model: 'claude-sonnet-5-5' };
  }
}

test('research agents get Claude web search, and a paused turn continues instead of ending', async () => {
  const store = new MemoryStore({ orgId: ORG, taskTypes: DEFAULT_TASK_TYPES });
  const model = new Model([
    { content: [{ type: 'text', text: 'Searching…' }], stopReason: 'pause_turn', usage: { inputTokens: 100, outputTokens: 10, webSearches: 3 } },
    { content: [{ type: 'text', text: 'Three competitors found.' }], stopReason: 'end_turn', usage: { inputTokens: 100, outputTokens: 50 } },
  ]);
  const task = await createTask(store, ORG, 'competitive-intel', 'Research competitors');
  const res = await runTask({ store, model, integrations: { dispatch: async () => 'ok' } }, task.id);
  assert.equal(res.task.status, 'done');
  assert.equal(res.task.output, 'Three competitors found.');
  assert.equal(model.calls.length, 2, 'the paused turn was resumed');
  assert.ok(model.calls[0].tools!.some((t) => 'type' in t && t.type === WEB_SEARCH_TOOL.type), 'web search offered');
  const noSearch = await createTask(store, ORG, 'ceo', 'Weekly review');
  await runTask({ store, model: new Model([]), integrations: { dispatch: async () => 'ok' } }, noSearch.id);
  const usage = (await store.listAuditByActions(ORG, ['model.usage'])).find((e) => e.detail.webSearches === 3);
  assert.equal(usage?.detail.costUsd, Math.round((costUsd('claude-sonnet-5-5', 100, 10)! + 0.03) * 1e6) / 1e6, 'searches cost $0.01 each on top of tokens');
});

test('agents without web search never see the tool', async () => {
  const store = new MemoryStore({ orgId: ORG, taskTypes: DEFAULT_TASK_TYPES });
  const model = new Model([]);
  const task = await createTask(store, ORG, 'ceo', 'Weekly review');
  await runTask({ store, model, integrations: { dispatch: async () => 'ok' } }, task.id);
  assert.ok(!(model.calls[0].tools ?? []).some((t) => 'type' in t), 'no server tools for the CEO agent');
  await recordUsage(store, ORG, null, 'ceo', { content: [], stopReason: 'end_turn' });
});

test('agent proof: model agents need a finished task; platform services prove themselves by their evidence', async () => {
  const { computeAgentProof, PROOF_PREFIX } = await import('../core/proof.js');
  const ev = (action: string, actor: string, at = '2026-11-04T10:00:00Z') => ({ id: action + actor + at, orgId: ORG, at, actor, action, taskId: null, detail: {} });
  const rows = computeAgentProof([ev('task.done', 'social-poster'), ev('task.done', 'social-poster', '2026-11-05T10:00:00Z'), ev('approval.approved', 'owner')], { memories: 0, briefings: 3, audit_log: 120 });
  const by = (id: string) => rows.find((r) => r.id === id)!;
  assert.deepEqual([by('social-poster').proven, by('social-poster').runs, by('social-poster').lastRunAt], [true, 2, '2026-11-05T10:00:00Z']);
  assert.equal(by('ceo').proven, false);
  assert.ok(by('ceo').proofGoal!.startsWith(PROOF_PREFIX), 'proof runs never send, post or spend');
  assert.equal(by('morning-briefing').proven, true);
  assert.equal(by('approvals-guardrails').proven, true);
  assert.equal(by('learning-engine').proven, true);
  assert.equal(by('shared-memory').proven, false, 'no memories saved yet');
  assert.equal(by('shared-memory').proofGoal, null, 'platform services have no proof run');
  assert.equal(by('ceo').group, 'S1 Startup');
  assert.equal(by('audit-log').group, 'Always on');
  assert.equal(by('founder-orchestrator').proven, false);
  assert.ok(by('founder-orchestrator').proofGoal, 'the orchestrator has a proof run (it plans; nothing runs)');
  const planned = computeAgentProof([ev('plan.created', 'founder-orchestrator')], {}).find((r) => r.id === 'founder-orchestrator')!;
  assert.deepEqual([planned.proven, planned.evidence], [true, '1 plan made']);
});
