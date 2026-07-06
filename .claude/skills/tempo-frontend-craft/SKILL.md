---
name: tempo-frontend-craft
description: >-
  Premium frontend craft for Tempo — apply when building or polishing ANY UI in
  src/js/ui/**, src/js/app.js, or src/css/**. Codifies WBK V3 tokens, responsive
  breakpoints, card/typography/spacing scale, a11y (WCAG 2.2), motion, RTL + both
  themes, and anti-slop rules. Use before writing a view, and as a pre-PR checklist.
---

# Tempo Frontend Craft (B1)

World-class UI/UX for Tempo, packaged as rules + checklists + skeletons. Compose with
`design-taste-frontend` for taste-level polish. Ground every choice in the sources at the
bottom — **not opinion**.

**Tempo is vanilla JS.** No framework. Views read `WP.state`, render a string into their
host, and mutate only via `WP.setState(patch)` (persists + re-renders). Layers load
`data → core → ui → app`. Icons are inline SVG. Strings live in `core/i18n.js` (`WP.i18n.t`).

---

## 1. Tokens only — never hardcode (WBK V3)

Read from `src/css/tokens.css`. If a value isn't a token, it's a bug.

| Concern | Token(s) | Value |
|---|---|---|
| Brand | `--brand` / `--brand-contrast` | `#FF2C79` / `#F9F9F9` |
| Danger | (V3) | `#F8285A` (active `#D81A48`, bg `#FFEEF3`) |
| Radius | `--radius-sm/md/(default)/lg/xl` | `4 / 6 / 8 / 12 / 16` |
| Spacing | `--sp-1..7` | `2 / 4 / 8 / 12 / 16 / 20 / 24` |
| Type | `--fs-label-*`, `--fs-body-*`, `--fs-h1..5` | Gellix scale (see tokens.css) |
| Font | `--font-sans` / `--font-ar` / `--font-display` | Gellix → Figtree → IBM Plex Arabic |
| Shadow | `--shadow` | theme-aware (light `.07`, dark `.5`) |

**Do:** `padding: var(--sp-3) var(--sp-5)`, `border-radius: var(--radius)`, `color: var(--brand)`.
**Don't:** `padding: 8px 16px`, `border-radius: 8px`, `#ff2c79`, `18px` (no 18px step in V3 — `--fs-l` is deprecated).

---

## 2. Responsive (breakpoints ≤820 / ≤560)

The app shell is **isolated**: top bar is `position: fixed`, only content scrolls. Never let a
view break that — no `body`-level scroll traps, no full-page reflow on route change.

- **≥1181px** — default readable cap `main { max-width: 1180px; margin: 0 auto }`. Full-bleed is
  **opt-in per view** (`main.full-bleed { max-width: none }`) — only map/workload/canvas views that
  earn the width. Text-heavy pages (dashboard, tables, forms) stay capped for readability (NN/g:
  ~50–75ch line length).
- **≤820px** — collapse multi-column → 1–2 col; controlbars wrap; sidebars become top strips.
- **≤560px** — single column; tap targets ≥44×44px (WCAG 2.5.5); no horizontal scroll (test
  `document.body.scrollWidth === viewport`); KPI grids drop to 2-col, never a fixed `minmax` that
  overflows (gate wide-only grid rules behind `@media (min-width: 1181px)`).

**Trap I hit:** a `grid-template-columns: repeat(4, minmax(180px,300px))` applied at all widths →
720px min → horizontal overflow at 375px (blank in RTL). Always gate KPI/wide grids `≥1181px`.

---

## 3. Cards & tables — uniformity + truncation

- One card height per row; align by content box, not by copy length.
- Truncate overflowing text with ellipsis **+ a title/tooltip** so nothing is lost:
  ```css
  .cell-name { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  ```
  ```css
  /* multi-line clamp */
  .card-desc { display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; }
  ```
- Every list has 4 states: **empty / loading / error / success**. Empty state is honest text
  (`i18n`), never a blank box. (NN/g: empty states guide, don't dead-end.)
- Numbers right-aligned + tabular (`font-variant-numeric: tabular-nums`).

## 4. Loading = WBK logo

Loading indicator is the **Webook logo** (SVG, `prefers-reduced-motion`-aware pulse), never a
generic spinner and never an emoji. Skeletons use `--sp-*` blocks at token radii.

```css
@media (prefers-reduced-motion: reduce) { .wbk-loader, .fade-in { animation: none; transition: none; } }
```

---

## 5. Accessibility checklist (WCAG 2.2 — run every PR)

- [ ] **Keyboard:** every interactive element is a real `<button>`/`<a>` or has `tabindex="0"` +
      `keydown` (Enter/Space) + `role`. No click-only handlers.
- [ ] **Focus visible** (2.4.7): never `outline: none` without a token replacement (`:focus-visible`).
- [ ] **Focus order** (2.4.3) follows DOM; drawers/modals trap focus and restore it on close.
- [ ] **Names** (4.1.2): icon-only buttons have `aria-label`; state via `aria-expanded`/`aria-pressed`.
- [ ] **Contrast** (1.4.3): text ≥4.5:1, large/UI ≥3:1 — verify in BOTH themes.
- [ ] **Target size** (2.5.5): ≥24×24 min, ≥44×44 for primary touch targets.
- [ ] **Live regions:** async updates (toasts, load results) in `aria-live="polite"`.
- [ ] **Motion** (2.3.3): honor `prefers-reduced-motion`.

---

## 6. RTL + both themes (dark is default)

- Use logical properties: `margin-inline-start`, `padding-inline`, `inset-inline-start` — not
  `left`/`right`. Mirror directional SVGs (chevrons) with `[dir="rtl"] .icon { transform: scaleX(-1) }`.
- `.tree-scroll` uses `justify-content: safe center` so wide content centers but never clips the
  start edge when it overflows.
- Test EVERY change in the 4-way matrix: **{dark, light} × {en, ar}**. AR uses `--font-ar`.
- Never bake color into JS; theme swaps via token re-map on `:root[data-theme]`.

---

## 7. Anti-slop (taste — compose with design-taste-frontend)

**Don't:** emoji as icons; gradient text; drop-shadow stacks; three accent colors on one screen;
center-aligned long paragraphs; `px` where a token exists; decorative motion without purpose;
placeholder lorem shipped; a "dashboard" that's just cards of numbers with no decision attached.

**Do:** one accent (brand) per view, earn every element, whitespace as structure (Refactoring UI),
consistent optical alignment, SVG icons from the shared set, motion that clarifies (enter/exit,
route transition ≤200ms), copy that's specific and de-surveilled.

**Ethics (Tempo Constitution):** workload color is a **work signal**, never a per-person rank or
score. No surveillance affordances (no "who's slow" leaderboards, no last-seen). Logs/UI show
counts and IDs, never PII or message bodies.

---

## 8. Pre-PR gate (B1 flow)

```bash
git fetch origin && git rebase origin/main   # serialize dist with other builders
node build.js                                # NEVER hand-edit dist — regenerate
npm test                                      # jsdom suites green, zero console errors
git diff --stat origin/main..HEAD             # scope-scan: only your files, no node_modules/.env/.agents
```

- Added/changed behavior → add or extend a `test/verify-*.js` suite.
- New user-facing string → add `en` **and** `ar` in `core/i18n.js`.
- Screenshots for visual changes: ~1920 wide + ~375 mobile, {dark,light} × {en,ar}, before/after.
- Ponytail: the least code that fully works. One PR per task. Hold for the orchestrator's gate.

---

## Sources (ground truth, not opinion)

- **WCAG 2.2** — W3C: 1.4.3 contrast, 2.1.1 keyboard, 2.4.3/2.4.7 focus, 2.5.5/2.5.8 target size,
  2.3.3 animation from interactions, 4.1.2 name/role/value.
- **NN/g (Nielsen Norman Group)** — empty states, line-length legibility, error-message guidelines,
  form design, response-time limits (0.1s / 1s / 10s).
- **Refactoring UI** (Wathan & Schoger) — spacing scale, hierarchy via weight/color not size alone,
  "start with too much white space", limit your palette.
- **WBK Design System V3** — `src/css/tokens.css` (brand, radius, spacing, Gellix type scale).
- **Tempo System Design Standard** + `ai-os/CONSTITUTION.md` — Human-First / no-surveillance,
  Simplicity, Evidence, isolated-app-shell architecture.
