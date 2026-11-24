// Mapping a research report onto a customer during the import: the preview shows each report beside its customer
// with the details it can fill, the owner can pick another customer or skip a report, and only ticked details are
// copied onto the customer. A detail that would replace one already there is never ticked to start with.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { MemoryStore } from '../core/store.js';
import { DEFAULT_TASK_TYPES } from '../core/policy.js';
import { importContacts, loadCrm } from '../core/crm.js';
import { importResearch } from '../core/research-import.js';
import { defaultPicks, mapRows } from '../core/research-map.js';
import { cleanResearch } from '../core/research-state.js';

const ORG = '00000000-0000-0000-0000-000000000001';
const fresh = () => new MemoryStore({ orgId: ORG, taskTypes: DEFAULT_TASK_TYPES });
const byCompany = async (store: MemoryStore, company: string) => (await loadCrm(store, ORG)).contacts.find((c) => c.company === company)!;
const file = (reports: unknown[]) => JSON.stringify({ reports });
const research = (business: string, found: unknown[]) => ({
  summary: `${business} is a family business in Dallas serving homeowners across the metro since 1990.`,
  pains: [{ point: 'Book Now goes to a contact form', evidence: 'The button opens a form.', source: 'https://example.com/contact' }],
  found,
  opportunities: [{ title: 'After-hours AI receptionist', how: 'Answers and books calls at night.', impact: 'Fewer lost jobs.' }],
  sources: [{ title: 'Contact', url: 'https://example.com/contact' }],
});
const SRC = 'https://example.com/contact';

async function seed(store: MemoryStore) {
  await importContacts(store, ORG, [
    'Rank,Business,Niche,City,Website,Main phone (public listing),Decision maker',
    '1,The Barber Law Firm,Personal injury law,Plano,thebarberlawfirm.com,(972) 231-5800,"Kristopher S. Barber, owner"',
    '2,Total Air & Plumbing,HVAC and plumbing,Plano,totalair.com,,',
    '3,Starwood Med Spa,Med spa,Frisco,,,',
  ].join('\n'), 'owner');
}

test('preview: empty fields are ticked, matching ones are left out, and a different value waits for a tick', async () => {
  const store = fresh();
  await seed(store);
  const barber = await byCompany(store, 'The Barber Law Firm');
  const r = cleanResearch(research('Barber', [
    { field: 'email', value: 'intake@example.com', source: SRC },
    { field: 'phone', value: '972-231-5800', source: SRC },
    { field: 'phone', value: '(972) 555-0199', source: SRC },
    { field: 'address', value: '100 Main St, Plano, TX 75074', source: SRC },
  ]));
  const rows = mapRows(r, barber);
  const by = (key: string) => rows.find((x) => x.key === key);
  assert.equal(by('found:0')?.status, 'empty');
  assert.equal(by('found:1')?.status, 'same', 'the same phone written another way matches');
  assert.equal(by('found:2')?.status, 'different');
  assert.equal(by('found:2')?.current, '(972) 231-5800');
  assert.equal(by('profile:painPoints')?.value, 'Book Now goes to a contact form');
  assert.equal(by('profile:offer')?.value, 'After-hours AI receptionist');
  assert.deepEqual(defaultPicks(rows), ['found:0', 'found:3', 'profile:painPoints', 'profile:offer', 'profile:research']);
  const bad = { summary: '', pains: [], opportunities: [], found: [{ field: 'email', value: 'not an email', source: SRC, note: '', usedAt: null }] } as unknown as Parameters<typeof mapRows>[0];
  assert.deepEqual(mapRows(bad, barber), [], 'an email the CRM would refuse is left out');

  // A lead list without a named person stores the business as the contact name; the owner's name may fill it.
  const total = await byCompany(store, 'Total Air & Plumbing');
  const owner = mapRows(cleanResearch(research('Total Air', [{ field: 'owner', value: 'Steve Lauten', source: SRC }])), total).find((x) => x.target === 'name');
  assert.equal(owner?.status, 'empty');
});

test('import: copies only the ticked details onto the customer and marks them used', async () => {
  const store = fresh();
  await seed(store);
  const before = (await loadCrm(store, ORG)).contacts.length;
  const json = file([{ company: 'Total Air & Plumbing', website: 'totalair.com', research: research('Total Air', [
    { field: 'email', value: 'office@totalair.example', source: SRC },
    { field: 'address', value: '200 Elm St, Plano, TX 75074', source: SRC },
  ]) }]);
  const r = await importResearch(store, ORG, json, 'owner', { fill: { 0: ['found:0', 'profile:painPoints'] } });
  assert.equal(r.detailsFilled, 2);
  assert.deepEqual(r.results[0].filled, ['Email', 'Pain points']);
  const ta = await byCompany(store, 'Total Air & Plumbing');
  assert.equal(ta.email, 'office@totalair.example');
  assert.equal(ta.painPoints, 'Book Now goes to a contact form');
  assert.equal(ta.address, '', 'an unticked detail is not copied');
  assert.ok(ta.researchReport!.found[0].usedAt, 'the copied detail shows as added');
  assert.equal(ta.researchReport!.found[1].usedAt, null);
  assert.equal(ta.website, 'totalair.com', 'the rest of the customer is kept');
  assert.equal(ta.city, 'Plano');
  assert.equal((await loadCrm(store, ORG)).contacts.length, before, 'no contact is added');
  assert.ok(ta.history.some((h) => h.text === 'Email, pain points filled from the research'));

  // The same file and ticks again: nothing changes.
  const events = (await store.listAuditByActions(ORG, ['crm.contact', 'crm.research', 'crm.research_used'])).length;
  const again = await importResearch(store, ORG, json, 'owner', { fill: { 0: ['found:0', 'profile:painPoints'] } });
  assert.equal(again.detailsFilled, 0);
  assert.equal(again.unchanged, 1);
  assert.equal((await store.listAuditByActions(ORG, ['crm.contact', 'crm.research', 'crm.research_used'])).length, events);

  // Ticking the address later, with the same file, copies just that.
  const later = await importResearch(store, ORG, json, 'owner', { fill: { 0: ['found:1'] } });
  assert.deepEqual(later.results[0].filled, ['Address']);
  assert.equal((await byCompany(store, 'Total Air & Plumbing')).address, '200 Elm St, Plano, TX 75074');
});

test('import: a value that differs is replaced only when ticked', async () => {
  const store = fresh();
  await seed(store);
  const json = file([{ company: 'The Barber Law Firm', research: research('Barber', [{ field: 'phone', value: '(972) 555-0199', source: SRC }]) }]);
  const barber = await byCompany(store, 'The Barber Law Firm');
  const rows = mapRows(cleanResearch(research('Barber', [{ field: 'phone', value: '(972) 555-0199', source: SRC }])), barber);
  await importResearch(store, ORG, json, 'owner', { fill: { 0: defaultPicks(rows) } });
  assert.equal((await byCompany(store, 'The Barber Law Firm')).phone, '(972) 231-5800', 'the default ticks never replace a value');
  await importResearch(store, ORG, json, 'owner', { fill: { 0: ['found:0'] } });
  assert.equal((await byCompany(store, 'The Barber Law Firm')).phone, '(972) 555-0199');
});

test('import: the owner picks the customer for a report, or skips it', async () => {
  const store = fresh();
  await seed(store);
  const spa = await byCompany(store, 'Starwood Med Spa');
  const barber = await byCompany(store, 'The Barber Law Firm');
  const r = await importResearch(store, ORG, file([
    { company: 'Starwood Aesthetics', research: research('Starwood', [{ field: 'email', value: 'hello@starwood.example', source: SRC }]) },
    { company: 'The Barber Law Firm', research: research('Barber', []) },
    { company: 'Somebody Else', research: research('Somebody', []) },
  ]), 'owner', { deals: { 0: spa.id, 1: '', 2: 'no-such-customer' }, fill: { 0: ['found:0'] } });
  assert.equal(r.results[0].contactId, spa.id);
  assert.equal(r.results[0].matchedBy, 'chosen');
  assert.equal(r.results[0].research, 'saved');
  assert.equal((await byCompany(store, 'Starwood Med Spa')).email, 'hello@starwood.example');
  assert.equal(r.results[1].research, 'skipped');
  assert.equal(r.skipped, 1);
  assert.equal((await byCompany(store, 'The Barber Law Firm')).researchReport ?? null, null, 'a skipped report is not attached');
  assert.equal(barber.researchReport ?? null, null);
  assert.equal(r.results[2].contactId, null);
  assert.match(r.results[2].reason, /no longer in the CRM/);
  assert.equal(r.matched, 1);
});

test('import: a report matched automatically keeps how it was matched when the owner leaves the pick alone', async () => {
  const store = fresh();
  await seed(store);
  const ta = await byCompany(store, 'Total Air & Plumbing');
  const r = await importResearch(store, ORG, file([{ company: 'Total Air', website: 'https://www.totalair.com', research: research('Total Air', []) }]), 'owner', { deals: { 0: ta.id } });
  assert.equal(r.results[0].matchedBy, 'website');
});
