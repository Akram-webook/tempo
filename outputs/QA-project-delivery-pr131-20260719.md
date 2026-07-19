# QA Report — Project Delivery PR #131

Date: 2026-07-19
Tester: QA Agent (adversarial)
Scope: PR #131 — exec timeline items[] + wave cards redesign

## Verdict
**GO WITH FIXES** — one real UX defect found and fixed (BUG-001, stale-vs-empty timeline); everything else passed adversarial testing.

## Summary
PR #131's core fix (timeline reads `data.items[]`, wave cards redesigned, stats count items) is genuinely solid — 16/16 hostile-payload attacks passed with zero crashes and zero page errors, including null fields, bare `{}` items, 200 items, future dates, and rapid filter-fire. I found one defect the original brief explicitly anticipated: the timeline showed the same "Nothing in this range" message for a *stale JSON with no items[] field* as for a *legitimately empty week*, misleading a director into thinking nothing shipped. Fixed with a distinct stale message + regression test. The CI-regenerated live JSON matches the repo exactly (pipeline is self-sustaining, not a one-off seed).

## Findings table
| ID | Area | Issue | Severity | Root Cause Class | Fixed? |
|----|------|-------|----------|-----------------|--------|
| BUG-001 | Timeline empty state | items[] absent (stale JSON) rendered identically to an empty week ("Nothing in this range"), reading as "nothing shipped" | Medium (misleads director on stale data) | undefined-field-no-guard (missing-source case not distinguished) | ✅ Fixed |

## BUG-001 detail
```
BUG-001: Stale-data timeline indistinguishable from a legitimately empty week
File: src/js/ui/exec.js — timelineHTML() empty branch (was line ~242)
Reproduces:
  1. Load Project delivery with a payload that has NO items[] field
     (e.g. exec-status.json written before the items[] feature).
  2. Timeline shows "Nothing in this range."
Actual: Same message as a valid empty week -> a director reads "nothing shipped".
Expected: A distinct message signalling the data is stale, e.g.
          "Items will appear after the next status update."
Root cause: undefined-field-no-guard. The empty branch keyed only on
  "0 rows in window" and never distinguished "no timeline source present at
  all" (items[] absent AND no requests/features) from "source present, none in
  this window". The brief anticipated this distinction; the shipped code merged
  both into one message.
Fix applied:
  - exec.js: added staleNoSource = data.items === undefined && no requests/
    features; empty branch now uses execTlStale in that case, execTlEmpty
    otherwise. items:[] (present-but-empty) is treated as a NORMAL empty (the
    workflow ran and legitimately has nothing), NOT stale.
  - i18n.js: added execTlStale (EN + AR).
  - verify-exec.js: regression test — items[] absent -> stale msg; items:[]
    -> "Nothing in this range".
```

## Attacks run (pass / fail / fixed)
- A1 items absent → **was ambiguous, now stale message** (BUG-001, fixed) ✓
- A2 items=[] → "Nothing in this range" (legitimate empty), no crash ✓
- A3 ts:null → item skipped from dated buckets, no crash, 0 rows ✓
- A4 type:null + status:null → renders 1 row, no crash (matchers guard) ✓
- A5 200 items / 20 weeks → 7ms render, no crash ✓
- A6 future ts (2030) → 0 rows in current week (correct), no silent loss in All mode ✓
- A7 bare `{}` item → no crash (defensive field access) ✓
- B7 Type=Bugs when all Feature → empty, no crash; waves hide (documented #130 behaviour) ✓
- B8 Type=Features + Status=Working combined → correct AND-filter (verified via matchers) ✓
- B9 rapid-fire all 7×4 combos → returns to All/All, 8 rows, 2 active chips, no race (always re-derives from lastData) ✓
- C11 stats count ITEMS not waves → proven with DIVERGENT counts (5 Done waves, 1 Done item → "1 shipped") ✓
- C12 needsYou count → "1 need you" from needsYou length ✓
- D13 In-Progress wave → `ex-wc--active` (pink-tinted) border class ✓
- D14 health amber → `ex-wc-health--amber` dot ✓
- D15 WAVE N index → "WAVE 1", "WAVE 2" (idx+1 correct) ✓
- D16 PR count parse → "7/8 PRs" from notes regex ✓
- D16b notes without PR pattern → no "undefined"/"NaN" leak (just shows %) ✓
- E-err fetch 404 → `.ex-error` retry state, no crash ✓
- 17 token-purity test → PASS (verify-wbk-components exit 0) ✓
- 18 raw hex in exec.js / wave-card CSS → NONE (all tokens) ✓
- F19 filterBarHTML intact → 19 filter refs present, filter bar unchanged ✓
- F20 FAB no text label → `fb-fab-txt` count 0 in feedback.js ✓
- F21 feedback.json untouched by #131 → last touched by warehouse PR; live 200, separate ✓
- F22 full `npm test` after fixes → exit 0, zero regressions ✓
- Live director pass (Playwright, dark + AR/RTL) → 8 rows, 4 cards, RTL mirrors, no page errors ✓

## Root cause classes found in this PR
- `undefined-field-no-guard` — BUG-001 (the only one). The missing-source case was not distinguished from an empty window.

(Explicitly did NOT find: type-mismatch-plural-singular — the matcher stores lowercase and matches case-insensitively, correct by design; raw-hex-in-css-token-repo — none; index-off-by-one — WAVE N correct; stale-lastData-not-updated — every filter click re-derives from lastData; silent-catch-masks-failure — none in the new code.)

## What's genuinely good
- **Defensive rendering**: null ts/type/status, bare `{}` items, and 200-item payloads all render without a single throw. The `timelineItems()` normalizer and `matchesType`/`matchesStatus` guard their inputs.
- **Stats correctness**: verified with divergent wave-vs-item counts that the strip counts items, not waves — the exact regression the brief worried about.
- **No stale-render race**: the filter handler always re-paints the full body from `lastData`; rapid-fire is safe.
- **Token discipline**: the wave-card redesign uses design tokens (`--brand`/`--exec-*`/`--surface-2`) not raw hex, so it passes token-purity AND works in light mode.
- **Pipeline is self-sustaining**: the CI run at 08:19 regenerated `items[]` identically to the seed — repo == live, same generated timestamp. Not a one-off manual seed.
- **Filter/​FAB/feedback untouched**: PR #130 filter bar and PR #128 icon-only FAB intact; feedback.json is a separate, untouched file.

## Remaining risks (non-blocking)
- **All 8 exec-status PRs infer as "Feature"** (titles don't match Bug/Improvement regex). So Type: Bugs and Type: Improvements show an empty timeline for this wave. This is CORRECT behaviour, not a bug — and it now reads as "Nothing in this range" (a valid empty), which is honest. As fix/refactor-titled PRs land they auto-populate.
- **inferType is title-heuristic only** — a PR titled "fix" that's actually a feature would misclassify. Acceptable for a status view; the type is advisory, not authoritative.
- **exec.js header docstring is stale** (pre-warehouse comments mention JSONP/Apps Script/Sheets). No live code path uses them — purely misleading comments. Out of scope for this PR; worth a docs-only cleanup later. (Not a functional bug.)
- **Gate is client-side** (`WP.can('viewSettings')`) — client-side-only-guard. Data is a public repo file by design; noted, not fixed here (no server to enforce on for a static Pages site).

## Test run
```
npm test → EXIT 0
All suites pass (48 verify-* + selftests), including:
  - verify-exec.js: timeline items[], Type=Bugs filter, stats count items,
    wave cards, AND the new stale-vs-empty regression (BUG-001 guard).
  - verify-wbk-components.js: token-purity PASS (no raw hex in app.css).
node build.js → EXIT 0, dist idempotent (no drift), dist/index.html 962KB
  (+~6KB vs pre-#131, within the ~10KB budget).
```
