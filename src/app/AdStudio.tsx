// Ad studio on the Marketing tab: queue image and short-video ad briefs (by hand or with the Ad Creative Producer),
// see what the studio made with Viewmax, and approve or reject each one. Approving only marks an ad ready to publish;
// nothing is posted or spent from here. The SIXXAB admin also sees the studio queue across businesses and saves results.
import React, { useState } from 'react';
import { api } from '../lib/auth';
import type { Creative, CreativesState, StudioJob } from '../../core/creatives';
import { Fold } from './Fold';
import { Spinner } from './ui';
import { AgentRun } from './AgentRun';

const FORMATS: [string, string][] = [['4:5', 'Feed, 4:5'], ['1:1', 'Square, 1:1'], ['9:16', 'Reels and Stories, 9:16'], ['16:9', 'Wide, 16:9']];
const CTAS = ['Book now', 'Call now', 'Get a quote', 'Send a message', 'Learn more', 'Shop now'];
const MEDIA = /^https:\/\/media\.viewmax\.io\/[^?#]+\.(jpe?g|png|webp|mp4|mov|webm)$/i;
const STATUS: Record<Creative['status'], string> = { queued: 'waiting for the studio', made: 'ready for your yes', approved: 'approved', rejected: 'rejected', failed: 'could not be made' };
const blank = { kind: 'image', format: '4:5', brief: '', headline: '', primaryText: '', cta: 'Book now' };

interface Props { creatives: CreativesState; goal: string; admin: boolean; studio: StudioJob[] | null; reload: () => void; goApprovals: () => void }

export function AdStudio({ creatives, goal, admin, studio, reload, goApprovals }: Props) {
  const [draft, setDraft] = useState(blank);
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [links, setLinks] = useState<Record<string, string>>({});
  const a = creatives.allowance;
  const unlimited = a.images >= 9999;

  async function post(key: string, body: Record<string, unknown>, after?: () => void) {
    setBusy(key); setMsg(null);
    try {
      await api('/api/marketing', { method: 'POST', body: JSON.stringify(body) });
      after?.();
      reload();
    } catch (e) { setMsg(e instanceof Error ? e.message : 'Could not update the ad studio.'); } finally { setBusy(null); }
  }

  const set = (k: keyof typeof blank, v: string) => setDraft({ ...draft, [k]: v, ...(k === 'kind' ? { format: v === 'video' ? '9:16' : '4:5' } : {}) });
  const hint = !a.planName ? 'pick a plan to start'
    : unlimited ? `${creatives.creatives.length} made or queued` : `${a.usedImages}/${a.images} images · ${a.usedVideos}/${a.videos} videos this month`;

  return (
    <Fold id="mk-studio" title="Ad studio" hint={hint} open={creatives.awaiting > 0}>
      <p className="muted small">Single-image and short-video ads, made with Viewmax from a brief. Each one waits for your yes here, and approving it only marks it ready for publishing.</p>
      {msg && <p className="error" role="alert">{msg}</p>}
      {!a.planName ? <p className="muted small">Ads come out of your plan's monthly images and videos, so pick a plan below first.</p> : (
        <>
          <p className="muted small">{unlimited ? 'No monthly limit on the SIXXAB admin workspace.' : `This month: ${a.usedImages} of ${a.images} images and ${a.usedVideos} of ${a.videos} videos on the ${a.planName} plan.`}</p>
          <AgentRun agentId="ad-creative-producer" goal={goal} label="Have the agent write this week's ads" emptyText="This month's images and videos are all queued. More come on the 1st." goApprovals={goApprovals} onDone={reload} />
          <details className="mk-brief">
            <summary>Write an ad brief yourself</summary>
            <div className="grid2">
              <label className="field"><span>Kind</span>
                <select value={draft.kind} onChange={(e) => set('kind', e.target.value)}><option value="image">Image</option><option value="video">Video, 8 seconds</option></select>
              </label>
              <label className="field"><span>Shape</span>
                <select value={draft.format} onChange={(e) => set('format', e.target.value)}>{FORMATS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select>
              </label>
              <label className="field mk-wide"><span>What's in it<span className="muted small"> · who, what happens, the setting and mood</span></span>
                <textarea rows={3} maxLength={1200} value={draft.brief} onChange={(e) => set('brief', e.target.value)} />
              </label>
              <label className="field"><span>Headline<span className="muted small"> · up to 8 words</span></span><input maxLength={60} value={draft.headline} onChange={(e) => set('headline', e.target.value)} /></label>
              <label className="field"><span>Button</span><select value={draft.cta} onChange={(e) => set('cta', e.target.value)}>{CTAS.map((c) => <option key={c}>{c}</option>)}</select></label>
              <label className="field mk-wide"><span>Ad text<span className="muted small"> · one or two sentences</span></span><textarea rows={2} maxLength={300} value={draft.primaryText} onChange={(e) => set('primaryText', e.target.value)} /></label>
            </div>
            <div className="row-end">
              <button type="button" className="btn-primary" disabled={!!busy || draft.brief.trim().length < 10} onClick={() => post('request', { action: 'request_creative', creative: draft }, () => setDraft(blank))}>
                {busy === 'request' ? <Spinner label="Queuing…" /> : 'Queue for the studio'}
              </button>
            </div>
          </details>
        </>
      )}

      {creatives.creatives.length > 0 && (
        <div className="mk-creatives">
          {creatives.creatives.map((c) => (
            <div key={c.id} className={`mk-creative ${c.status}`}>
              {MEDIA.test(c.mediaUrl) ? (c.kind === 'video'
                ? <video src={c.mediaUrl} controls muted playsInline preload="metadata" />
                : <img src={c.mediaUrl} alt={c.headline || 'Ad image'} loading="lazy" />)
                : <div className="mk-media-empty">{c.status === 'failed' ? c.failReason || 'The studio could not make this ad.' : 'The studio makes this next.'}</div>}
              <p className="eyebrow">{c.kind === 'video' ? 'Video' : 'Image'} · {c.format} · {STATUS[c.status]}</p>
              {c.headline && <strong>{c.headline}</strong>}
              {c.primaryText && <p className="small">{c.primaryText}</p>}
              <p className="muted small">{c.cta}{c.credits ? ` · ${c.credits} credits` : ''}</p>
              {(c.status === 'made' || c.status === 'approved' || c.status === 'rejected') && (
                <div className="row-end">
                  {c.status !== 'approved' && <button type="button" className="btn-primary" disabled={!!busy} onClick={() => post(`d:${c.id}`, { action: 'decide_creative', id: c.id, decision: 'approved' })}>Approve</button>}
                  {c.status !== 'rejected' && <button type="button" className="btn-ghost" disabled={!!busy} onClick={() => post(`d:${c.id}`, { action: 'decide_creative', id: c.id, decision: 'rejected' })}>Reject</button>}
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {admin && studio && (
        <div className="mk-studio-queue">
          <h3>Studio queue <span className="muted small">· {studio.length} waiting across businesses</span></h3>
          {studio.length === 0 ? <p className="muted small">Nothing waiting. Queued ads from any business show here for the studio run.</p> : (
            <ul className="mk-pays">
              {studio.map((j) => (
                <li key={j.id} className="stack-sm">
                  <span><strong>{j.business}</strong> <span className="muted small">· {j.kind} · {j.format} · {j.headline || j.brief.slice(0, 60)}</span></span>
                  <span className="muted small">{j.brief}</span>
                  <div className="row-end">
                    <input aria-label="Finished Viewmax link" placeholder="https://media.viewmax.io/…" value={links[j.id] ?? ''} onChange={(e) => setLinks({ ...links, [j.id]: e.target.value })} />
                    <button type="button" className="btn-primary" disabled={!!busy || !MEDIA.test((links[j.id] ?? '').trim())} onClick={() => post(`s:${j.id}`, { action: 'studio_save', orgId: j.orgId, id: j.id, mediaUrl: (links[j.id] ?? '').trim(), credits: j.kind === 'video' ? 15 : 2, model: j.kind === 'video' ? 'Kling 3.0 Turbo' : 'Nano Banana 2' })}>Save</button>
                    <button type="button" className="btn-ghost" disabled={!!busy} onClick={() => post(`s:${j.id}`, { action: 'studio_fail', orgId: j.orgId, id: j.id, reason: 'The studio could not make this one. Try a simpler brief.' })}>Couldn't make it</button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </Fold>
  );
}
