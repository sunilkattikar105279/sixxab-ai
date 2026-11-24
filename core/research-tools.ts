// Tools for business research and proposals. They send nothing: they save a report or a draft onto the deal
// for the owner, so they have no task type (still audited).
import type { Tool } from './tools.js';
import { saveProposal, saveResearch } from './research.js';
import { CURRENCIES, FOUND_FIELDS } from './research-state.js';

const str = { type: 'string' } as const;
const num = { type: 'number' } as const;
const url = { type: 'string', description: 'The public page address (https://...)' } as const;
const contactId = { type: 'string', description: 'The deal id from read_crm' } as const;

export const RESEARCH_TOOLS: Record<string, Tool> = {
  save_research: {
    spec: {
      name: 'save_research',
      description: 'Save a business research report onto a deal: summary, owner background, online presence, pain points with evidence, missing contact details found on public pages (each with its page), opportunities for AI agents, unknowns and sources. Nothing is sent; the owner checks each found detail before adding it to the deal.',
      input_schema: {
        type: 'object',
        properties: {
          contactId, summary: str, owner: str, presence: str,
          pains: { type: 'array', maxItems: 8, items: { type: 'object', properties: { point: str, evidence: str, source: url }, required: ['point'] } },
          found: { type: 'array', maxItems: 12, items: { type: 'object', properties: { field: { type: 'string', enum: [...FOUND_FIELDS] }, value: str, source: url, note: str }, required: ['field', 'value', 'source'] } },
          opportunities: { type: 'array', maxItems: 6, items: { type: 'object', properties: { title: str, how: str, impact: str }, required: ['title', 'how'] } },
          unknowns: str,
          sources: { type: 'array', maxItems: 15, items: { type: 'object', properties: { title: str, url }, required: ['url'] } },
        },
        required: ['contactId', 'summary'],
      },
    },
    summarize: (i) => `Save business research for ${String(i.contactId ?? '')}`,
    execute: (i, ctx) => saveResearch(ctx.store, ctx.orgId, i.contactId, i, ctx.agent.name),
  },
  save_proposal: {
    spec: {
      name: 'save_proposal',
      description: 'Save a proposal draft onto a deal: title, subject, summary, opportunities with benefits, ROI lines (monthly benefits with their basis; monthly and one-time costs), currency, plan, next step and the full text. The app works out the ROI totals. Nothing is sent; the owner edits and sends it.',
      input_schema: {
        type: 'object',
        properties: {
          contactId, title: str, subject: str, summary: str,
          opportunities: { type: 'array', maxItems: 6, items: { type: 'object', properties: { title: str, what: str, benefit: str }, required: ['title'] } },
          benefits: { type: 'array', minItems: 1, maxItems: 8, items: { type: 'object', properties: { label: str, monthly: num, basis: str }, required: ['label', 'monthly', 'basis'] } },
          costs: { type: 'array', maxItems: 6, items: { type: 'object', properties: { label: str, monthly: num, oneTime: num, basis: str }, required: ['label'] } },
          currency: { type: 'string', enum: [...CURRENCIES] },
          plan: str, nextStep: str, text: { type: 'string', description: 'The full proposal in the owner\'s voice, without ROI totals' },
        },
        required: ['contactId', 'title', 'benefits', 'text'],
      },
    },
    summarize: (i) => `Save a proposal for ${String(i.contactId ?? '')}`,
    execute: (i, ctx) => saveProposal(ctx.store, ctx.orgId, i.contactId, i, ctx.agent.name),
  },
};
