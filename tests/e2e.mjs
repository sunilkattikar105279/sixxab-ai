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
  // Start your business: header tab and stage buttons lead to sign-in, and the page talks about businesses
  assert.equal(await page.getByRole('link', { name: 'Start your business' }).first().getAttribute('href'), '/login?next=start');
  assert.equal(await page.getByRole('link', { name: /Start my business/ }).first().getAttribute('href'), '/login?next=start');
  assert.equal(await page.getByRole('link', { name: /Run my business/ }).first().getAttribute('href'), '/login?next=run');
  assert.ok(!/\bcompan(y|ies)\b/i.test(await page.locator('body').innerText()), 'no "company" left on the page');
  // Investor relations link
  assert.equal(await page.getByRole('link', { name: 'Investors' }).first().getAttribute('href'), '/investors');
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

await check('investor page tells the story without offering terms', async () => {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const page = await ctx.newPage();
  await page.route(/cloudfront\.net|fonts\.(googleapis|gstatic)\.com/, (r) => r.abort());
  await page.goto(BASE + '/investors', { waitUntil: 'networkidle' });
  const text = await page.locator('body').innerText();
  assert.match(text, /The autonomous business platform for founders/);
  assert.match(text, /not an offer to sell/);
  assert.ok(!/valuation|pre-money|\$100,000|equity|invest now/i.test(text), 'no round terms on a public page');
  assert.match(await page.getByRole('link', { name: 'Request the deck' }).last().getAttribute('href'), /^mailto:/);
  const overflow = await page.setViewportSize({ width: 390, height: 844 }).then(() => page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth));
  assert.ok(overflow <= 1, `horizontal overflow ${overflow}px`);
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
    return r.fulfill({ json: { agents: [{ id: 'cmo', name: 'CMO agent', layer: 'cxo', job: 'Owns marketing' }], taskTypes: [{ key: 'publish_post', label: 'Publish a social post', level: 2, maxLevel: 3 }], progress: [{ taskType: 'publish_post', level: 2, maxLevel: 3, streak: 12, needed: 15, proposal: null }], cost: { last30Days: { costUsd: 0.42, tasks: 6, avgPerTaskUsd: 0.07, inputTokens: 120000, outputTokens: 18000 }, byAgent: [{ agentId: 'social-poster', costUsd: 0.3, tasks: 4 }] }, tasks: state.leftover ?? [] } });
  });
  await ctx.route('**/api/me', (r) => r.fulfill({ json: { label: 'x', admin: Boolean(state.admin) } }));
  await ctx.route('**/api/governance', async (r) => {
    if (!state.admin) return r.fulfill({ status: 403, json: { error: 'Admins only' } });
    if (r.request().method() === 'POST') {
      const b = r.request().postDataJSON(); (state.govPosts = state.govPosts ?? []).push(b);
      return r.fulfill({ json: b.action === 'review' ? { taskId: 'rv1', status: 'done', output: 'CFO review: Radhakrishna Ortho margin is thin.' } : { fixedCosts: b.fixedCosts } });
    }
    const governance = {
      generatedAt: new Date().toISOString(),
      status: { overall: 'amber', checks: [{ key: 'model', label: 'AI model', state: 'green', detail: 'Configured' }, { key: 'failures', label: 'Failed actions, last 24 hours', state: 'amber', detail: '1 failed' }] },
      journey: { businesses: 2, byStage: { startup: 2, struggle: 0, scale: 0, success: 0, significance: 0, sixxab: 0 }, onboarded: 1, stepsDone: 4, stepsTotal: 42, pendingApprovals: 1, oldestApprovalHours: 5,
        businessesList: [{ orgId: 'o1', name: 'SIXXAB AI', stage: 'startup', onboarded: true, stepsDone: 4, pending: 1 }, { orgId: 'o2', name: 'Radhakrishna Ortho', stage: 'startup', onboarded: false, stepsDone: 0, pending: 0 }] },
      workflows: { tasks7d: { done: 5 }, delivered7d: 2, failed7d: 1 },
      integrations: [{ tool: 'reply_comment', sent: 1, recorded: 0, failed: 1, lastError: 'LinkedIn reply failed: Bad request' }],
      data: { counts: { orgs: 2, tasks: 30 } },
      security: { healthcareBusinesses: 1, controls: [{ key: 'rls', label: 'Row-level security on workspace tables', ok: true, detail: '9 tables' }], recentChanges: [] },
      code: { files: 52, lines: 5285, tests: 72, e2e: 9, apiRoutes: 15 }, pipeline: { env: 'production', sha: 'abcdef1234', message: 'feat: governance' },
      cost: { modelUsd30d: 1.25, fixedMonthlyUsd: 80, totalMonthlyUsd: 81.25, fixedCosts: { Vercel: 20 }, inrPerUsd: 85,
        byBusiness: [{ orgId: 'o2', name: 'Radhakrishna Ortho', plan: { name: 'Pilot', monthlyFee: 8500, currency: 'INR' }, modelUsd: 0.25, fixedUsd: 16, costUsd: 16.25, revenueUsd: 100, marginUsd: 83.75 }] },
    };
    return r.fulfill({ json: { governance, reviewers: [{ id: 'cto', title: 'Architecture review' }, { id: 'cfo', title: 'Tech cost review' }] } });
  });
  await ctx.route('**/api/billing', async (r) => {
    if (!state.admin) return r.fulfill({ status: 403, json: { error: 'Admins only' } });
    state.billing = state.billing ?? { plan: null, invoices: [] };
    if (r.request().method() === 'POST') {
      const b = r.request().postDataJSON(); (state.billPosts = state.billPosts ?? []).push(b);
      if (b.action === 'plan') state.billing.plan = { name: b.name, monthlyFee: Number(b.monthlyFee), currency: b.currency };
      if (b.action === 'draft') state.billing.invoices = [{ id: 'i1', number: 'SIX-202611-ORTHO1', period: b.period, currency: 'INR', lines: [{ description: 'Pilot plan', amount: 8500 }], total: 8500, status: 'draft', createdAt: new Date().toISOString(), sentAt: null, paidAt: null }];
      if (b.action === 'status') state.billing.invoices[0].status = b.status;
      return r.fulfill({ json: { ok: true } });
    }
    return r.fulfill({ json: { businesses: [{ orgId: 'o2', name: 'Radhakrishna Ortho', location: 'Tasgaon', plan: state.billing.plan, invoices: state.billing.invoices }] } });
  });
  await ctx.route('**/api/admin', async (r) => {
    if (!state.admin) return r.fulfill({ status: 403, json: { error: 'Admins only' } });
    if (r.request().method() === 'POST') { (state.adminPosts = state.adminPosts ?? []).push(r.request().postDataJSON()); return r.fulfill({ json: { ok: true } }); }
    return r.fulfill({ json: { orgs: state.admin } });
  });
  await ctx.route('**/api/feedback', async (r) => { (state.feedback = state.feedback ?? []).push(r.request().postDataJSON()); return r.fulfill({ json: { ok: true } }); });
  await ctx.route('**/api/journey', async (r) => {
    const onboarded = Boolean(state.profile);
    state.journeyDone = state.journeyDone ?? [];
    if (r.request().method() === 'POST') {
      const b = r.request().postDataJSON();
      (state.journeyPosts = state.journeyPosts ?? []).push(b);
      if (b.action === 'complete') state.journeyDone.push(b.step);
      if (b.action === 'revenue') state.revenue = [{ month: b.month, amount: Number(b.amount), currency: 'INR' }];
    }
    const step = (id, title, agentId, hard) => {
      const done = id === 'onboard' ? onboarded : state.journeyDone.includes(id);
      const blocked = hard && !(hard === 'onboard' ? onboarded : state.journeyDone.includes(hard));
      return { id, stage: 'Start', title, summary: `${title} summary`, agentId, agents: 'Agent', ownerDecides: 'You decide', output: 'Output', goal: `${title} goal`,
        status: done ? 'done' : blocked ? 'blocked' : 'ready', blockedBy: blocked ? [hard === 'onboard' ? 'Onboard' : 'Diagnose'] : [], warnings: id === 'diagnose' && !state.revenue ? ['Record last month\u2019s revenue'] : [], doneAt: done ? new Date().toISOString() : null };
    };
    const journey = {
      stage: { key: 'struggle', name: 'Struggle', head: 'Start', level: '$10K', opensAt: 'a $10K month', summary: '$10K months, building to $50K', live: true },
      nextGate: 'Next gate: the Scale level.',
      stages: [{ key: 'startup', name: 'Startup', head: 'Start', level: '$0', opensAt: 'Day one', summary: '', live: true }, { key: 'struggle', name: 'Struggle', head: 'Start', level: '$10K', opensAt: 'a $10K month', summary: '', live: true }, { key: 'scale', name: 'Scale', head: 'Scale', level: '$50K', opensAt: 'a $50K month', summary: '', live: true }],
      steps: [step('onboard', 'Onboard', null, null), step('diagnose', 'Diagnose', 'health-check', 'onboard'), step('restart', 'Restart', 'niche-offer', 'diagnose')],
      revenue: { currency: 'INR', months: state.revenue ?? [], bestRecentMonthUsd: state.revenue ? 5294 : 0, last12Usd: state.revenue ? 5294 : 0, inrPerUsd: 85 },
      milestones: [{ key: 'profile_saved', title: 'Business profile saved', reachedAt: onboarded ? new Date().toISOString() : null }, { key: 'first_customer', title: 'First paying customer', reachedAt: null }],
    };
    return r.fulfill({ json: { journey } });
  });
  await ctx.route('**/api/profile', async (r) => {
    const sections = [
      { title: 'Basics', fields: [{ key: 'name', label: 'Business name', kind: 'text', required: true }, { key: 'industry', label: 'Industry', kind: 'choice', options: ['Healthcare: hospital or clinic', 'Technology or software'] }] },
      { title: 'Offer', fields: [{ key: 'offer', label: 'What you sell', kind: 'long', required: true }, { key: 'revenueMonthly', label: 'Revenue last month', kind: 'number' }] },
    ];
    const completeness = () => ({ percent: state.profile ? 75 : 0, missing: state.profile ? ['Revenue last month'] : ['Business name'] });
    if (r.request().method() === 'POST') { state.profile = r.request().postDataJSON(); return r.fulfill({ json: { profile: state.profile, completeness: completeness() } }); }
    return r.fulfill({ json: { profile: state.profile ?? null, sections, completeness: completeness() } });
  });
  await ctx.route('**/api/activity', (r) => r.fulfill({ json: { events: [{ id: 'e1', at: new Date().toISOString(), actor: 'social-poster', action: 'approval.requested', detail: { summary: 'Post on linkedin' } }, { id: 'e2', at: new Date().toISOString(), actor: 'social-poster', action: 'tool.executed', detail: { tool: 'publish_post', summary: 'Post on linkedin', result: 'Posted on LinkedIn: https://www.linkedin.com/feed/update/urn:li:share:1' } }] } }));
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
  await page.getByLabel('Sign-in code').waitFor();
  assert.equal(state.otp[0].email, 'founder@acme.com');
  await page.getByLabel('Sign-in code').fill('000000');
  await page.getByRole('button', { name: 'Sign in' }).click();
  await page.getByText(/wrong or has expired/).waitFor();
  await page.getByLabel('Sign-in code').fill('123456');
  await page.getByRole('button', { name: 'Sign in' }).click();
  await page.waitForURL('**/app');
  await page.getByText('Your steps').waitFor();
  await page.getByRole('button', { name: 'Today', exact: true }).click();
  await page.getByText('What should your business get done?').waitFor();
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
  await page.getByLabel('Sign-in code').waitFor();
  assert.equal(state.otp[0].phone, '+918600020434');
  await page.getByLabel('Sign-in code').fill('123456');
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
  await page.getByText('Start your business on SIXXAB').waitFor();
  await page.getByLabel(/Business name/).fill('SIXXAB AI');
  await page.getByLabel('Industry').selectOption('Technology or software');
  await page.getByRole('button', { name: 'Next' }).click();
  await page.getByLabel(/What you sell/).fill('AI agents that run your business');
  await page.getByRole('button', { name: 'Save profile' }).click();
  assert.equal(state.profile.name, 'SIXXAB AI');
  assert.equal(state.profile.industry, 'Technology or software');
  // Journey: onboarding done unlocks Diagnose; Restart stays blocked until Diagnose is done
  await page.getByText('Milestone reached:').waitFor();
  await page.getByText('Finish first: Diagnose').waitFor();
  await page.getByText('Record last month\u2019s revenue').waitFor();
  await page.screenshot({ path: `${SHOTS}/app-journey.png`, fullPage: true });
  await page.getByRole('button', { name: 'Mark done' }).first().click();
  await page.getByText('Finish first: Diagnose').waitFor({ state: 'detached' });
  assert.deepEqual(state.journeyPosts.at(-1), { action: 'complete', step: 'diagnose' });
  await page.getByLabel(/Revenue \(INR\)/).fill('450000');
  await page.getByRole('button', { name: 'Save revenue' }).click();
  await page.getByText('₹4,50,000').waitFor();
  await page.getByText('(at ₹85 per $)').waitFor();
  assert.equal(state.journeyPosts.at(-1).action, 'revenue');
  await page.getByRole('button', { name: 'Today', exact: true }).click();
  await page.getByText('About your business').waitFor();
  await page.getByText('Profile 75% complete').waitFor();
  await page.getByLabel('Goal').fill('Plan our launch week');
  await page.getByRole('button', { name: 'Hand it to the agents' }).click();
  await page.getByText('Plan saved.').waitFor();
  await page.getByText('Post queued.').waitFor();
  assert.deepEqual(state.ran, ['t1', 't2'], 'each step runs as its own request, in order');
  // Feedback on a result goes back to the agent
  await page.getByRole('button', { name: 'Needs work' }).first().click();
  await page.getByPlaceholder('What should change next time?').fill('Shorter, and mention Tasgaon');
  await page.getByRole('button', { name: 'Send' }).click();
  await page.getByText('Thanks. The agent will use this next time.').waitFor();
  assert.deepEqual(state.feedback[0], { taskId: 't1', rating: 'down', reason: 'Shorter, and mention Tasgaon' });
  await page.getByRole('button', { name: /Review 1 item waiting for your yes/ }).waitFor();
  await page.getByRole('button', { name: /^Approvals/ }).click();
  await page.getByLabel('text').fill('We are live! Book a call at sixxab.ai');
  await page.getByRole('button', { name: 'Approve with my edits' }).click();
  await page.getByText('All clear').waitFor();
  assert.equal(state.decisions[0].approved, true);
  assert.equal(state.decisions[0].edited.text, 'We are live! Book a call at sixxab.ai');
  await page.getByRole('button', { name: 'Agents' }).click();
  await page.getByText('12 of 15 approvals with no edits').waitFor();
  await page.getByRole('heading', { name: 'Cost' }).waitFor();
  await page.getByText('$0.420').waitFor();
  assert.equal(await page.getByText('Businesses and workflows').count(), 0, 'admin panel hidden for non-admins');
  assert.equal(await page.getByRole('button', { name: 'Governance' }).count(), 0, 'Governance tab hidden for non-admins');
  await page.getByText('L2 Approve').waitFor();
  await page.screenshot({ path: `${SHOTS}/app-agents.png` });
  await page.getByRole('button', { name: 'Activity' }).click();
  await page.getByText(/approval requested/).waitFor();
  const receipt = page.getByRole('link', { name: 'https://www.linkedin.com/feed/update/urn:li:share:1' });
  await receipt.waitFor();
  if ((await receipt.getAttribute('rel')) !== 'noopener noreferrer') throw new Error('receipt link must open safely in a new tab');
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
  await page.getByRole('button', { name: 'Today', exact: true }).click();
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

await check('admin assigns each business its own n8n workflow', async () => {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const state = { otp: [], decisions: [], pending: [], profile: { name: 'SIXXAB AI', offer: 'Agents' }, admin: [{ orgId: 'org-ortho-1234', name: 'Radhakrishna Ortho', path: null }] };
  await mockServices(ctx, state);
  await ctx.addInitScript(() => localStorage.setItem('sixxab.session', JSON.stringify({ accessToken: 'at', refreshToken: 'rt', expiresAt: Math.floor(Date.now() / 1000) + 3600, user: { id: 'u1', email: 'sunil.kattikar@gmail.com' } })));
  const page = await ctx.newPage();
  await page.goto(BASE + '/app');
  await page.getByRole('button', { name: 'Agents', exact: true }).click();
  await page.getByText('Businesses and workflows').waitFor();
  await page.getByLabel('Workflow path for Radhakrishna Ortho').fill('ortho-tasgaon');
  await page.getByRole('button', { name: 'Save' }).click();
  await page.getByText('Saved').waitFor();
  assert.deepEqual(state.adminPosts[0], { orgId: 'org-ortho-1234', path: 'ortho-tasgaon' });
  // Governance: single pane, costs, CXO review
  await page.getByRole('button', { name: 'Governance', exact: true }).click();
  await page.getByText('Platform is running with warnings').waitFor();
  await page.getByText('LinkedIn reply failed: Bad request').waitFor();
  await page.getByText('$83.75').waitFor();
  await page.getByLabel('Monthly cost for Vercel').fill('25');
  await page.getByRole('button', { name: 'Save costs' }).click();
  await page.getByText('Saved').waitFor();
  assert.deepEqual(state.govPosts[0], { action: 'costs', fixedCosts: { Vercel: 25 } });
  await page.getByRole('button', { name: 'CFO: Tech cost review' }).click();
  await page.getByText('CFO review: Radhakrishna Ortho margin is thin.').waitFor();
  await page.screenshot({ path: `${SHOTS}/app-governance.png`, fullPage: true });
  // Billing: plan, draft invoice, mark paid
  await page.getByRole('button', { name: 'Billing', exact: true }).click();
  await page.getByLabel('Plan name for Radhakrishna Ortho').fill('Pilot');
  await page.getByLabel('Monthly fee for Radhakrishna Ortho').fill('8500');
  await page.getByLabel('Currency for Radhakrishna Ortho').selectOption('INR');
  await page.getByRole('button', { name: 'Save plan' }).click();
  await page.getByRole('button', { name: 'Draft invoice' }).click();
  await page.getByText('SIX-202611-ORTHO1').waitFor();
  await page.getByRole('button', { name: 'Mark paid' }).click();
  await page.getByText('paid', { exact: true }).waitFor();
  assert.deepEqual(state.billPosts.map((b) => b.action), ['plan', 'draft', 'status']);
  await page.screenshot({ path: `${SHOTS}/app-billing.png`, fullPage: true });
  await ctx.close();
});

await check('fundraising: set a priced round and a founding-member campaign', async () => {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const state = { otp: [], decisions: [], pending: [], profile: { name: 'SIXXAB AI', offer: 'Agents' }, admin: [] };
  await mockServices(ctx, state);
  const posts = [];
  const step = (id, track, title, status) => ({ id, track, title, summary: `${title} summary`, agentId: 'cfo', owner: 'Founder', status, blockedBy: status === 'blocked' ? ['Round terms'] : [], goal: `Do ${title}` });
  const raise = {
    round: null, investors: [], campaign: null, pipeline: {},
    totals: { target: 0, committed: 0, funded: 0, preorders: 0, pctCommitted: 0, dilutionPct: null, postMoney: null },
    steps: [step('model', 'Prepare', 'Financial model and runway', 'ready'), step('list', 'Raise', 'Target investor list', 'blocked'), step('po-offer', 'Pre-orders', 'Founding-member offer', 'ready')],
  };
  await ctx.route('**/api/raise', async (route) => {
    if (route.request().method() === 'POST') {
      const b = JSON.parse(route.request().postData() || '{}');
      posts.push(b);
      if (b.action === 'round') Object.assign(raise, { round: { ...b.round, target: Number(b.round.target), preMoney: Number(b.round.preMoney) }, totals: { ...raise.totals, target: 100000, dilutionPct: 0, postMoney: 2000000 } });
      if (b.action === 'campaign') Object.assign(raise, { campaign: { ...b.campaign, goal: 50000, pledged: 0, backers: 0 } });
    }
    await route.fulfill({ json: { raise, sources: [{ id: 'csv', name: 'CSV import', kind: 'Investor lists', status: 'live', url: '', use: 'Paste lists.' }] } });
  });
  await ctx.addInitScript(() => localStorage.setItem('sixxab.session', JSON.stringify({ accessToken: 'at', refreshToken: 'rt', expiresAt: Math.floor(Date.now() / 1000) + 3600, user: { id: 'u1', email: 'founder@example.com' } })));
  const page = await ctx.newPage();
  await page.goto(BASE + '/app');
  await page.getByRole('button', { name: 'Fundraising', exact: true }).click();
  await page.getByText('Plan your raise').waitFor();
  await page.getByLabel('Target (USD)').fill('100000');
  await page.getByLabel('Pre-money valuation (USD)').fill('1900000');
  await page.getByText('investors get 5%').waitFor();
  await page.getByRole('button', { name: 'Save round' }).click();
  await page.getByText('$2,000,000 post-money').first().waitFor();
  assert.equal(posts[0].round.instrument, 'priced');
  await page.getByLabel('Goal (USD)').fill('50000');
  await page.getByLabel('Tier name').fill('Founding member');
  await page.getByLabel('Tier 1 price').fill('1500');
  await page.getByLabel('What the backer gets').fill('3 months of the Founder plan');
  await page.getByRole('button', { name: 'Save campaign' }).click();
  await page.getByText('Founding members: Planning').waitFor();
  assert.deepEqual(posts[1].campaign.tiers, [{ name: 'Founding member', reward: '3 months of the Founder plan', price: '1500' }]);
  await page.screenshot({ path: `${SHOTS}/app-fundraising.png`, fullPage: true });
  await ctx.close();
});

await browser.close();
for (const r of results) console.log(r.join('  '));
const failed = results.filter((r) => r[0] === 'FAIL').length;
console.log(`${results.length - failed}/${results.length} passed`);
process.exit(failed ? 1 : 0);

