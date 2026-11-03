// Browser end-to-end checks against the local preview (node scripts/dev-server.mjs 4173).
// Usage: node tests/e2e.mjs [baseUrl] [screenshotDir]
// Supabase and the API are mocked at the network layer so the UI flows can be checked without real services.
import { chromium, devices } from 'playwright';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const BASE = process.argv[2] || 'http://localhost:4173';
const SHOTS = process.argv[3] || '/tmp/sixxab-shots';
fs.mkdirSync(SHOTS, { recursive: true });
const results = [];
const check = async (name, fn) => {
  try {
    await fn();
    results.push(['PASS', name]);
  } catch (e) {
    results.push(['FAIL', name, e.message.split('\n')[0]]);
  }
};

const browser = await chromium.launch();

// ---------- landing ----------
await check('landing renders, hydrates without errors, and its controls work', async () => {
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await ctx.newPage();
  const errors = [];
  page.on('console', (m) => m.type() === 'error' && !/Failed to load resource|ERR_|net::/.test(m.text()) && errors.push(m.text()));
  page.on('pageerror', (e) => errors.push(e.message));
  await page.route(/cloudfront\.net|fonts\.(googleapis|gstatic)\.com/, (r) => r.abort());
  await page.goto(BASE + '/', { waitUntil: 'networkidle' });
  assert.match(await page.locator('h1').first().innerText(), /Start it\. Scale it\. Run it\./);
  await page.screenshot({ path: `${SHOTS}/landing-hero.png` });
  // Path tabs
  await page.getByRole('button', { name: /Medium businesses/ }).click();
  await page.getByText('Transition and scale to SIXXAB level.').first().waitFor();
  // Consultant market toggle
  await page.getByRole('button', { name: /India · INR/ }).click();
  await page.getByText('₹1,50,000').first().waitFor();
  // Pricing
  await page.getByText('$20,000').first().waitFor();
  // Ticker moves
  const ticker = page.locator('p[aria-live="polite"] span span').first();
  const before = await ticker.getAttribute('style');
  await page.waitForTimeout(2700);
  assert.notEqual(await ticker.getAttribute('style'), before, 'ticker should advance');
  // Links
  assert.equal(await page.getByRole('link', { name: 'Log in' }).first().getAttribute('href'), '/login');
  await page.locator('#pricing').scrollIntoViewIfNeeded();
  await page.screenshot({ path: `${SHOTS}/landing-pricing.png` });
  await page.locator('#begin').scrollIntoViewIfNeeded();
  await page.screenshot({ path: `${SHOTS}/landing-booking.png` });
  assert.deepEqual(errors, []);
  await ctx.close();
});

await check('landing works on a phone, menu opens', async () => {
  const ctx = await browser.newContext({ ...devices['iPhone 13'] });
  const page = await ctx.newPage();
  await page.route(/cloudfront\.net|fonts\.(googleapis|gstatic)\.com/, (r) => r.abort());
  await page.goto(BASE + '/', { waitUntil: 'networkidle' });
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  assert.ok(overflow <= 1, `horizontal overflow ${overflow}px`);
  await page.screenshot({ path: `${SHOTS}/phone-hero.png` });
  await page.getByRole('button', { name: 'Menu' }).click();
  await page.getByRole('link', { name: 'Consultants' }).last().waitFor();
  await page.screenshot({ path: `${SHOTS}/phone-menu.png` });
  await ctx.close();
});

// ---------- login + app with mocked services ----------
const MOCK = 'https://mock-project.supabase.co';
async function mockServices(ctx, state) {
  await ctx.route(/cloudfront\.net|fonts\.(googleapis|gstatic)\.com/, (r) => r.abort());
  await ctx.route('**/api/config', (r) => r.fulfill({ json: { supabaseUrl: MOCK, supabaseAnonKey: 'anon', bookingUrl: 'https://calendar.app.google/test', contactEmail: 'x@y.z' } }));
  await ctx.route(`${MOCK}/auth/v1/**`, async (r) => {
    const url = r.request().url();
    const body = r.request().postDataJSON?.() ?? {};
    if (url.includes('/otp')) { state.otp.push(body); return r.fulfill({ json: {} }); }
    if (url.includes('/verify')) {
      if (body.token !== '123456') return r.fulfill({ status: 403, json: { msg: 'Token has expired or is invalid' } });
      return r.fulfill({ json: { access_token: 'at', refresh_token: 'rt', expires_in: 3600, user: { id: 'u1', email: body.email, phone: body.phone } } });
    }
    if (url.includes('/logout')) return r.fulfill({ status: 204, body: '' });
    return r.fulfill({ json: { id: 'u1', email: 'founder@acme.com' } });
  });
  await ctx.route('**/api/briefing', (r) => r.fulfill({ json: { briefing: { summary: '2 actions done, 1 waiting on you.', shipped: ['Save note: Launch plan'], needsYou: ['Approve: Post on linkedin'], learned: [] } } }));
  await ctx.route('**/api/approvals', async (r) => {
    if (r.request().method() === 'POST') { state.decisions.push(r.request().postDataJSON()); state.pending = []; return r.fulfill({ json: { task: {}, nextApproval: null, promotion: null } }); }
    return r.fulfill({ json: { approvals: state.pending } });
  });
  await ctx.route('**/api/agents', async (r) => {
    if (r.request().method() === 'POST') {
      const body = r.request().postDataJSON();
      if (body.goal) return r.fulfill({ json: { parentId: 'p1', steps: [{ taskId: 't1', agentId: 'strategy-coach', goal: 'Write launch plan', status: 'planned' }, { taskId: 't2', agentId: 'social-poster', goal: 'Announce', status: 'planned' }] } });
      state.ran = [...(state.ran ?? []), body.taskId];
      return r.fulfill({ json: body.taskId === 't1' ? { status: 'done', output: 'Plan saved.', queued: 0 } : { status: 'done', output: 'Post queued.', queued: 1 } });
    }
    return r.fulfill({ json: { agents: [{ id: 'cmo', name: 'CMO agent', layer: 'cxo', job: 'Owns marketing' }], taskTypes: [{ key: 'publish_post', label: 'Publish a social post', level: 2, maxLevel: 3 }], tasks: state.leftover ?? [] } });
  });
  await ctx.route('**/api/profile', async (r) => {
    const fields = [{ key: 'name', label: 'Company name' }, { key: 'offer', label: 'What we sell' }, { key: 'customers', label: 'Who we sell to' }];
    if (r.request().method() === 'POST') { state.profile = r.request().postDataJSON(); return r.fulfill({ json: { profile: state.profile } }); }
    return r.fulfill({ json: { profile: state.profile ?? null, fields } });
  });
  await ctx.route('**/api/activity', (r) => r.fulfill({ json: { events: [{ id: 'e1', at: new Date().toISOString(), actor: 'social-poster', action: 'approval.requested', detail: { summary: 'Post on linkedin' } }] } }));
}

await check('email sign-in: wrong code is refused, right code opens the workspace', async () => {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 860 } });
  const state = { otp: [], decisions: [], pending: [] };
  await mockServices(ctx, state);
  const page = await ctx.newPage();
  await page.goto(BASE + '/login');
  await page.screenshot({ path: `${SHOTS}/login-email.png` });
  await page.getByLabel('Email', { exact: true }).fill('not-an-email');
  await page.getByRole('button', { name: 'Send code' }).click();
  await page.getByText('Enter a valid email address.').waitFor();
  await page.getByLabel('Email', { exact: true }).fill('Founder@Acme.com');
  await page.getByRole('button', { name: 'Send code' }).click();
  await page.getByLabel('6-digit code').waitFor();
  assert.equal(state.otp[0].email, 'founder@acme.com');
  await page.getByLabel('6-digit code').fill('000000');
  await page.getByRole('button', { name: 'Sign in' }).click();
  await page.getByText(/wrong or has expired/).waitFor();
  await page.getByLabel('6-digit code').fill('123456');
  await page.getByRole('button', { name: 'Sign in' }).click();
  await page.waitForURL('**/app');
  await page.getByText('What should your company get done?').waitFor();
  await page.screenshot({ path: `${SHOTS}/app-today.png` });
  await ctx.close();
});

await check('mobile sign-in sends an E.164 number by SMS', async () => {
  const ctx = await browser.newContext({ ...devices['Pixel 7'] });
  const state = { otp: [], decisions: [], pending: [] };
  await mockServices(ctx, state);
  const page = await ctx.newPage();
  await page.goto(BASE + '/login');
  await page.getByRole('tab', { name: 'Mobile' }).click();
  await page.getByLabel('Country code').selectOption({ label: 'India +91' });
  await page.getByLabel('Mobile number').fill('086000 20434');
  await page.screenshot({ path: `${SHOTS}/login-mobile-phone.png` });
  await page.getByRole('button', { name: 'Send code' }).click();
  await page.getByLabel('6-digit code').waitFor();
  assert.equal(state.otp[0].phone, '+918600020434');
  await page.getByLabel('6-digit code').fill('123456');
  await page.getByRole('button', { name: 'Sign in' }).click();
  await page.waitForURL('**/app');
  await ctx.close();
});

await check('workspace: run a goal, edit and approve, see agents and activity', async () => {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const state = { otp: [], decisions: [], pending: [{ id: 'a1', orgId: 'o', taskId: 't', kind: 'approve', taskType: 'publish_post', summary: 'Post on linkedin: "We are live"', proposed: { network: 'linkedin', text: 'We are live' }, status: 'pending', createdAt: new Date().toISOString() }] };
  await mockServices(ctx, state);
  await ctx.addInitScript(() => localStorage.setItem('sixxab.session', JSON.stringify({ accessToken: 'at', refreshToken: 'rt', expiresAt: Math.floor(Date.now() / 1000) + 3600, user: { id: 'u1', email: 'founder@acme.com' } })));
  const page = await ctx.newPage();
  await page.goto(BASE + '/app');
  await page.getByText('First, tell your agents about your company').waitFor();
  await page.getByLabel(/Company name/).fill('SIXXAB AI');
  await page.getByLabel(/What we sell/).fill('AI agents that run your company');
  await page.getByRole('button', { name: 'Save profile' }).click();
  await page.getByText('About your company').waitFor();
  assert.equal(state.profile.name, 'SIXXAB AI');
  await page.getByLabel('Goal').fill('Plan our launch week');
  await page.getByRole('button', { name: 'Hand it to the agents' }).click();
  await page.getByText('Plan saved.').waitFor();
  await page.getByText('Post queued.').waitFor();
  assert.deepEqual(state.ran, ['t1', 't2'], 'each step runs as its own request, in order');
  await page.getByRole('button', { name: /Review 1 item waiting for your yes/ }).waitFor();
  await page.getByRole('button', { name: /^Approvals/ }).click();
  await page.getByLabel('text').fill('We are live! Book a call at sixxab.ai');
  await page.getByRole('button', { name: 'Approve with my edits' }).click();
  await page.getByText('All clear').waitFor();
  assert.equal(state.decisions[0].approved, true);
  assert.equal(state.decisions[0].edited.text, 'We are live! Book a call at sixxab.ai');
  await page.getByRole('button', { name: 'Agents' }).click();
  await page.getByText('L2 Approve').waitFor();
  await page.screenshot({ path: `${SHOTS}/app-agents.png` });
  await page.getByRole('button', { name: 'Activity' }).click();
  await page.getByText(/approval requested/).waitFor();
  await ctx.close();
});

await check('planned steps that never ran can be continued from the Today tab', async () => {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const now = Date.now();
  const state = { otp: [], decisions: [], pending: [], profile: { name: 'SIXXAB AI', offer: 'Agents' }, leftover: [
    { id: 't2', agentId: 'social-poster', goal: 'Announce', status: 'planned', createdAt: new Date(now + 1000).toISOString() },
    { id: 't1', agentId: 'strategy-coach', goal: 'Write launch plan', status: 'planned', createdAt: new Date(now).toISOString() },
    { id: 'p', agentId: 'founder-orchestrator', goal: 'Launch', status: 'running', createdAt: new Date(now - 1000).toISOString() },
  ] };
  await mockServices(ctx, state);
  await ctx.addInitScript(() => localStorage.setItem('sixxab.session', JSON.stringify({ accessToken: 'at', refreshToken: 'rt', expiresAt: Math.floor(Date.now() / 1000) + 3600, user: { id: 'u1', email: 'founder@acme.com' } })));
  const page = await ctx.newPage();
  await page.goto(BASE + '/app');
  await page.getByText("2 planned steps from an earlier goal haven't run yet.").waitFor();
  state.leftover = [];
  await page.getByRole('button', { name: 'Run all 2 now' }).click();
  await page.getByText('Post queued.').waitFor();
  assert.deepEqual(state.ran, ['t1', 't2'], 'oldest step first');
  await ctx.close();
});

await check('signed-out visitor is sent from /app to /login', async () => {
  const ctx = await browser.newContext();
  const page = await ctx.newPage();
  await page.route(/fonts\./, (r) => r.abort());
  await page.goto(BASE + '/app');
  await page.waitForURL('**/login');
  await ctx.close();
});

await browser.close();
for (const r of results) console.log(r.join('  '));
const failed = results.filter((r) => r[0] === 'FAIL').length;
console.log(`${results.length - failed}/${results.length} passed`);
process.exit(failed ? 1 : 0);
