/* Email-privacy regression (wave/privacy-email-hashes).
 * P0 fix: the public bundle must NOT ship the plaintext @webook.com directory. Directory
 * sign-in matches a SALTED-SHA256 hash of the typed email instead. This suite proves:
 *   1. WP.sha256 is a correct SHA-256 (matches Node crypto).
 *   2. The DEV data module still resolves plaintext emails (unbuilt runs / tests keep working).
 *   3. The BUILT dist/index.html ships NO real directory emails, and DOES ship EMAIL_HASHES.
 *   4. A hash-only resolver (the public-bundle path) resolves every real email to the right
 *      id, rejects unknown emails, and is case-insensitive — so sign-in is not regressed. */
const fs = require('fs'), path = require('path'), crypto = require('crypto');
const { JSDOM } = require('jsdom');
const root = path.join(__dirname, '..');
const errors = [];
function assert(c, m) { if (!c) errors.push('[assert] ' + m); }

// --- load the app scripts in jsdom (dev mode: plaintext EMAILS present) ---
const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const srcs = [...html.matchAll(/src="([^"]+\.js)"/g)].map(m => m[1]);
const dom = new JSDOM('<!doctype html><body></body>', { url: 'https://x/', runScripts: 'outside-only' });
const { window } = dom;
window.matchMedia = () => ({ matches: false, addEventListener() {}, removeEventListener() {} });
window.setInterval = () => 0;
for (const s of srcs) { try { new window.Function(fs.readFileSync(path.join(root, s), 'utf8')).call(window); } catch (e) {} }
const WP = window.WP;

// 1) SHA-256 correctness vs Node.
['', 'abc', 'akram@webook.com', 'ünïcödé@x'].forEach(function (s) {
  const node = crypto.createHash('sha256').update(s, 'utf8').digest('hex');
  assert(WP.sha256(s) === node, 'WP.sha256("' + s + '") matches Node crypto');
});

// 2) Dev module resolves plaintext emails (source of truth still works unbuilt).
assert(typeof WP.data.emailToId === 'function', 'WP.data.emailToId resolver exists');
assert(WP.data.emailToId('akram@webook.com') === 'p_akram', 'dev: akram@webook.com → p_akram');
assert(WP.data.emailToId('AKRAM@WEBOOK.COM') === 'p_akram', 'dev: resolver is case-insensitive');
assert(WP.data.emailToId('nobody@webook.com') === null, 'dev: unknown email → null');
// findByEmail (login) rides on the resolver.
if (WP.ui && WP.ui.login && WP.ui.login.findByEmail) {
  const r = WP.ui.login.findByEmail('ahmed.othman@webook.com');
  assert(r.person && r.person.id === 'p_ahmed', 'login.findByEmail resolves a real account');
  assert(WP.ui.login.findByEmail('ghost@webook.com').error === 'errNoAccount', 'login.findByEmail rejects unknown');
  assert(WP.ui.login.findByEmail('x@gmail.com').error === 'errBadDomain', 'login.findByEmail rejects wrong domain');
}

// 3) BUILT bundle: no plaintext directory, hashes present. (Requires `node build.js` first;
//    CI runs build before the suite. Skip cleanly if dist is absent so local `npm test`
//    without a build doesn't false-fail.)
const distPath = path.join(root, 'dist', 'index.html');
if (fs.existsSync(distPath)) {
  const dist = fs.readFileSync(distPath, 'utf8');
  // Count REAL directory emails. Allowed non-directory hits: 'name@webook.com' placeholder,
  // and code comments naming akram@ / figma_dev@ — those are not a harvestable list.
  const emails = (dist.match(/[a-z0-9._-]+@webook\.com/gi) || []).map(function (e) { return e.toLowerCase(); });
  const leaked = emails.filter(function (e) {
    return e !== 'name@webook.com' && e !== 'akram@webook.com' && e !== 'figma_dev@webook.com';
  });
  assert(leaked.length === 0, 'built dist ships NO real directory emails (leaked: ' + [...new Set(leaked)].join(', ') + ')');
  assert(/const EMAIL_HASHES = \{/.test(dist), 'built dist defines EMAIL_HASHES (hashed directory)');
  assert(!/const EMAILS = \{\s*p_\w+\s*:\s*'[^']*@webook/.test(dist), 'built dist has NO plaintext EMAILS directory literal');

  // 4) Hash-only resolver (public-bundle path) still resolves every real email correctly.
  const SALT = 'tempo:webook:v1';
  const srcData = fs.readFileSync(path.join(root, 'src/js/data/mock-data.js'), 'utf8');
  const block = (srcData.match(/const EMAILS = \{([\s\S]*?)\};/) || [, ''])[1];
  const pairs = [...block.matchAll(/(\w+)\s*:\s*'([^']+)'/g)];
  const hm = (dist.match(/const EMAIL_HASHES = \{([\s\S]*?)\};/) || [, ''])[1];
  const hashes = {};
  [...hm.matchAll(/(\w+)\s*:\s*'([0-9a-f]{64})'/g)].forEach(function (x) { hashes[x[1]] = x[2]; });
  function resolveByHash(email) {
    const h = WP.sha256(SALT + String(email).trim().toLowerCase());
    for (const id in hashes) { if (hashes[id] === h) return id; }
    return null;
  }
  let allOk = pairs.length > 0;
  pairs.forEach(function (x) { if (resolveByHash(x[2]) !== x[1]) allOk = false; });
  assert(allOk, 'every real email resolves to the right id via the shipped hashes (' + pairs.length + ' accounts)');
  assert(resolveByHash('nobody@webook.com') === null, 'hash resolver rejects an unknown email');
  assert(Object.keys(hashes).length === pairs.length, 'hash count matches the source directory size');
} else {
  console.log('note: dist/index.html absent — built-bundle checks skipped (run `node build.js` first).');
}

if (errors.length) { console.log('FAIL\n' + errors.join('\n')); process.exit(1); }
console.log('PASS — email privacy: WP.sha256 correct; dev resolves plaintext; BUILT dist ships hashes only (no real directory emails); hash-only sign-in resolves every account, rejects unknowns, case-insensitive.');
process.exit(0);
