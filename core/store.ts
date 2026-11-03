// Persistence boundary. MemoryStore backs tests and local runs; SupabaseStore backs production.
import type { Approval, AuditEvent, Briefing, Feedback, Memory, Task, TaskType } from './types.js';

export interface Store {
  getTaskTypes(orgId: string): Promise<TaskType[]>;
  setTaskTypeLevel(orgId: string, key: string, level: TaskType['level']): Promise<void>;

  createTask(task: Task): Promise<Task>;
  updateTask(id: string, patch: Partial<Task>): Promise<Task>;
  getTask(id: string): Promise<Task | null>;
  listTasks(orgId: string, sinceIso?: string): Promise<Task[]>;

  createApproval(a: Approval): Promise<Approval>;
  updateApproval(id: string, patch: Partial<Approval>): Promise<Approval>;
  getApproval(id: string): Promise<Approval | null>;
  listApprovals(orgId: string, status?: Approval['status']): Promise<Approval[]>;

  audit(e: AuditEvent): Promise<void>;
  listAudit(orgId: string, sinceIso?: string): Promise<AuditEvent[]>;

  addFeedback(f: Feedback): Promise<void>;
  listFeedback(orgId: string, taskType?: string): Promise<Feedback[]>;

  remember(m: Memory): Promise<void>;
  recall(orgId: string, query: string, limit?: number): Promise<Memory[]>;
  latestMemoryWithPrefix(orgId: string, prefix: string): Promise<Memory | null>;

  saveBriefing(b: Briefing): Promise<void>;
}

export function newId(): string {
  return globalThis.crypto.randomUUID();
}

export function nowIso(): string {
  return new Date().toISOString();
}

export class MemoryStore implements Store {
  taskTypes = new Map<string, TaskType[]>();
  tasks = new Map<string, Task>();
  approvals = new Map<string, Approval>();
  auditLog: AuditEvent[] = [];
  feedback: Feedback[] = [];
  memories: Memory[] = [];
  briefings: Briefing[] = [];

  constructor(seed?: { orgId: string; taskTypes: TaskType[] }) {
    if (seed) this.taskTypes.set(seed.orgId, seed.taskTypes.map((t) => ({ ...t })));
  }

  async getTaskTypes(orgId: string) {
    return (this.taskTypes.get(orgId) ?? []).map((t) => ({ ...t }));
  }
  async setTaskTypeLevel(orgId: string, key: string, level: TaskType['level']) {
    const list = this.taskTypes.get(orgId) ?? [];
    this.taskTypes.set(orgId, list.map((t) => (t.key === key ? { ...t, level } : t)));
  }
  async createTask(task: Task) {
    this.tasks.set(task.id, { ...task });
    return { ...task };
  }
  async updateTask(id: string, patch: Partial<Task>) {
    const cur = this.tasks.get(id);
    if (!cur) throw new Error(`Task ${id} not found`);
    const next = { ...cur, ...patch, updatedAt: nowIso() };
    this.tasks.set(id, next);
    return { ...next };
  }
  async getTask(id: string) {
    const t = this.tasks.get(id);
    return t ? { ...t } : null;
  }
  async listTasks(orgId: string, sinceIso?: string) {
    return [...this.tasks.values()].filter((t) => t.orgId === orgId && (!sinceIso || t.updatedAt >= sinceIso));
  }
  async createApproval(a: Approval) {
    this.approvals.set(a.id, { ...a });
    return { ...a };
  }
  async updateApproval(id: string, patch: Partial<Approval>) {
    const cur = this.approvals.get(id);
    if (!cur) throw new Error(`Approval ${id} not found`);
    const next = { ...cur, ...patch };
    this.approvals.set(id, next);
    return { ...next };
  }
  async getApproval(id: string) {
    const a = this.approvals.get(id);
    return a ? { ...a } : null;
  }
  async listApprovals(orgId: string, status?: Approval['status']) {
    return [...this.approvals.values()].filter((a) => a.orgId === orgId && (!status || a.status === status));
  }
  async audit(e: AuditEvent) {
    this.auditLog.push({ ...e });
  }
  async listAudit(orgId: string, sinceIso?: string) {
    return this.auditLog.filter((e) => e.orgId === orgId && (!sinceIso || e.at >= sinceIso));
  }
  async addFeedback(f: Feedback) {
    this.feedback.push({ ...f });
  }
  async listFeedback(orgId: string, taskType?: string) {
    return this.feedback.filter((f) => f.orgId === orgId && (!taskType || f.taskType === taskType));
  }
  async remember(m: Memory) {
    this.memories.push({ ...m });
  }
  async recall(orgId: string, query: string, limit = 5) {
    const words = query.toLowerCase().split(/\W+/).filter((w) => w.length > 2);
    return this.memories
      .filter((m) => m.orgId === orgId)
      .map((m) => ({ m, score: words.filter((w) => m.text.toLowerCase().includes(w)).length }))
      .filter((x) => x.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, limit)
      .map((x) => x.m);
  }
  async latestMemoryWithPrefix(orgId: string, prefix: string) {
    const hits = this.memories.filter((m) => m.orgId === orgId && m.text.startsWith(prefix)).sort((a, b) => (a.at < b.at ? 1 : -1));
    return hits[0] ? { ...hits[0] } : null;
  }
  async saveBriefing(b: Briefing) {
    this.briefings.push({ ...b });
  }
}
