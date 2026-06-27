# CLAUDE.md — Tempo project guide for AI assistants

This file is read automatically each session. Follow it for every task. Keep it accurate.

## What Tempo is
Internal Workforce-Intelligence / Operations web app for **Webook Event Operations** —
org/workload map, capacity & team-health, performance evaluations (manager + self + 360),
daily tasks, role dashboards, Super-Admin/permissions. EN + AR (RTL/LTR), light/dark, WBK tokens.

- Live: https://akram-webook.github.io/tempo/ · Repo: https://github.com/akram-webook/tempo (`main`)
- Stack: **vanilla HTML/CSS/JS, no framework**, single global namespace `window.WP`.

## Operating System — route every task through it
Tempo runs on **TAOS — the Tempo AI Operating System** (`/ai-os/`).
- **Supreme law: `ai-os/CONSTITUTION.md`** (Articles I–VIII). Nothing may violate it. Key articles:
  Purpose (improve decisions, not reporting), Human-First (track work, never surveil people),
  Simplicity (simpler wins absent evidence), Evidence (no feature/metric without a decision it serves),
  Trust (explainable + traceable), Quality (survive independent challenge).
- **The 24 Books index: `ai-os/BOOKS.md`** (each maps to a folder; tight now, grows on-demand).
- **Every task enters through `ai-os/19-ai-orchestrator/`**, which right-sizes process to task
  size (XS/S/M/L) so quality rises without bureaucracy.
- Also read `ai-os/00-governance/PRINCIPLES.md`, `ai-os/18-executive-reviews/ANTI-PATTERNS.md`
  (things Tempo NEVER does), and `ai-os/VISION.md` (Tempo = a Digital COO).
- Before proposing/re-debating, check **AI Memory** (`ai-os/15-knowledge-base/AI-MEMORY.md`).
- For M/L tasks, an idea must survive the **Council of Critics**
  (`ai-os/10-ai-agents/COUNCIL-OF-CRITICS.md`) — agents that try to BREAK it, not approve it.
- Ground every standard in **`ai-os/REFERENCES.md`** (Google Eng Practices, SRE, Microsoft SDL,
  OWASP, WCAG 2.2, NN/g, DORA, Team Topologies, C4, Working Backwards) — official sources, not opinion.
- **Every production issue is an Escape** (`ai-os/05-qa/ESCAPE-LEARNING.md`): ask "why did our system
  let this through?", not "why did the AI err". Blameless — classify the gap, set maturity (L1–L4),
  root-cause it, log it in the Failure Library, and close it only when a permanent test/rule prevents
  recurrence. The metric that matters is a falling Escape Rate, not work completed.

## How we work on this project (standing method — do this every task, don't wait to be asked)
1. **Skills first.** Check available skills and apply the relevant ones — especially
   `world-class-first`, `multi-expert-review` / `tempo-multi-expert-system`, `ui-polish`,
   `senior-product-designer`, `product-resilience`.
2. **Run it through the world-class expert lenses** before and during the build:
   - **QA** — risk-based testing, test pyramid, severity triage, CI quality gates; add/extend a
     `test/verify-*.js` suite for anything non-trivial.
   - **Product** — JTBD, is this the right thing, what's the simplest version that delivers it.
   - **Designer** — UX/UI craft, visual hierarchy, accessibility (WCAG), and every state
     (empty / loading / error / success). Icons are inline SVG — **never emojis as icons**.
   - **Backend** — data shape, validation, failure handling.
   - **Solutions Architect** — scalability, data model, failure modes, future-proofing.
3. **Think, then apply.** Implement, run `npm test` + `npm run build`, then ship via the repo flow.
4. **Challenge bad ideas.** If a request isn't a good idea, say so honestly and propose a better
   path — don't just comply.
5. **Proactively suggest.** Each task, drop ideas / recommendations that would improve the project.

## Architecture (follow it)
- Load order in `index.html`: **data → core → ui → app**.
- State is the single source of truth: `WP.state`. Views never hand-mutate the DOM globally — they
  call `WP.setState(patch)` (which persists + calls `WP.render()`). Routing = `WP.state.route`.
- Strings live in `src/js/core/i18n.js` as `{ en, ar }`, read via `WP.i18n.t('key')`.
- Access/roles in `src/js/core/access.js` (`canManage`/`hasAccess`/`isSuperAdmin`); Super Admin = akram@webook.com.
- Persistence: `core/persist.js` (user's work → localStorage `tempo_data`); session in `core/state.js` (`tempo_session`).
- Auth (live): verified sign-in **link** via Supabase (`core/config.js` holds the public URL +
  publishable key); `WP.auth.initSession()` (in `app.js`) consumes the link's session and maps the
  email to a registered person. A typed 6-digit code would need custom SMTP (see `ACCESS-SETUP.md`).

## Layout
`index.html` (dev shell + ordered script tags) · `build.js` (bundles src → `dist/index.html`) ·
`watch.js` (auto-rebuild) · `src/css/{tokens,app}.css` · `src/js/{data,core,ui}/**` ·
`src/js/app.js` (boot + shell + routing) · `test/verify-*.js` (jsdom suites) · `docs/**`.

## GOLDEN RULES
1. **Edit `src/**` only. Never hand-edit `dist/index.html`** — it is generated by `build.js`.
2. After changing `src/**`: `npm run build` then `npm test` — both green, zero console errors — before commit.
3. **Never commit secrets.** Supabase URL + `sb_publishable_…` key are public-safe and fine to keep.
   Never put the `service_role` key (or any private key) in the front-end or repo.
4. Don't regress verified sign-in (`login.js` + `WP.auth.initSession`).
5. Branch + PR per task. Don't push broken builds to `main`. Don't merge to `main` without Akram's OK.

## Commands
```bash
npm install            # one time (jsdom only)
npm run watch          # terminal 1: rebuild dist/ on every save under src/
npm test               # all 5 jsdom suites
npm run build          # bundle src → dist/index.html
git add -A && git commit -m "…" && git push   # push to main = CI builds + tests + deploys
```

## Definition of done (every task)
Builds clean · all tests green (+ a new/updated test if behavior changed) · all UI states handled ·
EN+AR strings added · no emojis-as-icons · no secrets · committed on a branch with a clear PR · a
one-line note of any follow-up idea or risk you noticed.
