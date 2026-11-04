// The founder's raise for the signed-in business (any member, not admin-only).
// GET  /api/raise → round, investor pipeline (with compliance warnings), crowdfunding campaign, steps, sources.
// POST /api/raise { action, ... }:
//   round { round }                    → set the round terms
//   investor { investor }              → add or edit an investor
//   stage { investorId, stage, amount? } → move an investor through the pipeline
//   remove { investorId }              → remove an investor
//   import { csv }                     → add investors from CSV rows
//   campaign { campaign }              → set the Reg CF campaign
//   complete | reopen { step }         → mark a raise step done (hard dependencies enforced) or reopen it
import {
  completeRaiseStep, importInvestors, loadRaise, RAISE_SOURCES, removeInvestor, reopenRaiseStep, setCampaign, setInvestorStage, setRound, upsertInvestor,
  type Campaign, type InvestorInput, type InvestorStage, type Round,
} from '../../core/raise.js';
import { handle, HttpError, json, readJson, requireUser } from '../context.js';

export const GET = handle(async (request) => {
  const { orgId, store } = await requireUser(request);
  return json({ raise: await loadRaise(store, orgId), sources: RAISE_SOURCES });
});

interface Body { action?: string; round?: Round; investor?: InvestorInput; investorId?: string; stage?: InvestorStage; amount?: number | string; csv?: string; campaign?: Campaign; step?: string }

export const POST = handle(async (request) => {
  const { orgId, label, store } = await requireUser(request);
  const b = await readJson<Body>(request, 100_000);
  const id = String(b.investorId ?? '');
  try {
    switch (b.action) {
      case 'round': return json({ raise: await setRound(store, orgId, b.round ?? ({} as Round), label) });
      case 'investor': await upsertInvestor(store, orgId, b.investor ?? ({} as InvestorInput), label); break;
      case 'stage': return json({ raise: await setInvestorStage(store, orgId, id, b.stage as InvestorStage, label, b.amount === undefined || b.amount === '' ? undefined : Number(String(b.amount).replace(/[,$\s]/g, ''))) });
      case 'remove': await removeInvestor(store, orgId, id, label); break;
      case 'import': return json({ ...(await importInvestors(store, orgId, String(b.csv ?? ''), label)), raise: await loadRaise(store, orgId) });
      case 'campaign': return json({ raise: await setCampaign(store, orgId, b.campaign ?? ({} as Campaign), label) });
      case 'complete': return json({ raise: await completeRaiseStep(store, orgId, String(b.step ?? ''), label) });
      case 'reopen': return json({ raise: await reopenRaiseStep(store, orgId, String(b.step ?? ''), label) });
      default: throw new HttpError(400, 'Unknown action');
    }
  } catch (e) {
    if (e instanceof HttpError) throw e;
    throw new HttpError(400, e instanceof Error ? e.message : 'Could not update the raise');
  }
  return json({ raise: await loadRaise(store, orgId) });
});
