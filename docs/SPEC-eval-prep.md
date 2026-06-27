# SPEC — AI Evaluation Preparation (Wave 3.002, P2) · TAOS size M

> Authored from the Wave 3.002 task brief (the `tempo-evalprep-spec.zip` drop was not
> present on disk at implementation time). If the official zip arrives, reconcile this
> file with it. Gate: `ai-os/00-governance/INTELLIGENCE-ETHICS.md`.

## What this is
A **preparation** aid for a manager about to write an evaluation. It reads the
**Wave 3.001 append-only event store** for one person and assembles the evidence the
manager already has — grouped, sourced, and honest about gaps — so the manager walks in
prepared instead of relying on memory.

## What this is NOT (hard guardrails)
- **No score. No rating. No verdict. No recommendation.** Scoring/consistency/bias is P3
  — explicitly out of scope here. This layer never says "good/bad", never suggests a
  number, never ranks.
- **No fabrication.** Every line shown is a real event that carries its `source`. A line
  with no source is dropped, never invented (Ethics #2).
- **Gaps are listed, not filled.** A category with no evidence is shown as a gap
  ("No evidence captured for …"), never papered over with a guess.
- **"Not enough evidence" is a valid, first-class output.** When the store is sparse
  (< `minEvidence`, default 3 sourced events) the prep says so plainly and shows whatever
  little exists — it does not stretch thin data into a narrative.
- **Manager-gated.** Rendered only when `WP.access.canSeeSensitive(viewer, subjectId)` is
  true (subject, direct manager, director, super-admin). Never peer-visible. Never shown
  in self-mode.
- **The human decides.** Framing throughout: this is raw material for the manager's
  judgment, not the judgment itself.

## Data source
Reads via `WP.events.query(subjectId, opts, refDate)` (derived live signals ∪ appended,
de-duped, newest-first). Categories come from `WP.events.CATEGORIES`:
`workload · wellbeing · evaluation · recognition · decision`.

## Core API — `src/js/core/evalPrep.js` (`WP.evalPrep`)
Pure where possible; the async wrapper only fetches.

- `CONFIG` — `{ minEvidence: 3, categories: [...] }`.
- `summarize(events, opts)` → **pure, synchronous, deterministic.** Given an events array:
  - drops any event missing a `source` (anti-fabrication guard),
  - groups sourced events by category,
  - builds `lines` per category: `{ text, source, ts, confidence, category, growth }`,
  - computes `gaps`: every config category with zero sourced events → `{ category, reason }`,
  - `highlights`: sourced events flagged `growth === true`,
  - `enough`: `sourcedCount >= CONFIG.minEvidence`,
  - returns `{ enough, total, sourcedCount, byCategory, sections, gaps, highlights }`.
  - Never returns a score/rating field of any kind.
- `prepare(subjectId, opts, refDate)` → `Promise<summary>`: `WP.events.query(...)` then
  `summarize(...)`. Returns `{ denied: true }` shape is the UI's job — core stays data-only.

## UI integration — `src/js/ui/evaluation.js`
On the manager evaluation screen (not self-mode), inject a collapsible **"Evaluation prep
· evidence"** panel ABOVE the scoring criteria, only when `canSeeSensitive` is true:
- intro line: evidence-first framing + "you decide";
- per-category sections, each line showing its **source** chip and timestamp;
- a **Gaps** block listing categories with no evidence;
- a **"Not enough evidence yet"** state when `!enough`;
- growth **highlights** surfaced first;
- NO number, NO rating, NO suggested verdict anywhere in the panel.
Async: render a host + loading state, fill on `prepare(...)` resolve.

## i18n — `src/js/core/i18n.js`
New keys live in a **fenced group** (`Wave 3.002 Eval-Prep keys (Builder A)`) so the file
shared with Builder B rebases cleanly. Reuse existing `cat*` keys for category labels.

## Tests — `test/verify-evalprep.js`
- `summarize` drops sourceless events (no fabrication).
- every produced line carries a `source`.
- gaps are listed for empty categories (not filled).
- sparse input → `enough === false` ("not enough evidence").
- output contains **no** score/rating/verdict field.
- access: a peer cannot see another person's prep (`canSeeSensitive` false).
- `prepare` reads the store and resolves a summary.

## Acceptance (M)
EN+AR, RTL-safe, dark+light, WCAG; manager-gated; build clean; all suites green; PR opened
(don't merge) as a Wave 3 drop. Product Health Score included in the PR.
