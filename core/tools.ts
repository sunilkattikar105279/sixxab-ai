// Tools agents can call. Each tool that changes anything outside the agent names a task type,
// and the autonomy policy decides whether it runs, waits for approval, or becomes a draft.
import type { Memory, RoleCard, Task, ToolSpec } from './types.js';
import { newId, nowIso, type Store } from './store.js';

/** Formats minor units (cents, paise) as money for people: 5000 USD → $50.00. */
export function formatMoney(amountMinor: number, currency: string): string {
  if (!Number.isFinite(amountMinor)) return `? ${currency}`;
  const cur = currency.toUpperCase();
  try {
    return new Intl.NumberFormat(cur === 'INR' ? 'en-IN' : 'en-US', { style: 'currency', currency: cur }).format(amountMinor / 100);
  } catch {
    return `${(amountMinor / 100).toFixed(2)} ${cur}`;
  }
}

/** Result prefix when an action was only recorded because no automation is connected. */
export const NOT_SENT_PREFIX = 'Recorded only';

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

/** Reads a required text field, accepting numbers, and names the field when it is missing. */
const field = (input: Record<string, unknown>, name: string, max = 4000): string => {
  const v = input[name];
  const t = typeof v === 'string' ? v.trim() : typeof v === 'number' || typeof v === 'boolean' ? String(v) : '';
  if (!t) throw new Error(`Missing "${name}". Call the tool again with a non-empty "${name}".`);
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
      const title = field(i, 'title', 200);
      const body = field(i, 'body', 20000);
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
      await ctx.store.remember({ id: newId(), orgId: ctx.orgId, kind, text: field(i, 'text', 2000), agentId: ctx.agent.id, at: nowIso() });
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
      const hits = await ctx.store.recall(ctx.orgId, field(i, 'query', 500), 5);
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
    execute: (i, ctx) => ctx.integrations.dispatch('send_message', { channel: field(i, 'channel', 20), to: field(i, 'to', 200), text: field(i, 'text') }),
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
    execute: (i, ctx) => ctx.integrations.dispatch('publish_post', { network: field(i, 'network', 40), text: field(i, 'text', 3000), when: i.when ?? 'now' }),
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
    execute: (i, ctx) => ctx.integrations.dispatch('send_email_campaign', { list: field(i, 'list', 200), subject: field(i, 'subject', 300), body: field(i, 'body', 50000) }),
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
    summarize: (i) => `Spend ${formatMoney(Number(i.amountMinor), String(i.currency ?? 'USD'))} on ${String(i.purpose)} (${String(i.payee)})`,
    execute: (i, ctx) => {
      const amount = Number(i.amountMinor);
      if (!Number.isInteger(amount) || amount <= 0) throw new Error('amountMinor must be a positive integer');
      return ctx.integrations.dispatch('spend_money', { amountMinor: amount, currency: field(i, 'currency', 3), purpose: field(i, 'purpose', 300), payee: field(i, 'payee', 200) });
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
      if (!url) return `${NOT_SENT_PREFIX} "${action}": automations are not connected yet, so it was not sent.`;
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

/** The tool that carries out an approved action of this task type (each external task type has exactly one). */
export function toolForTaskType(taskType: string): Tool | undefined {
  return Object.values(TOOLS).find((t) => t.taskType === taskType);
}
