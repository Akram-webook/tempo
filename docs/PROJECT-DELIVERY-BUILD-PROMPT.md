# Full build prompt — "Project delivery" page (GitHub-as-warehouse)

Copy everything between the lines and send it to another agent to reproduce the page.
It is the complete spec: what it is, how it's built, every skill used, and every bug we
hit with the fix — so they don't repeat our mistakes.

---
---

## PROMPT TO SEND

You are building a **"Project delivery"** page for an internal vanilla-JS web app
(single global `window.WP`, no framework, bundled by a `build.js` into one HTML file,
served by GitHub Pages, bilingual EN + AR/RTL, light + dark, design tokens only, inline
SVG icons — never emoji). Reproduce the page below exactly, including its data pipeline
and its guardrails.

### 1. What the page IS (the job it does)
A single director-only page that answers "what has the project team shipped, what's in
progress, and what needs a decision?" — derived from real delivery signals, never typed
by hand. It replaces status meetings and a manually-updated slide/sheet. Core principle:
**derive, never assert.** Every number on the page is computed from source data; if the
source is missing, the page says so honestly rather than showing a fake value.

### 2. The warehouse (this is the important architectural choice)
**GitHub IS the database. No Google Sheets, no Apps Script, no JSONP, no live backend.**
- Delivery data is committed to the repo as JSON: `data/exec-status.json`.
- User feedback is a SEPARATE committed file: `data/feedback.json`. **Never merge the two
  files on disk** — they only meet in the view at render time.
- A GitHub Action derives `exec-status.json` from merged PRs and commits it via the
  Contents API. GitHub Pages serves the JSON; the page `fetch()`es it. Git history = the
  audit log. There is no server to run, secure, or pay for.
- **Never put a token/PAT/secret in the front-end bundle** — it compiles into a PUBLIC
  file. Any write must be a server-side action using the CI's `GITHUB_TOKEN`, never a
  key shipped to the browser. (This is why users can't self-submit yet — see §7.)

### 3. The data pipeline (how the page stays current by itself)
- `scripts/compute-exec-status.js` runs in CI. It reads every merged PR that carries a
  **`wave:<name>` label** (e.g. `wave:exec-status`, `wave:capacity`, `wave:real-data`,
  `wave:slack`). Each wave label = one delivery bucket. For each labelled PR it emits one
  timeline item `{ id, area, title, status:'Done'|'Working', type, ts }`. Type is inferred
  from the PR **title** (a regex: fix→Bug, feat→Feature, etc.) — there is NO `type:` label.
  It also computes per-wave progress ("N/M PRs"), health, and a "needs you" list.
- Trigger it from: `push` to the relevant paths, a daily `schedule` cron, AND
  `workflow_dispatch` (so a human can force a refresh now). Output: it commits
  `data/exec-status.json`.
- **Deploy chaining gotcha (we hit this):** commits made by CI with `GITHUB_TOKEN` do
  **not** fire a `push` event, so a naive deploy-on-push never runs. Fix: the deploy
  workflow must also trigger on `workflow_run: { workflows: ["Executive Status",
  "Receive Feedback"], types: [completed] }`. Without this, the JSON updates but the site
  never redeploys and looks stale forever.

### 4. The view (`src/js/ui/exec.js`) — build these pieces
Gate the whole route to director/admin (`WP.can('viewSettings')`), and re-check the
permission again inside any write handler (defence in depth). Load order: fetch
`exec-status.json` (primary), THEN best-effort fetch `feedback.json` (a missing/failed
feedback file must NEVER break the page). Pieces:
- **Header + launcher:** headline "% delivered" + a single progress bar + a stats strip
  ("N shipped · N in progress · N need you"). Stats count TIMELINE ITEMS, not waves, and
  must EXCLUDE feedback items (feedback is incoming ideas, not shipped work).
- **Wave cards** (not rows): one card per wave — WAVE N + status badge + tinted border +
  health dot + "N/M PRs" + open count.
- **Timeline:** one row per delivery item, newest first, grouped, with a status icon +
  chip. A time-navigator (Week | All segment; in Week mode a ‹ prev · "Week of…" · next ›
  stepper + Today).
- **Two view-local filters:** Type (`all|bug|feature|improvement`) and Status
  (`all|done|working|planned`), matched case-insensitively. Every chip click repaints the
  body. Do NOT add a plural→singular type map — the matcher already handles it and a map
  breaks it.
- **Empty vs stale distinction:** `items` field ABSENT (stale JSON) → "Items will appear
  after the next status update."; `items: []` or a week with none → "Nothing in this
  range."; filters active but nothing matches → "No items match your filters." These three
  are different messages — never collapse them (a wrong one blames the date when the real
  cause is a filter).

### 5. Feedback fold + triage (folded into THIS page, no separate tab)
Triaged user feedback shows on the SAME timeline and answers the SAME filters.
- `feedbackAsItems(raw)` maps each `feedback.json` item into the timeline item shape,
  applying a local triage overlay first. A feedback row carries `source:'feedback'` + a
  `lane` (Frontend|Backend|Bug|Feature|Enhancement|New skill) + `wave`. Render it with a
  small "Feedback" tag + lane + wave chip; a Discarded item reads dimmed + struck-through.
- **Triage lifecycle → exec bucket:** New/Review→Planned, Testing/Assigned→Working,
  Discarded→grey. So filtering Status=Planned surfaces "still to decide", Working surfaces
  "assigned to a wave".
- **Per-row triage controls (director edits):** a gear toggle reveals a panel that
  **suggests** a Status (+ Wave for Assigned) and pre-selects it, with a plain-words WHY
  banner, a Status select, a Wave select (shown only for Assigned), Save + Cancel, an
  inline "Saved" tick, and an honest note about where it saved. Suggestion rules (ordered,
  honest): Bug→Assigned to the wave that owns its surface; feature that fits a wave→that
  wave; low-value idea→Review (parked, NOT inflated, NOT dropped). Save writes to a local
  overlay (localStorage) behind ONE function, so swapping to a shared write later is a
  one-line change.
- **Real triage decisions** (setting status/wave for everyone) are made by editing +
  committing `data/feedback.json` with an audit stamp (`triagedAt`/`triagedBy`/
  `triageNote`) — the browser overlay is per-device and never shared.

### 6. Non-negotiables (these are what break if skipped)
- **dist no-drift:** after any `src/` change, rebuild and commit `dist/`; a second rebuild
  must add nothing (idempotent). The committed bundle IS the deploy artifact.
- **Full test suite green** (`npm test` exit 0). Add/extend a `test/verify-*.js` (jsdom)
  for any behavior change. Boot the bundle in jsdom, stub `fetch`, call
  `WP.ui.exec.render(el)`, assert on painted DOM.
- **Tokens only, never raw hex** in CSS (a token-purity test enforces it) — and grep the
  JS too, because hex inside a `style="…"` literal escapes that test.
- **Bilingual:** every user string in the i18n table with `{ en, ar }`; verify RTL.
- **No em-dashes in commit messages** (a commit-msg hook hard-blocks them).
- **Ship via a labelled PR:** branch → PR → add the `wave:<name>` label → merge. An
  unlabelled merge is INVISIBLE to the page (see the bug log). Never edit `main` directly.

### 7. Known open item (be honest, don't fake it)
Users cannot self-submit feedback and the in-page triage can't do a SHARED write, because
both need a token-safe server-side proxy (a PAT in the public bundle is a security hole).
Until that exists, "Send" stays "Not configured yet" and real triage is a warehouse commit.

### 8. Bugs we hit — and the fix for each (so you don't repeat them)
1. **Timeline always empty.** The compute script wrote cover/waves but no `items[]`, so the
   timeline read `undefined`. Fix: emit `items[]` (one per PR). Always verify the live JSON
   actually contains `items[]` before blaming the view.
2. **JSON updates but the site never redeploys.** `GITHUB_TOKEN` commits don't fire `push`.
   Fix: chain deploy on `workflow_run` of the data workflows (§3).
3. **Stats strip over-counted.** An Assigned feedback item (→Working) was counted in "in
   progress". Fix: exclude `source==='feedback'` from the stats.
4. **Feedback rendered as plain untagged text.** The item mapper dropped `source/lane/wave`
   (and later `klass/area/priority`). Fix: copy ALL fields through every mapping hop
   (`timelineItems` is the one that silently drops them — grep it whenever you add a field).
5. **Filtered-empty blamed the date.** Showed "Nothing in this range" when a filter was the
   cause. Fix: a distinct "No items match your filters" message when any filter is active.
6. **Double-Polish corrupted the note** into nested `[Bug] [Bug]…`. Fix: an idempotency
   guard (`looksPolished`/`parseStory`) so re-polishing is a no-op.
7. **Ghost "Working" row.** A closed-but-unmerged PR still produced an item. Fix: skip
   `closedUnmerged` PRs in the compute loop.
8. **Triage Save showed the OLD status.** Save repainted from a cached MERGED result, so the
   overlay (applied at fold time) never re-read. Fix: cache the RAW inputs and re-derive on
   every paint — never cache the merged result and repaint from it.
9. **"Save does nothing" (really: no confirmation + wrong scope).** The write worked; there
   was just no visible feedback, and it only wrote to one browser. Fix: an inline "Saved"
   tick that survives the repaint (remember-open + restore-open the panel), plus an honest
   note that it's device-local. LESSON: when a user says "it's not saving", first verify
   whether the write happened — often the write is fine and the FEEDBACK or the TARGET
   (local vs shared) is the real gap.
10. **Merged a PR unlabelled → it vanished from the page.** compute only derives labelled
    PRs. Fix: add the `wave:*` label, then `workflow_dispatch` the compute to re-derive now
    (don't wait for the cron), then let the chained deploy publish. Verify with a curl.
11. **jsdom localStorage trap.** A hand-rolled `w.localStorage={}` shim silently does NOT
    override the native one; native works only when the JSDOM `url` is set. And the app's
    auto-boot crashes bare-jsdom `DOMContentLoaded` — filter out `app.js` when booting
    scripts manually, or drive `render()` directly.

### 9. Skills we used (and how each applied)
- **how-akram-works** — the operating method + the finish ritual: re-check against the real
  live thing (not memory), log a lesson, classify + log the delivery for the BA, distill a
  skill. Applied at the end of every change.
- **tempo-ship** — the gate→build→verify→ship loop: branch off main, edit `src/`, rebuild
  dist (no-drift + idempotent), `npm test` exit 0, Playwright render pass (light/dark/AR),
  labelled PR, gate (`mergeable CLEAN`, CI green, in-lane), merge, confirm deploy + curl.
- **tempo-exec-timeline** — the map of this exact view: where each function lives, the
  data flow, the empty-vs-stale rule, the feedback fold, and the triage controls.
- **tempo-feedback-triage** — the operator task: making real triage decisions by editing +
  committing `data/feedback.json` (shared) vs the per-browser overlay; the honest-triage
  rule (bug→fix now, low-value→park at Review, dup→discard); data-only ship (no build).
- **senior-product-designer / ui-polish / heuristic-evaluation** — for the panel redesign:
  visual hierarchy, every state (empty/loading/error/saved), accessibility, microcopy,
  inline-SVG-not-emoji, and severity-rated critique before shipping.
- **verify / browser-testing** — a real render pass (not just mocked DOM asserts), because
  mocked-only tests have shipped blank pages here.

### 10. Definition of done (every change)
Build clean · full suite green (+ a new/updated test) · dist no-drift + idempotent · all
states handled (empty/stale/filtered/loading/error/saved) · EN + AR both themes verified in
a real render · tokens only, no emoji icons · no secret in the bundle · a LABELLED PR
merged · the change confirmed LIVE by curling the JSON and loading the page · a lesson +
delivery-log entry written. If a step was skipped or a test failed, say so plainly.

---
---
