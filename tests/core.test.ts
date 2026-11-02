// Core platform tests. Run: npm test  (node:test via tsx, no external services)
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { MemoryStore } from '../core/store.js';
import { DEFAULT_TASK_TYPES, effectiveGate, proposePromotion, checkSpend, cleanStreak } from '../core/policy.js';
import { createTask, runTask, decide } from '../core/runtime.js';
import { orchestrate, parsePlan } from '../core/orchestrator.js';
import { buildBriefing } from '../core/briefing.js';
import { applyPromotion, evalCases } from '../core/learning.js';
import { AnthropicClient } from '../core/model.js';
import type { ContentBlock, Feedback, ModelClient, ModelRequest, ModelResponse, TaskType } from '../core/types.js';
import type { Integrations } from '../core/tools.js';

const ORG = 'org-1';

class ScriptedModel implements ModelClient {
  calls: ModelRequest[] = [];
  constructor(private readonly replies: ContentBlock[][]) {}
  async complete(req: ModelRequest): Promise<ModelResponse> {
    this.calls.push(req);
    const content = this.replies.shift() ?? [{ type: 'text', text: 'Done.' }];
    return { content, stopReason: content.some((b) => b.type === 'tool_use') ? 'tool_use' : 'end_turn' };
  }
}

class RecordingIntegrations implements Integrations {
  sent: { action: string; payload: Record<string, unknown> }[] = [];
  async dispatch(action: string, payload: Record<string, unknown>) {
    this.sent.push({ action, payload });
    return `sent ${action}`;
  }
}

const setup = (replies: ContentBlock[][], types: TaskType[] = DEFAULT_TASK_TYPES) => {
  const store = new MemoryStore({ orgId: ORG, taskTypes: types });
  const model = new ScriptedModel(replies);
  const integrations = new RecordingIntegrations();
  return { store, model, integrations, deps: { store, model, integrations } };
};

const tt = (key: string) => DEFAULT_TASK_TYPES.find((t) => t.key === key)!;
const fb = (outcome: Feedback['outcome'], at: string, taskType = 'publish_post'): Feedback => ({
  id: at, orgId: ORG, taskType, agentId: 'social-poster', outcome, reason: null, proposed: {}, final: null, at,
});

// ---------- policy ----------

test('gates follow autonomy levels', () => {
  assert.equal(effectiveGate(tt('internal_note')), 'auto_execute');
  assert.equal(effectiveGate(tt('publish_post')), 'await_approval');
  assert.equal(effectiveGate(tt('spend_money')), 'draft_for_human');
});

test('spend cap forces approval even for an autonomous task', () => {
  const autoSpend: TaskType = { ...tt('spend_money'), level: 3, maxLevel: 3 };
  assert.equal(effectiveGate(autoSpend, 10_000), 'auto_execute');
  assert.equal(effectiveGate(autoSpend, 60_000), 'await_approval');
  assert.equal(checkSpend(autoSpend, -1).allowed, false);
});

test('level never exceeds the task type maximum', () => {
  assert.equal(effectiveGate({ ...tt('send_email_campaign'), level: 3 }), 'await_approval');
});

test('promotion needs an unbroken run of clean approvals', () => {
  const t: TaskType = { ...tt('publish_post'), approvalsToPromote: 3 };
  const clean = [fb('approved', '2026-11-01T01'), fb('approved', '2026-11-01T02'), fb('approved', '2026-11-01T03')];
  assert.deepEqual(proposePromotion(t, clean)?.to, 3);
  const broken = [...clean, fb('approved_with_edits', '2026-11-01T04')];
  assert.equal(cleanStreak(broken), 0);
  assert.equal(proposePromotion(t, broken), null);
  assert.equal(proposePromotion({ ...t, level: 3 }, clean), null);
});

// ---------- runtime ----------

test('autonomous tool runs immediately and the task finishes', async () => {
  const { store, deps } = setup([
    [{ type: 'tool_use', id: 't1', name: 'write_note', input: { title: 'Plan', body: 'Week one plan' } }],
    [{ type: 'text', text: 'Saved the plan.' }],
  ]);
  const task = await createTask(store, ORG, 'strategy-coach', 'Plan week one');
  const { task: done } = await runTask(deps, task.id);
  assert.equal(done.status, 'done');
  assert.equal(done.output, 'Saved the plan.');
  assert.equal(store.memories.length, 1);
  assert.ok(store.auditLog.some((e) => e.action === 'tool.executed'));
});

test('external action pauses for approval, then executes the edited version and resumes', async () => {
  const { store, integrations, deps } = setup([
    [{ type: 'tool_use', id: 'p1', name: 'publish_post', input: { network: 'instagram', text: 'Draft post' } }],
    [{ type: 'text', text: 'Posted.' }],
  ]);
  const task = await createTask(store, ORG, 'social-poster', 'Post about our launch');
  const run = await runTask(deps, task.id);
  assert.equal(run.task.status, 'awaiting_approval');
  assert.ok(run.approval);
  assert.equal(integrations.sent.length, 0, 'nothing is sent before approval');

  const res = await decide(deps, run.approval!.id, { approved: true, edited: { network: 'instagram', text: 'Edited post' }, by: 'founder' });
  assert.equal(res.task.status, 'done');
  assert.deepEqual(integrations.sent[0], { action: 'publish_post', payload: { network: 'instagram', text: 'Edited post', when: 'now' } });
  const cases = await evalCases(store, ORG);
  assert.equal(cases.length, 1, 'edits become eval cases');
});

test('rejection is fed back to the agent and nothing is sent', async () => {
  const { store, integrations, deps } = setup([
    [{ type: 'tool_use', id: 'm1', name: 'send_message', input: { channel: 'sms', to: '+15555550100', text: 'Hi' } }],
    [{ type: 'text', text: 'Understood, I will not send it.' }],
  ]);
  const task = await createTask(store, ORG, 'customer-reply', 'Reply to lead');
  const run = await runTask(deps, task.id);
  const res = await decide(deps, run.approval!.id, { approved: false, reason: 'Wrong tone', by: 'founder' });
  assert.equal(res.task.status, 'done');
  assert.equal(integrations.sent.length, 0);
  const last = res.task.transcript.at(-2);
  assert.ok(JSON.stringify(last).includes('Wrong tone'));
});

test('rejecting an autonomous task demotes it to approval', async () => {
  const types = DEFAULT_TASK_TYPES.map((t) => (t.key === 'spend_money' ? { ...t, level: 3 as const, maxLevel: 3 as const } : t));
  const { store, integrations, deps } = setup([
    [{ type: 'tool_use', id: 's1', name: 'spend_money', input: { amountMinor: 90_000, currency: 'USD', purpose: 'Ads', payee: 'Meta' } }],
    [{ type: 'text', text: 'Holding the spend.' }],
  ], types);
  const task = await createTask(store, ORG, 'cmo', 'Boost the launch');
  const run = await runTask(deps, task.id);
  assert.equal(run.task.status, 'awaiting_approval', 'over the cap, even L3 must ask');
  await decide(deps, run.approval!.id, { approved: false, reason: 'Too much', by: 'founder' });
  assert.equal((await store.getTaskTypes(ORG)).find((t) => t.key === 'spend_money')!.level, 2);
  assert.equal(integrations.sent.length, 0);
});

test('an L1 task becomes a draft and is never executed by the agent', async () => {
  const { store, integrations, deps } = setup([
    [{ type: 'tool_use', id: 'e1', name: 'send_email_campaign', input: { list: 'all', subject: 'Hi', body: 'Body' } }],
    [{ type: 'text', text: 'Draft handed over.' }],
  ]);
  const task = await createTask(store, ORG, 'cmo', 'Email everyone');
  const run = await runTask(deps, task.id);
  assert.equal(run.task.status, 'draft_for_human');
  const res = await decide(deps, run.approval!.id, { approved: true, by: 'founder' });
  assert.equal(res.task.status, 'done');
  assert.equal(integrations.sent.length, 0, 'the person sends L1 work themselves');
});

test('agent cannot call a tool outside its role card', async () => {
  const { store, integrations, deps } = setup([
    [{ type: 'tool_use', id: 's1', name: 'spend_money', input: { amountMinor: 100, currency: 'USD', purpose: 'x', payee: 'y' } }],
    [{ type: 'text', text: 'ok' }],
  ]);
  const task = await createTask(store, ORG, 'social-poster', 'Buy ads');
  const run = await runTask(deps, task.id);
  assert.equal(run.task.status, 'done');
  assert.equal(integrations.sent.length, 0);
  assert.equal((await store.listApprovals(ORG)).length, 0);
});

test('a run that never finishes stops at the turn limit', async () => {
  const loop: ContentBlock[][] = Array.from({ length: 10 }, (_, i) => [{ type: 'tool_use', id: `r${i}`, name: 'recall', input: { query: 'x' } } as ContentBlock]);
  const { store, deps } = setup(loop);
  const task = await createTask(store, ORG, 'strategy-coach', 'Loop');
  const { task: t } = await runTask({ ...deps, maxTurns: 3 }, task.id);
  assert.equal(t.status, 'failed');
});

test('deciding twice is refused', async () => {
  const { store, deps } = setup([[{ type: 'tool_use', id: 'p1', name: 'publish_post', input: { network: 'x', text: 'y' } }]]);
  const task = await createTask(store, ORG, 'social-poster', 'Post');
  const run = await runTask(deps, task.id);
  await decide(deps, run.approval!.id, { approved: false, by: 'founder' });
  await assert.rejects(() => decide(deps, run.approval!.id, { approved: true, by: 'founder' }));
});

// ---------- learning, orchestrator, briefing ----------

test('promotion is applied only when a person confirms it', async () => {
  const { store } = setup([]);
  await applyPromotion(store, ORG, { taskType: 'publish_post', from: 2, to: 3, because: 'test' }, 'founder');
  assert.equal((await store.getTaskTypes(ORG)).find((t) => t.key === 'publish_post')!.level, 3);
  await assert.rejects(() => applyPromotion(store, ORG, { taskType: 'send_email_campaign', from: 1, to: 3, because: 'x' }, 'founder'));
});

test('plan parser keeps only known agents and caps steps', () => {
  const plan = parsePlan('Here: {"steps":[{"agentId":"cmo","goal":"Plan launch"},{"agentId":"hacker","goal":"x"},{"agentId":"social-poster","goal":""}]}');
  assert.deepEqual(plan, [{ agentId: 'cmo', goal: 'Plan launch' }]);
  assert.deepEqual(parsePlan('no json'), []);
});

test('orchestrator plans, runs each step and reports what waits on a person', async () => {
  const { store, deps } = setup([
    [{ type: 'text', text: '{"steps":[{"agentId":"strategy-coach","goal":"Write launch plan"},{"agentId":"social-poster","goal":"Announce launch"}]}' }],
    [{ type: 'tool_use', id: 'n1', name: 'write_note', input: { title: 'Launch plan', body: 'Steps' } }],
    [{ type: 'text', text: 'Plan saved.' }],
    [{ type: 'tool_use', id: 'p1', name: 'publish_post', input: { network: 'linkedin', text: 'We are live' } }],
  ]);
  const res = await orchestrate(deps, ORG, 'Launch this week');
  assert.equal(res.steps.length, 2);
  assert.equal(res.steps[0].task.status, 'done');
  assert.equal(res.steps[1].task.status, 'awaiting_approval');
  assert.equal(res.parent.status, 'awaiting_approval');
  const brief = await buildBriefing(store, ORG);
  assert.equal(brief.needsYou.length, 1);
  assert.ok(brief.shipped.some((s) => s.includes('Launch plan')));
});

test('Claude client sends the routed model and parses the reply', async () => {
  let body: Record<string, unknown> = {};
  const fakeFetch = (async (_url: string, init: RequestInit) => {
    body = JSON.parse(String(init.body));
    return new Response(JSON.stringify({ content: [{ type: 'text', text: 'hi' }], stop_reason: 'end_turn' }), { status: 200 });
  }) as unknown as typeof fetch;
  const c = new AnthropicClient({ apiKey: 'k', fetchImpl: fakeFetch, models: { worker: 'test-model' } });
  const r = await c.complete({ tier: 'worker', system: 's', messages: [{ role: 'user', content: 'x' }] });
  assert.equal(body.model, 'test-model');
  assert.equal(r.stopReason, 'end_turn');
});
