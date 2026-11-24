// Results on the Marketing tab: what was made and posted, the leads it brought into the CRM, what each lead cost against
// the most a lead can cost, and the wins. Also the business's public lead form (links to copy for bios, posts, the
// website and paid ads) and the Ads Manager agent's paid ads plan, which the owner sets up in each platform's ads tool.
import React, { useState } from 'react';
import { api } from '../lib/auth';
import type { Dashboard } from '../../core/leads';
import type { AdsPlan } from '../../core/ads';
import type { Creative } from '../../core/creatives';
import { Fold } from './Fold';
import { Spinner } from './ui';
import { AgentRun, money } from './AgentRun';

export interface LeadFormView { id: string; on: boolean; url: string }
type Platforms = Record<string, { label: string; source: string; tool: string }>;

// Mirrors LEAD_SOURCES in core/leads.ts: where a lead form link is shared.
const SHARE: { s: string; label: string }[] = [
  { s: 'instagram', label: 'Instagram bio' }, { s: 'tiktok', label: 'TikTok bio' }, { s: 'facebook', label: 'Facebook Page' },
  { s: 'linkedin', label: 'LinkedIn' }, { s: 'google', label: 'Google Business Profile' }, { s: 'site', label: 'Your website' },
  { s: 'email', label: 'Email signature' }, { s: 'qr', label: 'QR code or flyer' },
];
const STAGE: Record<string, string> = { lead: 'New', contacted: 'Contacted', qualified: 'Qualified', proposal: 'Proposal', won: 'Won', lost: 'Lost' };
const ago = (iso: string) => {
  const h = (Date.now() - Date.parse(iso)) / 3_600_000;
  return h < 1 ? `${Math.max(1, Math.round(h * 60))} min ago` : h < 48 ? `${Math.round(h)} h ago` : new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
};

interface Props {
  dashboard: Dashboard; leadForm: LeadFormView | null; adsPlan: AdsPlan | null; platforms: Platforms; creatives: Creative[];
  adsGoal: string; adBudget: number; reload: () => void; goApprovals: () => void;
}

export function Results({ dashboard: d, leadForm, adsPlan, platforms, creatives, adsGoal, adBudget, reload, goApprovals }: Props) {
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [copied, setCopied] = useState<string | null>(null);
  const [share, setShare] = useState('instagram');
  const c = d.currency;
  const f = d.funnel;
  const trend = d.leadsPrev30 ? Math.round(((d.leads30 - d.leadsPrev30) / d.leadsPrev30) * 100) : null;
  const over = d.cpl !== null && d.ceiling !== null && d.cpl > d.ceiling;

  async function change(to: 'off' | 'on' | 'new') {
    if (to === 'new' && !window.confirm('Give the form a new link? Links already in posts, bios and ads stop working.')) return;
    setBusy(to); setMsg(null);
    try { await api('/api/marketing', { method: 'POST', body: JSON.stringify({ action: 'lead_form', change: to }) }); reload(); }
    catch (e) { setMsg(e instanceof Error ? e.message : 'Could not change the form.'); } finally { setBusy(null); }
  }

  async function copy(text: string, key: string) {
    try { await navigator.clipboard.writeText(text); setCopied(key); setTimeout(() => setCopied(null), 2000); }
    catch { setMsg('Copy did not work here. Select the link and copy it instead.'); }
  }

  const link = (s: string, paid = false) => (leadForm ? `${leadForm.url}?s=${s}${paid ? '&m=paid' : ''}` : '');
  const headline = (id: string) => { const x = creatives.find((k) => k.id === id); return x ? x.headline || x.brief.slice(0, 40) : 'an ad no longer approved'; };

  return (
    <>
      <Fold id="mk-results" title="Results" hint={`${d.leads30} lead${d.leads30 === 1 ? '' : 's'} in 30 days${d.cpl !== null ? ` · ${money(d.cpl, c)} each` : ''}`} open>
        <div className="cost-tiles">
          <div><span className="muted small">Leads, last 30 days</span><strong>{d.leads30}</strong><span className="muted small">{d.target ? `goal ${d.target} a month` : trend === null ? `${d.leadsMonth} this month` : `${trend >= 0 ? 'up' : 'down'} ${Math.abs(trend)}% on the 30 before`}</span></div>
          <div><span className="muted small">Cost per lead</span><strong className={over ? 'mk-over' : undefined}>{d.cpl === null ? '—' : money(d.cpl, c)}</strong><span className="muted small">{d.ceiling === null ? 'add your average sale to the assessment' : `stay under ${money(d.ceiling, c)}`}</span></div>
          <div><span className="muted small">Won from these leads</span><strong>{f.won}</strong><span className="muted small">{f.wonValue ? money(f.wonValue, c) : 'no value yet'}</span></div>
          <div><span className="muted small">Spend a month</span><strong>{d.spend.total ? money(d.spend.total, c) : '—'}</strong><span className="muted small">plan {money(d.spend.plan, c)} + ads {money(d.spend.ads, c)}</span></div>
        </div>
        {over && <p className="notice">Leads cost more than you can afford right now. Put more of the budget behind the ad that brings the most leads, or post more often.</p>}
        {d.weekly && d.weekly.some((w) => w.leads > 0) && (
          <>
            <h3 className="mk-sub">New leads a week</h3>
            <ol className="mk-trend" aria-label="New leads in each of the last 8 weeks">
              {d.weekly.map((w) => {
                const top = Math.max(...d.weekly.map((x) => x.leads), 1);
                const label = new Date(`${w.start}T00:00:00Z`).toLocaleDateString(undefined, { month: 'short', day: 'numeric', timeZone: 'UTC' });
                return (
                  <li key={w.start} aria-label={`Week of ${label}: ${w.leads} lead${w.leads === 1 ? '' : 's'}${w.won ? `, ${w.won} won` : ''}`}>
                    <span className="small">{w.leads}</span>
                    <span className={w.leads ? 'bar' : 'bar zero'} style={w.leads ? { height: `${Math.round((w.leads / top) * 84)}px` } : undefined} />
                    <span className="muted small">{label}</span>
                  </li>
                );
              })}
            </ol>
          </>
        )}
        <ol className="mk-funnel" aria-label="From ads to wins">
          {[['Ads made', f.made], ['Approved', f.approved], ['Posts out', f.posted], ['Leads', f.leads], ['Qualified', f.qualified], ['Won', f.won]].map(([label, n]) => (
            <li key={label as string}><strong>{n}</strong><span className="muted small">{label}</span></li>
          ))}
        </ol>
        {d.bySource.length > 0 && (
          <ul className="mk-pays">
            {d.bySource.map((r) => <li key={r.source}><span>{r.label}</span><span className="muted small">{r.leads} lead{r.leads === 1 ? '' : 's'}{r.won ? ` · ${r.won} won` : ''}</span></li>)}
          </ul>
        )}
        {d.recent.length > 0 ? (
          <>
            <h3 className="mk-sub">Latest enquiries</h3>
            <ul className="mk-pays">
              {d.recent.map((r, i) => <li key={`${r.contactId}-${i}`}><span><strong>{r.name}</strong> <span className="muted small">· {r.label}{r.repeat ? ' · asked again' : ''}</span></span><span className="muted small">{r.stage ? STAGE[r.stage] : ''} · {ago(r.at)}</span></li>)}
            </ul>
            <p className="muted small">Each one is a deal in your CRM with where it came from. Reply within 5 minutes where you can: the Speed-to-Lead agent drafts the reply for your yes.</p>
          </>
        ) : <p className="muted small">No enquiries yet. Share your lead form link below; every enquiry becomes a deal in your CRM.</p>}
      </Fold>

      <Fold id="mk-leadform" title="Lead form" hint={!leadForm ? 'not set up' : leadForm.on ? 'on' : 'off'}>
        {msg && <p className="error" role="alert">{msg}</p>}
        {!leadForm ? <p className="muted small">Your lead form is made the next time this tab loads.</p> : (
          <>
            <p className="muted small">One short form for your business. Each link says where the person found you, so the lead lands in your CRM with its source. Posts on Facebook, LinkedIn, X, Threads and Google get the link added for you.</p>
            {!leadForm.on && <p className="notice">The form is off: people who open a link see that it isn't available.</p>}
            <div className="mk-link">
              <label className="field"><span>Where you'll share it</span>
                <select value={share} onChange={(e) => setShare(e.target.value)}>{SHARE.map((x) => <option key={x.s} value={x.s}>{x.label}</option>)}</select>
              </label>
              <code>{link(share)}</code>
              <button type="button" className="btn-ghost" onClick={() => copy(link(share), share)}>{copied === share ? 'Copied' : 'Copy link'}</button>
            </div>
            <div className="row-end">
              <a className="btn-ghost" href={link('direct')} target="_blank" rel="noopener noreferrer">Open the form</a>
              <button type="button" className="btn-ghost" disabled={!!busy} onClick={() => change(leadForm.on ? 'off' : 'on')}>{busy === 'off' || busy === 'on' ? <Spinner label="Saving…" /> : leadForm.on ? 'Turn off' : 'Turn on'}</button>
              <button type="button" className="btn-ghost" disabled={!!busy} onClick={() => change('new')}>{busy === 'new' ? <Spinner label="Saving…" /> : 'New link'}</button>
            </div>
          </>
        )}
      </Fold>

      <Fold id="mk-ads" title="Paid ads plan" hint={adsPlan ? `${adsPlan.campaigns.length} campaign${adsPlan.campaigns.length === 1 ? '' : 's'} · ${money(adsPlan.total, c)} of ${money(adsPlan.budget, c)}` : adBudget ? 'not planned yet' : 'no ad budget set'}>
        <p className="muted small">The Ads Manager agent plans where your ad budget goes. Nothing is launched or paid from here: you set each campaign up in the platform's own ads tool, with the lead link shown, so its leads land in your CRM marked as paid.</p>
        {adsPlan && (
          <>
            {adsPlan.summary && <p>{adsPlan.summary}</p>}
            <ul className="mk-posts">
              {adsPlan.campaigns.map((k, i) => {
                const p = platforms[k.platform];
                const url = link(p?.source ?? k.platform, true);
                return (
                  <li key={i} className="mk-post">
                    <p><strong>{p?.label ?? k.platform}</strong> <span className="muted small">· {k.objective} · {money(k.dailyBudget, c)} a day for {k.days} days = {money(k.total, c)}</span></p>
                    {k.audience && <p className="small">Audience: {k.audience}</p>}
                    {k.creativeIds.length > 0 && <p className="small">Ads: {k.creativeIds.map(headline).join('; ')}</p>}
                    {k.why && <p className="muted small">{k.why}</p>}
                    {leadForm && <div className="mk-link"><code>{url}</code><button type="button" className="btn-ghost" onClick={() => copy(url, `ad${i}`)}>{copied === `ad${i}` ? 'Copied' : 'Copy lead link'}</button></div>}
                    <p className="muted small">Set it up in {p?.tool ?? 'the platform\'s ads tool'} and use the lead link as the ad's website.</p>
                  </li>
                );
              })}
            </ul>
            <p className="muted small">Planned {new Date(adsPlan.at).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })} by {adsPlan.by}.</p>
          </>
        )}
        <AgentRun agentId="ads-manager" goal={adsGoal} label={adsPlan ? 'Plan again' : 'Have the Ads Manager plan it'} emptyText={adBudget ? 'Approve at least one ad in the ad studio, then the Ads Manager plans your campaigns.' : 'Add a monthly ad budget to the assessment, then the Ads Manager plans your campaigns.'} goApprovals={goApprovals} onDone={reload} />
      </Fold>
    </>
  );
}
