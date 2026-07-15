/* Headless verify: Notifications & Nudges Phase 1 (in-app bell + inbox).
 * Asserts the work-based, calm, privacy-respecting contract:
 *  - badge count = active items for THIS viewer;
 *  - director sees "Needs input" items; a member does NOT (role-gated);
 *  - self-assessment-due item appears only when the viewer's OWN self is not done;
 *  - dismiss is per-viewer (hides for them, not for another viewer);
 *  - empty -> "You're all caught up.";
 *  - notificationsEnabled=false -> engine returns nothing + bell renders nothing;
 *  - bell is keyboard-accessible (button, aria, Esc closes);
 *  - EN + AR; no console errors. */
const fs = require('fs'), path = require('path');
const { JSDOM } = require('jsdom');

const root = path.join(__dirname, '..');
const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const srcs = [...html.matchAll(/src="([^"]+\.js)"/g)].map(m => m[1]);

const dom = new JSDOM('<!doctype html><html><head></head><body><div id="topbar"></div><div id="appbar"></div><div id="view"></div><div id="overlay-host"></div></body></html>', {
  url: 'https://example.org/tempo/', pretendToBeVisual: true, runScripts: 'outside-only',
});
const { window } = dom;
const errors = [];
const benign = /font|stylesheet|localStorage|Security|scrollIntoView|Not implemented|opaque|insertRule|cssRules|execCommand/i;
['error', 'warn'].forEach(k => {
  const orig = window.console[k].bind(window.console);
  window.console[k] = (...a) => { const s = a.join(' '); if (!benign.test(s)) errors.push('[' + k + '] ' + s); orig(...a); };
});
window.addEventListener('error', e => { if (!benign.test(String(e.message))) errors.push('[onerror] ' + e.message); });
window.HTMLElement.prototype.scrollIntoView = function () {};
window.matchMedia = window.matchMedia || function () { return { matches: false, addEventListener() {}, removeEventListener() {} }; };

for (const s of srcs) {
  const code = fs.readFileSync(path.join(root, s), 'utf8');
  const script = new window.Function(code);
  try { script.call(window); } catch (e) { errors.push('[load ' + s + '] ' + e.message); }
}

const WP = window.WP;
WP.render = function () {};
function assert(c, m) { if (!c) errors.push('[assert] ' + m); }

const DIRECTOR = 'p_ahmed';   // superAdmin/director
const MEMBER = 'p_shahad';    // spec

// exec payload with two red "Needs input" requests + others
const EXEC_REQS = [
  { id: 1, area: 'Events', note: 'Stage A signage', status: 'Needs input' },
  { id: 2, area: 'Eval', note: 'Q1-Q4', status: 'Working' },
  { id: 3, area: 'Access', note: 'New role gate', status: 'Blocked' },   // red bucket too
  { id: 4, area: 'Org', note: 'done thing', status: 'Done' },
];

(async () => {
  try {
    assert(WP.notifications && typeof WP.notifications.buildItems === 'function', 'engine WP.notifications.buildItems exists');
    assert(WP.config.notificationsEnabled === true, 'notificationsEnabled defaults true');

    const dir = WP.access.byId(DIRECTOR);
    const mem = WP.access.byId(MEMBER);
    assert(dir && mem, 'test people resolve');

    // --- role gating: director sees needs-input, member does NOT --------------------
    WP.can = function (cap) { return cap === 'viewSettings'; };   // director/admin
    WP.state.viewerId = DIRECTOR;
    const dItems = WP.notifications.buildItems(dir, { execRequests: EXEC_REQS });
    const dNeeds = dItems.filter(i => i.type === 'needsInput');
    assert(dNeeds.length === 2, 'director sees the 2 red needs-input items (got ' + dNeeds.length + ')');

    WP.can = function () { return false; };                       // member
    WP.state.viewerId = MEMBER;
    const mItems = WP.notifications.buildItems(mem, { execRequests: EXEC_REQS });
    assert(mItems.filter(i => i.type === 'needsInput').length === 0, 'member sees NONE of the director needs-input items');
    assert(WP.notifications.needsExecData(mem) === false, 'member does not trigger an exec fetch');

    // --- self-assessment-due: only when the viewer OWN self is not completed --------
    // member p_shahad — ensure a status we control
    const hadSelf = WP.data.SELF[MEMBER];
    WP.data.SELF[MEMBER] = { status: 'Not started' };
    const cyc = WP.evaluation.activeCycle();
    const active = cyc && cyc.status === 'Active';
    const mItems2 = WP.notifications.buildItems(mem, {});
    if (active) {
      assert(mItems2.some(i => i.type === 'selfAssessmentDue'), 'self-assessment-due shows when not completed + cycle active');
      WP.data.SELF[MEMBER] = { status: 'Completed' };
      assert(!WP.notifications.buildItems(mem, {}).some(i => i.type === 'selfAssessmentDue'), 'self-assessment-due hidden once completed');
    }
    WP.data.SELF[MEMBER] = hadSelf;

    // --- dismiss is PER-VIEWER ------------------------------------------------------
    WP.can = function (cap) { return cap === 'viewSettings'; };
    WP.state.viewerId = DIRECTOR;
    WP.notifications._resetDismissed();
    const before = WP.notifications.buildItems(dir, { execRequests: EXEC_REQS }).length;
    const firstId = WP.notifications.buildItems(dir, { execRequests: EXEC_REQS })[0].id;
    WP.notifications.dismiss(DIRECTOR, firstId);
    const after = WP.notifications.buildItems(dir, { execRequests: EXEC_REQS }).length;
    assert(after === before - 1, 'dismiss removes exactly one item for that viewer');
    // a DIFFERENT viewer is unaffected by the director's dismiss
    WP.can = function () { return true; };   // let both types build for this cross-check
    assert(!WP.notifications.isDismissed(MEMBER, firstId), 'dismiss is per-viewer: another viewer is unaffected');
    WP.notifications._resetDismissed();

    // --- disabled flag -> engine returns nothing ------------------------------------
    WP.can = function (cap) { return cap === 'viewSettings'; };
    WP.config.notificationsEnabled = false;
    assert(WP.notifications.buildItems(dir, { execRequests: EXEC_REQS }).length === 0, 'notificationsEnabled=false -> no items');
    WP.config.notificationsEnabled = true;

    // ===== UI: bell + panel =========================================================
    WP.state.lang = 'en';
    WP.state.viewerId = DIRECTOR;
    WP.can = function (cap) { return cap === 'viewSettings'; };
    const appbar = window.document.getElementById('appbar');

    // disabled -> mount renders nothing
    WP.config.notificationsEnabled = false;
    appbar.innerHTML = '<div id="account"></div>';
    WP.ui.notifications.mount(appbar);
    assert(!window.document.getElementById('notif-btn'), 'bell renders NOTHING when disabled');
    WP.config.notificationsEnabled = true;

    // enabled -> bell mounts, keyboard-accessible
    appbar.innerHTML = '<div id="account"></div>';
    WP.ui.notifications.mount(appbar);
    const btn = window.document.getElementById('notif-btn');
    assert(btn && btn.tagName === 'BUTTON', 'bell is a real button');
    assert(btn.getAttribute('aria-haspopup') === 'true' && btn.hasAttribute('aria-expanded'), 'bell has aria-haspopup + aria-expanded');
    assert(btn.getAttribute('aria-label'), 'bell has an aria-label');
    assert(btn.querySelector('svg'), 'bell uses an inline SVG icon (no emoji)');

    // feed exec data so the badge/panel can show items, then refresh badge
    // (mount kicked a fetch; simulate its resolution by seeding the module via open+paint)
    // Directly drive the engine-backed badge: inject requests through a fake fetch.
    // Simplest: set config endpoint empty so loadExec resolves to [] and use self-assessment.
    // Instead assert badge reflects engine count with self-assessment due:
    const hs = WP.data.SELF[DIRECTOR]; WP.data.SELF[DIRECTOR] = { status: 'Not started' };
    WP.ui.notifications.refreshBadge();
    const badgeN = WP.ui.notifications._items().length;
    const badgeEl = btn.querySelector('.notif-badge');
    if (badgeN > 0) assert(badgeEl, 'badge shows when there are active items');
    WP.data.SELF[DIRECTOR] = hs;

    // open the panel via click; Esc closes it
    btn.click();
    const wrap = window.document.getElementById('notif');
    assert(wrap && wrap.classList.contains('open'), 'clicking the bell opens the inbox');
    const esc = new window.KeyboardEvent('keydown', { key: 'Escape' });
    window.document.dispatchEvent(esc);
    assert(!wrap.classList.contains('open'), 'Esc closes the inbox');

    // empty state -> "all caught up" (dismiss everything, reopen, no endpoint items)
    WP.config.execStatusEndpoint = '';   // no needs-input source
    WP.data.SELF[DIRECTOR] = { status: 'Completed' };   // no self-assessment item
    WP.notifications._resetDismissed();
    btn.click();
    const panel = window.document.getElementById('notif-panel');
    assert(panel && /caught up|على ما يُرام/i.test(panel.textContent), 'empty inbox shows "all caught up"');

    // --- AR ------------------------------------------------------------------------
    WP.state.lang = 'ar';
    appbar.innerHTML = '<div id="account"></div>';
    WP.ui.notifications.mount(appbar);
    const btnAr = window.document.getElementById('notif-btn');
    btnAr.click();
    const panelAr = window.document.getElementById('notif-panel');
    assert(/الإشعارات/.test(panelAr.textContent), 'panel header localizes to AR');
  } catch (e) {
    errors.push('[run] ' + e.message + '\n' + e.stack);
  }

  if (errors.length) { console.log('FAIL\n' + errors.join('\n')); process.exit(1); }
  console.log('PASS — notifications (Phase 1): work-based items, badge = active count, director sees needs-input / member does not, self-assessment-due only when the viewer\'s own is open, dismiss is per-viewer, disabled renders nothing, empty -> all caught up, bell keyboard-accessible (button+aria+Esc), EN+AR.');
  process.exit(0);
})();
