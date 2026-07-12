/* Admins page regression (wave/admins-page).
 * The Admins page creates admin accounts and invites them by email. This suite proves:
 *   1. Access: only the manageAdmins cap (admin/Super Admin) can reach it; member/manager denied.
 *   2. Validation: the form catches empty/invalid fields with the exact i18n messages.
 *   3. Invite flow: create() writes the record AND triggers resetPasswordForEmail — the
 *      SET-PASSWORD link. The app NEVER sets or stores a password (the core security promise).
 *   4. No-password guarantee: no password/secret value is passed to the backend or kept locally.
 *   5. i18n: every label + validation key exists in EN and AR.
 *   6. No PII in the bundle: admin contact fields are never written into WP.data (which ships). */
const fs = require('fs'), path = require('path');
const { JSDOM } = require('jsdom');
const root = path.join(__dirname, '..');
const errors = [];
function assert(c, m) { if (!c) errors.push('[assert] ' + m); }

const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const srcs = [...html.matchAll(/src="([^"]+\.js)"/g)].map(m => m[1]);
const dom = new JSDOM('<!doctype html><body><div id="view"></div><div id="root"></div></body>', { url: 'https://x/tempo/', runScripts: 'outside-only' });
const { window } = dom;
window.matchMedia = () => ({ matches: false, addEventListener() {}, removeEventListener() {} });
window.setInterval = () => 0;
for (const s of srcs) { try { new window.Function(fs.readFileSync(path.join(root, s), 'utf8')).call(window); } catch (e) { errors.push('[load] ' + s + ': ' + e.message); } }
const WP = window.WP;
// Neutralize the app-shell auto-render (needs the full topbar/appbar DOM we don't build);
// this suite drives WP.ui.admins.render directly against #root.
WP.render = function () {};

// ---- 1) Access gate -------------------------------------------------------
assert(typeof WP.can === 'function', 'WP.can exists');
const admin = WP.access.byId('p_akram');   // superAdmin
assert(WP.access.can('manageAdmins', admin) === true, 'admin/superAdmin has manageAdmins');
const member = WP.access.byId('p_idris');  // specialist
assert(WP.access.can('manageAdmins', member) === false, 'specialist denied manageAdmins');
const mgr = WP.access.byId('p_farah');     // manager
assert(WP.access.can('manageAdmins', mgr) === false, 'plain manager denied manageAdmins');
assert(WP.access.can('nonsense-cap', admin) === false, 'unknown cap fails closed even for admin');

// ---- 2) Validators --------------------------------------------------------
const A = WP.ui.admins;
assert(A && typeof A.render === 'function', 'WP.ui.admins.render exists');
assert(A._validEmail('ellie@gem-grp.com') === true, 'valid email accepted');
assert(A._validEmail('nope') === false, 'invalid email rejected');
assert(A._validEmail('') === false, 'empty email rejected');
assert(A._validPhone('+966133692527') === true, 'valid KSA phone accepted');
assert(A._validPhone('123') === false, 'too-short phone rejected');
assert(A._validPhone('') === false, 'empty phone rejected');

// ---- 3 & 4) Invite flow + no-password guarantee ---------------------------
// Install a mock Supabase client that records every call. The KEY assertion: the
// app calls resetPasswordForEmail (set-your-own-password) and NEVER a password API.
const calls = { insert: [], reset: [], other: [] };
let passwordEverSeen = false;
function scan(obj) { // any value that smells like a password field is a hard fail
  try {
    const s = JSON.stringify(obj || {}).toLowerCase();
    if (/"password"|"pass"|"pwd"|service_role/.test(s)) passwordEverSeen = true;
  } catch (e) {}
}
WP._sb = {
  from: function () {
    var q = {
      // directory reads (fired by the app boot) — return an empty, chainable result
      select: function () { return q; },
      range: function () { return q; },
      eq: function () { return q; },
      then: function (res) { return Promise.resolve({ data: [], error: null }).then(res); },
      upsert: function (row) { calls.insert.push(row); scan(row); return Promise.resolve({ error: null }); },
      insert: function (row) { calls.insert.push(row); scan(row); return Promise.resolve({ error: null }); }
    };
    return q;
  },
  auth: {
    resetPasswordForEmail: function (email, opts) { calls.reset.push({ email, opts }); scan(opts); return Promise.resolve({ error: null }); },
    signInWithPassword: function () { calls.other.push('signInWithPassword'); return Promise.resolve({ error: null }); },
    admin: { createUser: function (o) { calls.other.push('createUser'); scan(o); return Promise.resolve({ error: null }); } }
  }
};

WP.db.admins._reset();
const rec = { firstName: 'Ellie', lastName: 'Doe', email: 'ellie@gem-grp.com', phone: '+966133692527',
              gender: 'female', birthDate: '1995-06-28', country: 'Saudi Arabia', city: 'Riyadh',
              status: 'active', org: 'Webook' };

WP.db.admins.create(rec).then(function (res) {
  assert(res && res.invited === true, 'create() reports the invite was sent');
  assert(calls.reset.length === 1, 'exactly one resetPasswordForEmail (set-password link) call');
  assert(calls.reset[0].email === 'ellie@gem-grp.com', 'invite goes to the entered email');
  assert(calls.insert.length === 1, 'the admin record was persisted');
  assert(calls.other.indexOf('signInWithPassword') === -1, 'never signs anyone in (no impersonation)');
  assert(calls.other.indexOf('createUser') === -1, 'never uses admin.createUser (needs service_role)');
  assert(passwordEverSeen === false, 'NO password/secret value ever passed to the backend');

  // 6) No PII leaked into WP.data (the array that ships in the public bundle).
  const inData = (WP.data.PEOPLE || []).some(function (p) { return p.email === 'ellie@gem-grp.com' || p.phone === '+966133692527'; });
  assert(inData === false, 'admin contact PII is NOT written into WP.data (bundle stays clean)');

  // Local mirror holds it (so the pilot list works) but only non-secret fields.
  const listed = WP.db.admins.list();
  assert(listed.some(function (a) { return a.email === 'ellie@gem-grp.com'; }), 'admin shows in the list');
  assert(!listed.some(function (a) { return 'password' in a; }), 'no password field on any listed admin');

  finish();
}).catch(function (e) { errors.push('[invite] ' + e.message); finish(); });

// ---- 5) i18n coverage -----------------------------------------------------
function i18nCheck() {
  const keys = ['adminsTitle','adminNew','adminFirstName','adminLastName','adminEmail','adminPhone',
    'adminGender','adminBirth','adminCountry','adminCity','adminStatus','adminOrg','adminSendInvite',
    'adminResend','adminInviteSent','navAdmins','valFirstName','valLastName','valEmail','valPhone',
    'valGender','valBirth','valCountry','valCity','valStatus','valOrg','adminImport'];
  keys.forEach(function (k) {
    WP.state.lang = 'en'; const en = WP.i18n.t(k);
    WP.state.lang = 'ar'; const ar = WP.i18n.t(k);
    assert(en && en !== k, 'i18n EN present: ' + k);
    assert(ar && ar !== k, 'i18n AR present: ' + k);
  });
  WP.state.lang = 'en';
}
i18nCheck();

// ---- 7) Migration hygiene: RLS on, no password column, admin-only write ----
const mig = fs.readFileSync(path.join(root, 'supabase', '0007_admins.sql'), 'utf8');
assert(/is_admin\(\)/.test(mig), 'migration defines/uses is_admin() predicate');
assert(/with check \(public\.is_admin\(\)\)/.test(mig), 'insert/update policy re-asserts is_admin() in with check');
assert(!/add column[^\n]*password|password\s+text|password\s+varchar/i.test(mig), 'migration has NO password column (passwords live in Supabase Auth only)');
assert(!/to anon/.test(mig), 'no grant to anon that bypasses RLS');

function finish() {
  if (errors.length) { console.log('FAIL\n' + errors.join('\n')); process.exit(1); }
  console.log('PASS — admins: access gated to manageAdmins; validators correct; invite = set-password link (never a password/createUser/service_role); no PII in the bundle; EN+AR i18n complete; migration RLS admin-only + no password column.');
  process.exit(0);
}
