// Lead generation agents: ICP Builder, Prospect Generator, Lead Scorer, Outreach Sequencer, Objection Handler
// and CRM Sync. They read the CRM and save drafts, scores and suggestions onto it; nothing is ever sent, and a
// prospect becomes a lead only when the owner says yes.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { MemoryStore } from '../core/store.js';
import { DEFAULT_TASK_TYPES } from '../core/policy.js';
import { createTask, runTask } from '../core/runtime.js';
import { AGENTS, getAgent } from '../core/agents.js';
import { TOOLS } from '../core/tools.js';
import { addNote, loadCrm, qualifyDeal, setDealStage, upsertContact } from '../core/crm.js';
import {
  decideProspects, dismissSync, icpGoal, logAgentRun, markStepSent, pickDeals, prospectGoal, proposeProspects, readCrm,
  removeIcp, saveIcp, saveIcpNotes, saveLeadScore, saveObjection, saveSequence, scoreGoal, sequenceGoal, syncDeal, syncDealGoal, syncGoal,
} from '../core/leadgen.js';
import { likelyObjectionsGoal, objectionGoal } from '../core/gtm.js';
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
  await upsertContact(store, ORG, { name: 'Dana Reyes', company: 'Reyes Injury Law', title: 'Managing partner', city: 'Dallas', niche: 'Personal injury', website: 'https://www.reyeslaw.example/', phone: '214-555-0100', rank: 1, dealTier: 'High', ease: 'High', whyFit: 'Calls after 6 PM go to voicemail.', source: 'web-search' }, 'owner');
  await upsertContact(store, ORG, { name: 'Lone Star Roofing', company: 'Lone Star Roofing', city: 'Fort Worth', niche: 'Roofing', rank: 2 }, 'owner');
  const crm = await loadCrm(store, ORG);
  return { law: crm.contacts.find((c) => c.company === 'Reyes Injury Law')!, roof: crm.contacts.find((c) => c.company === 'Lone Star Roofing')! };
}

test('the six lead agents exist, use only real tools, and none of them can contact anyone', () => {
  for (const id of ['icp-builder', 'lead-finder', 'lead-scorer', 'outreach-sequencer', 'objection-handler', 'crm-sync']) {
    const a = getAgent(id);
    assert.ok(a && a.usesModel, `${id} runs`);
    for (const t of a!.tools) assert.ok(TOOLS[t] || t === 'web_search', `${id} tool ${t} exists`);
    assert.ok(!a!.tools.some((t) => ['send_message', 'publish_post', 'reply_comment', 'send_email_campaign', 'spend_money'].includes(t)), `${id} must not send or spend`);
    assert.ok(a!.tools.includes('read_crm'), `${id} reads the CRM`);
  }
  assert.equal(getAgent('lead-finder')!.name, 'Prospect Generator');
  assert.ok(getAgent('lead-finder')!.tools.includes('propose_prospects'));
  for (const name of ['read_crm', 'save_icp', 'propose_prospects', 'save_lead_score', 'save_sequence', 'save_objection', 'sync_deal']) {
    assert.equal(TOOLS[name].taskType, undefined, `${name} sends nothing, so it needs no approval`);
  }
  assert.equal(new Set(AGENTS.map((a) => a.id)).size, AGENTS.length);
});

test('ICP Builder: notes and ICPs are saved, updated in place by id or name, and removed', async () => {
  const store = fresh();
  await saveIcpNotes(store, ORG, 'Personal injury firms in DFW, 5 to 30 staff. Sign off: Sunil', 'owner');
  assert.match(await readCrm(store, ORG, 'icp_notes'), /Personal injury firms in DFW/);
  await assert.rejects(saveIcp(store, ORG, { name: 'No summary' }, 'ICP Builder'), /summary/);
  const a = await saveIcp(store, ORG, { name: 'DFW PI firms', summary: 'Small personal injury firms in Dallas-Fort Worth.', buyer: 'Managing partner' }, 'ICP Builder');
  await saveIcp(store, ORG, { name: 'dfw pi firms', summary: 'Updated summary.', signals: 'Contact form only' }, 'ICP Builder');
  let crm = await loadCrm(store, ORG);
  assert.equal(crm.icps.length, 1, 'same name updates instead of duplicating');
  assert.equal(crm.icps[0].id, a.id);
  assert.equal(crm.icps[0].summary, 'Updated summary.');
  await saveIcp(store, ORG, { id: a.id, name: 'DFW personal injury firms', summary: 'Renamed.' }, 'owner');
  crm = await loadCrm(store, ORG);
  assert.deepEqual(crm.icps.map((i) => i.name), ['DFW personal injury firms']);
  assert.match(await readCrm(store, ORG, 'icps'), /ICP id .*DFW personal injury firms/);
  await removeIcp(store, ORG, a.id, 'owner');
  assert.equal((await loadCrm(store, ORG)).icps.length, 0);
});

test('Prospect Generator: prospects wait for the owner, skip anyone known, and become New leads only on a yes', async () => {
  const store = fresh();
  await seed(store);
  const icp = await saveIcp(store, ORG, { name: 'DFW PI firms', summary: 'Small PI firms' }, 'ICP Builder');
  const r = await proposeProspects(store, ORG, icp.id, [
    { company: 'Reyes Injury Law', website: 'reyeslaw.example', sourcePage: 'https://maps.example/1' },
    { company: 'Garza & Cole', website: 'https://www.garzacole.example/contact', phone: '817-555-0101', email: 'not an email', whyFit: 'No after-hours line', signal: 'Hiring an intake clerk', sourcePage: 'https://garzacole.example' },
    { company: 'Pham Law Group', sourcePage: 'https://bar.example/pham' },
    { company: 'No Source LLC' },
    { company: 'garza & cole', sourcePage: 'https://dup.example' },
  ], 'Prospect Generator');
  assert.equal(r.kept, 2);
  assert.equal(r.skipped.length, 3, 'known business, missing source and duplicate are left out');
  let crm = await loadCrm(store, ORG);
  assert.equal(crm.contacts.length, 2, 'nothing is added before the owner says yes');
  const batch = crm.prospectBatches[0];
  assert.equal(batch.icpName, 'DFW PI firms');
  const garza = batch.items.find((p) => p.company === 'Garza & Cole')!;
  assert.equal(garza.website, 'garzacole.example');
  assert.equal(garza.email, '', 'an invalid email is dropped, never guessed');
  assert.match(await readCrm(store, ORG, 'existing'), /Waiting for the owner's yes \(2\)/);
  const again = await proposeProspects(store, ORG, null, [{ company: 'Pham Law Group', sourcePage: 'https://x.example' }], 'Prospect Generator');
  assert.equal(again.kept, 0, 'a business already waiting is not proposed twice');

  const pham = batch.items.find((p) => p.company === 'Pham Law Group')!;
  const d = await decideProspects(store, ORG, batch.id, [garza.key], [pham.key], 'owner');
  assert.deepEqual(d, { added: 1, dismissed: 1 });
  crm = await loadCrm(store, ORG);
  const lead = crm.contacts.find((c) => c.company === 'Garza & Cole')!;
  assert.equal(lead.stage, 'lead');
  assert.equal(lead.source, 'web-search');
  assert.equal(lead.sourceDetail, 'https://garzacole.example');
  assert.match(lead.whyFit, /Signal: Hiring an intake clerk/);
  assert.equal(lead.history.at(-1)!.text, 'Lead from the Prospect Generator');
  assert.equal(crm.prospectBatches.length, 0, 'a fully decided batch leaves the list');
  await assert.rejects(decideProspects(store, ORG, batch.id, [garza.key], [], 'owner'), /already decided/);
});

test('Lead Scorer: a score with reasons is saved on the deal, survives edits, and shows in history', async () => {
  const store = fresh();
  const { law } = await seed(store);
  await assert.rejects(saveLeadScore(store, ORG, law.id, 140, 'too high', null, 'Lead Scorer'), /0 to 100/);
  await assert.rejects(saveLeadScore(store, ORG, law.id, 80, '', null, 'Lead Scorer'), /reasons/);
  await assert.rejects(saveLeadScore(store, ORG, 'missing-id', 80, 'x', null, 'Lead Scorer'), /No deal/);
  await saveLeadScore(store, ORG, law.id, 84.4, 'ICP fit 36/40: DFW PI firm. Ease 18/20: voicemail after 6 PM.', null, 'Lead Scorer');
  await upsertContact(store, ORG, { id: law.id, name: 'Dana Reyes', nextStep: 'Call Tuesday' }, 'owner');
  const c = (await loadCrm(store, ORG)).contacts.find((x) => x.id === law.id)!;
  assert.equal(c.leadScore!.score, 84);
  assert.equal(c.leadScore!.grade, 'A');
  assert.equal(c.leadScore!.by, 'Lead Scorer');
  assert.equal(c.nextStep, 'Call Tuesday');
  assert.ok(c.history.some((h) => h.kind === 'score' && /Lead score 84 \(A\)/.test(h.text)));
});

test('Outreach Sequencer: steps are drafts; marking one sent logs a touch and moves a new lead to Contacted', async () => {
  const store = fresh();
  const { law } = await seed(store);
  await assert.rejects(saveSequence(store, ORG, law.id, [{ day: 0, channel: 'email', text: 'Hi' }], '', 'Outreach Sequencer'), /at least 2/);
  const out = await saveSequence(store, ORG, law.id, [
    { day: 5, channel: 'email', subject: 'Following up', text: 'Second email' },
    { day: 0, channel: 'email', subject: 'After-hours calls at Reyes', text: 'Hi Dana, …' },
    { day: 2, channel: 'LinkedIn', subject: 'ignored', text: 'Connection note' },
  ], 'Check the partner name first', 'Outreach Sequencer');
  assert.match(out, /Nothing was sent/);
  let c = (await loadCrm(store, ORG)).contacts.find((x) => x.id === law.id)!;
  assert.deepEqual(c.sequence!.steps.map((s) => [s.day, s.channel, s.subject]), [[0, 'email', 'After-hours calls at Reyes'], [2, 'linkedin', ''], [5, 'email', 'Following up']]);
  assert.equal(c.stage, 'lead');
  assert.equal(c.lastTouch, null, 'drafting is not a touch');
  await markStepSent(store, ORG, law.id, 0, 'owner');
  await assert.rejects(markStepSent(store, ORG, law.id, 0, 'owner'), /already/);
  c = (await loadCrm(store, ORG)).contacts.find((x) => x.id === law.id)!;
  assert.ok(c.sequence!.steps[0].sentAt);
  assert.equal(c.stage, 'contacted');
  assert.ok(c.lastTouch);
  assert.ok(c.history.some((h) => h.kind === 'email' && /Sent outreach email: After-hours calls at Reyes \(step 1 of 3\)/.test(h.text)));
});

test('Objection Handler: answers are saved on the deal, newest first, one entry per objection', async () => {
  const store = fresh();
  const { law } = await seed(store);
  await assert.rejects(saveObjection(store, ORG, law.id, '', ['x'], '', 'Objection Handler'), /which objection/);
  await saveObjection(store, ORG, law.id, 'Too expensive', ['Acknowledge…', 'Ask what one missed case costs…'], 'Budget timing', 'Objection Handler');
  await saveObjection(store, ORG, law.id, 'We already have a receptionist', 'She leaves at 5…', '', 'Objection Handler');
  await saveObjection(store, ORG, law.id, 'too expensive', ['New answer'], '', 'Objection Handler');
  const c = (await loadCrm(store, ORG)).contacts.find((x) => x.id === law.id)!;
  assert.deepEqual(c.objections.map((o) => o.objection), ['too expensive', 'We already have a receptionist']);
  assert.deepEqual(c.objections[1].responses, ['She leaves at 5…']);
  const deal = { ...c, meddic: c.meddic };
  assert.match(objectionGoal(deal, 'Too expensive'), new RegExp(`save_objection \\(contactId ${c.id}\\)`));
  assert.match(likelyObjectionsGoal(deal), new RegExp(`save_objection \\(contactId ${c.id}\\), one call per objection`));
});

test('CRM Sync: fills only empty fields, never overwrites, suggests stages, and logs every agent run on a deal', async () => {
  const store = fresh();
  const { law, roof } = await seed(store);
  await assert.rejects(syncDeal(store, ORG, { contactId: law.id }, 'CRM Sync'), /Say what was inconsistent/);
  const out = await syncDeal(store, ORG, { contactId: law.id, reason: 'Research names the email; history shows a call booked', fill: { city: 'Austin', email: 'dana@reyeslaw.example' }, nextStep: 'Discovery call Thursday', suggestStage: 'qualified' }, 'CRM Sync');
  assert.match(out, /filled email, nextStep/);
  let c = (await loadCrm(store, ORG)).contacts.find((x) => x.id === law.id)!;
  assert.equal(c.city, 'Dallas', 'an existing value is never overwritten');
  assert.equal(c.email, 'dana@reyeslaw.example');
  assert.equal(c.nextStep, 'Discovery call Thursday');
  assert.equal(c.stage, 'lead', 'CRM Sync never moves a deal itself');
  assert.equal(c.syncSuggestion!.stage, 'qualified');
  assert.ok(c.history.some((h) => h.text === 'Details filled in by CRM Sync'));
  await setDealStage(store, ORG, law.id, 'qualified', 'owner');
  c = (await loadCrm(store, ORG)).contacts.find((x) => x.id === law.id)!;
  assert.equal(c.syncSuggestion, null, 'moving the deal settles the suggestion');
  await syncDeal(store, ORG, { contactId: roof.id, reason: 'History shows a reply', suggestStage: 'contacted' }, 'CRM Sync');
  await dismissSync(store, ORG, roof.id, 'owner');
  assert.equal((await loadCrm(store, ORG)).contacts.find((x) => x.id === roof.id)!.syncSuggestion, null);

  assert.equal(await logAgentRun(store, ORG, roof.id, 'Call Prepper', 'done', 'Three questions to ask about storm season.', 0), true);
  assert.equal(await logAgentRun(store, ORG, 'gone', 'Call Prepper', 'done', 'x', 0), false);
  const r = (await loadCrm(store, ORG)).contacts.find((x) => x.id === roof.id)!;
  assert.match(r.history[0].text, /^Call Prepper finished\. Three questions/);
  assert.equal(r.history[0].kind, 'agent');
});

test('CRM Sync finds records that disagree with themselves', async () => {
  const store = fresh();
  const { law, roof } = await seed(store);
  await setDealStage(store, ORG, law.id, 'qualified', 'owner');
  await upsertContact(store, ORG, { name: 'Lone Star Roofing LLC', company: 'Lone Star Roofing', city: 'Fort Worth' }, 'owner');
  const crm = await loadCrm(store, ORG);
  const issues = crm.issues.map((i) => `${i.name}: ${i.issue}`).join('\n');
  assert.match(issues, /Reyes Injury Law: .*MEDDIC/);
  assert.match(issues, /Lone Star Roofing: .*(email|phone)/);
  assert.match(issues, /duplicate|same/i);
  await qualifyDeal(store, ORG, law.id, { metrics: 'confirmed' }, 'Call went well', 'owner');
  assert.ok(!(await loadCrm(store, ORG)).issues.some((i) => i.contactId === law.id && /MEDDIC/.test(i.issue)));
  assert.match(await readCrm(store, ORG, 'issues'), new RegExp(`id ${roof.id}`));
  await addNote(store, ORG, roof.id, 'note', 'n', 'owner');
});

test('agents save through their tools without an approval, and read several deals at once', async () => {
  const store = fresh();
  const { law, roof } = await seed(store);
  const model = new Model([
    { content: [use('a', 'read_crm', { view: 'deals', contactIds: [law.id, roof.id] })], stopReason: 'tool_use' },
    { content: [use('b', 'save_lead_score', { contactId: law.id, score: 82, reasons: 'Strong ICP fit' }), use('c', 'save_lead_score', { contactId: roof.id, score: 35, reasons: 'Outside the ICP' })], stopReason: 'tool_use' },
    { content: [{ type: 'text', text: 'Scored 2 leads.' }], stopReason: 'end_turn' },
  ]);
  const task = await createTask(store, ORG, 'lead-scorer', scoreGoal([law.id, roof.id]));
  const res = await runTask({ store, model, integrations: NO_SEND }, task.id);
  assert.equal(res.task.status, 'done');
  assert.equal(res.approvals.length, 0);
  const toolResult = JSON.stringify(model.calls[1].messages.at(-1));
  assert.match(toolResult, /Reyes Injury Law/);
  assert.match(toolResult, /Lone Star Roofing/);
  const crm = await loadCrm(store, ORG);
  assert.deepEqual(crm.contacts.map((c) => c.leadScore?.grade), ['A', 'D']);
  assert.equal(crm.contacts[0].leadScore!.by, 'Lead Scorer');
  assert.equal(getAgent('lead-scorer')!.maxTurns, 12);
});

test('goals stay short enough to run and point at the right deals', async () => {
  const store = fresh();
  const { law, roof } = await seed(store);
  await saveLeadScore(store, ORG, law.id, 90, 'fit', null, 'Lead Scorer');
  const crm = await loadCrm(store, ORG);
  assert.deepEqual(pickDeals(crm.contacts, 'unscored', 10), [roof.id]);
  assert.deepEqual(pickDeals(crm.contacts, 'no_sequence', 3), [law.id, roof.id], 'best score first');
  const ids = Array.from({ length: 12 }, (_, i) => `00000000-0000-0000-0000-00000000000${i % 10}`);
  for (const g of [icpGoal(crm), prospectGoal({ id: 'x', name: 'DFW PI firms' }, '', 20), prospectGoal(null, 'q'.repeat(500), 10), scoreGoal(ids), sequenceGoal(ids.slice(0, 3)), syncGoal(9), syncDealGoal(law.id)]) {
    assert.ok(g.length > 100 && g.length < 4000, `goal fits: ${g.slice(0, 40)}`);
  }
  assert.match(prospectGoal(null, 'clinics', 10), /leave a field empty when it is not published/);
  assert.match(sequenceGoal([law.id]), /nothing is sent/);
});

test('every sheet of a workbook is read by name, the first sheet as before', async () => {
  const { xlsxSheets, xlsxToCsv } = await import('../src/lib/sheet.js');
  const b = readFileSync(new URL('./fixtures/lead-sheet.xlsx', import.meta.url));
  const buf = b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength);
  const sheets = await xlsxSheets(buf);
  assert.ok(sheets.length >= 1);
  assert.ok(sheets.every((s) => s.name));
  assert.equal(sheets[0].csv, await xlsxToCsv(buf));
});

test('the CRM reads every event, past the 1,000-row page limit', async () => {
  const { SupabaseStore } = await import('../core/supabase-store.js');
  const rows = Array.from({ length: 2300 }, (_, i) => ({ id: `e${i}`, org_id: ORG, at: new Date(1e12 + i).toISOString(), actor: 'x', action: 'crm.note', task_id: null, detail: {} }));
  const seen: string[] = [];
  const fakeFetch = (async (url: string) => {
    seen.push(url);
    const u = new URL(url);
    const off = Number(u.searchParams.get('offset'));
    const lim = Number(u.searchParams.get('limit'));
    return new Response(JSON.stringify(rows.slice(off, off + lim)), { status: 200 });
  }) as unknown as typeof fetch;
  const s = new SupabaseStore('https://db.example', 'sb_secret_test', fakeFetch);
  const events = await s.listAuditByActions(ORG, ['crm.note']);
  assert.equal(events.length, 2300);
  assert.equal(seen.length, 3);
  assert.equal(events.at(-1)!.id, 'e2299', 'the newest event is kept');
});
