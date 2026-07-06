# Skills & agents (DevEx pointer)

A short index of the in-repo capabilities that shape how we build Tempo. The authoritative copies live
under `.claude/skills/` (auto-loaded for the crew + CI); this page just points humans to them.

## Project skills — [`.claude/skills/README.md`](../.claude/skills/README.md)

- **`tempo-finish-gate`** — the pre-merge checklist (build, dist-drift, npm test, scope-guard + human
  lanes); use when preparing/reviewing a PR or calling GO/NO-GO.
- **`tempo-frontend-craft`** — premium UI craft for `src/js/ui/**`, `app.js`, `src/css/**` (WBK V3
  tokens, responsive, a11y, RTL + themes, anti-slop).
- **`tempo-secure-data`** — auth, Supabase RLS, migrations, `WP.db`, secret hygiene, ethics invariants.
- **`tempo-test-playbook`** — which test at which layer + the pre-push ritual + anti-impersonation /
  dist-drift / scope-guard patterns.
- **`design-taste-frontend`** — anti-slop frontend design taste for marketing/landing/portfolio work.
  Vendored faithfully from the MIT-licensed [Leonxlnx/taste-skill](https://github.com/Leonxlnx/taste-skill)
  (`skills/taste-skill/SKILL.md`); MIT license kept alongside it. For Tempo's own dashboards, prefer the
  WBK tokens + `tempo-frontend-craft`.

## Agents

- **Tempo Agent spec (draft)** — [`gemini-agent-spec.md`](gemini-agent-spec.md): a read-only assistant
  over *permitted* data, guardrails (no surveillance, cite evidence, ranges-not-scores), first slice
  `draft-daily-checkin`. Draft only — no build authorized yet.
