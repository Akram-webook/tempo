# Slack — full feature playbook for Webook Workload

Every Slack capability we can use, the recommended end-of-day format, and the AI-agent that
turns a free-text message into clean structured data. Goal: **effortless for employees,
automatic for you.**

## Your question: format vs free text? → **Free text, AI filters it.** (recommended)
Let people write their end-of-day note **however they want** in `#daily-checkin` — no template,
no fields, ~30 seconds. An **AI agent** reads each message and extracts the structure
(done / remaining / blockers / energy / learned), flags risk language, and posts it clean onto
the **Daily tasks** page (already built — the 🗒 button). Why this wins:
- **Zero friction → high adoption.** The #1 reason these tools die is "extra paperwork." A form
  feels like work; a free message doesn't.
- The **AI does the tidying**, not the human. You still get a structured dashboard.
- A structured Workflow form is the *fallback* if free-text ever gets too messy — keep it in your back pocket.

### The AI agent — how it works (simple)
```
Employee posts free text in #daily-checkin
        ▼
Agent reads the message (read-only) and is told: "extract done / remaining / blockers /
energy(1–5) / learned; flag burnout language like 'too much', 'again', 'stretched'."
        ▼
Returns clean JSON → shown on the Daily tasks page + feeds the burnout signal
```
No employee training, no new app. The agent is the translator between "how people talk" and
"what the dashboard needs."

## Slack features we can use (and how)
| Slack feature | How we use it | Effort |
|---|---|---|
| **Scheduled DM / reminder** | nudge each person ~5pm local for their check-in | low |
| **Channel post + threads** | check-ins post to `#daily-checkin`, replies in-thread (team-visible = alignment, not surveillance) | low |
| **Workflow Builder (forms)** | optional structured 4-field EOD form, auto-posts to channel; can write to a sheet the app reads | low–med |
| **Slash command** `/checkin` | let people log on demand from anywhere | med |
| **Emoji reactions** | react ✅ to mark a task done / 🆘 to raise a blocker — logging with one tap | low |
| **Scheduled messages (bot)** | auto-post the **daily team pulse** & **weekly report** to a managers channel | low |
| **Bot DM alerts** | auto-DM a manager when someone crosses Near Capacity or shows risk language | med |
| **Canvas** | a living team dashboard / single-source page embedded in the channel | med |
| **Profile API** | identity (photo, name, title) — already used for the org tree | done |
| **Huddles / clips** | quick async standups for remote/EU members (Thomas in Amsterdam) | low |
| **User groups (@ops-leads)** | targeted pings to just the managers | low |
| **Search API** | pull past check-ins to build the load history & trends | med |

## Make it feel easy (rules)
- One gentle reminder, end of local day — never repeated nagging.
- Ask about **work, not hours**. "What did you finish?" not "what did you do all day?"
- Post to the **team channel**, not a private boss DM — alignment, not monitoring.
- Respect time zones (your team spans Kuwait, Muscat, Cairo, Casablanca, Amman, Amsterdam).
- Keep it ~60 seconds; let emoji/threads do the lightest logging.

## Automations worth turning on (after the POC)
- **Daily team pulse** → morning Slack post: "Team Health 62% · 1 at risk · 1 free."
- **Weekly report** → Sunday digest of who was overloaded and what to rebalance.
- **Burnout alert** → instant manager DM when risk appears.
- **1:1 prep** → auto-summary of each person before your weekly 1:1.
These run on a schedule — no manual work once set.

> Verify before committing: Slack Workflow Builder steps/connectors are plan- and
> version-specific; bot pricing changes. The free-text + AI-agent path needs no paid bot.
