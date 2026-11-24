// Business research and proposals: the Business Research agent writes a sourced report onto the deal, the owner
// adds a found detail only after checking its page, and the Proposal Writer saves a draft whose ROI the app works
// out from lines the owner can adjust. Nothing is ever sent by the app.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { MemoryStore } from '../core/store.js';
import { DEFAULT_TASK_TYPES } from '../core/policy.js';
import { createTask, runTask } from '../core/runtime.js';
import { getAgent } from '../core/agents.js';
import { TOOLS } from '../core/tools.js';
import { loadCrm, setDealStage, upsertContact } from '../core/crm.js';
import { readCrm, saveIcp } from '../core/leadgen.js';
import { editProposal, markProposalSent, proposalDraftGoal, researchGoal, saveProposal, saveResearch, useResearchField } from '../core/research.js';
import { cleanResearch, computeRoi, proposalMessage, roiSection } from '../core/research-state.js';
import type { ContentBlock, ModelClient, ModelRequest, ModelResponse } from '../core/types.js';

const ORG = '00000000-0000-0000-0000-000000000001';
const fresh = () => new MemoryStore({ orgId: ORG, taskTypes: DEFAULT_TASK_TYPES });
const NO_SEND = { dispatch: async () => { throw new Error('nothing may be dispatched'); } };

class Model implements ModelClient {
  calls: ModelRequest[] = [];
  constructor(private readonly replies: { content: ContentBlock[]; stopReason: string }[]) {}
  async complete(req: ModelRequest): Promise<ModelResponse> {
    this.calls.push(req);
    const r = this.replies.shift() ?? { content: [{ type: 'text', text: 'Done.' }], stopReason: 'end_turn' };
    return { ...r, model: 'claude-sonnet-5-5', usage: { inputTokens: 10, outputTokens: 10 } };
  }
}
const use = (id: string, name: string, input: Record<string, unknown>): ContentBlock => ({ type: 'tool_use', id, name, input } as ContentBlock);

async function seed(store: MemoryStore) {
  await upsertContact(store, ORG, { name: 'Dana Reyes', company: 'Reyes Injury Law', phone: '214-555-0100', website: 'reyeslaw.example', city: 'Dallas', rank: 1 }, 'owner');
  return (await loadCrm(store, ORG)).contacts[0];
}
const deal = async (store: MemoryStore, id: string) => (await loadCrm(store, ORG)).contacts.find((c) => c.id === id)!;

const REPORT = {
  summary: 'Personal injury firm in Dallas with about 12 staff, founded in 2011, serving Dallas-Fort Worth.',
  owner: 'Founding partner; licensed in Texas since 2009 per the firm site.',
  presence: 'Dated website, no online booking, 4.3 stars from 88 Google reviews.',
  pains: [
    { point: 'Missed calls after hours', evidence: 'Three reviews mention nobody answering in the evening.', source: 'https://www.google.com/maps/place/reyes' },
    { point: 'No online intake', evidence: 'The contact page has a phone number only.', source: 'https://reyeslaw.example/contact' },
  ],
  found: [
    { field: 'email', value: 'intake@reyeslaw.example', source: 'https://reyeslaw.example/contact', note: 'Intake desk' },
    { field: 'address', value: '100 Main St, Dallas, TX 75201', source: 'https://reyeslaw.example/contact' },
    { field: 'email', value: 'dana@reyeslaw.example', source: '', note: 'guessed' },
    { field: 'email', value: 'not-an-email', source: 'https://reyeslaw.example/' },
    { field: 'linkedin', value: 'linkedin.com/company/reyes-law', source: 'https://www.linkedin.com/company/reyes-law' },
    { field: 'phone', value: '214-555-0199', source: 'javascript:alert(1)' },
  ],
  opportunities: [{ title: 'After-hours call answering', how: 'An AI receptionist answers, qualifies and books consults.', impact: 'Recovers missed evening leads.' }],
  unknowns: 'Case volume and current intake software.',
  sources: [{ title: 'Firm contact page', url: 'https://reyeslaw.example/contact' }, { title: 'Bad', url: 'ftp://x' }],
};

const PROPOSAL = {
  title: 'AI intake for Reyes Injury Law',
  subject: 'Never miss an evening case again',
  summary: 'Evening calls go unanswered and the site has no online intake.',
  opportunities: [{ title: 'After-hours answering', what: 'An AI receptionist answers every call.', benefit: 'More booked consults.' }],
  benefits: [
    { label: 'Recovered evening cases', monthly: 3000, basis: '8 missed calls a week x 25% booked x $400 average value (estimate)' },
    { label: 'Staff time saved', monthly: '$500', basis: '20 hours a month x $25 an hour (estimate)' },
  ],
  costs: [{ label: 'SIXXAB Receptionist', monthly: 500, oneTime: 1500, basis: 'Recorded offer price' }],
  currency: 'usd',
  plan: 'Week 1 setup, week 2 live.',
  nextStep: 'Sign the order form.',
  text: 'Hi Dana, here is how we would make sure every evening call to Reyes Injury Law is answered and booked. '.repeat(2),
};

test('research is cleaned: a found detail needs a real page, emails must look real, and the report needs substance', () => {
  const r = cleanResearch(REPORT);
  assert.deepEqual(r.found.map((f) => f.field), ['email', 'address', 'linkedin'], 'no source, a bad email or a non-web page is dropped');
  assert.ok(r.found.every((f) => f.source.startsWith('https://') && f.usedAt === null));
  assert.deepEqual(r.sources.map((s) => s.url), ['https://reyeslaw.example/contact']);
  assert.equal(r.pains.length, 2);
  assert.throws(() => cleanResearch({ ...REPORT, summary: 'Short' }), /summary/);
  assert.throws(() => cleanResearch({ summary: REPORT.summary, pains: [], opportunities: [] }), /pain point or opportunity/);
});

test('the ROI is worked out by the app from the lines', () => {
  const roi = computeRoi([{ label: 'A', monthly: 3000, basis: '' }, { label: 'B', monthly: 500, basis: '' }], [{ label: 'Fee', monthly: 500, oneTime: 1500, basis: '' }]);
  assert.deepEqual(roi, { monthlyBenefit: 3500, monthlyCost: 500, oneTime: 1500, netMonthly: 3000, firstYearNet: 34500, roiPct: 460, paybackMonths: 0.5 });
  const none = computeRoi([{ label: 'A', monthly: 100, basis: '' }], [{ label: 'Fee', monthly: 200, oneTime: 0, basis: '' }]);
  assert.equal(none.netMonthly, -100);
  assert.equal(none.paybackMonths, null, 'no payback when the net is negative');
  assert.equal(computeRoi([{ label: 'A', monthly: 100, basis: '' }], []).roiPct, null, 'no percentage without a cost');
});

test('research lands on the deal; the owner adds a found detail once, after checking it', async () => {
  const store = fresh();
  const c = await seed(store);
  const msg = await saveResearch(store, ORG, c.id, REPORT, 'Business Research');
  assert.match(msg, /2 pain points, 1 opportunities, 3 details/);
  assert.match(msg, /Nothing was sent/);
  let d = await deal(store, c.id);
  assert.equal(d.researchReport!.by, 'Business Research');
  assert.equal(d.email, '', 'nothing is applied automatically');
  assert.match(await readCrm(store, ORG, 'deal', c.id), /Missed calls after hours/);

  await useResearchField(store, ORG, c.id, 0, 'owner');
  await useResearchField(store, ORG, c.id, 1, 'owner');
  d = await deal(store, c.id);
  assert.equal(d.email, 'intake@reyeslaw.example');
  assert.equal(d.address, '100 Main St, Dallas, TX 75201');
  assert.ok(d.researchReport!.found[0].usedAt);
  await assert.rejects(useResearchField(store, ORG, c.id, 0, 'owner'), /already on the deal/);
  await assert.rejects(useResearchField(store, ORG, c.id, 2, 'owner'), /no field on the deal/);
  await assert.rejects(useResearchField(store, ORG, c.id, 9, 'owner'), /no longer in the research/);
  assert.ok(d.history!.some((h) => /research/i.test(h.text)));
  await assert.rejects(saveResearch(store, ORG, 'nope', REPORT, 'Business Research'), /No deal/);
});

test('the proposal: the app works out the ROI, the owner edits it, sends it and is asked to move the stage', async () => {
  const store = fresh();
  const c = await seed(store);
  await saveIcp(store, ORG, { name: 'DFW PI firms', summary: 'Personal injury firms in Dallas-Fort Worth with 5 to 30 staff.' }, 'ICP Builder');
  const msg = await saveProposal(store, ORG, c.id, PROPOSAL, 'Proposal Writer');
  assert.match(msg, /net \$3,000 a month, first-year return 460%/);
  assert.match(msg, /Nothing was sent/);
  let d = await deal(store, c.id);
  const p = d.proposal!;
  assert.equal(p.currency, 'USD');
  assert.equal(p.benefits[1].monthly, 500, '"$500" reads as 500');
  assert.equal(p.roi.paybackMonths, 0.5);
  const message = proposalMessage(p);
  assert.ok(message.startsWith(p.text));
  assert.match(message, /8 missed calls a week x 25% booked/);
  assert.match(roiSection(p), /Setup pays back in about 0.5 months/);

  let crm = await loadCrm(store, ORG);
  const send = crm.nextActions.find((a) => a.rule === 'proposal_send')!;
  assert.equal(send.kind, 'send');
  assert.equal(send.draft!.text, message);
  assert.ok(!crm.nextActions.some((a) => a.rule === 'proposal' && a.contactId === c.id), 'no second draft offered');

  await editProposal(store, ORG, c.id, { costs: [{ label: 'SIXXAB Receptionist', monthly: 1000, oneTime: 0, basis: 'Owner price' }], text: `${PROPOSAL.text} Edited.` }, 'owner');
  d = await deal(store, c.id);
  assert.equal(d.proposal!.roi.netMonthly, 2500, 'the ROI is worked out again');
  assert.equal(d.proposal!.roi.roiPct, 250);
  assert.ok(d.proposal!.editedAt);
  assert.equal(d.proposal!.id, p.id);

  await markProposalSent(store, ORG, c.id, 'owner');
  d = await deal(store, c.id);
  assert.ok(d.proposal!.sentAt);
  assert.ok(d.lastTouch, 'sending counts as a touch');
  assert.ok(d.history!.some((h) => /Sent proposal: Never miss an evening case again/.test(h.text)));
  assert.equal(d.stage, 'lead', 'the stage moves only when the owner says so');
  crm = await loadCrm(store, ORG);
  assert.ok(!crm.nextActions.some((a) => a.rule === 'proposal_send'));
  const stage = crm.nextActions.find((a) => a.rule === 'proposal_stage')!;
  assert.equal(stage.kind, 'approve');
  assert.equal(stage.suggestStage, 'proposal');
  await assert.rejects(markProposalSent(store, ORG, c.id, 'owner'), /already marked as sent/);
  await assert.rejects(editProposal(store, ORG, c.id, { text: PROPOSAL.text }, 'owner'), /already sent/);
});

test('the queue offers research before scoring, for leads only, and never for won deals', async () => {
  const store = fresh();
  const c = await seed(store);
  await saveIcp(store, ORG, { name: 'DFW PI firms', summary: 'Personal injury firms in Dallas-Fort Worth with 5 to 30 staff.' }, 'ICP Builder');
  let crm = await loadCrm(store, ORG);
  const keys = crm.nextActions.filter((a) => a.contactId === c.id).map((a) => a.rule);
  assert.ok(keys.indexOf('research') >= 0 && keys.indexOf('research') < keys.indexOf('score'), `research comes first: ${keys.join(', ')}`);
  const research = crm.nextActions.find((a) => a.rule === 'research')!;
  assert.equal(research.agentId, 'business-research');
  await saveResearch(store, ORG, c.id, REPORT, 'Business Research');
  crm = await loadCrm(store, ORG);
  assert.ok(!crm.nextActions.some((a) => a.rule === 'research'), 'done once researched');
  await upsertContact(store, ORG, { name: 'Sam Lee', company: 'Lee Dental', city: 'Plano' }, 'owner');
  const lee = (await loadCrm(store, ORG)).contacts.find((x) => x.company === 'Lee Dental')!;
  assert.ok((await loadCrm(store, ORG)).nextActions.some((a) => a.rule === 'research' && a.contactId === lee.id));
  await setDealStage(store, ORG, lee.id, 'won', 'owner');
  assert.ok(!(await loadCrm(store, ORG)).nextActions.some((a) => a.rule === 'research' && a.contactId === lee.id), 'not for a won deal');
});

test('the Business Research agent can search and save, and nothing else; its tools send nothing', () => {
  const a = getAgent('business-research')!;
  assert.equal(a.name, 'Business Research');
  assert.ok(a.usesModel);
  assert.ok(a.tools.includes('web_search') && a.tools.includes('save_research') && a.tools.includes('read_crm'));
  for (const t of a.tools) assert.ok(t === 'web_search' || TOOLS[t], `tool ${t} exists`);
  assert.ok(!a.tools.some((t) => ['send_message', 'publish_post', 'reply_comment', 'send_email_campaign', 'spend_money', 'propose_prospects'].includes(t)));
  for (const name of ['save_research', 'save_proposal']) {
    assert.ok(TOOLS[name], `${name} exists`);
    assert.equal(TOOLS[name].taskType, undefined, `${name} sends nothing`);
    assert.ok(!name.includes('re_'));
  }
  assert.ok(getAgent('proposal-writer')!.tools.includes('save_proposal'));
  for (const g of [researchGoal('abc-123'), proposalDraftGoal('abc-123')]) {
    assert.ok(g.length > 200 && g.length < 4000, `goal length ${g.length}`);
    assert.match(g, /nothing is sent/);
    assert.ok(g.includes('abc-123'));
  }
  assert.match(researchGoal('x'), /never guess or construct an email/);
  assert.match(researchGoal('x'), /never open a page behind a login/);
});

test('both agents save onto the deal through their tools, with no approval and nothing dispatched', async () => {
  const store = fresh();
  const c = await seed(store);
  const model = new Model([
    { content: [use('a', 'read_crm', { view: 'deal', contactId: c.id })], stopReason: 'tool_use' },
    { content: [use('b', 'save_research', { contactId: c.id, ...REPORT })], stopReason: 'tool_use' },
    { content: [{ type: 'text', text: 'Researched.' }], stopReason: 'end_turn' },
  ]);
  const task = await createTask(store, ORG, 'business-research', researchGoal(c.id));
  const res = await runTask({ store, model, integrations: NO_SEND }, task.id);
  assert.equal(res.task.status, 'done');
  assert.equal(res.approvals.length, 0);
  assert.ok((model.calls[0].tools ?? []).some((t) => 'type' in t && String((t as { type: string }).type).startsWith('web_search')), 'web search is offered');

  const writer = new Model([
    { content: [use('a', 'read_crm', { view: 'deal', contactId: c.id })], stopReason: 'tool_use' },
    { content: [use('b', 'save_proposal', { contactId: c.id, ...PROPOSAL })], stopReason: 'tool_use' },
    { content: [{ type: 'text', text: 'Drafted.' }], stopReason: 'end_turn' },
  ]);
  const t2 = await createTask(store, ORG, 'proposal-writer', proposalDraftGoal(c.id));
  const r2 = await runTask({ store, model: writer, integrations: NO_SEND }, t2.id);
  assert.equal(r2.task.status, 'done');
  assert.equal(r2.approvals.length, 0);
  assert.match(JSON.stringify(writer.calls[1].messages.at(-1)), /Missed calls after hours/, 'the writer reads the research');
  const d = await deal(store, c.id);
  assert.equal(d.researchReport!.by, 'Business Research');
  assert.equal(d.proposal!.by, 'Proposal Writer');
  assert.equal(d.stage, 'lead');
});
