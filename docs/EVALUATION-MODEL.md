# Performance Evaluation — model + best practice

Mirrors the real Webook "Mid-Year Performance Evaluation": **downward feedback** by the
line manager = 16 weighted competency criteria rated 1–5 (Scale) + qualitative questions.
Implemented as an interactive screen (open from a profile → "Performance evaluation").

## Who can evaluate (access)
- **Line manager only** runs an employee's downward feedback — "the manager evaluates the
  people directly under his management." Director/Super Admin can too. Peers and skip-level
  managers cannot. (Matches the access model: you evaluate your direct reports.)
- Implemented: the "Performance evaluation" button shows only when the viewer is the person's
  **direct manager** (or director/admin).

## Structure (as in the screenshot)
- **16 criteria, weights sum to 100%**, each rated **1–5**; weighted → overall **/5**.
- **Qualitative questions:** Achievements · Strengths · Growth areas · Recommended trainings ·
  General feedback · Recommendations (promotion/monitor — marked sensitive 🔒).
- Status: Not started → In progress → Completed (Approve).

## Best-practice adjustments applied (to "make life easier" and fairer)
1. **Conduct vs capability separated.** Punctuality/Appearance are *conduct* — kept low-weight
   and tagged `conduct`, not blended into capability. (Research: don't mix attendance/conduct
   into a capability score; we keep them visible but minimal.)
2. **Weighted, not a single gut number** — the overall is computed from criteria + weights, so
   it's explainable and harder to bias.
3. **Pair with a self-assessment** (next build) — show the employee's self-rating beside the
   manager's to surface gaps; this is the strongest fairness move.
4. **Don't auto-tie the score to pay** — it's an input to a calibration conversation, not an
   automatic raise formula (Goodhart's Law). Stated on-screen.
5. **Built from the year's evidence**, not recency — the quarterly check-ins + load history feed it.
6. **Recommendations field is sensitive** (promotion/monitor) — gated like other sensitive data.

## Try it
Open as **Ahmed** (or Akram) → open **Osama**'s profile → "Performance evaluation":
rate criteria 1–5 (overall recomputes live), type feedback, Approve. Osama scores 4.3/5 with
low Stress Management (2) and Resilience (3) — the story behind his burnout flag.

## Upward feedback (employee → manager) — routed UP, anonymous
The report rates their manager on **leadership behaviors** (clarity, support, fairness,
communication, recognition, decision-making) + comments. Best practice applied:
- **Routed up the chain, never shown to the rated manager raw.** Specialist rates their
  manager → goes to the **manager's manager (skip-level) / Director**; a manager rating the
  Director → goes to **C-level**. The rated person never sees who said what — so people feel safe.
- **Aggregated + anonymous + a k-threshold** (≥3 responses; 5 is stricter): below the threshold
  the panel is suppressed (small teams) to protect anonymity.
- **Behaviors, not personality.** Developmental, decoupled from pay.
- In the app: open your **own** profile → "Evaluate my manager" (anonymous form). A manager's
  manager sees "Upward feedback (from their team)" on that manager's profile — the manager and
  their reports do not.

## Compensation — budget authority only
- Comp (the most sensitive field) is visible **only to the Director / Super Admin (budget
  authority)** — managers don't see peers' or even their reports' raw salaries by default.
- Shows **pay-band + compa-ratio + position-in-range context**, never a peer-by-peer salary grid.
- **Separate from the review** (don't auto-tie a score to pay). Stated on-screen.
- In the app: open a profile as the Director → a "💰 Compensation" panel appears (band, salary,
  compa-ratio, range). It's absent for everyone else.

## Best-in-class references
The structure follows standard competency-weighted review models (Lattice, CultureAmp, SAP
SuccessFactors): weighted competencies + qualitative narrative + calibration, with continuous
check-ins feeding the formal review (see KPI-DISPLAY.md, SKILLS-and-REVIEWS.md).
