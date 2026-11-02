# SIXXAB AI: instructions for AI coding agents

SIXXAB AI is an autonomous business platform: Founder, CXO and department agents run a company,
with a person approving anything that reaches customers or spends money. This repo holds the launch
site, email + mobile sign-in, the founder workspace (installable PWA), and the agent platform core.

## How we build: the ECC AI SDLC

We use [ECC](https://github.com/affaan-m/ECC) (MIT, pinned in `.claude/ECC-VERSION`) as the
development harness. The vendored subset lives in `.claude/` (agents, commands, skills, rules).
Every change follows this loop; see `docs/AI-SDLC.md` for the full playbook.

1. **Research first**: `search-first` skill. Check existing code and the Agent Build Plan before writing new code.
2. **Plan**: `/plan` (planner agent) for anything over ~50 lines; `architect` for cross-cutting design.
3. **Test first**: `tdd-guide` agent + `tdd-workflow` skill. Write the failing test in `tests/` first.
4. **Build**: smallest change that passes. Core logic in `core/`, HTTP in `server/api/`, UI in `src/`.
5. **Verify**: `verification-loop` skill: `npm run typecheck && npm test && npm run build && node tests/e2e.mjs`.
6. **Review**: `/code-review` + `typescript-reviewer`; `react-reviewer` for UI; `database-reviewer` for SQL;
   `security-reviewer` + `/security-scan` before every merge; `healthcare-reviewer` for anything touching patient data.
7. **Evaluate agents**: `agent-eval` / `eval-harness` skills. Edited approvals become eval cases (`core/learning.ts#evalCases`).
8. **Learn**: `/learn` and `/evolve` after each feature so the harness improves with the codebase.

Rules to follow: `.claude/rules/ecc/common/*`, `.claude/rules/ecc/typescript/*`, `.claude/rules/ecc/web/*`.

## Non-negotiables for this codebase

- **Human in the loop is enforced in two places**: the policy in `core/policy.ts` and the Postgres triggers in
  `supabase/migrations`. Never bypass either. Money tasks are capped at L2 by a database constraint.
- **Autonomy is earned per task type**, proposed by `proposePromotion`, and applied only by a person (`applyPromotion`).
- **Every action is audited**; `audit_log` is append-only.
- **No secrets in the browser.** Only `SUPABASE_URL`, `SUPABASE_ANON_KEY` and `BOOKING_URL` reach the client via `/api/config`.
- **Zero runtime dependencies** for API functions: they are bundled by `scripts/build.mjs` into `api/*.js`.
- **The landing page is generated** from the approved design (`design/Landing.dc.html`) by `scripts/convert-dc.mjs`.
  Change the design, then run `npm run convert && npm run build`. Do not hand-edit `src/landing/Landing.tsx`.
- Adding an agent = one role card in `core/agents.ts` (+ tools in `core/tools.ts` if needed). No new runtime code.

## Commands

```bash
npm test            # core unit tests (node:test via tsx)
npm run typecheck   # strict TypeScript for core/ and server/
npm run build       # dist/ (static site, prerendered) + api/ (bundled functions)
node scripts/dev-server.mjs 4173   # local preview that mirrors Vercel
node tests/e2e.mjs http://localhost:4173   # browser checks (Playwright), services mocked
```
