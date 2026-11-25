// Generates integrations/n8n/sixxab-frontdesk.json, the n8n workflow that carries the Front Desk's finished calls and
// messages into the sixxab.ai CRM. Run: node scripts/build-n8n-frontdesk.mjs   (tests/frontdesk.test.ts checks it)
//
// Calls:    Retell webhook (call_analyzed) → Map call (Code) → Log it? → POST /api/inbound (the CRM entry point) → 204
// Messages: Chatwoot webhook (message_created, from the customer) → Map message (Code) → Log it? → POST → { ok }
// Nothing here replies to the customer, texts anyone or spends: it only records what happened. Replies wait in Approvals.
import { createHash } from 'node:crypto';
import { mkdirSync, writeFileSync } from 'node:fs';

const OUT = new URL('../integrations/n8n/sixxab-frontdesk.json', import.meta.url);

const uuid = (seed) => {
  const h = createHash('sha256').update(`sixxab-frontdesk:${seed}`).digest('hex');
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-4${h.slice(13, 16)}-a${h.slice(17, 20)}-${h.slice(20, 32)}`;
};
const node = (name, type, typeVersion, position, parameters, extra = {}) => ({ id: uuid(name), name, type, typeVersion, position, parameters, ...extra });

// Shared settings at the top of both Code nodes. The body follows the CRM entry point, POST /api/inbound:
// { orgId, channel: call|whatsapp|email|chat, name, email, phone, message, when, ref }, key in the x-inbound-key header.
const SETTINGS = `const SIXXAB_INBOUND_URL = 'https://sixxab.ai/api/inbound'; // the CRM entry point (the key goes in the "Send to SIXXAB" credential)
const SIXXAB_ORG_ID = ''; // the business ID shown in the Front Desk panel's setup steps on sixxab.ai
const HEALTHCARE = false;  // true for clinics, dental and med spas: no free text at all, only a good time to call
const INTENTS = ['new_enquiry', 'booking', 'existing_customer', 'support', 'emergency', 'spam', 'other'];
const OUTCOMES = ['booked', 'callback', 'transferred', 'answered', 'voicemail', 'missed'];
const LANGS = { en: 'English', es: 'Spanish', hi: 'Hindi', mr: 'Marathi' };
const CALL_TIMES = ['Morning', 'Afternoon', 'Evening', 'Any time'];
const pick = (v, list, fallback) => (list.includes(String(v)) ? String(v) : fallback);
const clip = (v, n) => String(v == null ? '' : v).replace(/\\s+/g, ' ').trim().slice(0, n);
const words = (v) => String(v).replace(/_/g, ' ');
const reachable = (phone) => phone.replace(/\\D/g, '').length >= 7;
const skip = (reason) => ({ json: { skip: true, reason } });
const send = (payload) => (SIXXAB_ORG_ID ? { json: { skip: false, sixxabUrl: SIXXAB_INBOUND_URL, payload: Object.assign({ orgId: SIXXAB_ORG_ID }, payload) } } : skip('Set SIXXAB_ORG_ID in this Code node first'));`;

// ---- Calls: one enquiry per finished call, from Retell's call_analyzed event ----
const CALL_JS = `// Retell → SIXXAB CRM. Edit the settings, then save the workflow.
${SETTINGS}
const RETELL_AGENT_IDS = []; // your Retell agent ids, e.g. ['agent_abc123']; calls to other agents are ignored. Empty = all.
// Calls that never connected (Retell's disconnection reasons):
const NOT_CONNECTED = ['dial_no_answer', 'dial_busy', 'dial_failed', 'invalid_destination', 'sip_routing_error'];

return $input.all().map((item) => {
  const body = item.json.body || {};
  const call = body.call || {};
  if (body.event !== 'call_analyzed') return skip('Only finished, analyzed calls are logged');
  if (!call.call_id) return skip('No call id');
  if (call.direction && call.direction !== 'inbound') return skip('Outbound calls are not logged here');
  if (RETELL_AGENT_IDS.length && !RETELL_AGENT_IDS.includes(call.agent_id)) return skip('Call to an agent not listed in RETELL_AGENT_IDS');
  const a = call.call_analysis || {};
  const c = a.custom_analysis_data || {};
  const intent = pick(c.intent, INTENTS, 'other');
  if (intent === 'spam') return skip('Spam call');
  const phone = clip(c.callback_number || call.from_number, 20);
  if (!reachable(phone)) return skip('No number to call back (withheld caller ID)');
  const reason = String(call.disconnection_reason || '');
  const durationSec = Math.round(Number(call.duration_ms || 0) / 1000);
  let outcome = pick(c.outcome, OUTCOMES, '');
  if (!outcome) {
    if (a.in_voicemail === true || reason === 'voicemail_reached') outcome = 'voicemail';
    else if (NOT_CONNECTED.includes(reason) || (reason === 'user_hangup' && durationSec < 10)) outcome = 'missed';
    else if (reason === 'call_transfer' || reason === 'transfer_bridged') outcome = 'transferred';
    else outcome = 'answered';
  }
  const afterHours = c.after_hours === true || c.after_hours === 'true';
  const lang = LANGS[c.language] && c.language !== 'en' ? LANGS[c.language] : '';
  const facts = [
    'Phone call, ' + words(outcome) + (intent !== 'other' ? ', ' + words(intent) : '') + (afterHours ? ', after hours' : '') + (lang ? ', in ' + lang : '') + (durationSec ? ', ' + durationSec + ' s' : '') + '.',
    c.booking_start ? 'Booked for ' + clip(c.booking_start, 40) + '.' : '',
    clip(a.call_summary, 700),
  ].filter(Boolean).join('\\n');
  return send({
    channel: 'call',
    name: clip(c.caller_name, 120),
    phone,
    email: clip(c.caller_email, 200),
    message: HEALTHCARE ? '' : facts.slice(0, 900),
    when: pick(c.best_time, CALL_TIMES, ''),
    ref: 'retell:' + clip(call.call_id, 100),
  });
});`;

// ---- Messages: one enquiry per conversation per day, from Chatwoot's message_created event ----
const MESSAGE_JS = `// Chatwoot → SIXXAB CRM (WhatsApp, email, website chat). Edit the settings, then save the workflow.
${SETTINGS}
const INBOX_IDS = []; // Chatwoot inbox ids to log, e.g. [1, 2]; empty = every inbox
const CHANNELS = { 'Channel::Whatsapp': 'whatsapp', 'Channel::Email': 'email', 'Channel::WebWidget': 'chat', 'Channel::Api': 'chat' };

return $input.all().map((item) => {
  const b = item.json.body || {};
  if (b.event !== 'message_created') return skip('Not a new message');
  if (!(b.message_type === 'incoming' || b.message_type === 0)) return skip('Not from the customer');
  if (b.private === true) return skip('Private note');
  const conv = b.conversation || {};
  const inbox = b.inbox || {};
  const inboxId = Number(inbox.id != null ? inbox.id : conv.inbox_id);
  if (INBOX_IDS.length && !INBOX_IDS.includes(inboxId)) return skip('Inbox not listed in INBOX_IDS');
  const channel = CHANNELS[String(conv.channel || '')];
  if (!channel) return skip('Channel not logged here: ' + clip(conv.channel, 40));
  const sender = Object.assign({}, (conv.meta && conv.meta.sender) || {}, b.sender || {});
  const phone = clip(sender.phone_number, 20);
  const email = clip(sender.email, 200).toLowerCase();
  if (!reachable(phone) && !email) return skip('No phone or email yet; logged once they share one');
  const raw = b.created_at;
  const parsed = typeof raw === 'number' ? new Date(raw * 1000) : new Date(String(raw || '').replace(' UTC', 'Z').replace(' ', 'T'));
  const day = (isNaN(parsed.getTime()) ? new Date() : parsed).toISOString().slice(0, 10);
  return send({
    channel,
    name: clip(sender.name, 120),
    phone: reachable(phone) ? phone : '',
    email,
    message: HEALTHCARE ? '' : clip(b.content, 900),
    ref: 'chatwoot:' + clip(conv.id != null ? conv.id : conv.display_id, 40) + ':' + day,
  });
});`;

const isSkip = (key) => ({
  conditions: {
    options: { caseSensitive: true, leftValue: '', typeValidation: 'loose', version: 2 },
    conditions: [{ id: uuid(`skip-${key}`), leftValue: '={{ $json.skip }}', rightValue: true, operator: { type: 'boolean', operation: 'true', singleValue: true } }],
    combinator: 'and',
  },
  options: {},
});

const post = (name, position) => node(name, 'n8n-nodes-base.httpRequest', 4.2, position, {
  method: 'POST',
  url: '={{ $json.sixxabUrl }}',
  authentication: 'genericCredentialType',
  genericAuthType: 'httpHeaderAuth',
  sendBody: true,
  contentType: 'json',
  specifyBody: 'json',
  jsonBody: '={{ JSON.stringify($json.payload) }}',
  options: { timeout: 8000 },
}, { onError: 'continueErrorOutput' });

const respond = (name, position, parameters) => node(name, 'n8n-nodes-base.respondToWebhook', 1.1, position, parameters);
const noBody = (name, position) => respond(name, position, { respondWith: 'noData', options: { responseCode: 204 } });
const jsonReply = (name, position, body) => respond(name, position, { respondWith: 'json', responseBody: `={{ ${body} }}`, options: {} });

const nodes = [
  node('Setup notes', 'n8n-nodes-base.stickyNote', 1, [-480, -320], {
    width: 460, height: 460,
    content: [
      '## SIXXAB Front Desk: calls and messages into the CRM',
      'Logs each finished call (Retell) and each new customer message (Chatwoot: WhatsApp, email, website chat). It never replies or texts.',
      '',
      '1. Change both webhook paths to include a long random part, so nobody can guess them.',
      '2. **Retell** → agent settings → webhook URL = the **Calls webhook** production URL; events: call_analyzed. Optional: allow only Retell\'s address 100.20.5.228.',
      '3. **Chatwoot** → Settings → Integrations → Webhooks → the **Messages webhook** production URL; event: message created.',
      '4. In both Code nodes set SIXXAB_ORG_ID (the business ID in the Front Desk panel\'s setup steps), and RETELL_AGENT_IDS / INBOX_IDS. Set HEALTHCARE = true for clinics.',
      '5. **Send to SIXXAB** nodes → Credential: Header Auth, name `x-inbound-key`, value = the INBOUND_KEY set in Vercel for sixxab.ai.',
      '6. Activate.',
    ].join('\n'),
  }),
  node('Calls webhook', 'n8n-nodes-base.webhook', 2, [0, -160], { httpMethod: 'POST', path: 'sixxab-frontdesk-calls', responseMode: 'responseNode', options: {} }, { webhookId: uuid('calls-webhook') }),
  node('Map call', 'n8n-nodes-base.code', 2, [220, -160], { mode: 'runOnceForAllItems', jsCode: CALL_JS }),
  node('Log call?', 'n8n-nodes-base.if', 2.2, [440, -160], isSkip('call')),
  post('Send call to SIXXAB', [660, -80]),
  noBody('Calls: done', [900, -160]),

  node('Messages webhook', 'n8n-nodes-base.webhook', 2, [0, 200], { httpMethod: 'POST', path: 'sixxab-frontdesk-messages', responseMode: 'responseNode', options: {} }, { webhookId: uuid('messages-webhook') }),
  node('Map message', 'n8n-nodes-base.code', 2, [220, 200], { mode: 'runOnceForAllItems', jsCode: MESSAGE_JS }),
  node('Log message?', 'n8n-nodes-base.if', 2.2, [440, 200], isSkip('message')),
  post('Send message to SIXXAB', [660, 280]),
  jsonReply('Messages: skipped', [900, 120], '{ "ok": true, "logged": false, "reason": $json.reason }'),
  jsonReply('Messages: logged', [900, 240], '{ "ok": true, "logged": true }'),
  jsonReply('Messages: not logged', [900, 360], '{ "ok": false, "logged": false, "reason": "SIXXAB did not accept it: " + (typeof $json.error === "string" ? $json.error : ($json.error && $json.error.message) || "unknown error") }'),
];

const to = (...names) => names.map((n) => [{ node: n, type: 'main', index: 0 }]);
const connections = {
  'Calls webhook': { main: to('Map call') },
  'Map call': { main: to('Log call?') },
  // IF: true (skip) → done; false → send.
  'Log call?': { main: to('Calls: done', 'Send call to SIXXAB') },
  // Retell retries when it gets no 2xx; answer 204 either way so a CRM hiccup doesn't cause repeat deliveries.
  'Send call to SIXXAB': { main: to('Calls: done', 'Calls: done') },
  'Messages webhook': { main: to('Map message') },
  'Map message': { main: to('Log message?') },
  'Log message?': { main: to('Messages: skipped', 'Send message to SIXXAB') },
  'Send message to SIXXAB': { main: to('Messages: logged', 'Messages: not logged') },
};

const workflow = { name: 'SIXXAB AI: Front Desk into the CRM', nodes, connections, active: false, settings: { executionOrder: 'v1' }, pinData: {} };

mkdirSync(new URL('.', OUT), { recursive: true });
writeFileSync(OUT, `${JSON.stringify(workflow, null, 2)}\n`);
process.stdout.write(`Wrote ${OUT.pathname} (${nodes.length} nodes)\n`);
