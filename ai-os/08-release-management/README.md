# 08 — Release Management
- Branch → PR → review (Reviewer agent, `10-ai-agents`) → Akram merges → CI builds+tests+deploys.
- Every feature PR includes a rollback plan (`12-templates/RISK-REGISTER.md`).
- Verify live after deploy (don't report "all good" without checking the live artifact).
