// The marketing flow (inbound), defined the same way as the sales flow (outbound) in salesflow-state.ts: stages with what
// happens, which agents do it and where the owner's yes is needed, plain definitions of the words both tabs use, and one queue
// of next actions. Marketing brings the customer to the business; at Respond it answers them and hands the deal to sales in
// the same CRM (Contacted), and sales tells marketing back which sources win (salesContext in channels.ts).
// Pure: built from what the Marketing tab already loads, so it needs no new records.
import type { Contact } from './crm.js';
import type { MarketingState } from './marketing.js';
import type { CreativesState } from './creatives.js';
import type { SocialPost } from './publishing.js';
import type { AdsPlan } from './ads.js';
import type { Dashboard } from './leads.js';
import { isInbound, pipelineByOrigin, type OriginPipeline } from './channels.js';
import { ENQUIRY_FRESH_DAYS } from './salesflow-state.js';

export const MKT_STAGES = [
  { key: 'assess', name: 'Assess', does: 'Answer the questionnaire; the Business Assessor checks your website, Google profile, social pages, reviews and tracking on public pages and scores readiness.', agents: ['Business Assessor'], gate: 'Nothing is contacted; you fix the gaps it finds.' },
  { key: 'plan', name: 'Plan', does: 'The CMO agent tailors a 30-day plan to your offer, budget and cost-per-lead ceiling, using what sales knows: your ICP and which sources turn into customers.', agents: ['CMO agent'], gate: 'You pick a plan and pay at the checkout; nothing is charged without it.' },
  { key: 'create', name: 'Create', does: 'Image and short-video ads with their copy, made in the studio from the plan and your monthly allowance.', agents: ['Ad Creative Producer'], gate: 'You approve or reject each ad.' },
  { key: 'publish', name: 'Publish', does: 'One post per social network from each approved ad, each with a tracked link to your lead form.', agents: ['Social Publisher'], gate: 'You press Publish on each post; nothing posts on its own.' },
  { key: 'promote', name: 'Promote', does: 'A paid ads plan inside your monthly budget and under the cost-per-lead ceiling.', agents: ['Ads Manager'], gate: 'You launch and pay in the ad platform yourself.' },
  { key: 'capture', name: 'Capture', does: 'Every enquiry lands in the CRM as a lead with its source: the lead form, phone calls, WhatsApp, email, website chat and walk-ins.', agents: ['Lead form', '24/7 attendant'], gate: 'Nothing is sent to the person automatically.' },
  { key: 'respond', name: 'Respond and hand off', does: 'Answer each enquiry within 5 minutes, then move it to Contacted: from there the sales flow takes over with follow-ups, discovery and the proposal.', agents: ['Speed-to-Lead'], gate: 'First replies wait in Approvals; you move each lead.' },
  { key: 'measure', name: 'Measure', does: 'Leads, cost per lead and wins by source, inbound against outbound. The CMO agent re-plans when cost per lead runs over the ceiling.', agents: ['CMO agent'], gate: 'You decide what to change.' },
] as const;
export type MktStage = (typeof MKT_STAGES)[number]['key'];

/** The words both flows use, defined once and shown in both tabs. */
export const FLOW_TERMS: { term: string; means: string }[] = [
  { term: 'Inbound lead', means: 'Someone who came to you: a lead form, call, WhatsApp, email, chat, walk-in, referral, post, ad or event. Marketing brings them in.' },
  { term: 'Outbound prospect', means: 'A business you went to first: found by the Prospect Generator, Apollo, LinkedIn or a list you imported. Sales finds them.' },
  { term: 'Enquiry', means: 'One message or call from a person asking about your business. A repeat enquiry from someone already in the CRM is added as a note on their deal.' },
  { term: 'Source', means: 'Where a lead came from, kept on the deal for its whole life, so wins can be traced back to the post, ad or channel.' },
  { term: 'Marketing-qualified (MQL)', means: 'An inbound lead with a way to reach them (email or phone) and a real question. Every enquiry the form or the attendant records counts.' },
  { term: 'Sales-qualified (SQL)', means: 'A lead you answered and moved to Contacted: the sales flow owns it from there.' },
  { term: 'Hand-off', means: 'The move from Lead to Contacted after the first reply. It is the point where marketing passes the deal to sales, in the same CRM.' },
  { term: 'Speed to lead', means: 'Time from the enquiry to your first reply. Aim for under 5 minutes; most enquiries go to whoever answers first.' },
  { term: 'Paid lead', means: 'A lead from a paid ad (the link carries m=paid). It counts toward cost per lead.' },
  { term: 'Cost per lead (CPL)', means: 'What you spent on marketing this month (plan plus ad budget) divided by new leads in the last 30 days.' },
  { term: 'CPL ceiling', means: 'The most a lead can cost and still pay for itself, from your average first sale and how many leads you close.' },
  { term: 'Readiness', means: 'How ready your online presence is to turn visitors into enquiries, out of 100, from the assessment and the online check.' },
  { term: 'Win rate', means: 'Won deals divided by won plus lost, shown for inbound and outbound separately.' },
];

export type MktActionKind = 'agent' | 'open' | 'crm';
export interface MktAction {
  key: string; stage: MktStage; kind: MktActionKind; title: string; why: string; priority: number;
  /** For an agent action: which agent, and which of the Marketing tab's goals it runs on. */
  agentId?: string; goal?: 'assessor' | 'cmo' | 'creatives' | 'publishing' | 'ads';
  /** For an open action: the section of the Marketing tab it opens. */
  target?: string; count?: number;
}

export interface MktInput {
  marketing: MarketingState; creatives: CreativesState; posts: SocialPost[]; linked: number; publishConnected: boolean;
  leadForm: { on: boolean } | null; adsPlan: AdsPlan | null; dashboard: Dashboard; contacts: Contact[];
  goals: { assessor: string; cmo: string; creatives: string; publishing: string; ads: string };
}

export interface MktFlow {
  stats: Record<MktStage, { value: string; note: string }>;
  actions: MktAction[];
  origin: OriginPipeline;
  /** Inbound leads still at Lead with no reply: the hand-off to sales waits on them. */
  waiting: number;
}

const DAY = 864e5;

/** Inbound leads at the lead stage that nobody has answered yet (no touch logged and no Speed-to-Lead draft). */
export function unanswered(contacts: Contact[]): Contact[] {
  return contacts.filter((c) => isInbound(c) && c.stage === 'lead' && !c.lastTouch && !c.history.some((h) => h.by === 'Speed-to-Lead'));
}

/** Where marketing stands at each stage, and its next actions, most urgent first. */
export function marketingFlow(i: MktInput, now = Date.now()): MktFlow {
  const m = i.marketing;
  const d = i.dashboard;
  const sub = m.subscription?.status === 'active' ? m.subscription : null;
  const approved = i.creatives.creatives.filter((c) => c.status === 'approved');
  const drafts = i.posts.filter((p) => p.status === 'draft').length;
  const sent = i.posts.filter((p) => p.status === 'sent').length;
  const waitingList = unanswered(i.contacts);
  const fresh = waitingList.filter((c) => now - Date.parse(c.createdAt) <= ENQUIRY_FRESH_DAYS * DAY).length;
  const inbound = i.contacts.filter(isInbound);
  const handedOff = inbound.filter((c) => c.stage !== 'lead').length;
  const actions: MktAction[] = [];
  const add = (a: MktAction) => actions.push(a);

  if (waitingList.length) add({ key: 'respond', stage: 'respond', kind: 'crm', count: waitingList.length, title: `Answer ${waitingList.length} new enquir${waitingList.length === 1 ? 'y' : 'ies'}`, why: `${fresh ? `${fresh} came in the last ${ENQUIRY_FRESH_DAYS} days. ` : ''}Each one waits in the CRM's sales flow with a call-back or a reply drafted by Speed-to-Lead. Answer, then hand it to sales.`, priority: 1 });
  if (m.answered < 6 || !m.savedAt) add({ key: 'assess', stage: 'assess', kind: 'open', target: 'mk-assess', title: 'Finish the marketing assessment', why: `${m.answered} of ${m.total} answered. Every agent plans from these answers: offer, best customer, budget and voice.`, priority: 5 });
  else if (!m.validation && i.goals.assessor) add({ key: 'validate', stage: 'assess', kind: 'agent', agentId: 'business-assessor', goal: 'assessor', title: 'Check your online presence', why: 'The Business Assessor looks at your website, Google profile, social pages and reviews on public pages, and confirms the readiness score. Uses a few web searches.', priority: 12 });
  if (m.savedAt && !m.tailored && i.goals.cmo) add({ key: 'plan', stage: 'plan', kind: 'agent', agentId: 'cmo', goal: 'cmo', title: 'Have the CMO agent tailor the 30-day plan', why: 'Built from your answers, the cost-per-lead ceiling and what sales knows about who buys.', priority: 14 });
  if (!sub && m.savedAt) add({ key: 'pick', stage: 'plan', kind: 'open', target: 'mk-plans', title: 'Pick a marketing plan', why: 'The plan sets how many images and videos the studio makes each month. Nothing is charged until you finish a checkout.', priority: 16 });
  if (i.creatives.awaiting) add({ key: 'approve_ads', stage: 'create', kind: 'open', target: 'mk-studio', count: i.creatives.awaiting, title: `Approve ${i.creatives.awaiting} new ad${i.creatives.awaiting === 1 ? '' : 's'}`, why: 'The studio finished them. Approving an ad does not post it.', priority: 8 });
  else if (sub && i.goals.creatives) {
    const al = i.creatives.allowance;
    const left = Math.max(0, al.images - al.usedImages) + Math.max(0, al.videos - al.usedVideos);
    if (left) add({ key: 'brief_ads', stage: 'create', kind: 'agent', agentId: 'ad-creative-producer', goal: 'creatives', count: left, title: "Brief this week's ads", why: `${left} ad${left === 1 ? '' : 's'} left in this month's plan. The Ad Creative Producer writes image and video briefs from the plan and queues them for the studio.`, priority: 22 });
  }
  if (drafts) add({ key: 'publish', stage: 'publish', kind: 'open', target: 'mk-publish', count: drafts, title: `Publish ${drafts} post${drafts === 1 ? '' : 's'}`, why: 'Drafted from your approved ads, each with a tracked link to your lead form. Each goes out only when you press Publish.', priority: 10 });
  else if (approved.length && i.goals.publishing) add({ key: 'draft_posts', stage: 'publish', kind: 'agent', agentId: 'social-publisher', goal: 'publishing', title: 'Draft posts from your approved ads', why: 'One post per network for each approved ad that has none yet.', priority: 20 });
  if (approved.length && i.publishConnected && !i.linked) add({ key: 'link_social', stage: 'publish', kind: 'open', target: 'mk-publish', title: 'Link your social accounts', why: 'Posts can go out once your Facebook, Instagram, LinkedIn or other accounts are linked to the publishing service.', priority: 24 });
  if (i.goals.ads && !i.adsPlan) add({ key: 'ads_plan', stage: 'promote', kind: 'agent', agentId: 'ads-manager', goal: 'ads', title: 'Plan this month\'s paid ads', why: 'The Ads Manager splits your ad budget across one to three campaigns, under the cost-per-lead ceiling. You launch and pay in the ad platform yourself.', priority: 26 });
  if (!i.leadForm) add({ key: 'lead_form', stage: 'capture', kind: 'open', target: 'mk-leadform', title: 'Set up your lead form', why: 'It opens the first time this tab loads. Every post and ad links to it.', priority: 6 });
  else if (!i.leadForm.on) add({ key: 'lead_form', stage: 'capture', kind: 'open', target: 'mk-leadform', title: 'Turn your lead form back on', why: 'It is off, so links in your posts and ads show "not available".', priority: 6 });
  else if (!d.leads30 && sent === 0) add({ key: 'share_form', stage: 'capture', kind: 'open', target: 'mk-leadform', title: 'Share your lead form link', why: 'Put it in your bios, on your website and on a printed QR code, so enquiries land in the CRM with their source.', priority: 30 });
  if (d.cpl !== null && d.ceiling !== null && d.cpl > d.ceiling && i.goals.cmo) add({ key: 'replan', stage: 'measure', kind: 'agent', agentId: 'cmo', goal: 'cmo', title: 'Cost per lead is over the ceiling: re-plan', why: `Each lead cost ${Math.round(d.cpl)} ${d.currency} this month against a ceiling of ${Math.round(d.ceiling)}. The CMO agent re-plans toward the sources that win.`, priority: 11 });

  const pct = (n: number, of: number) => (of ? `${Math.round((n / of) * 100)}%` : '—');
  const stats: MktFlow['stats'] = {
    assess: { value: `${m.readiness.score}/100`, note: m.validation ? 'checked online' : 'readiness' },
    plan: { value: sub ? sub.planName : '—', note: sub ? (m.tailored ? 'plan tailored' : 'plan active') : 'no plan yet' },
    create: { value: String(approved.length), note: i.creatives.awaiting ? `${i.creatives.awaiting} to approve` : 'ads approved' },
    publish: { value: String(sent), note: drafts ? `${drafts} to publish` : 'posts published' },
    promote: { value: i.adsPlan ? String(i.adsPlan.campaigns.length) : '—', note: i.adsPlan ? 'campaigns planned' : 'no ads plan' },
    capture: { value: String(d.leads30), note: 'leads in 30 days' },
    respond: { value: String(waitingList.length), note: waitingList.length ? 'to answer' : `${pct(handedOff, inbound.length)} handed to sales` },
    measure: { value: d.cpl === null ? '—' : String(Math.round(d.cpl)), note: d.cpl === null ? 'cost per lead' : `${d.currency} per lead` },
  };
  return { stats, actions: actions.sort((a, b) => a.priority - b.priority), origin: pipelineByOrigin(i.contacts, now), waiting: waitingList.length };
}
