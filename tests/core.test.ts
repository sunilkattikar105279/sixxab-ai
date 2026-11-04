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

test('Supabase store sends new secret keys only in apikey, legacy JWTs also as Bearer', async () => {
  const { SupabaseStore } = await import('../core/supabase-store.js');
  const seen: Record<string, string>[] = [];
  const fakeFetch = (async (_u: string, init: RequestInit) => {
    seen.push(init.headers as Record<string, string>);
    return new Response('[]', { status: 200 });
  }) as unknown as typeof fetch;
  await new SupabaseStore('https://x.supabase.co', 'sb_secret_abc', fakeFetch).listApprovals('o');
  await new SupabaseStore('https://x.supabase.co', 'eyJhbGciOi.eyJyb2xlIjoi.c2ln', fakeFetch).listApprovals('o');
  assert.equal(seen[0].apikey, 'sb_secret_abc');
  assert.equal(seen[0].authorization, undefined);
  assert.equal(seen[1].authorization, 'Bearer eyJhbGciOi.eyJyb2xlIjoi.c2ln');
});

test('Supabase URL is accepted as a full URL, a bare host, or just the project ref', async () => {
  const { normalizeSupabaseUrl } = await import('../server/context.js');
  const want = 'https://pctqqqtdrgiudhyiyrmw.supabase.co';
  assert.equal(normalizeSupabaseUrl('pctqqqtdrgiudhyiyrmw'), want);
  assert.equal(normalizeSupabaseUrl(' https://pctqqqtdrgiudhyiyrmw.supabase.co/ '), want);
  assert.equal(normalizeSupabaseUrl('pctqqqtdrgiudhyiyrmw.supabase.co'), want);
  assert.equal(normalizeSupabaseUrl('https://pctqqqtdrgiudhyiyrmw.supabase.co/rest/v1'), want);
  assert.equal(normalizeSupabaseUrl('http://evil.example.com'), undefined);
  assert.equal(normalizeSupabaseUrl(undefined), undefined);
});

test('a signed-in user with no workspace gets one created with default autonomy levels', async () => {
  const { SupabaseStore } = await import('../core/supabase-store.js');
  const calls: { path: string; body: unknown }[] = [];
  const fakeFetch = (async (url: string, init: RequestInit) => {
    const path = url.split('/rest/v1/')[1];
    calls.push({ path, body: init.body ? JSON.parse(String(init.body)) : null });
    if (path.startsWith('orgs')) return new Response(JSON.stringify([{ id: 'org-new' }]), { status: 201 });
    return new Response('[]', { status: 201 });
  }) as unknown as typeof fetch;
  const store = new SupabaseStore('https://x.supabase.co', 'sb_secret_abc', fakeFetch);
  const orgId = await store.provisionWorkspace('user-1', 'founder@acme.com');
  assert.equal(orgId, 'org-new');
  assert.deepEqual(calls[0].body, { name: 'founder@acme.com' });
  assert.deepEqual(calls[1].body, { org_id: 'org-new', user_id: 'user-1', role: 'owner' });
  const types = calls[2].body as { key: string; level: number; org_id: string }[];
  assert.equal(types.length, DEFAULT_TASK_TYPES.length);
  assert.ok(types.every((t) => t.org_id === 'org-new'));
  assert.equal(types.find((t) => t.key === 'spend_money')!.level, 1);
  assert.ok(calls[3].path.startsWith('audit_log'));
});

// ---------- company profile, recall, tool robustness (launch feedback) ----------

test('the company profile is in every agent prompt, even when the goal shares no words with it', async () => {
  const { saveCompanyProfile, loadCompanyProfile } = await import('../core/profile.js');
  const { store, model, deps } = setup([[{ type: 'text', text: 'ok' }]]);
  await saveCompanyProfile(store, ORG, { name: 'SIXXAB AI', offer: 'AI agents that run your company', customers: 'Solo founders and SMBs in the US and India' }, 'founder');
  const p = await loadCompanyProfile(store, ORG);
  assert.equal(p?.name, 'SIXXAB AI');
  const task = await createTask(store, ORG, 'social-poster', 'Draft a LinkedIn post');
  await runTask(deps, task.id);
  assert.match(model.calls[0].system, /AI agents that run your company/);
  assert.ok(store.auditLog.some((e) => e.action === 'profile.updated'));
});

test('saving the profile again replaces it rather than stacking old versions', async () => {
  const { saveCompanyProfile, loadCompanyProfile } = await import('../core/profile.js');
  const { store } = setup([]);
  await saveCompanyProfile(store, ORG, { name: 'Old' }, 'founder');
  await new Promise((r) => setTimeout(r, 5));
  await saveCompanyProfile(store, ORG, { name: 'New', voice: 'Warm, direct' }, 'founder');
  assert.equal((await loadCompanyProfile(store, ORG))?.name, 'New');
});

test('memory search matches any word, not all of them', async () => {
  const { toOrQuery } = await import('../core/supabase-store.js');
  assert.equal(toOrQuery('company niche, budget & audience!'), 'company or niche or budget or audience');
  assert.equal(toOrQuery('  '), '');
});

test('tools accept numbers where text is expected and explain what was missing', async () => {
  const { TOOLS } = await import('../core/tools.js');
  const { store } = setup([]);
  const ctx = { store, orgId: ORG, task: {} as never, agent: { id: 'cmo' } as never, integrations: new RecordingIntegrations() };
  assert.equal(await TOOLS.write_note.execute({ title: 2026, body: 'Plan' }, ctx), 'Saved note "2026"');
  await assert.rejects(() => TOOLS.write_note.execute({ title: 'Plan' }, ctx), /body/);
});

// ---------- non-blocking approvals (second live run) ----------

test('several posts are all queued for approval in one run; nothing is sent until approved', async () => {
  const { store, integrations, deps } = setup([
    [{ type: 'tool_use', id: 'p1', name: 'publish_post', input: { network: 'linkedin', text: 'Monday post' } }],
    [{ type: 'tool_use', id: 'p2', name: 'publish_post', input: { network: 'linkedin', text: 'Tuesday post' } }],
    [{ type: 'text', text: 'Queued both posts.' }],
  ]);
  const task = await createTask(store, ORG, 'social-poster', 'Write the week of LinkedIn posts');
  const run = await runTask(deps, task.id);
  assert.equal(run.task.status, 'done', 'the agent finishes instead of waiting');
  assert.equal(run.approvals?.length, 2);
  assert.equal((await store.listApprovals(ORG, 'pending')).length, 2);
  assert.equal(integrations.sent.length, 0, 'nothing is sent before approval');

  await decide(deps, run.approvals![0].id, { approved: true, edited: { text: 'Monday post, edited' }, by: 'founder' });
  assert.deepEqual(integrations.sent[0], { action: 'publish_post', payload: { network: 'linkedin', text: 'Monday post, edited', when: 'now' } });
  await decide(deps, run.approvals![1].id, { approved: false, reason: 'Wrong tone', by: 'founder' });
  assert.equal(integrations.sent.length, 1, 'a rejected post is never sent');
  assert.equal((await evalCases(store, ORG)).length, 1, 'edits become eval cases');
  assert.ok((await store.listFeedback(ORG)).some((f) => f.outcome === 'rejected' && f.reason === 'Wrong tone'));
});

test('an empty post is refused before it reaches the approvals inbox', async () => {
  const { store, model, deps } = setup([
    [{ type: 'tool_use', id: 'x1', name: 'publish_post', input: { network: 'x', text: '' } }],
    [{ type: 'tool_use', id: 'x2', name: 'publish_post', input: { network: 'x', text: 'Real tweet' } }],
    [{ type: 'text', text: 'Done.' }],
  ]);
  const task = await createTask(store, ORG, 'social-poster', 'Tweet the launch');
  const run = await runTask(deps, task.id);
  const pending = await store.listApprovals(ORG, 'pending');
  assert.equal(pending.length, 1);
  assert.equal(pending[0].proposed.text, 'Real tweet');
  assert.match(JSON.stringify(model.calls[1].messages.at(-1)), /Missing \\"text\\"/);
  assert.equal(run.task.status, 'done');
});

test('workers get room for long content and a cut-off reply is nudged to finish', async () => {
  const { store, model, deps } = setup([]);
  model.complete = async function (req) {
    this.calls.push(req);
    return this.calls.length === 1
      ? { content: [{ type: 'text', text: 'A very long plan that got cut' }], stopReason: 'max_tokens' }
      : { content: [{ type: 'text', text: 'Short summary.' }], stopReason: 'end_turn' };
  };
  const task = await createTask(store, ORG, 'cmo', 'Plan the quarter');
  const run = await runTask(deps, task.id);
  assert.ok((model.calls[0].maxTokens ?? 0) >= 8000);
  assert.equal(run.task.output, 'Short summary.');
  assert.match(JSON.stringify(model.calls[1].messages.at(-1)), /cut off/);
});

test('rejecting an autonomous task demotes it to approval', async () => {
  const types = DEFAULT_TASK_TYPES.map((t) => (t.key === 'spend_money' ? { ...t, level: 3 as const, maxLevel: 3 as const } : t));
  const { store, integrations, deps } = setup([
    [{ type: 'tool_use', id: 's1', name: 'spend_money', input: { amountMinor: 90_000, currency: 'USD', purpose: 'Ads', payee: 'Meta' } }],
    [{ type: 'text', text: 'Holding the spend.' }],
  ], types);
  const task = await createTask(store, ORG, 'cmo', 'Boost the launch');
  const run = await runTask(deps, task.id);
  assert.equal(run.approvals?.length, 1, 'over the cap, even L3 must ask');
  await decide(deps, run.approvals![0].id, { approved: false, reason: 'Too much', by: 'founder' });
  assert.equal((await store.getTaskTypes(ORG)).find((t) => t.key === 'spend_money')!.level, 2);
  assert.equal(integrations.sent.length, 0);
});

test('an L1 task becomes a draft and is never executed by the platform', async () => {
  const { store, integrations, deps } = setup([
    [{ type: 'tool_use', id: 'e1', name: 'send_email_campaign', input: { list: 'all', subject: 'Hi', body: 'Body' } }],
    [{ type: 'text', text: 'Draft handed over.' }],
  ]);
  const task = await createTask(store, ORG, 'cmo', 'Email everyone');
  const run = await runTask(deps, task.id);
  assert.equal(run.approvals?.[0].kind, 'draft');
  await decide(deps, run.approvals![0].id, { approved: true, by: 'founder' });
  assert.equal(integrations.sent.length, 0, 'the person sends L1 work themselves');
});

test('a goal is planned first, then each step runs on its own, then the goal settles', async () => {
  const { planGoal, settleParent } = await import('../core/orchestrator.js');
  const { store, deps } = setup([
    [{ type: 'text', text: '{"steps":[{"agentId":"strategy-coach","goal":"Write launch plan"},{"agentId":"social-poster","goal":"Announce launch"}]}' }],
    [{ type: 'tool_use', id: 'n1', name: 'write_note', input: { title: 'Launch plan', body: 'Steps' } }],
    [{ type: 'text', text: 'Plan saved.' }],
    [{ type: 'tool_use', id: 'p1', name: 'publish_post', input: { network: 'linkedin', text: 'We are live' } }],
    [{ type: 'text', text: 'Post queued.' }],
  ]);
  const planned = await planGoal(deps, ORG, 'Launch this week');
  assert.equal(planned.steps.length, 2);
  assert.ok(planned.steps.every((s) => s.task.status === 'planned'));
  assert.equal((await settleParent(deps, planned.parent.id))!.status, 'running', 'not settled while steps remain');
  for (const s of planned.steps) await runTask(deps, s.task.id);
  const parent = await settleParent(deps, planned.parent.id);
  assert.equal(parent!.status, 'done');
  assert.match(parent!.output ?? '', /1 item\(s\) waiting/);
  const brief = await buildBriefing(store, ORG);
  assert.equal(brief.needsYou.length, 1);
  assert.ok(brief.shipped.some((s) => s.includes('Launch plan')));
});

test('approvals created by the earlier blocking design still resume their task', async () => {
  const { store, integrations, deps } = setup([[{ type: 'text', text: 'Resumed and finished.' }]]);
  const task = await createTask(store, ORG, 'social-poster', 'Old post');
  const approvalId = 'legacy-1';
  await store.createApproval({ id: approvalId, orgId: ORG, taskId: task.id, kind: 'approve', taskType: 'publish_post', summary: 'Old', proposed: { network: 'x', text: 'Old post' }, status: 'pending', edited: null, reason: null, decidedBy: null, createdAt: new Date().toISOString(), decidedAt: null });
  await store.updateTask(task.id, {
    status: 'awaiting_approval',
    transcript: [{ role: 'user', content: 'Old post' }, { role: 'assistant', content: [{ type: 'tool_use', id: 'u1', name: 'publish_post', input: { network: 'x', text: 'Old post' } }] }],
    pending: { tool: 'publish_post', input: { network: 'x', text: 'Old post' }, toolUseId: 'u1', approvalId, priorResults: [], remaining: [] },
  });
  const res = await decide(deps, approvalId, { approved: true, by: 'founder' });
  assert.equal(res.task.status, 'done');
  assert.equal(integrations.sent.length, 1);
});

// ---------- third live run: money labels, honest activity, no invented offers ----------

test('spend summaries show real money, not minor units', async () => {
  const { TOOLS } = await import('../core/tools.js');
  assert.equal(TOOLS.spend_money.summarize({ amountMinor: 5000, currency: 'USD', purpose: 'X Ads', payee: 'X' }), 'Spend $50.00 on X Ads (X)');
  assert.equal(TOOLS.spend_money.summarize({ amountMinor: 1250050, currency: 'INR', purpose: 'Meta', payee: 'Meta' }), 'Spend ₹12,500.50 on Meta (Meta)');
});

test('without automations an approved post is recorded as not sent, and the log says so', async () => {
  const { webhookIntegrations } = await import('../core/tools.js');
  const { store, deps } = setup([
    [{ type: 'tool_use', id: 'p1', name: 'publish_post', input: { network: 'linkedin', text: 'Hello' } }],
    [{ type: 'text', text: 'Queued.' }],
  ]);
  const d = { ...deps, integrations: webhookIntegrations(undefined, undefined) };
  const task = await createTask(store, ORG, 'social-poster', 'Post');
  const run = await runTask(d, task.id);
  await decide(d, run.approvals![0].id, { approved: true, by: 'founder' });
  const ev = store.auditLog.find((e) => e.action === 'tool.recorded');
  assert.ok(ev, 'logged as recorded, not executed');
  assert.match(String(ev!.detail.result), /not sent/);
});

test('agents are told never to invent offers, prices or claims', async () => {
  const { AGENTS } = await import('../core/agents.js');
  for (const a of AGENTS.filter((x) => x.usesModel && x.id !== 'morning-briefing')) {
    assert.match(a.instructions, /Never invent offers, prices, discounts, free trials, guarantees, customer names or statistics/);
  }
});

test('n8n reply becomes the receipt; the secret header and payload are sent', async () => {
  const { webhookIntegrations } = await import('../core/tools.js');
  let seen: { url: string; init: RequestInit } | undefined;
  const fakeFetch = (async (url: string, init: RequestInit) => {
    seen = { url, init };
    return new Response(JSON.stringify({ ok: true, message: 'Posted to LinkedIn: https://lnkd.in/x' }), { status: 200 });
  }) as unknown as typeof fetch;
  const out = await webhookIntegrations('https://n8n.example/webhook/sixxab', 's3cret', fakeFetch).dispatch('publish_post', { network: 'linkedin', text: 'hi' });
  assert.equal(out, 'Posted to LinkedIn: https://lnkd.in/x');
  assert.equal((seen!.init.headers as Record<string, string>)['x-sixxab-secret'], 's3cret');
  assert.deepEqual(JSON.parse(String(seen!.init.body)), { action: 'publish_post', payload: { network: 'linkedin', text: 'hi' } });
  assert.ok(seen!.init.signal, 'request has a timeout signal');
});

test('n8n saying it could not publish is an error, not a success', async () => {
  const { webhookIntegrations } = await import('../core/tools.js');
  const fakeFetch = (async () => new Response(JSON.stringify({ ok: false, message: 'LinkedIn token expired' }), { status: 200 })) as unknown as typeof fetch;
  await assert.rejects(webhookIntegrations('https://n8n.example/w', 's', fakeFetch).dispatch('publish_post', {}), /LinkedIn token expired/);
});

test('a plain 2xx reply from n8n without JSON still counts as dispatched', async () => {
  const { webhookIntegrations } = await import('../core/tools.js');
  const fakeFetch = (async () => new Response('Workflow was started', { status: 200 })) as unknown as typeof fetch;
  assert.match(await webhookIntegrations('https://n8n.example/w', 's', fakeFetch).dispatch('send_message', {}), /Dispatched "send_message"/);
});

test('a failing n8n webhook reports its status and message', async () => {
  const { webhookIntegrations } = await import('../core/tools.js');
  const fakeFetch = (async () => new Response(JSON.stringify({ message: 'Authorization data is wrong!' }), { status: 403 })) as unknown as typeof fetch;
  await assert.rejects(webhookIntegrations('https://n8n.example/w', 's', fakeFetch).dispatch('publish_post', {}), /403.*Authorization data is wrong/);
});

test('an approved post that n8n fails to publish shows up in the log with the reason', async () => {
  const { webhookIntegrations } = await import('../core/tools.js');
  const { store, deps } = setup([
    [{ type: 'tool_use', id: 'p1', name: 'publish_post', input: { network: 'x', text: 'Hello' } }],
    [{ type: 'text', text: 'Queued.' }],
  ]);
  const fakeFetch = (async () => new Response(JSON.stringify({ ok: false, message: 'X account not connected in n8n' }), { status: 200 })) as unknown as typeof fetch;
  const d = { ...deps, integrations: webhookIntegrations('https://n8n.example/w', 's', fakeFetch) };
  const task = await createTask(store, ORG, 'social-poster', 'Post');
  const run = await runTask(d, task.id);
  await decide(d, run.approvals![0].id, { approved: true, by: 'founder' });
  const ev = store.auditLog.find((e) => e.action === 'tool.failed');
  assert.ok(ev, 'failure is logged');
  assert.match(String(ev!.detail.error), /X account not connected/);
  assert.ok(!store.auditLog.some((e) => e.action === 'tool.executed' && e.detail.tool === 'publish_post'));
});

test('autonomy progress shows clean approvals so far and when an upgrade is earned', async () => {
  const { autonomyProgress } = await import('../core/learning.js');
  const { store } = setup([]);
  for (let i = 0; i < 14; i++) await store.addFeedback(fb('approved', `2026-11-01T00:00:${String(i).padStart(2, '0')}Z`));
  await store.addFeedback(fb('approved_with_edits', '2026-11-02T00:00:00Z', 'send_message'));
  let p = await autonomyProgress(store, ORG);
  const post = p.find((x) => x.taskType === 'publish_post')!;
  assert.deepEqual([post.streak, post.needed, post.proposal], [14, 15, null]);
  assert.equal(p.find((x) => x.taskType === 'send_message')!.streak, 0, 'an edit resets the streak');
  assert.equal(p.find((x) => x.taskType === 'internal_note')!.needed, null, 'already at its highest level');
  assert.equal(p.find((x) => x.taskType === 'spend_money')!.maxLevel, 2, 'money tops out at approval');

  await store.addFeedback(fb('approved', '2026-11-03T00:00:00Z'));
  p = await autonomyProgress(store, ORG);
  assert.deepEqual(p.find((x) => x.taskType === 'publish_post')!.proposal, { taskType: 'publish_post', from: 2, to: 3, because: '15 approvals in a row with no edits' });
});

// ---------- Comment Responder ----------
test('a LinkedIn "copy link to comment" URL becomes the thread and comment to reply to', async () => {
  const { parseLinkedInComment } = await import('../core/tools.js');
  const url = 'https://www.linkedin.com/feed/update/urn:li:activity:7523606744000000000?commentUrn=urn%3Ali%3Acomment%3A%28activity%3A7523606744000000000%2C7523609999000000000%29&dashCommentUrn=urn%3Ali%3Afsd_comment%3A%287523609999000000000%2Curn%3Ali%3Aactivity%3A7523606744000000000%29';
  assert.deepEqual(parseLinkedInComment(url), {
    threadUrn: 'urn:li:activity:7523606744000000000',
    commentUrn: 'urn:li:comment:(urn:li:activity:7523606744000000000,7523609999000000000)',
  });
  assert.deepEqual(parseLinkedInComment('urn:li:comment:(urn:li:ugcPost:111,222)'), { threadUrn: 'urn:li:ugcPost:111', commentUrn: 'urn:li:comment:(urn:li:ugcPost:111,222)' });
  assert.equal(parseLinkedInComment('https://www.linkedin.com/feed/update/urn:li:activity:1'), null, 'a post link without a comment is not enough');
  assert.equal(parseLinkedInComment('nonsense'), null);
});

test('an approved comment reply is handed to automations with the thread, comment and text', async () => {
  const { TOOLS } = await import('../core/tools.js');
  const sent: unknown[] = [];
  const ctx = { integrations: { dispatch: async (a: string, p: Record<string, unknown>) => { sent.push({ a, p }); return 'Replied on LinkedIn'; } } } as never;
  const out = await TOOLS.reply_comment.execute({ network: 'LinkedIn', commentUrl: 'urn:li:comment:(activity:5,6)', commenter: 'Tauseef', text: 'Thanks, agreed.' }, ctx);
  assert.equal(out, 'Replied on LinkedIn');
  assert.deepEqual(sent, [{ a: 'reply_comment', p: { network: 'linkedin', threadUrn: 'urn:li:activity:5', commentUrn: 'urn:li:comment:(urn:li:activity:5,6)', commenter: 'Tauseef', text: 'Thanks, agreed.' } }]);
  await assert.rejects(TOOLS.reply_comment.execute({ network: 'linkedin', commentUrl: 'https://x.com/a', text: 'hi' }, ctx), /copy link to comment/i);
  assert.match(TOOLS.reply_comment.summarize({ network: 'linkedin', commenter: 'Tauseef', text: 'Thanks' }), /Reply on linkedin to Tauseef: "Thanks"/);
});

test('the Comment Responder exists, replies only through approval, and companies get the new action type', async () => {
  const { getAgent } = await import('../core/agents.js');
  const agent = getAgent('comment-responder')!;
  assert.ok(agent.tools.includes('reply_comment') && !agent.tools.includes('publish_post'));
  const t = DEFAULT_TASK_TYPES.find((x) => x.key === 'reply_comment')!;
  assert.deepEqual([t.level, t.risk], [2, 'external']);
});

test('existing companies are given any default action types they are missing', async () => {
  const { SupabaseStore } = await import('../core/supabase-store.js');
  const calls: { url: string; init: RequestInit }[] = [];
  const fakeFetch = (async (url: string, init: RequestInit = {}) => {
    calls.push({ url, init });
    if ((init.method ?? 'GET') === 'GET') return new Response(JSON.stringify([{ org_id: 'o1', key: 'publish_post', label: 'Publish', level: 3, risk: 'external', approvals_to_promote: 15, max_level: 3, spend_cap_minor: null }]), { status: 200 });
    return new Response('', { status: 201 });
  }) as unknown as typeof fetch;
  const store = new SupabaseStore('https://x.supabase.co', 'sb_secret_test', fakeFetch);
  const types = await store.getTaskTypes('o1');
  assert.equal(types.find((t) => t.key === 'publish_post')!.level, 3, 'existing levels are kept');
  assert.ok(types.find((t) => t.key === 'reply_comment'), 'missing type added');
  const insert = calls.find((c) => c.init.method === 'POST')!;
  assert.match(String((insert.init.headers as Record<string, string>).prefer), /ignore-duplicates/);
  assert.ok(!JSON.parse(String(insert.init.body)).some((r: { key: string }) => r.key === 'publish_post'), 'never overwrites an existing level');
});


test('LinkedIn comment links in the newer dashCommentUrn (fsd_comment) format are understood', async () => {
  const { parseLinkedInComment } = await import('../core/tools.js');
  const url = 'https://www.linkedin.com/feed/update/urn:li:activity:7523606744162516992/?dashCommentUrn=urn%3Ali%3Afsd_comment%3A%287523744406617763841%2Curn%3Ali%3Aactivity%3A7523606744162516992%29';
  assert.deepEqual(parseLinkedInComment(url), {
    threadUrn: 'urn:li:activity:7523606744162516992',
    commentUrn: 'urn:li:comment:(urn:li:activity:7523606744162516992,7523744406617763841)',
  });
  assert.equal(parseLinkedInComment('https://www.linkedin.com/feed/update/urn:li:activity:7523606744162516992/'), null, 'a post link alone is not a comment');
});

test('after sign-in, ?next=start|scale|run opens that part of the workspace; anything else goes to the workspace home', async () => {
  const { afterSignInPath } = await import('../src/lib/auth.js');
  assert.equal(afterSignInPath('?next=start'), '/app?journey=start');
  assert.equal(afterSignInPath('?next=run'), '/app?journey=run');
  assert.equal(afterSignInPath(''), '/app');
  assert.equal(afterSignInPath('?next=https://evil.example'), '/app', 'never an open redirect');
});

// ---------- business onboarding profile ----------

test('the business profile collects onboarding sections and reports what is still missing', async () => {
  const { saveBusinessProfile, loadBusinessProfile, PROFILE_SECTIONS, profileCompleteness } = await import('../core/profile.js');
  const { store } = setup([]);
  assert.deepEqual(PROFILE_SECTIONS.map((s) => s.title), ['Basics', 'Offer', 'Customers', 'Numbers', 'Goals', 'Brand and channels']);
  const p = { name: 'Radhakrishna Ortho', industry: 'Healthcare: hospital or clinic', businessStage: 'Paying customers', offer: 'Orthopaedic care', location: 'Tasgaon, Sangli, India', currency: 'INR', revenueMonthly: '450000' };
  await saveBusinessProfile(store, ORG, p, 'sunil');
  const back = await loadBusinessProfile(store, ORG);
  assert.equal(back?.industry, 'Healthcare: hospital or clinic');
  assert.equal(back?.revenueMonthly, '450000');
  const c = profileCompleteness(back!);
  assert.ok(c.percent > 0 && c.percent < 100);
  assert.ok(c.missing.includes('Who you sell to'));
  assert.equal(store.auditLog.at(-1)?.detail.summary, 'Business profile updated');
});

test('a profile saved under the old "Company profile" name still loads', async () => {
  const { loadBusinessProfile } = await import('../core/profile.js');
  const { store } = setup([]);
  await store.remember({ id: 'm1', orgId: ORG, kind: 'fact', text: 'Company profile\nCompany name: SIXXAB AI\nWhat we sell: AI agents', agentId: null, at: '2026-11-01T00:00:00Z' });
  const p = await loadBusinessProfile(store, ORG);
  assert.equal(p?.name, 'SIXXAB AI');
  assert.equal(p?.offer, 'AI agents');
});

test('healthcare businesses get the business-data-only rule in every agent prompt', async () => {
  const { saveBusinessProfile, profileForPrompt } = await import('../core/profile.js');
  const { store } = setup([]);
  await saveBusinessProfile(store, ORG, { name: 'More Laboratory', industry: 'Healthcare: laboratory or diagnostics', offer: 'Pathology tests' }, 'sunil');
  const prompt = await profileForPrompt(store, ORG);
  assert.match(prompt, /More Laboratory/);
  assert.match(prompt, /never ask for, store or repeat patient/i);
  await saveBusinessProfile(store, ORG, { name: 'SIXXAB AI', industry: 'Technology or software', offer: 'AI agents' }, 'sunil');
  assert.doesNotMatch(await profileForPrompt(store, ORG), /patient/i);
});

test('choices outside the allowed options are refused', async () => {
  const { validateProfileInput } = await import('../core/profile.js');
  assert.throws(() => validateProfileInput({ name: 'X', offer: 'Y', industry: 'Crypto casino' }), /industry/i);
  assert.throws(() => validateProfileInput({ name: 'X' }), /What you sell/);
  assert.equal(validateProfileInput({ name: ' X ', offer: 'Y', currency: 'INR' }).name, 'X');
});

// ---------- journey: stages, steps with hard/soft dependencies, revenue, milestones ----------

test('journey steps unlock only when their hard dependencies are done; soft ones only warn', async () => {
  const { loadJourney, completeStep } = await import('../core/journey.js');
  const { saveBusinessProfile } = await import('../core/profile.js');
  const { store } = setup([]);
  let j = await loadJourney(store, ORG);
  assert.equal(j.stage.key, 'startup');
  assert.equal(j.steps.find((s) => s.id === 'onboard')!.status, 'ready');
  assert.equal(j.steps.find((s) => s.id === 'diagnose')!.status, 'blocked');
  assert.deepEqual(j.steps.find((s) => s.id === 'diagnose')!.blockedBy, ['Onboard']);
  await assert.rejects(completeStep(store, ORG, 'diagnose', 'sunil'), /Finish first: Onboard/);

  await saveBusinessProfile(store, ORG, { name: 'More Laboratory', offer: 'Pathology tests', industry: 'Healthcare: laboratory or diagnostics', businessStage: 'Paying customers' }, 'sunil');
  j = await loadJourney(store, ORG);
  assert.equal(j.steps.find((s) => s.id === 'onboard')!.status, 'done', 'a saved profile completes onboarding');
  assert.equal(j.stage.key, 'startup', 'stages follow revenue, not the profile wording');
  const diagnose = j.steps.find((s) => s.id === 'diagnose')!;
  assert.equal(diagnose.status, 'ready');
  assert.ok(diagnose.warnings.includes('Record last month’s revenue'), 'soft dependency warns');
  await completeStep(store, ORG, 'diagnose', 'sunil');
  j = await loadJourney(store, ORG);
  assert.equal(j.steps.find((s) => s.id === 'diagnose')!.status, 'done');
  assert.equal(j.steps.find((s) => s.id === 'restart')!.status, 'ready');
  assert.ok(store.auditLog.some((e) => e.action === 'journey.step_done' && e.detail.step === 'diagnose'));
});

test('revenue is recorded per month; the first paying customer is a milestone celebrated once', async () => {
  const { loadJourney, recordRevenue } = await import('../core/journey.js');
  const { saveBusinessProfile } = await import('../core/profile.js');
  const { store } = setup([]);
  await saveBusinessProfile(store, ORG, { name: 'New Co', offer: 'Coaching', currency: 'USD' }, 'sunil');
  await recordRevenue(store, ORG, { month: '2026-10', amount: 1200, note: 'First two clients' }, 'sunil');
  await recordRevenue(store, ORG, { month: '2026-10', amount: 1500 }, 'sunil');
  const j = await loadJourney(store, ORG);
  assert.equal(j.stage.key, 'startup', 'Struggle opens at a $10K month');
  assert.deepEqual(j.revenue.months, [{ month: '2026-10', amount: 1500, currency: 'USD' }], 'the latest entry for a month wins');
  assert.ok(j.milestones.find((m) => m.key === 'first_customer')!.reachedAt);
  await loadJourney(store, ORG);
  assert.equal(store.auditLog.filter((e) => e.action === 'milestone.reached' && e.detail.key === 'first_customer').length, 1, 'celebrated once');
  await assert.rejects(recordRevenue(store, ORG, { month: '2026-13', amount: 5 }, 'sunil'), /month/);
  await assert.rejects(recordRevenue(store, ORG, { month: '2026-10', amount: -5 }, 'sunil'), /amount/);
});

test('the six stages each have steps, and every step agent is real and only plans or records', async () => {
  const { STAGES, STEPS } = await import('../core/journey.js');
  const { getAgent } = await import('../core/agents.js');
  const { TOOLS } = await import('../core/tools.js');
  assert.deepEqual(STAGES.map((s) => s.key), ['startup', 'struggle', 'scale', 'success', 'significance', 'sixxab']);
  for (const st of STAGES) assert.ok(STEPS.some((x) => x.stage === st.head), `steps for ${st.head}`);
  for (const x of STEPS) {
    for (const h of x.hard) assert.ok(STEPS.some((y) => y.id === h), `${x.id} depends on unknown ${h}`);
    if (!x.agentId) continue;
    const a = getAgent(x.agentId);
    assert.ok(a?.usesModel, `${x.id}: agent ${x.agentId}`);
    for (const t of a!.tools) {
      const tt = TOOLS[t]?.taskType ? DEFAULT_TASK_TYPES.find((d) => d.key === TOOLS[t].taskType) : null;
      if (tt && tt.risk !== 'internal') assert.ok(tt.level <= 2, `${x.agentId}: ${t} must wait for the owner by default`);
    }
  }
});

test('agents see the business journey: stage, next step and recent revenue', async () => {
  const { recordRevenue } = await import('../core/journey.js');
  const { saveBusinessProfile } = await import('../core/profile.js');
  const { store, model, deps } = setup([[{ type: 'text', text: 'ok' }]]);
  await saveBusinessProfile(store, ORG, { name: 'Radhakrishna Ortho', offer: 'Orthopaedic care', currency: 'INR' }, 'sunil');
  await recordRevenue(store, ORG, { month: '2026-10', amount: 450000 }, 'sunil');
  const task = await createTask(store, ORG, 'health-check', 'Run the health check');
  await runTask(deps, task.id);
  const sys = model.calls[0].system;
  assert.match(sys, /Stage: Startup/);
  assert.match(sys, /Next step: Diagnose/);
  assert.match(sys, /2026-10: 450000 INR/);
});

test('the Start-the-business stage agents exist, use only safe tools, and every journey step agent is real', async () => {
  const { getAgent } = await import('../core/agents.js');
  const { STEPS } = await import('../core/journey.js');
  for (const id of ['onboarding-guide', 'health-check', 'niche-offer', 'roadmap-planner', 'milestone-tracker']) {
    const a = getAgent(id);
    assert.ok(a?.usesModel, id);
    assert.ok(a!.tools.every((t) => ['recall', 'remember', 'write_note'].includes(t)), `${id} only plans and records; it never sends or spends`);
  }
  for (const s of STEPS) if (s.agentId) assert.ok(getAgent(s.agentId), `step ${s.id} agent ${s.agentId}`);
});

test('stages follow revenue: monthly gates to Success, annual for Significance and SIXXAB, rupees converted', async () => {
  const { computeJourney } = await import('../core/journey.js');
  const ev = (month: string, amount: number, at = `${month}-28T00:00:00Z`) => ({ id: month + amount, orgId: ORG, at, actor: 'o', action: 'revenue.recorded', taskId: null, detail: { month, amount } });
  const usd = { name: 'X', offer: 'Y', currency: 'USD' };
  assert.equal(computeJourney(usd, [ev('2026-09', 9999)]).stage.key, 'startup');
  assert.equal(computeJourney(usd, [ev('2026-09', 10000)]).stage.key, 'struggle');
  assert.equal(computeJourney(usd, [ev('2026-09', 60000)]).stage.key, 'scale');
  assert.equal(computeJourney(usd, [ev('2026-09', 120000)]).stage.key, 'success', 'a $100K month alone is not $1M a year');
  const year = Array.from({ length: 12 }, (_, i) => ev(`2026-${String(i + 1).padStart(2, '0')}`, 100000));
  assert.equal(computeJourney(usd, year).stage.key, 'significance', '$1.2M in 12 months');
  const big = Array.from({ length: 12 }, (_, i) => ev(`2026-${String(i + 1).padStart(2, '0')}`, 900000));
  assert.equal(computeJourney(usd, big).stage.key, 'sixxab', '$10.8M in 12 months');
  const inr = { name: 'Clinic', offer: 'Care', currency: 'INR' };
  assert.equal(computeJourney(inr, [ev('2026-10', 450000)]).stage.key, 'startup', '₹4.5L ≈ $5.3K at 85');
  assert.equal(computeJourney(inr, [ev('2026-10', 900000)]).stage.key, 'struggle', '₹9L ≈ $10.6K at 85');
  assert.equal(computeJourney(inr, [ev('2026-10', 900000)], { inrPerUsd: 95 }).stage.key, 'startup', 'rate is a setting');
  const j = computeJourney(usd, [ev('2026-09', 60000)]);
  assert.ok(j.milestones.find((m) => m.key === 'month_10k')!.reachedAt);
  assert.ok(j.milestones.find((m) => m.key === 'month_50k')!.reachedAt);
  assert.equal(j.milestones.find((m) => m.key === 'month_100k')!.reachedAt, null);
  assert.match(j.nextGate, /\$100K month/);
});
