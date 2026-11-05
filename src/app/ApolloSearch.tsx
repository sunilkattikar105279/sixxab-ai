// Admin only: find people in Apollo by title, location, industry and size, then import them as leads.
// Searching uses no Apollo credits and returns no emails; revealing an email is a separate, per-contact click.
import React, { useState } from 'react';
import { api } from '../lib/auth';
import { Spinner } from './ui';

interface Person { apolloId: string; name: string; title: string; company: string; domain: string; location: string; linkedin: string }
const SIZES: [string, string][] = [['1,10', '1–10'], ['11,50', '11–50'], ['51,200', '51–200'], ['201,500', '201–500'], ['501,1000', '501–1,000']];

export function ApolloSearch({ onImported }: { onImported: () => void }) {
  const [f, setF] = useState({ titles: 'Founder, CEO, Owner', locations: '', industries: '', keywords: '' });
  const [sizes, setSizes] = useState<string[]>(['1,10', '11,50']);
  const [people, setPeople] = useState<Person[] | null>(null);
  const [total, setTotal] = useState<number | null>(null);
  const [pick, setPick] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);

  async function search(e: React.FormEvent) {
    e.preventDefault();
    setBusy('search'); setMsg(null);
    try {
      const r = await api<{ people: Person[]; total: number | null }>('/api/crm', { method: 'POST', body: JSON.stringify({ action: 'apollo_search', filters: { ...f, employees: sizes } }) });
      setPeople(r.people); setTotal(r.total); setPick(new Set(r.people.map((p) => p.apolloId)));
    } catch (err) {
      setMsg(err instanceof Error ? err.message : 'Apollo search failed.');
    } finally { setBusy(null); }
  }

  async function importPicked() {
    setBusy('import'); setMsg(null);
    try {
      const chosen = (people ?? []).filter((p) => pick.has(p.apolloId));
      const r = await api<{ added: number; skipped: number }>('/api/crm', { method: 'POST', body: JSON.stringify({ action: 'apollo_import', people: chosen }) });
      setMsg(`Imported ${r.added} lead${r.added === 1 ? '' : 's'}${r.skipped ? `; ${r.skipped} already in the CRM` : ''}.`);
      onImported();
    } catch (err) {
      setMsg(err instanceof Error ? err.message : 'Import failed.');
    } finally { setBusy(null); }
  }

  const toggle = (id: string) => { const n = new Set(pick); if (n.has(id)) n.delete(id); else n.add(id); setPick(n); };
  return (
    <section className="panel glass-card">
      <p className="eyebrow">Apollo · admin only</p>
      <h2>Find people in Apollo</h2>
      <p className="muted small">Search uses no Apollo credits and returns no emails. After importing, use "Find email" on a contact to reveal its work email for one credit.</p>
      <form className="form" onSubmit={search}>
        <div className="grid2">
          <label className="field"><span>Job titles (comma separated)</span><input value={f.titles} onChange={(e) => setF({ ...f, titles: e.target.value })} /></label>
          <label className="field"><span>Where they are</span><input value={f.locations} onChange={(e) => setF({ ...f, locations: e.target.value })} placeholder="e.g. Pune, India; Dallas, TX" /></label>
          <label className="field"><span>Industry keywords</span><input value={f.industries} onChange={(e) => setF({ ...f, industries: e.target.value })} placeholder="e.g. healthcare, clinic, consulting" /></label>
          <label className="field"><span>Other keywords</span><input value={f.keywords} onChange={(e) => setF({ ...f, keywords: e.target.value })} /></label>
        </div>
        <fieldset className="row-wrap"><legend className="muted small">Company size</legend>
          {SIZES.map(([v, l]) => <label key={v} className="small"><input type="checkbox" checked={sizes.includes(v)} onChange={() => setSizes(sizes.includes(v) ? sizes.filter((x) => x !== v) : [...sizes, v])} /> {l}</label>)}
        </fieldset>
        <div className="row-end"><button type="submit" className="btn-primary" disabled={!!busy}>{busy === 'search' ? <Spinner label="Searching Apollo…" /> : 'Search Apollo'}</button></div>
      </form>
      {people && (people.length === 0 ? <p className="muted small">No matches. Try fewer filters.</p> : (
        <>
          <p className="muted small">{total !== null ? `${total.toLocaleString()} matches in Apollo; showing ${people.length}.` : `${people.length} matches.`}</p>
          <div className="table-wrap"><table>
            <thead><tr><th /><th>Name</th><th>Title</th><th>Company</th><th>Location</th></tr></thead>
            <tbody>{people.map((p) => (
              <tr key={p.apolloId}>
                <td><input type="checkbox" aria-label={`Select ${p.name}`} checked={pick.has(p.apolloId)} onChange={() => toggle(p.apolloId)} /></td>
                <td>{p.name}</td><td>{p.title}</td><td>{p.company}{p.domain ? <span className="muted small"> · {p.domain}</span> : null}</td><td className="small">{p.location}</td>
              </tr>
            ))}</tbody>
          </table></div>
          <div className="row-end"><button type="button" className="btn-primary" disabled={!!busy || pick.size === 0} onClick={importPicked}>{busy === 'import' ? <Spinner label="Importing…" /> : `Import ${pick.size} as leads`}</button></div>
        </>
      ))}
      {msg && <p className={/Imported/.test(msg) ? 'muted small' : 'error'} role="status">{msg}</p>}
    </section>
  );
}
