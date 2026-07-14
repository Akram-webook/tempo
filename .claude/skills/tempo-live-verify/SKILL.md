---
name: tempo-live-verify
description: >
  How to verify a Tempo change on the REAL deployed GitHub Pages site with a
  headless browser (Playwright) — the pixel/behaviour check jsdom cannot do.
  Covers the password-auth bypass, seating a specific role (director/member),
  killing the daily check-in overlay, forcing theme + language, and capturing
  screenshots + console/network. USE WHEN a change is merged and deployed and
  you need to prove it renders/behaves correctly live (a new view, a role gate,
  colours/layout/RTL, an external call), or the user asks to "check it live",
  "see it", or wants screenshots from the deployed site. For pre-merge jsdom
  suites use tempo-test-playbook; for the merge gate use tempo-finish-gate.
---

# Tempo — Live-Verify on the Deployed Site

jsdom (`test/verify-*.js`) proves logic; it renders **no pixels** and hits **no network**. When you
need to prove a change actually looks and behaves right on the live product —
`https://akram-webook.github.io/tempo/` — drive a real headless browser. This skill is the exact,
gotcha-aware recipe, distilled from verifying the Executive Status view, its reorder, org-tree
moves, chip sizing, and the auth stopgap.

**Verify live AFTER the change is merged + the Pages deploy is green**, not before — you are
checking the real bundle the user sees. Confirm deploy first:
`gh run list --branch main --limit 1` → the "Build & deploy to Pages" run is `completed/success`,
then `curl -s "https://akram-webook.github.io/tempo/?cb=$(date +%s)" | grep -o "<a marker from your change>"`.

## Why a browser at all (say this honestly)
- jsdom can't show clipping, contrast, RTL mirroring, alignment, or dark-mode parity.
- jsdom can't make the real JSONP / external call. A live browser proves CORS/redirect/console are clean.
- The screenshots ARE the evidence — the user asked to *see* it. Attach them; don't just assert.

## Setup — Playwright lives in the SCRATCHPAD, never the repo
`playwright` is NOT a repo dependency and must not be added to `package.json` (it would bloat the
bundle-free vanilla project and the finish-gate). Install it in the session scratchpad and run from
there:

```bash
SP=<scratchpad>/pw            # your session scratchpad dir + /pw
mkdir -p $SP && cd $SP
npm init -y >/dev/null 2>&1
npm i playwright@1.61.1 >/dev/null 2>&1
npx playwright install chromium   # once per machine; binary is cached
```
Scripts `require('playwright')` — so they must run from `$SP` (where node_modules is). Trim
`$SP/pw/node_modules` when done to keep the scratchpad light; keep the spec + screenshots.

## The auth bypass (the key move)
The live site is `authMode:'password'` (or `'directory'`), gated on `WP.state.authed`. You cannot
drive a real Supabase login headlessly. Bypass ONLY the gate in-page — this still exercises the
**real deployed bundle** (real ui/**, real network, real CSS); it only skips the login wall:

```js
await page.evaluate((id) => {
  window.WP.state.authed = true;      // <-- the gate WP.render() checks
  window.WP.state.viewerId = id;      // WHO you are (drives role)
  window.WP.state.theme = 'light';    // or 'dark' (default is 'dark')
  window.WP.state.lang  = 'en';       // or 'ar' for RTL
  window.WP.render();
}, viewerId);
```
Role identities (from `src/js/data/mock-data.js` — verify they still exist):
- **Super Admin / director:** `p_ahmed` (akram@webook.com, `superAdmin`) or `p_ahmed` (director).
- **Member / spec (for hidden-state checks):** `p_shahad`.
Navigate with `WP.setState({route:'exec'})` etc. — never fake the DOM; let the real router paint.

## Gotcha: the daily check-in overlay eats clicks & pollutes shots
On render, `app.js` fires a once-per-day check-in modal into `#overlay-host` via a `setTimeout`. It
intercepts `.nav-item`/`.exec-card` clicks ("subtree intercepts pointer events") and covers your
screenshot. Kill it two ways (belt + suspenders):
1. Pre-seed the prompt key so it thinks it already showed today:
   `localStorage.setItem('tempo_checkin_prompt', new Date().toISOString().slice(0,10))`
   (single key — NOT per-user).
2. Clear the host right before every click/screenshot, after a short settle for the setTimeout:
   `await page.waitForTimeout(600); await page.evaluate(()=>{const o=document.getElementById('overlay-host'); if(o)o.innerHTML='';});`

## Theme + language: set state, don't poke the DOM
Theme/dir are applied by `WP.applyDocAttrs()` inside `WP.render()` from `WP.state.theme`/`.lang`.
Set the STATE and re-render — do NOT call `WP.setTheme` (no such fn) or hand-set `data-theme`/`dir`
(they get overwritten on the next render). Default theme is **dark**, so force `'light'` explicitly
when you want the light shot.

## Capturing the proof
- `page.on('console', ...)` + `page.on('pageerror', ...)` → assert **zero** real errors (filter
  benign favicon/font noise).
- `page.on('requestfinished'/'requestfailed', ...)` for an external host (e.g.
  `script.google.com/macros`) → confirm the call fired; a `302` there is normal for Apps Script
  JSONP (the loader follows it).
- `page.screenshot({ path, fullPage:true })` for each state you claim: director light, director
  dark, Arabic/RTL, and the hidden state as a member.
- To prove **alignment/sizing** objectively, measure with `getBoundingClientRect()` in
  `page.evaluate` (e.g. all chips same width, right-edges equal) — numbers beat "looks right".
- **Read the screenshots back** (they are the deliverable) and describe what you see. If a modal or
  wrong theme leaked in, fix the harness and re-shoot — don't ship a polluted image as proof.

## Report shape
State: merged SHA + deploy green + live URL · per-state screenshots · console/network clean ·
objective measurements where relevant · GO (live-confirmed) or NO-GO with exactly what broke.
Then the SHIP line(s) per `how-akram-works` / the reporting cadence.

## Hard limits (do not paper over)
- If the feature does NOT render live (blank, error state, sign-in wall, blocked call), capture the
  console + network and REPORT it — never fake a pass. The point is it must work for the real user.
- Bypassing `WP.state.authed` is a VERIFICATION harness only. Never add an auth bypass to `src/**`.
- Never add playwright to the repo; never commit scratchpad specs into `src/**` or `test/**`.
