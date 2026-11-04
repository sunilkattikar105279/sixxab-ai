// One function for the account and admin endpoints, to stay within Vercel Hobby's 12-function limit.
// vercel.json rewrites /api/me, /api/admin, /api/governance, /api/billing and /api/raise here with ?route=<name>.
// Each route module keeps its own auth checks (requireUser / requireAdmin).
import * as admin from '../routes/admin.js';
import * as billing from '../routes/billing.js';
import * as governance from '../routes/governance.js';
import * as me from '../routes/me.js';
import * as raise from '../routes/raise.js';
import { json } from '../context.js';

type Handler = (request: Request) => Promise<Response>;
const ROUTES: Record<string, { GET?: Handler; POST?: Handler }> = { admin, billing, governance, me, raise };

function dispatch(method: 'GET' | 'POST'): Handler {
  return async (request) => {
    const url = new URL(request.url);
    // The rewrite adds ?route=; fall back to the path in case the original URL is passed through.
    const name = url.searchParams.get('route') ?? url.pathname.replace(/\/$/, '').split('/').pop() ?? '';
    const route = Object.prototype.hasOwnProperty.call(ROUTES, name) ? ROUTES[name] : undefined;
    if (!route) return json({ error: 'not found' }, 404);
    const handler = route[method];
    if (!handler) return json({ error: 'method not allowed' }, 405);
    return handler(request);
  };
}

export const GET = dispatch('GET');
export const POST = dispatch('POST');
