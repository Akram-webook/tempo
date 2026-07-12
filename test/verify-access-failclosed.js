/* Fail-closed access tests (wave/access-failclosed-tests).
 * The role matrix happy-path is proven by verify-permissions.js. This suite proves the
 * OTHER half of a security gate: the denials. A gate that only says "yes" correctly but
 * ever says "yes" by accident is broken. So we assert the engine denies by DEFAULT —
 *   - unknown / misspelled capability  → false (never a silent allow)
 *   - null / undefined viewer          → false for every cap (no anonymous access)
 *   - WP.can() with no viewer in state  → false, and does not throw
 *   - upward feedback never leaks to the rated manager or below
 *   - comp is director/admin only
 *   - relationshipTo: self wins over exec privilege; unrelated peer → 'none'
 *   - access allowlist is closed by default (non-listed + tbc denied) and round-trips
 * These mirror the RLS the DB enforces, so a denied button is also a denied query. */
const fs = require('fs'), path = require('path');
const { JSDOM } = require('jsdom');
const root = path.join(__dirname, '..');
const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const srcs = [...html.matchAll(/src="([^"]+\.js)"/g)].map(m => m[1]);
const dom = new JSDOM('<!doctype html><body></body>', { url: 'https://x/', runScripts: 'outside-only' });
const { window } = dom;
window.matchMedia = () => ({ matches: false, addEventListener() {}, removeEventListener() {} });
window.setInterval = () => 0;
for (const s of srcs) { try { new window.Function(fs.readFileSync(path.join(root, s), 'utf8')).call(window); } catch (e) {} }

const WP = window.WP;
const A = WP.access;
const byId = A.byId;
const errors = [];
function assert(c, m) { if (!c) errors.push('[assert] ' + m); }

const akram = byId('p_akram');
const dir = WP.data.PEOPLE.find(p => p.level === 'director');
const mgr = WP.data.PEOPLE.find(p => p.level === 'manager' || p.level === 'sr_manager');
const mem = WP.data.PEOPLE.find(p => p.level === 'spec' || p.level === 'sr_spec');
assert(akram && dir && mgr && mem, 'found one of each role in the data');

const ALL_CAPS = ['viewOrg', 'viewSensitive', 'writeEval', 'manageAccess',
  'resetPassword', 'manageRoles', 'editSettings', 'viewSettings'];

/* 1. Unknown capability is DENIED — default case must fall through to false,
 *    even for the most privileged viewer. A typo in a cap name must never open a door. */
['bogusCap', 'deleteEverything', '', 'VIEWORG', 'view_org', 'admin'].forEach(cap => {
  assert(A.can(cap, akram) === false, 'unknown cap "' + cap + '" denied even for admin');
});

/* 2. No viewer → every capability denied. Anonymous / logged-out === no access.
 *    NOTE: can(cap, null) intentionally re-resolves the viewer from WP.state.viewerId
 *    (that is how the bound WP.can() works). So to test a TRULY anonymous caller we must
 *    also clear the session pointer — otherwise the default sample viewer answers. */
WP.state = WP.state || {};
WP.state.viewerId = undefined;
[null, undefined].forEach(v => {
  ALL_CAPS.forEach(cap => {
    // A denied gate must be FALSY. Most caps return the boolean false; writeEval (with no
    // target) returns canAct()'s undefined for an anonymous viewer — still falsy, still denied,
    // but not strictly ===false. Assert on the security property (falsy = no access), not the
    // exact falsy value; the mismatch is captured as a documented finding below.
    assert(!A.can(cap, v), 'cap "' + cap + '" denied for ' + String(v) + ' viewer (anonymous)');
  });
  assert(A.roleOf(v) === 'member', 'roleOf(' + String(v) + ') fails safe to least-privilege member');
});
// FINDING (documented, non-blocking): can('writeEval', anonymous) returns undefined, not false
// (it forwards canAct()'s value). Falsy, so fail-closed — but callers doing `=== false` would
// misread it. Normalizing can() to always return a boolean would be a safe, tidy follow-up.
assert(A.can('writeEval', null) === undefined,
  'writeEval for an anonymous viewer returns undefined (falsy/denied) rather than false [documented finding]');
// viewOrg is the loosest cap (any logged-in viewer) — prove it is STILL closed when anonymous.
assert(A.can('viewOrg', null) === false, 'viewOrg denied with no viewer (no anonymous org access)');

/* 3. WP.can() bound to state must fail closed when no viewer is set, and must not throw. */
WP.state = WP.state || {};
delete WP.state.viewerId;
let threw = false, val;
try { val = WP.can('viewOrg'); } catch (e) { threw = true; }
assert(!threw, 'WP.can() does not throw when no viewer is set');
assert(val === false, 'WP.can() fails closed when no viewer is set');
try { assert(WP.roleOf() === 'member', 'WP.roleOf() defaults to member with no viewer'); }
catch (e) { errors.push('[assert] WP.roleOf() threw with no viewer'); }
// an unknown viewerId (stale session pointing at a deleted person) must also fail closed
WP.state.viewerId = 'p_does_not_exist';
assert(WP.can('resetPassword') === false, 'WP.can() denies for an unknown/stale viewerId');

/* 4. Upward (360) feedback routing — the safety-critical denial. A rater must NEVER
 *    see the upward feedback about their own manager, and neither may that manager. */
const report = WP.data.PEOPLE.find(p => p.managerId === mgr.id);
if (report) {
  assert(A.canSeeUpward(mgr, mgr.id) === false, 'a manager cannot see upward feedback about THEMSELF');
  assert(A.canSeeUpward(report, mgr.id) === false, 'a report cannot see upward feedback about their OWN manager');
  // someone strictly above the manager (skip-level) may see it; admin always may.
  const above = A.managerChainOf(mgr.id)[0] && byId(A.managerChainOf(mgr.id)[0]);
  if (above) assert(A.canSeeUpward(above, mgr.id) === true, 'a manager above M can see upward feedback about M');
  // A viewer with raw level==='admin' always may (C-level short-circuit in the engine).
  const rawAdmin = WP.data.PEOPLE.find(p => p.level === 'admin');
  if (rawAdmin) assert(A.canSeeUpward(rawAdmin, mgr.id) === true, 'a level=admin viewer can see upward feedback');
}
assert(A.canSeeUpward(null, mgr.id) === false, 'no viewer → no upward feedback');

/* FINDING (documented, non-blocking): canSeeUpward() and canSeeComp() gate on the RAW
 * viewer.level ('admin'/'director'), NOT roleOf(). akram is level='manager' + superAdmin,
 * so roleOf(akram)==='admin' yet he is DENIED comp + out-of-chain upward feedback. This is
 * fail-CLOSED (safe: it denies, never over-grants) but is inconsistent with the roleOf-based
 * caps in can(). Asserting the real behavior here so a future refactor to roleOf() is a
 * deliberate, test-visible change — not a silent security shift. */
assert(A.canSeeUpward(akram, mgr.id) === false,
  'super-admin (level=manager) is NOT auto-granted out-of-chain upward feedback — gates on raw level [documented finding]');

/* 5. Compensation gates on raw level director/admin — managers and members denied. */
assert(A.canSeeComp(dir) === true, 'director sees comp');
assert(A.canSeeComp(mgr) === false, 'manager CANNOT see comp');
assert(A.canSeeComp(mem) === false, 'member CANNOT see comp');
assert(!A.canSeeComp(null), 'no viewer CANNOT see comp (falsy/denied)');
// Same documented finding as upward: super-admin (level=manager) is denied comp — fail-closed.
assert(A.canSeeComp(akram) === false,
  'super-admin (level=manager) is NOT auto-granted comp — gates on raw level [documented finding]');
const rawAdmin2 = WP.data.PEOPLE.find(p => p.level === 'admin');
if (rawAdmin2) assert(A.canSeeComp(rawAdmin2) === true, 'a level=admin viewer sees comp');

/* 6. relationshipTo edges: self beats exec privilege; an unrelated peer is 'none'. */
assert(A.relationshipTo(dir, dir.id) === 'self', 'director viewing themselves is "self", not "director"');
assert(A.relationshipTo(null, mem.id) === 'none', 'no viewer → relationship "none"');
if (report) {
  const peer = WP.data.PEOPLE.find(p => p.managerId === mgr.id && p.id !== report.id);
  if (peer) assert(A.relationshipTo(report, peer.id) === 'none', 'two peers under the same manager are unrelated ("none")');
  // and a peer therefore cannot see a peer's sensitive data
  if (peer) assert(A.can('viewSensitive', report, peer.id) === false, 'a peer CANNOT see a peer\'s sensitive data');
}

/* 7. Access allowlist is CLOSED by default. Only allow-listed, non-tbc people enter. */
assert(A.hasAccess('p_akram') === true, 'allow-listed person has access');
const notListed = WP.data.PEOPLE.find(p => !A.hasAccess(p.id));
assert(notListed, 'at least one person is NOT granted access (allowlist is closed, not open)');
assert(A.hasAccess('p_no_such_person') === false, 'a non-existent id has no access');
assert(A.hasAccess(undefined) === false, 'undefined id has no access');
// grant/revoke round-trips through listAccess without leaking other grants
if (notListed) {
  WP.state.viewerId = 'p_akram';           // grantAccess logs against the current viewer
  const before = A.listAccess().slice().sort();
  A.grantAccess(notListed.id, true);
  assert(A.hasAccess(notListed.id) === true, 'grantAccess opens access for one id');
  A.grantAccess(notListed.id, false);
  assert(A.hasAccess(notListed.id) === false, 'revoke (grantAccess false) closes it again');
  const after = A.listAccess().slice().sort();
  assert(JSON.stringify(before) === JSON.stringify(after), 'grant→revoke leaves the granted set unchanged');
}
// setAccess restores an EXACT set — anything not in the list is revoked (fail-closed restore)
A.setAccess(['p_akram']);
assert(A.hasAccess('p_akram') === true && A.listAccess().length === 1, 'setAccess restores exactly the given set');
assert(A.hasAccess('p_ahmed') === false, 'setAccess revokes ids not in the restored set');
A.setAccess('not-an-array');  // bad input is ignored, not destructive
assert(A.listAccess().length === 1, 'setAccess ignores non-array input (no accidental wipe)');

if (errors.length) { console.log('FAIL\n' + errors.join('\n')); process.exit(1); }
console.log('PASS — access fail-closed: unknown cap denied (even admin); null/unknown viewer denied for every cap; WP.can() fails closed + never throws with no/stale viewer; upward feedback never leaks to the rated manager or below; comp director/admin-only; self beats exec privilege + peers unrelated; allowlist closed by default and grant/revoke/setAccess round-trip safely.');
process.exit(0);
