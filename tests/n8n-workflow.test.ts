// Checks the importable n8n workflow (integrations/n8n/sixxab-actions.json) is wired correctly:
// every action the platform can send has a route, and every path answers the platform with { ok, message }.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { TOOLS } from '../core/tools.js';

interface N8nNode { name: string; type: string; parameters: Record<string, unknown>; onError?: string; credentials?: unknown }
interface N8nWorkflow { nodes: N8nNode[]; connections: Record<string, { main: { node: string }[][] }> }

const wf = JSON.parse(readFileSync(new URL('../integrations/n8n/sixxab-actions.json', import.meta.url), 'utf8')) as N8nWorkflow;
const byName = new Map(wf.nodes.map((n) => [n.name, n]));
const RESPOND = 'n8n-nodes-base.respondToWebhook';

test('the webhook requires the shared secret header and answers from the workflow', () => {
  const hook = wf.nodes.find((n) => n.type === 'n8n-nodes-base.webhook');
  assert.ok(hook);
  assert.equal(hook!.parameters.httpMethod, 'POST');
  assert.equal(hook!.parameters.authentication, 'headerAuth');
  assert.equal(hook!.parameters.responseMode, 'responseNode');
});

test('every connection points at a node that exists, and node names are unique', () => {
  assert.equal(byName.size, wf.nodes.length);
  for (const [from, { main }] of Object.entries(wf.connections)) {
    assert.ok(byName.has(from), `unknown source ${from}`);
    for (const out of main) for (const c of out) assert.ok(byName.has(c.node), `${from} → unknown ${c.node}`);
  }
});

test('every path from the webhook ends by answering the platform', () => {
  const hook = wf.nodes.find((n) => n.type === 'n8n-nodes-base.webhook')!;
  const walk = (name: string, seen: Set<string>): void => {
    assert.ok(!seen.has(name), `loop at ${name}`);
    const node = byName.get(name)!;
    if (node.type === RESPOND) return;
    const outs = wf.connections[name]?.main ?? [];
    assert.ok(outs.length > 0 && outs.every((o) => o.length > 0), `${name} has an output that goes nowhere`);
    if (node.onError === 'continueErrorOutput') assert.equal(outs.length, 2, `${name} must wire its error output`);
    for (const o of outs) for (const c of o) walk(c.node, new Set([...seen, name]));
  };
  walk(hook.name, new Set());
});

test('nodes that publish or send report failures back instead of crashing the webhook', () => {
  const senders = wf.nodes.filter((n) => /linkedIn|twitter|gmail|twilio|httpRequest/.test(n.type));
  assert.ok(senders.length >= 5);
  for (const n of senders) assert.equal(n.onError, 'continueErrorOutput', n.name);
});

test('every external action the platform can send is routed', () => {
  const code = wf.nodes.find((n) => n.type === 'n8n-nodes-base.code')!;
  const js = String(code.parameters.jsCode);
  for (const t of Object.values(TOOLS)) {
    if (t.taskType && !['internal_note', 'memory_write'].includes(t.taskType)) assert.ok(js.includes(`'${t.spec.name}'`), `no route for ${t.spec.name}`);
  }
});

test('spending only notifies the founder; nothing in the workflow can move money', () => {
  const types = wf.nodes.map((n) => n.type);
  for (const t of types) assert.ok(!/stripe|paypal|razorpay|wise|quickbooks/i.test(t), `money node ${t}`);
  const respond = wf.nodes.find((n) => n.name === 'Reply: founder notified')!;
  assert.match(String(respond.parameters.responseBody), /no money was moved/i);
});

test('no secrets or credential ids are baked into the file', () => {
  for (const n of wf.nodes) assert.equal(n.credentials, undefined, `${n.name} carries credentials`);
  assert.ok(!/sk-|sb_secret_|AC[0-9a-f]{32}/.test(JSON.stringify(wf)));
});
