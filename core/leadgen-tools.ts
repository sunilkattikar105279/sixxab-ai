// CRM tools for the lead generation agents. None of them sends anything to anyone: they read the CRM,
// save drafts and suggestions onto it, and propose new leads for the owner's yes. So they have no task
// type (they run without an approval, and every call is still in the audit log and the deal's history).
import type { Tool } from './tools.js';
import { proposeProspects, readCrm, READ_VIEWS, saveIcp, saveLeadScore, saveObjection, saveSequence, syncDeal } from './leadgen.js';
import { ICP_FIELDS, PROSPECT_FIELDS, SEQUENCE_CHANNELS } from './leadgen-state.js';
import { DEAL_STAGES } from './crm.js';

const str = { type: 'string' } as const;
const contactId = { type: 'string', description: 'The deal id from read_crm' } as const;

export const LEADGEN_TOOLS: Record<string, Tool> = {
  read_crm: {
    spec: {
      name: 'read_crm',
      description: 'Read the CRM. Views: "pipeline" (every deal with its id), "deal" (one deal in full, needs contactId), "deals" (up to 12 deals in full, needs contactIds), "icps" (saved ideal customer profiles), "icp_notes" (what the owner wrote or uploaded about who they sell to), "existing" (businesses already in the CRM or waiting for a yes), "issues" (records that disagree with themselves).',
      input_schema: { type: 'object', properties: { view: { type: 'string', enum: [...READ_VIEWS] }, contactId, contactIds: { type: 'array', items: str, maxItems: 12 } }, required: ['view'] },
    },
    summarize: (i) => `Read the CRM (${String(i.view ?? 'pipeline')})`,
    execute: (i, ctx) => readCrm(ctx.store, ctx.orgId, String(i.view ?? 'pipeline'), i.contactId, i.contactIds),
  },
  save_icp: {
    spec: {
      name: 'save_icp',
      description: 'Save an ideal customer profile to the CRM. Pass the id of a saved ICP to update it instead of adding another.',
      input_schema: {
        type: 'object',
        properties: { id: { type: 'string', description: 'Only when updating a saved ICP' }, name: { type: 'string', description: 'Short name, e.g. "DFW personal injury firms"' }, ...Object.fromEntries(ICP_FIELDS.map((f) => [f, str])) },
        required: ['name', 'summary'],
      },
    },
    summarize: (i) => `Save ICP: ${String(i.name ?? '')}`,
    async execute(i, ctx) {
      const icp = await saveIcp(ctx.store, ctx.orgId, i, ctx.agent.name);
      return `Saved ICP "${icp.name}" (id ${icp.id}).`;
    },
  },
  propose_prospects: {
    spec: {
      name: 'propose_prospects',
      description: 'Propose businesses you found as new leads. They wait in the CRM for the owner to pick which ones to add; nothing is added or contacted until then. Call it once with the whole list.',
      input_schema: {
        type: 'object',
        properties: {
          icpId: { type: 'string', description: 'The ICP these match, if any' },
          prospects: {
            type: 'array',
            maxItems: 25,
            items: { type: 'object', properties: Object.fromEntries(PROSPECT_FIELDS.map((f) => [f, str])), required: ['company', 'sourcePage'] },
          },
        },
        required: ['prospects'],
      },
    },
    summarize: (i) => `Propose ${Array.isArray(i.prospects) ? i.prospects.length : 0} prospects`,
    async execute(i, ctx) {
      const r = await proposeProspects(ctx.store, ctx.orgId, i.icpId ? String(i.icpId) : null, i.prospects, ctx.agent.name);
      const skipped = r.skipped.length ? ` Left out: ${r.skipped.slice(0, 10).join('; ')}.` : '';
      return r.kept ? `${r.kept} prospects are waiting in the CRM for the owner's yes.${skipped}` : `No new prospects saved.${skipped}`;
    },
  },
  save_lead_score: {
    spec: {
      name: 'save_lead_score',
      description: 'Save a 0 to 100 lead score and its reasons onto a deal.',
      input_schema: { type: 'object', properties: { contactId, score: { type: 'number' }, reasons: str, icpId: str }, required: ['contactId', 'score', 'reasons'] },
    },
    summarize: (i) => `Score lead ${String(i.contactId ?? '')}: ${String(i.score ?? '')}`,
    execute: (i, ctx) => saveLeadScore(ctx.store, ctx.orgId, i.contactId, i.score, i.reasons, i.icpId, ctx.agent.name),
  },
  save_sequence: {
    spec: {
      name: 'save_sequence',
      description: 'Save a multi-step outreach sequence onto a deal as drafts for the owner to send themselves. Nothing is sent.',
      input_schema: {
        type: 'object',
        properties: {
          contactId,
          steps: {
            type: 'array',
            minItems: 2,
            maxItems: 7,
            items: { type: 'object', properties: { day: { type: 'number' }, channel: { type: 'string', enum: [...SEQUENCE_CHANNELS] }, subject: str, text: str }, required: ['day', 'channel', 'text'] },
          },
          notes: { type: 'string', description: 'Anything to check before sending' },
        },
        required: ['contactId', 'steps'],
      },
    },
    summarize: (i) => `Draft outreach sequence for ${String(i.contactId ?? '')}`,
    execute: (i, ctx) => saveSequence(ctx.store, ctx.orgId, i.contactId, i.steps, i.notes, ctx.agent.name),
  },
  save_objection: {
    spec: {
      name: 'save_objection',
      description: 'Save suggested answers to one objection onto a deal, for the owner to use on calls and replies.',
      input_schema: {
        type: 'object',
        properties: { contactId, objection: str, responses: { type: 'array', items: str, minItems: 1, maxItems: 3 }, blocker: { type: 'string', description: 'The real blocker behind it, if you can tell' } },
        required: ['contactId', 'objection', 'responses'],
      },
    },
    summarize: (i) => `Save objection answers for ${String(i.contactId ?? '')}`,
    execute: (i, ctx) => saveObjection(ctx.store, ctx.orgId, i.contactId, i.objection, i.responses, i.blocker, ctx.agent.name),
  },
  sync_deal: {
    spec: {
      name: 'sync_deal',
      description: 'Fix one deal: fill empty fields with values the record itself states, set a missing next step, or suggest a stage. It never overwrites, deletes, merges or moves a deal; the owner decides on stages.',
      input_schema: {
        type: 'object',
        properties: {
          contactId,
          reason: { type: 'string', description: 'What was inconsistent and where the value came from' },
          fill: { type: 'object', properties: Object.fromEntries(['niche', 'city', 'website', 'size', 'title', 'phone', 'email', 'painPoints', 'offer', 'angle'].map((f) => [f, str])) },
          nextStep: str,
          suggestStage: { type: 'string', enum: [...DEAL_STAGES] },
        },
        required: ['contactId', 'reason'],
      },
    },
    summarize: (i) => `CRM Sync on ${String(i.contactId ?? '')}`,
    execute: (i, ctx) => syncDeal(ctx.store, ctx.orgId, i, ctx.agent.name),
  },
};
