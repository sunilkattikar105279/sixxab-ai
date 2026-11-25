// Front Desk (24/7 attendant): settings are checked and saved as events, opening hours follow the business's own clock,
// the voice script carries the AI and recording notice, the right questions, emergencies and the healthcare rule, and the
// n8n workflow turns Retell calls and Chatwoot messages into CRM records without replying to anyone.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { MemoryStore } from '../core/store.js';
import { saveBusinessProfile } from '../core/profile.js';
import { getAgent } from '../core/agents.js';
import { checkInbound } from '../core/leads.js';
import { loadCrm } from '../core/crm.js';
import { receiveInbound } from '../server/routes/inbound.js';
import {
  cleanSettings, defaultSettings, defaultVertical, isOpenAt, loadFrontDesk, saveFrontDesk, textBackMessage, voiceScript, type FrontDeskSettings,
} from '../core/frontdesk.js';

const ORG = '3f2a9c1e-7b4d-4e8a-9c0f-1a2b3c4d5e6f';
const KEY = 'k'.repeat(40);
const US = defaultSettings({ name: 'Cool Air', industry: 'Home services', offer: 'HVAC repair', location: 'Dallas, TX' });

test('defaults follow the profile: kind of business, time zone and languages', () => {
  assert.equal(defaultVertical({ industry: 'Home services', offer: 'Roof repair and storm damage' }), 'roofing');
  assert.equal(defaultVertical({ industry: 'Professional services', offer: 'Personal injury attorney' }), 'law');
  assert.equal(defaultVertical({ industry: 'Healthcare: hospital or clinic' }), 'clinic');
  assert.equal(defaultVertical({ name: 'Smile Dental', industry: 'Healthcare: hospital or clinic' }), 'dental');
  assert.equal(US.vertical, 'hvac');
  assert.equal(US.timezone, 'America/Chicago');
  assert.deepEqual(US.languages, ['en']);
  const india = defaultSettings({ name: 'Radhakrishna Ortho', industry: 'Healthcare: hospital or clinic', location: 'Tasgaon, Sangli, India' });
  assert.equal(india.timezone, 'Asia/Kolkata');
  assert.deepEqual(india.languages, ['en', 'hi', 'mr']);
  assert.equal(india.on, false, 'off until the owner turns it on');
});

test('settings are checked: hours, numbers, links, languages and answers', () => {
  const ok = cleanSettings({ hours: { ...US.hours, sat: '24h', sun: 'closed' }, transferNumber: '+1 214 555 0100', bookingUrl: 'https://cal.com/coolair', languages: ['en', 'es', 'xx'] }, US);
  assert.equal(ok.hours.sat, '24h');
  assert.equal(ok.hours.sun, '');
  assert.deepEqual(ok.languages, ['en', 'es']);
  assert.throws(() => cleanSettings({ hours: { ...US.hours, mon: '9 to 5' } }, US), /Monday hours must look like/);
  assert.throws(() => cleanSettings({ hours: { ...US.hours, tue: '18:00-09:00' } }, US), /Tuesday closes before it opens/);
  assert.throws(() => cleanSettings({ transferNumber: 'call me' }, US), /transfer number/);
  assert.throws(() => cleanSettings({ bookingUrl: 'http://cal.com/x' }, US), /https/);
  assert.throws(() => cleanSettings({ languages: [] }, US), /at least one language/);
  assert.throws(() => cleanSettings({ timezone: 'Mars/Base' }, US), /time zone/);
  assert.throws(() => cleanSettings({ textBack: { on: true, template: 'Book at https://evil.example' } }, US), /booking field/);
  const many = Array.from({ length: 41 }, (_, i) => ({ q: `Q${i}`, a: 'A' }));
  assert.throws(() => cleanSettings({ answers: many }, US), /40 approved answers/);
  const tidy = cleanSettings({ answers: [{ q: '  Hours? ', a: ' 8 to 6 ' }, { q: 'empty', a: '' }] }, US);
  assert.deepEqual(tidy.answers, [{ q: 'Hours?', a: '8 to 6' }]);
});

test('open or closed follows the business clock, not the server clock', () => {
  const s = { ...US, hours: { ...US.hours, mon: '09:00-18:00', sat: '' } };
  // Monday 24 Nov 2026, 15:30 UTC = 09:30 in Dallas (CST, UTC-6): open. 14:30 UTC = 08:30: closed.
  assert.equal(isOpenAt(s, new Date('2026-11-23T15:30:00Z')), true);
  assert.equal(isOpenAt(s, new Date('2026-11-23T14:30:00Z')), false);
  // 23:59 Monday in Dallas is 05:59 Tuesday UTC: still Monday by the business clock, so closed after 18:00.
  assert.equal(isOpenAt(s, new Date('2026-11-24T05:59:00Z')), false);
  assert.equal(isOpenAt({ ...s, hours: { ...s.hours, sat: '24h' } }, new Date('2026-11-28T03:00:00Z')), false, 'Friday 9 PM in Dallas');
  assert.equal(isOpenAt({ ...s, hours: { ...s.hours, sat: '24h' } }, new Date('2026-11-28T08:00:00Z')), true, 'Saturday 2 AM in Dallas');
  assert.equal(isOpenAt({ ...s, timezone: 'Asia/Kolkata' }, new Date('2026-11-23T04:00:00Z')), true, '09:30 Monday in India');
});

test('the voice script discloses AI and recording, asks the right questions and hands off emergencies', () => {
  const s: FrontDeskSettings = { ...US, languages: ['en', 'es'], onCallNumber: '+1 214 555 0199', answers: [{ q: 'Do you charge for a visit?', a: '$89, waived if we do the repair.' }] };
  const script = voiceScript({ name: 'Cool Air', location: 'Dallas, TX' }, s);
  assert.match(script, /AI assistant and that the call is recorded/);
  assert.match(script, /Gracias por llamar a Cool Air/);
  assert.match(script, /gas smell/);
  assert.match(script, /on-call number \+1 214 555 0199 at any hour/);
  assert.match(script, /\$89, waived if we do the repair/);
  assert.match(script, /Never take card numbers/);
  assert.doesNotMatch(script, /Healthcare rule/);
  const roof = voiceScript({ name: 'Peak Roofing' }, { ...US, vertical: 'roofing' });
  assert.match(roof, /insurance company and whether a claim is already filed/);
  assert.match(roof, /photos of the damage on WhatsApp/);
  const law = voiceScript({ name: 'Barber Law' }, { ...US, vertical: 'law' });
  assert.match(law, /Never give legal advice/);
});

test('healthcare businesses get the no-medical-details rule in the script', () => {
  const india = defaultSettings({ name: 'Radhakrishna Ortho', industry: 'Healthcare: hospital or clinic', location: 'Tasgaon, India' });
  const script = voiceScript({ name: 'Radhakrishna Ortho', industry: 'Healthcare: hospital or clinic' }, india);
  assert.match(script, /Healthcare rule/);
  assert.match(script, /Never ask for, record or repeat symptoms/);
  assert.match(script, /नमस्कार, Radhakrishna Ortho/);
  assert.match(script, /नमस्ते, Radhakrishna Ortho/);
  assert.match(script, /no medical details/);
  // A dental practice picked by hand is treated as healthcare even if the profile says otherwise.
  assert.match(voiceScript({ name: 'Smile' }, { ...US, vertical: 'dental' }), /Healthcare rule/);
});

test('missed-call text uses the business name and booking link', () => {
  assert.equal(textBackMessage({ ...US, bookingUrl: 'https://cal.com/coolair' }, 'Cool Air'), 'Sorry we missed your call at Cool Air. Reply here and we will get back to you, or book a time here: https://cal.com/coolair.');
  assert.equal(textBackMessage(US, 'Cool Air'), 'Sorry we missed your call at Cool Air. Reply here and we will get back to you.');
});

test('saving keeps settings as events, newest wins, and the setup list tracks progress', async () => {
  const s = new MemoryStore();
  await saveBusinessProfile(s, ORG, { name: 'Cool Air', industry: 'Home services', offer: 'HVAC repair', location: 'Dallas, TX' }, 'owner');
  const before = await loadFrontDesk(s, ORG);
  assert.equal(before.saved, false);
  assert.equal(before.settings.vertical, 'hvac');
  assert.match(before.answersGoal, /Write up to 12 approved answers/);
  const answers = ['Hours?', 'Where?', 'Areas?', 'Visit fee?', 'Payment?'].map((q) => ({ q, a: 'See the team' }));
  const after = await saveFrontDesk(s, ORG, { on: true, answers, transferNumber: '+1 214 555 0100' }, 'owner');
  assert.equal(after.saved, true);
  assert.equal(after.settings.on, true);
  assert.equal(after.settings.answers.length, 5);
  assert.ok(after.checklist[0].done && after.checklist[1].done);
  assert.match(after.script, /transfer callers to \+1 214 555 0100/);
  assert.equal(after.orgId, ORG, 'the panel shows the business ID for the n8n workflow');
  await assert.rejects(saveFrontDesk(s, ORG, { transferNumber: 'nope' }, 'owner'), /transfer number/);
  const again = await saveFrontDesk(s, ORG, { on: false }, 'owner');
  assert.equal(again.settings.on, false);
  assert.equal(again.settings.answers.length, 5, 'fields not sent stay as they were');
  const events = await s.listAuditByActions(ORG, ['frontdesk.settings']);
  assert.equal(events.length, 2);
  assert.match(String(events[0].detail.summary), /turned on/);
});

test('the Front Desk agent drafts only through approvals and keeps the healthcare rule', () => {
  const a = getAgent('front-desk');
  assert.ok(a && a.usesModel);
  assert.equal(a!.reportsTo, 'coo');
  assert.ok(!a!.tools.includes('spend_money'));
  assert.match(a!.instructions, /owner to approve/);
  assert.match(a!.instructions, /never ask for, store or repeat symptoms/);
});

// ---- n8n workflow ----
interface N8nNode { name: string; type: string; parameters: Record<string, unknown>; onError?: string; credentials?: unknown }
const wf = JSON.parse(readFileSync(new URL('../integrations/n8n/sixxab-frontdesk.json', import.meta.url), 'utf8')) as { nodes: N8nNode[]; connections: Record<string, { main: { node: string }[][] }> };
const byName = new Map(wf.nodes.map((n) => [n.name, n]));
const code = (nodeName: string, swap: [string, string][] = [["const SIXXAB_ORG_ID = '';", `const SIXXAB_ORG_ID = '${ORG}';`]]) =>
  swap.reduce((js, [a, b]) => js.replace(a, b), String(byName.get(nodeName)!.parameters.jsCode));
const exec = (js: string, body: unknown) => (new Function('$input', js)({ all: () => [{ json: { body } }] }) as { json: Record<string, any> }[])[0].json;
const run = (nodeName: string, body: unknown) => exec(code(nodeName), body);

test('the workflow is wired: every path answers the webhook and nothing sends to customers', () => {
  assert.equal(byName.size, wf.nodes.length);
  const RESPOND = 'n8n-nodes-base.respondToWebhook';
  for (const hook of wf.nodes.filter((n) => n.type === 'n8n-nodes-base.webhook')) {
    assert.equal(hook.parameters.responseMode, 'responseNode');
    const walk = (name: string, seen: Set<string>): void => {
      assert.ok(!seen.has(name), `loop at ${name}`);
      const n = byName.get(name)!;
      if (n.type === RESPOND) return;
      const outs = wf.connections[name]?.main ?? [];
      assert.ok(outs.length > 0 && outs.every((o) => o.length > 0), `${name} has an output that goes nowhere`);
      if (n.onError === 'continueErrorOutput') assert.equal(outs.length, 2, `${name} must wire its error output`);
      for (const o of outs) for (const c of o) walk(c.node, new Set([...seen, name]));
    };
    walk(hook.name, new Set());
  }
  for (const n of wf.nodes) {
    assert.ok(!/twilio|gmail|whatsApp|slack|telegram|stripe|razorpay/i.test(n.type), `${n.name} could contact someone or move money`);
    assert.equal(n.credentials, undefined, `${n.name} carries credentials`);
  }
  for (const n of wf.nodes.filter((x) => x.type === 'n8n-nodes-base.httpRequest')) {
    assert.equal(n.parameters.genericAuthType, 'httpHeaderAuth');
    assert.equal(n.onError, 'continueErrorOutput');
  }
});

const RETELL = {
  event: 'call_analyzed',
  call: {
    call_id: 'call_123', agent_id: 'agent_1', direction: 'inbound', from_number: '+12145550111', to_number: '+12145550100',
    start_timestamp: 1795651200000, end_timestamp: 1795651380000, duration_ms: 180000, disconnection_reason: 'user_hangup',
    call_analysis: { call_summary: 'Wants AC repair tomorrow morning.', in_voicemail: false, custom_analysis_data: { intent: 'new_enquiry', outcome: 'callback', caller_name: 'Ana Ruiz', after_hours: true, language: 'es' } },
  },
};

test('a finished Retell call becomes one enquiry in the shape the CRM entry point takes', () => {
  const out = run('Map call', RETELL);
  assert.equal(out.skip, false);
  assert.equal(out.sixxabUrl, 'https://sixxab.ai/api/inbound');
  assert.deepEqual(out.payload, {
    orgId: ORG, channel: 'call', name: 'Ana Ruiz', phone: '+12145550111', email: '',
    message: 'Phone call, callback, new enquiry, after hours, in Spanish, 180 s.\nWants AC repair tomorrow morning.', when: '', ref: 'retell:call_123',
  });
  assert.equal(checkInbound(out.payload, false).ok, true, 'the entry point accepts it');
  assert.equal(run('Map call', { ...RETELL, event: 'call_ended' }).skip, true, 'only call_analyzed is logged');
  assert.equal(run('Map call', { ...RETELL, call: { ...RETELL.call, direction: 'outbound' } }).skip, true);
  assert.equal(run('Map call', { ...RETELL, call: { ...RETELL.call, from_number: 'anonymous' } }).skip, true, 'no number to call back');
  const spam = { ...RETELL, call: { ...RETELL.call, call_analysis: { custom_analysis_data: { intent: 'spam' } } } };
  assert.equal(run('Map call', spam).reason, 'Spam call');
  assert.match(exec(code('Map call', []), RETELL).reason, /SIXXAB_ORG_ID/, 'nothing is sent until the business ID is set');
  const booked = { ...RETELL, call: { ...RETELL.call, call_analysis: { custom_analysis_data: { outcome: 'booked', booking_start: '2026-11-26T09:00:00-06:00', best_time: 'Morning' } } } };
  assert.match(run('Map call', booked).payload.message, /Booked for 2026-11-26T09:00:00-06:00/);
  assert.equal(run('Map call', booked).payload.when, 'Morning');
});

test('calls without analysis fields still get a sensible outcome', () => {
  const msg = (extra: Record<string, unknown>) => run('Map call', { event: 'call_analyzed', call: { call_id: 'c', from_number: '+12145550111', duration_ms: 4000, call_analysis: {}, ...extra } }).payload.message as string;
  assert.match(msg({ disconnection_reason: 'dial_no_answer' }), /^Phone call, missed, 4 s\./);
  assert.match(msg({ disconnection_reason: 'user_hangup' }), /^Phone call, missed/, 'hung up within 10 seconds');
  assert.match(msg({ disconnection_reason: 'voicemail_reached' }), /^Phone call, voicemail/);
  assert.match(msg({ disconnection_reason: 'call_transfer', duration_ms: 60000 }), /^Phone call, transferred, 60 s/);
  assert.match(msg({ disconnection_reason: 'agent_hangup', duration_ms: 60000 }), /^Phone call, answered, 60 s\.$/);
});

test('healthcare mode sends no free text, only a good time to call', () => {
  const js = code('Map call', [["const SIXXAB_ORG_ID = '';", `const SIXXAB_ORG_ID = '${ORG}';`], ['const HEALTHCARE = false;', 'const HEALTHCARE = true;']]);
  const withTime = { ...RETELL, call: { ...RETELL.call, call_analysis: { ...RETELL.call.call_analysis, custom_analysis_data: { ...RETELL.call.call_analysis.custom_analysis_data, best_time: 'Evening' } } } };
  const out = exec(js, withTime);
  assert.equal(out.payload.message, '');
  assert.equal(out.payload.when, 'Evening');
  const checked = checkInbound(out.payload, true);
  assert.ok(checked.ok && checked.lead.message === 'Best time to call: Evening');
});

test('a customer message in Chatwoot becomes one enquiry per conversation per day; agent replies and notes are ignored', () => {
  const msg = {
    event: 'message_created', message_type: 'incoming', private: false, content: 'Hola, need a quote for a roof leak',
    created_at: '2026-11-25 14:05:57 UTC', sender: { id: 9, name: 'Luis', email: '' },
    conversation: { id: 42, channel: 'Channel::Whatsapp', inbox_id: 3, meta: { sender: { name: 'Luis', phone_number: '+14695550123' } } }, inbox: { id: 3, name: 'WhatsApp' },
  };
  const out = run('Map message', msg);
  assert.equal(out.skip, false);
  assert.deepEqual(out.payload, { orgId: ORG, channel: 'whatsapp', name: 'Luis', phone: '+14695550123', email: '', message: 'Hola, need a quote for a roof leak', ref: 'chatwoot:42:2026-11-25' });
  assert.equal(checkInbound(out.payload, false).ok, true, 'the entry point accepts it');
  assert.equal(run('Map message', { ...msg, message_type: 'outgoing' }).skip, true);
  assert.equal(run('Map message', { ...msg, message_type: 0, created_at: 1795651200 }).payload.ref, `chatwoot:42:${new Date(1795651200000).toISOString().slice(0, 10)}`);
  assert.equal(run('Map message', { ...msg, private: true }).skip, true);
  const email = { ...msg, sender: { name: 'Pat', email: 'Pat@Example.com' }, conversation: { ...msg.conversation, channel: 'Channel::Email', meta: { sender: {} } } };
  assert.deepEqual([run('Map message', email).payload.channel, run('Map message', email).payload.email], ['email', 'pat@example.com']);
  assert.equal(run('Map message', { ...msg, conversation: { ...msg.conversation, channel: 'Channel::WebWidget' } }).payload.channel, 'chat');
  const anon = { ...msg, sender: { name: 'Visitor' }, conversation: { ...msg.conversation, channel: 'Channel::WebWidget', meta: { sender: {} } } };
  assert.match(run('Map message', anon).reason, /No phone or email yet/);
  assert.match(run('Map message', { ...msg, conversation: { ...msg.conversation, channel: 'Channel::Telegram' } }).reason, /not logged here/);
});

test('the entry point records a Front Desk call once, even when Retell retries it', async () => {
  const s = new MemoryStore();
  await saveBusinessProfile(s, ORG, { name: 'Cool Air', industry: 'Home services' }, 'owner');
  const payload = run('Map call', RETELL).payload;
  const req = () => new Request('https://sixxab.ai/api/inbound', { method: 'POST', headers: { 'content-type': 'application/json', 'x-inbound-key': KEY }, body: JSON.stringify(payload) });
  const first = await (await receiveInbound(req(), s, async () => [ORG], KEY)).json();
  const again = await (await receiveInbound(req(), s, async () => [ORG], KEY)).json();
  assert.equal(first.duplicate, false);
  assert.equal(again.duplicate, true);
  const crm = await loadCrm(s, ORG);
  assert.equal(crm.contacts.length, 1);
  assert.equal(crm.contacts[0].source, 'phone');
  assert.match(crm.contacts[0].notes, /Wants AC repair/);
});
