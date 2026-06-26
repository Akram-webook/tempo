# Webook Workload — Roadmap (decisions locked)

One goal per phase. Don't start a phase until the one before is done. Build the proof,
don't jump between ideas.

## Decisions locked (from our last round)
- **Finish Event Operations first**, then expand to other departments (Ticketing next, etc.).
- **The tool must become the single place work requests land.** Today work is assigned by
  Slack + verbally → no record, no load picture. The product wedge is: **capture every work
  request in one place**, assign it, and let it feed load automatically. (This is the "perfect
  place to take the request" you described.)
- **Employee self-view = developmental, not surveillance.** A person sees their own load,
  skills, growth, promotion-readiness, recognition, and their manager's coaching — but NOT the
  raw retention-risk flag, the "needs follow-up" label, or the succession note. Those stay
  manager-only and reach the employee as a 1:1 conversation. (Applied in the app now.)
- **Access:** role + relationship (manager-of); sensitive detail opens only along the
  management line; everyone sees the aggregate situation. (Applied — see ACCESS-MODEL.md.)

## 🎯 Phase 1 — FOCUS NOW: make it the place requests land + 1-month POC
**Goal:** the tool becomes where work is requested/assigned, on your own team, and produces one real story.
1. **Request intake** — a "＋ New request" flow: title, tier, dates → assign to the best
   candidate (the drawer already ranks them). Now there's a *record* instead of a Slack/verbal ask.
2. **Slack as the on-ramp** — a `#requests` channel or a short Slack form posts a request that
   lands in the tool (free text → AI structures it). One place, zero new habit.
3. **Daily check-ins** — keep reading `#daily-checkin` (free text → AI) onto profiles.
4. **Run it on your team** (Akram's): look weekly, rebalance once, capture the story
   ("we saw Osama at 85% + overlap, eased it, he didn't burn out").
**Done when:** every assignment for your team goes through the tool for a month + one real story.

## 🎯 Phase 2 — Director pitch
Story from Phase 1 + the KPI cascade + the ROI number (replace-cost × 3). Frame: burnout
prevention + fair development + "one place for all work requests." Get a yes.

## 🎯 Phase 3 — Production + automation (after approval)
Next.js + live data + auth · daily Slack team-pulse post · Manager Scorecard · employee KPI screen.

## 🎯 Phase 4 — Company-wide
Ticketing next (Motaa already leads it; fits the event/tier model), then Marketing/Experiences
(adapt "work units"). Live dashboard the Director opens. Land and expand.

## Build queue (what I'd build next, in order)
1. **Request intake flow** (＋ New request → assign) — makes the tool the source of truth. ← next
2. **Manager Scorecard** (View-as manager → team KPIs: Team Health, delivery, development, attrition).
3. **Employee KPI screen** (the developmental scorecard from KPI-DISPLAY.md).
4. **Slack request on-ramp** spec (free text → AI → request record).
5. Wire real `#daily-checkin` reading (POC).

## This week (4 things only)
1. Confirm the request-intake fields you actually use (title, tier, dates, location?).
2. Calculate the resignation-cost ROI number.
3. Decide the POC scope (your team — done).
4. Start the weekly "look + rebalance once" habit.
