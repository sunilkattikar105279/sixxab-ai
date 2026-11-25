// The go-live checklist for SIXXAB admins: what is done, what waits on the owner and what waits on the build. The server
// builds it from which settings exist (true or false only) and what the workspace shows, so it stays current by itself.
import React from 'react';
import { Fold } from './Fold';
import type { GoLiveItem } from '../../core/golive';

const STATUS: Record<GoLiveItem['status'], { text: string; cls: string }> = {
  done: { text: 'Done', cls: 'pill pill-done' }, todo: { text: 'To do', cls: 'pill' }, decide: { text: 'Your decision', cls: 'pill' }, optional: { text: 'Optional', cls: 'pill muted' },
};

export function GoLive({ golive }: { golive: { items: GoLiveItem[]; yours: number; ours: number; done: number } }) {
  const groups = [...new Set(golive.items.map((i) => i.group))];
  return (
    <Fold id="mk-golive" title="Go-live checklist" hint={`${golive.done} of ${golive.items.length} done · ${golive.yours} yours · ${golive.ours} Claude's`}>
      <p className="muted small">Visible to admins only. Built from which settings exist in Vercel (never their values) and what this workspace shows, so it updates itself. Nothing here charges, posts or sends.</p>
      {groups.map((g) => (
        <div key={g} className="stack-xs" style={{ marginTop: 12 }}>
          <h3>{g}</h3>
          <ul className="action-list">
            {golive.items.filter((i) => i.group === g).map((i) => (
              <li key={i.key} className="action-card">
                <div className="row-between"><strong>{i.title}</strong><span className="row-wrap"><span className="muted small">{i.owner === 'you' ? 'You' : 'Claude'}</span><span className={STATUS[i.status].cls}>{STATUS[i.status].text}</span></span></div>
                {i.status !== 'done' && <p className="muted small">{i.how}</p>}
              </li>
            ))}
          </ul>
        </div>
      ))}
    </Fold>
  );
}
