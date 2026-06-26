# Roadmap, Slack & Automation — making Webook Workload indispensable

Ideas you can actually apply, ordered by impact ÷ effort. The theme: **zero friction for
employees, automatic for you, and woven into the team's weekly rituals so removing it would
hurt.** That's what turns a tool into "the way we work."

## 1. Slack — make it effortless for the employee (the make-or-break)

Three friction levels. **Lower friction = higher adoption.** Pick the lowest your data can tolerate:

1. **Free-text + AI filtering (recommended, lowest friction).** The employee writes a normal
   end-of-day message in `#daily-checkin` — *however they want, no format*. The system reads it
   and an AI step extracts the structure (done / remaining / blockers / energy / learned),
   flags burnout language, and displays it cleanly on their profile. **The employee feels
   nothing new — they already type in Slack.** You get clean structured data. This is exactly
   the "they give me a written summary, you filter it, then show it nicely" option you asked
   about — and it's the best one.
2. **Structured Workflow form.** A scheduled Slack Workflow DMs 4 fields at 5pm. Cleaner data,
   slightly more friction. Good as a later upgrade if free-text gets messy.
3. **Async bot (Geekbot/DailyBot).** Polished, per-timezone, auto-digests. Costs ~$2/user.
   Only if adoption is proven.

**Friction-killers to apply regardless:** one gentle reminder (not nagging) at end of local
day; post to a team channel (not a private boss DM) so it feels like alignment, not monitoring;
keep it ~60 seconds; let people log by just replying in a thread or reacting with an emoji.

## 2. The flow you asked for: "they write → you filter → show it nicely"

```
Employee types a free EOD note in #daily-checkin   (no format, ~30 sec)
        │
        ▼
Webook reads the message  (read-only)
        │
        ▼
AI step structures it →  ✅ done · 🔜 remaining · 🚧 blockers · 🌡️ energy · 💡 learned
        │                + flags risk language ("stretched", "too much", "again")
        ▼
Shows clean on the profile  +  feeds the burnout/early-warning signal
```
Why it's the right call: it respects the employee's time, needs **no training**, and still gives
you a tidy dashboard. The AI does the tidying, not the human. (This is the single biggest
adoption lever — people abandon anything that feels like extra paperwork.)

## 3. Automation & auto-posting (to speed YOUR work)

Set these to run on a schedule so the system works while you sleep:
- **Daily team pulse** → every morning ~7:30, auto-post to your managers channel:
  "Team Health 62% · 1 at risk (Osama 85% 🔥) · Talal free for the next opportunity."
- **Weekly report** → every Sunday, a digest: who was overloaded, what changed, what to rebalance.
- **Burnout alert** → the moment someone crosses Near Capacity or shows risk language, auto-DM
  their manager: "Heads up — Osama is at 85% with overlapping events. Want to rebalance?"
- **1:1 prep** → before your weekly 1:1s, auto-draft each person's summary (load + check-ins +
  skill focus + working-style note) so you walk in prepared.
- **Monthly Director briefing** → auto-draft the "here's the dept this month" note for Ahmed.
- **Auto-fill from tools you already use** → pull assignments from Notion / the events sheet so
  load updates itself; the update "writes itself" from work already logged.

All of these can run as scheduled tasks + Slack posting — no manual effort after setup.

## 4. Make it indispensable & company-wide (the strategy)

- **Embed it in the rituals.** If the weekly review, the assign-work decision, and the quarterly
  review all *open Webook first*, it becomes the place decisions happen — not a side tool. Tools
  die when they're optional; they stick when a decision can't be made without them.
- **Own the language.** Get the team saying "what's your load?", "team health?", "who's green?".
  When the vocabulary is yours, the tool is the source of truth.
- **One backbone, many departments.** The employee page + capacity engine is generic — Ticketing,
  Marketing ops, Experiences can all plug in with their own events/tiers. Same page, same Slack
  plumbing, same fairness log. That's how it goes company-wide.
- **Live dashboard the Director opens.** A page that refreshes from Slack/data every morning, that
  Ahmed checks in 30 seconds. Once he relies on it, it's permanent.
- **Land and expand.** Win in your team (silent POC) → Director shares the result → other depts ask
  → it becomes the standard. Don't pitch "company system" on day one (from your own strategy).
- **Trust = stickiness.** The provenance log (who/when/why) and "capacity not surveillance" framing
  are what make leadership comfortable scaling it.

## 5. Feature backlog for the app (pick as you go)

- **Manager Scorecard** — open as a manager → see your team's KPIs (Team Health, delivery, dev, attrition).
- **Team-health trend** — a sparkline so you see if the team is getting healthier or hotter over weeks.
- **"Who's free for the next opportunity"** — auto-list of green people ranked for the next Tier-1.
- **Alerts inbox** — a feed of early warnings instead of hunting for them.
- **Notion / sheet integration** — assignments flow in automatically.
- **Mobile** — already responsive; add a phone-first summary view.

## 6. What can be switched on right now
- A **scheduled daily or weekly Slack summary** (team pulse / report) — automated, no manual work.
- A **live dashboard artifact** that re-pulls from Slack each time it's opened.
- The **Manager Scorecard** screen inside the app.
- The **free-text → AI-filter** check-in flow wired to your real `#daily-checkin`.
