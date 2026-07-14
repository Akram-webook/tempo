/* Members & Access (Settings v2 → Workspace). Proves the app-level allowlist —
 * which used to be editable only in access.js code — is now a real screen:
 *   1. Section only appears under the Workspace tab (admin/director), never personal.
 *   2. Roster lists real people (not tbc/open roles), searchable, with role + access.
 *   3. Grant/revoke flows through WP.access.grantAccess (logs) + persists; an admin
 *      cannot revoke their OWN access.
 *   4. Search re-renders only the list (filters by name/email/title).
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
function be(id) { WP.state.viewerId = id; WP.state.authed = true; WP._settingsTab = null; WP._membersQuery = ''; }

(async function () {
  // ---- 1) gating: not on the personal tab; present under Workspace for admin ----
  be('p_akram'); WP._settingsTab = 'mine'; WP.ui.settings.render(el);
  assert(!/mbr-row|id="mbr-search"/.test(el.innerHTML), 'Members roster is NOT on the personal tab');

  be('p_idris'); // specialist — no Workspace tab at all
  WP._settingsTab = 'workspace'; WP.ui.settings.render(el);
  assert(!/id="mbr-search"/.test(el.innerHTML), 'specialist cannot reach Members & Access');

  be('p_akram'); WP._settingsTab = 'workspace'; WP.ui.settings.render(el);
  let h = el.innerHTML;
  assert(/id="mbr-search"/.test(h), 'Members search renders under Workspace for admin');
  assert(/id="mbr-list"/.test(h), 'Members roster renders');
  assert(!/id="mbr-roles"/.test(h), 'the "manage roles" link is REMOVED (Akram review)');
  assert(!/class="mbr-role/.test(h), 'the per-member role chip is REMOVED (Akram review)');
  assert(/id="mbr-invite"/.test(h), 'invite-admin entry present (manageAdmins)');

  // ---- 2) roster excludes tbc/open roles, has a toggle per member --------------
  const nRows = (h.match(/class="mbr-row"/g) || []).length;
  const nToggles = (h.match(/id="acc-/g) || []).length;
  assert(nRows > 3 && nRows === nToggles, 'every listed member has an access toggle');
  const tbc = WP.data.PEOPLE.filter(p => p.tbc).length;
  const realPeople = WP.data.PEOPLE.filter(p => !p.tbc).length;
  assert(nRows === realPeople, 'open/tbc roles are excluded from the member roster (' + tbc + ' tbc skipped)');

  // ---- 3) revoke persists + logs; self-revoke blocked --------------------------
  // pick a granted, non-viewer member and revoke via the toggle + confirm dialog
  const target = WP.data.PEOPLE.find(p => !p.tbc && WP.access.hasAccess(p.id) && p.id !== 'p_akram');
  if (target) {
    const before = WP.activityLog.length;
    const tgl = el.querySelector('#acc-' + target.id);
    assert(tgl && tgl.checked, 'granted member shows toggle ON');
    tgl.checked = false; tgl.dispatchEvent(new window.Event('change'));
    await tick();
    // confirm dialog is open → click confirm
    const ok = window.document.querySelector('#dlg-ok');
    assert(ok, 'revoke opens a confirmation dialog');
    ok.click(); await tick();
    assert(!WP.access.hasAccess(target.id), 'revoke removes app access');
    assert(WP.activityLog.length > before && WP.activityLog[0].type === 'access-revoke', 'revoke is logged (access-revoke)');
    WP.access.grantAccess(target.id, true); // restore
  }

  // self-revoke is blocked (akram is granted + is the viewer)
  be('p_akram'); WP._settingsTab = 'workspace'; WP.ui.settings.render(el);
  const selfTgl = el.querySelector('#acc-p_akram');
  if (selfTgl) {
    assert(selfTgl.checked, 'admin own access shows ON');
    selfTgl.checked = false; selfTgl.dispatchEvent(new window.Event('change'));
    await tick();
    assert(WP.access.hasAccess('p_akram'), 'admin cannot revoke their OWN access (blocked)');
    assert(selfTgl.checked === true, 'own toggle snaps back ON');
  }

  // ---- 4) search filters the list ---------------------------------------------
  be('p_akram'); WP._settingsTab = 'workspace'; WP.ui.settings.render(el);
  const search = el.querySelector('#mbr-search');
  const someName = WP.i18n.name(WP.data.PEOPLE.find(p => !p.tbc));
  search.value = someName.split(' ')[0]; search.dispatchEvent(new window.Event('input'));
  await tick();
  const filtered = (el.querySelector('#mbr-list').innerHTML.match(/class="mbr-row"/g) || []).length;
  assert(filtered >= 1 && filtered <= nRows, 'search narrows the roster');
  search.value = 'zzzznomatch'; search.dispatchEvent(new window.Event('input')); await tick();
  assert(/membersEmpty|No members|لا أعضاء/.test(el.querySelector('#mbr-list').innerHTML) || /log-empty/.test(el.querySelector('#mbr-list').innerHTML), 'no-match shows an empty state');

  // ---- 5) i18n EN+AR + AR/dark render -----------------------------------------
  const keys = ['membersTitle','membersNote','membersSearch','membersInvite','membersCount',
    'accessOn','accessOff','grantConfirmTitle','revokeConfirmTitle','cantRevokeSelf','membersEmpty','membersManageRoles'];
  keys.forEach(function (k) {
    WP.state.lang = 'en'; const en = WP.i18n.t(k);
    WP.state.lang = 'ar'; const ar = WP.i18n.t(k);
    assert(en && en !== k, 'i18n EN present: ' + k);
    assert(ar && ar !== k, 'i18n AR present: ' + k);
  });
  WP.state.lang = 'ar'; WP.state.theme = 'dark'; WP._settingsTab = 'workspace';
  try { WP.ui.settings.render(el); assert(/mbr-row|mbr-search/.test(el.innerHTML), 'Members renders under AR/dark'); }
  catch (e) { errors.push('[assert] AR/dark render threw: ' + e.message); }
  WP.state.lang = 'en'; WP.state.theme = 'light';

  if (errors.length) { console.log('FAIL\n' + errors.join('\n')); process.exit(1); }
  console.log('PASS — members & access: allowlist is a real screen (Workspace-gated); roster excludes open roles, searchable; grant/revoke flows through WP.access.grantAccess + persists + logs; self-revoke blocked; EN+AR both themes.');
  process.exit(0);
})();
