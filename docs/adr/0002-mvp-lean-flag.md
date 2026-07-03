# ADR 0002 — MVP lean-flag (gate, don't delete)

- **Status:** Accepted
- **Date:** 2026-07-02

## Context
Tempo carries more capability than the first operations rollout needs. Deleting the
not-yet-needed surface would lose working, tested code and make the eventual turn-on a rebuild;
leaving everything on would ship a wider, noisier product than the MVP calls for. The Simplicity
article says the simpler-to-operate option wins absent evidence. (Substance: `docs/ROADMAP.md`,
`src/js/core/config.js`.)

## Decision
We gate non-MVP surface behind a lean flag rather than removing it. `WP.config.mvp` defaults to
`true`; features outside the MVP check the flag and stay dormant when it is on. Turning a feature
on for the real rollout is a config change, not a code restoration.

## Consequences
- The shipped MVP stays lean without throwing away built, tested work.
- Re-enabling a capability is one flag, reversible, and low-risk.
- Cost: every gated feature must honour the flag consistently, and tests must cover both states
  where behaviour differs — the flag is a real branch, not a comment.
