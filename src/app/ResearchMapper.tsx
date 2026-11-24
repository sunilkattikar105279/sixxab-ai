// The research import preview: each report beside the customer it will go on, a dropdown to pick a different
// customer (or skip the report), and tick boxes for the details to copy onto that customer in the same step.
// Nothing is saved until the owner presses Import; nothing is ever sent.
import React, { useMemo, useState } from 'react';
import { Spinner } from './ui';
import type { Contact } from './Customer';
import { cleanResearch } from '../../core/research-state';
import { defaultPicks, mapRows, matchDeal, type MapRow } from '../../core/research-map';

type Research = ReturnType<typeof cleanResearch>;
interface Item {
  company: string;
  research: Research | null;
  problem: string;
  autoId: string;
  autoBy: string;
  autoReason: string;
}
interface Choice { dealId: string; picks: string[] }

const text = (v: unknown, max: number) => String(v ?? '').trim().slice(0, max);
const short = (s: string, n: number) => (s.length > n ? `${s.slice(0, n - 1)}…` : s);
const BY: Record<string, string> = { website: 'Matched by website', name: 'Matched by business name', phone: 'Matched by phone' };
function host(url: string): string {
  try { return new URL(url).hostname.replace(/^www\./, ''); } catch { return ''; }
}
const customerName = (c: Contact) => c.company || c.name;

function itemsOf(reports: Record<string, unknown>[], contacts: Contact[]): Item[] {
  return reports.map((r) => {
    const company = text(r.company, 200) || text(r.business, 200);
    let research: Research | null = null;
    let problem = '';
    try {
      research = cleanResearch((r.research && typeof r.research === 'object' ? r.research : r) as Record<string, unknown>);
    } catch (e) {
      problem = e instanceof Error ? e.message : 'This report could not be read';
    }
    const m = matchDeal(contacts, { ...r, company });
    return { company: company || 'Unnamed report', research, problem, autoId: m.deal?.id ?? '', autoBy: m.by ?? '', autoReason: m.reason };
  });
}
const rowsFor = (it: Item, c: Contact | undefined): MapRow[] => (it.research && c ? mapRows(it.research, c).filter((r) => r.status !== 'same') : []);

export function ResearchMapper({ fileName, reports, contacts, importing, onImport, onCancel }: {
  fileName: string; reports: Record<string, unknown>[]; contacts: Contact[]; importing: boolean;
  onImport: (deals: Record<string, string>, fill: Record<string, string[]>) => void; onCancel: () => void;
}) {
  const byId = useMemo(() => new Map(contacts.map((c) => [c.id, c])), [contacts]);
  const sorted = useMemo(() => [...contacts].sort((a, b) => customerName(a).localeCompare(customerName(b))), [contacts]);
  const items = useMemo(() => itemsOf(reports, contacts), [reports, contacts]);
  const [choices, setChoices] = useState<Choice[]>(() => items.map((it) => ({ dealId: it.autoId, picks: defaultPicks(rowsFor(it, byId.get(it.autoId))) })));

  const setDeal = (i: number, dealId: string) => setChoices((cs) => cs.map((c, j) => (j === i ? { dealId, picks: defaultPicks(rowsFor(items[i], byId.get(dealId))) } : c)));
  const toggle = (i: number, row: MapRow, rows: MapRow[]) => setChoices((cs) => cs.map((c, j) => {
    if (j !== i) return c;
    if (c.picks.includes(row.key)) return { ...c, picks: c.picks.filter((k) => k !== row.key) };
    // One value per field: ticking a second email unticks the first.
    const sameField = new Set(rows.filter((r) => r.target === row.target).map((r) => r.key));
    return { ...c, picks: [...c.picks.filter((k) => !sameField.has(k)), row.key] };
  }));

  const placed = choices.filter((c) => c.dealId).length;
  const details = choices.reduce((t, c) => t + (c.dealId ? c.picks.length : 0), 0);
  function submit() {
    const deals: Record<string, string> = {};
    const fill: Record<string, string[]> = {};
    choices.forEach((c, i) => {
      deals[String(i)] = c.dealId;
      if (c.dealId && c.picks.length) fill[String(i)] = c.picks;
    });
    onImport(deals, fill);
  }

  return (
    <div className="map-preview" id="research-map">
      <h3>Check where each report goes</h3>
      <p className="muted small">{fileName}: {reports.length} report{reports.length === 1 ? '' : 's'}. Change the customer if a match is wrong, and tick the details to copy onto that customer. Empty fields are ticked to start with; a detail that would replace one you already have is left for you to tick.</p>
      <ol className="map-list">
        {items.map((it, i) => {
          const ch = choices[i];
          const c = byId.get(ch.dealId);
          const rows = rowsFor(it, c);
          const matchNote = !ch.dealId ? (it.autoId ? 'Skipped' : it.autoReason) : ch.dealId === it.autoId ? BY[it.autoBy] ?? 'Matched' : 'Picked by you';
          return (
            <li key={i} className="map-row">
              <div className="map-head">
                <strong>{it.company}</strong>
                <select aria-label={`Customer for ${it.company}`} value={ch.dealId} onChange={(e) => setDeal(i, e.target.value)}>
                  <option value="">{it.autoId ? 'Skip this report' : 'Pick a customer, or skip'}</option>
                  {sorted.map((x) => <option key={x.id} value={x.id}>{customerName(x)}{x.company && x.name && x.name !== x.company ? ` (${x.name})` : ''}{x.stage === 'lost' ? ' (lost)' : ''}</option>)}
                </select>
                <span className={`small ${ch.dealId ? 'muted' : 'warn'}`}>{matchNote}</span>
              </div>
              {it.problem && <p className="error small">This report can't be attached: {it.problem}</p>}
              {c && it.research && (rows.length === 0
                ? <p className="muted small">Every detail in this report is already on {customerName(c)}.</p>
                : (
                  <details className="map-details">
                    <summary className="small">{ch.picks.length} of {rows.length} detail{rows.length === 1 ? '' : 's'} to copy onto {customerName(c)}</summary>
                    <ul className="map-fields">
                      {rows.map((row) => (
                        <li key={row.key}>
                          <label>
                            <input type="checkbox" checked={ch.picks.includes(row.key)} onChange={() => toggle(i, row, rows)} />
                            <span className="map-value"><b>{row.label}:</b> {short(row.value, 160)}
                              {row.status === 'different' && <span className="muted"> (replaces “{short(row.current, 60)}”)</span>}
                              {row.source && host(row.source) && <span className="muted"> from {host(row.source)}</span>}
                            </span>
                          </label>
                        </li>
                      ))}
                    </ul>
                  </details>
                ))}
            </li>
          );
        })}
      </ol>
      <div className="row-end">
        <button type="button" className="btn-ghost" disabled={importing} onClick={onCancel}>Cancel</button>
        <button type="button" className="btn-primary" disabled={importing || placed === 0} onClick={submit}>
          {importing ? <Spinner label="Importing…" /> : `Import ${placed} report${placed === 1 ? '' : 's'}${details ? ` and copy ${details} detail${details === 1 ? '' : 's'}` : ''}`}
        </button>
      </div>
    </div>
  );
}
