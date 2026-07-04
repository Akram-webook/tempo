/* Tempo — structured logger (observability, no surveillance)
 * ------------------------------------------------------------
 * Purpose : one tiny logging surface for the whole app so every module logs the
 *           same way — a [filename] prefix + a level — instead of scattered raw
 *           console.* calls. Makes runtime behaviour greppable and filterable.
 * Inputs  : WP.log.<level>('[filename.js]', ...args). Levels: debug<info<warn<error.
 *           Level gate: WP.log.setLevel('warn'). Default = verbose on localhost/dev,
 *           warn+ in production (mirrors the old dev-only console behaviour).
 * Gotchas : - COUNTS / IDs ONLY. This is workforce software under a no-surveillance
 *             rule (ai-os CONSTITUTION, Human-First) — NEVER log person names,
 *             emails, titles, or message bodies. Object args are deep-SCRUBBED here
 *             (PII-shaped keys → "[redacted]") as a backstop, but call sites must
 *             still not interpolate PII into the string args (a plain string can't
 *             be inspected). test/verify-logging.js enforces both.
 *           - Must load FIRST (before data/core/ui) so WP.log always exists.
 *           - No DOM, no data reads — safe for the core-has-no-DOM boundary test.
 */
(function (WP) {
  'use strict';

  var LEVELS = { debug: 10, info: 20, warn: 30, error: 40 };

  function isDev() {
    try {
      var h = (typeof location !== 'undefined' && location.hostname) ? location.hostname : '';
      return h === '' || h === 'localhost' || h === '127.0.0.1' || h === '0.0.0.0';
    } catch (e) { return false; }
  }

  var state = { level: isDev() ? 'debug' : 'warn' };

  // PII-shaped keys we refuse to emit — identity + free-text bodies. IDs/counts are fine.
  var PII_KEY = /^(name|nameAr|fullName|email|slackId|title|titleAr|photo|feedback|description|desc|text|body|plan|done|remaining|learned|note|notes|comment|reason|message)$/i;

  // Deep-scrub object/array args so a stray person object can't leak identity/bodies.
  // Primitives pass through (a dev-authored label string can't be introspected — the
  // no-PII test covers call sites for that).
  function scrub(v, depth) {
    if (v == null) return v;
    var t = typeof v;
    if (t === 'number' || t === 'boolean' || t === 'string') return v;
    if (depth >= 4) return '[...]';
    if (Array.isArray(v)) return v.map(function (x) { return scrub(x, depth + 1); });
    if (t === 'object') {
      var out = {};
      for (var k in v) {
        if (!Object.prototype.hasOwnProperty.call(v, k)) continue;
        out[k] = PII_KEY.test(k) ? '[redacted]' : scrub(v[k], depth + 1);
      }
      return out;
    }
    return String(v);
  }

  function emit(level, prefix, rest) {
    if (LEVELS[level] < LEVELS[state.level]) return;
    var tag = /^\[.+\]$/.test(String(prefix)) ? prefix : '[' + prefix + ']';
    var args = rest.map(function (a) { return scrub(a, 0); });
    var sink = (typeof console !== 'undefined') ? (console[level] || console.log) : null;
    if (sink) { try { sink.apply(console, [tag].concat(args)); } catch (e) { /* never throw from logging */ } }
  }

  function make(level) {
    return function (prefix) { emit(level, prefix, Array.prototype.slice.call(arguments, 1)); };
  }

  WP.log = {
    LEVELS: LEVELS,
    setLevel: function (l) { if (LEVELS[l]) state.level = l; return state.level; },
    getLevel: function () { return state.level; },
    debug: make('debug'),
    info: make('info'),
    warn: make('warn'),
    error: make('error'),
    _scrub: scrub  // exposed for tests only
  };
})(window.WP = window.WP || {});
