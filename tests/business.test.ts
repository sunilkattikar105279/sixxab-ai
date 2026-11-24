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

test('Apollo: filters are validated, people parsed, imports de-duplicated, and emails revealed only by id', async () => {
  const { apolloBody, apolloSearch, apolloEnrich } = await import('../core/apollo.js');
  const { importApolloPeople, setContactEmail, loadCrm } = await import('../core/crm.js');
  assert.throws(() => apolloBody({}), /at least/);
  const body = apolloBody({ titles: 'Founder, CEO', locations: ['Pune, India'], employees: ['1,10', 'bad'], page: 99 });
  assert.deepEqual(body, { page: 20, per_page: 25, person_titles: ['Founder', 'CEO'], person_locations: ['Pune, India'], organization_num_employees_ranges: ['1,10'] });
  const calls: { url: string; init: RequestInit }[] = [];
  const fake = (async (url: string, init: RequestInit) => {
    calls.push({ url, init });
    if (url.endsWith('/mixed_people/api_search')) return new Response(JSON.stringify({ people: [{ id: 'a'.repeat(24), first_name: 'Asha', last_name_obfuscated: 'R***', title: 'Founder', organization: { name: 'Rao Clinic', primary_domain: 'raoclinic.in' }, city: 'Pune', country: 'India' }, { id: 'bad' }], pagination: { total_entries: 140 } }), { status: 200 });
    return new Response(JSON.stringify({ person: { email: 'asha@raoclinic.in', email_status: 'verified' } }), { status: 200 });
  }) as unknown as typeof fetch;
  const r = await apolloSearch('key', { titles: 'Founder' }, fake);
  assert.equal(r.total, 140);
  assert.deepEqual(r.people, [{ apolloId: 'a'.repeat(24), name: 'Asha R***', title: 'Founder', company: 'Rao Clinic', domain: 'raoclinic.in', location: 'Pune, India', linkedin: '' }]);
  assert.equal((calls[0].init.headers as Record<string, string>)['x-api-key'], 'key', 'the key goes in a header, never the URL');
  await assert.rejects(apolloSearch('', { titles: 'Founder' }, fake), /not connected/);
  const status = (code: number, error: string) => (async () => new Response(JSON.stringify({ error }), { status: code })) as unknown as typeof fetch;
  await assert.rejects(apolloSearch('k', { titles: 'Founder' }, status(401, 'Invalid access credentials.')), /not recognised.*Invalid access credentials/);
  await assert.rejects(apolloSearch('k', { titles: 'Founder' }, status(403, 'api/v1/mixed_people/api_search is not accessible with this api_key')), /master key.*not accessible/);
  const s = new MemoryStore();
  assert.deepEqual(await importApolloPeople(s, ORG, [...r.people, ...r.people], 'f'), { added: 1, skipped: 1 });
  assert.deepEqual(await importApolloPeople(s, ORG, r.people, 'f'), { added: 0, skipped: 1 }, 'already imported');
  const c = (await loadCrm(s, ORG)).contacts[0];
  assert.equal(c.source, 'apollo');
  assert.match(c.notes, /Title: Founder/);
  const e = await apolloEnrich('key', c.apolloId!, fake);
  assert.equal(e.email, 'asha@raoclinic.in');
  assert.equal(JSON.parse(String(calls.at(-1)!.init.body)).reveal_personal_emails, false, 'never asks for personal emails');
  await assert.rejects(apolloEnrich('key', 'not-an-id', fake), /did not come from Apollo/);
  const crm = await setContactEmail(s, ORG, c.id, e.email, 'f');
  assert.equal(crm.contacts[0].email, 'asha@raoclinic.in');
  assert.equal(crm.contacts[0].apolloId, 'a'.repeat(24), 'other fields are kept');
});

test('GTM: Proposal Writer and Win-Loss Analyst get grounded goals', async () => {
  const { proposalGoal, winLossGoal } = await import('../core/gtm.js');
  const d = { name: 'Dr Hajare', stage: 'won', meddic: null };
  assert.match(proposalGoal(d), /to be set by the owner/);
  assert.match(winLossGoal(d), /was won/);
  assert.match(winLossGoal({ ...d, stage: 'lost' }), /was lost/);
  assert.ok(getAgent('proposal-writer') && getAgent('win-loss'));
});

test('CRM: CSV import keeps quoted commas and the optional next step and notes columns', async () => {
  const { importContacts, loadCrm, splitCsvLine } = await import('../core/crm.js');
  assert.deepEqual(splitCsvLine('a,"b, c",,"say ""hi"""'), ['a', 'b, c', '', 'say "hi"']);
  const s = new MemoryStore();
  const csv = [
    'name,company,email,phone,source,value,nextStep,notes',
    'Old Style,Shop,,,referral,500',
    '"Barber, Kris",The Barber Law Firm,,(972) 231-5800,web-search,,Verify office hours,"Niche: injury law; why: hours end 5 PM, Fridays 3 PM"',
    ',No name,,,,',
  ].join('\n');
  assert.deepEqual(await importContacts(s, ORG, csv, 'f'), { added: 2, skipped: 1, duplicates: 0, updated: 0 });
  const byName = Object.fromEntries((await loadCrm(s, ORG)).contacts.map((c) => [c.name, c]));
  assert.equal(byName['Old Style'].value, 500, 'six-column rows still work');
  const k = byName['Barber, Kris'];
  assert.equal(k.company, 'The Barber Law Firm');
  assert.equal(k.phone, '(972) 231-5800');
  assert.equal(k.source, 'web-search');
  assert.equal(k.stage, 'lead');
  assert.equal(k.nextStep, 'Verify office hours');
  assert.match(k.notes, /Fridays 3 PM/);
});

test('CRM: the lead sheet imports with its own headers, keeps every column, and is not imported twice', async () => {
  const { importContacts, loadCrm } = await import('../core/crm.js');
  const { callPrepGoal } = await import('../core/gtm.js');
  const s = new MemoryStore();
  const csv = [
    'Rank,Business,Niche,City,Website,Main phone (public listing),Size,Decision maker,Deal size,Ease of win,Why they fit,Agent to pitch,Source,Check before outreach,Lead source',
    '2,Total Air & Plumbing,HVAC and plumbing,Plano and Dallas,https://totalair.com/,,"45 employees, 25 vehicles","Steve and Justin Lauten, owners",High,High,"Advertises 24/7, but Book Now is a form.",AI receptionist,totalair.com About page,,web-search',
    '1,The Barber Law Firm,Personal injury law,Plano,thebarberlawfirm.com,(972) 231-5800,About 20 staff,"Kristopher S. Barber, owner and founder",High,High,Hours end 5 PM.,24/7 AI intake,Justia profile,Office phones differ,web-search',
    '7,Snellings Law,Personal injury law,Dallas,,(945) 205-0002 Dallas,Not stated,"David Scott Snellings, founder",High,Medium,Three offices.,Unified intake,Cornell LII profile,,web-search',
    '4,Ellis Air Conditioning & Heating,HVAC,Dallas,ellisac.com,,Not stated,Not stated,Medium,High,Gap after hours.,After-hours answering,ellisac.com home page,Find owner name,web-search',
  ].join('\n');
  assert.deepEqual(await importContacts(s, ORG, csv, 'f'), { added: 4, skipped: 0, duplicates: 0, updated: 0 });
  const crm = await loadCrm(s, ORG);
  assert.deepEqual(crm.contacts.map((c) => c.rank), [1, 2, 4, 7], 'leads list in rank order');
  const t = crm.contacts.find((c) => c.company === 'Total Air & Plumbing')!;
  assert.equal(t.name, 'Steve and Justin Lauten');
  assert.equal(t.title, 'owners');
  assert.equal(t.size, '45 employees, 25 vehicles');
  assert.equal(t.website, 'totalair.com');
  assert.equal(t.dealTier, 'High');
  assert.equal(t.ease, 'High');
  assert.equal(t.niche, 'HVAC and plumbing');
  assert.equal(t.city, 'Plano and Dallas');
  assert.equal(t.pitch, 'AI receptionist');
  assert.equal(t.sourceDetail, 'totalair.com About page');
  assert.equal(t.source, 'web-search');
  assert.equal(t.stage, 'lead');
  assert.equal(crm.contacts.find((c) => c.company === 'Snellings Law')!.phone, '(945) 205-0002', 'trailing words after a phone are dropped');
  const e = crm.contacts.find((c) => c.company.startsWith('Ellis'))!;
  assert.equal(e.name, 'Ellis Air Conditioning & Heating', 'no named person: filed under the business');
  assert.equal(e.checkFirst, 'Find owner name');
  assert.equal(crm.newLeads, 0, 'no emails, so Speed-to-Lead drafts nothing');
  assert.match(callPrepGoal(t), /Why they fit \(our research\): Advertises 24\/7[\s\S]*What we plan to pitch: AI receptionist/);
  assert.deepEqual(await importContacts(s, ORG, csv, 'f'), { added: 0, skipped: 0, duplicates: 4, updated: 0 }, 'pasting the same list again adds nothing');
  assert.equal((await loadCrm(s, ORG)).contacts.length, 4);
});

test('CRM: an Excel workbook picked in the import box becomes CSV with every column', async () => {
  const { readFileSync } = await import('node:fs');
  const { xlsxToCsv } = await import('../src/lib/sheet.js');
  const { importContacts, loadCrm } = await import('../core/crm.js');
  const b = readFileSync(new URL('./fixtures/lead-sheet.xlsx', import.meta.url));
  const csv = await xlsxToCsv(b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength));
  assert.equal(csv.split('\n')[0], 'Rank,Business,Decision maker,Why they fit');
  const s = new MemoryStore();
  assert.deepEqual(await importContacts(s, ORG, csv, 'f'), { added: 2, skipped: 0, duplicates: 0, updated: 0 });
  const crm = await loadCrm(s, ORG);
  const a = crm.contacts.find((c) => c.company === 'Acme & Sons, LLC')!;
  assert.equal(a.name, 'Jo Smith');
  assert.equal(a.rank, 3);
  assert.equal(a.whyFit, 'Says "24/7" but closes at 5');
});

test('CRM: rows pasted straight from a spreadsheet (tab-separated) import with their headers', async () => {
  const { importContacts, loadCrm } = await import('../core/crm.js');
  const s = new MemoryStore();
  const pasted = ['Rank\tBusiness\tCity\tDecision maker', '2\tTotal Air & Plumbing\tPlano, TX\tSteve Lauten, owner', '5\tBright Smiles\tDallas\tNot stated', ''].join('\r\n');
  assert.deepEqual(await importContacts(s, ORG, pasted, 'f'), { added: 2, skipped: 0, duplicates: 0, updated: 0 });
  const t = (await loadCrm(s, ORG)).contacts.find((c) => c.company === 'Total Air & Plumbing')!;
  assert.equal(t.city, 'Plano, TX');
  assert.equal(t.name, 'Steve Lauten');
});

test('CRM: each customer keeps a history, notes, edits that keep research, and re-imports that only fill gaps', async () => {
  const { importContacts, loadCrm, addNote, upsertContact, setDealStage } = await import('../core/crm.js');
  const s = new MemoryStore();
  await importContacts(s, ORG, 'Rank,Business,Decision maker,Why they fit\n1,Barber Law,"Kris Barber, owner",Hours end 5 PM.', 'sunil');
  let c = (await loadCrm(s, ORG)).contacts[0];
  assert.deepEqual(c.history.map((h) => h.text), ['Imported from a list']);
  assert.equal(c.history[0].by, 'sunil');
  await addNote(s, ORG, c.id, 'research', 'Seven offices, intake team of three.', 'sunil');
  assert.equal((await loadCrm(s, ORG)).contacts[0].lastTouch, null, 'a research note is not a touch');
  await addNote(s, ORG, c.id, 'call', 'Left a voicemail with the office manager.', 'sunil');
  await setDealStage(s, ORG, c.id, 'contacted', 'sunil');
  await assert.rejects(addNote(s, ORG, c.id, 'note', '   ', 'sunil'), /Write something/);
  c = (await loadCrm(s, ORG)).contacts[0];
  assert.ok(c.lastTouch, 'a call counts as a touch');
  assert.deepEqual(c.history.map((h) => h.kind), ['stage', 'call', 'research', 'update'], 'newest first');
  await upsertContact(s, ORG, { id: c.id, name: c.name, company: c.company, painPoints: 'Calls after 5 PM go to voicemail', offer: '24/7 AI intake', angle: 'Missed after-hours calls' }, 'sunil');
  c = (await loadCrm(s, ORG)).contacts[0];
  assert.equal(c.whyFit, 'Hours end 5 PM.', 'editing keeps the research the form did not send');
  assert.equal(c.title, 'owner');
  assert.equal(c.painPoints, 'Calls after 5 PM go to voicemail');
  assert.equal(c.stage, 'contacted', 'editing keeps the stage');
  assert.equal(c.history[0].text, 'Details updated');
  const again = 'Business,Decision maker,Why they fit,City,Offer\nBarber Law,"Kris Barber, owner",Something else,Plano,Other offer';
  assert.deepEqual(await importContacts(s, ORG, again, 'sunil'), { added: 0, skipped: 0, duplicates: 0, updated: 1 });
  c = (await loadCrm(s, ORG)).contacts[0];
  assert.equal(c.city, 'Plano', 'a later sheet fills in what was missing');
  assert.equal(c.whyFit, 'Hours end 5 PM.', 'but never overwrites');
  assert.equal(c.offer, '24/7 AI intake');
  assert.deepEqual(await importContacts(s, ORG, again, 'sunil'), { added: 0, skipped: 0, duplicates: 1, updated: 0 });
});
