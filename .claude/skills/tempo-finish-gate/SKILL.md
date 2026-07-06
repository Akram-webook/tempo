---
name: tempo-finish-gate
description: >
  Tempo's pre-merge finish-gate — the exact checklist a PR must pass before it
  can land on main, mirroring ci.yml (build, dist-drift, npm test, scope-guard)
  plus the human review lanes. USE WHEN preparing a Tempo PR, reviewing another
  builder's PR before the orchestrator does, or deciding GO / NO-GO on a change.
---

# Tempo Finish-Gate

The finish-gate is the automated + human bar every change clears before `main`. It is codified in
`ci.yml` (the required status check) and `docs/CI-CD.md`. Nothing merges by feel — it merges because
it passed the gate. For how to *write* the tests behind it, see the `tempo-test-playbook` skill.

## The automated gate (ci.yml — runs on every PR)
Run these locally before you push; if any fails, the PR cannot land.

1. **Build from source** — `node build.js` completes; "Un-inlined left: js=0 css=0".
2. **Dist-drift** — committed `dist/` equals the rebuild: `node build.js && git diff --quiet -- dist/`.
   Drift = you hand-edited dist or forgot to rebuild. QA/CI/docs PRs must not change dist at all.
3. **Test suite** — `npm test` fully green, zero unfiltered console errors. Behaviour changed ⇒ a
   new/updated `verify-*` suite ships with it, wired into `package.json`.
4. **Dist boot smoke** — `node test/verify-dist.js && node test/verify-smoke.js`: the shipped bundle
   boots clean, the login gate renders, the router lands on a valid route.
5. **Scope-guard** — no `node_modules/`/`.env` tracked; no secret *values* (`sb_secret_*`, JWTs, PEM
   private keys). Public `sb_publishable_*` URL + key are allowed.

## The human lanes (never auto-merged)
Per `docs/CI-CD.md`, these ALWAYS require Akram's review — the maintenance agent must not touch them:
- `src/js/data/**` (real/mock people data), `supabase/*.sql`, **auth / RLS**, `.github/**`, deps.
- **No AI auto-merge to main.** CI green + human approval. Real personal data lives only in Supabase,
  never the repo/bundle.

## Reviewing a PR against the gate (pre-review before the orchestrator)
Walk it top to bottom and produce a GO / NO-GO:
- [ ] Scope-scan (`git diff --stat origin/main`) shows only the files the PR *claims* to touch.
- [ ] dist: changed only if this is a src-behaviour PR — and then it's the clean rebuild, not hand-edited.
- [ ] Tests: green locally; a new assertion covers the changed behaviour; suite is wired in package.json.
- [ ] No secret values; no `node_modules`/`.env`; no real personal data in the diff.
- [ ] Touches a human-lane path? → flag for Akram, do not wave through.
- [ ] Ethics/constitution: does it surveil people, add a metric with no decision behind it, or add
      complexity without evidence? (`ai-os/CONSTITUTION.md`, `ai-os/18-executive-reviews/ANTI-PATTERNS.md`.)

## One dist PR at a time
`dist/index.html` is one generated artifact. Two open PRs that each change `src/**` both regenerate it
and will collide — serialize them. Test/CI/docs/skill PRs don't touch dist, so they merge freely on green.

## GO / NO-GO
- **GO** — all 5 automated checks pass locally, scope-scan clean, no human-lane surprise, a test covers
  the change. Report the base SHA, files, dist y/n, tests + results, scope-scan.
- **NO-GO** — any check fails. Report the **exact failing log line** (e.g. the `::error::` from CI or the
  `[assert] …` from a suite), not "tests failed". Root-cause before re-pushing.
