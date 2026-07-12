# Tempo project skills

Project skills live in `.claude/skills/<name>/SKILL.md`. Each auto-loads for the whole crew (and CI),
so the team's expertise compounds. Akram can also install any of these standalone via
**Settings → Capabilities**. Each skill's frontmatter states *when* to use it.

Rule for authoring: ground every skill in named sources (WCAG, OWASP, NN/g, the test pyramid, our
`ai-os/CONSTITUTION.md` + `ai-os/REFERENCES.md`) — not opinion. Keep it tight and actionable
(checklists + do/don't + skeletons), one skill per subfolder (no collisions between builders).

## Index

| Skill | When to use | Source |
| --- | --- | --- |
| [`tempo-finish-gate`](tempo-finish-gate/SKILL.md) | Preparing a Tempo PR, reviewing another builder's PR, or deciding GO / NO-GO — the exact pre-merge checklist mirroring `ci.yml` (build, dist-drift, npm test, scope-guard) plus human review lanes. | Internal — `ci.yml`, CLAUDE.md, Constitution |
| [`tempo-frontend-craft`](tempo-frontend-craft/SKILL.md) | Building or polishing ANY UI in `src/js/ui/**`, `src/js/app.js`, or `src/css/**` — WBK V3 tokens, responsive, spacing/type scale, a11y (WCAG 2.2), motion, RTL + both themes, anti-slop. | Internal — WBK V3 tokens, WCAG 2.2, NN/g |
| [`tempo-secure-data`](tempo-secure-data/SKILL.md) | Touching auth, sessions, Supabase RLS, SQL migrations, `WP.db` access, or anything handling real people/evaluations — sign-in flows, RLS predicates, secret hygiene, ethics invariants. | Internal — OWASP, Supabase RLS, Constitution |
| [`tempo-test-playbook`](tempo-test-playbook/SKILL.md) | Adding/changing behaviour in `src/**`, writing a `test/verify-*.js` suite, touching auth/access/RLS, editing `build.js` or workflows, or before any PR — which test at which layer + the pre-push ritual. | Internal — test pyramid, CI, ESCAPE-LEARNING |
| [`design-taste-frontend`](design-taste-frontend/SKILL.md) | Frontend *visual* work — landing/marketing pages, portfolios, redesigns; anti-slop design direction. (Not for Tempo's dashboards/data tables — for those use `tempo-frontend-craft` + WBK tokens.) | External — [Leonxlnx/taste-skill](https://github.com/Leonxlnx/taste-skill), MIT (see [LICENSE](design-taste-frontend/LICENSE)) |

## Attribution

`design-taste-frontend/SKILL.md` is copied faithfully from the MIT-licensed
[Leonxlnx/taste-skill](https://github.com/Leonxlnx/taste-skill) (`skills/taste-skill/SKILL.md`). The
MIT license text is kept alongside it at `design-taste-frontend/LICENSE`. We vendor it (rather than
depend on it) so the design bar is versioned in-repo and reviewed like our own code.
