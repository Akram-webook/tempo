/* Anti-impersonation identity test (System-Design principle: Trust — explainable + traceable auth).
 *
 * GUARDS the password / Google / verified-link auth work against the single worst class of bug:
 * a signed-in session for email X resolving to a DIFFERENT person than X. That is impersonation,
 * and no auth provider change may ever introduce it.
 *
 * The one invariant this suite locks:
 *   For every registered account, a verified session carrying that account's email signs in as
 *   THAT person and no other — and a session whose email matches no account (or a denied/TBC
 *   account) signs in as NOBODY. There is never a silent fallback to "the first person".
 *
 * Mechanism, mirrors verify-login.js: load src/ into jsdom (no network), force verified-link mode,
 * mock WP._sb, and drive WP.auth.handleSession() — the exact seam a returning OAuth/link session
 * flows through. Supabase client is mocked; nothing leaves the process.
 */
const fs = require('fs'), path = require('path');
const { JSDOM } = require('jsdom');
const root = path.join(__dirname, '..');
const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const srcs = [...html.matchAll(/src="([^"]+\.js)"/g)].map(m => m[1]);
const shellBody = (html.match(/<body[^>]*>([\s\S]*?)<\/body>/) || [, ''])[1].replace(/<script[\s\S]*?<\/script>/g, '');
const dom = new JSDOM('<!doctype html><html><body>' + shellBody + '</body></html>', { url: 'https://akram-webook.github.io/tempo/', runScripts: 'outside-only' });
const { window } = dom;
window.HTMLElement.prototype.scrollIntoView = function () {};
window.matchMedia = () => ({ matches: false, addEventListener() {}, removeEventListener() {} });
window.setInterval = () => 0;
const errors = [];
const benign = /font|stylesheet|localStorage|Security|scrollIntoView|Not implemented|opaque|insertRule|cssRules|gsi|accounts\.google|cdn\.jsdelivr|supabase/i;
['error', 'warn'].forEach(k => { const o = window.console[k].bind(window.console); window.console[k] = (...a) => { const s = a.join(' '); if (!benign.test(s)) errors.push('[' + k + '] ' + s); }; });
window.addEventListener('error', e => { if (!benign.test(String(e.message))) errors.push('[onerror] ' + e.message); });
for (const s of srcs) { try { new window.Function(fs.readFileSync(path.join(root, s), 'utf8')).call(window); } catch (e) { errors.push('[load ' + s + '] ' + e.message); } }

const WP = window.WP;
function assert(c, m) { if (!c) errors.push('[assert] ' + m); }

try {
  WP.config.authMode = 'verified-link';
  const f = WP.auth.findByEmail;

  // Mock the Supabase client so handleSession's signOut()/network calls are inert.
  let signedOut = 0;
  WP._sb = { auth: { signOut: () => { signedOut++; return Promise.resolve({}); } } };

  const view = window.document.getElementById('view');
  function sessionFor(email) { WP.state.authed = false; WP.state.viewerId = null; WP._denied = null; WP.auth.handleSession({ user: { email: email } }); }

  // ---- 1. Email → person is a FUNCTION: no email maps to two different people. ----
  const withEmail = WP.data.PEOPLE.filter(p => p.email);
  assert(withEmail.length > 0, 'directory has at least one account with an email');
  const byEmail = {};
  withEmail.forEach(p => {
    const key = p.email.trim().toLowerCase();
    if (byEmail[key] && byEmail[key] !== p.id) errors.push('[assert] email ' + key + ' is shared by ' + byEmail[key] + ' and ' + p.id + ' — ambiguous identity');
    byEmail[key] = p.id;
  });

  // ---- 2. For EVERY account, a verified session for its email signs in as THAT person only. ----
  withEmail.forEach(p => {
    // findByEmail is the deterministic single-source mapping.
    const r = f(p.email);
    assert(r.person && r.person.id === p.id, p.email + ' → findByEmail resolves to ' + p.id + ' (got ' + (r.person && r.person.id) + ')');
    // The full session path: only granted (non-TBC) accounts actually sign in.
    sessionFor(p.email);
    if (WP.access.hasAccess(p.id)) {
      assert(WP.state.authed === true && WP.state.viewerId === p.id, p.email + ' verified session signs in as ' + p.id + ' and no other (got ' + WP.state.viewerId + ')');
    } else {
      assert(WP.state.authed === false && WP.state.viewerId !== p.id, p.email + ' (no access / TBC) verified session must NOT sign in as ' + p.id);
    }
  });

  // ---- 3. Case / whitespace variants of an email resolve to the SAME person, never a neighbour. ----
  const sample = withEmail[0];
  ['  ' + sample.email + '  ', sample.email.toUpperCase(), sample.email.replace(/@/, '@ ').replace(' ', '')].forEach(v => {
    const r = f(v);
    assert(r.person && r.person.id === sample.id, 'variant "' + v + '" still resolves to ' + sample.id + ' — no drift to another identity');
  });

  // ---- 4. A session for an unknown / wrong-domain email signs in as NOBODY (no first-person fallback). ----
  const before = WP.state.viewerId;
  sessionFor('nobody-here@example.com');
  assert(WP.state.authed === false && WP.state.viewerId == null, 'unknown-account session signs in as nobody (no fallback to a real person)');
  sessionFor('someone@evil.com');
  assert(WP.state.authed === false && WP.state.viewerId == null, 'wrong-domain session signs in as nobody');
  sessionFor('');
  assert(WP.state.authed === false && WP.state.viewerId == null, 'empty-email session signs in as nobody');

  // ---- 5. An already-known malicious shape can't ride in: a session with no user/email is rejected. ----
  WP.state.authed = false; WP.state.viewerId = null;
  WP.auth.handleSession({});
  assert(WP.state.authed === false && WP.state.viewerId == null, 'malformed session (no user) signs in as nobody');
  WP.auth.handleSession(null);
  assert(WP.state.authed === false && WP.state.viewerId == null, 'null session signs in as nobody');

  // ---- 6. Super-admin is identity-bound, not a role anyone can claim by email shape. ----
  sessionFor('adam.foster@example.com');
  assert(WP.state.viewerId === 'p_akram' && WP.access.isSuperAdmin(WP.access.byId('p_akram')) === true, 'adam.foster@example.com → p_akram AND is the super admin');
  const nonAdmin = withEmail.find(p => p.id !== 'p_akram' && WP.access.hasAccess(p.id));
  if (nonAdmin) { assert(WP.access.isSuperAdmin(WP.access.byId(nonAdmin.id)) === false, nonAdmin.id + ' (a normal account) is NOT super admin — role is bound to identity, not to signing in'); }
} catch (e) { errors.push('[run] ' + e.message + '\n' + e.stack); }

if (errors.length) { console.log('FAIL\n' + errors.join('\n')); process.exit(1); }
console.log('PASS — anti-impersonation: every verified session maps to exactly one registered person (never another), unknown/denied/malformed sessions sign in as nobody, super-admin is identity-bound.');
process.exit(0);
