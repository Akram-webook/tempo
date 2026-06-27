# 11 — Standards (index)
- Code: vanilla JS on `window.WP`; small modules; no build-time deps beyond the bundler.
- Naming: clear, intention-revealing; ids keep existing scheme (e.g. `p_*`).
- i18n: every string `{en, ar}` via `WP.i18n.t`; RTL-safe.
- Icons: inline SVG only. Theming: tokens in `src/css/tokens.css` (brand #ff2c79).
- Tests: `test/verify-*.js` jsdom suites. Docs: update the relevant `docs/` + this OS.
