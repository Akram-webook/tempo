/* Settings v2 → My settings → Security. Proves:
 *   1. Section renders for every signed-in user (personal tab), with change-password,
 *      last sign-in, this-device, sign-out-everywhere, and a 2FA "coming soon" note.
 *   2. Change password = emails the SECURE RESET LINK to the user's OWN verified email
 *      (never takes the old password client-side; never signInWithPassword here).
 *   3. Sign out everywhere = Supabase global sign-out + ends the local session.
 *   4. Honest fallbacks: no session → last sign-in shows "not available"; offline
 *      client → change-password reports failure (no crash).
 *   5. i18n EN+AR; renders under AR/dark.
 * jsdom; no network. */
const fs = require('fs'), path = require('path');
const { JSDOM } = require('jsdom');
const root = path.join(__dirname, '..');
const errors = [];
function assert(c, m) { if (!c) errors.push('[assert] ' + m); }

const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const srcs = [...html.matchAll(/src="([^"]+\.js)"/g)].map(m => m[1]);
const dom = new JSDOM('<!doctype html><body><div id="view"></div><div id="root"></div><div id="overlay-host"></div></body>', { url: 'https://x/tempo/', runScripts: 'outside-only' });
const { window } = dom;
window.matchMedia = () => ({ matches: false, addEventListener() {}, removeEventListener() {} });
window.setInterval = () => 0;
for (const s of srcs) { try { new window.Function(fs.readFileSync(path.join(root, s), 'utf8')).call(window); } catch (e) { errors.push('[load] ' + s + ': ' + e.message); } }
const WP = window.WP;
WP.render = function () {};
const el = window.document.getElementById('root');
const tick = () => new Promise(r => setTimeout(r, 0));
WP.state.lang = 'en';

// A mock Supabase client that records what Security asked for.
let resetEmail = null, globalScope = null;
function mockSb() {
  return { auth: {
    resetPasswordForEmail: function (e) { resetEmail = e; return Promise.resolve({}); },
    signOut: function (o) { globalScope = (o && o.scope) || 'local'; return Promise.resolve({}); },
    getSession: function () { return Promise.resolve({ data: { session: null } }); },
    onAuthStateChange: function () { return { data: { subscription: { unsubscribe() {} } } }; }
  } };
}

(async function () {
  WP.state.viewerId = 'p_akram'; WP.state.authed = true; WP._settingsTab = 'mine';
  WP._sb = mockSb();
  WP._session = { user: { email: 'akram@webook.com', last_sign_in_at: '2026-07-10T09:00:00Z' } };
  WP.ui.settings.render(el);
  let h = el.innerHTML;

  // ---- 1) section renders with all parts --------------------------------------
  assert(/id="sec-changepw"/.test(h), 'change-password control renders');
  assert(/id="sec-signout-all"/.test(h), 'sign-out-everywhere control renders');
  assert(new RegExp(WP.i18n.t('secThisDevice')).test(h), 'this-device row present');
  assert(new RegExp(WP.i18n.t('comingSoon')).test(h), '2FA coming-soon note present (honest, not fake)');
  // last sign-in date shown (formatted)
  assert(/2026|10\/07|Jul/.test(h), 'last sign-in date is shown');

  // ---- 2) change password emails the reset link to the user's OWN email -------
  el.querySelector('#sec-changepw').click(); await tick(); await tick();
  assert(resetEmail === 'akram@webook.com', 'change password emails the reset link to the signed-in user’s own email');
  // it must NOT attempt a client-side password set / signInWithPassword
  assert(!/signInWithPassword|updateUser/.test(WP.auth.requestPasswordChange.toString()), 'change-password never handles the old password / updateUser client-side');

  // ---- 3) sign out everywhere = global scope + local session ends -------------
  // spy on logEvent (the local activityLog is intentionally reset on sign-out, so
  // assert the event was EMITTED at the moment it fired, not that it survives).
  let loggedTypes = [];
  const realLog = WP.logEvent;
  WP.logEvent = function (e) { loggedTypes.push(e && e.type); return realLog.apply(WP, arguments); };
  WP.ui.settings.render(el);
  el.querySelector('#sec-signout-all').click(); await tick();
  const ok = window.document.querySelector('#dlg-ok');
  assert(ok, 'sign-out-everywhere asks for confirmation');
  ok.click(); await tick(); await tick();
  WP.logEvent = realLog;
  assert(globalScope === 'global', 'sign-out-everywhere uses Supabase GLOBAL scope');
  assert(WP.state.authed === false, 'sign-out-everywhere also ends the local session');
  assert(loggedTypes.indexOf('sign-out-all') > -1, 'sign-out-all is logged (emitted for provenance)');

  // ---- 4) honest fallbacks ----------------------------------------------------
  WP.state.authed = true; WP._settingsTab = 'mine';
  WP._session = null;                         // no session → last sign-in unknown
  WP.ui.settings.render(el);
  assert(new RegExp(WP.i18n.t('secLastLoginUnknown')).test(el.innerHTML), 'no session → last sign-in shows "not available" (honest)');
  WP._sb = null;                              // offline client → change pw fails gracefully
  const res = await WP.auth.requestPasswordChange();
  assert(res && res.ok === false, 'offline client → change-password returns ok:false (no crash)');

  // ---- 5) i18n EN+AR + AR/dark ------------------------------------------------
  const keys = ['secTitle','secSub','secPassword','secPasswordNote','secChangePw','secPwSent','secPwError',
    'secLastLogin','secSessions','secSessionsNote','secThisDevice','secSignOutAll',
    'secSignOutAllConfirmTitle','sec2fa','comingSoon'];
  keys.forEach(function (k) {
    WP.state.lang = 'en'; const en = WP.i18n.t(k);
    WP.state.lang = 'ar'; const ar = WP.i18n.t(k);
    assert(en && en !== k, 'i18n EN present: ' + k);
    assert(ar && ar !== k, 'i18n AR present: ' + k);
  });
  WP.state.lang = 'ar'; WP.state.theme = 'dark'; WP._settingsTab = 'mine'; WP.state.authed = true; WP._sb = mockSb();
  try { WP.ui.settings.render(el); assert(/id="sec-changepw"/.test(el.innerHTML), 'Security renders under AR/dark'); }
  catch (e) { errors.push('[assert] AR/dark render threw: ' + e.message); }
  WP.state.lang = 'en'; WP.state.theme = 'light';

  if (errors.length) { console.log('FAIL\n' + errors.join('\n')); process.exit(1); }
  console.log('PASS — security: change-password emails a secure reset link to the user’s own email (never client-side); sign-out-everywhere uses global scope + ends local session + logs; honest last-sign-in + offline fallbacks; 2FA marked coming-soon; EN+AR both themes.');
  process.exit(0);
})();
