# Slack Integration — how the daily check-in looks & flows

Goal: the employee writes their end-of-day update **once, in Slack** (where the
habit already lives), and it flows into Webook Pass automatically. Read-only.
Zero new place to report. Not surveillance — it posts to the *team*, not to a boss.

## The golden rules (from research)
- Ask about **tasks/outcomes, never hours**. "What did you finish?" not "What did you do all day?"
- **Post to a shared channel**, reply in a thread — visible to the team, not a private manager digest. That's what makes it alignment, not monitoring.
- **Structured fields** (fixed questions) so it's scannable by humans *and* parseable into the dashboard.
- **Fire ~30–60 min before end of local workday**, one gentle reminder, per-person timezone.
- Keep it ~60 seconds. A light optional mood/energy field is fine; everything else optional.

## The 4 fields (what Webook Pass reads)
Matches the `dailyCheckin` shape already in the prototype (`plan / done / remaining / learned`):

| Field | Prompt | Why |
|---|---|---|
| ✅ Done | What did you finish today? | progress / delivery signal |
| 🔜 Remaining | What's still open / carrying to tomorrow? | re-planning |
| 🚧 Blockers | Anything stuck or that you need a hand with? | support, not interrogation |
| 🌡️ Energy (1–5) | How's your energy today? | soft burnout signal (optional) |
| 💡 Learned (optional) | Anything you learned? | growth signal feeding the skills view |

## What the prompt looks like (DM sent to each person at ~5pm local)
```
🌇 End-of-day check-in — ~60 seconds, posts to #daily-checkin

1. ✅ What did you finish today?
2. 🔜 What's still open / carrying to tomorrow?
3. 🚧 Anything blocking you or that you need a hand with?
4. 🌡️ Energy today? (1–5)
```

## What a posted update looks like (lands in #daily-checkin)
```
🌇 EOD — Omar Al-Shehri · Tue Jun 17

✅ Done
• Two site visits (MDLBEAST + Dubai summit)
🔜 Remaining
• Both run sheets — aiming to finish tomorrow
🚧 Blockers
• Stretched across two events this week
🌡️ Energy: 3/5
💡 Learned: new load-in route saves ~40 min
```
→ Webook Pass parses the fields and shows them on Omar's profile under
"Daily summary," and the low energy + blocker text reinforces his burnout flag.

## How to build it — 3 options (sequenced)

**Option A — Native Slack Workflow Builder (recommended for the POC).**
A scheduled Workflow fires the form daily, collects structured fields (short text +
a 1–5 rating), and auto-posts to `#daily-checkin`. Responses can be written out to a
sheet/store that Webook Pass reads. On all paid Slack plans, no bot, no cost.
Limitation: native timezone-per-user scheduling and auto-digests are weaker than paid bots.

**Option B — Free-text channel read (fastest to start).**
People keep posting in `#daily-checkin` however they like; Webook Pass reads the
channel and parses fields with simple heuristics (the ✅/🔜/🚧 headers). Less clean,
but zero setup — good for week 1 of the silent POC.

**Option C — Async standup bot (Geekbot / DailyBot / Standuply), later.**
If adoption proves out: per-user timezone DMs, auto-compiled digests, and (DailyBot)
even AI/agent auto-reporting. ~$1.5–3.6 / user / month. Adds polish, not core value.

## The flow, end to end
```
5pm local ─▶ Slack prompts the person (Workflow DM)
            └▶ person answers 4 fields (~60s)
                 └▶ posts to #daily-checkin (team-visible)
                      └▶ Webook Pass reads + parses the fields  (READ-ONLY)
                           ├▶ profile "Daily summary" (plan/done/remaining/learned)
                           ├▶ low energy / blockers ──▶ reinforces burnout flag
                           └▶ "learned" ──▶ feeds the skills/growth view over time
```

## What Slack does NOT provide (so the website is still needed)
Slack stores the *messages*; it does not compute *state*. It can't tell you Omar is
at 85%, has overlapping events, is a retention risk, and is promotion-ready. That
computed picture — across the whole team, in 30 seconds — is the product. The Slack
read is the **input**, not the dashboard.

> Reliability flags: Slack Workflow Builder was overhauled in 2023–24 and exact
> step/connector availability is plan- and version-specific; Canvas live-data
> dashboards are partly forward-looking. Verify in your workspace before committing.
> Bot pricing is approximate — confirm on vendor pages.
