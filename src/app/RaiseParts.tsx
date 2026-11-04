// Raise tab parts: investor pipeline (add, import, move through stages), the founding-member pre-order campaign and sources.
import React, { useState } from 'react';
import { Spinner } from './ui';
import { raiseAction, usd, type InvestorView, type RaiseState, type Source } from './raiseApi';

const STAGES = ['target', 'contacted', 'meeting', 'diligence', 'committed', 'signed', 'funded', 'passed'];
const TYPES: [string, string][] = [['angel', 'Angel'], ['syndicate', 'Syndicate'], ['vc', 'VC fund'], ['accelerator', 'Accelerator'], ['strategic', 'Strategic'], ['family', 'Friends & family']];
const blank = { name: '', firm: '', email: '', type: 'angel', relationship: '', accredited: 'unknown' };

export function Investors({ investors, pipeline, onChange }: { investors: InvestorView[]; pipeline: Record<string, number>; onChange: () => void }) {
  const [f, setF] = useState(blank);
  const [csv, setCsv] = useState('');
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);

  async function run(key: string, body: Record<string, unknown>, after?: () => void) {
    setBusy(key);
    setMsg(null);
    try {
      const out = await raiseAction(body);
      if (out.added !== undefined) setMsg(`Imported ${out.added}${out.skipped ? `, skipped ${out.skipped} row${out.skipped === 1 ? '' : 's'}` : ''}.`);
      after?.();
      onChange();
    } catch (e) {
      setMsg(e instanceof Error ? e.message : 'Could not update the pipeline.');
    } finally {
      setBusy(null);
    }
  }

  return (
    <section className="panel glass-card">
      <p className="eyebrow">Investor pipeline</p>
      <h2>Who you’re talking to</h2>
      <p className="muted small">{STAGES.filter((s) => pipeline[s]).map((s) => `${pipeline[s]} ${s}`).join(' · ') || 'No investors yet. Start with people you already know.'}</p>
      <form className="form" onSubmit={(e) => { e.preventDefault(); void run('add', { action: 'investor', investor: f }, () => setF(blank)); }}>
        <div className="grid3">
          <label className="field"><span>Name</span><input value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} maxLength={120} required /></label>
          <label className="field"><span>Firm</span><input value={f.firm} onChange={(e) => setF({ ...f, firm: e.target.value })} maxLength={120} /></label>
          <label className="field"><span>Email</span><input type="email" value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} maxLength={200} /></label>
          <label className="field"><span>Type</span><select value={f.type} onChange={(e) => setF({ ...f, type: e.target.value })}>{TYPES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select></label>
          <label className="field"><span>How you know them</span><input value={f.relationship} onChange={(e) => setF({ ...f, relationship: e.target.value })} placeholder="e.g. former colleague, intro from Ravi" maxLength={200} /></label>
          <label className="field"><span>Accredited</span><select value={f.accredited} onChange={(e) => setF({ ...f, accredited: e.target.value })}><option value="unknown">Not known</option><option value="self-certified">Says so</option><option value="verified">Verified</option></select></label>
        </div>
        <div className="row-end"><button type="submit" className="btn-primary" disabled={!!busy || !f.name.trim()}>{busy === 'add' ? <Spinner label="Adding…" /> : 'Add investor'}</button></div>
      </form>

      {investors.length > 0 && (
        <div className="table-wrap">
          <table>
            <thead><tr><th>Investor</th><th>Stage</th><th>Amount</th><th /></tr></thead>
            <tbody>{investors.map((i) => <InvestorRow key={i.id} i={i} busy={busy} run={run} />)}</tbody>
          </table>
        </div>
      )}

      <details className="head-group">
        <summary>Import a list <span className="muted small">CSV from Crunchbase, Signal, AngelList or your contacts</span></summary>
        <label className="field"><span>One investor per line: name, firm, email, type, how you know them</span>
          <textarea rows={5} value={csv} onChange={(e) => setCsv(e.target.value)} placeholder={'name,firm,email,type,relationship\nAsha Rao,,asha@example.com,angel,Former colleague'} /></label>
        <div className="row-end"><button type="button" className="btn-ghost" disabled={!!busy || !csv.trim()} onClick={() => run('import', { action: 'import', csv }, () => setCsv(''))}>{busy === 'import' ? <Spinner label="Importing…" /> : 'Import'}</button></div>
      </details>
      {msg && <p className={/^Imported/.test(msg) ? 'muted small' : 'error'} role="status">{msg}</p>}
    </section>
  );
}

function InvestorRow({ i, busy, run }: { i: InvestorView; busy: string | null; run: (key: string, body: Record<string, unknown>) => Promise<void> }) {
  const [stage, setStage] = useState(i.stage);
  const [amount, setAmount] = useState(i.amount ? String(i.amount) : '');
  const changed = stage !== i.stage || amount !== (i.amount ? String(i.amount) : '');
  return (
    <tr>
      <td>
        <strong>{i.name}</strong>{i.firm && <span className="muted"> · {i.firm}</span>}
        <div className="muted small">{i.type}{i.relationship ? ` · ${i.relationship}` : ''}{i.email ? ` · ${i.canEmail ? 'can email' : 'no outreach yet'}` : ''}</div>
        {i.warnings.length > 0 && <ul className="warnings">{i.warnings.map((w) => <li key={w}>{w}</li>)}</ul>}
      </td>
      <td><select aria-label={`Stage for ${i.name}`} value={stage} onChange={(e) => setStage(e.target.value)}>{STAGES.map((s) => <option key={s}>{s}</option>)}</select></td>
      <td><input aria-label={`Amount for ${i.name}`} inputMode="numeric" size={9} value={amount} onChange={(e) => setAmount(e.target.value.replace(/[^\d]/g, ''))} placeholder="0" /></td>
      <td className="nowrap">
        <button type="button" className="btn-mini" disabled={!!busy || !changed} onClick={() => run(i.id, { action: 'stage', investorId: i.id, stage, amount })}>Save</button>
        <button type="button" className="btn-mini" disabled={!!busy} onClick={() => run(i.id, { action: 'remove', investorId: i.id })}>Remove</button>
      </td>
    </tr>
  );
}

type TierForm = { name: string; price: string; limit: string; reward: string };
const EMPTY_TIER: TierForm = { name: '', price: '', limit: '', reward: '' };
const CHANNELS = ['Own page (Stripe link)', 'Own page (Razorpay link)', 'Kickstarter', 'Indiegogo'];
const STAGE_LABEL: Record<string, string> = { planning: 'Planning', prelaunch: 'Pre-launch', live: 'Live', fulfilling: 'Delivering', closed: 'Closed', cancelled: 'Cancelled' };

/** Founding-member pre-orders: customers pay for the product in advance. A sale, never equity. */
export function Campaign({ campaign, onChange }: { campaign: RaiseState['campaign']; onChange: () => void }) {
  const [f, setF] = useState({
    channel: campaign?.channel ?? CHANNELS[0], stage: campaign?.stage ?? 'planning', url: campaign?.url ?? '',
    deadline: campaign?.deadline ?? '', deliverBy: campaign?.deliverBy ?? '',
    goal: campaign?.goal ? String(campaign.goal) : '', pledged: campaign?.pledged ? String(campaign.pledged) : '', backers: campaign?.backers ? String(campaign.backers) : '',
  });
  const [tiers, setTiers] = useState<TierForm[]>(
    campaign?.tiers?.length ? campaign.tiers.map((t) => ({ name: t.name, price: String(t.price), limit: t.limit ? String(t.limit) : '', reward: t.reward })) : [{ ...EMPTY_TIER }],
  );
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const num = (v: string) => v.replace(/[^\d]/g, '');
  const setTier = (i: number, patch: Partial<TierForm>) => setTiers(tiers.map((t, j) => (j === i ? { ...t, ...patch } : t)));

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setMsg(null);
    try {
      const filled = tiers.filter((t) => t.name.trim() || t.reward.trim() || t.price);
      await raiseAction({ action: 'campaign', campaign: { ...f, tiers: filled.map((t) => ({ name: t.name, reward: t.reward, price: t.price, limit: t.limit || undefined })) } });
      setMsg('Saved.');
      onChange();
    } catch (err) {
      setMsg(err instanceof Error ? err.message : 'Could not save the campaign.');
    } finally {
      setBusy(false);
    }
  }

  const pct = campaign?.goal && campaign.pledged ? Math.round((campaign.pledged / campaign.goal) * 100) : 0;
  return (
    <section className="panel glass-card">
      <p className="eyebrow">Crowdfunding · founding-member pre-orders</p>
      <h2>{campaign ? `Founding members: ${STAGE_LABEL[campaign.stage] ?? campaign.stage}` : 'Founding-member campaign'}</h2>
      <p className="muted small">Customers pay now for the product at a founding price, with a delivery date you promise. It is a sale, not an investment: backers get the product, never shares. Take payment on Stripe, Razorpay, Kickstarter or Indiegogo, then record the numbers here.</p>
      {campaign?.goal ? <div className="complete"><div className="complete-bar" aria-hidden="true"><span style={{ width: `${Math.min(100, pct)}%` }} /></div><span className="muted small">{usd(campaign.pledged ?? 0)} from {campaign.backers ?? 0} backers · {pct}% of {usd(campaign.goal)}</span></div> : null}
      <form className="form" onSubmit={save}>
        <div className="grid3">
          <label className="field"><span>Where people pay</span><select value={f.channel} onChange={(e) => setF({ ...f, channel: e.target.value })}>{CHANNELS.map((c) => <option key={c}>{c}</option>)}</select></label>
          <label className="field"><span>Stage</span><select value={f.stage} onChange={(e) => setF({ ...f, stage: e.target.value })}>{Object.entries(STAGE_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></label>
          <label className="field"><span>Payment or campaign page</span><input type="url" value={f.url} onChange={(e) => setF({ ...f, url: e.target.value })} placeholder="https://buy.stripe.com/…" /></label>
          <label className="field"><span>Goal (USD)</span><input inputMode="numeric" value={f.goal} onChange={(e) => setF({ ...f, goal: num(e.target.value) })} /></label>
          <label className="field"><span>Pre-sold (USD) / backers</span><span className="grid2"><input aria-label="Pre-sold" inputMode="numeric" value={f.pledged} onChange={(e) => setF({ ...f, pledged: num(e.target.value) })} /><input aria-label="Number of backers" inputMode="numeric" value={f.backers} onChange={(e) => setF({ ...f, backers: num(e.target.value) })} /></span></label>
          <label className="field"><span>Ends / delivery promised by</span><span className="grid2"><input aria-label="Campaign ends" type="date" value={f.deadline} onChange={(e) => setF({ ...f, deadline: e.target.value })} /><input aria-label="Delivery promised by" type="date" value={f.deliverBy} onChange={(e) => setF({ ...f, deliverBy: e.target.value })} /></span></label>
        </div>
        <h3>Tiers</h3>
        {tiers.map((t, i) => (
          <div key={i} className="grid3">
            <label className="field"><span>Tier name</span><input value={t.name} onChange={(e) => setTier(i, { name: e.target.value })} placeholder="Founding member" maxLength={60} /></label>
            <label className="field"><span>Price (USD) / spots</span><span className="grid2"><input aria-label={`Tier ${i + 1} price`} inputMode="numeric" value={t.price} onChange={(e) => setTier(i, { price: num(e.target.value) })} /><input aria-label={`Tier ${i + 1} spots`} inputMode="numeric" value={t.limit} onChange={(e) => setTier(i, { limit: num(e.target.value) })} placeholder="no limit" /></span></label>
            <label className="field"><span>What the backer gets</span><input value={t.reward} onChange={(e) => setTier(i, { reward: e.target.value })} placeholder="3 months of the Founder plan at launch" maxLength={300} /></label>
          </div>
        ))}
        <div className="row-end">
          {tiers.length < 6 && <button type="button" className="btn-ghost" onClick={() => setTiers([...tiers, { ...EMPTY_TIER }])}>Add tier</button>}
          {tiers.length > 1 && <button type="button" className="btn-ghost" onClick={() => setTiers(tiers.slice(0, -1))}>Remove last tier</button>}
          {msg && <span className={msg === 'Saved.' ? 'muted small' : 'error'} role="status">{msg}</span>}
          <button type="submit" className="btn-primary" disabled={busy}>{busy ? <Spinner label="Saving…" /> : 'Save campaign'}</button>
        </div>
      </form>
    </section>
  );
}

export function Sources({ sources }: { sources: Source[] }) {
  return (
    <section className="panel glass-card">
      <p className="eyebrow">Integrations</p>
      <h2>Investors, payments and paperwork</h2>
      <ul className="checks">
        {sources.map((s) => (
          <li key={s.id}>
            <span className={`dot ${s.status === 'live' ? 'dot-green' : 'dot-off'}`} aria-hidden="true" />
            <strong>{s.url ? <a href={s.url} target="_blank" rel="noopener noreferrer">{s.name}</a> : s.name}</strong>
            <span className="muted small">{s.kind} · {s.use}{s.status === 'live' ? ' · connected' : ''}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}
