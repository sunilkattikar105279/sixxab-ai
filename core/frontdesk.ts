// Front Desk: the 24/7 AI attendant for one business's calls, WhatsApp, email and website chat.
// The owner sets opening hours, the transfer and on-call numbers, the languages and the approved answers here. From those
// settings the platform writes the voice agent's script (pasted into Retell or any voice AI) and the missed-call text.
// Settings are append-only audit events, newest wins. Nothing here calls, texts or spends: the voice platform answers the
// phone, n8n carries each finished call or message to the CRM entry point, and every outbound message still waits for the
// owner's approval in Approvals. Design: /mnt/project-files/attendant/24x7-attendant-design.md (shared project folder).
import { newId, nowIso, type Store } from './store.js';
import { isHealthcare, loadBusinessProfile, type BusinessProfile } from './profile.js';
import { PHONE_RE } from './research-map.js';
import type { AuditEvent } from './types.js';

export const FRONT_DESK_EVENT = 'frontdesk.settings';
export const FRONT_DESK_EVENTS = [FRONT_DESK_EVENT];

export const DAYS = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'] as const;
export type Day = (typeof DAYS)[number];
const DAY_NAMES: Record<Day, string> = { mon: 'Monday', tue: 'Tuesday', wed: 'Wednesday', thu: 'Thursday', fri: 'Friday', sat: 'Saturday', sun: 'Sunday' };

export const LANGUAGES = { en: 'English', es: 'Spanish', hi: 'Hindi', mr: 'Marathi' } as const;
export type Language = keyof typeof LANGUAGES;

/** What the attendant asks a new caller, and which emergencies it listens for, by kind of business. */
export interface Vertical { label: string; healthcare?: boolean; qualify: string[]; emergencies: string[]; guard?: string }

export const VERTICALS: Record<string, Vertical> = {
  hvac: {
    label: 'HVAC and plumbing',
    qualify: ['what needs fixing or installing', 'the service address or ZIP code, to check it is in the service area', 'how urgent it is', 'whether they own or rent', 'the best number to call back'],
    emergencies: ['a gas smell: tell them to leave the building now and call 911 and the gas company from outside', 'flooding or a burst pipe: tell them to shut off the main water valve if they safely can', 'no heat or no cooling with a baby, an older person or someone unwell at home'],
  },
  roofing: {
    label: 'Roofing',
    qualify: ['the property address', 'the date of the storm, if there was one', 'what is damaged: roof, gutters, siding or a leak inside', 'whether water is coming in right now', 'their insurance company and whether a claim is already filed', 'the best number to call back'],
    emergencies: ['water coming in during a storm', 'a tree or debris through the roof'],
    guard: 'After the questions, ask them to send photos of the damage on WhatsApp to this same number, or by email. Never promise that insurance will pay.',
  },
  home: {
    label: 'Other home services',
    qualify: ['what they need done', 'the service address or ZIP code', 'how soon they need it', 'the best number to call back'],
    emergencies: ['anything that puts someone in danger right now'],
  },
  dental: {
    label: 'Dental practice', healthcare: true,
    qualify: ['whether they are a new or existing patient', 'the kind of visit, from: cleaning, check-up, consultation, cosmetic or other', 'the day and time that suits them', 'their insurance company, only if they offer it'],
    emergencies: ['severe swelling of the face, trouble breathing or swallowing, or heavy bleeding: tell them to call 911 now'],
  },
  medspa: {
    label: 'Med spa', healthcare: true,
    qualify: ['whether they are a new or existing client', 'the treatment they are interested in, by name only', 'the day and time that suits them'],
    emergencies: ['a reaction after a treatment with swelling, trouble breathing or severe pain: tell them to call 911 now'],
  },
  clinic: {
    label: 'Clinic or hospital', healthcare: true,
    qualify: ['whether they are a new or existing patient', 'which department or doctor they want to see', 'the day and time that suits them'],
    emergencies: ['any medical emergency: tell them to hang up and call 112 in India or 911 in the US now'],
  },
  law: {
    label: 'Law firm',
    qualify: ['the kind of legal matter, from the practice areas the firm handles', 'roughly when it happened', 'where it happened', 'whether they already have a lawyer for it', 'their preferred language', 'the best number to call back'],
    emergencies: ['someone in danger right now: tell them to call 911'],
    guard: 'Never give legal advice or say whether they have a case. Take only the facts above; an attorney will call back.',
  },
  agency: {
    label: 'B2B or agency',
    qualify: ['their company and role', 'what they want help with', 'how big their team is', 'when they want to start'],
    emergencies: [],
  },
  other: {
    label: 'Other',
    qualify: ['what they need', 'how soon they need it', 'the best number to call back'],
    emergencies: ['anything that puts someone in danger right now'],
  },
};

export interface Answer { q: string; a: string }

export interface FrontDeskSettings {
  on: boolean;
  vertical: string;
  languages: Language[];
  timezone: string;
  /** Opening hours per day as "08:00-18:00", "24h" for all day, or "" for closed. */
  hours: Record<Day, string>;
  transferNumber: string;
  onCallNumber: string;
  callbackOpen: string;
  callbackClosed: string;
  bookingUrl: string;
  textBack: { on: boolean; template: string };
  answers: Answer[];
}

export interface FrontDeskState {
  settings: FrontDeskSettings;
  saved: boolean;
  updatedAt: string | null;
  openNow: boolean;
  healthcare: boolean;
  script: string;
  textBackPreview: string;
  postCallFields: typeof POST_CALL_FIELDS;
  checklist: { step: string; done: boolean }[];
  answersGoal: string;
  /** The business ID the n8n workflow sends with each call and message (SIXXAB_ORG_ID). */
  orgId: string;
}

export const LIMITS = { answers: 40, question: 200, answer: 600, template: 320, promise: 80 };
const HOURS_RE = /^([01]\d|2[0-3]):([0-5]\d)-([01]\d|2[0-4]):([0-5]\d)$/;
const DEFAULT_TEMPLATE = 'Sorry we missed your call at {business}. Reply here and we will get back to you{booking}.';

const text = (v: unknown, max: number) => String(v ?? '').replace(/\s+/g, ' ').trim().slice(0, max);

/** A starting point that matches the business profile: kind of business, time zone and languages. */
export function defaultSettings(profile: BusinessProfile | null): FrontDeskSettings {
  const india = /india|bharat/i.test(`${profile?.location ?? ''} ${profile?.markets ?? ''} ${profile?.currency ?? ''}`) || /inr|₹/i.test(profile?.currency ?? '');
  return {
    on: false,
    vertical: defaultVertical(profile),
    languages: india ? ['en', 'hi', 'mr'] : ['en'],
    timezone: india ? 'Asia/Kolkata' : 'America/Chicago',
    hours: { mon: '09:00-18:00', tue: '09:00-18:00', wed: '09:00-18:00', thu: '09:00-18:00', fri: '09:00-18:00', sat: '', sun: '' },
    transferNumber: '', onCallNumber: '',
    callbackOpen: 'within 15 minutes', callbackClosed: 'first thing when we open',
    bookingUrl: '',
    textBack: { on: false, template: DEFAULT_TEMPLATE },
    answers: [],
  };
}

export function defaultVertical(profile: BusinessProfile | null): string {
  const about = `${profile?.industry ?? ''} ${profile?.offer ?? ''} ${profile?.name ?? ''}`.toLowerCase();
  if (/roof/.test(about)) return 'roofing';
  if (/hvac|plumb|heating|air condition|furnace/.test(about)) return 'hvac';
  if (/dental|dentist|orthodont/.test(about)) return 'dental';
  if (/med ?spa|aesthetic|botox|laser/.test(about)) return 'medspa';
  if (/law|attorney|legal|lawyer/.test(about)) return 'law';
  if (/healthcare/.test(about)) return 'clinic';
  if (/home services/.test(about)) return 'home';
  if (/technology|software|agency|consult/.test(about)) return 'agency';
  return 'other';
}

export function validTimezone(tz: string): boolean {
  if (!tz || tz.length > 64) return false;
  try { new Intl.DateTimeFormat('en-US', { timeZone: tz }); return true; } catch { return false; }
}

function cleanHours(v: unknown, day: Day): string {
  const s = String(v ?? '').trim().toLowerCase();
  if (!s || s === 'closed') return '';
  if (s === '24h' || s === '00:00-24:00') return '24h';
  const m = HOURS_RE.exec(s);
  if (!m) throw new Error(`${DAY_NAMES[day]} hours must look like 09:00-18:00, 24h, or be left empty for closed`);
  const open = Number(m[1]) * 60 + Number(m[2]);
  const close = Number(m[3]) * 60 + Number(m[4]);
  if (close > 1440 || close <= open) throw new Error(`${DAY_NAMES[day]} closes before it opens`);
  return s;
}

function cleanPhone(v: unknown, label: string): string {
  const s = String(v ?? '').trim();
  if (!s) return '';
  if (!PHONE_RE.test(s) || s.replace(/\D/g, '').length < 7) throw new Error(`${label} doesn't look like a phone number`);
  return s;
}

function cleanUrl(v: unknown): string {
  const s = String(v ?? '').trim();
  if (!s) return '';
  let u: URL;
  try { u = new URL(s); } catch { throw new Error('The booking link must be a full web address starting with https://'); }
  if (u.protocol !== 'https:') throw new Error('The booking link must start with https://');
  return u.toString().slice(0, 300);
}

/** Checks and tidies what the owner typed. Throws a plain-English error for the first problem. */
export function cleanSettings(input: Partial<Record<keyof FrontDeskSettings, unknown>>, base: FrontDeskSettings): FrontDeskSettings {
  const vertical = Object.prototype.hasOwnProperty.call(VERTICALS, String(input.vertical)) ? String(input.vertical) : base.vertical;
  const langs = Array.isArray(input.languages) ? input.languages.map(String).filter((l): l is Language => l in LANGUAGES) : base.languages;
  const languages = [...new Set(langs)];
  if (!languages.length) throw new Error('Pick at least one language');
  const timezone = input.timezone === undefined ? base.timezone : String(input.timezone).trim();
  if (!validTimezone(timezone)) throw new Error('Pick a time zone such as America/Chicago or Asia/Kolkata');
  const rawHours = (input.hours && typeof input.hours === 'object' ? input.hours : base.hours) as Record<string, unknown>;
  const hours = Object.fromEntries(DAYS.map((d) => [d, cleanHours(rawHours[d], d)])) as Record<Day, string>;
  const tb = (input.textBack && typeof input.textBack === 'object' ? input.textBack : base.textBack) as Record<string, unknown>;
  const template = text(tb.template, LIMITS.template) || DEFAULT_TEMPLATE;
  if (/https?:\/\//i.test(template)) throw new Error('Put the booking link in the booking field; the text uses it through {booking}');
  const rawAnswers = Array.isArray(input.answers) ? input.answers : base.answers;
  const answers = rawAnswers
    .map((x) => ({ q: text((x as Answer)?.q, LIMITS.question), a: text((x as Answer)?.a, LIMITS.answer) }))
    .filter((x) => x.q && x.a);
  if (answers.length > LIMITS.answers) throw new Error(`Keep it to ${LIMITS.answers} approved answers`);
  const pick = <K extends keyof FrontDeskSettings>(k: K) => (input[k] === undefined ? base[k] : input[k]);
  return {
    on: pick('on') === true,
    vertical, languages, timezone, hours,
    transferNumber: cleanPhone(pick('transferNumber'), 'The transfer number'),
    onCallNumber: cleanPhone(pick('onCallNumber'), 'The on-call number'),
    callbackOpen: text(pick('callbackOpen'), LIMITS.promise) || base.callbackOpen,
    callbackClosed: text(pick('callbackClosed'), LIMITS.promise) || base.callbackClosed,
    bookingUrl: cleanUrl(pick('bookingUrl')),
    textBack: { on: tb.on === true, template },
    answers,
  };
}

/** The weekday and minutes past midnight at that moment in the business's time zone. */
function localTime(timezone: string, at: Date): { day: Day; minutes: number } {
  const parts = new Intl.DateTimeFormat('en-US', { timeZone: timezone, weekday: 'short', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).formatToParts(at);
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? '';
  const day = get('weekday').slice(0, 3).toLowerCase() as Day;
  return { day, minutes: (Number(get('hour')) % 24) * 60 + Number(get('minute')) };
}

/** Whether the business is open at that moment, by its own clock. */
export function isOpenAt(s: Pick<FrontDeskSettings, 'hours' | 'timezone'>, at: Date): boolean {
  const { day, minutes } = localTime(s.timezone, at);
  const h = s.hours[day];
  if (!h) return false;
  if (h === '24h') return true;
  const m = HOURS_RE.exec(h);
  if (!m) return false;
  return minutes >= Number(m[1]) * 60 + Number(m[2]) && minutes < Number(m[3]) * 60 + Number(m[4]);
}

export function hoursText(s: Pick<FrontDeskSettings, 'hours' | 'timezone'>): string {
  const lines = DAYS.map((d) => `${DAY_NAMES[d]}: ${s.hours[d] === '24h' ? 'open all day' : s.hours[d] ? s.hours[d].replace('-', ' to ') : 'closed'}`);
  return `${lines.join('; ')} (time zone ${s.timezone})`;
}

/** Fields to add under the voice agent's post-call analysis, so every call reaches the CRM in the same shape. */
export const POST_CALL_FIELDS = [
  { name: 'intent', type: 'enum', values: ['new_enquiry', 'booking', 'existing_customer', 'support', 'emergency', 'spam', 'other'], description: 'Why they called' },
  { name: 'outcome', type: 'enum', values: ['booked', 'callback', 'transferred', 'answered', 'voicemail', 'missed'], description: 'How the call ended' },
  { name: 'caller_name', type: 'text', description: "The caller's name, if they gave it" },
  { name: 'caller_email', type: 'text', description: "The caller's email, if they gave it" },
  { name: 'callback_number', type: 'text', description: 'The number to call back, if different from the caller ID' },
  { name: 'booking_start', type: 'text', description: 'The booked slot start, ISO 8601 with offset, if they booked' },
  { name: 'best_time', type: 'enum', values: ['Morning', 'Afternoon', 'Evening', 'Any time'], description: 'When they would like the callback, if they said' },
  { name: 'after_hours', type: 'boolean', description: 'True if the business was closed during the call' },
  { name: 'language', type: 'enum', values: Object.keys(LANGUAGES), description: 'The language the call was held in' },
] as const;

function greeting(lang: Language, business: string): string {
  switch (lang) {
    case 'es': return `Gracias por llamar a ${business}. Soy el asistente virtual, y esta llamada se graba. ¿En qué le puedo ayudar?`;
    case 'hi': return `नमस्ते, ${business} में आपका स्वागत है। मैं AI असिस्टेंट हूँ, और यह कॉल रिकॉर्ड हो रही है। बताइए, मैं आपकी कैसे मदद करूँ?`;
    case 'mr': return `नमस्कार, ${business} मध्ये आपले स्वागत आहे. मी AI सहाय्यक आहे, आणि हा कॉल रेकॉर्ड होत आहे. सांगा, मी आपली कशी मदत करू?`;
    default: return `Thanks for calling ${business}. This is the virtual assistant, and this call is recorded. How can I help you today?`;
  }
}

/** The voice agent's full instructions, ready to paste into Retell (or any voice AI) as its prompt. */
export function voiceScript(profile: BusinessProfile | null, s: FrontDeskSettings): string {
  const business = profile?.name?.trim() || 'the business';
  const v = VERTICALS[s.vertical] ?? VERTICALS.other;
  const healthcare = isHealthcare(profile) || v.healthcare === true;
  const langs = s.languages.map((l) => LANGUAGES[l]).join(', ');
  const sections = [
    `You are the front desk assistant for ${business}${profile?.location ? `, in ${profile.location}` : ''}. You answer phone calls day and night, help callers quickly and kindly, and make sure nobody is left without a next step. Speak naturally, in short sentences, one question at a time.`,
    `## Start every call\nSay that you are an AI assistant and that the call is recorded, in the caller's language. You speak ${langs}; switch to the caller's language as soon as they use it.\n${s.languages.map((l) => `- ${LANGUAGES[l]}: "${greeting(l, business)}"`).join('\n')}`,
    `## Hours\n${hoursText(s)}. When the business is open, you can transfer callers to ${s.transferNumber || 'the team (no transfer number set: take a message instead)'}, and callbacks happen ${s.callbackOpen}. When it is closed, take a message or book a slot, and promise a callback ${s.callbackClosed}.`,
    `## Steps\n1. Find out what they need: a new enquiry, a booking, a question as an existing customer, a problem to fix, or an emergency.\n2. Listen for emergencies first (below).\n3. For a new enquiry, ask these one at a time, skipping anything they already said: ${v.qualify.join('; ')}.${v.guard ? ` ${v.guard}` : ''}\n4. Offer the next step: ${s.bookingUrl ? 'offer to send the booking link by text or WhatsApp, or ' : ''}promise a callback ${s.callbackOpen} when open or ${s.callbackClosed} when closed.\n5. Answer questions only from the approved answers below.\n6. Before you hang up, repeat back their name, the number to call back and what happens next, then thank them.`,
    `## Emergencies\n${v.emergencies.length ? v.emergencies.map((e) => `- ${e}.`).join('\n') : '- Anything that puts someone in danger right now: tell them to call 911 (112 in India).'}\nAfter the safety advice, ${s.onCallNumber ? `transfer to the on-call number ${s.onCallNumber} at any hour` : s.transferNumber ? `transfer to ${s.transferNumber} if open, and otherwise take an urgent message` : 'take an urgent message'}.`,
    `## Hand over to a person when\n- they ask for a person${s.transferNumber ? ' (transfer when open; otherwise promise a callback)' : ''};\n- they are upset, or you have not understood them twice;\n- they raise billing, a refund, a cancellation or a complaint;\n- they ask for medical, legal or financial advice;\n- the call passes 10 minutes.`,
    `## Approved answers (the only facts you may give)\n${s.answers.length ? s.answers.map((x) => `Q: ${x.q}\nA: ${x.a}`).join('\n') : '(None yet. For any question, say someone will call back with the answer.)'}\nFor anything not covered here, say: "I don't want to guess on that. I'll have the team call you back." Then take a message.`,
    `## Never\n- Never quote a price, discount or time that is not in the approved answers.\n- Never promise an outcome.\n- Never take card numbers or passwords over the phone.\n- Never pretend to be a person.`,
  ];
  if (healthcare) sections.push(`## Healthcare rule\nThis is a healthcare business. Never ask for, record or repeat symptoms, diagnoses, test results or medical history. If the caller starts to share them, say kindly: "Please don't share medical details with me. The team will go over everything when they call you." Give no medical advice. Keep the call summary to the visit type and preferred time only.`);
  sections.push(`## After the call\nFill in the post-call fields: intent, outcome, caller_name, caller_email, callback_number, booking_start, best_time, after_hours and language. Write a two-line summary of what they need and what happens next${healthcare ? ', with no medical details' : ''}.`);
  return sections.join('\n\n');
}

export function textBackMessage(s: Pick<FrontDeskSettings, 'textBack' | 'bookingUrl'>, business: string): string {
  return s.textBack.template
    .replace(/\{business\}/g, business || 'our business')
    .replace(/\{booking\}/g, s.bookingUrl ? `, or book a time here: ${s.bookingUrl}` : '')
    .slice(0, 480);
}

function checklist(s: FrontDeskSettings, saved: boolean): { step: string; done: boolean }[] {
  const hoursSet = DAYS.some((d) => s.hours[d]);
  return [
    { step: 'Set your hours, numbers and languages here, and save', done: saved && hoursSet },
    { step: 'Add at least 5 approved answers (hours, location, services, prices you allow, payment)', done: s.answers.length >= 5 },
    { step: 'Create a voice agent in Retell, paste the script below, and add the post-call fields', done: false },
    { step: 'Get a phone number (Retell or Twilio in the US, Plivo or Exotel in India) and attach it to the agent', done: false },
    { step: 'Connect your WhatsApp number (Meta Cloud API) and your email in Chatwoot, and add its chat box to your website', done: false },
    { step: 'Import the Front Desk workflow into n8n with your business ID (below) and the inbound key, so calls and messages land in your CRM', done: false },
    { step: 'Make a test call and send a test WhatsApp, then check the CRM', done: false },
  ];
}

function answersGoal(profile: BusinessProfile | null, s: FrontDeskSettings): string {
  const have = s.answers.map((x) => `- ${x.q}`).join('\n');
  return `Write up to 12 approved answers for the front desk of ${profile?.name || 'this business'} (${VERTICALS[s.vertical]?.label ?? 'business'}): the questions callers ask most, each with a short, accurate answer from the business profile only. Write [PRICE], [HOURS] or [FILL IN] wherever the profile doesn't say, and never invent prices, offers or guarantees.${isHealthcare(profile) ? ' This is a healthcare business: no medical advice and no clinical claims.' : ''} Save them as one note titled "Front Desk: suggested answers", as Q: and A: lines.${have ? `\nAlready approved, so skip these:\n${have}` : ''}`;
}

export function computeFrontDesk(events: AuditEvent[], profile: BusinessProfile | null, now = new Date(), orgId = ''): FrontDeskState {
  const last = [...events].reverse().find((e) => e.action === FRONT_DESK_EVENT);
  const base = defaultSettings(profile);
  let settings = base;
  if (last) {
    try { settings = cleanSettings(last.detail.settings as Partial<FrontDeskSettings>, base); } catch { settings = base; }
  }
  const business = profile?.name?.trim() || 'our business';
  return {
    settings, saved: Boolean(last), updatedAt: last?.at ?? null,
    openNow: isOpenAt(settings, now),
    healthcare: isHealthcare(profile) || VERTICALS[settings.vertical]?.healthcare === true,
    script: voiceScript(profile, settings),
    textBackPreview: textBackMessage(settings, business),
    postCallFields: POST_CALL_FIELDS,
    checklist: checklist(settings, Boolean(last)),
    answersGoal: answersGoal(profile, settings),
    orgId,
  };
}

export async function loadFrontDesk(store: Store, orgId: string, now = new Date()): Promise<FrontDeskState> {
  const [events, profile] = await Promise.all([store.listAuditByActions(orgId, FRONT_DESK_EVENTS), loadBusinessProfile(store, orgId)]);
  return computeFrontDesk(events, profile, now, orgId);
}

export async function saveFrontDesk(store: Store, orgId: string, input: Partial<Record<keyof FrontDeskSettings, unknown>>, by: string): Promise<FrontDeskState> {
  const current = await loadFrontDesk(store, orgId);
  const settings = cleanSettings(input, current.settings);
  const changes = [settings.on !== current.settings.on ? (settings.on ? 'turned on' : 'turned off') : '', `${settings.answers.length} approved answers`].filter(Boolean).join(', ');
  await store.audit({ id: newId(), orgId, at: nowIso(), actor: by, action: FRONT_DESK_EVENT, taskId: null, detail: { settings, summary: `Front Desk settings saved: ${changes}` } });
  return loadFrontDesk(store, orgId);
}
