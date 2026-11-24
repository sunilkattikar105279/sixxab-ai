// Social publishing on the Marketing tab: approved ads become draft posts, one per network (by hand or with the Social
// Publisher agent), and the owner publishes each draft now or at a time they pick. Each Publish press is the owner's yes
// for that one post; nothing goes out otherwise. The SIXXAB admin links each business to its social accounts in the
// publishing service (an Ayrshare profile, or Postiz channels).
import React, { useMemo, useState } from 'react';
import { api } from '../lib/auth';
import type { Creative } from '../../core/creatives';
import type { Network, PublicLink, PublishingState, PublishSetup, SocialPost } from '../../core/publishing';
import { Fold } from './Fold';
import { Spinner } from './ui';
import { AgentRun } from './AgentRun';

// Mirrors NETWORKS in core/publishing.ts (kept here so the browser bundle takes no server code).
const NET: Record<Network, { label: string; max: number; image: boolean; video: boolean; ayrshare: boolean; postiz: string[] }> = {
  instagram: { label: 'Instagram', max: 2200, image: true, video: true, ayrshare: true, postiz: ['instagram', 'instagram-standalone'] },
  facebook: { label: 'Facebook Page', max: 5000, image: true, video: true, ayrshare: true, postiz: ['facebook'] },
  tiktok: { label: 'TikTok', max: 2200, image: false, video: true, ayrshare: true, postiz: ['tiktok'] },
  linkedin: { label: 'LinkedIn', max: 3000, image: true, video: true, ayrshare: true, postiz: ['linkedin', 'linkedin-page'] },
  x: { label: 'X', max: 280, image: true, video: true, ayrshare: false, postiz: ['x'] },
  youtube: { label: 'YouTube Shorts', max: 5000, image: false, video: true, ayrshare: true, postiz: ['youtube'] },
  threads: { label: 'Threads', max: 500, image: true, video: true, ayrshare: true, postiz: ['threads'] },
  google: { label: 'Google Business Profile', max: 1500, image: true, video: false, ayrshare: true, postiz: ['gmb'] },
};
const IDS = Object.keys(NET) as Network[];
const fits = (n: Network, kind: Creative['kind']) => (kind === 'video' ? NET[n].video : NET[n].image);
const when = (iso: string) => new Date(iso).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
const caption = (c: Creative) => [c.headline, c.primaryText, c.cta].filter(Boolean).join('\n\n');

interface BusinessLink { orgId: string; name: string; link: PublicLink | null }
interface Channel { id: string; name: string; identifier: string; profile: string; customer: string; disabled: boolean }
interface Props {
  publishing: PublishingState; setup: PublishSetup; linked: Network[]; creatives: Creative[]; goal: string;
  admin: BusinessLink[] | null; reload: () => void; goApprovals: () => void;
}

export function Publishing({ publishing, setup, linked, creatives, goal, admin, reload, goApprovals }: Props) {
  const approved = creatives.filter((c) => c.status === 'approved');
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [adId, setAdId] = useState('');
  const [nets, setNets] = useState<Network[]>([]);
  const [text, setText] = useState('');
  const [times, setTimes] = useState<Record<string, string>>({});
  const ad = approved.find((c) => c.id === adId) ?? null;
  const limit = nets.length ? Math.min(...nets.map((n) => NET[n].max)) : 0;

  async function post(key: string, body: Record<string, unknown>, after?: () => void) {
    setBusy(key); setMsg(null); setNotice(null);
    try {
      await api('/api/marketing', { method: 'POST', body: JSON.stringify(body) });
      after?.();
      reload();
    } catch (e) { setMsg(e instanceof Error ? e.message : 'Could not update publishing.'); reload(); } finally { setBusy(null); }
  }

  function pickAd(id: string) {
    setAdId(id);
    const c = approved.find((x) => x.id === id);
    setText(c ? caption(c) : '');
    setNets((c ? nets.filter((n) => fits(n, c.kind)) : []));
  }

  function publish(p: SocialPost) {
    const raw = times[p.id];
    const at = raw ? new Date(raw) : null;
    const ask = at ? `Schedule this ${NET[p.network].label} post for ${when(at.toISOString())}? It will go out publicly on your account then.` : `Publish this ${NET[p.network].label} post now? It goes out publicly on your account.`;
    if (!window.confirm(ask)) return;
    post(`p:${p.id}`, { action: 'publish_draft', id: p.id, ...(at ? { when: at.toISOString() } : {}) }, () => setNotice(at ? `Scheduled the ${NET[p.network].label} post.` : `Published the ${NET[p.network].label} post.`));
  }

  const hint = !setup.connected ? `${publishing.drafts} drafts · not connected yet` : `${publishing.drafts} drafts · ${publishing.sent} out${publishing.failed ? ` · ${publishing.failed} failed` : ''}`;

  return (
    <Fold id="mk-publish" title="Social publishing" hint={hint} open={publishing.drafts > 0 || publishing.failed > 0}>
      <p className="muted small">Approved ads become posts for each network. Every post waits for your Publish press, now or at a time you pick, and nothing goes out without it.</p>
      {!setup.connected ? <p className="notice">{setup.provider ? setup.note : 'Publishing to your social accounts isn\'t switched on yet. You can draft posts now; they wait here until it is.'}</p>
        : linked.length ? <p className="muted small">Linked: {linked.map((n) => NET[n].label).join(', ')}.</p>
          : <p className="notice">Your social accounts aren't linked yet. SIXXAB links them for you, and drafts wait here until then.</p>}
      {msg && <p className="error" role="alert">{msg}</p>}
      {notice && <p className="notice" role="status">{notice}</p>}

      {!approved.length ? <p className="muted small">Approve an ad in the ad studio above to start drafting posts.</p> : (
        <>
          <AgentRun agentId="social-publisher" goal={goal} label="Have the agent draft posts" emptyText="Every approved ad has drafts. Approve more ads in the ad studio." goApprovals={goApprovals} onDone={reload} />
          <details className="mk-brief">
            <summary>Draft a post yourself</summary>
            <div className="stack-sm">
              <label className="field"><span>Ad</span>
                <select value={adId} onChange={(e) => pickAd(e.target.value)}>
                  <option value="">Pick an approved ad</option>
                  {approved.map((c) => <option key={c.id} value={c.id}>{c.kind === 'video' ? 'Video' : 'Image'} · {c.headline || c.brief.slice(0, 50)}</option>)}
                </select>
              </label>
              {ad && (
                <>
                  <fieldset className="mk-nets">
                    <legend className="small">Networks</legend>
                    {IDS.filter((n) => fits(n, ad.kind)).map((n) => (
                      <label key={n} className="small"><input type="checkbox" checked={nets.includes(n)} onChange={(e) => setNets(e.target.checked ? [...nets, n] : nets.filter((x) => x !== n))} /> {NET[n].label}</label>
                    ))}
                  </fieldset>
                  <label className="field"><span>Caption{limit ? <span className="muted small"> · {text.length}/{limit}</span> : null}</span>
                    <textarea rows={5} value={text} onChange={(e) => setText(e.target.value)} />
                  </label>
                  <div className="row-end">
                    <button type="button" className="btn-primary" disabled={!!busy || !nets.length || !text.trim() || (limit > 0 && text.length > limit)}
                      onClick={() => post('draft', { action: 'draft_posts', creativeId: ad.id, networks: nets, text }, () => { setAdId(''); setNets([]); setText(''); })}>
                      {busy === 'draft' ? <Spinner label="Drafting…" /> : `Save ${nets.length > 1 ? `${nets.length} drafts` : 'draft'}`}
                    </button>
                  </div>
                </>
              )}
            </div>
          </details>
        </>
      )}

      {publishing.posts.length > 0 && (
        <ul className="mk-posts">
          {publishing.posts.map((p) => {
            const ready = setup.connected && linked.includes(p.network);
            return (
              <li key={p.id} className={`mk-post ${p.status}`}>
                <p className="eyebrow">{NET[p.network].label} · {p.kind} · {p.status === 'draft' ? 'draft, waiting for you' : p.status === 'failed' ? 'did not go out' : p.scheduledFor ? `scheduled for ${when(p.scheduledFor)}` : `published ${p.sentAt ? when(p.sentAt) : ''}`}</p>
                <p className="small mk-post-text">{p.text}</p>
                {p.status === 'failed' && <p className="error small">{p.error}</p>}
                {p.status === 'sent' && p.postUrl.startsWith('https://') && <a className="small" href={p.postUrl} target="_blank" rel="noreferrer noopener">View the post</a>}
                {(p.status === 'draft' || p.status === 'failed') && (
                  <div className="row-end">
                    <label className="small mk-when">Time (optional)
                      <input type="datetime-local" value={times[p.id] ?? ''} onChange={(e) => setTimes({ ...times, [p.id]: e.target.value })} disabled={!ready} />
                    </label>
                    <button type="button" className="btn-primary" disabled={!!busy || !ready} title={ready ? '' : 'Publishing for this network isn\'t linked yet'} onClick={() => publish(p)}>
                      {busy === `p:${p.id}` ? <Spinner label="Sending…" /> : times[p.id] ? 'Schedule' : p.status === 'failed' ? 'Try again' : 'Publish now'}
                    </button>
                    <button type="button" className="btn-ghost" disabled={!!busy} onClick={() => post(`x:${p.id}`, { action: 'discard_post', id: p.id })}>Discard</button>
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}

      {admin && <LinkAccounts setup={setup} businesses={admin} reload={reload} />}
    </Fold>
  );
}

/** Admin: link a business to its social accounts in the publishing service. */
function LinkAccounts({ setup, businesses, reload }: { setup: PublishSetup; businesses: BusinessLink[]; reload: () => void }) {
  const [orgId, setOrgId] = useState(businesses[0]?.orgId ?? '');
  const [profileKey, setProfileKey] = useState('');
  const [nets, setNets] = useState<Network[]>([]);
  const [channels, setChannels] = useState<Channel[] | null>(null);
  const [pick, setPick] = useState<Partial<Record<Network, string>>>({});
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const current = businesses.find((b) => b.orgId === orgId) ?? null;
  const byNet = useMemo(() => Object.fromEntries(IDS.map((n) => [n, (channels ?? []).filter((c) => !c.disabled && NET[n].postiz.includes(c.identifier))])) as Record<Network, Channel[]>, [channels]);

  async function call<T>(key: string, body: Record<string, unknown>): Promise<T | null> {
    setBusy(key); setMsg(null);
    try { return await api<T>('/api/marketing', { method: 'POST', body: JSON.stringify(body) }); } catch (e) { setMsg(e instanceof Error ? e.message : 'Could not update the link.'); return null; } finally { setBusy(null); }
  }

  async function save(link: unknown) {
    if (await call('save', { action: 'publishing_link', orgId, link })) { setProfileKey(''); setNets([]); setPick({}); reload(); }
  }

  function postizLink() {
    const chosen: Record<string, { id: string; identifier: string; name: string }> = {};
    for (const n of IDS) {
      const c = (channels ?? []).find((x) => x.id === pick[n]);
      if (c) chosen[n] = { id: c.id, identifier: c.identifier, name: c.name };
    }
    return { provider: 'postiz', channels: chosen };
  }

  return (
    <div className="mk-studio-queue">
      <h3>Link social accounts <span className="muted small">· SIXXAB admin</span></h3>
      {!setup.provider ? <p className="muted small">No publishing service is connected yet, so there is nothing to link to.</p> : (
        <div className="stack-sm">
          {msg && <p className="error" role="alert">{msg}</p>}
          <label className="field"><span>Business</span>
            <select value={orgId} onChange={(e) => setOrgId(e.target.value)}>{businesses.map((b) => <option key={b.orgId} value={b.orgId}>{b.name}</option>)}</select>
          </label>
          <p className="muted small">{current?.link ? `Linked through ${current.link.provider === 'ayrshare' ? 'Ayrshare' : 'Postiz'}: ${current.link.networks.map((n) => NET[n].label).join(', ')}.` : 'Not linked yet.'}</p>
          {setup.provider === 'ayrshare' ? (
            <>
              <label className="field"><span>Ayrshare profile key for this business</span>
                <input type="password" autoComplete="off" value={profileKey} onChange={(e) => setProfileKey(e.target.value)} />
              </label>
              <fieldset className="mk-nets">
                <legend className="small">Networks connected in that profile</legend>
                {IDS.filter((n) => NET[n].ayrshare).map((n) => (
                  <label key={n} className="small"><input type="checkbox" checked={nets.includes(n)} onChange={(e) => setNets(e.target.checked ? [...nets, n] : nets.filter((x) => x !== n))} /> {NET[n].label}</label>
                ))}
              </fieldset>
              <div className="row-end">
                {current?.link && <button type="button" className="btn-ghost" disabled={!!busy} onClick={() => save(null)}>Unlink</button>}
                <button type="button" className="btn-primary" disabled={!!busy || profileKey.trim().length < 8 || !nets.length} onClick={() => save({ provider: 'ayrshare', profileKey: profileKey.trim(), networks: nets })}>Save link</button>
              </div>
            </>
          ) : (
            <>
              <div className="row-end">
                <button type="button" className="btn-ghost" disabled={!!busy} onClick={async () => { const r = await call<{ channels: Channel[] }>('load', { action: 'publishing_channels' }); if (r) setChannels(r.channels); }}>
                  {busy === 'load' ? <Spinner label="Loading…" /> : channels ? 'Reload Postiz channels' : 'Load Postiz channels'}
                </button>
              </div>
              {channels && (
                <div className="grid2">
                  {IDS.filter((n) => byNet[n].length).map((n) => (
                    <label key={n} className="field"><span>{NET[n].label}</span>
                      <select value={pick[n] ?? ''} onChange={(e) => setPick({ ...pick, [n]: e.target.value })}>
                        <option value="">Not for this business</option>
                        {byNet[n].map((c) => <option key={c.id} value={c.id}>{c.name}{c.customer ? ` · ${c.customer}` : ''}</option>)}
                      </select>
                    </label>
                  ))}
                  {!IDS.some((n) => byNet[n].length) && <p className="muted small">No channels are connected in Postiz yet.</p>}
                </div>
              )}
              <div className="row-end">
                {current?.link && <button type="button" className="btn-ghost" disabled={!!busy} onClick={() => save(null)}>Unlink</button>}
                <button type="button" className="btn-primary" disabled={!!busy || !Object.values(pick).some(Boolean)} onClick={() => save(postizLink())}>Save link</button>
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}
