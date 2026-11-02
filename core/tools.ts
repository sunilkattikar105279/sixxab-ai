// Tools agents can call. Each tool that changes anything outside the agent names a task type,
// and the autonomy policy decides whether it runs, waits for approval, or becomes a draft.
import type { Memory, RoleCard, Task, ToolSpec } from './types.js';
import { newId, nowIso, type Store } from './store.js';

export interface Integrations {
  /** Hands an action to the automation layer (n8n webhook in production). Returns a short receipt. */
  dispatch(action: string, payload: Record<string, unknown>): Promise<string>;
}

export interface ToolContext {
  store: Store;
  orgId: string;
  task: Task;
  agent: RoleCard;
  integrations: Integrations;
}

export interface Tool {
  spec: ToolSpec;
  /** Undefined = read-only, always allowed. */
  taskType?: string;
  /** Human-readable one-liner for the approvals inbox. */
  summarize(input: Record<string, unknown>): string;
  execute(input: Record<string, unknown>, ctx: ToolContext): Promise<string>;
}

const str = (v: unknown, max = 4000): string => {
  if (typeof v !== 'string') throw new Error('Expected a string');
  const t = v.trim();
  if (!t) throw new Error('Empty value');
  return t.slice(0, max);
};

export const TOOLS: Record<string, Tool> = {
  write_note: {
    taskType: 'internal_note',
    spec: {
      name: 'write_note',
      description: 'Save a plan, summary or internal note to the company workspace.',
      input_schema: { type: 'object', properties: { title: { type: 'string' }, body: { type: 'string' } }, required: ['title', 'body'] },
    },
    summarize: (i) => `Save note: ${String(i.title ?? '')}`,
    async execute(i, ctx) {
      const title = str(i.title, 200);
      const body = str(i.body, 20000);
      await ctx.store.remember({ id: newId(), orgId: ctx.orgId, kind: 'note', text: `${title}\n\n${body}`, agentId: ctx.agent.id, at: nowIso() });
      return `Saved note "${title}"`;
    },
  },
  remember: {
    taskType: 'memory_write',
    spec: {
      name: 'remember',
      description: 'Store a durable fact or decision about the company in shared memory.',
      input_schema: {
        type: 'object',
        properties: { kind: { type: 'string', enum: ['fact', 'decision', 'outcome'] }, text: { type: 'string' } },
        required: ['kind', 'text'],
      },
    },
    summarize: (i) => `Remember: ${String(i.text ?? '').slice(0, 80)}`,
    async execute(i, ctx) {
      const kind = (['fact', 'decision', 'outcome'] as const).includes(i.kind as Memory['kind'] as 'fact')
        ? (i.kind as Memory['kind'])
        : 'fact';
      await ctx.store.remember({ id: newId(), orgId: ctx.orgId, kind, text: str(i.text, 2000), agentId: ctx.agent.id, at: nowIso() });
      return 'Remembered';
    },
  },
  recall: {
    spec: {
      name: 'recall',
      description: 'Search company memory for relevant facts, decisions and past outcomes.',
      input_schema: { type: 'object', properties: { query: { type: 'string' } }, required: ['query'] },
    },
    summarize: (i) => `Recall: ${String(i.query ?? '')}`,
    async execute(i, ctx) {
      const hits = await ctx.store.recall(ctx.orgId, str(i.query, 500), 5);
      return hits.length ? hits.map((m) => `- (${m.kind}) ${m.text}`).join('\n') : 'Nothing relevant in memory yet.';
    },
  },
  send_message: {
    taskType: 'send_message',
    spec: {
      name: 'send_message',
      description: 'Send a message to a customer or lead on email, WhatsApp or SMS.',
      input_schema: {
        type: 'object',
        properties: { channel: { type: 'string', enum: ['email', 'whatsapp', 'sms'] }, to: { type: 'string' }, text: { type: 'string' } },
        required: ['channel', 'to', 'text'],
      },
    },
    summarize: (i) => `Send ${String(i.channel)} to ${String(i.to)}: "${String(i.text ?? '').slice(0, 80)}"`,
    execute: (i, ctx) => ctx.integrations.dispatch('send_message', { channel: str(i.channel, 20), to: str(i.to, 200), text: str(i.text) }),
  },
  publish_post: {
    taskType: 'publish_post',
    spec: {
      name: 'publish_post',
      description: 'Publish or schedule a social media post.',
      input_schema: {
        type: 'object',
        properties: { network: { type: 'string' }, text: { type: 'string' }, when: { type: 'string', description: 'ISO time, or "now"' } },
        required: ['network', 'text'],
      },
    },
    summarize: (i) => `Post on ${String(i.network)}: "${String(i.text ?? '').slice(0, 80)}"`,
    execute: (i, ctx) => ctx.integrations.dispatch('publish_post', { network: str(i.network, 40), text: str(i.text, 3000), when: i.when ?? 'now' }),
  },
  send_email_campaign: {
    taskType: 'send_email_campaign',
    spec: {
      name: 'send_email_campaign',
      description: 'Send an email campaign to a list.',
      input_schema: {
        type: 'object',
        properties: { list: { type: 'string' }, subject: { type: 'string' }, body: { type: 'string' } },
        required: ['list', 'subject', 'body'],
      },
    },
    summarize: (i) => `Email campaign to ${String(i.list)}: "${String(i.subject ?? '')}"`,
    execute: (i, ctx) => ctx.integrations.dispatch('send_email_campaign', { list: str(i.list, 200), subject: str(i.subject, 300), body: str(i.body, 50000) }),
  },
  spend_money: {
    taskType: 'spend_money',
    spec: {
      name: 'spend_money',
      description: 'Spend money: ad budget, a purchase or a payment. Amount in minor units (cents or paise).',
      input_schema: {
        type: 'object',
        properties: { amountMinor: { type: 'integer' }, currency: { type: 'string' }, purpose: { type: 'string' }, payee: { type: 'string' } },
        required: ['amountMinor', 'currency', 'purpose', 'payee'],
      },
    },
    summarize: (i) => `Spend ${String(i.amountMinor)} ${String(i.currency)} on ${String(i.purpose)} (${String(i.payee)})`,
    execute: (i, ctx) => {
      const amount = Number(i.amountMinor);
      if (!Number.isInteger(amount) || amount <= 0) throw new Error('amountMinor must be a positive integer');
      return ctx.integrations.dispatch('spend_money', { amountMinor: amount, currency: str(i.currency, 3), purpose: str(i.purpose, 300), payee: str(i.payee, 200) });
    },
  },
};

export function toolsFor(agent: RoleCard): Tool[] {
  return agent.tools.map((n) => TOOLS[n]).filter((t): t is Tool => Boolean(t));
}

/** Production dispatcher: posts actions to an n8n webhook. Without one, actions are logged, not sent. */
export function webhookIntegrations(url: string | undefined, secret: string | undefined, fetchImpl: typeof fetch = fetch): Integrations {
  return {
    async dispatch(action, payload) {
      if (!url) return `Recorded "${action}" (no automation webhook configured yet, nothing was sent)`;
      const res = await fetchImpl(url, {
        method: 'POST',
        headers: { 'content-type': 'application/json', ...(secret ? { 'x-sixxab-secret': secret } : {}) },
        body: JSON.stringify({ action, payload }),
      });
      if (!res.ok) throw new Error(`Automation webhook ${res.status}`);
      return `Dispatched "${action}"`;
    },
  };
}
