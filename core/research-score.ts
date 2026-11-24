// Scoring a researched lead from its research, with no agent run (no model, no tokens). It follows the Lead
// Scorer's rubric so the two read the same: ICP fit 0 to 40, deal size 0 to 20, ease of win 0 to 20,
// reachability 0 to 10, momentum 0 to 10, and every point comes from the lead list or the research report.
// A score never replaces one already on the deal. Pure, so the browser and the server work it out the same way.
import type { BusinessResearch, ProposalDraft } from './research-state.js';
import type { LeadScore } from './leadgen-state.js';
import { companyKey } from './research-map.js';

/** Who scores a lead from its research (shown as the scorer on the deal and in its history). */
export const RESEARCH_SCORER = 'Research import';
/** A lead scoring this or more is worth working now (the same line the Lead Scorer uses for outreach). */
export const WORK_NOW_SCORE = 60;

export interface ScoreInput {
  name: string; company: string; phone: string; email: string;
  niche?: string; city?: string; dealTier?: string; ease?: string;
}
const TIER: Record<string, number> = { High: 20, Medium: 12, Low: 6 };
const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`;

export function scoreFromResearch(c: ScoreInput, r: Pick<BusinessResearch, 'pains' | 'opportunities' | 'found'>, proposal?: Pick<ProposalDraft, 'roi'> | null): { score: number; reasons: string } {
  const pains = r.pains.length;
  const opps = r.opportunities.length;
  const has = (field: string) => r.found.some((f) => f.field === field);

  const fit = Math.min(40, (c.niche || c.city ? 10 : 4) + 6 * Math.min(3, pains) + 4 * Math.min(3, opps));
  const fitWhy = `${plural(pains, 'pain point')} and ${opps} ${opps === 1 ? 'opportunity' : 'opportunities'} in the research${c.niche ? `, ${c.niche}` : ''}`;

  let size = c.dealTier && TIER[c.dealTier] ? TIER[c.dealTier] : 8;
  let sizeWhy = c.dealTier ? `deal tier ${c.dealTier}` : 'no deal tier on the list';
  if (proposal && proposal.roi.netMonthly <= 0) {
    size = Math.min(size, 4);
    sizeWhy += ', but the proposal draft shows no net gain for them';
  }

  const ease = c.ease && TIER[c.ease] ? TIER[c.ease] : Math.min(16, 4 * pains);
  const easeWhy = c.ease ? `ease of win ${c.ease}` : `${plural(pains, 'gap')} we would fix`;

  const named = (!!c.name && companyKey(c.name) !== companyKey(c.company)) || has('owner');
  const phone = !!c.phone || has('phone');
  const email = !!c.email || has('email');
  const reach = (named ? 4 : 0) + (phone ? 3 : 0) + (email ? 3 : 0);
  const reachWhy = [named && 'named decision maker', phone && 'phone', email && 'email'].filter(Boolean).join(', ') || 'no named contact, phone or email yet';

  const momentum = proposal ? 3 : 0;
  const momentumWhy = proposal ? 'proposal draft ready, not sent' : 'not contacted yet';

  let score = Math.max(0, Math.min(100, fit + size + ease + reach + momentum));
  // A proposal that loses them money is not one to send: the lead stays in Qualify until the offer is reworked.
  const losing = !!proposal && proposal.roi.netMonthly <= 0 && score >= WORK_NOW_SCORE;
  if (losing) score = WORK_NOW_SCORE - 1;
  const reasons = `Scored from the research, with no agent run. Fit ${fit}/40: ${fitWhy}. Size ${size}/20: ${sizeWhy}. Ease ${ease}/20: ${easeWhy}. Reach ${reach}/10: ${reachWhy}. Momentum ${momentum}/10: ${momentumWhy}.${losing ? ` Held at ${WORK_NOW_SCORE - 1} because the proposal draft shows no net gain for them: rework the offer before sending it.` : ''}`;
  return { score, reasons: reasons.slice(0, 1200) };
}

/** What the research has done across the CRM so far: the impact the owner sees above the import. */
export interface ResearchImpact {
  /** Leads with a research report, and how many of those came from a research file. */
  researched: number; imported: number;
  /** Found details copied onto customers, and proposal drafts on deals. */
  detailsCopied: number; proposals: number;
  /** Leads scored from the research (no agent run), and how many of those are worth working now. */
  scored: number; workNow: number;
  /** Researched leads still waiting to be scored and moved on. */
  waiting: number;
  /** Agent runs the research made unnecessary: research, scoring and proposal writing. */
  agentRunsSaved: number;
}
interface ImpactContact {
  stage: string;
  researchReport?: Pick<BusinessResearch, 'found' | 'importKey'> | null;
  proposal?: Pick<ProposalDraft, 'importKey'> | null;
  leadScore?: Pick<LeadScore, 'score' | 'by'> | null;
}
export function researchImpact(contacts: ImpactContact[]): ResearchImpact {
  const out: ResearchImpact = { researched: 0, imported: 0, detailsCopied: 0, proposals: 0, scored: 0, workNow: 0, waiting: 0, agentRunsSaved: 0 };
  for (const c of contacts) {
    const r = c.researchReport;
    if (r) {
      out.researched++;
      if (r.importKey) out.imported++;
      out.detailsCopied += r.found.filter((f) => f.usedAt).length;
      if (!c.leadScore && c.stage === 'lead') out.waiting++;
    }
    if (c.proposal) out.proposals++;
    if (c.leadScore?.by === RESEARCH_SCORER) {
      out.scored++;
      if (c.leadScore.score >= WORK_NOW_SCORE) out.workNow++;
    }
    out.agentRunsSaved += (r?.importKey ? 1 : 0) + (c.proposal?.importKey ? 1 : 0) + (c.leadScore?.by === RESEARCH_SCORER ? 1 : 0);
  }
  return out;
}
