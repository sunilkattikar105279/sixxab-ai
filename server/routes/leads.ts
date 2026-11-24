// The public lead form for one business, with no sign-in: GET shows it, POST records the enquiry as a CRM deal.
// vercel.json rewrites /l/<formId> here (?route=leads&form=<formId>); links carry ?s=<source>&p=<post>&m=paid.
// Plain HTML with no scripts, so it works on any phone inside a social app's browser. A hidden field and a minimum fill
// time turn away most bots, and core/leads.ts caps enquiries per hour and per day.
import { CALL_TIMES, captureLead, checkLead, findOpenForm, LeadLimitError, type LeadInput } from '../../core/leads.js';
import { loadPublishing } from '../../core/publishing.js';
import { isHealthcare, loadBusinessProfile } from '../../core/profile.js';
import type { Store } from '../../core/store.js';
import { handle, store } from '../context.js';

const MAX_BODY = 16_000;
const MIN_FILL_MS = 2_500;
const MAX_AGE_MS = 24 * 3_600_000;

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c] as string);

const STYLE = `
*{box-sizing:border-box}body{margin:0;font:16px/1.5 system-ui,-apple-system,Segoe UI,Roboto,sans-serif;background:#f4f5f7;color:#16181d}
main{max-width:30rem;margin:0 auto;padding:2rem 1rem 3rem}h1{font-size:1.5rem;line-height:1.25;margin:0 0 .25rem}p{margin:.25rem 0 1rem}
.card{background:#fff;border-radius:16px;padding:1.25rem;box-shadow:0 1px 3px rgba(0,0,0,.08)}label{display:block;margin:0 0 .9rem;font-weight:600;font-size:.95rem}
input,textarea,select{display:block;width:100%;margin-top:.3rem;padding:.7rem .8rem;border:1px solid #cdd1d8;border-radius:10px;font:inherit;background:#fff;color:inherit}
textarea{min-height:6rem;resize:vertical}.check{display:flex;gap:.6rem;align-items:flex-start;font-weight:400}.check input{width:auto;margin-top:.3rem}
button{width:100%;padding:.85rem;border:0;border-radius:10px;background:#3b5bdb;color:#fff;font:inherit;font-weight:700;cursor:pointer}
.muted{color:#5c6370;font-size:.85rem}.err{background:#fff0f0;color:#a61e1e;border-radius:10px;padding:.6rem .8rem}.hp{position:absolute;left:-9999px;height:0;overflow:hidden}
@media (prefers-color-scheme:dark){body{background:#101215;color:#eceef1}.card{background:#1a1d22;box-shadow:none}input,textarea,select{background:#101215;border-color:#3a3f47}.muted{color:#9aa1ab}.err{background:#3a1717;color:#ffb3b3}}`;

function page(title: string, body: string, status = 200): Response {
  const html = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex"><title>${esc(title)}</title><style>${STYLE}</style></head><body><main>${body}</main></body></html>`;
  return new Response(html, { status, headers: { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store', 'x-robots-tag': 'noindex' } });
}

const gone = () => page('Form not available', '<div class="card"><h1>This form isn\'t available</h1><p>The link may have changed. Please contact the business directly.</p></div>', 404);

interface FormValues { name?: string; email?: string; phone?: string; message?: string; when?: string }

function form(formId: string, business: string, healthcare: boolean, q: { s: string; p: string; m: string }, values: FormValues = {}, error = ''): Response {
  const v = (k: keyof FormValues) => esc(values[k] ?? '');
  const action = `/l/${formId}?${new URLSearchParams(Object.entries(q).filter(([, x]) => x)).toString()}`;
  const hidden = Object.entries(q).map(([k, x]) => `<input type="hidden" name="${k}" value="${esc(x)}">`).join('');
  const extra = healthcare
    ? `<label>Best time to call<select name="when">${CALL_TIMES.map((t) => `<option${values.when === t ? ' selected' : ''}>${t}</option>`).join('')}</select></label><p class="muted">Please don't share medical details here; the team will talk with you directly.</p>`
    : `<label>How can they help? <span class="muted">(optional)</span><textarea name="message" maxlength="1000">${v('message')}</textarea></label>`;
  const name = esc(business);
  return page(`Contact ${business}`, `
<h1>Contact ${name}</h1><p class="muted">Leave your details and ${name} will get back to you.</p>
<form class="card" method="post" action="${esc(action)}">
${error ? `<p class="err" role="alert">${esc(error)}</p>` : ''}
<label>Your name<input name="name" autocomplete="name" maxlength="120" required value="${v('name')}"></label>
<label>Email<input name="email" type="email" autocomplete="email" maxlength="200" value="${v('email')}"></label>
<label>Phone<input name="phone" type="tel" autocomplete="tel" maxlength="20" value="${v('phone')}"></label>
${extra}
<div class="hp" aria-hidden="true"><label>Website<input name="website" tabindex="-1" autocomplete="off"></label></div>
<input type="hidden" name="t" value="${Date.now()}">${hidden}
<label class="check"><input type="checkbox" name="consent" value="yes" required> <span>I agree that ${name} may contact me about my request.</span></label>
<button type="submit">Send</button>
<p class="muted">Your details go only to ${name}.</p>
</form>`, error ? 400 : 200);
}

const thanks = (business: string, name: string) => page('Thank you', `<div class="card"><h1>Thank you${name ? `, ${esc(name.split(' ')[0])}` : ''}</h1><p>${esc(business)} has your details and will be in touch soon.</p></div>`);

function attribution(params: URLSearchParams) {
  const s = (params.get('s') ?? '').toLowerCase().replace(/[^a-z]/g, '').slice(0, 20);
  const p = (params.get('p') ?? '').toLowerCase().replace(/[^0-9a-f]/g, '').slice(0, 8);
  return { s, p, m: params.get('m') === 'paid' ? 'paid' : '' };
}

async function open(s: Store, formId: string) {
  const found = await findOpenForm(s, formId);
  if (!found) return null;
  const profile = await loadBusinessProfile(s, found.orgId);
  return { s, ...found, business: profile?.name?.trim() || 'this business', healthcare: isHealthcare(profile) };
}

/** GET: the form. Exported with the store as a parameter so tests can run it on a memory store. */
export async function showForm(request: Request, s: Store): Promise<Response> {
  const url = new URL(request.url);
  const formId = url.searchParams.get('form') ?? '';
  const f = await open(s, formId);
  if (!f) return gone();
  return form(formId, f.business, f.healthcare, attribution(url.searchParams));
}

/** POST: one enquiry. */
export async function submitForm(request: Request, s: Store, now = Date.now()): Promise<Response> {
  const url = new URL(request.url);
  const formId = url.searchParams.get('form') ?? '';
  const raw = await request.text();
  if (raw.length > MAX_BODY) return page('Too long', '<div class="card"><h1>That was too long</h1><p>Please shorten your message and try again.</p></div>', 413);
  const f = await open(s, formId);
  if (!f) return gone();
  const body = new URLSearchParams(raw);
  const q = attribution(body.has('s') || body.has('p') || body.has('m') ? body : url.searchParams);
  const values: FormValues = { name: body.get('name') ?? '', email: body.get('email') ?? '', phone: body.get('phone') ?? '', message: body.get('message') ?? '', when: body.get('when') ?? '' };
  // A bot fills the hidden field: thank it and record nothing.
  if (body.get('website')) return thanks(f.business, '');
  const age = now - Number(body.get('t'));
  if (!Number.isFinite(age) || age > MAX_AGE_MS) return form(formId, f.business, f.healthcare, q, values, 'This page was open a long time. Please press Send again.');
  if (age < MIN_FILL_MS) return form(formId, f.business, f.healthcare, q, values, 'That was quick. Please check your details and press Send again.');
  const input: LeadInput = { ...values, consent: body.get('consent') ?? '', ...q };
  const checked = checkLead(input, f.healthcare);
  if (!checked.ok) return form(formId, f.business, f.healthcare, q, values, checked.error);
  try {
    const posts = checked.lead.postRef ? (await loadPublishing(f.s, f.orgId)).posts : [];
    await captureLead(f.s, f.orgId, f.state, checked.lead, posts, new Date(now));
  } catch (e) {
    if (e instanceof LeadLimitError) return page('Please try later', `<div class="card"><h1>Please try again later</h1><p>${esc(f.business)} has had a lot of enquiries in a short time. Please try again in a while or contact them directly.</p></div>`, 429);
    throw e;
  }
  return thanks(f.business, checked.lead.name);
}

export const GET = handle((request) => showForm(request, store()));
export const POST = handle((request) => submitForm(request, store()));
