# Webook Pass — Workload & Capacity System

An internal system that fuses the team org structure with live workload data —
turning a static org chart into an operations cockpit. It helps a manager see
pressure *before* it explodes, distribute work fairly, and develop each employee
instead of burning them out.

> **Status:** demo prototype, all data mocked. Real integration (Data House,
> Slack, auth) comes after Director approval. See `docs/HANDOFF.md` for the full
> product brief.

## Run it

No build step. Either:

- **Double-click `index.html`** (works directly in the browser), or
- In VS Code, use the **Live Server** extension → "Go Live" (recommended; nicer reloads).

## What you can do in the demo

- **Org tree** (home) — real team from Slack (Ahmed → Motaa → Akram/Khaled/Abdulrahman
  → their specialists), reports grouped under their manager with connector lines,
  real Slack photos, side accent + load pill colored by capacity state.
- **Time filter** (Week / Month / Year) — actually recomputes every load.
- **View as** (Director / Manager / Specialist) — live access model; each role
  sees only what it's allowed to.
- **EN ⇄ العربية** and **Light / Dark** toggles (RTL/LTR aware, real WOK tokens).
- Click any person → **peek** → **full profile**: pressure breakdown, daily Slack
  summary, skills & competencies (0–5, trend), EQ (development-only), manager vs
  director lenses, quarterly review (with a separate attendance/conduct lane),
  promotion-readiness signal, retention-risk flag, tenure & ramp-up.
- **Assign work** (managers+) → candidates ranked by proximity then lowest load,
  with projected load + soft-lock override on overloaded people.
- **Settings** ⚙ (super admin) — live tier weights + capacity ceiling, capacity
  states, Slack linking (identity only), and the activity / override log.

## Tests
```
node test/engine.test.js     # capacity engine
node test/growth.test.js     # tenure / flight-risk / promotion-readiness signals
```

## Project structure

```
webook-pass/
├── index.html              # entry point; loads CSS + JS in order
├── src/
│   ├── css/
│   │   ├── tokens.css       # ← DESIGN LAYER. Swap this for the Claude Design output.
│   │   └── app.css          # structural layout/components (reads tokens)
│   └── js/
│       ├── data/mock-data.js    # org, people, events, tiers (fake data)
│       ├── core/
│       │   ├── capacity.js      # the engine: load, states, KPI, overlap, simulate
│       │   ├── access.js        # role-based visibility (employee/manager/director)
│       │   ├── i18n.js          # EN/AR strings + RTL
│       │   └── state.js         # app state + activity/override log
│       └── ui/
│           ├── components.js     # shared render helpers
│           ├── workloadMap.js    # home: org chart + metric cards + list toggle
│           ├── profile.js        # peek popover + employee profile
│           ├── assignmentDrawer.js
│           └── ... (app.js wires the top bar + router)
└── docs/
    ├── ARCHITECTURE.md     # how the pieces fit; the capacity model explained
    └── HANDOFF.md          # the full product brief / locked decisions
```

## The one rule for the redesign

When the **Claude Design** output is ready, you should only need to replace
**`src/css/tokens.css`** — keep the CSS variable *names*, change their *values*.
Everything else (layout, components, JS) reads from those variables, so the
visual design swaps in without touching logic.

## Verify the engine

```
node test/engine.test.js
```
The capacity engine in `src/js/core/capacity.js` is pure functions — no DOM —
so it can be unit-tested in Node and later reused by the production Next.js build.
```
