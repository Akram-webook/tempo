# Webook Pass — Product Handoff (source brief)

> The full product context behind this prototype. The code in this repo
> implements the locked decisions below. Open questions are flagged in the code
> (search `open question`) so they're easy to change once the Director decides.

## 1. What this is
A system that turns the manager from someone surprised by resignations into
someone who intervenes early — sees pressure before it explodes, distributes work
fairly, and develops each employee instead of burning them out.

**The real problem (validated):** ~3 resignations in the past month driven by
overload. The Director wants the team working a productive 7–8 hrs without
burnout. Today work is assigned by memory/WhatsApp — no way to see who's
overloaded before it blows up. Data lives in Data House. No existing alternative.

## 2. Core philosophy (locked)
- **Capacity, not productivity.** Measures load (assigned events vs capacity),
  never hours/attendance. Avoids becoming a surveillance tool.
- **Green = opportunity, not idle.** Available capacity is room to grow. The free
  employee gets the next development opportunity.
- **Team Health is the headline KPI** = % of team in the healthy zone (41–75%).
  Overloading your team scores *worse* — incentive is balance, not squeezing.
- **AI suggests, humans decide.** The system ranks, flags, warns; never
  auto-assigns. Overrides are logged (who/when/why).
- **Access model.** Employee sees only their own page; manager sees their team;
  director sees everything at macro level.

## 3. The 4 capacity states
Monthly ceiling 100%. Tier 1 Mega = 50%, Tier 2 Medium = 25%, Tier 3 Standard = 10%.

| State | Range | Meaning |
|---|---|---|
| Available | 0–40% | High spare capacity — ready for an opportunity |
| Balanced | 41–75% | Healthy productive zone |
| Near Capacity | 76–95% | Pre-warning |
| Overloaded | 96%+ | Soft-locked — requires logged override |

**Open design question:** yellow currently = "Balanced" (healthy). Yellow often
reads as "warning" — confirm with Director whether to keep fuel-gauge logic or
shift Balanced→green / Available→neutral.

## 4. Screens
- **Workload Map (home):** top-down org chart with avatar ring + side accent
  colored by load state; Team Health / Available / Near Capacity / Early Warnings
  cards; Week/Month/Year filter; Chart↔List toggle; click node → peek → full profile.
- **Employee profile:** pressure breakdown, load timeline w/ overlap detection,
  daily summary auto-read from Slack `#daily-checkin`, strengths & growth areas,
  development & progress, fairness (Tier-1 distribution), activity log.
- **Settings (Super Admin):** org structure, Slack linking, tier weights & ceiling.
- **Assignment drawer:** candidates sorted by proximity then lowest load; hover
  simulation showing projected load + state change; overloaded → soft-locked override.

Cross-cutting: EN⇄AR (+RTL), Dark/Light (real WOK tokens), "View as" role switcher,
Early Burnout Signal (flame flag on risky overlap patterns).

Real titles: Event Operations Director → Sr. Event Operation Manager → Event
Operation Manager → Sr. Event Operation Specialist → Events Operation Specialist.

## 5. Bigger context (Management Operating System)
This workload page is one layer of a larger MOS. **Workload/Capacity** measures
pressure ("can I load them more?"). **MOS** measures performance & growth over
time ("fair year-end review"). They stay conceptually separate but share the same
backbone (same employee page, same Slack/Notion plumbing, same fairness +
provenance log). The employee page is the template the MOS plugs into.

## 6–9. Strategy notes
- Frame as **burnout prevention + fair development**, never "load tracking".
- Don't expose managers — "protects you when you request resources with evidence".
- Zero extra work — feeds from Slack/Notion/assignments that already happen.
- 30-second value — Director opens it and sees "who's about to break, who's free".
- Sequence the ambition: succeed in own dept → Director shares the win → others
  ask → becomes the standard.
- Phases: **now** = Chat/Cowork prototype (mock data); **after approval** = Code
  (Next.js + Data House + Slack + auth). Don't mix phases.
- Biggest gap to close: a calculated **resignation-cost ROI** number.

## 10. Open decisions for the Director
- Structure: fixed teams vs matrix/per-event? (architecture-defining)
- Does Sr. Event Operation Manager sit above regular managers (4 layers) or peer
  (current flat model)?
- First thing on open: structure, or who's overloaded now?
- Director sees other departments or only their chain?
- The one hover datapoint that changes a decision (load/overlap/skill/location)?
- Act from the screen (assign/message) or view-only?
- Alert on overload, or look only when looking?
- Travel multiplier for international events? Rolling-window vs calendar month?
  Read leave/vacation?
- Keep yellow = Balanced, or recolor?

## 11. Recommended next step
Run a 1-month silent POC on the current 3-person team: wire the workload page to
real Data House data, collect a real story, then present to the Director with
evidence, not theory.

**Immediate to-dos:** calculate resignation-cost ROI (replace cost × 3); define
POC success metric; find an external honest critic; decide POC scope; prep the
Director question list.
```
