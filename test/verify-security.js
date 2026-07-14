/* Settings v2 → My settings → Security (trimmed). Proves:
 *   1. The Security section renders for every signed-in user with EXACTLY one
 *      useful action — "Change my password" — and none of the removed noise
 *      (no last-sign-in, no device row, no sign-out-everywhere, no 2FA note).
 *   2. Change password = emails the SECURE RESET LINK to the user's OWN verified
 *      email (never the old password client-side; never signInWithPassword).
 *   3. Offline client → change-password fails gracefully (no crash).
 *   4. i18n EN+AR; renders under AR/dark.
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

let resetEmail = null;
function mockSb() {
  return { auth: {
    resetPasswordForEmail: function (e) { resetEmail = e; return Promise.resolve({}); },
    signOut: function () { return Promise.resolve({}); },
    getSession: function () { return Promise.resolve({ data: { session: null } }); },
    onAuthStateChange: function () { return { data: { subscription: { unsubscribe() {} } } }; }
  } };
}

(async function () {
  WP.state.viewerId = 'p_akram'; WP.state.authed = true; WP._settingsTab = 'mine';
  WP._sb = mockSb();
  WP._session = { user: { email: 'akram@webook.com' } };
  WP.ui.settings.render(el);
  let h = el.innerHTML;

  // ---- 1) exactly the one useful action, none of the removed noise ----------
  assert(/id="sec-changepw"/.test(h), 'change-password control renders');
  assert(!/id="sec-signout-all"/.test(h), 'sign-out-everywhere is REMOVED');
  assert(!new RegExp(WP.i18n.t('secThisDevice')).test(h), 'this-device row is REMOVED');
  assert(!/sec-device/.test(h), 'no device markup remains');
  assert(!new RegExp(WP.i18n.t('secLastLogin')).test(h), 'last sign-in is REMOVED');
  assert(!new RegExp(WP.i18n.t('sec2fa')).test(h), '2FA placeholder is REMOVED');

  // ---- 2) change password emails the reset link to the user's OWN email -----
  el.querySelector('#sec-changepw').click(); await tick(); await tick();
  assert(resetEmail === 'akram@webook.com', 'change password emails the reset link to the signed-in user’s own email');
  assert(!/signInWithPassword|updateUser/.test(WP.auth.requestPasswordChange.toString()), 'never handles the old password / updateUser client-side');

  // ---- 3) offline client → graceful failure ---------------------------------
  WP._sb = null;
  const res = await WP.auth.requestPasswordChange();
  assert(res && res.ok === false, 'offline client → change-password returns ok:false (no crash)');

  // ---- 4) i18n EN+AR + AR/dark ----------------------------------------------
  ['secTitle', 'secPassword', 'secPasswordNote', 'secChangePw', 'secPwSent', 'secPwError'].forEach(function (k) {
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
  console.log('PASS — security (trimmed): only "change my password" remains (emails a secure reset link to the user’s own email, never client-side); last-sign-in / device / sign-out-everywhere / 2FA removed; offline fails gracefully; EN+AR both themes.');
  process.exit(0);
})();
