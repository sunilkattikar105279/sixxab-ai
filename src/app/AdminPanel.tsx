// Admin only: assign each business its own n8n workflow, so its actions use its own accounts.
import React, { useState } from 'react';
import { api } from '../lib/auth';
import { useLoad } from './useLoad';

interface Org { orgId: string; name: string | null; path: string | null }

export function AdminPanel() {
  const { data, error, reload } = useLoad<{ orgs: Org[] }>('/api/admin');
  if (error || !data) return null; // not an admin, or not loaded yet
  return (
    <section className="panel glass-card">
      <h2>Businesses and workflows</h2>
      <p className="muted small">Admin only. Each business sends approved actions to its own n8n workflow (its own accounts). Without one, actions are recorded, not sent.</p>
      <div className="table-wrap">
        <table>
          <thead><tr><th>Business</th><th>n8n workflow path</th><th /></tr></thead>
          <tbody>{data.orgs.map((o) => <OrgRow key={o.orgId} org={o} onSaved={reload} />)}</tbody>
        </table>
      </div>
    </section>
  );
}

function OrgRow({ org, onSaved }: { org: Org; onSaved: () => void }) {
  const [path, setPath] = useState(org.path ?? '');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  async function save() {
    setBusy(true);
    setMsg(null);
    try {
      await api('/api/admin', { method: 'POST', body: JSON.stringify({ orgId: org.orgId, path: path.trim() || null }) });
      setMsg('Saved');
      onSaved();
    } catch (e) {
      setMsg(e instanceof Error ? e.message : 'Could not save');
    } finally {
      setBusy(false);
    }
  }
  return (
    <tr>
      <td>{org.name ?? <span className="muted">No profile yet</span>}<div className="muted small">{org.orgId.slice(0, 8)}</div></td>
      <td><input className="path-input" aria-label={`Workflow path for ${org.name ?? org.orgId}`} placeholder="e.g. ortho-tasgaon" value={path} onChange={(e) => setPath(e.target.value)} /></td>
      <td className="nowrap"><button type="button" className="btn-mini" disabled={busy || path === (org.path ?? '')} onClick={save}>Save</button>{msg && <span className="muted small"> {msg}</span>}</td>
    </tr>
  );
}
