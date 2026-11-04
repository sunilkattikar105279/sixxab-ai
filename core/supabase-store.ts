// Production Store over Supabase's REST API (PostgREST) using the service role key, server-side only.
import type { Store } from './store.js';
import { DEFAULT_TASK_TYPES } from './policy.js';
import type { Approval, AuditEvent, Briefing, Feedback, Memory, Task, TaskType } from './types.js';

type Row = Record<string, unknown>;

/** Turns a free-text search into "word or word or …" so memory matches any word, not all of them. */
export function toOrQuery(query: string): string {
  const words = query.toLowerCase().split(/[^\p{L}\p{N}]+/u).filter((w) => w.length > 2 && w !== 'and' && w !== 'the' && w !== 'for').slice(0, 12);
  return [...new Set(words)].join(' or ');
}

/** Legacy anon/service_role keys are JWTs; new publishable/secret keys (sb_…) are not. */
export const isLegacyJwt = (key: string): boolean => key.startsWith('eyJ') && key.split('.').length === 3;

const snake = (s: string) => s.replace(/[A-Z]/g, (c) => `_${c.toLowerCase()}`);
const camel = (s: string) => s.replace(/_([a-z])/g, (_, c: string) => c.toUpperCase());
const toRow = (o: object): Row => Object.fromEntries(Object.entries(o).filter(([, v]) => v !== undefined).map(([k, v]) => [snake(k), v]));
const fromRow = <T>(r: Row): T => Object.fromEntries(Object.entries(r).filter(([k]) => k !== 'tsv').map(([k, v]) => [camel(k), v])) as T;

export class SupabaseStore implements Store {
  constructor(private readonly url: string, private readonly serviceKey: string, private readonly fetchImpl: typeof fetch = fetch) {
    if (!url || !serviceKey) throw new Error('SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required');
  }

  private async req<T = Row[]>(path: string, init: RequestInit = {}): Promise<T> {
    const res = await this.fetchImpl(`${this.url}/rest/v1/${path}`, {
      ...init,
      headers: {
        // New Supabase secret keys (sb_secret_…) go only in the apikey header; legacy service_role JWTs also go in Authorization.
        apikey: this.serviceKey,
        ...(isLegacyJwt(this.serviceKey) ? { authorization: `Bearer ${this.serviceKey}` } : {}),
        'content-type': 'application/json',
        prefer: 'return=representation',
        ...(init.headers ?? {}),
      },
    });
    if (!res.ok) throw new Error(`Supabase ${res.status} on ${path.split('?')[0]}: ${(await res.text()).slice(0, 300)}`);
    const text = await res.text();
    return (text ? JSON.parse(text) : []) as T;
  }

  private one<T>(rows: Row[], what: string): T {
    if (!rows[0]) throw new Error(`${what} not found`);
    return fromRow<T>(rows[0]);
  }

  /** Reads a company's action types, first adding any newer default types it lacks (existing levels are never changed). */
  async getTaskTypes(orgId: string) {
    const have = (await this.req(`task_types?org_id=eq.${orgId}`)).map((r) => fromRow<TaskType & { orgId: string }>(r));
    const missing = DEFAULT_TASK_TYPES.filter((d) => !have.some((t) => t.key === d.key));
    if (!missing.length) return have;
    await this.req('task_types', {
      method: 'POST',
      body: JSON.stringify(missing.map((t) => taskTypeRow(orgId, t))),
      headers: { prefer: 'resolution=ignore-duplicates,return=minimal' },
    });
    return [...have, ...missing.map((t) => ({ ...t, orgId }))];
  }
  async setTaskTypeLevel(orgId: string, key: string, level: TaskType['level']) {
    await this.req(`task_types?org_id=eq.${orgId}&key=eq.${encodeURIComponent(key)}`, { method: 'PATCH', body: JSON.stringify({ level }) });
  }
  async createTask(task: Task) {
    return this.one<Task>(await this.req('tasks', { method: 'POST', body: JSON.stringify(toRow(task)) }), 'Task');
  }
  async updateTask(id: string, patch: Partial<Task>) {
    const { id: _id, orgId: _org, createdAt: _c, updatedAt: _u, ...rest } = patch;
    return this.one<Task>(await this.req(`tasks?id=eq.${id}`, { method: 'PATCH', body: JSON.stringify(toRow(rest)) }), 'Task');
  }
  async getTask(id: string) {
    const rows = await this.req(`tasks?id=eq.${id}`);
    return rows[0] ? fromRow<Task>(rows[0]) : null;
  }
  async listTasks(orgId: string, sinceIso?: string) {
    const since = sinceIso ? `&updated_at=gte.${encodeURIComponent(sinceIso)}` : '';
    return (await this.req(`tasks?org_id=eq.${orgId}${since}&order=updated_at.desc&limit=200`)).map((r) => fromRow<Task>(r));
  }
  async createApproval(a: Approval) {
    return this.one<Approval>(await this.req('approvals', { method: 'POST', body: JSON.stringify(toRow(a)) }), 'Approval');
  }
  async updateApproval(id: string, patch: Partial<Approval>) {
    return this.one<Approval>(await this.req(`approvals?id=eq.${id}`, { method: 'PATCH', body: JSON.stringify(toRow(patch)) }), 'Approval');
  }
  async getApproval(id: string) {
    const rows = await this.req(`approvals?id=eq.${id}`);
    return rows[0] ? fromRow<Approval>(rows[0]) : null;
  }
  async listApprovals(orgId: string, status?: Approval['status']) {
    const s = status ? `&status=eq.${status}` : '';
    return (await this.req(`approvals?org_id=eq.${orgId}${s}&order=created_at.desc&limit=200`)).map((r) => fromRow<Approval>(r));
  }
  async audit(e: AuditEvent) {
    await this.req('audit_log', { method: 'POST', body: JSON.stringify(toRow(e)), headers: { prefer: 'return=minimal' } });
  }
  async listAudit(orgId: string, sinceIso?: string) {
    const since = sinceIso ? `&at=gte.${encodeURIComponent(sinceIso)}` : '';
    return (await this.req(`audit_log?org_id=eq.${orgId}${since}&order=at.desc&limit=500`)).map((r) => fromRow<AuditEvent>(r));
  }
  async listAuditByActions(orgId: string, actions: string[]) {
    const list = actions.map((a) => `"${a.replace(/[^a-z_.]/gi, '')}"`).join(',');
    return (await this.req(`audit_log?org_id=eq.${orgId}&action=in.(${encodeURIComponent(list)})&order=at.asc&limit=2000`)).map((r) => fromRow<AuditEvent>(r));
  }
  async addFeedback(f: Feedback) {
    await this.req('feedback', { method: 'POST', body: JSON.stringify(toRow(f)), headers: { prefer: 'return=minimal' } });
  }
  async listFeedback(orgId: string, taskType?: string) {
    const t = taskType ? `&task_type=eq.${encodeURIComponent(taskType)}` : '';
    return (await this.req(`feedback?org_id=eq.${orgId}${t}&order=at.desc&limit=500`)).map((r) => fromRow<Feedback>(r));
  }
  async remember(m: Memory) {
    await this.req('memories', { method: 'POST', body: JSON.stringify(toRow(m)), headers: { prefer: 'return=minimal' } });
  }
  async recall(orgId: string, query: string, limit = 5) {
    const q = toOrQuery(query);
    if (!q) return [];
    const rows = await this.req('rpc/recall_memories', { method: 'POST', body: JSON.stringify({ p_org: orgId, p_query: q, p_limit: limit }) });
    return rows.map((r) => fromRow<Memory>(r));
  }
  async latestMemoryWithPrefix(orgId: string, prefix: string) {
    const like = encodeURIComponent(`${prefix}*`);
    const rows = await this.req(`memories?org_id=eq.${orgId}&text=like.${like}&order=at.desc&limit=1`);
    return rows[0] ? fromRow<Memory>(rows[0]) : null;
  }
  async saveBriefing(b: Briefing) {
    await this.req('briefings?on_conflict=org_id,date', {
      method: 'POST',
      body: JSON.stringify(toRow(b)),
      headers: { prefer: 'resolution=merge-duplicates,return=minimal' },
    });
  }

  /** Returns the org a signed-in user belongs to (first one), or null. */
  async orgForUser(userId: string): Promise<string | null> {
    const rows = await this.req(`org_members?user_id=eq.${userId}&select=org_id&order=created_at.asc&limit=1`);
    return rows[0] ? String(rows[0].org_id) : null;
  }

  /**
   * Creates a workspace for a user who has none (for example, an account made before the database
   * trigger existed). Mirrors handle_new_user() in the migration: org, owner membership, default autonomy.
   */
  async provisionWorkspace(userId: string, label: string): Promise<string> {
    const org = this.one<{ id: string }>(await this.req('orgs', { method: 'POST', body: JSON.stringify({ name: label.slice(0, 200) || 'My company' }) }), 'Org');
    await this.req('org_members', { method: 'POST', body: JSON.stringify({ org_id: org.id, user_id: userId, role: 'owner' }), headers: { prefer: 'return=minimal' } });
    const types = DEFAULT_TASK_TYPES.map((t) => taskTypeRow(org.id, t));
    await this.req('task_types', { method: 'POST', body: JSON.stringify(types), headers: { prefer: 'return=minimal' } });
    await this.req('audit_log', {
      method: 'POST',
      body: JSON.stringify({ org_id: org.id, actor: 'platform', action: 'org.created', detail: { user: userId, via: 'first-sign-in' } }),
      headers: { prefer: 'return=minimal' },
    });
    return org.id;
  }

  async listOrgIds(): Promise<string[]> {
    return (await this.req('orgs?select=id')).map((r) => String(r.id));
  }
}

/** Verifies a user's access token with Supabase Auth and returns the user id. */
export async function verifyUser(url: string, anonKey: string, accessToken: string, fetchImpl: typeof fetch = fetch): Promise<{ id: string; email?: string; phone?: string } | null> {
  if (!accessToken) return null;
  const res = await fetchImpl(`${url}/auth/v1/user`, { headers: { apikey: anonKey, authorization: `Bearer ${accessToken}` } });
  if (!res.ok) return null;
  const u = (await res.json()) as { id?: string; email?: string; phone?: string };
  return u.id ? { id: u.id, email: u.email, phone: u.phone } : null;
}

function taskTypeRow(orgId: string, t: TaskType) {
  return {
    org_id: orgId, key: t.key, label: t.label, level: t.level, risk: t.risk,
    approvals_to_promote: t.approvalsToPromote, max_level: t.maxLevel, spend_cap_minor: t.spendCapMinor ?? null,
  };
}
