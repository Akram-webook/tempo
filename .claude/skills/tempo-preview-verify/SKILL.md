---
name: tempo-preview-verify
description: >
  The gotcha-aware loop for verifying a Tempo change in the IN-APP preview browser
  + local dev server (the pre-merge pixel/behaviour check, before the deployed
  Playwright pass). Covers the traps that repeatedly cost cycles: the dev server
  dying between turns and port collisions across chats; geometry reads returning 0
  when the Browser pane is backgrounded; forced re-renders detaching the app root
  and faking "bugs"; and the exact recipes to catch overflow / NaN / dead-space /
  cascade-order defects. USE WHEN iterating on any src/js/ui/**, app.js, or CSS
  change with preview_start + the Browser pane. Pairs with tempo-bulletproof-5step
  (the rigor loop) and tempo-live-verify (the DEPLOYED-site Playwright check).
---

# Tempo — Verify in the Preview Browser (without wasting cycles)

Distilled from ESCAPE-LEARNING: the following each cost real turns during a multi-feature session.
None are theoretical — they *will* recur. jsdom (`test/verify-*.js`) proves logic and renders no
pixels; this skill is the pixel/interaction loop against the local server. For the DEPLOYED site use
`tempo-live-verify`; for the discipline around a change use `tempo-bulletproof-5step`.

## The loop (in order)
1. **Edit source** (never `dist/` by hand).
2. **`node build.js`** — dist is inlined from src; the server serves `dist/`, so an un-built edit is
   invisible. Confirm "Un-inlined left: js=0 css=0".
3. **Serve + open** — `preview_start({url})`; drive with `navigate` / `computer` / `javascript_tool`.
4. **Verify** with the recipes below; fix; **re-`build.js`**; repeat.
5. Finish on the real gate (`tempo-finish-gate`): full `npm test`, then EN + AR + mobile.

## Dev-server lifecycle — the #1 time-sink
- The server runs **inside the session** and **stops between turns / on sleep**. "This site can't be
  reached / ERR_CONNECTION_REFUSED" almost always means *the process died*, not a code bug.
- **Port collisions across chats.** Another session may already hold `:4000` and your Browser pane
  can't reach it (`navOk:false`). Don't fight it — **start your own on a free port** and verify there:
  `node tools/local-server.js --port 4100 --no-build &` then
  `curl -s -o /dev/null -w "%{http_code}" http://localhost:4100/` must print **200** before you open it.
- Restart the user's usual port too (`:4000`) so their bookmark keeps working; the server reads
  `dist/` fresh, so all ports serve the latest build once you've re-run `build.js`.
- Offer the always-on alternative (GitHub Pages) when the user is tired of restarts — see the
  deploy path in `tempo-live-verify`.

## Browser-pane measurement gotchas
- **Geometry reads are only valid when the pane is visible.** When it's backgrounded,
  `window.innerWidth` is `0` and `getBoundingClientRect()` collapses (flex wraps to one column, so a
  bar "looks" 216px tall when it isn't). **Take a `computer{screenshot}` first to force layout**,
  THEN read geometry — or just trust the screenshot for layout questions.
- `[data-go]` / hidden elements: `querySelectorAll` finds elements even inside a `display:none`
  collapsed section — good for asserting presence, useless for asserting *visibility*. For visibility
  check `getComputedStyle(el).display` or a screenshot.

## Clean-state discipline (don't fake your own bug)
- **Don't monkey-patch engines or bounce routes in the live page to "test".** Forcing
  `WP.ui.x.render(detachedNode)` or `setState({route:'dashboard'})` in a hand-driven context detached
  the app root and threw `Cannot set properties of null (setting 'innerHTML')` — which reads exactly
  like a product crash but is contamination. **Reload the page (`navigate`) for a clean boot**, then
  seat state once (`WP.state.authed=true; WP.state.viewerId=…; WP.setState({route})`).
- Restore anything you stub (`WP.sales.totals`, `WP.viewer`) in the same snippet, or reload.

## Defect-detection recipes (paste-ready)
- **Text clipping / overflow past a card** — an oversized value overflows and the neighbour's *opaque*
  background paints over it (looks "cut off"). Detect: compare each value's `getBoundingClientRect().right`
  to its card's right edge; fix by sizing to fit + letting adjacent chips wrap, not by shrinking blindly.
- **No horizontal body scroll** (mobile): assert `document.documentElement.scrollWidth <= innerWidth + 1`.
  Wide content (tables, charts) must scroll inside its own `overflow:auto` box, never the body.
- **NaN / empty-state** — grep the rendered HTML: `/NaN|Infinity|undefined/.test(view.innerHTML)`.
  A filter combo that matches nothing must show a real empty state, not zeros / a blank chart.
- **Dead space / orphan cards** — an odd card count orphans on wrap (5 KPIs → 4+1). Prefer even grids
  that step N→2→1; for a tiny dataset in a `100vh` canvas, size the canvas to content instead.

## Shared-code + CSS discipline (what saved the nav refactor)
- **Read the TESTS before editing shared code.** The nav change was safe only because the suites
  key off stable hooks: `verify-mvp-flag` reads `[data-go]` buttons; `verify-readiness-ui` asserts
  `id: 'org'` within 700 chars of `if (canManage)` in `app.js` source. Preserve those hooks (keep
  items in the DOM even when a section is collapsed; keep the source push order) and grouping/wrapping
  is free.
- **Before adding a CSS rule, grep for an existing one** (`grep -n '\.the-class' src/css/app.css`).
  Adding a second `.sales-insights` rule *above* the original let the later rule silently win (equal
  specificity → source order decides). Edit the original, or use a higher-specificity selector
  (`.a.a--mod`) to beat a global cap like `main .metrics`.
- **Extend the seam, don't fork it.** New windows went through the capacity engine's `windowBounds`;
  new ranges through the sales `months` array. One branch, guarded, tested — not a parallel path.

## Do / Don't
- **Do** screenshot before measuring layout; **do** `curl` a 200 before opening a port.
- **Do** guard belt-and-braces (normalize in the UI *and* fall back in the engine) so one layer
  failing can't produce a broken state.
- **Don't** diagnose "refused to connect" as a code bug — restart the server first.
- **Don't** trust geometry from a backgrounded pane; **don't** hand-edit `dist/`; **don't** ship a
  layout "fix" proven only in jsdom — it renders no pixels.
