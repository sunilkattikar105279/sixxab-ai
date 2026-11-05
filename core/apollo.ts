// Apollo.io for the Lead Finder: people search (no credits, no emails) and one-person enrichment
// (one credit, returns the work email). Server-only: the API key never reaches the browser.
// Docs: Apollo REST API, POST /api/v1/mixed_people/api_search and POST /api/v1/people/match.

export const APOLLO_BASE = 'https://api.apollo.io/api/v1';
const TIMEOUT_MS = 20_000;
const MAX_PER_PAGE = 25;

export interface ApolloFilters {
  titles?: string[]; locations?: string[]; industries?: string[]; employees?: string[]; keywords?: string; page?: number;
}
export interface ApolloPerson {
  apolloId: string; name: string; title: string; company: string; domain: string; location: string; linkedin: string;
}

const list = (v: unknown, max = 10): string[] =>
  (Array.isArray(v) ? v : String(v ?? '').split(',')).map((x) => String(x).trim()).filter(Boolean).slice(0, max).map((x) => x.slice(0, 80));
const EMPLOYEE_RANGE = /^\d{1,6},\d{1,6}$/;

/** Turns the owner's form into Apollo's filters; nothing unvalidated reaches Apollo. */
export function apolloBody(f: ApolloFilters): Record<string, unknown> {
  const body: Record<string, unknown> = { page: Math.min(Math.max(1, Number(f.page) || 1), 20), per_page: MAX_PER_PAGE };
  const titles = list(f.titles), locations = list(f.locations), industries = list(f.industries);
  const employees = list(f.employees).filter((r) => EMPLOYEE_RANGE.test(r));
  if (titles.length) body.person_titles = titles;
  if (locations.length) body.person_locations = locations;
  if (industries.length) body.q_organization_keyword_tags = industries;
  if (employees.length) body.organization_num_employees_ranges = employees;
  const kw = String(f.keywords ?? '').trim().slice(0, 120);
  if (kw) body.q_keywords = kw;
  if (!titles.length && !locations.length && !industries.length && !kw) throw new Error('Add at least a title, a location, an industry or a keyword');
  return body;
}

type Raw = Record<string, unknown>;
const str = (v: unknown) => (typeof v === 'string' ? v : '');

export function parsePerson(p: Raw): ApolloPerson | null {
  const id = str(p.id);
  if (!/^[a-f0-9]{24}$/.test(id)) return null;
  const org = (p.organization ?? {}) as Raw;
  const last = str(p.last_name) || str(p.last_name_obfuscated);
  const name = (str(p.name) || [str(p.first_name), last].filter(Boolean).join(' ')).trim();
  const location = [str(p.city), str(p.state), str(p.country)].filter(Boolean).join(', ');
  return {
    apolloId: id, name: name || 'Unknown', title: str(p.title), company: str(org.name) || str(p.organization_name),
    domain: str(org.primary_domain) || str(org.website_url).replace(/^https?:\/\//, '').replace(/\/.*$/, ''),
    location, linkedin: str(p.linkedin_url),
  };
}

/** Apollo's own error text, short and stripped of markup, so the owner sees exactly what it said. */
async function apolloReason(res: Response): Promise<string> {
  try {
    const text = await res.text();
    let msg = text;
    try { const j = JSON.parse(text) as Raw; msg = str(j.error) || str(j.message) || text; } catch { /* plain text */ }
    msg = msg.replace(/<[^>]*>/g, '').replace(/\s+/g, ' ').trim().slice(0, 200);
    return msg ? ` Apollo said: "${msg}"` : '';
  } catch {
    return '';
  }
}

async function call(apiKey: string, path: string, body: Record<string, unknown>, fetchImpl: typeof fetch): Promise<Raw> {
  if (!apiKey) throw new Error('Apollo is not connected: add APOLLO_API_KEY in Vercel');
  const res = await fetchImpl(`${APOLLO_BASE}${path}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'cache-control': 'no-cache', 'x-api-key': apiKey },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  if (!res.ok) {
    const why = await apolloReason(res);
    if (res.status === 401) throw new Error(`Apollo key not recognised: re-copy it into APOLLO_API_KEY (Production) and redeploy.${why}`);
    if (res.status === 403) throw new Error(`Apollo accepted the key but refused this search: in Apollo, turn on "Set as master key" for the key (or give it People Search and People Enrichment), and check your plan includes API access.${why}`);
    if (res.status === 429) throw new Error('Apollo rate limit reached: try again in a minute');
    throw new Error(`Apollo error ${res.status}.${why}`);
  }
  return (await res.json()) as Raw;
}

export async function apolloSearch(apiKey: string, f: ApolloFilters, fetchImpl: typeof fetch = fetch): Promise<{ people: ApolloPerson[]; total: number | null }> {
  const json = await call(apiKey, '/mixed_people/api_search', apolloBody(f), fetchImpl);
  const raw = (Array.isArray(json.people) ? json.people : []) as Raw[];
  const total = Number((json.pagination as Raw | undefined)?.total_entries ?? json.total_entries);
  return { people: raw.map(parsePerson).filter((p): p is ApolloPerson => Boolean(p)), total: Number.isFinite(total) ? total : null };
}

/** Reveals one person's work email (one Apollo credit). Personal emails and phones are never requested. */
export async function apolloEnrich(apiKey: string, apolloId: string, fetchImpl: typeof fetch = fetch): Promise<{ email: string; status: string }> {
  if (!/^[a-f0-9]{24}$/.test(apolloId)) throw new Error('This contact did not come from Apollo');
  const json = await call(apiKey, '/people/match', { id: apolloId, reveal_personal_emails: false, reveal_phone_number: false }, fetchImpl);
  const p = (json.person ?? {}) as Raw;
  const email = str(p.email);
  return { email: /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) && !/email_not_unlocked/.test(email) ? email : '', status: str(p.email_status) || (email ? 'unknown' : 'unavailable') };
}
