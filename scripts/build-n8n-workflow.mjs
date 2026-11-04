// Generates integrations/n8n/sixxab-actions.json, the n8n workflow that carries out approved actions.
// Run: npm run n8n:workflow   (tests/n8n-workflow.test.ts checks the wiring)
//
// Flow: Webhook (x-sixxab-secret) → Route (Code) → Switch → LinkedIn | X | Gmail | Twilio SMS | Twilio WhatsApp
//       | Gmail to founder (campaigns, spending: never moves money) → Respond { ok, message } to the platform.
import { createHash } from 'node:crypto';
import { mkdirSync, writeFileSync } from 'node:fs';

const OUT = new URL('../integrations/n8n/sixxab-actions.json', import.meta.url);

/** Stable ids so the file diffs cleanly between runs. */
const uuid = (seed) => {
  const h = createHash('sha256').update(`sixxab:${seed}`).digest('hex');
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-4${h.slice(13, 16)}-a${h.slice(17, 20)}-${h.slice(20, 32)}`;
};

const node = (name, type, typeVersion, position, parameters, extra = {}) => ({
  id: uuid(name), name, type, typeVersion, position, parameters, ...extra,
});

// ---- Route: normalizes what the platform sends into one route per action ----
const ROUTE_JS = `// SIXXAB AI → n8n router. Edit the settings below, then save the workflow.
const FOUNDER_EMAIL = 'you@example.com';      // spending requests and campaign drafts are emailed here
const TWILIO_SMS_FROM = '+10000000000';       // your Twilio phone number (E.164)
const TWILIO_WHATSAPP_FROM = '+14155238886';  // your Twilio WhatsApp sender (sandbox number shown)
const DEFAULT_EMAIL_SUBJECT = 'A note from our team';
const LINKEDIN_PERSON_ID = '';                // your LinkedIn member id (the value picked under Post on LinkedIn → Person)
// Channels with a connected account in this workflow. Set to true after connecting that node's credential.
const CONNECTED = { x: false, sms: false, whatsapp: false };
const notConnected = (name) => name + ' is not connected in n8n yet, so it was not sent';

const money = (minor, currency) => {
  const cur = String(currency || 'USD').toUpperCase();
  try {
    return new Intl.NumberFormat(cur === 'INR' ? 'en-IN' : 'en-US', { style: 'currency', currency: cur }).format(Number(minor) / 100);
  } catch {
    return (Number(minor) / 100).toFixed(2) + ' ' + cur;
  }
};

return $input.all().map((item) => {
  const body = item.json.body || {};
  const action = String(body.action || '');
  const p = body.payload || {};
  const network = String(p.network || '').trim().toLowerCase();
  const channel = String(p.channel || '').trim().toLowerCase();
  const out = { action, route: 'unsupported', label: '', reason: 'No n8n route for "' + action + '"', founderEmail: FOUNDER_EMAIL };

  if (action === 'publish_post') {
    out.text = String(p.text || '');
    if (network.includes('linkedin')) Object.assign(out, { route: 'post_linkedin', label: 'LinkedIn' });
    else if (network === 'x' || network.startsWith('x ') || network.includes('twitter')) { if (CONNECTED.x) Object.assign(out, { route: 'post_x', label: 'X' }); else out.reason = notConnected('X'); }
    else out.reason = 'Posting to "' + (p.network || '?') + '" is not connected in n8n yet';
  } else if (action === 'send_message') {
    const text = String(p.text || '');
    const m = text.match(/^subject:\\s*(.+)\\n+/i);
    Object.assign(out, { to: String(p.to || '').trim(), text: m ? text.slice(m[0].length) : text, subject: m ? m[1].trim() : DEFAULT_EMAIL_SUBJECT });
    if (channel === 'email') Object.assign(out, { route: 'message_email', label: 'Email' });
    else if (channel === 'sms') { if (CONNECTED.sms) Object.assign(out, { route: 'message_sms', label: 'SMS', from: TWILIO_SMS_FROM }); else out.reason = notConnected('SMS'); }
    else if (channel === 'whatsapp') { if (CONNECTED.whatsapp) Object.assign(out, { route: 'message_whatsapp', label: 'WhatsApp', from: TWILIO_WHATSAPP_FROM }); else out.reason = notConnected('WhatsApp'); }
    else out.reason = 'Channel "' + (p.channel || '?') + '" is not connected in n8n yet';
  } else if (action === 'reply_comment') {
    Object.assign(out, { text: String(p.text || ''), commenter: String(p.commenter || ''), threadUrn: String(p.threadUrn || ''), commentUrn: String(p.commentUrn || '') });
    if (String(p.network || '').toLowerCase() !== 'linkedin') out.reason = 'Replies on "' + (p.network || '?') + '" are not connected in n8n yet';
    else if (!LINKEDIN_PERSON_ID) out.reason = 'Set LINKEDIN_PERSON_ID in the Route node to reply on LinkedIn';
    else if (!/^urn:li:comment:/.test(out.commentUrn)) out.reason = 'Missing the LinkedIn comment to reply to';
    else Object.assign(out, { route: 'reply_linkedin', label: 'LinkedIn reply', actor: 'urn:li:person:' + LINKEDIN_PERSON_ID });
  } else if (action === 'send_email_campaign') {
    Object.assign(out, {
      route: 'notify_founder', label: 'Founder email',
      notifySubject: 'Campaign ready to send: ' + (p.subject || ''),
      notifyBody: 'You approved this campaign in SIXXAB AI. Send it to the list "' + (p.list || '') + '" from your email tool.\\n\\nSubject: ' + (p.subject || '') + '\\n\\n' + (p.body || ''),
    });
  } else if (action === 'spend_money') {
    const amount = money(p.amountMinor, p.currency);
    Object.assign(out, {
      route: 'notify_founder', label: 'Founder email', amount,
      notifySubject: 'Approved spend: ' + amount + ' on ' + (p.purpose || ''),
      notifyBody: 'You approved this spend in SIXXAB AI. n8n never moves money: make the payment yourself if it is still needed.\\n\\nAmount: ' + amount + '\\nPayee: ' + (p.payee || '') + '\\nPurpose: ' + (p.purpose || ''),
    });
  }
  return { json: out };
});`;

const routeIs = (key, outputKey) => ({
  conditions: {
    options: { caseSensitive: true, leftValue: '', typeValidation: 'strict', version: 2 },
    conditions: [{ id: uuid(`cond-${key}`), leftValue: '={{ $json.route }}', rightValue: key, operator: { type: 'string', operation: 'equals' } }],
    combinator: 'and',
  },
  renameOutput: true,
  outputKey,
});

const R = "$('Route').item.json";
const reply = (name, position, body) =>
  node(name, 'n8n-nodes-base.respondToWebhook', 1.1, position, { respondWith: 'json', responseBody: `={{ ${body} }}`, options: {} });
const sender = (name, type, typeVersion, position, parameters) =>
  node(name, type, typeVersion, position, parameters, { onError: 'continueErrorOutput' });

const nodes = [
  node('Setup notes', 'n8n-nodes-base.stickyNote', 1, [-460, -260], {
    width: 420, height: 400,
    content: [
      '## SIXXAB AI actions',
      'Approved posts and messages from sixxab.ai arrive here.',
      '',
      '1. **Webhook** → Credential: Header Auth, name `x-sixxab-secret`, value = your N8N_WEBHOOK_SECRET.',
      '2. **Route** → set FOUNDER_EMAIL and your Twilio numbers.',
      '3. Connect LinkedIn, X, Gmail and Twilio credentials on their nodes (pick your LinkedIn profile; also select it on Reply on LinkedIn and copy its id into LINKEDIN_PERSON_ID).',
      '4. Activate, copy the **Production URL** into Vercel as N8N_WEBHOOK_URL.',
      '',
      'Spending is never automatic: it only emails you.',
    ].join('\n'),
  }),
  node('SIXXAB webhook', 'n8n-nodes-base.webhook', 2, [0, 0], {
    httpMethod: 'POST', path: 'sixxab-actions', authentication: 'headerAuth', responseMode: 'responseNode', options: {},
  }, { webhookId: uuid('webhook') }),
  node('Route', 'n8n-nodes-base.code', 2, [220, 0], { mode: 'runOnceForAllItems', jsCode: ROUTE_JS }),
  node('By channel', 'n8n-nodes-base.switch', 3.2, [440, 0], {
    rules: {
      values: [
        routeIs('post_linkedin', 'LinkedIn'),
        routeIs('post_x', 'X'),
        routeIs('message_email', 'Email'),
        routeIs('message_sms', 'SMS'),
        routeIs('message_whatsapp', 'WhatsApp'),
        routeIs('notify_founder', 'Founder'),
        routeIs('reply_linkedin', 'LinkedIn reply'),
      ],
    },
    options: { fallbackOutput: 'extra', renameFallbackOutput: 'Unsupported' },
  }),
  sender('Post on LinkedIn', 'n8n-nodes-base.linkedIn', 1, [720, -400], {
    resource: 'post', operation: 'create', postAs: 'person', person: '', text: '={{ $json.text }}', shareMediaCategory: 'NONE', additionalFields: { visibility: 'PUBLIC' },
  }),
  sender('Post on X', 'n8n-nodes-base.twitter', 2, [720, -240], { resource: 'tweet', operation: 'create', text: '={{ $json.text }}', additionalFields: {} }),
  sender('Send email', 'n8n-nodes-base.gmail', 2.1, [720, -80], {
    resource: 'message', operation: 'send', sendTo: '={{ $json.to }}', subject: '={{ $json.subject }}', emailType: 'text', message: '={{ $json.text }}', options: { appendAttribution: false },
  }),
  sender('Send SMS', 'n8n-nodes-base.twilio', 1, [720, 80], {
    resource: 'sms', operation: 'send', from: '={{ $json.from }}', to: '={{ $json.to }}', toWhatsapp: false, message: '={{ $json.text }}', options: {},
  }),
  sender('Send WhatsApp', 'n8n-nodes-base.twilio', 1, [720, 240], {
    resource: 'sms', operation: 'send', from: '={{ $json.from }}', to: '={{ $json.to }}', toWhatsapp: true, message: '={{ $json.text }}', options: {},
  }),
  sender('Email the founder', 'n8n-nodes-base.gmail', 2.1, [720, 400], {
    resource: 'message', operation: 'send', sendTo: '={{ $json.founderEmail }}', subject: '={{ $json.notifySubject }}', emailType: 'text', message: '={{ $json.notifyBody }}', options: { appendAttribution: false },
  }),
  sender('Reply on LinkedIn', 'n8n-nodes-base.httpRequest', 4.2, [720, 560], {
    method: 'POST',
    url: "={{ 'https://api.linkedin.com/v2/socialActions/' + encodeURIComponent($json.commentUrn).replace(/\\(/g, '%28').replace(/\\)/g, '%29') + '/comments' }}",
    authentication: 'predefinedCredentialType',
    nodeCredentialType: 'linkedInOAuth2Api',
    sendHeaders: true,
    headerParameters: { parameters: [{ name: 'X-Restli-Protocol-Version', value: '2.0.0' }] },
    sendBody: true,
    contentType: 'json',
    specifyBody: 'json',
    jsonBody: '={{ JSON.stringify({ actor: $json.actor, object: $json.threadUrn, message: { text: $json.text }, parentComment: $json.commentUrn }) }}',
    options: {},
  }),
  reply('Reply: replied on LinkedIn', [1000, 560], `{ "ok": true, "message": "Replied on LinkedIn" + (${R}.commenter ? " to " + ${R}.commenter : "") + ": https://www.linkedin.com/feed/update/" + ${R}.threadUrn }`),
  reply('Reply: posted on LinkedIn', [1000, -400], `{ "ok": true, "message": "Posted on LinkedIn" + (String($json.urn || $json.id || '').startsWith('urn:') ? ": https://www.linkedin.com/feed/update/" + ($json.urn || $json.id) : "") }`),
  reply('Reply: posted on X', [1000, -240], `{ "ok": true, "message": "Posted on X" + ($json.id ? ": https://x.com/i/web/status/" + $json.id : "") }`),
  reply('Reply: emailed', [1000, -80], `{ "ok": true, "message": "Emailed " + ${R}.to }`),
  reply('Reply: SMS sent', [1000, 80], `{ "ok": true, "message": "SMS sent to " + ${R}.to + ($json.sid ? " (Twilio " + $json.sid + ")" : "") }`),
  reply('Reply: WhatsApp sent', [1000, 240], `{ "ok": true, "message": "WhatsApp sent to " + ${R}.to + ($json.sid ? " (Twilio " + $json.sid + ")" : "") }`),
  reply('Reply: founder notified', [1000, 400], `{ "ok": true, "message": ${R}.action === "spend_money" ? "Emailed the founder to pay " + ${R}.amount + " manually; no money was moved" : "Emailed the campaign to the founder to send; the list was not emailed" }`),
  reply('Reply: not sent', [1000, 600], `{ "ok": false, "message": ${R}.label + " failed: " + (typeof $json.error === "string" ? $json.error : ($json.error && $json.error.message) || "unknown error") }`),
  reply('Reply: no route', [720, 600], `{ "ok": false, "message": $json.reason }`),
];

const to = (...names) => names.map((n) => [{ node: n, type: 'main', index: 0 }]);
const connections = {
  'SIXXAB webhook': { main: to('Route') },
  Route: { main: to('By channel') },
  'By channel': { main: to('Post on LinkedIn', 'Post on X', 'Send email', 'Send SMS', 'Send WhatsApp', 'Email the founder', 'Reply on LinkedIn', 'Reply: no route') },
  'Reply on LinkedIn': { main: to('Reply: replied on LinkedIn', 'Reply: not sent') },
  'Post on LinkedIn': { main: to('Reply: posted on LinkedIn', 'Reply: not sent') },
  'Post on X': { main: to('Reply: posted on X', 'Reply: not sent') },
  'Send email': { main: to('Reply: emailed', 'Reply: not sent') },
  'Send SMS': { main: to('Reply: SMS sent', 'Reply: not sent') },
  'Send WhatsApp': { main: to('Reply: WhatsApp sent', 'Reply: not sent') },
  'Email the founder': { main: to('Reply: founder notified', 'Reply: not sent') },
};

const workflow = { name: 'SIXXAB AI: approved actions', nodes, connections, active: false, settings: { executionOrder: 'v1' }, pinData: {} };

mkdirSync(new URL('.', OUT), { recursive: true });
writeFileSync(OUT, `${JSON.stringify(workflow, null, 2)}\n`);
process.stdout.write(`Wrote ${OUT.pathname} (${nodes.length} nodes)\n`);
