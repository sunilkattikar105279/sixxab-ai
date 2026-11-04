// Raise: the founder → CFO capital-raising workflow (round terms, investor pipeline, pre-orders, steps).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { MemoryStore } from '../core/store.js';

const ORG = 'org-1';
const raise = () => import('../core/raise.js');

test('a post-money SAFE round tracks target, commitments, funding and estimated dilution', async () => {
  const { setRound, upsertInvestor, setInvestorStage, loadRaise } = await raise();
  const s = new MemoryStore();
  await setRound(s, ORG, { name: 'Pre-seed', instrument: 'safe-post', exemption: '506b', target: 100_000, cap: 2_000_000, discount: 0, minCheck: 10_000 }, 'founder');
  const a = await upsertInvestor(s, ORG, { name: 'Asha Rao', type: 'angel', email: 'asha@example.com', relationship: 'Former colleague' }, 'founder');
  const b = await upsertInvestor(s, ORG, { name: 'Seed Fund', firm: 'Seed Fund LP', type: 'vc', relationship: 'Intro from Ravi' }, 'founder');
  await setInvestorStage(s, ORG, a.id, 'committed', 'founder', 25_000);
  await setInvestorStage(s, ORG, b.id, 'funded', 'founder', 50_000);
  const r = await loadRaise(s, ORG);
  assert.equal(r.round?.target, 100_000);
  assert.equal(r.totals.committed, 75_000, 'committed counts committed, signed and funded');
  assert.equal(r.totals.funded, 50_000);
  assert.equal(r.totals.pctCommitted, 75);
  assert.equal(r.totals.dilutionPct, 3.75, '75K on a 2M post-money cap is 3.75%');
  assert.equal(r.pipeline.committed, 1);
  assert.equal(r.pipeline.funded, 1);
});

test('round terms are validated', async () => {
  const { setRound } = await raise();
  const s = new MemoryStore();
  await assert.rejects(setRound(s, ORG, { name: 'x', instrument: 'safe-post', exemption: '506b', target: 0 }, 'f'), /target/);
  await assert.rejects(setRound(s, ORG, { name: 'x', instrument: 'shares', exemption: '506b', target: 1000 } as never, 'f'), /instrument/);
  await assert.rejects(setRound(s, ORG, { name: 'x', instrument: 'safe-post', exemption: '506b', target: 1000, discount: 80 }, 'f'), /discount/);
});

test('investor records are validated and the latest version wins', async () => {
  const { upsertInvestor, loadRaise, removeInvestor } = await raise();
  const s = new MemoryStore();
  await assert.rejects(upsertInvestor(s, ORG, { name: '', type: 'angel' }, 'f'), /name/);
  await assert.rejects(upsertInvestor(s, ORG, { name: 'A', type: 'angel', email: 'not-an-email' }, 'f'), /email/);
  const a = await upsertInvestor(s, ORG, { name: 'A', type: 'angel' }, 'f');
  await upsertInvestor(s, ORG, { id: a.id, name: 'A. Investor', type: 'syndicate', nextStep: 'Send deck' }, 'f');
  let r = await loadRaise(s, ORG);
  assert.equal(r.investors.length, 1);
  assert.equal(r.investors[0].name, 'A. Investor');
  assert.equal(r.investors[0].stage, 'target', 'editing keeps the stage');
  await removeInvestor(s, ORG, a.id, 'f');
  r = await loadRaise(s, ORG);
  assert.equal(r.investors.length, 0);
});

test('compliance warnings: 506(b) needs a prior relationship, 506(c) needs verified accreditation before money', async () => {
  const { setRound, upsertInvestor, setInvestorStage, loadRaise } = await raise();
  const s = new MemoryStore();
  await setRound(s, ORG, { name: 'Pre-seed', instrument: 'safe-post', exemption: '506b', target: 100_000, cap: 2_000_000 }, 'f');
  const cold = await upsertInvestor(s, ORG, { name: 'Cold VC', type: 'vc', email: 'vc@example.com' }, 'f');
  let r = await loadRaise(s, ORG);
  assert.equal(r.investors[0].canEmail, false);
  assert.match(r.investors[0].warnings.join(' '), /506\(b\)/);

  await setRound(s, ORG, { name: 'Pre-seed', instrument: 'safe-post', exemption: '506c', target: 100_000, cap: 2_000_000 }, 'f');
  await setInvestorStage(s, ORG, cold.id, 'committed', 'f', 10_000);
  r = await loadRaise(s, ORG);
  assert.equal(r.investors[0].canEmail, true, '506(c) allows outreach to people you do not know');
  assert.match(r.investors[0].warnings.join(' '), /accredit/i);
  await assert.rejects(setInvestorStage(s, ORG, cold.id, 'funded', 'f', 10_000), /accredit/i, 'no funding without verification under 506(c)');
});

test('a priced round: $100K at $1.9M pre-money gives investors 5% of a $2M post-money company', async () => {
  const { setRound, upsertInvestor, setInvestorStage, loadRaise, raiseForPrompt } = await raise();
  const s = new MemoryStore();
  await setRound(s, ORG, { name: 'Seed', instrument: 'priced', exemption: '506b', target: 100_000, preMoney: 1_900_000, cap: 5_000_000 }, 'f');
  let r = await loadRaise(s, ORG);
  assert.equal(r.round?.cap, undefined, 'a cap is not kept on a priced round');
  assert.equal(r.totals.postMoney, 2_000_000);
  const a = await upsertInvestor(s, ORG, { name: 'Asha', type: 'angel', relationship: 'Colleague' }, 'f');
  await setInvestorStage(s, ORG, a.id, 'committed', 'f', 100_000);
  r = await loadRaise(s, ORG);
  assert.equal(r.totals.dilutionPct, 5);
  assert.match(raiseForPrompt(r), /priced equity round at a \$1,900,000 pre-money valuation \(\$2,000,000 post-money, 5% for investors\)/);
});

test('founding-member pre-orders are sales: validated, tracked apart from the equity round', async () => {
  const { setRound, setCampaign, loadRaise } = await raise();
  const s = new MemoryStore();
  await setRound(s, ORG, { name: 'Seed', instrument: 'priced', exemption: '506b', target: 100_000, preMoney: 1_900_000 }, 'f');
  await assert.rejects(setCampaign(s, ORG, { channel: 'Wefunder', stage: 'planning' } as never, 'f'), /channel/);
  await assert.rejects(setCampaign(s, ORG, { channel: 'Kickstarter', stage: 'planning', url: 'javascript:alert(1)' }, 'f'), /url/);
  await assert.rejects(setCampaign(s, ORG, { channel: 'Kickstarter', stage: 'live', tiers: [] }, 'f'), /tier and the date/, 'cannot go live without tiers and a delivery date');
  await assert.rejects(setCampaign(s, ORG, { channel: 'Kickstarter', stage: 'planning', tiers: [{ name: 'Early', price: 0, reward: 'x' }] }, 'f'), /price/);
  await setCampaign(s, ORG, {
    channel: 'Own page (Stripe link)', stage: 'live', url: 'https://buy.stripe.com/abc', goal: 50_000, pledged: 12_000, backers: 8,
    deliverBy: '2027-01-15', tiers: [{ name: 'Founding member', price: 1_500, limit: 20, reward: '3 months of the Founder plan' }],
  }, 'f');
  const r = await loadRaise(s, ORG);
  assert.equal(r.campaign?.tiers?.[0].limit, 20);
  assert.equal(r.totals.preorders, 12_000);
  assert.equal(r.totals.committed, 0, 'pre-orders never count as investment');
});

test('pre-order steps feed public posts, so they never see the private round terms', async () => {
  const { setRound, setCampaign, loadRaise } = await raise();
  const s = new MemoryStore();
  await setRound(s, ORG, { name: 'Seed', instrument: 'priced', exemption: '506b', target: 100_000, preMoney: 1_900_000 }, 'f');
  await setCampaign(s, ORG, { channel: 'Kickstarter', stage: 'planning', goal: 20_000 }, 'f');
  const r = await loadRaise(s, ORG);
  for (const step of r.steps.filter((x) => x.track === 'Pre-orders')) {
    assert.doesNotMatch(step.goal, /1,900,000|pre-money|506/, `${step.id} must not carry round terms`);
    assert.match(step.goal, /Founding-member pre-orders/);
  }
  assert.match(r.steps.find((x) => x.id === 'list')!.goal, /1,900,000/, 'investor steps do see the terms');
});

test('steps follow hard dependencies from founder to CFO to close', async () => {
  const { completeRaiseStep, reopenRaiseStep, loadRaise, setRound } = await raise();
  const s = new MemoryStore();
  let r = await loadRaise(s, ORG);
  assert.equal(r.steps.find((x) => x.id === 'model')?.status, 'ready');
  assert.equal(r.steps.find((x) => x.id === 'terms')?.status, 'blocked');
  await assert.rejects(completeRaiseStep(s, ORG, 'terms', 'f'), /Finish first/);
  await completeRaiseStep(s, ORG, 'model', 'f');
  await assert.rejects(completeRaiseStep(s, ORG, 'terms', 'f'), /round/i, 'terms need a round set');
  await setRound(s, ORG, { name: 'Pre-seed', instrument: 'safe-post', exemption: '506b', target: 100_000, cap: 2_000_000 }, 'f');
  r = await completeRaiseStep(s, ORG, 'terms', 'f');
  assert.equal(r.steps.find((x) => x.id === 'terms')?.status, 'done');
  r = await reopenRaiseStep(s, ORG, 'model', 'f');
  assert.equal(r.steps.find((x) => x.id === 'model')?.status, 'ready');
  assert.ok(r.steps.every((x) => x.goal === '' || x.agentId), 'every agent step names its agent');
});

test('CSV import adds investors and skips bad rows', async () => {
  const { importInvestors, loadRaise } = await raise();
  const s = new MemoryStore();
  const out = await importInvestors(s, ORG, 'name,firm,email,type,relationship\nAsha Rao,,asha@example.com,angel,Former colleague\n,,x@y.com,vc,\nBeta Ventures,Beta,partners@beta.vc,vc,Intro from Ravi\nBad Email,,nope,angel,\n', 'f');
  assert.equal(out.added, 2);
  assert.equal(out.skipped, 2);
  const r = await loadRaise(s, ORG);
  assert.deepEqual(r.investors.map((i) => i.name).sort(), ['Asha Rao', 'Beta Ventures']);
});

test('raise context for agents states terms only from what the founder recorded', async () => {
  const { setRound, loadRaise, raiseForPrompt } = await raise();
  const s = new MemoryStore();
  assert.match(raiseForPrompt(await loadRaise(s, ORG)), /No round is set/);
  await setRound(s, ORG, { name: 'Pre-seed', instrument: 'safe-post', exemption: '506b', target: 100_000, cap: 2_000_000 }, 'f');
  const p = raiseForPrompt(await loadRaise(s, ORG));
  assert.match(p, /100,000/);
  assert.match(p, /2,000,000/);
  assert.match(p, /506\(b\)/);
});
