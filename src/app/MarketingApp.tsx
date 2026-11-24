// The marketing app: the AI marketing agency on its own at /marketing, installable on a phone as "SIXXAB Marketing".
// It is the workspace's Marketing tab with its own header: same sign-in, same data, same rules (nothing is posted,
// spent or charged without the owner's yes). Approvals and the other tabs open in the full workspace.
import React, { useEffect, useState } from 'react';
import { getSession, sessionFromRedirect, signOut, type Session } from '../lib/auth';
import { Brand, Spinner } from './ui';
import { Marketing } from './Marketing';

export default function MarketingApp() {
  const [session, setSession] = useState<Session | null>(null);

  useEffect(() => {
    (async () => {
      const s = (await sessionFromRedirect()) ?? (await getSession());
      if (!s) {
        location.replace('/login?next=marketing');
        return;
      }
      setSession(s);
    })();
  }, []);

  if (!session) return <div className="center-page"><Spinner label="Opening your marketing…" /></div>;
  const who = session.user.email ?? session.user.phone ?? 'Owner';

  return (
    <div className="app">
      <header className="app-top mk-app-top">
        <Brand />
        <div className="app-user">
          <span className="muted small">{who}</span>
          <a className="btn-ghost" href="/app">Workspace</a>
          <button type="button" className="btn-ghost" onClick={async () => { await signOut(); location.replace('/'); }}>Sign out</button>
        </div>
      </header>
      <main className="app-main">
        <Marketing app="marketing" goApprovals={() => location.assign('/app?tab=approvals')} />
      </main>
    </div>
  );
}
