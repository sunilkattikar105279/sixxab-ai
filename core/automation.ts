// Per-business automation routing. Each business's approved actions go to its own n8n workflow
// (its own LinkedIn, Gmail, WhatsApp and Google accounts), on the same n8n host as
// N8N_WEBHOOK_URL. Only an admin assigns a workflow; an unassigned business is never sent.
import { newId, nowIso, type Store } from './store.js';

const PATH_RE = /^[a-z0-9][a-z0-9-]{2,59}$/;

export async function setAutomationPath(store: Store, orgId: string, path: string | null, by: string): Promise<void> {
  if (path !== null && !PATH_RE.test(path)) throw new Error('path must be 3-60 lowercase letters, digits or dashes, e.g. ortho-tasgaon');
  await store.audit({
    id: newId(), orgId, at: nowIso(), actor: by, action: 'settings.automation', taskId: null,
    detail: { path, summary: path ? `Automations connected to workflow "${path}"` : 'Automations disconnected' },
  });
}

/** The workflow path assigned to this business, or null. */
export async function automationPath(store: Store, orgId: string): Promise<string | null> {
  const last = (await store.listAuditByActions(orgId, ['settings.automation'])).at(-1);
  const p = last?.detail.path;
  return typeof p === 'string' && PATH_RE.test(p) ? p : null;
}

/** The business's webhook URL on the configured n8n host, or undefined when none is assigned. */
export function webhookFor(baseUrl: string | undefined, path: string | null): string | undefined {
  if (!baseUrl || !path) return undefined;
  return `${new URL(baseUrl).origin}/webhook/${path}`;
}

/** The default path in N8N_WEBHOOK_URL (e.g. "sixxab-actions"), used for an admin's own business. */
export function defaultPath(baseUrl: string | undefined): string | null {
  if (!baseUrl) return null;
  const last = new URL(baseUrl).pathname.split('/').filter(Boolean).at(-1) ?? '';
  return PATH_RE.test(last) ? last : null;
}

export function isAdmin(email: string | undefined, adminEmails: string | undefined): boolean {
  if (!email || !adminEmails) return false;
  return adminEmails.split(',').map((e) => e.trim().toLowerCase()).filter(Boolean).includes(email.trim().toLowerCase());
}
