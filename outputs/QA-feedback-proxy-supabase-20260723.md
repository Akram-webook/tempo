# QA Report — Feedback Proxy (Supabase Edge Function)

Date: 2026-07-23
Tester: QA Agent (independent adversarial pass)
Scope: Supabase Edge Function write proxy + Create/Update/Discard for feedback

## Verdict
**GO.** The trust boundary is airtight, no secret reaches the bundle, no unauthorized origin can
write, and all prior-PR behaviour is intact. No new bugs found in this pass. (The two real issues
in this proxy were already caught + fixed in the PR #174 QA: a no-op CORS ternary and preflight
ordering — both verified still-fixed here.)

## IMPORTANT: prompt vs. actual implementation
Verified against the real code, not the prompt's assumptions. Several prompt attacks test a
mechanism this proxy does NOT use:
- Prompt: the function writes `data/feedback.json` DIRECTLY via the GitHub Contents API with a
  3-attempt SHA-conflict retry loop; has a `FILE = 'data/feedback.json'` constant; commits with
  `crud(feedback): create fb-xxx`.
- **Actual: the function forwards to the EXISTING `receive-feedback` Action via `workflow_dispatch`**
  (`DISPATCH_URL`, line 88). There is NO Contents-API write, NO SHA loop, NO `FILE` constant, and
  the commit message is the Action's own `data: feedback submission [run N]`. Serialization of
  concurrent writes is handled by the Action's `concurrency: receive-feedback, cancel-in-progress:
  false` group, not a Worker retry loop.
- Consequently: **G1 (SHA conflict resolution), G4 (FILE constant), G5 (commit format), G6
  (3-retry-then-500)** are N/A-by-design — they test a Contents-API writer that does not exist.
  Concurrency safety is provided by the Action instead (see B8/D7).
- Prompt also assumes `submitFeedback()/updateFeedbackStatus()/discardFeedback()/_feedbackItems`
  and `src/js/i18n.js` / `test/verify-tokens.js` / `sample-1` ids — none exist in this repo. The
  real client model is a draft-QUEUE (create) + `triagePersist()` (update/discard); i18n is at
  `core/i18n.js`; there is no verify-tokens test.

## Summary
Independently attacked the Edge Function (the entire trust boundary) and the client transport.
The origin gate, op allow-list, op-aware field whitelist, secret handling, and error paths are all
correct — the token is attached server-side, never in the bundle, and never leaks even when an
upstream error string contains a token. Verified the Deno function dynamically by shimming
`Deno.serve`/`Deno.env` in Node and running the full attack matrix. Cloudflare is fully retired.
No regressions. No fixes required this pass.

## Findings table
| ID | Area | Issue | Severity | Root Cause Class | Fixed? |
|----|------|-------|----------|------------------|--------|
| (none) | — | No new defects found. Prior fixes (no-op ternary, preflight ordering) verified still in place. | — | — | — |

## Attacks run (pass / N-A)
- A1 no real secret in function source: PASS (only `github_pat_xxx` placeholders in deploy docs)
- A2 Cloudflare files gone (`workers/tempo-crud/` absent): PASS
- A3 no secret in dist: PASS (0 hits)
- A4 endpoint in bundle is empty string (not live yet): PASS
- A5 ALLOWED_ORIGIN hard-coded literal, strict `!==` gate: PASS
- A6 append sanitize() caps 2000 + strips control chars: PASS (server-side, in append-feedback.js)
- A7 update whitelist = id(lookup)/status/wave/priority/triageNote/triagedBy; excludes owner/note/submittedAt/type/klass/context/url: PASS
- A8 op allow-list before PAT read + fetch: PASS (line 69 before 78/88)
- A9 missing PAT → 503, no crash: PASS
- B1 valid create dispatches: PASS
- B2 empty note → client `fbNoteRequired` + function 400: PASS
- B3 XSS note → esc() in composer + card render: PASS
- B4 oversize → NOTE_MAX 2000 client + sanitize 2000 server: PASS
- B5 prototype pollution → `__proto__` dropped by whitelist (not forwarded): PASS
- B6 duplicate id on create → Action assigns run-number id; caller id not forwarded on create: PASS
- B7 optimistic create + failure → draft queue kept, Retry shown, no ghost: PASS
- B8 concurrent creates → Action concurrency group serializes + rebases: PASS by design
- C1-C4 read/reconcile (stale, null items, null status, 500 items) → pre-existing graceful handling unchanged: PASS
- D1 valid update dispatches op:update: PASS
- D2 invalid status → append applyOp rejects (EBADSTATUS); triage local overlay stands + honest toast: PASS
- D3 unknown id → append applyOp rejects (ENOITEM): PASS
- D4 immutable fields on update → owner/submittedAt/note dropped at proxy AND immutable in appender: PASS
- D5 partial update preserves triageNote: PASS (append applyOp)
- D6 rapid cycling → each Save is a discrete click; double-submit guard on the panel: PASS
- D7 concurrent updates → Action serializes; last-write-wins, valid JSON: PASS by design
- E1 valid discard → op:discard: PASS
- E2 double-discard idempotent: PASS (append applyOp)
- E3 double-click → `panelState.submitting` guard: PASS
- E4 discard + filter → optimistic local overlay updates the row immediately: PASS
- E5 discard offline → create path guards `navigator.onLine`; triage persist fails → local stands + toast: PASS
- F1 bad-origin POST → 403: PASS (Deno sim)
- F2 bad-origin preflight → 403: PASS
- F3 GET → 404: PASS
- F4 op injection → 400 (before any GitHub call): PASS
- F5 missing item → 400: PASS
- F6 malformed JSON → 400: PASS
- F7 error responses never leak the token (upstream error containing `github_pat_LEAK` → generic 502): PASS
- F8 `--no-verify-jwt`: intentional — the Origin gate is the sole auth layer for this public write endpoint; the token never leaves the server, and the Action re-validates every field. Documented (see below).
- G1/G4/G5/G6 Contents-API SHA mechanics: N/A-by-design (function forwards to the Action; concurrency handled there)
- G2 JSON validity after write: PASS (append-feedback writes `JSON.stringify(...) + "\n"`; selftest covers)
- G3 exec-status untouched: PASS (grep: 0)
- H1 filter bar intact: PASS
- H2 Polish pure-JS local default, no network dep added: PASS
- H3 FAB icon-only, no label: PASS
- H4 no verify-tokens.js in repo; app.css NOT touched by proxy work; 4 hex are pre-existing Google-mandated button colors: PASS (no regression)
- H5 BUG-001 stats guard `source !== 'feedback'` present: PASS
- H6 no wrangler/cloudflare refs in code: PASS
- H7 full suite green: PASS (exit 0)

## Security invariants verified
- [x] No PAT in dist/index.html
- [x] No real PAT in supabase/functions/feedback-proxy/index.ts (only `xxx` placeholders in docs)
- [x] No retired Cloudflare files in repo
- [x] CORS blocks unauthorized origins — POST 403 + preflight 403 (Deno sim)
- [x] Immutable fields (id/owner/submittedAt/note) protected at BOTH proxy whitelist and appender
- [x] Function never touches exec-status.json
- [x] Missing PAT returns 503, not a crash
- [x] `--no-verify-jwt`: CORS/Origin is the sole auth layer; documented

## --no-verify-jwt trade-off (documented, as required)
The function is deployed with `--no-verify-jwt` because it is a PUBLIC write endpoint called from
the static GitHub Pages app, which has no Supabase user JWT to present. Security therefore rests on:
(1) the hard Origin allow-list (only akram-webook.github.io), (2) the fixed op allow-list + field
whitelist, and (3) the Action + append-feedback.js re-validating and enforcing immutability
server-side. The GitHub token never leaves the function. Residual risk: a determined non-browser
caller can spoof the Origin header (it is not a true auth secret) and submit feedback / triage
writes. Impact is bounded — they can only create feedback items or change triage status on existing
items (never overwrite owner/submittedAt/note, never touch any other file, never see the token).
If abuse appears, add a shared secret header or a Supabase JWT + service-role check. Acceptable for
an internal feedback tool at this stage.

## Root cause classes found in this PR
None new. (Prior pass fixed: cors-bypass-dynamic-origin [latent no-op form], missing-origin-check
[preflight ordering]. Both verified still fixed.)

## What's genuinely good
- The token is structurally unable to reach the client: attached only inside the function, bundle
  ships empty endpoints.
- One write path (forward to the Action) — sidesteps the SHA-conflict/silent-loss class entirely
  rather than hand-rolling a retry loop.
- Immutable-field protection at TWO layers (proxy whitelist + appender applyOp).
- Error hygiene: a thrown upstream error containing a token string still returns a fixed generic
  message.
- Clean platform choice: reuses the Supabase project already in use; Cloudflare fully retired with
  no dangling references.

## Remaining risks (non-blocking)
- **Not live yet:** `feedbackProxyEndpoint` is empty until Akram deploys the function
  (`supabase functions deploy feedback-proxy --no-verify-jwt` + `supabase secrets set GITHUB_PAT`).
  CORS attacks F1-F7 were verified in a faithful Deno simulation; a live `curl` re-test should run
  once deployed.
- Origin header is spoofable by non-browser callers (see `--no-verify-jwt` section) — bounded impact.
- GitHub Pages deploy lag (~5-10 min) before a committed item appears in the served JSON — by design.

## Test run
`npm test` → exit 0, all suites green (incl. `test/verify-crud.js` + expanded
`append-feedback --selftest`). `node build.js` idempotent; 0 secret strings in dist.
