# SPEC — Workload Cockpit MVP (TAOS size: M)

**Decision it serves:** an Event-Operations manager, opening Tempo, can answer in ~30s —
*are we going to be overloaded, who, when, why, and what should I do?*

**Constitution fit:** measures a tier-weighted **load index**, never clocked hours
(Art. II — track work, never surveil people). Every number is explainable from its inputs
(Art. V). Simpler-wins (Art. III): reuses the existing pure engine patterns; adds one new
pure module, no framework, no new design system.

## Why not the hours model in the original brief
The brief specified capacity/demand/utilization in **hours**. That is (a) explicitly banned by
the Constitution and `SPEC-burnout-early-warning.md` ("never use clocked hours"), and (b) not
present in the data — hour estimates would be invented, i.e. the fake precision the brief itself
forbids (§9/§25). Decision (owner, this pilot): **tier-weight model, no hours.** Effort is
captured by the event **tier**, the estimate that genuinely exists.

## Locked model
- **Daily intensity by tier** (`WP.data.DAY_INTENSITY`): Mega **50** · Medium **25** · Standard **10**
  = "% of a person consumed on each day the event is active." Reuses the tier weights.
- **dayLoad(person, date)** = Σ intensity of that person's events active on `date`
  (`start ≤ date ≤ end`). Two overlapping Mega events on one day = 100%.
- **State bands** (`WP.data.LOAD_STATES`, configurable — operational rules, not science):
  Healthy 0–70 · Watch 71–85 · High 86–100 · Overloaded 101–115 · Critical >115.
- **Timeline / forecast** over today + next-14: `today`, `peak7`, `peak14` (+ dates), `avg7/avg14`.
  The **peak** is the headline, never the average — a "healthy" week must not hide a 2-day spike.
- **Pressure ≠ load** (transparent, factor-visible; weights tunable):
  `score = 0.6·min(peak14,130) + concurrencyBoost + deadlineBoost + megaBoost` (0–100),
  factors returned: `peakLoad, peakDate, maxConcurrent, deadline, megaActive`. Levels:
  low <45 · elevated 45–69 · high 70–89 · critical ≥90. Not an opaque AI score.
- **Pressure windows**: contiguous runs of days at High+ (≥86), with drivers and an action
  (`redistribute` ≤115, `add-support` >115).
- **Drivers roll-up**: events ranked by demand = intensity × person-days active in the window.
- **What-if**: project a new event onto a person (peak14 before→after); soft-locked when it
  pushes past Overloaded (>100), requiring a logged override. **Candidate ranking**:
  1) has required skill → 2) does not create Critical (>115) → 3) lowest projected peak →
  4) lowest today. Each candidate carries a plain-language reason.

## Assumptions (shown, never hidden)
- Load is a **tier-weighted commitment index**, not hours or % of clocked time.
- One event = one effort size (its tier). No intra-event ramp; no per-task granularity in MVP.
- **Leave / days-off / holidays are NOT modelled yet** → shown as "not modelled", never faked.
- Demo "today" is pinned to `WP.data.DEMO_TODAY` (2026-08-19) so the story is stable; real data
  would pass the real date. No `Date.now()` in the engine (determinism).
- All cockpit data is **DEMO** and labelled as such.

## Demo scenario (at DEMO_TODAY)
Adam 110% Overloaded now · Owen 110% now → 125% Critical Aug 24 · Kevin 25% Healthy now → 100%
High next week · Marco/Simon/pool Healthy. Cashless Rollout requires the `cashless` skill, so the
idle-but-unskilled person is **not** the right assignee — the skilled, lightly-loaded one is.

## Files
- `src/js/core/workload.js` — the pure engine (DOM-free).
- `src/js/data/mock-data.js` — now-anchored events, `SKILLS`, `MVP_ASSIGN`, `DAY_INTENSITY`,
  `LOAD_STATES`, `DEMO_TODAY` (all additive; June events untouched).
- `test/verify-workload.js` — §29 matrix + scenario invariants.
- UI (Day 2): `src/js/ui/cockpit.js` route `workload` (manager dashboard + individual drawer + what-if).

## Not in MVP (deferred)
Hours, leave/holiday input, historical actual-vs-estimate learning, AI forecasting, and everything
in brief §23. Reversible via the existing `WP.config.mvp` + `WP.MVP_DEFER` gate.
