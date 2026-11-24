// Tools for the AI Marketing Agency. They send nothing: they save the online check, the 30-day plan, ad briefs and
// draft social posts onto the business's Marketing tab for the owner, so they have no task type (still audited).
import type { Tool } from './tools.js';
import { CHECK_ITEMS, loadMarketing, saveTailoredPlan, saveValidation } from './marketing.js';
import { CREATIVE_CTAS, CREATIVE_FORMATS, loadCreatives, requestCreative } from './creatives.js';
import { NETWORKS, NETWORK_IDS, draftPosts } from './publishing.js';

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
  save_creative_brief: {
    spec: {
      name: 'save_creative_brief',
      description: 'Queue one ad creative for the studio: an image or a short video, its shape, a visual brief and the ad copy. It counts against the plan\'s monthly images and videos. Nothing is made, posted or spent here; the studio makes it and the owner approves it on the Marketing tab.',
      input_schema: {
        type: 'object',
        properties: {
          kind: { type: 'string', enum: ['image', 'video'] },
          format: { type: 'string', enum: [...CREATIVE_FORMATS], description: '4:5 or 1:1 for feed images, 9:16 for Reels, Stories and TikTok, 16:9 for YouTube' },
          brief: { type: 'string', description: 'Who is in it, what happens, the setting, light and mood. No real brand logos; no on-screen text in a video.' },
          headline: { type: 'string', description: 'Up to 8 words' },
          primaryText: { type: 'string', description: 'One or two sentences of ad copy' },
          cta: { type: 'string', enum: CREATIVE_CTAS },
        },
        required: ['kind', 'brief', 'headline', 'primaryText', 'cta'],
      },
    },
    summarize: (i) => `Queue a ${i.kind === 'video' ? 'video' : 'image'} ad for the studio`,
    execute: async (i, ctx) => {
      const m = await loadMarketing(ctx.store, ctx.orgId, null);
      const planId = m.subscription?.status === 'active' ? m.subscription.planId : null;
      const state = await loadCreatives(ctx.store, ctx.orgId, planId);
      await requestCreative(ctx.store, ctx.orgId, i, state, ctx.agent.name);
      return `Queued the ${i.kind === 'video' ? 'video' : 'image'} ad "${String(i.headline ?? '').slice(0, 60)}" for the studio. The owner approves it once it is made.`;
    },
  },
  draft_social_post: {
    spec: {
      name: 'draft_social_post',
      description: 'Save a draft social post for one network from an approved ad: the ad\'s image or video with a caption written for that network. Nothing is posted; the owner publishes each draft from the Marketing tab, now or at a time they pick.',
      input_schema: {
        type: 'object',
        properties: {
          creativeId: { type: 'string', description: 'The approved ad\'s id' },
          network: { type: 'string', enum: [...NETWORK_IDS] },
          text: { type: 'string', description: 'The caption, within the network\'s length limit' },
        },
        required: ['creativeId', 'network', 'text'],
      },
    },
    summarize: (i) => `Draft a ${NETWORKS[i.network as keyof typeof NETWORKS]?.label ?? 'social'} post`,
    execute: async (i, ctx) => {
      await draftPosts(ctx.store, ctx.orgId, { creativeId: i.creativeId, networks: [i.network], text: i.text }, ctx.agent.name);
      return `Drafted the ${NETWORKS[i.network as keyof typeof NETWORKS].label} post. The owner publishes it from the Marketing tab.`;
    },
  },
};
