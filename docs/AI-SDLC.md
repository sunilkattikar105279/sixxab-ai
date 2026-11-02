# SIXXAB AI SDLC with ECC

How SIXXAB builds, tests and ships agents with AI coding agents (Claude Code, Codex, Cursor) using
[ECC](https://github.com/affaan-m/ECC) as the harness.

## Why ECC

ECC packages what an AI coding agent needs to work like a disciplined engineering team: specialist
subagents (planner, TDD guide, reviewers, security), slash commands, skills, rules, and a continuous
learning loop that turns each session's lessons into reusable instincts. It is MIT-licensed, so the
subset we use is vendored into `.claude/` and pinned (`.claude/ECC-VERSION`).

## Setup for a developer

1. Clone this repo. The vendored agents, commands, skills and rules in `.claude/` work immediately in Claude Code.
2. Optional, for ECC's hooks and continuous learning (instincts): install the official plugin at project scope.
   Review the release first; install only from the official sources listed in ECC's README.
   ```bash
   npx ecc-universal@2.2.3 setup     # choose "Project" scope, "Standard" hooks
   ```
3. Run the checks once: `npm test && npm run typecheck && npm run build`.

## The loop for every agent or feature

| Step | What happens | ECC piece |
| --- | --- | --- |
| 1. Research | Read the Agent Build Plan row for the agent; check existing role cards, tools and tests | `search-first` skill |
| 2. Plan | Role card, tools, task types, autonomy start level, tests to write | `/plan`, `planner`, `architect` |
| 3. Test first | Scripted-model tests: happy path, approval pause, rejection, tool outside the role card | `tdd-guide`, `tdd-workflow` |
| 4. Build | Role card in `core/agents.ts`; tools in `core/tools.ts`; task types in the migration | `code-architect` |
| 5. Verify | Typecheck, unit tests, build, browser checks | `verification-loop`, `e2e-runner` |
| 6. Review | Code, TypeScript, React, SQL, security; clinical safety for healthcare | `/code-review`, `security-reviewer`, `database-reviewer`, `healthcare-reviewer` |
| 7. Evaluate | Run eval cases built from edited approvals; score agent output | `agent-eval`, `eval-harness`, `agent-evaluator` |
| 8. Ship | PR, Vercel preview, promote to production | `/security-scan` before merge |
| 9. Learn | Capture what worked into instincts and rules | `/learn`, `/learn-eval`, `/evolve` |

## Definition of done for an agent

- [ ] Role card with job, stage, `reportsTo`, model tier and an explicit tool list
- [ ] Every tool that acts outside the agent names a task type with a safe starting level
- [ ] Tests: completes a task; pauses for approval; handles rejection; cannot use tools outside its card
- [ ] Eval cases exist (or are planned) from real approvals
- [ ] `security-reviewer` pass; `healthcare-reviewer` pass if it can see patient data
- [ ] Shows correctly in the workspace (Approvals, Agents, Activity)

## Two learning loops, kept separate

- **Product loop** (runtime, for customers): approvals, edits and rejections feed `core/learning.ts`. They
  become eval cases and autonomy promotion proposals that a person confirms.
- **Engineering loop** (build time, for us): ECC's `/learn` and `/evolve` turn what the coding agent learned
  while building into instincts and rules for the next session.
