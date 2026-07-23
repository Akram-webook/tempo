# QA Report — Real CRUD + Warehouse Write Layer

Date: 2026-07-23
Tester: QA Agent (principal engineer + adversarial QA)
Scope: Real Create/Update/Delete for feedback + token-safe proxy + warehouse write pattern

## Detection result (Step 1)
The prompt assumed the write layer was entirely missing. It was ~70% built:
- **Create**: EXISTS. `src/js/ui/feedback.js` submits via GitHub `workflow_dispatch` to the
  `receive-feedback.yml` Action, which runs `scripts/append-feedback.js` to append to
  `data/feedback.json` and commit. Gated OFF because it needs `feedbackDispatchToken`, and a
  token in the public bundle is a leak.
- **Update (triage)**: PARTIAL. `exec.js` `WP.fbTriage.set()` wrote only to a per-browser
  sessionStorage overlay - never to the shared warehouse. No server update path existed.
- **Proxy/Worker**: MISSING. This was the real gap the whole layer waited on.

Repo used the GitHub-**Action** transport, NOT the raw Contents API the prompt's Worker assumed.
Building the prompt's direct-Contents Worker would have created a SECOND competing write path to
the same file. Chose (with Akram's approval) the cleaner path: a thin proxy that forwards to the
EXISTING Action - one write path, reuses the tested appender.

## What was built
- `workers/tempo-crud/index.js` + `wrangler.toml` + `README.md` - Cloudflare Worker proxy. Holds
  the token as a secret; forwards `{op, item}` to the receive-feedback Action's `workflow_dispatch`.
  CORS-locked to `https://akram-webook.github.io`. Never touches `exec-status.json`.
- `scripts/append-feedback.js` - extended from create-only to `create | update | discard` via a
  pure `applyOp()`. Update touches ONLY whitelisted fields; id/owner/submittedAt/note are immutable.
  Discard is idempotent. All guarded by an expanded `--selftest`.
- `.github/workflows/receive-feedback.yml` - added `op/id/status/wave/triageNote/triagedBy` inputs;
  `note` made optional (only create requires it).
- `src/js/core/config.js` - new `feedbackProxyEndpoint` (empty default; set to go live).
- `src/js/ui/feedback.js` - `proxyOne()` transport: when the proxy is set, Submit POSTs
  `{op:'create', item}` with NO Authorization header (token stays server-side). `configured()`
  now true via the proxy alone.
- `test/verify-crud.js` - new suite wired into `npm test`.

## Verdict
**GO (code) — with one owner action to go live: deploy the Worker + set the secret.**
The write layer is built, adversarially tested, and safe. It cannot go live until the Worker is
deployed to Akram's Cloudflare account and `feedbackProxyEndpoint` is set - that one step needs
his credentials and is documented in `workers/tempo-crud/README.md`.

## Summary
Detected an existing-but-gated write layer, then built the missing token-safe proxy that forwards
to the repo's own tested Action (one write path, no competing Contents-API writes). Extended the
warehouse appender to real update/discard with immutable-field protection, and added a client proxy
transport that carries no token. Ran the adversarial attack plan against the Worker (origin/op/
method/field-injection/proto-pollution) and the append core; all pass. No secret appears in the
built bundle.

## Findings table
| ID | Area | Issue | Severity | Root Cause Class | Fixed? |
|----|------|-------|----------|------------------|--------|
| F1 | Update path | Triage wrote only to a per-browser overlay, never the shared warehouse | High (data not shared) | client-side-only-guard | Yes - built server update/discard op |
| F2 | Proxy design | Prompt's Contents-API Worker would create a 2nd write path racing the Action | High (sha-conflict-silent-loss) | competing-write-path | Avoided - forward to existing Action |
| F3 | Worker (self-found) | Update op forwarded immutable fields (submittedAt) to the Action | Low (defence-in-depth only) | arbitrary-field-injection | Yes - op-aware whitelist at proxy + immutable guard in appender |

## Attacks run (pass/fixed)
- A1 empty submit -> note required (client + worker 400 + append refuse): PASS
- A2 XSS in note -> escaped in queue render (existing) + sanitized server-side: PASS
- A3 oversize note (9k chars) -> `sanitize()` caps at 2000: PASS
- A4 prototype pollution `{__proto__:{...}}` -> only whitelisted keys forwarded; `({}).pwn` undefined: PASS
- A5 concurrent submits -> Action `concurrency: receive-feedback, cancel-in-progress:false` serializes + rebases: PASS (by design)
- A6 duplicate id on create -> Action assigns id from run number; caller id ignored on create: PASS
- A7 network timeout -> 20s AbortController in proxyOne, queue preserved: PASS
- A8 PAT in dist -> grep 0 hits (ghp_/github_pat_/GITHUB_PAT/Bearer ghp): PASS
- A9 optimistic create + proxy failure -> draft NOT cleared, queue kept, retry shown: PASS
- B1-B4 read attacks -> pre-existing graceful handling unchanged (regression check): PASS
- C1 invalid status -> `applyOp` throws EBADSTATUS (worker/appender reject): PASS
- C2 unknown id -> throws ENOITEM: PASS
- C3 concurrent updates -> Action serialized; last-write-wins, no corruption: PASS
- C4 partial update (no triageNote) -> existing triageNote preserved: PASS
- D1 discard already-discarded -> idempotent: PASS
- E1 CORS from evil origin -> 403: PASS (worker sim)
- E2 GET method -> 404: PASS
- E4 op injection `'../../etc'` -> 400 Invalid op: PASS
- E5 arbitrary field injection (owner/submittedAt via update) -> dropped at proxy + immutable in appender: PASS
- F (warehouse) JSON validity + one-write-path + no exec-status touch: PASS
- G1 read path intact / G4 FAB icon-only / G5 exec-status untouched / G6 full suite green: PASS

## Security invariants verified
- [x] No PAT/secret in dist/index.html (grep clean)
- [x] CORS blocks unauthorized origins (403, worker sim)
- [x] Only allowed fields writable via update op (immutable id/owner/submittedAt/note - proxy + appender)
- [x] Worker forwards to the Action (secret stays in the Worker; never in bundle)
- [x] Worker never touches exec-status.json

## Root cause classes found
- client-side-only-guard (F1: triage was browser-local)
- competing-write-path (F2: avoided a 2nd writer to the same file)
- arbitrary-field-injection (F3: tightened proxy whitelist; appender already immutable)

## Remaining risks (non-blocking, owner action)
- **Deploy step is Akram's**: the Worker must be deployed to his Cloudflare account and
  `feedbackProxyEndpoint` set. Until then Submit still safely reads "Save feedback" (local) - no leak.
- GitHub Pages deploy lag (~5-10 min): a just-submitted item appears via the local/optimistic path
  before the committed `feedback.json` redeploys; the next fetch reconciles.
- Rate limiting relies on GitHub's authenticated API limit (5000/hr) + the Action concurrency group;
  a per-origin KV rate-limit can be added to the Worker later if abuse appears.

## Test run
`npm test` -> exit 0. All suites green including new `test/verify-crud.js` and the expanded
`append-feedback --selftest`. Build idempotent; committed dist matches a fresh rebuild.
