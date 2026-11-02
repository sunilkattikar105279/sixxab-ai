# SIXXAB AI

AI that starts, scales and runs your company. This repo is the launch: the sixxab.ai website, email and
mobile sign-in, the founder workspace (installable on phones as an app), the autonomous agent platform
core, and the starting code for the native iOS/Android app.

| Part | Where | Status |
| --- | --- | --- |
| Landing page (Start · Scale · Run, paths, agency, Startups in a Box, consultants, pricing, booking) | `design/` → `src/landing/` | Launch-ready |
| Sign-in: email code or magic link, SMS code (US, India and more) | `src/app/Login.tsx`, `src/lib/auth.ts` | Launch-ready once Supabase is set up |
| Founder workspace: goals, approvals inbox, autonomy levels, activity log, morning briefing | `src/app/Dashboard.tsx` | Launch-ready |
| Mobile app (installable web app) | `dist/manifest.webmanifest`, `dist/sw.js` | Launch-ready |
| Agent platform core: runtime, human-in-the-loop policy, orchestrator, learning loop, briefing, audit | `core/` | Tested (16 unit tests + 6 browser checks) |
| Database: tenancy, approvals, stage-gate triggers, append-only audit, RLS | `supabase/migrations/0001_core.sql` | Ready to apply |
| API (Vercel functions, zero runtime deps) | `server/api/` → `api/` | Built |
| Native app (Expo) | `mobile/` | Starter code, not yet built |
| AI SDLC harness (ECC) | `.claude/`, `CLAUDE.md`, `docs/AI-SDLC.md` | Set up |

## Launch checklist

1. **Supabase**: create a project (US region; add an India project later for Indian healthcare data).
   - SQL editor → run `supabase/migrations/0001_core.sql`.
   - Authentication → Providers: enable **Email** (OTP length 6). In the email template, include `{{ .Token }}` so people get the code as well as the link.
   - Authentication → Providers → **Phone**: enable and connect an SMS provider (Twilio, MessageBird, Vonage or Textlocal for India).
   - Authentication → URL configuration: Site URL `https://sixxab.ai`, redirect URL `https://sixxab.ai/app`.
2. **Vercel**: import this repo. Settings come from `vercel.json` (no build step: `dist/` and `api/` are committed).
   Add the environment variables in `.env.example`.
3. **Domain**: Vercel → Domains → add `sixxab.ai` and `www.sixxab.ai`, then set the DNS records Vercel shows at your registrar.
4. **Booking**: create a Google Calendar appointment schedule and set `BOOKING_URL`.
5. **Automations** (optional at launch): point `N8N_WEBHOOK_URL` at an n8n workflow that sends posts, messages and emails.
   Until then, approved actions are logged but not sent.
6. Check `https://sixxab.ai/api/health`: every value should be `true`.

## Develop

```bash
npm test && npm run typecheck      # core tests + strict types
npm run convert                    # regenerate the landing page from design/Landing.dc.html
npm run build                      # dist/ + api/
node scripts/dev-server.mjs 4173   # local preview
node tests/e2e.mjs http://localhost:4173
```

How we build with AI coding agents: [`docs/AI-SDLC.md`](docs/AI-SDLC.md). Rules for agents: [`CLAUDE.md`](CLAUDE.md).

## Native app

```bash
cd mobile && npm install && npx expo start      # run on a phone with Expo Go
npx eas build -p ios && npx eas build -p android # store builds (needs an Expo account + Apple/Google developer accounts)
```
