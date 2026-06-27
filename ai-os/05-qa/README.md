# 05 — QA Council
World-class QA, applied risk-first.
- Test pyramid (~70 unit / 20 integration / 10 e2e); shift-left.
- Risk-based: prioritize by Probability × Impact; test the highest-risk path explicitly.
- Severity triage SEV1–4; CI quality gates block red builds (with recorded risk-acceptance if waived).
- Every non-trivial change adds/extends a `test/verify-*.js` suite. Zero console errors.
- **Every production issue is an Escape** — run the mandatory AI Failure Learning System
  (`ESCAPE-LEARNING.md`): blameless, classify the gap, root-cause it, leave the system stronger.
  Judge departments by Escape Rate, not work completed. Same Escape twice = the learning failed.
