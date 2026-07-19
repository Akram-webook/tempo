# Reusable prompt — "Smart triage controls" signature

Copy the block below and send it to another agent working on a different page/app.
It describes the exact pattern we built on Tempo's Project-delivery view so they can
reproduce it on their own list/feedback surface. It is framework-agnostic in intent
(our reference implementation is vanilla JS on `window.WP`).

---

## PROMPT TO SEND

> **Build "smart triage controls" on each row of my `<LIST/FEEDBACK NAME>` view.**
> A reviewer must be able to set an item's lifecycle **Status** and, when accepted,
> the **Wave/bucket** it goes into - and the panel must SUGGEST the answer so they
> mostly just confirm. Match this signature exactly:
>
> **1. Data shape (per item).** Each item carries: `id`, a `note`/title, a
> classification `klass` (e.g. Bug | Backend | Frontend | Feature | Enhancement),
> an `area` (the surface it's about), a `priority` (Low|Medium|High|Critical),
> a lifecycle `status` (New | Testing | Review | Assigned | Discarded), and a
> `wave` (integer index of the delivery bucket, or null). `wave` is REQUIRED for
> `Assigned` and null for every other status.
>
> **2. Suggestion engine** `suggest(item, waveCount) -> { status, wave, reasonKey }`,
> rules ordered + honest:
>  - a **Bug** -> `Assigned` to the wave that owns its surface (fallback: wave 1);
>  - a **feature/idea that matches a wave** and isn't low priority -> `Assigned` to that wave;
>  - **High/Critical** priority with no clear wave -> `Review` (look at it soon);
>  - anything else (valid but low-value, no fitting wave) -> `Review` (parked, NOT
>    inflated into a wave, NOT silently discarded).
>  Map each surface to its owning wave with an ordered regex table matched on
>  `area + note`. `reasonKey` returns a plain-words WHY string (bilingual).
>
> **3. The panel (per row, revealed by a gear/▸ toggle):**
>  - a **recommendation banner** at the top: `Suggested: <status · wave> — <why>`,
>    with the recommended `<option>` marked (e.g. a ★);
>  - a **Status** `<select>`, pre-selected to the SUGGESTION when the item is still
>    untriaged (`status === 'New'`), otherwise to the item's real current status;
>  - a **Wave** `<select>`, shown ONLY when status = Assigned; when the reviewer
>    switches to Assigned it auto-prefills the suggested wave;
>  - **Save** (primary) + **Cancel**; Save refuses (nudge, no write) if Assigned has no wave;
>  - an inline **"Saved" confirmation** (tick, `role="status" aria-live="polite"`) that
>    appears on Save and survives the repaint, so Save NEVER feels like a no-op;
>  - a one-line **honesty note** stating where it saved (e.g. "Saved on this device
>    for now" if local-only), so the reviewer isn't misled about scope.
>
> **4. Save behavior.** Save writes the decision, then re-derives the row from the
> source data + overlay so its chip/tags update immediately. Remember which panel
> was mid-save and RE-OPEN it after the repaint (repaint collapses panels) so the
> tick is visible. Persist to a local overlay first if there's no shared write path
> yet; keep the write behind ONE function so flipping to a shared/server write later
> is a single swap.
>
> **5. Non-negotiables.** Bilingual (EN + AR/RTL) - every string in the i18n table.
> Colours from design tokens, never raw hex. Icons are inline SVG, never emoji.
> Gate the controls to the same role that owns the view (defence-in-depth: re-check
> the permission inside the Save handler, not just at render). Cover every state:
> untriaged, already-decided, Assigned-without-wave (refused), Discarded (row reads
> dimmed/struck). Add/extend a test that asserts: suggestion values, pre-select,
> Assigned-without-wave refuses, decision persists + survives re-render, discard
> clears the wave, and the "Saved" tick shows.
>
> **6. Definition of done.** Build clean, tests green, a real render pass in
> light + dark + AR showing the banner, the pre-selected suggestion, Save→tick,
> and Cancel. Ship data-only triage decisions through the warehouse, not the
> per-browser overlay.

---

## Where the Tempo reference implementation lives
- Engine + panel + wiring: `src/js/ui/exec.js` — `triageSuggest`, `WAVE_OWNERS`,
  `triageControlsHTML`, `wireTriage`, `rememberOpenTriage`/`restoreOpenTriage`.
- Styles: `src/css/app.css` — `.ex-triage*` (tokens only).
- Strings: `src/js/core/i18n.js` — `execSug*`, `execTriage*` (EN + AR).
- Tests: `test/verify-exec.js` (triage block).
- Operator playbook (doing the real decisions on the warehouse): the
  `tempo-feedback-triage` skill + `data/feedback.json`.
