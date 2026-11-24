// Lead generation agents' actions on the CRM: save ICPs, propose prospects for the owner's yes, score
// leads, save outreach sequences and objection answers as drafts on the deal, and keep records in sync.
// Every write is a crm.* audit event, so each one shows in the deal's history. Nothing here sends anything.
import { newId, nowIso, type Store } from './store.js';
import { addNewContact, DEAL_STAGES, loadCrm, upsertContact, type Contact, type ContactInput, type CrmState } from './crm.js';
import { MEDDIC } from './gtm.js';
import {
  cleanIcp, cleanProspect, cleanSteps, gradeFor, ICP_NOTES_MAX, text, type Icp, type Prospect, type SequenceStep,
} from './leadgen-state.js';

const record = (store: Store, orgId: string, by: string, action: string, detail: Record<string, unknown>) =>
  store.audit({ id: newId(), orgId, at: nowIso(), actor: by, action, taskId: null, detail });

async function dealOf(store: Store, orgId: string, contactId: unknown): Promise<{ crm: CrmState; c: Contact }> {
  const crm = await loadCrm(store, orgId);
  const c = crm.contacts.find((x) => x.id === String(contactId ?? '').trim());
  if (!c) throw new Error(`No deal with id "${String(contactId ?? '')}" in the CRM. Use read_crm to find the right id.`);
  return { crm, c };
}

const label = (c: Contact) => c.company || c.name;
const domainOf = (w: string) => w.toLowerCase().replace(/^https?:\/\//, '').replace(/^www\./, '').replace(/\/.*$/, '');

// ---- ICP Builder ----

/** Saves (or updates, when the id exists) an ideal customer profile. */
export async function saveIcp(store: Store, orgId: string, input: Record<string, unknown>, by: string): Promise<Icp> {
  const crm = await loadCrm(store, orgId);
  const wanted = text(input.id, 64);
  const prev = crm.icps.find((i) => i.id === wanted) ?? crm.icps.find((i) => i.name.toLowerCase() === text(input.name, 80).toLowerCase());
  const icp = { id: prev?.id ?? newId(), ...cleanIcp(input) };
  await record(store, orgId, by, 'crm.icp', { icp, summary: `${prev ? 'ICP updated' : 'ICP saved'}: ${icp.name}` });
  return { ...icp, createdAt: prev?.createdAt ?? nowIso(), updatedAt: nowIso(), by };
}

export async function removeIcp(store: Store, orgId: string, icpId: string, by: string): Promise<void> {
  const icp = (await loadCrm(store, orgId)).icps.find((i) => i.id === icpId);
  if (!icp) throw new Error('ICP not found');
  await record(store, orgId, by, 'crm.icp_removed', { icpId, summary: `ICP removed: ${icp.name}` });
}

/** Keeps what the owner wrote or uploaded about who they sell to (for example the lead sheet's ICP tab). */
export async function saveIcpNotes(store: Store, orgId: string, notes: string, by: string): Promise<void> {
  const t = String(notes ?? '').trim().slice(0, ICP_NOTES_MAX);
  await record(store, orgId, by, 'crm.icp_notes', { text: t, summary: t ? `ICP notes saved (${t.length} characters)` : 'ICP notes cleared' });
}

// ---- Prospect Generator ----

/** Saves businesses found for an ICP as a batch waiting for the owner's yes; anyone already in the CRM is left out. */
export async function proposeProspects(store: Store, orgId: string, icpId: string | null, items: unknown, by: string): Promise<{ kept: number; skipped: string[] }> {
  const crm = await loadCrm(store, orgId);
  const icp = icpId ? crm.icps.find((i) => i.id === icpId) ?? null : null;
  const known = new Set<string>();
  for (const c of crm.contacts) { if (c.company) known.add(`c:${c.company.toLowerCase().trim()}`); if (c.website) known.add(`w:${domainOf(c.website)}`); }
  for (const b of crm.prospectBatches) for (const p of b.items) if (p.status === 'pending') { known.add(`c:${p.company.toLowerCase()}`); if (p.website) known.add(`w:${p.website}`); }
  const kept: Prospect[] = [];
  const skipped: string[] = [];
  for (const [n, raw] of (Array.isArray(items) ? items : []).slice(0, 25).entries()) {
    try {
      const p = cleanProspect((raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>, `p${n + 1}`);
      const keys = [`c:${p.company.toLowerCase()}`, p.website && `w:${p.website}`].filter(Boolean) as string[];
      if (keys.some((k) => known.has(k))) { skipped.push(`${p.company} (already in the CRM or waiting)`); continue; }
      keys.forEach((k) => known.add(k));
      kept.push(p);
    } catch (e) {
      skipped.push(e instanceof Error ? e.message : 'a row could not be read');
    }
  }
  if (!kept.length) return { kept: 0, skipped };
  const batch = { id: newId(), icpId: icp?.id ?? null, icpName: icp?.name ?? '', items: kept };
  await record(store, orgId, by, 'crm.prospects', { batch, summary: `${kept.length} prospects found${icp ? ` for ${icp.name}` : ''}, waiting for your yes` });
  return { kept: kept.length, skipped };
}

function prospectToContact(p: Prospect, icpName: string): ContactInput {
  return {
    name: p.name || p.company, company: p.company, title: p.title, email: p.email, phone: p.phone, website: p.website,
    city: p.city, niche: p.niche, size: p.size, source: 'web-search', sourceDetail: p.sourcePage, checkFirst: p.checkFirst,
    whyFit: [p.whyFit, p.signal && `Signal: ${p.signal}`].filter(Boolean).join(' '), notes: icpName ? `Matches ICP: ${icpName}` : '',
  };
}

/** The owner's decision on a batch: chosen businesses become New leads, the rest can be dismissed. */
export async function decideProspects(store: Store, orgId: string, batchId: string, addKeys: string[], dismissKeys: string[], by: string): Promise<{ added: number; dismissed: number }> {
  const crm = await loadCrm(store, orgId);
  const batch = crm.prospectBatches.find((b) => b.id === batchId);
  if (!batch) throw new Error('Those prospects were already decided or are no longer available');
  const add = new Set(Array.isArray(addKeys) ? addKeys.map(String) : []);
  const dismiss = new Set(Array.isArray(dismissKeys) ? dismissKeys.map(String) : []);
  const added: { key: string; contactId: string }[] = [];
  const dismissed: string[] = [];
  for (const p of batch.items.filter((x) => x.status === 'pending')) {
    if (add.has(p.key)) {
      try {
        const contactId = await addNewContact(store, orgId, prospectToContact(p, batch.icpName), by, `Lead from the Prospect Generator: ${p.company}`);
        added.push({ key: p.key, contactId });
      } catch {
        dismissed.push(p.key); // a row the CRM cannot take is set aside rather than offered again
      }
    } else if (dismiss.has(p.key)) dismissed.push(p.key);
  }
  if (added.length || dismissed.length) await record(store, orgId, by, 'crm.prospects_decided', { batchId, added, dismissed, summary: `Prospects: ${added.length} added to New lead, ${dismissed.length} dismissed` });
  return { added: added.length, dismissed: dismissed.length };
}

// ---- Lead Scorer ----

export async function saveLeadScore(store: Store, orgId: string, contactId: unknown, score: unknown, reasons: unknown, icpId: unknown, by: string): Promise<string> {
  const { crm, c } = await dealOf(store, orgId, contactId);
  const n = Math.round(Number(score));
  if (!Number.isFinite(n) || n < 0 || n > 100) throw new Error('score must be a whole number from 0 to 100');
  const why = text(reasons, 1200);
  if (!why) throw new Error('Give the reasons for the score');
  const icp = crm.icps.find((i) => i.id === text(icpId, 64));
  await record(store, orgId, by, 'crm.leadscore', { contactId: c.id, score: { score: n, grade: gradeFor(n), reasons: why, icpId: icp?.id ?? null }, summary: `${label(c)}: lead score ${n} (${gradeFor(n)})` });
  return `Saved lead score ${n} (${gradeFor(n)}) on ${label(c)}`;
}

// ---- Outreach Sequencer ----

export async function saveSequence(store: Store, orgId: string, contactId: unknown, steps: unknown, notes: unknown, by: string): Promise<string> {
  const { c } = await dealOf(store, orgId, contactId);
  const clean: SequenceStep[] = cleanSteps(steps);
  await record(store, orgId, by, 'crm.sequence', { contactId: c.id, sequence: { id: newId(), steps: clean, notes: text(notes, 1000) }, summary: `${label(c)}: outreach sequence drafted (${clean.length} steps, not sent)` });
  return `Saved a ${clean.length}-step outreach sequence on ${label(c)} as drafts. Nothing was sent.`;
}

/** The owner sent a step themselves: it is marked sent, logged as a touch, and a new lead moves to Contacted. */
export async function markStepSent(store: Store, orgId: string, contactId: string, index: number, by: string): Promise<void> {
  const { c } = await dealOf(store, orgId, contactId);
  const step = c.sequence?.steps[index];
  if (!c.sequence || !step) throw new Error('That outreach step was not found');
  if (step.sentAt) throw new Error('That step is already marked as sent');
  await record(store, orgId, by, 'crm.sequence_step', { contactId: c.id, sequenceId: c.sequence.id, index, summary: `${label(c)}: outreach step ${index + 1} sent` });
  const what = step.channel === 'email' ? `Sent outreach email${step.subject ? `: ${step.subject}` : ''}` : step.channel === 'linkedin' ? 'Sent the LinkedIn message from the sequence' : step.channel === 'call' ? 'Made the outreach call from the sequence' : 'Sent the text message from the sequence';
  await record(store, orgId, by, 'crm.touch', { contactId: c.id, kind: step.channel, note: `${what} (step ${index + 1} of ${c.sequence.steps.length})`, summary: `Touched base with ${c.name}` });
  if (c.stage === 'lead') await record(store, orgId, 'crm-sync', 'crm.stage', { contactId: c.id, stage: 'contacted', summary: `${c.name}: contacted (first outreach step sent)` });
}

// ---- Objection Handler ----

export async function saveObjection(store: Store, orgId: string, contactId: unknown, objection: unknown, responses: unknown, blocker: unknown, by: string): Promise<string> {
  const { c } = await dealOf(store, orgId, contactId);
  const o = text(objection, 500);
  if (!o) throw new Error('Say which objection this answers');
  const list = (Array.isArray(responses) ? responses : [responses]).map((r) => text(r, 2000)).filter(Boolean).slice(0, 3);
  if (!list.length) throw new Error('Give at least one answer to the objection');
  await record(store, orgId, by, 'crm.objection', { contactId: c.id, play: { objection: o, responses: list, blocker: text(blocker, 500) }, summary: `${label(c)}: objection answers saved` });
  return `Saved ${list.length} answer${list.length === 1 ? '' : 's'} to "${o.slice(0, 60)}" on ${label(c)}`;
}

// ---- CRM Sync ----

const FILLABLE = ['niche', 'city', 'website', 'size', 'title', 'phone', 'email', 'nextStep', 'painPoints', 'offer', 'angle'] as const;

/** Fills empty fields from what the record already says, and suggests a stage; never overwrites, deletes or moves a deal. */
export async function syncDeal(store: Store, orgId: string, input: Record<string, unknown>, by: string): Promise<string> {
  const { c } = await dealOf(store, orgId, input.contactId);
  const reason = text(input.reason, 500);
  if (!reason) throw new Error('Say what was inconsistent and why');
  const fill = (input.fill && typeof input.fill === 'object' ? input.fill : {}) as Record<string, unknown>;
  if (input.nextStep) fill.nextStep = input.nextStep;
  const filled: string[] = [];
  const patch: Record<string, unknown> = {};
  const cur = c as unknown as Record<string, unknown>;
  for (const k of FILLABLE) {
    const v = text(fill[k], 500);
    if (v && !text(cur[k], 10)) { patch[k] = v; filled.push(k); }
  }
  if (filled.length) {
    try {
      await upsertContact(store, orgId, { ...c, ...patch, id: c.id } as ContactInput, by, `Contact updated by CRM Sync: ${c.name}`);
    } catch (e) {
      throw new Error(`Could not fill ${filled.join(', ')}: ${e instanceof Error ? e.message : 'invalid value'}`);
    }
  }
  const stage = text(input.suggestStage, 20).toLowerCase();
  const suggestStage = (DEAL_STAGES as readonly string[]).includes(stage) && stage !== c.stage ? stage : '';
  await record(store, orgId, by, 'crm.sync', { contactId: c.id, filled, suggestStage, reason, summary: `CRM Sync on ${label(c)}` });
  return `CRM Sync on ${label(c)}: ${filled.length ? `filled ${filled.join(', ')}` : 'no fields changed'}${suggestStage ? `; suggested moving to ${suggestStage} (the owner decides)` : ''}.`;
}

export async function dismissSync(store: Store, orgId: string, contactId: string, by: string): Promise<void> {
  const { c } = await dealOf(store, orgId, contactId);
  await record(store, orgId, by, 'crm.sync', { contactId: c.id, dismiss: true, summary: `CRM Sync suggestion dismissed for ${label(c)}` });
}

/** CRM Sync for every agent run on a deal: what the agent did lands in the deal's history. */
export async function logAgentRun(store: Store, orgId: string, contactId: string, agentName: string, status: string, output: string | null, queued: number): Promise<boolean> {
  const c = (await loadCrm(store, orgId)).contacts.find((x) => x.id === contactId);
  if (!c) return false;
  const gist = (output ?? '').replace(/\s+/g, ' ').trim().slice(0, 600);
  const note = `${agentName} ${status === 'done' ? 'finished' : status}${queued ? `; ${queued} message${queued === 1 ? '' : 's'} waiting for your approval` : ''}${gist ? `. ${gist}` : ''}`;
  await record(store, orgId, agentName, 'crm.note', { contactId: c.id, kind: 'agent', note, summary: `Agent work on ${label(c)}` });
  return true;
}

// ---- What agents read: read_crm ----

const cut = (s: string | undefined, n: number) => (s ? s.replace(/\s+/g, ' ').trim().slice(0, n) : '');
const READ_MAX = 24000;

function dealRow(c: Contact): string {
  const reach = [c.email && 'email', c.phone && 'phone'].filter(Boolean).join('+') || 'no contact info';
  return `- id ${c.id} | ${label(c)}${c.name && c.name !== c.company ? ` (${c.name}${c.title ? `, ${c.title}` : ''})` : ''} | ${[c.niche, c.city, c.size].filter(Boolean).join(' · ') || 'no research'} | stage ${c.stage} | deal ${c.dealTier || '?'} / ease ${c.ease || '?'}${c.rank ? ` | rank ${c.rank}` : ''} | ${reach}${c.leadScore ? ` | score ${c.leadScore.score} ${c.leadScore.grade}` : ''}${c.sequence ? ' | sequence drafted' : ''}${c.whyFit ? ` | why: ${cut(c.whyFit, 160)}` : ''}`;
}

function dealFull(c: Contact): string {
  const m = c.meddic;
  return [
    `Deal id ${c.id}: ${label(c)}; stage ${c.stage}; source ${c.source}${c.sourceDetail ? ` (${c.sourceDetail})` : ''}`,
    `Decision maker: ${c.name !== c.company ? c.name : 'not stated'}${c.title ? `, ${c.title}` : ''}`,
    [c.niche && `Niche: ${c.niche}`, c.city && `City: ${c.city}`, c.website && `Website: ${c.website}`, c.size && `Size: ${c.size}`, c.phone && `Phone: ${c.phone}`, c.email && `Email: ${c.email}`, c.value && `Value: ${c.value}`, c.dealTier && `Deal size: ${c.dealTier}`, c.ease && `Ease of win: ${c.ease}`, c.rank && `Rank: ${c.rank}`].filter(Boolean).join('; '),
    c.whyFit && `Why they fit: ${cut(c.whyFit, 1000)}`, c.painPoints && `Pain points: ${cut(c.painPoints, 1000)}`, c.offer && `Our offer: ${cut(c.offer, 500)}`,
    c.angle && `Outreach angle: ${cut(c.angle, 500)}`, c.pitch && `Agent to pitch: ${cut(c.pitch, 300)}`, c.checkFirst && `Check before outreach: ${cut(c.checkFirst, 300)}`,
    c.research && `Research notes: ${cut(c.research, 3000)}`, c.notes && `Other notes: ${cut(c.notes, 1000)}`, c.nextStep && `Next step: ${c.nextStep}`,
    `Last touch: ${c.lastTouch ?? 'never'}`,
    m ? `MEDDIC: ${MEDDIC.map((e) => `${e.name} ${m[e.key]}`).join('; ')}` : 'MEDDIC: not qualified yet',
    c.callNotes && `Latest call notes: ${cut(c.callNotes, 1500)}`,
    c.leadScore && `Lead score: ${c.leadScore.score} (${c.leadScore.grade}) — ${cut(c.leadScore.reasons, 400)}`,
    c.sequence && `Outreach sequence: ${c.sequence.steps.map((s, i) => `step ${i + 1} day ${s.day} ${s.channel}${s.sentAt ? ' (sent)' : ''}`).join(', ')}`,
    c.objections.length ? `Objections answered: ${c.objections.map((o) => `"${cut(o.objection, 100)}"`).join('; ')}` : '',
    ...customerLines(c),
    `History (newest first):\n${c.history.slice(0, 15).map((h) => `  ${h.at.slice(0, 10)} ${h.kind}: ${cut(h.text, 200)}`).join('\n') || '  none'}`,
  ].filter(Boolean).join('\n');
}

/** What an agent needs to know about a customer after the win: onboarding progress and the latest account review. */
function customerLines(c: Contact): string[] {
  const cf = c.customer;
  if (!cf || c.stage !== 'won') return [];
  const o = cf.onboarding;
  const r = cf.review;
  return [
    `Customer since: ${cf.wonAt ? cf.wonAt.slice(0, 10) : 'unknown'}`,
    o ? `Onboarding plan (${o.at.slice(0, 10)}): ${o.steps.map((s) => `day ${s.day} ${cut(s.title, 80)} [${s.owner}]${s.doneAt ? ' done' : ''}`).join('; ')}${o.welcome ? `; welcome email ${cf.sent.some((x) => x.kind === 'welcome' && x.ref === o.id) ? 'sent' : 'not sent yet'}` : ''}` : 'Onboarding plan: none yet',
    r ? `Last account review (${r.at.slice(0, 10)}): health ${r.health} (${r.band}); ${cut(r.reasons, 400)}${r.risks ? `; risks: ${cut(r.risks, 300)}` : ''}${r.renewalDate ? `; renewal ${r.renewalDate}` : ''}` : 'Account review: none yet',
    cf.sent.length ? `Customer messages sent: ${cf.sent.map((x) => `${x.kind} ${x.at.slice(0, 10)}`).join(', ')}` : '',
  ].filter(Boolean);
}

function icpFull(i: Icp): string {
  return [`ICP id ${i.id}: ${i.name}`, `Summary: ${i.summary}`, i.industries && `Industries: ${i.industries}`, i.locations && `Locations: ${i.locations}`, i.size && `Size: ${i.size}`, i.buyer && `Buyer: ${i.buyer}`, i.pains && `Pains: ${i.pains}`, i.signals && `Buying signals: ${i.signals}`, i.disqualifiers && `Disqualifiers: ${i.disqualifiers}`, i.offer && `Offer: ${i.offer}`, i.valueCase && `Why it pays: ${i.valueCase}`, i.voice && `Voice: ${i.voice}`].filter(Boolean).join('\n');
}

export const READ_VIEWS = ['pipeline', 'deal', 'deals', 'icps', 'icp_notes', 'existing', 'issues'] as const;

/** Text views of the CRM for agents: the pipeline, one or several deals in full, the ICPs, the owner's ICP notes, who is already in, and what is inconsistent. */
export async function readCrm(store: Store, orgId: string, view: string, contactId?: unknown, contactIds?: unknown): Promise<string> {
  const crm = await loadCrm(store, orgId);
  let out: string;
  switch (view) {
    case 'deal': {
      const c = crm.contacts.find((x) => x.id === String(contactId ?? ''));
      out = c ? dealFull(c) : `No deal with id "${String(contactId ?? '')}". Read the pipeline view for ids.`;
      break;
    }
    case 'deals': {
      const ids = (Array.isArray(contactIds) ? contactIds : [contactId]).map((x) => String(x ?? '').trim()).filter(Boolean).slice(0, 12);
      const found = ids.map((id) => crm.contacts.find((x) => x.id === id));
      out = ids.length ? found.map((c, n) => (c ? dealFull(c) : `No deal with id "${ids[n]}".`)).join('\n\n---\n\n') : 'Pass contactIds (up to 12 deal ids).';
      break;
    }
    case 'icps': out = crm.icps.length ? crm.icps.map(icpFull).join('\n\n') : 'No ICP saved yet.'; break;
    case 'icp_notes': out = crm.icpNotes?.text ? `The owner's ICP notes (saved ${crm.icpNotes.at.slice(0, 10)}):\n${crm.icpNotes.text}` : 'The owner has not added ICP notes.'; break;
    case 'existing': {
      const pending = crm.prospectBatches.flatMap((b) => b.items.filter((p) => p.status === 'pending'));
      out = `Already in the CRM (${crm.contacts.length}):\n${crm.contacts.map((c) => `- ${label(c)}${c.website ? ` (${c.website})` : ''}`).join('\n') || '- none'}\nWaiting for the owner's yes (${pending.length}):\n${pending.map((p) => `- ${p.company}${p.website ? ` (${p.website})` : ''}`).join('\n') || '- none'}`;
      break;
    }
    case 'issues': out = crm.issues.length ? crm.issues.map((i) => `- id ${i.contactId} | ${i.name}: ${i.issue}`).join('\n') : 'No inconsistent records found.'; break;
    default: {
      const won = crm.contacts.filter((c) => c.stage === 'won').length;
      out = `Pipeline: ${crm.contacts.length} deals (${crm.totals.open} open, ${won} won, ${crm.pipeline.lost} lost).\n${crm.contacts.slice(0, 80).map(dealRow).join('\n') || 'No deals yet.'}`;
    }
  }
  return out.slice(0, READ_MAX);
}

// ---- Goals handed to each agent ----

export function icpGoal(crm: { icps: unknown[]; contacts: unknown[] }): string {
  const update = crm.icps.length ? ` ${crm.icps.length} ICP${crm.icps.length === 1 ? ' is' : 's are'} saved already: update them by passing their id rather than adding near-duplicates.` : '';
  return `Build this business's ideal customer profiles (ICPs). Read the owner's ICP notes (read_crm view "icp_notes"), the current pipeline (view "pipeline", ${crm.contacts.length} deals) and any saved ICPs (view "icps").${update} Where the owner's notes define who to sell to, keep their segments and wording. Save one to three ICPs with save_icp, one call each: a short name, a summary, industries, locations, company size, the buyer who decides, their pains, the buying signals that show a good fit, disqualifiers, the offer to lead with, why it pays for them, and voice: how the owner writes to these buyers (tone, length, sign-off), taken from any sample emails in the notes. Never invent statistics or results. Finish with a two-line summary of the ICPs.`;
}

export function prospectGoal(icp: Pick<Icp, 'id' | 'name'> | null, query: string, count: number): string {
  const n = Math.min(Math.max(Math.round(count) || 10, 3), 20);
  const target = icp ? `that match the ICP "${icp.name}" (read it with read_crm view "icps"; its id is ${icp.id})` : `that match: "${query.slice(0, 300)}"`;
  return `Find up to ${n} businesses ${target}. First read who is already in the CRM (read_crm view "existing") and skip them. Use web search on public business pages. For each business: name, decision maker and title only if a page states them, niche, city, website, public business phone, public business email only if published, size, why it fits, the buying signal you saw, the page you found it on, and anything to check before outreach; leave a field empty when it is not published. Then call propose_prospects once with all of them${icp ? ` and icpId ${icp.id}` : ''}; the owner picks which ones become leads.`;
}

/** Scores the given deals (or every open deal without a score). */
export function scoreGoal(ids: string[]): string {
  return `Score ${ids.length === 1 ? 'this lead' : `these ${ids.length} leads`} from 0 to 100. Read the ICPs (read_crm view "icps") and the deals (view "deals" with contactIds). Use this rubric and show the parts in the reasons: ICP fit 0 to 40 (industry, size, location, buyer); deal size 0 to 20 (value of one customer to them, our deal tier); ease of win 0 to 20 (a visible gap we fix, such as after-hours calls or a contact-form booking); reachability 0 to 10 (named decision maker, phone or email); momentum 0 to 10 (stage, recent touches, MEDDIC). Base every point on what the record says; when something is unknown, score it low and say so. Call save_lead_score once per deal with the score and two or three short reasons; you may call it for several deals in the same turn.\nDeal ids: ${ids.join(', ')}`;
}

export function sequenceGoal(ids: string[]): string {
  return `Draft a personal outreach sequence for ${ids.length === 1 ? 'this deal' : `each of these ${ids.length} deals`}. Read the deals (read_crm view "deals" with contactIds) and the ICPs (view "icps") for the voice to write in. Four or five steps over about 14 days, for example: day 0 email, day 2 LinkedIn connection note (under 300 characters), day 5 short follow-up email, day 9 call opener for the owner to say, day 14 polite last email. Write as the owner in the first person, short and plain, about their business: name the specific gap from our research and one clear ask (a 15-minute call or a short demo). Respect "Check before outreach"; if a fact must be checked first, say so in the notes. No invented results, customers, prices or discounts: write [PRICE] or [OFFER] where needed, and [First name] when the decision maker is unknown. Call save_sequence once per deal (several in one turn is fine); these are drafts the owner sends themselves, nothing is sent.\nDeal ids: ${ids.join(', ')}`;
}

export function syncGoal(issueCount: number): string {
  return `Check the CRM for records that disagree with themselves and fix what the records already answer. Read the issues (read_crm view "issues", ${issueCount} found), then up to 10 of those deals in full (view "deals" with contactIds). Use sync_deal once per deal (several in one turn is fine): fill an empty field only when the record's own research, notes or history states the value (never guess a phone, email or name); set a next step when an open deal has none; suggest a stage when the history shows the deal has moved (the owner decides). For duplicates, say which record to keep in the reason. Never delete or merge anything. Finish with a short summary of what you fixed and what needs the owner.`;
}

/** CRM Sync on one deal, from its customer page. */
export function syncDealGoal(id: string): string {
  return `Check one CRM deal for fields and stages that disagree with its own record (deal id ${id}). Read it with read_crm view "deal" (contactId ${id}). Then call sync_deal once: fill an empty field only when the record's own research, notes or history states the value (never guess a phone, email or name), set a next step if it is open and has none, and suggest a stage only when the history shows the deal has moved (the owner decides). If nothing needs fixing, say so and do not call sync_deal.`;
}

/** The deals the batch buttons work on: best leads first (score, then rank). */
type PickView = { id: string; stage: string; rank?: number | null; leadScore?: { score: number } | null; sequence?: unknown };
export function pickDeals(contacts: PickView[], want: 'unscored' | 'no_sequence', max: number): string[] {
  const open = contacts.filter((c) => !['won', 'lost'].includes(c.stage));
  const list = want === 'unscored' ? open.filter((c) => !c.leadScore) : open.filter((c) => !c.sequence && c.stage === 'lead');
  return list
    .sort((a, b) => (b.leadScore?.score ?? -1) - (a.leadScore?.score ?? -1) || (a.rank ?? 1e6) - (b.rank ?? 1e6))
    .slice(0, max)
    .map((c) => c.id);
}
