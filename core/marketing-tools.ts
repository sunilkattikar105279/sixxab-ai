// Tools for the AI Marketing Agency. They send nothing: they save the online check and the 30-day plan
// onto the business's Marketing tab for the owner, so they have no task type (still audited).
import type { Tool } from './tools.js';
import { CHECK_ITEMS, saveTailoredPlan, saveValidation } from './marketing.js';

const str = { type: 'string' } as const;

export const MARKETING_TOOLS: Record<string, Tool> = {
  save_assessment_check: {
    spec: {
      name: 'save_assessment_check',
      description: 'Save the check of a business\'s online presence for its marketing assessment: for each of website, booking, google, social, reviews and pixel, found, missing or unclear, a short note and the public page that shows it. A "found" without a page is saved as unclear. Nothing is sent.',
      input_schema: {
        type: 'object',
        properties: {
          checks: {
            type: 'array', minItems: 1, maxItems: 6,
            items: { type: 'object', properties: { item: { type: 'string', enum: [...CHECK_ITEMS] }, status: { type: 'string', enum: ['found', 'missing', 'unclear'] }, note: str, source: { type: 'string', description: 'The public page (https://...)' } }, required: ['item', 'status'] },
          },
          summary: { type: 'string', description: 'Two or three sentences: what is in place and the top gaps' },
        },
        required: ['checks', 'summary'],
      },
    },
    summarize: () => 'Save the marketing assessment check',
    execute: (i, ctx) => saveValidation(ctx.store, ctx.orgId, i, ctx.agent.name),
  },
  save_marketing_plan: {
    spec: {
      name: 'save_marketing_plan',
      description: 'Save a tailored 30-day marketing plan on the business\'s Marketing tab: a summary, the channels, four weeks each with a focus and 3 to 5 actions, and the KPIs. Nothing is posted or spent; the owner reads it there.',
      input_schema: {
        type: 'object',
        properties: {
          summary: str,
          channels: { type: 'array', items: str, maxItems: 6 },
          weeks: { type: 'array', minItems: 4, maxItems: 5, items: { type: 'object', properties: { week: { type: 'number' }, focus: str, actions: { type: 'array', items: str, minItems: 1, maxItems: 6 } }, required: ['week', 'focus', 'actions'] } },
          kpis: { type: 'array', items: str, maxItems: 6 },
        },
        required: ['summary', 'weeks'],
      },
    },
    summarize: () => 'Save the 30-day marketing plan',
    execute: (i, ctx) => saveTailoredPlan(ctx.store, ctx.orgId, i, ctx.agent.name),
  },
};
