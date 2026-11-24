// Research import: a research file (for example from Claude Duet) attaches reports and proposal drafts to deals
// already in the CRM. It never adds a contact, never changes a deal's own details, keeps a proposal the owner
// edited or sent, and importing the same file twice changes nothing.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { MemoryStore } from '../core/store.js';
import { DEFAULT_TASK_TYPES } from '../core/policy.js';
import { importContacts, loadCrm, setDealStage, upsertContact } from '../core/crm.js';
import { editProposal, markProposalSent, useResearchField } from '../core/research.js';
import { companyKey, importResearch, matchDeal, parseResearchFile, phoneKey, siteKey } from '../core/research-import.js';
import { nextActions, RESEARCH_IMPORT_EVERY_DAYS } from '../core/salesflow-state.js';

const ORG = '00000000-0000-0000-0000-000000000001';
const fresh = () => new MemoryStore({ orgId: ORG, taskTypes: DEFAULT_TASK_TYPES });
const crm = (store: MemoryStore) => loadCrm(store, ORG);
const byCompany = async (store: MemoryStore, company: string) => (await crm(store)).contacts.find((c) => c.company === company)!;

const research = (business: string, extra: Record<string, unknown> = {}) => ({
  summary: `${business} is a family business in Dallas serving homeowners across the metro since 1990.`,
  owner: 'Owners as the About page states them.',
  presence: 'Website with a contact form; no online booking; 4.8 stars from 300 reviews.',
  pains: [{ point: 'Book Now goes to a contact form', evidence: 'The Book Now button opens the contact form.', source: 'https://example.com/contact' }],
  found: [
    { field: 'email', value: 'office@example.com', source: 'https://example.com/contact', note: 'Printed in the footer' },
    { field: 'address', value: '100 Main St, Dallas, TX 75201', source: 'https://example.com/contact' },
    { field: 'phone', value: '(214) 555-0123', source: '' },
  ],
  opportunities: [{ title: 'After-hours AI receptionist', how: 'Answers and books emergency calls at night.', impact: 'Fewer lost jobs.' }],
  unknowns: 'Call volume.',
  sources: [{ title: 'Contact', url: 'https://example.com/contact' }],
  ...extra,
});
const proposal = (business: string) => ({
  title: `Proposal: AI agents for ${business}`,
  subject: `Answering every call at ${business}`,
  summary: 'Busy shop, phone-only intake.',
  opportunities: [{ title: 'Answer every call', what: 'AI receptionist day and night.', benefit: 'More booked jobs.' }],
  benefits: [{ label: 'After-hours calls booked', monthly: 7800, basis: 'Estimate: 6 calls a week x 4.3 x 30% x $1,000' }],
  costs: [{ label: 'SIXXAB AI agents, small business plan', monthly: 5000, oneTime: 0, basis: 'Small business plan, 12-month term' }],
  currency: 'USD',
  plan: 'Week 1 setup, week 2 test, week 3 live.',
  nextStep: 'A 20-minute call.',
  text: `Hi team, I looked at how ${business} takes calls and bookings today and found a few gaps an AI receptionist would close. This is a draft for your review.`,
});
const file = (reports: unknown[]) => JSON.stringify({ format: 'sixxab-research/1', generatedBy: 'Claude Duet', reports });

async function seed(store: MemoryStore) {
  const csv = [
    'Rank,Business,Niche,City,Website,Main phone (public listing),Decision maker',
    '1,The Barber Law Firm,Personal injury law,Plano,thebarberlawfirm.com,(972) 231-5800,"Kristopher S. Barber, owner and founder"',
    '2,Total Air & Plumbing,HVAC and plumbing,Plano,totalair.com,,"Steve and Justin Lauten, owners"',
    '3,Starwood Med Spa,Med spa,Frisco,,,"Sameer and Taz Jaffers, owners"',
    '4,Ellis Air Conditioning & Heating,HVAC,Dallas,ellisac.com,,Not stated',
  ].join('\n');
  await importContacts(store, ORG, csv, 'owner');
}

test('keys: website, business name and phone normalise the way a lead list writes them', () => {
  assert.equal(siteKey('https://www.TotalAir.com/about-us'), 'totalair.com');
  assert.equal(siteKey('totalair.com'), 'totalair.com');
  assert.equal(siteKey(''), '');
  assert.equal(companyKey('The Barber Law Firm, PLLC'), companyKey('barber law firm'));
  assert.equal(companyKey('Total Air & Plumbing, Inc.'), companyKey('Total Air and Plumbing'));
  assert.notEqual(companyKey('Total Air & Plumbing'), companyKey('Total Air'));
  assert.equal(phoneKey('+1 (972) 231-5800'), '9722315800');
  assert.equal(phoneKey('555-0100'), '');
});

test('parse: accepts { reports } or a bare list and explains a bad file', () => {
  assert.equal(parseResearchFile(file([{ company: 'A' }])).length, 1);
  assert.equal(parseResearchFile(JSON.stringify([{ company: 'A' }, { company: 'B' }])).length, 2);
  assert.throws(() => parseResearchFile('not json'), /not valid JSON/);
  assert.throws(() => parseResearchFile(JSON.stringify({ reports: [] })), /no reports/);
  assert.throws(() => parseResearchFile(JSON.stringify({ hello: 1 })), /No reports/);
});

test('import: attaches research and proposals to the matching deals and never adds a contact', async () => {
  const store = fresh();
  await seed(store);
  const before = await crm(store);
  const r = await importResearch(store, ORG, file([
    { company: 'Total Air & Plumbing, Inc.', website: 'https://www.totalair.com/', research: research('Total Air'), proposal: proposal('Total Air') },
    { company: 'Starwood Med Spa', website: 'https://starwoodmedspa.example', research: research('Starwood') },
    { company: 'Nobody Plumbing', website: 'https://nobody.example', research: research('Nobody') },
  ]), 'owner');
  assert.equal(r.reports, 3);
  assert.equal(r.matched, 2);
  assert.equal(r.researchSaved, 2);
  assert.equal(r.proposalsSaved, 1);
  const after = await crm(store);
  assert.equal(after.contacts.length, before.contacts.length, 'no contact is added');
  const miss = r.results.find((x) => x.company === 'Nobody Plumbing')!;
  assert.equal(miss.contactId, null);
  assert.match(miss.reason, /Import the lead list first/);
  assert.equal(r.results[0].matchedBy, 'website');
  assert.equal(r.results[1].matchedBy, 'name');

  const ta = await byCompany(store, 'Total Air & Plumbing');
  assert.ok(ta.researchReport);
  assert.equal(ta.researchReport!.pains.length, 1);
  assert.equal(ta.researchReport!.found.length, 2, 'a detail without a source page is dropped');
  assert.ok(ta.researchReport!.found.every((f) => f.usedAt === null));
  assert.equal(ta.email, '', 'a found detail is not put on the deal by the import');
  assert.equal(ta.address, '');
  assert.equal(ta.proposal!.roi.monthlyBenefit, 7800, 'the app works out the ROI');
  assert.equal(ta.proposal!.roi.netMonthly, 2800);
  assert.equal(ta.proposal!.sentAt, null);
  assert.match(ta.history[0].text + ta.history[1].text, /imported/);

  // The owner adds a found detail only by pressing Add to deal.
  await useResearchField(store, ORG, ta.id, 0, 'owner');
  assert.equal((await byCompany(store, 'Total Air & Plumbing')).email, 'office@example.com');
});

test('import: the same file twice changes nothing', async () => {
  const store = fresh();
  await seed(store);
  const json = file([{ company: 'The Barber Law Firm', website: 'thebarberlawfirm.com', research: research('Barber'), proposal: proposal('Barber') }]);
  await importResearch(store, ORG, json, 'owner');
  const events = (await store.listAuditByActions(ORG, ['crm.research', 'crm.proposal'])).length;
  const again = await importResearch(store, ORG, json, 'owner');
  assert.equal(again.researchSaved, 0);
  assert.equal(again.proposalsSaved, 0);
  assert.equal(again.unchanged, 1);
  assert.equal(again.results[0].research, 'same');
  assert.equal(again.results[0].proposal, 'same');
  assert.equal((await store.listAuditByActions(ORG, ['crm.research', 'crm.proposal'])).length, events, 'no new events');
  assert.equal((await crm(store)).contacts.length, 4);
});

test('import: a found detail already added stays added on a re-import, and newer research replaces older', async () => {
  const store = fresh();
  await seed(store);
  const json = file([{ company: 'Ellis Air Conditioning & Heating', website: 'ellisac.com', research: research('Ellis') }]);
  await importResearch(store, ORG, json, 'owner');
  const ellis = await byCompany(store, 'Ellis Air Conditioning & Heating');
  await useResearchField(store, ORG, ellis.id, 1, 'owner');
  await importResearch(store, ORG, json, 'owner');
  const kept = await byCompany(store, 'Ellis Air Conditioning & Heating');
  assert.ok(kept.researchReport!.found[1].usedAt, 'the same file again keeps the Added mark');
  assert.equal(kept.address, '100 Main St, Dallas, TX 75201');

  const newer = file([{ company: 'Ellis Air Conditioning & Heating', website: 'ellisac.com', research: research('Ellis', { unknowns: 'Owner name.' }) }]);
  const r = await importResearch(store, ORG, newer, 'owner');
  assert.equal(r.researchSaved, 1);
  const now = await byCompany(store, 'Ellis Air Conditioning & Heating');
  assert.equal(now.researchReport!.unknowns, 'Owner name.');
  assert.equal(now.address, '100 Main St, Dallas, TX 75201', 'the deal keeps what the owner added');
});

test('import: keeps a proposal the owner edited or sent, and adds none to a lost deal', async () => {
  const store = fresh();
  await seed(store);
  const first = file([
    { company: 'The Barber Law Firm', research: research('Barber'), proposal: proposal('Barber') },
    { company: 'Total Air & Plumbing', research: research('Total Air'), proposal: proposal('Total Air') },
  ]);
  await importResearch(store, ORG, first, 'owner');
  const barber = await byCompany(store, 'The Barber Law Firm');
  const total = await byCompany(store, 'Total Air & Plumbing');
  await editProposal(store, ORG, barber.id, { subject: 'My own subject' }, 'owner');
  await markProposalSent(store, ORG, total.id, 'owner');
  const ellis = await byCompany(store, 'Ellis Air Conditioning & Heating');
  await setDealStage(store, ORG, ellis.id, 'lost', 'owner');

  const p2 = { ...proposal('Barber'), text: `${proposal('Barber').text} A second version with more detail for the owner to review.` };
  const r = await importResearch(store, ORG, file([
    { company: 'The Barber Law Firm', research: research('Barber'), proposal: p2 },
    { company: 'Total Air & Plumbing', research: research('Total Air'), proposal: { ...proposal('Total Air'), subject: 'New subject' } },
    { company: 'Ellis Air Conditioning & Heating', research: research('Ellis'), proposal: proposal('Ellis') },
  ]), 'owner');
  const out = Object.fromEntries(r.results.map((x) => [x.company, x]));
  assert.equal(out['The Barber Law Firm'].proposal, 'kept_edited');
  assert.equal(out['Total Air & Plumbing'].proposal, 'kept_sent');
  assert.equal(out['Ellis Air Conditioning & Heating'].proposal, 'lost');
  assert.equal(out['Ellis Air Conditioning & Heating'].research, 'saved');
  assert.equal((await byCompany(store, 'The Barber Law Firm')).proposal!.subject, 'My own subject');
  assert.ok((await byCompany(store, 'Total Air & Plumbing')).proposal!.sentAt);
});

test('import: two deals with the same business are not guessed between, and a bad report is reported', async () => {
  const store = fresh();
  await upsertContact(store, ORG, { name: 'Pat Lee', company: 'Acme Roofing', website: 'acmeroof.example' }, 'owner');
  await upsertContact(store, ORG, { name: 'Sam Roe', company: 'Acme Roofing', website: 'acmeroof.example' }, 'owner');
  await upsertContact(store, ORG, { name: 'Kim Park', company: 'Bright Dental', phone: '(214) 555-0188' }, 'owner');
  const contacts = (await crm(store)).contacts;
  assert.equal(matchDeal(contacts, { company: 'Acme Roofing', website: 'https://acmeroof.example' }).deal, null);
  assert.equal(matchDeal(contacts, { company: 'Bright Dental Studio', phone: '214.555.0188' }).by, 'phone');

  const r = await importResearch(store, ORG, file([
    { company: 'Acme Roofing', website: 'acmeroof.example', research: research('Acme') },
    { company: 'Bright Dental', research: { summary: 'Too short' } },
  ]), 'owner');
  assert.equal(r.results[0].contactId, null);
  assert.match(r.results[0].reason, /2 deals match/);
  assert.equal(r.results[1].research, 'error');
  assert.match(r.results[1].reason, /summary/);
  assert.equal((await crm(store)).contacts.length, 3);
});

test('queue: offers Import research while leads wait for research, and steps back for a week after an import', async () => {
  const store = fresh();
  await seed(store);
  const offer = (await crm(store)).nextActions.find((a) => a.rule === 'research_import');
  assert.ok(offer, 'four leads wait for research, so the Sales flow offers the import');
  assert.equal(offer!.kind, 'open');
  assert.equal(offer!.stage, 'research');
  assert.equal(offer!.count, 4);
  assert.equal(offer!.contactId, undefined, 'one action for the whole CRM, not one per deal');

  await importResearch(store, ORG, file([{ company: 'The Barber Law Firm', website: 'thebarberlawfirm.com', research: research('Barber') }]), 'owner');
  const after = await crm(store);
  assert.ok(!after.nextActions.some((a) => a.rule === 'research_import'), 'a file was just imported, so it is not offered again this week');
  const later = nextActions(after, Date.now() + (RESEARCH_IMPORT_EVERY_DAYS + 1) * 864e5).find((a) => a.rule === 'research_import');
  assert.equal(later?.count, 3, 'a week later it is offered again for the three leads still waiting');

  const empty = fresh();
  assert.ok(!(await crm(empty)).nextActions.some((a) => a.rule === 'research_import'), 'no leads, nothing to research');
});
