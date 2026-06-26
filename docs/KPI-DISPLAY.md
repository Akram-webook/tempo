# Showing & tracking KPIs with employees — best practice

How leading tools (Lattice, 15Five, Betterworks, Google, Gallup) present KPIs to an
employee and run detailed follow-up. This is the spec for the employee KPI screen we'd build.

## The employee scorecard — what to show (keep it sparse: ≤3–4 metrics per objective)
| Field | Why |
|---|---|
| Objective + how it aligns up (golden thread) | context |
| KPI name · target · current · **progress bar** | quantitative progress |
| **Status (RAG)** — On track / Progressing / Off track | the signal; owner-set, not just math |
| Trend (sparkline) | direction, not a snapshot |
| Leading vs lagging label | leading = act weekly; lagging = confirm monthly |
| Last update + note (blockers) | the story behind the number |
| Owner + due date | accountability |

Rules: **one lagging KPI + up to 3 leading indicators** per objective; RAG color on both the
bar and the chip; let the employee **set status themselves** (catches a goal that's 70% done but
stalling); **red = "needs support," never blame** (always paired with a blockers/next-step field);
drop vanity metrics (if they can't act on it, don't show it).

## Cadence of follow-up (continuous, not annual)
- **Weekly check-in (15/5):** ~15 min employee / 5 min manager — progress, blockers, priorities; review *leading* KPIs.
- **Weekly/bi-weekly 1:1:** the coaching conversation (Gallup: regular 1:1s → far higher engagement). Recognition + clarity + blockers + development.
- **Monthly:** review *lagging* KPIs, re-forecast at-risk goals.
- **Quarterly review:** development + retrospective; built from the quarter's check-in record (no recency bias).
- **Continuous recognition** layer (lightweight praise).

## Basis of evaluation + detailed follow-up
- Evaluate on **goal/KPI attainment + behaviors** over the period — not one year-end impression.
- **Close the loop:** every 1:1 logs action items (owner + due) that carry forward and are checked next time. That's what makes follow-up real.
- **Self-assessment beside manager assessment** on the same goals/competencies → surfaces gaps to discuss.

## Transparency & fairness
- **Objectives are shared** (org-wide alignment) but **individual scores are private** to
  employee + manager (+ HR chain). Don't rank people publicly — it demotivates and is unfair.
- Visible, self-owned, meaningful goals support motivation (Self-Determination Theory:
  autonomy, competence, relatedness). Controlling/surveillance use frustrates this → burnout.

## The screen (spec to build)
```
[Employee] · Q3 2026
OBJECTIVE: Improve retention   ▸ aligns to: Team goal
  KPI            Target  Current  Trend  Status
  Net retention   95%     91%     ▁▃▅▆   🟡 Progressing
  ▓▓▓▓▓▓▓░░ 76%   due Sep 30   owner: you
  Last update: "Churn spike from X; plan below"
  Leading (weekly): Onboarding 82% 🟢 · CSAT 4.1 🟡
THIS WEEK: priorities · blockers · wins
1:1 ACTION ITEMS (carry forward): ☐ churn playbook (Jun 22) · ☑ pull data
REVIEW PREP: self-assessment │ manager assessment
```

> This stays SEPARATE from capacity/load (the workload tool). Load = "can I load them?";
> KPIs = "how are they doing?" — same backbone, different question (see KPI-CASCADE.md).

## Sources
[Goal statuses — Lattice](https://help.lattice.com/hc/en-us/articles/1500001282601-Understand-Goal-Progress-and-Statuses-Definitions) · [Track performance — Lattice](https://lattice.com/articles/how-to-track-employee-performance) · [Check-ins — 15Five](https://success.15five.com/hc/en-us/articles/360002698971-Check-ins-Feature-Overview) · [OKR reviews — Betterworks](https://www.betterworks.com/magazine/how-okr-review-meetings-can-help-achieve-your-goals-faster/) · [Great managers research — Google re:Work](https://rework.withgoogle.com/intl/en/guides/following-the-data-the-research-behind-great-managers) · [Recognition + feedback — Gallup](https://www.gallup.com/workplace/651812/organizations-redefine-feedback-including-recognition.aspx) · [Self-Determination Theory — Deci, Olafsen & Ryan](https://selfdeterminationtheory.org/wp-content/uploads/2017/03/2017_DeciOlafsenRyan_annurev-orgpsych.pdf)

> Contested: "share goals / hide scores" and "avoid red-shaming" are continuous-PM norms, not
> hard findings; specific Gallup multipliers circulate via vendor summaries — treat as directional.
