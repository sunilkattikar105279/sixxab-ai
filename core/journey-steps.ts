// The step catalogue for the whole SIXXAB journey, by head: Start (Startup, Struggle),
// Scale (Scale, Success) and Run (Significance, SIXXAB). Hard dependencies block a step;
// soft checks only warn. Every step's agent plans and records; nothing here sends or spends.
import type { BusinessProfile } from './profile.js';

export type Head = 'Start' | 'Scale' | 'Run';
export interface StepCtx { profile: BusinessProfile | null; revenueMonths: { month: string; amount: number }[] }
export interface SoftCheck { label: string; ok: (ctx: StepCtx) => boolean }

export interface StepDef {
  id: string;
  stage: Head;
  title: string;
  summary: string;
  agentId: string | null;
  agents: string;
  ownerDecides: string;
  output: string;
  hard: string[];
  soft: SoftCheck[];
  goal: string;
}

const has = (k: keyof BusinessProfile) => (c: StepCtx) => Boolean(c.profile?.[k]);
const anyChannel = (c: StepCtx) => (['whatsapp', 'googleProfile', 'instagram', 'facebook', 'linkedin'] as const).some((k) => c.profile?.[k]);
const revenueRecorded = (c: StepCtx) => c.revenueMonths.length > 0;
const threeMonths = (c: StepCtx) => c.revenueMonths.length >= 3;

export const STEPS: StepDef[] = [
  // ---- Start the business: Startup and Struggle ----
  {
    id: 'onboard', stage: 'Start', title: 'Onboard', summary: 'Tell your agents about the business: offer, customers, numbers, goals and channels.',
    agentId: null, agents: 'Onboarding Guide', ownerDecides: 'Confirms the business profile', output: 'Business profile, stage placed', hard: [], soft: [], goal: '',
  },
  {
    id: 'diagnose', stage: 'Start', title: 'Diagnose', summary: 'A health check places you on the SIXXAB path and shows what is holding you back.',
    agentId: 'health-check', agents: 'Business Health Check, Strategy Coach', ownerDecides: 'Confirms goals and stage', output: 'Stage report and top 3 priorities',
    hard: ['onboard'], soft: [{ label: 'Record last month’s revenue', ok: (c) => has('revenueMonthly')(c) || revenueRecorded(c) }],
    goal: 'Run the business health check: place the business on the SIXXAB path, name what is holding it back, and give the top 3 priorities for the next 90 days. Save it as a note titled "Stage report".',
  },
  {
    id: 'restart', stage: 'Start', title: 'Restart', summary: 'Reset the niche, offer and pricing around real demand. Stop what is not working.',
    agentId: 'niche-offer', agents: 'Niche and Offer, Strategy Coach', ownerDecides: 'Chooses the offer to back', output: 'One validated offer with price',
    hard: ['diagnose'], soft: [{ label: 'Add your prices to the profile', ok: has('pricing') }],
    goal: 'Review the niche, offer and pricing against what customers actually buy. Propose up to three offer options with price, who it is for and why, and recommend one. Save it as a note titled "Offer options".',
  },
  {
    id: 'plan', stage: 'Start', title: 'Plan', summary: 'One goal, a 90-day roadmap and a weekly plan that every agent works to.',
    agentId: 'roadmap-planner', agents: 'Roadmap Planner, Founder Orchestrator', ownerDecides: 'Approves the roadmap', output: 'One goal, 90-day roadmap, weekly plan',
    hard: ['restart'], soft: [{ label: 'Set a monthly marketing budget', ok: has('budget') }],
    goal: 'Write the 90-day roadmap: one measurable goal, three 30-day milestones, and this week’s plan with an owner for each task. Save it as a note titled "90-day roadmap".',
  },
  {
    id: 'staff', stage: 'Start', title: 'Staff with agents', summary: 'Switch on the agents your stage needs and connect your channels.',
    agentId: null, agents: 'Founder Orchestrator', ownerDecides: 'Picks which agents start; connects channels', output: 'Agent team and channels live',
    hard: ['plan'], soft: [{ label: 'Add at least one channel (WhatsApp, Google, Instagram, Facebook or LinkedIn)', ok: anyChannel }], goal: '',
  },
  {
    id: 'grow', stage: 'Start', title: 'Grow', summary: 'Marketing, replies and follow-up run every day. You approve posts, messages and spend.',
    agentId: 'cmo', agents: 'CMO, Social Poster, Comment Responder, Customer Reply', ownerDecides: 'Approves posts, replies and spend', output: 'Posts, replies, enquiries',
    hard: ['staff'], soft: [{ label: 'Describe your brand voice', ok: has('voice') }],
    goal: 'Plan this week’s marketing from the 90-day roadmap: three posts for the business’s channels, drafted in its voice and sent for approval.',
  },
  {
    id: 'run', stage: 'Start', title: 'Run', summary: 'Weekly review: revenue, milestones and what the agents learned, so the next week runs better.',
    agentId: 'milestone-tracker', agents: 'Milestone Tracker, Learning Engine', ownerDecides: 'Handles exceptions and big calls', output: 'Weekly review',
    hard: ['grow'], soft: [{ label: 'Record this month’s revenue', ok: revenueRecorded }],
    goal: 'Write the weekly review: revenue against the goal, milestones reached, what was approved, edited or rejected and what to change next week. Save it as a note titled "Weekly review".',
  },

  // ---- Scale the business: Scale and Success ----
  {
    id: 'market', stage: 'Scale', title: 'Marketing engine', summary: 'Turn weekly posts into a four-week plan across every channel, with reviews and referrals asked for.',
    agentId: 'cmo', agents: 'CMO, Social Poster, Comment Responder', ownerDecides: 'Approves the plan and every post', output: 'Four-week content and review plan',
    hard: ['grow'], soft: [{ label: 'Set a monthly marketing budget', ok: has('budget') }, { label: 'Add at least one channel', ok: anyChannel }],
    goal: 'Write a four-week marketing plan from the roadmap: themes per week, posts per channel, how and when to ask happy customers for reviews and referrals, and how each channel is measured. Save it as a note titled "Marketing plan".',
  },
  {
    id: 'pipeline', stage: 'Scale', title: 'Sales pipeline', summary: 'Every lead has a stage and a next step, and no enquiry goes quiet.',
    agentId: 'cro', agents: 'CRO, Deal Closer', ownerDecides: 'Approves follow-up rules and offers', output: 'Pipeline stages and follow-up rules',
    hard: ['market'], soft: [{ label: 'Describe where customers come from', ok: has('sources') }],
    goal: 'Design the sales pipeline: stages from enquiry to paid, what moves a lead between stages, follow-up timing for each stage, and the scripts to use. Save it as a note titled "Sales pipeline".',
  },
  {
    id: 'support', stage: 'Scale', title: 'Support desk', summary: 'The top questions get approved answers, and anything sensitive goes to a person.',
    agentId: 'coo', agents: 'COO, Customer Reply', ownerDecides: 'Approves the answers and escalation rules', output: 'Support playbook',
    hard: ['grow'], soft: [],
    goal: 'Write the support playbook: the 15 questions customers ask most with short approved answers, what must always go to a person, and the response time to aim for. Save it as a note titled "Support playbook".',
  },
  {
    id: 'economics', stage: 'Scale', title: 'Unit economics', summary: 'Know what a customer costs to win, what each offer earns and how long the cash lasts.',
    agentId: 'cfo', agents: 'CFO', ownerDecides: 'Confirms the numbers and pricing changes', output: 'Unit economics report',
    hard: ['run'], soft: [{ label: 'Record three months of revenue', ok: threeMonths }],
    goal: 'Write the unit economics report from recorded revenue and the profile: cost to win a customer, margin per offer, monthly costs and cash runway, with every assumption marked. Recommend at most two pricing or cost changes. Save it as a note titled "Unit economics".',
  },
  {
    id: 'ops', stage: 'Scale', title: 'Operating playbooks', summary: 'The five processes that matter most are written down, owned and checked.',
    agentId: 'coo', agents: 'COO', ownerDecides: 'Approves each playbook', output: 'Five process playbooks',
    hard: ['support'], soft: [{ label: 'Describe your team size', ok: has('team') }],
    goal: 'Write playbooks for the five processes that matter most to this business: steps, owner, time, and the quality check at the end of each. Save them as a note titled "Operating playbooks".',
  },
  {
    id: 'finance', stage: 'Scale', title: 'Finance back office', summary: 'Invoices, collections, payables and month-end close run on a calendar.',
    agentId: 'cfo', agents: 'CFO', ownerDecides: 'Approves payment terms and the close checklist', output: 'Finance calendar and close checklist',
    hard: ['economics'], soft: [],
    goal: 'Write the finance back-office calendar: invoicing and collection rules, a payables calendar, and a month-end close checklist with an owner for each item. Save it as a note titled "Finance back office".',
  },
  {
    id: 'people', stage: 'Scale', title: 'Team and hiring', summary: 'Who does what now, who to hire next and how new people get up to speed.',
    agentId: 'chro', agents: 'CHRO', ownerDecides: 'Approves the next two hires', output: 'Team plan and first two roles',
    hard: ['ops'], soft: [],
    goal: 'Write the team plan: roles today, the organisation in 12 months, the next two roles to hire with what each must deliver, and a two-week onboarding checklist. Save it as a note titled "Team plan".',
  },
  {
    id: 'compliance', stage: 'Scale', title: 'Compliance check', summary: 'Licences, registrations, policies and contracts listed with their status.',
    agentId: 'clo', agents: 'CLO', ownerDecides: 'Confirms each item with a professional', output: 'Compliance checklist',
    hard: ['ops'], soft: [],
    goal: 'List the licences, registrations, policies and contracts a business like this usually needs where it operates, each with status unknown and who should confirm it. This is a checklist for a qualified professional to confirm, not legal advice. Save it as a note titled "Compliance checklist".',
  },

  // ---- Run the business: Significance and SIXXAB ----
  {
    id: 'exec_plan', stage: 'Run', title: 'One plan for the executive team', summary: 'An annual plan with goals per executive agent, reviewed every month.',
    agentId: 'strategy-coach', agents: 'Founder Orchestrator, Strategy Coach, CXO agents', ownerDecides: 'Approves the annual plan', output: 'Annual plan with goals per executive',
    hard: ['finance', 'people'], soft: [{ label: 'Record three months of revenue', ok: threeMonths }],
    goal: 'Write the annual plan: three company goals with numbers, the goals each executive area owns (marketing, sales, operations, finance, people, technology), and the monthly review rhythm. Save it as a note titled "Annual plan".',
  },
  {
    id: 'board', stage: 'Run', title: 'Board and investor pack', summary: 'A monthly pack for the board and investors, always ready.',
    agentId: 'investor-relations', agents: 'Investor Relations, CFO', ownerDecides: 'Approves what is shared', output: 'Monthly board pack template',
    hard: ['exec_plan'], soft: [],
    goal: 'Write the monthly board pack template from the annual plan and recorded revenue: headline numbers, progress per goal, risks, decisions needed. Fill it for the latest month. Save it as a note titled "Board pack".',
  },
  {
    id: 'tech', stage: 'Run', title: 'Technology and data', summary: 'Systems, data and automation that let the business grow without more manual work.',
    agentId: 'cto', agents: 'CTO, CIO', ownerDecides: 'Approves the technology roadmap', output: 'Technology roadmap',
    hard: ['exec_plan'], soft: [],
    goal: 'Write the technology roadmap: the systems the business runs on, the data it should track, the next three automations to build, and what each saves. Save it as a note titled "Technology roadmap".',
  },
  {
    id: 'security', stage: 'Run', title: 'Security and risk', summary: 'Access, backups, customer data and incident response, checked and owned.',
    agentId: 'ciso', agents: 'CISO', ownerDecides: 'Approves the risk register', output: 'Risk register and security checklist',
    hard: ['tech'], soft: [],
    goal: 'Write the risk register and security checklist: who can access what, backups, customer-data handling, and what to do in an incident, with an owner for each. Save it as a note titled "Risk register".',
  },
  {
    id: 'expand', stage: 'Run', title: 'New markets', summary: 'Enter one new market or product line in parallel, with its own plan.',
    agentId: 'cgo', agents: 'CGO', ownerDecides: 'Chooses the market and budget', output: 'Market entry plan',
    hard: ['board'], soft: [],
    goal: 'Compare up to three new markets or product lines for this business and write an entry plan for the best one: why, first 90 days, budget, and what proves it is working. Save it as a note titled "Market entry plan".',
  },
  {
    id: 'autonomy', stage: 'Run', title: 'Autonomous operations', summary: 'Decide which routine actions run on their own, and the exceptions that always come to you.',
    agentId: 'coo', agents: 'COO, Learning Engine', ownerDecides: 'Confirms each autonomy upgrade', output: 'Autonomy plan and exception rules',
    hard: ['security'], soft: [],
    goal: 'Review the approval history recorded in memory and the playbooks: list which routine actions are ready to run on their own, the exceptions that must always come to the owner, and how results are checked each week. Save it as a note titled "Autonomy plan".',
  },
];
