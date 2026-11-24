// Tools for the customer stages of the sales flow. Like the lead generation tools they send nothing: they
// save drafts and records onto a won deal for the owner, so they have no task type (still audited).
import type { Tool } from './tools.js';
import { saveAccountReview, saveOnboarding } from './salesflow.js';
import { STEP_OWNERS } from './salesflow-state.js';

const str = { type: 'string' } as const;
const contactId = { type: 'string', description: 'The deal id from read_crm' } as const;
const draft = { type: 'object', properties: { subject: str, text: str }, required: ['text'] } as const;

export const SALESFLOW_TOOLS: Record<string, Tool> = {
  save_onboarding: {
    spec: {
      name: 'save_onboarding',
      description: 'Save an onboarding plan onto a won customer: steps over the first 30 days, a welcome email draft and a kickoff agenda. Nothing is sent; the owner sends the welcome and ticks steps done.',
      input_schema: {
        type: 'object',
        properties: {
          contactId,
          steps: { type: 'array', minItems: 2, maxItems: 12, items: { type: 'object', properties: { day: { type: 'number' }, title: str, owner: { type: 'string', enum: [...STEP_OWNERS] } }, required: ['day', 'title', 'owner'] } },
          welcome: draft,
          kickoff: { type: 'string', description: 'A 30-minute kickoff agenda' },
          notes: { type: 'string', description: 'Anything to check first' },
        },
        required: ['contactId', 'steps'],
      },
    },
    summarize: (i) => `Plan onboarding for ${String(i.contactId ?? '')}`,
    execute: (i, ctx) => saveOnboarding(ctx.store, ctx.orgId, i.contactId, i, ctx.agent.name),
  },
  save_account_review: {
    spec: {
      name: 'save_account_review',
      description: 'Save an account review onto a won customer: health 0 to 100 with reasons, risks, a check-in message draft, the renewal date and plan, upsell ideas and (health 70+) a referral ask draft. Nothing is sent.',
      input_schema: {
        type: 'object',
        properties: {
          contactId, health: { type: 'number' }, reasons: str, risks: str, checkIn: draft,
          renewalDate: { type: 'string', description: 'YYYY-MM-DD, only if the record states it' }, renewalPlan: str,
          upsell: { type: 'array', items: str, maxItems: 3 }, referral: draft,
        },
        required: ['contactId', 'health', 'reasons'],
      },
    },
    summarize: (i) => `Account review for ${String(i.contactId ?? '')}: health ${String(i.health ?? '')}`,
    execute: (i, ctx) => saveAccountReview(ctx.store, ctx.orgId, i.contactId, i, ctx.agent.name),
  },
};
