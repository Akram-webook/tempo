/* Headless dist smoke test (System-Design principle #9 — the seed of e2e).
 *
 * Loads the SHIPPED bundle (dist/index.html) in jsdom, exactly as verify-dist does, and asserts
 * the three things a real user hits on first load:
 *   1. the app BOOTS with zero (non-benign) console errors,
 *   2. the LOGIN GATE renders (unauthenticated → email gate is shown), and
 *   3. the router LANDS ON A VALID ROUTE (the default route is a known screen).
 *
 * Scope note: this is the boot/routing smoke seed — NOT full RLS/e2e. True live-RLS behaviour
 * (who can read whom, sensitive-field gating) needs a live backend and the 2-account manual check
 * at real-data go-live; it cannot be unit-tested here. See docs/adr/0001-rls-access-model.md.
 */
const fs = require('fs'), path = require('path');
const { JSDOM } = require('jsdom');
const html = fs.readFileSync(path.join(__dirname, '..', 'dist', 'index.html'), 'utf8');

const errors = [];
const benign = /font|stylesheet|localStorage|Security|scrollIntoView|Not implemented|opaque|insertRule|cssRules|gsi|accounts\.google|matchMedia/i;
const dom = new JSDOM(html, { url: 'https://localhost/', runScripts: 'dangerously', resources: 'usable', pretendToBeVisual: true });
const { window } = dom;
window.HTMLElement.prototype.scrollIntoView = function () {};
['error', 'warn'].forEach(k => { const o = window.console[k].bind(window.console); window.console[k] = (...a) => { const s = a.join(' '); if (!benign.test(s)) errors.push('[' + k + '] ' + s); }; });
window.addEventListener('error', e => { if (!benign.test(String(e.message))) errors.push('[onerror] ' + e.message); });

// The set of routes the shell knows how to render — the router must land inside this set.
const VALID_ROUTES = ['dashboard', 'map', 'me', 'evaluations', 'evaluation', 'upward', 'daily', 'library', 'permissions', 'settings', 'fairness', 'profile'];

setTimeout(() => {
  try {
    const WP = window.WP;
    if (!WP) { errors.push('WP namespace missing — the bundle did not boot'); }
    else {
      // 2. login gate renders when unauthenticated
      const view = window.document.getElementById('view');
      WP.state.authed = false;
      WP.ui.login.render(view);
      if (!view.querySelector('#login-email')) errors.push('login gate did not render for an unauthenticated user');

      // 3. router lands on a valid route
      if (VALID_ROUTES.indexOf(WP.state.route) === -1) errors.push('router landed on unknown route "' + WP.state.route + '"');
    }
  } catch (e) { errors.push('[run] ' + e.message); }

  if (errors.length) { console.log('FAIL\n' + errors.join('\n')); process.exit(1); }
  console.log('PASS — dist boots clean, the login gate renders, and the router lands on a valid route (' + window.WP.state.route + ').');
  process.exit(0);
}, 1500);
