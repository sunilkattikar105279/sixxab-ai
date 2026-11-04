// Shared types and calls for the Raise tab.
import { api } from '../lib/auth';

export interface InvestorView {
  id: string; name: string; firm: string; email: string; type: string; relationship: string; accredited: string;
  nextStep: string; notes: string; stage: string; amount: number; canEmail: boolean; warnings: string[];
}
export interface RaiseState {
  round: { name: string; instrument: string; exemption: string; target: number; cap?: number; preMoney?: number; discount?: number; minCheck?: number } | null;
  investors: InvestorView[];
  campaign: { channel: string; stage: string; url?: string; goal?: number; pledged?: number; backers?: number; deadline?: string; deliverBy?: string; tiers?: { name: string; price: number; limit?: number; reward: string }[] } | null;
  steps: { id: string; track: string; title: string; summary: string; agentId: string | null; owner: string; status: 'done' | 'ready' | 'blocked'; blockedBy: string[]; goal: string }[];
  pipeline: Record<string, number>;
  totals: { target: number; committed: number; funded: number; preorders: number; pctCommitted: number; dilutionPct: number | null; postMoney: number | null };
}
export interface Source { id: string; name: string; kind: string; status: string; url: string; use: string }

export const usd = (n: number) => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(n);
export async function raiseAction(body: Record<string, unknown>) {
  return api<{ raise: RaiseState; added?: number; skipped?: number }>('/api/raise', { method: 'POST', body: JSON.stringify(body) });
}

