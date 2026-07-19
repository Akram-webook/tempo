# QA Report — Project Delivery PR #135

Date: 2026-07-19
Tester: QA Agent (adversarial finish gate)
Scope: PR #135 — Polish button + feedback lifecycle folded into the Project Delivery timeline

## Verdict
**GO WITH FIXES** — 3 real bugs found and fixed (2 Major, 1 Minor). Full suite green after fixes; no security issues; graceful degradation solid.

## Summary
PR #135 folds triaged feedback (`data/feedback.json`) into the exec timeline and adds a pure-JS Polish classifier. The architecture is sound and most adversarial attacks passed cleanly (graceful degradation on feedback-fetch failure, no credential leak, correct filter behaviour, wave-99 fallback, null/unknown field handling). But three real defects survived the builder's self-review: **feedback inflated the "in progress" stat**, **double-Polish corrupted the note**, and the **filtered-empty message misleadingly blamed the date range**. All three are now fixed with regression tests.

## Findings table
| ID | Area | Issue | Severity | Root Cause Class | Fixed? |
|----|------|-------|----------|-----------------|--------|
| BUG-001 | exec.js stats strip | An Assigned feedback item (→status 'Working') was counted in the "in progress" rollup, inflating the delivery stats a director reads at the top of the page | Major | feedback-count-bleeds-into-stats | ✅ |
| BUG-002 | feedback.js Polish | Polishing an already-polished note re-wrapped it, producing nested corruption (`[Bug] [Bug] … Context: …`). Not idempotent; directors click twice | Major | polish-not-idempotent (new) | ✅ |
| BUG-003 | exec.js timeline empty-state | When a filter matched nothing, the message read "Nothing in this range" — implying a date/week problem, not a filter | Minor (UX) | misleading-empty-state | ✅ |

## Attacks run (pass / fail→fixed)
- A1 no items key — PASS (exec timeline degrades, no crash)
- A2 items empty — PASS (exec items still render)
- A3 wave lookup — PASS (chip shows "WAVE 3")
- A4 wave=99 out of range — PASS ("WAVE 99" fallback, no crash)
- A5 all Discarded — PASS (dimmed+struck; excluded from active stat via BUG-001 fix)
- A6 klass null — PASS (no lane tag, no crash)
- A7 klass "Unknown" — PASS (renders verbatim; lane is director-supplied)
- A8 submittedAt null — PASS (hidden in Week view, shown under "No date yet" in All view; nothing lost)
- A9 type+status null — PASS (filter does not crash; type derived from klass)
- A10 500-char junk — PASS (wraps, no layout break, no crash)
- B11 no-signal note — PASS (defaults to Feature)
- B12 empty note — PASS ("Untitled feedback", no crash)
- B13 double-Polish — **FAIL → FIXED (BUG-002)**
- B14 mixed signals — PASS (Bug wins when present; Backend when no bug signal; consistent, ordered rules)
- B15 rapid triple-Polish — PASS after BUG-002 fix (idempotent → stable)
- B16 Polish on Discarded — N/A (Polish is in the composer, not on timeline rows)
- C17 Type=Bug — PASS (only bug feedback survives)
- C18 Type=Feature — PASS
- C19 Status=Working — PASS (Assigned+Testing → amber)
- C20 Status=Planned — PASS (New → violet)
- C21 Bug AND Working combined — PASS (AND logic)
- C22 no-match combo — **FAIL → FIXED (BUG-003)**
- C23 rapid status toggling — PASS (repaints from lastData each click)
- D24 wave chip text — PASS ("WAVE 3", styled distinctly from lane tag)
- D25 lifecycle badges distinct+accessible — PASS (violet/amber/green buckets via tokens)
- D26 "Under review" — PASS (maps to violet bucket, renders)
- D27 stats exclude feedback — **FAIL → FIXED (BUG-001)**
- D28 discarded excluded from active count — PASS after BUG-001 fix (Discarded → grey, never Done/Working)
- E29 feedback 404 / network throw / garbage JSON — PASS (all three degrade gracefully, zero errors)
- E30 credential in dist — PASS (feedbackEndpoint='' , token='' , no ghp_/pat literal; Bearer refs are comments + empty-config code path)
- E31 send button state — PASS ("Not configured yet", no silent fail)
- E32 Polish makes zero network calls — PASS (0 fetch calls; pure JS)
- F33 token-purity (app.css) — PASS (0 raw hex outside allowlist)
- F34 hex in JS style literals — PASS (none)
- G35 filter bar intact (PR #130) — PASS
- G36 FAB icon-only (PR #128) — PASS (bulb icon, aria-label, no text span)
- G37 exec-status.json structure — PASS (keys unchanged; items[] is the existing contract)
- G38 two-file separation — PASS (feedback.json has 0 exec refs; the "feedback" string in exec-status.json is a PR *title*, not a merge)
- G39 full regression — PASS (npm test exit 0 after fixes)

## Root cause classes found in this PR
- `feedback-count-bleeds-into-stats` (BUG-001) — the merged `data.items` was reused for the rollup without excluding `source:'feedback'`.
- `polish-not-idempotent` (BUG-002, new) — `polishLocally` had no guard for input it had already produced.
- `misleading-empty-state` (BUG-003) — the empty message didn't consider whether a filter was active.

## What's genuinely good
- **Graceful degradation is excellent** — feedback 404/throw/garbage-JSON all leave the exec page fully rendered with no console error. The `loadFeedback().catch(() => [])` pattern is the right shape.
- **Security is clean** — no token in the public bundle; Polish is genuinely pure JS (0 network calls); send stays "Not configured yet".
- **Filter reuse is elegant** — feedback answers the existing Type/Status chips with no new chips/route (matches the "only filter in Project delivery" brief).
- **Defensive mapping** — wave=99, klass=null/Unknown, null timestamp, 500-char junk all handled without a crash.
- **Token discipline** — all new CSS uses `var(--…)`; nothing raw.

## Remaining risks (non-blocking)
- **Send transport not wired** — `feedbackEndpoint` empty by design; real submissions can't post until a token-safe proxy exists. Triage currently runs on the 3 seeded demo items. (Known, documented, out of scope.)
- **Footer real-names leak** — pre-existing, out of scope for this PR.
- **Classifier is heuristic** — keyword rules, not an LLM; transparent and ordered most-specific-first, but a director should still confirm the lane before assigning a wave.

## Test run
`npm test` → **exit 0**, all suites pass (incl. verify-exec + verify-feedback with the 5 new regression assertions, token-purity, append-feedback selftest). `node build.js` idempotent, dist no-drift. 0 raw hex outside the allowlist.
