# Tempo — Feature Reference

Tempo is Webook Event Operations' internal Workforce-Intelligence / Operations web app: an org and
workload map, a capacity and team-health engine, performance evaluations (manager + self + upward
360), daily tasks and engagement, fairness and wellbeing early-warning, leadership decision-memory
reports, and a Super-Admin permissions and settings surface. It is vanilla HTML/CSS/JS on a single
`window.WP` namespace, EN + AR (RTL/LTR), light/dark, WBK design tokens. Tempo's charter (per
`ai-os/CONSTITUTION.md`) is to **improve decisions, not report on people** — so each feature below is
tied to the operational decision it supports, and sensitive individual detail opens only along the
management line.

Access tiers are grounded in `src/js/core/access.js` and `docs/ACCESS-MODEL.md`:

- **self** — a person sees their own page/record.
- **manager** — sees their team (direct reports, recursive) via `visiblePeople` / `teamOf`; sees a
  direct report's sensitive detail via `canSeeSensitive` (self OR direct manager OR director).
- **director / super-admin** — `level` of `director` / `admin`; `canManage` gates admin screens;
  `canSeeComp` gates compensation; `isSuperAdmin` is the top tier (Super Admin = akram@webook.com).
- Note: `access.js` is a **client-side filter**. For entities still shipped as bundled mock, access is
  presentation-only; `evaluations`, `events`, `people`, and sensitive `growth` are server-enforced
  under Supabase RLS (see `docs/ACCESS-MODEL.md` §F1).

## Table of contents

1. [Access & Auth](#1-access--auth)
2. [Workload & Capacity](#2-workload--capacity)
3. [Evaluations](#3-evaluations)
4. [Growth & Readiness](#4-growth--readiness)
5. [Daily Tasks & Engagement](#5-daily-tasks--engagement)
6. [Fairness & Wellbeing](#6-fairness--wellbeing)
7. [Intelligence & Reports](#7-intelligence--reports)
8. [Admin & Settings](#8-admin--settings)
9. [Shared UI](#9-shared-ui)

---

## 1. Access & Auth

### Sign-in
- **What it is:** Sign-in screen with four configurable auth modes: Verified Link (Supabase OTP
  email), **Password** (Supabase email + password, with "stay signed in" and a **recovery /
  set-new-password** flow via `PASSWORD_RECOVERY`), Google Identity Services (@webook.com validated),
  and Directory Gate (exact email match, demo only). Maps a **verified session email** to a
  registered Tempo account; denies non-registered emails. Anti-impersonation: identity is always
  `session.user.email`, never the typed field; wrong email/password returns one generic error.
- **Inputs:** `WP.config.supabaseUrl` / `supabaseAnonKey` / `googleClientId` / `authMode`,
  `WP.data.PEOPLE` (registered accounts), `WP.state.lang` / `theme`.
- **Decision it supports:** Whether a person is allowed into the app at all (the access gate).
- **Access tier:** Public entry point; post-validation gated by the **2026-07 allow-list**
  `WP.access.hasAccess(personId)` (locked to akram/ahmed/farah/motaa) — false → "accessDenied" +
  sign-out. Super Admin = akram@webook.com. See [`SECURITY.md`](SECURITY.md) for why this deters but
  does not truly lock (F3 Cloudflare Access edge gate pending).
- **Key files:** `src/js/ui/login.js` (session mapping in `WP.auth.initSession` / `app.js`).

### Role & permission model
- **What it is:** The RBAC + ReBAC engine: who sees which people (rows) and which fields (columns).
  Full tier matrix + predicate reference in [`ROLES.md`](ROLES.md).
- **Inputs:** `WP.data.PEOPLE` (org tree via `managerId`), viewer `level` / `superAdmin`.
- **Decision it supports:** Every "can this viewer see/act on this?" question across the app.
- **Access tier:** Defines the four roles (Member / Manager / Director / Admin — see `ROLES.md`).
  The single UI gate is **`WP.can(cap, targetId?)`** (`roleOf` + an 8-capability matrix:
  `viewOrg`, `viewSensitive`, `writeEval`, `manageAccess`, `resetPassword`, `manageRoles`,
  `editSettings`, `viewSettings`). It composes the predicates `visiblePeople`, `teamOf`, `canSee`,
  `canAct`, `canManage`, `isSuperAdmin`, `canSeeSensitive`, `canSeeUpward`, `canSeeComp`,
  `relationshipTo`, plus the `hasAccess` allow-list. A denied button is also a denied query (RLS
  mirrors the same rules).
- **Key files:** `src/js/core/access.js`.

### Dashboard (role-adaptive home)
- **What it is:** Role-adaptive landing dashboard. Director/Senior see org-wide attention items,
  team load by lead, and talent pipeline; managers see their reports and "who can take" work;
  employees see personal load, projects, tier-1 delivery, and a growth note.
- **Inputs:** `WP.access.visiblePeople`, `WP.capacity.teamMetrics`, `WP.capacity.priorRefDate`,
  `WP.state.window` / `refDate`, `WP.growth.flightRisk` / `promotionReadiness` / `isRamping`,
  `WP.data.EVALUATIONS`, `WP.viewer()`.
- **Decision it supports:** Where to direct attention today (overload, burnout risk, development
  gaps, spare capacity).
- **Access tier:** self / manager / director — view scoped by `visiblePeople(viewer)` and
  `viewer.level`; the leader-view Assign button is gated by `WP.access.canAct`.
- **Key files:** `src/js/ui/dashboard.js`.

---

## 2. Workload & Capacity

### Capacity engine
- **What it is:** The core brain. Measures assigned load vs a monthly ceiling on a 0–100% scale
  (tiers weight 50/25/10%), with fuel-gauge states (Available/Balanced/Near/Overloaded), an early
  burnout signal (overlapping / back-to-back events), and week/month/year time-window scaling.
- **Inputs:** `WP.data.EVENTS`, `WP.data.TIERS`, `WP.data.STATES`.
- **Decision it supports:** Is a person / team healthy? Who is overloaded? Can they take more work?
  Team Health KPI = % of team in the Balanced band.
- **Access tier:** Pure logic (no gate); consumers apply visibility. API: `loadForPerson`,
  `loadBreakdown`, `stateForLoad`, `isHealthy`, `burnoutSignal`, `snapshot`, `teamMetrics`,
  `simulateAssignment`, `windowBounds`, `priorRefDate`.
- **Key files:** `src/js/core/capacity.js`.

### Workload map (org chart)
- **What it is:** Org chart + metrics view with tree/list toggle, density control, date navigation,
  unified people/team search, focus mode, and node-peek profiles. Shows hierarchy, account
  assignments, and workload state per person.
- **Inputs:** `WP.access.visiblePeople`, `WP.capacity.teamMetrics`, `WP.data.EVENTS` / `STATES` /
  `LEVELS`, `WP.state.window` / `refDate`, `WP.growth` signals, density pref in localStorage.
- **Decision it supports:** Explore org structure, discover who is available / near / overloaded, map
  account ownership, scope to one team.
- **Access tier:** self / manager / director — roster from `visiblePeople(viewer)`; the "manage
  access" action (list mode) gated by `WP.access.canManage`.
- **Key files:** `src/js/ui/workloadMap.js`.

### Assignment drawer
- **What it is:** Two-step assignment flow — capture a work request (title, tier, dates, city), then
  rank candidates by proximity + lowest load with a projected-load / state simulation. Overloaded
  candidates are soft-locked and require a logged override reason.
- **Inputs:** `WP.access.visiblePeople`, `WP.capacity.simulateAssignment`, `WP.data.EVENTS` /
  `TIERS`, `WP.state.window` / `refDate` / `lang`.
- **Decision it supports:** Who should take this work, and log any override of the load guard.
- **Access tier:** manager+ — both `openRequest()` and `open()` gated by `WP.access.canAct`;
  non-acting viewers cannot override.
- **Key files:** `src/js/ui/assignmentDrawer.js`.

### Profile (person detail)
- **What it is:** Full person profile: capacity, daily check-in summary, growth/skills/EQ/tenure,
  manager + director lenses, aggregated anonymous upward feedback, compensation, a sourced evidence
  timeline, and fair-shot signals. A peek popover gives a quick snapshot.
- **Inputs:** `WP.access.byId`, `WP.capacity.snapshot`, `WP.growth.*`, `WP.data.GROWTH` / `EQ_DOMAINS`
  / `COMP` / `UPWARD` / `TIERS` / `EVENTS` / `MIN_RATERS`, `WP.events.query`, `WP.evaluation.*`,
  `WP.readiness.developmentProfile`.
- **Decision it supports:** How is this person performing/growing? What evidence backs a development,
  succession, or comp conversation?
- **Access tier:** gated at entry by `canSee`; sensitive sections (manager/director lens, work-style,
  EQ, quarterly, skills, fair-shot, dev panel) by `canSeeSensitive`; upward feedback by
  `canSeeUpward` (with k-threshold `MIN_RATERS` suppression); compensation by `canSeeComp`.
- **Key files:** `src/js/ui/profile.js`.

---

## 3. Evaluations

### Evaluations hub
- **What it is:** Performance › Evaluations hub: active cycle metadata, the viewer's pending tasks
  (self-assessment + direct reports to rate), stacked team-progress bar, and a per-employee status
  table. Supports cycle switching and new-cycle creation. Includes a neutral consistency-awareness
  panel on the manager's own ratings.
- **Inputs:** `WP.evaluation.activeCycle` / `cycles` / `ensureSelf`, `WP.data.EVALUATIONS`,
  `WP.access.directReports` / `visiblePeople`, `WP.db` sync status, `WP.evalIntel.consistencyCheck`.
- **Decision it supports:** What evals do I owe, how far is my team, and are my own ratings worth a
  second look for bias.
- **Access tier:** self (self-assessment always permitted) / manager (rates direct reports) /
  director; "New Cycle" gated by `WP.access.canManage`.
- **Key files:** `src/js/ui/evaluations.js`.

### Evaluation form (downward + self)
- **What it is:** The evaluation screen. A manager (or director/admin) rates 16 weighted criteria
  (1–5), writes feedback, and approves; the same screen serves self-assessment. Shows an
  evidence-prep summary and a collapsed AI suggested-range band.
- **Inputs:** `WP.access.relationshipTo` / `canSeeSensitive`, `WP.data.EVAL_CRITERIA` /
  `EVAL_QUESTIONS` / `SELF`, `WP.evaluation.ensure` / `ensureSelf` / `overall`, `WP.evalPrep.prepare`,
  `WP.evalIntel.suggestedRange`, `WP.db.evaluations`, `WP.state.selectedCycle` / `evalOrigin`.
- **Decision it supports:** The rating + written feedback; whether the human accepts the AI's
  suggested band (provenance stamped only if revealed, evidence-backed, and within range).
- **Access tier:** evaluate if `relationshipTo` is `manager` or `director`; self-mode if
  `viewer.id === targetId`; prep panel + suggested band gated by `canSeeSensitive`.
- **Key files:** `src/js/ui/evaluation.js`.

### Upward feedback (360)
- **What it is:** A report rates their manager on 5 leadership behaviors (1–5) plus qualitative
  responses. Results aggregate + anonymize and route **up** (to the manager's manager or C-level),
  never shown raw to the rated manager.
- **Inputs:** `WP.access.byId`, `WP.viewer()`, `viewer.managerId`, `WP.data.UPWARD_CRITERIA` /
  `UPWARD_QUESTIONS`, transient `WP._upwardDraft`.
- **Decision it supports:** Safe upward signal on a manager's leadership; leadership reads patterns,
  never individual responses.
- **Access tier:** self as rater — form gated to `viewer.managerId === manager.id` (own manager
  only). Aggregated results readable via `canSeeUpward` (skip-level up-chain + admin, never the
  rated manager or below).
- **Key files:** `src/js/ui/upward.js`.

### Evaluation prep engine
- **What it is:** Assembles existing event-store evidence into a sourced, gap-honest prep summary
  (workload / wellbeing / evaluation / recognition / decision sections + listed gaps). No score.
- **Inputs:** append-only event store (`WP.events.query`), event categories.
- **Decision it supports:** Lets a manager prepare an evaluation from record, not memory.
- **Access tier:** consumed by the evaluation form behind `canSeeSensitive`. API: `summarize`,
  `prepare`.
- **Key files:** `src/js/core/evalPrep.js`.

### Evaluation intelligence
- **What it is:** Evidence-first suggested /5 **range** (never a single score) with reasoning,
  evidence, and risks; plus a consistency check (leniency/severity skew, evidence-mismatch) framed
  as "worth a second look."
- **Inputs:** event store (`WP.events.query` / `WP.db.events`), `WP.data.EVALUATIONS`.
- **Decision it supports:** Reduce bias / anchor the human rating in evidence — support, never decide.
- **Access tier:** internally gated by `WP.access.canSeeSensitive`; requires 3+ sourced events. API:
  `assess`, `suggestedRange`, `assessConsistency`, `consistencyCheck`.
- **Key files:** `src/js/core/evalIntel.js`.

---

## 4. Growth & Readiness

### Growth signals
- **What it is:** Predictive HR signals (signals, never auto-decisions): flight-risk, promotion
  readiness (with a fairness check on whether big work was even offered), new-hire ramp factor,
  skill-gap and skill-trend, EQ average.
- **Inputs:** person records (`joined`, `roleStart`, `lastProgression`, `tier1Delivered`), capacity
  history, engagement snapshots.
- **Decision it supports:** Who may be at risk of leaving, who is ready to grow, and where the org
  under-invested (fairness gap) — surfaced on dashboard and profile.
- **Access tier:** pure logic; consumers gate on `canSeeSensitive`. API: `tenureMonths`,
  `monthsInRole`, `monthsSinceProgression`, `rampFactor`, `isRamping`, `sustainedOverload`,
  `flightRisk`, `promotionReadiness`, `skillGap`, `skillTrend`, `eqAverage`.
- **Key files:** `src/js/core/growth.js`.

### Development & growth (readiness) panel
- **What it is:** Two surfaces: a per-person evidence-based development bundle (strengths, growth
  areas, evidence coverage, gaps — never a readiness score/verdict) shown on the profile; and a
  director/admin k-anonymized org-capability view (capability distribution + skill-gap areas).
- **Inputs:** `WP.readiness.developmentProfile` / `orgCapability`, `WP.access.canManage`, event store,
  completed evaluations.
- **Decision it supports:** What evidence exists for this person's development; where the org has
  skill-gap hotspots — never "ready or not."
- **Access tier:** per-person panel mounted only when `canSeeSensitive` (defence-in-depth: shows
  "not enough evidence yet" if denied); org view gated by `WP.access.canManage`, cells suppressed
  below k≥5.
- **Key files:** `src/js/ui/readiness.js`, `src/js/core/readiness.js`.

### Evidence / decision timeline
- **What it is:** Pure derivation + query over an append-only event store; derives events from live
  signals (capacity, wellbeing, completed evals, check-ins, kudos, activity log) merged with
  explicit events. Every event must carry a `source` (anti-fabrication).
- **Inputs:** capacity engine, wellbeing engine, evaluations, check-in/engagement snapshot, activity
  log.
- **Decision it supports:** A single sourced history behind development, evaluation, and profile
  views.
- **Access tier:** pure derivation; read on profile behind `canSee` and (per category) sensitivity
  gating. API: `derive`, `filter`, `sortDesc`, `query`, `quarterOf`, `quarters`.
- **Key files:** `src/js/core/events.js`.

---

## 5. Daily Tasks & Engagement

### Daily tasks board
- **What it is:** Overview-first grid of smart cards showing team check-ins from Slack
  `#daily-checkin` — who checked in, their load %, and status flags (burnout / available / learned),
  sorted attention-first.
- **Inputs:** `p.dailyCheckin`, `WP.capacity.snapshot`, `WP.state.window` / `refDate`, `WP.viewer()`,
  `WP.data.MILESTONES`.
- **Decision it supports:** Who needs attention today — at-risk, available capacity, follow-ups.
- **Access tier:** scoped by `WP.access.visiblePeople(viewer)` (self / manager / director); no extra
  gate.
- **Key files:** `src/js/ui/dailyTasks.js`.

### Daily check-in prompt
- **What it is:** One-per-session modal on app open with two tabs: "Log what I did" (free text →
  structured → Slack `#daily-checkin`) and "Yesterday's summary" (read-only). Effortless, dismissible,
  no shaming.
- **Inputs:** `WP.viewer()`, `WP.engage.get(me.id)`, `WP.state.refDate`, `WP._promptMode`,
  `WP._meDay`.
- **Decision it supports:** Did I log my progress today/yesterday (gentle habit nudge).
- **Access tier:** self only; skips the admin user (`me.id === '__admin__'`).
- **Key files:** `src/js/ui/dailyPrompt.js`.

### My Progress (engagement home)
- **What it is:** Personal healthy-engagement dashboard: check-in button, ~66-day habit meter, streak,
  weekly-goal bar, growth-level tracker, done-items feed (today + yesterday backfill), and a kudos
  inbox. Celebrates small wins; no shame or overwork incentives.
- **Inputs:** `WP.viewer()`, `WP.engage.get(me.id)` (weekGoal, weekDone, daysActive, streak, level,
  doneToday/Yesterday, kudos), `WP.data.MILESTONES`, `WP.engage.habitDays`, `WP.state.refDate`,
  `WP._meDay`.
- **Decision it supports:** Am I building a habit / logging progress — self-directed motivation.
- **Access tier:** self only; skips the admin user.
- **Key files:** `src/js/ui/me.js`.

---

## 6. Fairness & Wellbeing

### Fairness / overload radar
- **What it is:** Team-balance view showing workload distribution across teams as labeled status
  bands (Balanced / Watch / Unbalanced) with icon + color, backing factors, and a suggested
  rebalancing action per team. No manager/team ranking.
- **Inputs:** `WP.fairness.scan(viewer.id, refDate)`, `WP.access.byId`, `WP.state.lang`.
- **Decision it supports:** Which teams are overloaded / under-resourced and what concrete
  rebalancing action to take.
- **Access tier:** director / super-admin (all teams) or a manager for their own team only — hard
  gate `WP.fairness.canView(viewer)`. Engine API: `teamBalance`, `scan`, `canView`.
- **Key files:** `src/js/ui/fairness.js`, `src/js/core/fairness.js`.

### Wellbeing early-warning
- **What it is:** Support view listing flagged people with a band chip (Critical / At-risk / Watch),
  explainable factors (sustained overload, rising trend, schedule clash, missed check-ins), and a
  suggested relief action. Empty state ("No concerns") is the good outcome. No scores/ranks shown.
- **Inputs:** `WP.wellbeing.atRisk(viewer.id, refDate)`, `WP.access.byId`, `WP.state.lang`; engine
  reads weekly loads, burnout signal, check-in/engagement snapshot.
- **Decision it supports:** Who needs support today and what action would help.
- **Access tier:** manager / director / super-admin — hard gate `WP.wellbeing.canView(viewer)`.
  Engine API: `scoreForPerson`, `scoreFor`, `canView`, `atRisk`.
- **Key files:** `src/js/ui/wellbeing.js`, `src/js/core/wellbeing.js`.

---

## 7. Intelligence & Reports

### Weekly intelligence report
- **What it is:** Leadership decision-memory dashboard: de-identified, evidence-cited decision shapes
  — decision counts by type, top focus areas, recurring themes, AI-acceptance rate, and
  week-over-week shifts, with a window stepper (7/30 days, older/newer). Never surfaces individuals.
- **Inputs:** `WP.decisionMemory.weeklyReport({ days, ref }, { viewer })`, `WP.state.weeklyWin` /
  `refDate` / `theme`, `WP.viewer()`.
- **Decision it supports:** Leadership awareness of decision patterns and AI-adoption trends over
  time.
- **Access tier:** director / super-admin — `WP.access.canManage(viewer)`; nav entry hidden for
  non-admins.
- **Key files:** `src/js/ui/weeklyReport.js`, `src/js/core/decisionMemory.js` (API: `aggregate`,
  `weeklyReport`).

---

## 8. Admin & Settings

### Permissions (Super Admin)
- **What it is:** Role-assignment screen: every person with a role dropdown (Specialist → Super
  Admin); each change is confirmed and written to the provenance log; RBAC updates live on save.
- **Inputs:** `WP.data.PEOPLE`, `WP.state.viewerId` / `lang`, `WP.access.byId`.
- **Decision it supports:** Who holds which role (which controls all visibility).
- **Access tier:** director / super-admin — `WP.access.canManage(WP.viewer())`; includes a
  self-demotion guard. Changes logged via `WP.logEvent({ type: 'role-change' })`.
- **Key files:** `src/js/ui/permissions.js`.

### Settings
- **What it is:** System-tuning dashboard: tier weights, capacity ceiling, read-only capacity-state
  bands, Slack user linking, a 5-role access-model guide, and a view-as / override / assign activity
  log (last 20).
- **Inputs:** `WP.data.TIERS` / `CEILING` / `STATES` / `PEOPLE`, `WP.activityLog`, `WP.state.lang`.
- **Decision it supports:** Org-wide calibration of what tiers cost and what "healthy" means; audit
  of who saw/changed what.
- **Access tier:** intended director/admin (no explicit in-file gate found — reached via gated
  routing; config changes logged via `WP.logEvent({ type: 'config' })`).
- **Key files:** `src/js/ui/settings.js`.

---

## 9. Shared UI

### Component library (WBK)
- **What it is:** Live showcase of every Webook Design System component on WBK tokens (buttons,
  inputs, chips, tables, dialogs, date picker, PIN, tickets, etc.) — a reference, not a decision
  surface.
- **Inputs:** `WP.data.PEOPLE` (sample avatars), `WP.state.theme` / `refDate` / `route`.
- **Decision it supports:** None operational — helps designers/developers build consistent features.
- **Access tier:** public (all roles, reference only).
- **Key files:** `src/js/ui/wbkLibrary.js`.

### Shared components
- **What it is:** Low-level helpers: HTML escaping, color/token utilities, avatars, provenance note,
  breadcrumb, page header, status badge, sub-tabs, and a self-contained searchable/sortable/paginated
  data table + toast.
- **Inputs:** `WP.i18n.t`, `WP.ui.icon`, `WP.db.usingBackend` / `status`, per-table `WP.state`.
- **Decision it supports:** None — presentation only; caller is responsible for gating data.
- **Access tier:** none (helpers).
- **Key files:** `src/js/ui/components.js`.

### Icons
- **What it is:** Lucide-style inline-SVG icon set (`WP.ui.icon(name, size)`), monochrome via
  `currentColor`, replacing emoji-as-icons.
- **Inputs:** none (pure presentation).
- **Decision it supports:** None — consistent icon rendering.
- **Access tier:** none (helpers).
- **Key files:** `src/js/ui/icons.js`.
