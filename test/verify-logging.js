/* Structured logger (PR A — observability). Asserts:
 *   - WP.log exists with debug/info/warn/error + level control,
 *   - every emit carries a [prefix] tag in the required format,
 *   - level gating suppresses below the set level,
 *   - the no-PII guarantee: object args are deep-scrubbed (names/emails/bodies →
 *     "[redacted]"), and NO raw console.* survives in src/ (all routed through WP.log,
 *     bar one documented dev-only guard),
 *   - no src call site hands the logger obvious PII (person name / email / directory).
 */
const fs = require('fs'), path = require('path');
const { JSDOM } = require('jsdom');
const root = path.join(__dirname, '..');
const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const srcs = [...html.matchAll(/src="([^"]+\.js)"/g)].map(m => m[1]);
const dom = new JSDOM('<!doctype html><html><body></body></html>', { url: 'https://localhost/', runScripts: 'outside-only' });
const { window } = dom;
window.HTMLElement.prototype.scrollIntoView = function () {};
window.matchMedia = () => ({ matches: false, addEventListener() {}, removeEventListener() {} });

// Capture everything written to the console during logging calls (structurally, so
// scrubbed object contents are inspectable — join('') would collapse to [object Object]).
const sink = [];
['debug', 'info', 'warn', 'error', 'log'].forEach(k => { window.console[k] = (...a) => sink.push(a.map(x => typeof x === 'string' ? x : JSON.stringify(x)).join(' ')); });

const errors = [];
function assert(c, m) { if (!c) errors.push('[assert] ' + m); }
for (const s of srcs) { try { new window.Function(fs.readFileSync(path.join(root, s), 'utf8')).call(window); } catch (e) { errors.push('[load ' + s + '] ' + e.message); } }
const WP = window.WP;

// ---- API shape ---------------------------------------------------------------
assert(WP && WP.log, 'WP.log exists');
['debug', 'info', 'warn', 'error'].forEach(l => assert(typeof WP.log[l] === 'function', 'WP.log.' + l + ' is a function'));
assert(typeof WP.log.setLevel === 'function' && typeof WP.log.getLevel === 'function', 'level control present');

// ---- prefix format -----------------------------------------------------------
WP.log.setLevel('debug');
sink.length = 0; WP.log.info('[login.js]', 'signed in', { count: 3 });
assert(sink.length === 1 && /^\[login\.js\]/.test(sink[0]), 'emit carries a [prefix] tag: ' + sink[0]);
sink.length = 0; WP.log.warn('events.js', 'x');   // bare prefix → auto-bracketed
assert(sink.length === 1 && /^\[events\.js\]/.test(sink[0]), 'bare prefix is auto-bracketed');

// ---- level gating ------------------------------------------------------------
WP.log.setLevel('error');
sink.length = 0; WP.log.debug('[t.js]', 'd'); WP.log.info('[t.js]', 'i'); WP.log.warn('[t.js]', 'w');
assert(sink.length === 0, 'debug/info/warn suppressed when level = error');
WP.log.error('[t.js]', 'e');
assert(sink.length === 1, 'error still emits at level = error');
WP.log.setLevel('debug');

// ---- no-PII scrub (object args) ---------------------------------------------
const scrubbed = WP.log._scrub({ name: 'Adam Foster', email: 'adam.foster@example.com', title: 'Director', count: 5, id: 'p_akram', nested: { feedback: 'secret note', ok: true } }, 0);
assert(scrubbed.name === '[redacted]' && scrubbed.email === '[redacted]' && scrubbed.title === '[redacted]', 'identity fields scrubbed');
assert(scrubbed.count === 5 && scrubbed.id === 'p_akram', 'counts + IDs preserved (allowed)');
assert(scrubbed.nested.feedback === '[redacted]' && scrubbed.nested.ok === true, 'nested bodies scrubbed, nested flags kept');
sink.length = 0; WP.log.info('[t.js]', { name: 'Adam Foster', email: 'adam.foster@example.com' });
assert(!/Adam Foster|akram@webook\.com/.test(sink[0]) && /\[redacted\]/.test(sink[0]), 'emitted object never contains raw PII');

// ---- static: no raw console.* left in src/ (all routed) ----------------------
// Allowlist: events.js keeps ONE dev-only, isDevMode()-guarded console.warn (the derive
// wiring-fault trace) by request — a deliberate, documented exception, not scattered logging.
function walk(d) { return fs.readdirSync(d).flatMap(f => { const p = path.join(d, f); return fs.statSync(p).isDirectory() ? walk(p) : [p]; }); }
const jsFiles = walk(path.join(root, 'src', 'js')).filter(f => f.endsWith('.js'));
const ALLOW = [path.join('core', 'events.js')];
const rawConsole = [];
for (const f of jsFiles) {
  if (f.endsWith(path.join('core', 'log.js'))) continue;   // the logger owns the console
  const allowed = ALLOW.some(a => f.endsWith(a));
  fs.readFileSync(f, 'utf8').split('\n').forEach((line, i) => {
    if (/\bconsole\.(log|info|warn|error|debug)\b/.test(line) && !allowed) rawConsole.push(path.relative(root, f) + ':' + (i + 1));
  });
}
assert(rawConsole.length === 0, 'no raw console.* in src/ outside the allowlist (route through WP.log): ' + rawConsole.join(', '));

// ---- static: no src log call site passes obvious PII -------------------------
const PII_ARG = /\.(name|nameAr|email|title|titleAr|feedback)\b|WP\.i18n\.name\s*\(|\bEMAILS\b/;
const leaks = [];
for (const f of jsFiles) {
  fs.readFileSync(f, 'utf8').split('\n').forEach((line, i) => {
    if (/WP\.log\.(debug|info|warn|error)\s*\(/.test(line) && PII_ARG.test(line)) leaks.push(path.relative(root, f) + ':' + (i + 1) + '  ' + line.trim());
  });
}
assert(leaks.length === 0, 'no WP.log call site interpolates PII: ' + leaks.join(' | '));

if (errors.length) { console.log('FAIL verify-logging\n' + errors.join('\n')); process.exit(1); }
console.log('PASS verify-logging — structured logger: [prefix] format, level gating, PII-scrubbed, all console.* routed (1 documented dev-guard allowlisted).');
process.exit(0);
