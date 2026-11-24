// Researched leads move on without an agent run: the import scores each matched lead from its research (no model,
// no tokens), a lead worth working now with a proposal draft moves to Outreach, and the queue stops offering the
// paid Lead Scorer, Outreach Sequencer and Business Research runs for it. A score already on a deal is kept.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { MemoryStore } from '../core/store.js';
import { DEFAULT_TASK_TYPES } from '../core/policy.js';
import { importContacts, loadCrm } from '../core/crm.js';
import { saveLeadScore } from '../core/leadgen.js';
import { advanceResearched, importResearch } from '../core/research-import.js';
import { researchImpact, RESEARCH_SCORER, scoreFromResearch } from '../core/research-score.js';
import { flowStageOf } from '../core/salesflow-state.js';

const ORG = '00000000-0000-0000-0000-000000000001';
const fresh = () => new MemoryStore({ orgId: ORG, taskTypes: DEFAULT_TASK_TYPES });
const byCompany = async (store: MemoryStore, company: string) => (await loadCrm(store, ORG)).contacts.find((c) => c.company === company)!;
const SRC = 'https://example.com/contact';
const research = (business: string) => ({
  summary: `${business} is a family business in Dallas serving homeowners across the metro since 1990.`,
  pains: [
    { point: 'Book Now goes to a contact form', evidence: 'The button opens a form.', source: SRC },
    { point: 'No after-hours answering', evidence: 'Hours say 8 to 5.', source: SRC },
  ],
  found: [{ field: 'email', value: 'office@example.com', source: SRC }],
  opportunities: [{ title: 'After-hours AI receptionist', how: 'Answers at night.', impact: 'Fewer lost jobs.' }, { title: 'Online booking', how: 'Books jobs.', impact: 'More jobs.' }],
  sources: [{ title: 'Contact', url: SRC }],
});
const proposal = (business: string, monthly: number) => ({
  title: `Proposal: AI agents for ${business}`, subject: `Answering every call at ${business}`, summary: 'Busy shop, phone-only intake.',
  opportunities: [{ title: 'Answer every call', what: 'AI receptionist.', benefit: 'More booked jobs.' }],
  benefits: [{ label: 'After-hours calls booked', monthly, basis: 'Estimate' }],
  costs: [{ label: 'SIXXAB AI agents', monthly: 5000, oneTime: 0, basis: 'Small business plan' }],
  currency: 'USD', plan: 'Week 1 setup.', nextStep: 'A call.',
  text: `Hi team, I looked at how ${business} takes calls and found gaps an AI receptionist would close. This is a draft for your review.`,
});
async function seed(store: MemoryStore) {
  await importContacts(store, ORG, [
    'Rank,Business,Niche,City,Website,Main phone (public listing),Decision maker,Deal tier,Ease of win',
    '1,Total Air & Plumbing,HVAC and plumbing,Plano,totalair.com,(972) 555-0100,"Steve Lauten, owner",High,High',
    '2,Starwood Med Spa,Med spa,Frisco,starwood.example,,,Low,Low',
    '3,Ellis Air,HVAC,Dallas,ellisac.com,,,,',
  ].join('\n'), 'owner');
}

test('score: follows the Lead Scorer rubric from the list and the research, and says so', () => {
  const r = { pains: [{ point: 'a', evidence: '', source: SRC }, { point: 'b', evidence: '', source: SRC }], opportunities: [{ title: 'x', how: '', impact: '' }], found: [{ field: 'email' as const, value: 'a@b.co', source: SRC, note: '', usedAt: null }] };
  const s = scoreFromResearch({ name: 'Steve Lauten', company: 'Total Air', phone: '972 555 0100', email: '', niche: 'HVAC', dealTier: 'High', ease: 'High' }, r as never, { roi: { netMonthly: 2800 } } as never);
  // fit 10 + 12 + 4 = 26, size 20, ease 20, reach 4 + 3 + 3 = 10, momentum 3
  assert.equal(s.score, 79);
  assert.match(s.reasons, /^Scored from the research, with no agent run\./);
  assert.match(s.reasons, /Reach 10\/10: named decision maker, phone, email/);
  const loss = scoreFromResearch({ name: 'Total Air', company: 'Total Air', phone: '', email: '', dealTier: 'High' }, r as never, { roi: { netMonthly: -500 } } as never);
  assert.match(loss.reasons, /Size 4\/20: deal tier High, but the proposal draft shows no net gain for them/);
  const losing = scoreFromResearch({ name: 'Steve Lauten', company: 'Total Air', phone: '972 555 0100', email: 'a@b.co', niche: 'HVAC', dealTier: 'High', ease: 'High' }, r as never, { roi: { netMonthly: -500 } } as never);
  assert.equal(losing.score, 59, 'a proposal that loses them money keeps the lead in Qualify');
  assert.match(losing.reasons, /rework the offer before sending it/);
});

test('import: researched leads are scored with no agent run and those worth working move to Outreach', async () => {
  const store = fresh();
  await seed(store);
  const json = JSON.stringify({ reports: [
    { company: 'Total Air & Plumbing', website: 'totalair.com', research: research('Total Air'), proposal: proposal('Total Air', 7800) },
    { company: 'Starwood Med Spa', website: 'starwood.example', research: research('Starwood'), proposal: proposal('Starwood', 3000) },
  ] });
  const r = await importResearch(store, ORG, json, 'owner');
  assert.equal(r.scored, 2);
  assert.equal(r.workNow, 1);
  const crm = await loadCrm(store, ORG);
  const ta = crm.contacts.find((c) => c.company === 'Total Air & Plumbing')!;
  const spa = crm.contacts.find((c) => c.company === 'Starwood Med Spa')!;
  assert.equal(ta.leadScore!.by, RESEARCH_SCORER);
  assert.ok(ta.leadScore!.score >= 60);
  assert.equal(flowStageOf(ta), 'outreach', 'worth working, with a proposal draft: on to Outreach');
  assert.ok(spa.leadScore!.score < 60);
  assert.equal(flowStageOf(spa), 'qualify');
  assert.equal(ta.stage, 'lead', 'the deal stage is not changed; nothing was sent');

  const mine = (id: string) => crm.nextActions.filter((a) => a.contactId === id).map((a) => a.rule);
  for (const c of [ta, spa]) {
    assert.ok(!mine(c.id).includes('research'), 'no Business Research run');
    assert.ok(!mine(c.id).includes('score'), 'no Lead Scorer run');
    assert.ok(!mine(c.id).includes('sequence'), 'no Outreach Sequencer run: the proposal is the outreach');
  }
  assert.ok(mine(ta.id).includes('proposal_send'));
  assert.ok(!crm.nextActions.some((a) => a.rule === 'research_advance'));

  const impact = researchImpact(crm.contacts);
  assert.deepEqual({ researched: impact.researched, imported: impact.imported, proposals: impact.proposals, scored: impact.scored, workNow: impact.workNow, waiting: impact.waiting, agentRunsSaved: impact.agentRunsSaved },
    { researched: 2, imported: 2, proposals: 2, scored: 2, workNow: 1, waiting: 0, agentRunsSaved: 6 });

  // The same file again scores nothing twice.
  const again = await importResearch(store, ORG, json, 'owner');
  assert.equal(again.scored, 0);
});

test('move them on: scores researched leads that have no score, and keeps a score already there', async () => {
  const store = fresh();
  await seed(store);
  const ellis = await byCompany(store, 'Ellis Air');
  await saveLeadScore(store, ORG, ellis.id, 55, 'Scored by the agent.', null, 'Lead Scorer');
  await importResearch(store, ORG, JSON.stringify({ reports: [{ company: 'Ellis Air', website: 'ellisac.com', research: research('Ellis') }] }), 'owner');
  assert.equal((await byCompany(store, 'Ellis Air')).leadScore!.by, 'Lead Scorer', 'an existing score is kept');

  // A lead researched before this change (research on the deal, no score) is offered Move them on.
  const ta = await byCompany(store, 'Total Air & Plumbing');
  await store.audit({ id: 'evt-old-research', orgId: ORG, at: new Date().toISOString(), actor: 'owner', action: 'crm.research', taskId: null, detail: { contactId: ta.id, research: { id: 'r-old', ...research('Total Air'), found: [], owner: '', presence: '', unknowns: '', sources: [] } } });
  let crm = await loadCrm(store, ORG);
  const a = crm.nextActions.find((x) => x.rule === 'research_advance');
  assert.equal(a?.count, 1);
  assert.equal(researchImpact(crm.contacts).waiting, 1);
  const moved = await advanceResearched(store, ORG);
  assert.equal(moved.scored, 1);
  crm = await loadCrm(store, ORG);
  assert.ok(!crm.nextActions.some((x) => x.rule === 'research_advance'));
  assert.equal(crm.contacts.find((c) => c.id === ta.id)!.leadScore!.by, RESEARCH_SCORER);
});
