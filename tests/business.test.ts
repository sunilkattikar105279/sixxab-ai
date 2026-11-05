// CRM, Support desk and Accounting: validation, derived state and the goals handed to their agents.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { MemoryStore } from '../core/store.js';
import { getAgent } from '../core/agents.js';

const ORG = 'org-1';

test('CRM: contacts are validated, move through stages and roll up into the pipeline', async () => {
  const { upsertContact, setDealStage, loadCrm, removeContact } = await import('../core/crm.js');
  const s = new MemoryStore();
  await assert.rejects(upsertContact(s, ORG, { name: '' }, 'f'), /name/);
  await assert.rejects(upsertContact(s, ORG, { name: 'A', email: 'nope' }, 'f'), /email/);
  await assert.rejects(upsertContact(s, ORG, { name: 'A', value: -5 }, 'f'), /value/);
  let crm = await upsertContact(s, ORG, { name: 'Asha Rao', email: 'asha@example.com', value: '5,000', source: 'referral' }, 'f');
  const asha = crm.contacts[0];
  assert.equal(asha.value, 5000);
  assert.equal(asha.stage, 'lead');
  crm = await upsertContact(s, ORG, { name: 'Ravi', value: 2000 }, 'f');
  const ravi = crm.contacts.find((c) => c.name === 'Ravi')!;
  await setDealStage(s, ORG, asha.id, 'won', 'f');
  crm = await setDealStage(s, ORG, ravi.id, 'lost', 'f');
  assert.equal(crm.totals.won, 1);
  assert.equal(crm.totals.wonValue, 5000);
  assert.equal(crm.totals.winRate, 50);
  await assert.rejects(setDealStage(s, ORG, asha.id, 'maybe' as never, 'f'), /stage/);
  crm = await removeContact(s, ORG, ravi.id, 'f');
  assert.equal(crm.contacts.length, 1);
});

test('CRM: only quiet open deals with an email get a follow-up, and the agent can send email', async () => {
  const { computeCrm } = await import('../core/crm.js');
  const ev = (action: string, at: string, detail: Record<string, unknown>) => ({ id: at + action, orgId: ORG, at, actor: 'f', action, taskId: null, detail });
  const base = { company: '', phone: '', source: 'other', value: 0, nextStep: '', notes: '' };
  const events = [
    ev('crm.contact', '2026-10-01T00:00:00Z', { contact: { ...base, id: 'c-quiet1', name: 'Quiet', email: 'q@example.com' } }),
    ev('crm.contact', '2026-10-01T00:00:00Z', { contact: { ...base, id: 'c-fresh1', name: 'Fresh', email: 'f@example.com' } }),
    ev('crm.touch', '2026-11-03T00:00:00Z', { contactId: 'c-fresh1' }),
    ev('crm.contact', '2026-10-01T00:00:00Z', { contact: { ...base, id: 'c-nomail', name: 'No email', email: '' } }),
  ];
  const crm = computeCrm(events, Date.parse('2026-11-04T00:00:00Z'));
  assert.equal(crm.totals.followUps, 1);
  assert.match(crm.followUpGoal, /Quiet <q@example.com>/);
  assert.doesNotMatch(crm.followUpGoal, /Fresh|No email/);
  assert.ok(getAgent('sales-crm')?.tools.includes('send_message'));
});

test('Support: tickets are numbered, sorted by priority and resolved with a time to resolve', async () => {
  const { openTicket, setTicketStatus, addTicketNote, loadSupport } = await import('../core/support.js');
  const s = new MemoryStore();
  await assert.rejects(openTicket(s, ORG, { subject: '', customer: 'x', message: 'y' }, 'f'), /subject/);
  let st = await openTicket(s, ORG, { subject: 'Opening hours', customer: 'Meera', contact: 'meera@example.com', message: 'Are you open Sunday?' }, 'f');
  st = await openTicket(s, ORG, { subject: 'Report not received', customer: 'Om', priority: 'urgent', channel: 'whatsapp', message: 'Where is my report?' }, 'f');
  assert.deepEqual(st.tickets.map((t) => t.number), [1002, 1001], 'urgent first');
  assert.equal(st.totals.urgent, 1);
  assert.match(st.replyGoal, /#1002 \[urgent\]/);
  assert.match(st.replyGoal, /never ask for or repeat medical details/);
  const id = st.tickets[1].id;
  await addTicketNote(s, ORG, id, 'Open 9 to 1 on Sundays', 'owner');
  st = await setTicketStatus(s, ORG, id, 'resolved', 'owner');
  const done = st.tickets.find((t) => t.id === id)!;
  assert.equal(done.status, 'resolved');
  assert.equal(done.notes.length, 2);
  assert.equal(st.totals.resolved, 1);
  assert.notEqual(st.totals.medianHoursToResolve, null);
  assert.ok(getAgent('support-desk'));
});

test('Accounting: entries are validated and roll up into a monthly profit and loss; the agent cannot send or spend', async () => {
  const { addEntry, loadAccounts, removeEntry } = await import('../core/accounting.js');
  const s = new MemoryStore();
  await assert.rejects(addEntry(s, ORG, { kind: 'income', date: '04/11/2026', amount: 10, category: 'sales' }, 'f'), /date/);
  await assert.rejects(addEntry(s, ORG, { kind: 'expense', date: '2026-11-01', amount: 0, category: 'rent' }, 'f'), /amount/);
  await addEntry(s, ORG, { kind: 'income', date: '2026-11-02', amount: '1,00,000', category: 'services' }, 'f', 'INR');
  await addEntry(s, ORG, { kind: 'expense', date: '2026-11-03', amount: 30000, category: 'rent' }, 'f', 'INR');
  let a = await addEntry(s, ORG, { kind: 'expense', date: '2026-10-15', amount: 5000, category: 'unknown-cat' }, 'f', 'INR');
  const nov = a.months.find((m) => m.month === '2026-11')!;
  assert.deepEqual([nov.income, nov.expenses, nov.profit, nov.margin], [100000, 30000, 70000, 70]);
  assert.equal(a.entries.find((e) => e.date === '2026-10-15')?.category, 'other', 'unknown categories fall back');
  a = await loadAccounts(s, ORG, 'INR', new Date('2026-11-20T00:00:00Z'));
  assert.equal(a.thisMonth.profit, 70000);
  assert.deepEqual(a.expensesByCategory, [{ category: 'rent', amount: 30000 }]);
  assert.match(a.reviewGoal, /2026-11: income 100000, expenses 30000, profit 70000/);
  a = await removeEntry(s, ORG, a.entries[0].id, 'f', 'INR');
  assert.equal(a.entries.length, 2);
  const tools = getAgent('accountant')!.tools;
  assert.ok(!tools.includes('send_message') && !tools.includes('spend_money'));
});

test('GTM: MEDDIC scores deals and every sales-loop agent gets a grounded goal', async () => {
  const { scoreMeddic, cleanMeddic, callPrepGoal, debriefGoal, followUpGoal, objectionGoal, pipelineReviewGoal } = await import('../core/gtm.js');
  assert.deepEqual(scoreMeddic(null), { score: 0, verdict: 'Early', gaps: ['Metrics', 'Economic buyer', 'Decision criteria', 'Decision process', 'Identified pain', 'Champion'] });
  const strong = cleanMeddic({ metrics: 'confirmed', economic_buyer: 'confirmed', decision_criteria: 'confirmed', decision_process: 'partial', pain: 'confirmed', champion: 'partial', extra: 'x' });
  assert.equal(scoreMeddic(strong).score, 83);
  assert.equal(scoreMeddic(strong).verdict, 'Qualified');
  assert.equal(cleanMeddic({ metrics: 'maybe' }).metrics, 'unknown', 'bad values fall back to unknown');
  const deal = { name: 'Dr Hajare', company: 'Radhakrishna Ortho', email: 'dr@example.com', stage: 'qualified', value: 8500, meddic: strong, callNotes: 'Wants 30 more patient enquiries a month.' };
  assert.match(callPrepGoal(deal), /Decision process, Champion/);
  assert.match(callPrepGoal(deal), /never invent facts/);
  assert.match(debriefGoal(deal), /30 more patient enquiries/);
  assert.match(followUpGoal(deal), /send_message \(channel "email", to dr@example.com\)/);
  assert.match(followUpGoal({ ...deal, email: '' }), /no email address/);
  assert.match(objectionGoal(deal, 'Too expensive'), /"Too expensive"/);
  assert.equal(pipelineReviewGoal([{ ...deal, stage: 'won' }]), '', 'nothing open, nothing to review');
  assert.match(pipelineReviewGoal([deal]), /MEDDIC 83% Qualified/);
  for (const id of ['head-of-gtm', 'call-prepper', 'deal-qualifier', 'follow-up-writer', 'objection-handler']) assert.ok(getAgent(id), id);
  assert.ok(getAgent('follow-up-writer')!.tools.includes('send_message'));
  assert.ok(!getAgent('head-of-gtm')!.tools.includes('send_message'), 'the Head of GTM recommends; it never contacts anyone');
});

test('CRM: qualifying a deal stores its MEDDIC score and call notes', async () => {
  const { upsertContact, qualifyDeal } = await import('../core/crm.js');
  const s = new MemoryStore();
  const c = (await upsertContact(s, ORG, { name: 'Dr Hajare', email: 'dr@example.com' }, 'f')).contacts[0];
  assert.equal(c.score, null);
  const crm = await qualifyDeal(s, ORG, c.id, { metrics: 'confirmed', pain: 'partial' }, 'Wants more enquiries', 'f');
  const q = crm.contacts[0];
  assert.equal(q.score, 25);
  assert.equal(q.meddic?.metrics, 'confirmed');
  assert.equal(q.callNotes, 'Wants more enquiries');
  assert.ok(q.lastTouch, 'qualifying counts as a touch');
  await assert.rejects(qualifyDeal(s, ORG, 'nope', {}, '', 'f'), /not found/);
});

test('Bookkeeping: a bank statement imports once, sorted into categories, unclear lines left for review', async () => {
  const { importStatement, loadAccounts, categorize } = await import('../core/accounting.js');
  const s = new MemoryStore();
  const csv = 'date,description,amount\n2026-11-02,UPI payment received from Patel,15000\n2026-11-03,Office rent November,-30000\n2026-11-04,Vercel Pro subscription,-1700\n2026-11-05,Misc cash,-200\nbad,row,10\n2026-11-06,Zero,0';
  const r = await importStatement(s, ORG, csv, 'f', 'INR');
  assert.deepEqual(r, { added: 4, skipped: 2, uncategorized: 1 });
  const again = await importStatement(s, ORG, csv, 'f', 'INR');
  assert.equal(again.added, 0, 'the same lines are not imported twice');
  const a = await loadAccounts(s, ORG, 'INR', new Date('2026-11-20T00:00:00Z'));
  assert.deepEqual(a.entries.map((e) => e.category).sort(), ['other', 'rent', 'sales', 'software']);
  assert.equal(a.thisMonth.income, 15000);
  assert.match(a.reviewGoal, /not categorized yet[\s\S]*Misc cash/);
  assert.equal(categorize('GST payment', 'expense'), 'taxes');
});

test('CRM: brand-new leads with an email go to Speed-to-Lead; the Lead Finder never invents emails', async () => {
  const { computeCrm, leadSearchGoal } = await import('../core/crm.js');
  const base = { company: '', phone: '', source: 'website', value: 0, nextStep: '', notes: '' };
  const ev = (at: string, contact: Record<string, unknown>) => ({ id: at + String(contact.id), orgId: ORG, at, actor: 'f', action: 'crm.contact', taskId: null, detail: { contact: { ...base, ...contact } } });
  const crm = computeCrm([
    ev('2026-11-04T10:00:00Z', { id: 'c-new001', name: 'New', email: 'n@example.com' }),
    ev('2026-10-01T10:00:00Z', { id: 'c-old001', name: 'Old', email: 'o@example.com' }),
    ev('2026-11-04T10:00:00Z', { id: 'c-nomail', name: 'No email', email: '' }),
  ], Date.parse('2026-11-04T12:00:00Z'));
  assert.equal(crm.newLeads, 1);
  assert.match(crm.speedGoal, /New <n@example.com>/);
  assert.doesNotMatch(crm.speedGoal, /Old|No email/);
  assert.match(leadSearchGoal('clinics in Pune'), /leave a field empty when it is not published/);
});
