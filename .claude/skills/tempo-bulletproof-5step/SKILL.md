---
name: tempo-bulletproof-5step
description: >
  The 5-step "build it, then try to break it, then make it unbreakable" loop for
  any Tempo change — Deep Dive → Implement → Chaos Test → Root Cause → Bulletproof
  Fix. Turns a feature from "works on the happy path" into "survives the edges,
  and a regression test guarantees it stays fixed." USE WHEN adding or changing a
  feature (a filter, a layout, a control, an engine rollup), fixing a reported
  bug, or any time the user asks for work that must be "resilient", "bulletproof",
  "stress-tested", or "not break again". Pairs with tempo-test-playbook (which
  test at which layer) and tempo-live-verify (prove it in a real browser).
---

# Tempo — The Bulletproof 5-Step

A discipline, not a vibe. Every non-trivial change runs the same loop. You are not done when it
works — you are done when you **tried to break it, understood any break, fixed the cause, and left a
test that fails if the break ever returns.** Grounded in the scientific method, Chaos Engineering
(principlesofchaos.org), the test pyramid, Toyota's 5-Whys root-cause, and our
`ai-os/CONSTITUTION.md` + `docs/ESCAPE-LEARNING`.

Report back to the user in these five headed sections — it makes the rigor visible.

## 1. Deep Dive & Research
Understand the concept before touching code. Don't reinvent; find the standard.
- Name the principle and its **authoritative source** (WCAG 2.2 for a11y; NN/g + Hick's Law / Fitts's
  Law / Miller's Law for IA and controls; the test pyramid for coverage; OWASP for anything touching
  auth/data). Ground the choice in a named source, never opinion (repo rule, `.claude/skills/README.md`).
- Read the code you're about to change **and its tests** first. Find the existing seam (e.g. the
  capacity engine's `windowBounds`, the sales engine's `months` array) — extend it, don't fork it.
- State the constraints up front: RTL + both themes, `prefers-reduced-motion`, DOM-free core
  (`test/verify-architecture.js`), no secret values in the bundle, tests that assert the current shape.
- Decide *whether* the concept even applies. A custom date range fits a **cumulative** metric
  (revenue over time); on a **point-in-time snapshot** (capacity load) it means "averaged over the
  window" — say so, and pick the honest divisor. Research can conclude "don't bolt it on."

## 2. Implementation
Build the standard solution against that seam.
- Smallest change that fully does the job. Presentation in `ui/**`, aggregation in DOM-free `core/**`.
- Bake the guards in from the first draft (see §3's list) — don't "add validation later."
- Keep parity as you type: EN + AR strings, logical CSS properties (`inset-inline-*`), tokens not
  hex, keyboard + `aria-*` on every control.

## 3. Chaos Testing (actively try to break it)
Assume the happy path works; hunt the edges. Be adversarial with your *own* code.
Run this checklist against every input and every control:
- **Boundaries**: 0, 1, the max, one past the max, empty, the whole set.
- **Inverted / nonsense order**: from > to; end before start; negative; descending.
- **Empty result**: a filter combination that matches nothing → is there a real empty state, or NaN /
  `Infinity` / blank chart / divide-by-zero?
- **Extremes of size**: 1 item vs thousands; a 1-person org vs a 500-node tree — does layout leave
  dead space, or overflow the viewport sideways?
- **State thrash**: toggle A→B→A fast; switch away and back; does prior state leak or reset wrongly?
- **Locale/RTL/theme**: does it hold in Arabic, RTL mirroring, and both themes?
- **Responsive**: 375px mobile → wide desktop; any horizontal body scroll or clipped text?
- **Access**: a viewer who should NOT see it — is it gated (defence in depth), not just hidden?
How: jsdom for logic (`test/verify-*.js`), the in-app browser for pixels/interaction
(`tempo-live-verify`). Grep the rendered HTML for `/NaN|Infinity|undefined/`; assert no horizontal
overflow (`scrollWidth <= innerWidth`). **Write the failing case down** — it becomes §5's test.

## 4. Root Cause Analysis
When something breaks, explain it plainly — the mechanism, not the symptom.
- Trace it to the true cause with 5-Whys. "The M was cut off" → because the value overflowed →
  because the font was too big for the card → because the neighbour's opaque background painted over
  the overflow. The cause is the layout, not the glyph.
- Name the class of bug (off-by-one, cascade/specificity order, unguarded divide, missing empty
  state, orphaned grid item) so the fix generalises beyond this one instance.
- Distinguish *your* new defect from a *pre-existing* one — never quietly absorb someone else's bug
  into your diff; flag it (ESCAPE-LEARNING).

## 5. Bulletproof Fix
Fix the cause, then prove it can't come back.
- Fix at the root (§4), not the symptom. Prefer belt **and** braces where cheap: normalize at the UI
  *and* guard in the engine, so one layer failing can't produce a broken state.
- **Every break found in §3 earns a regression assertion** that fails on the old code and passes on
  the new — wired into `package.json` so CI runs it. A fix without a test is a fix that will regress.
- Re-run the full gate: `node build.js` (un-inlined 0/0), `npm test` green, then live-verify in
  EN + AR + mobile. Only now is it done. See `tempo-finish-gate`.

## Do / Don't
- **Do** report all five sections to the user — the visible rigor is the point.
- **Do** treat "I couldn't break it" as *not having tried hard enough* until the checklist is spent.
- **Don't** claim "bulletproof" without a regression test proving the specific break is dead.
- **Don't** widen scope silently; if research (§1) says the concept doesn't fit, say so and propose
  the honest alternative instead of shipping a confusing half-feature.
