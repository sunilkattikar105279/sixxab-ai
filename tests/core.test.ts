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
