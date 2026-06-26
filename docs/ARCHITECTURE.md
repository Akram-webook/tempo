# Architecture

## Layers (strict one-way dependency)

```
data  →  core  →  ui  →  app
```

- **data** (`mock-data.js`) — pure data, no logic. Swapped for Data House + Slack later.
- **core** — pure logic, no DOM. `capacity.js` (engine), `access.js` (who sees what),
  `i18n.js`, `state.js`. This layer is the part that must be *correct* and is the
  most reusable when the project graduates to Next.js.
- **ui** — render functions that read `core` + `state` and produce HTML.
- **app** — top bar controls + render router; loaded last.

Everything hangs off a single global namespace `window.WP` (no build step, so
`index.html` opens directly). When moving to Next.js, the `core` modules port
almost as-is into TypeScript; the `ui` layer is rewritten as components.

## The capacity model (the brain)

Each person has a **monthly ceiling of 100%**. Events add weight by tier:

| Tier | Meaning  | Weight |
|------|----------|--------|
| 1    | Mega     | 50%    |
| 2    | Medium   | 25%    |
| 3    | Standard | 10%    |

**States (fuel-gauge):**

| State        | Range   | Meaning                              |
|--------------|---------|--------------------------------------|
| Available    | 0–40%   | High spare capacity — room to grow   |
| Balanced     | 41–75%  | Healthy productive zone              |
| Near Capacity| 76–95%  | Pre-warning                          |
| Overloaded   | 96%+    | Soft-locked — requires logged override |

**Team Health KPI** = % of the team in the Balanced band. This is deliberate:
a manager who overloads their team scores *worse*, so the incentive is balance,
not squeezing.

### Time-window scaling (TUNABLE — open question §10: rolling vs calendar)

A tier weight = the event's load over a full month at 100%. For a window we count
the event's active days inside the window and take a fraction of its weight:

```
contribution = weight * (overlapDaysInWindow / eventDurationDays) / divisor
```

- **Month** — calendar month, `divisor = 1`. A fully-contained event counts in full.
- **Week** — 7-day window (Sun start), `divisor = 1`. Only the slice active this
  week counts → "is this week hot?"
- **Year** — calendar year, `divisor = 12` → a smoothed monthly-average commitment.

Example (the overloaded specialist, ref date 2026-06-17):
`week 46% · month 85% · year 7%` — same person, three lenses.

> This model is intentionally simple and isolated in one function
> (`loadForPerson`). The handoff lists "rolling-window vs calendar month",
> "travel multiplier", and "read leave/vacation" as **open decisions for the
> Director** — each is a small change here, nowhere else.

### Early Burnout Signal

`burnoutSignal(person)` flags overlapping or back-to-back (≤1 day gap) events —
risky scheduling caught *before* load even turns red.

## Access model

| Role      | Sees                          |
|-----------|-------------------------------|
| Employee  | only their own page           |
| Manager   | their team (reports, recursive) |
| Director  | everyone (macro)              |

`canAct()` gates assign/message actions (managers+); specialists are view-only.
This is an open question in the handoff and is a one-line change.

## Provenance

`WP.activityLog` records overrides and view-as switches (who / when / why).
Overrides on overloaded people require a typed reason — transparency, not punishment.

## What's mocked vs real (later)

| Demo (now)              | Production (after approval) |
|-------------------------|------------------------------|
| `mock-data.js`          | Data House (events/assignments) |
| Initials as avatars     | Slack photo + name + title   |
| `dailyCheckin` literals | Slack `#daily-checkin` auto-read |
| In-memory activity log  | Persisted provenance store   |
| No auth                 | Real auth → drives access model |
```
