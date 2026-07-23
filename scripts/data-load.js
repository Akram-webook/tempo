#!/usr/bin/env node
/* ============================================================
 * G1 — Real-data import pipeline (Go-Live Foundation, wave 5)
 * ------------------------------------------------------------
 * Reads a PRIVATE real directory export and emits a gitignored
 * src/js/data/real-data.js module that the app loads INSTEAD of the
 * sample directory when present. The real export + the generated
 * module are both gitignored (they carry staff PII) - nothing here
 * ever writes real names/emails into a committed file.
 *
 * Usage:
 *   node scripts/data-load.js                # reads data/real-directory.json (or .csv)
 *   node scripts/data-load.js --in path.csv  # explicit input
 *   node scripts/data-load.js --dry          # validate only, write nothing
 *   node scripts/data-load.js --selftest     # run built-in checks (CI-safe, no real data)
 *
 * Input shape (JSON): an array of people, OR CSV with a header row.
 * Required per person: id, name, level, managerId (empty/"" for the top).
 * Optional: nameAr, initials, title, titleAr, team, teamAr, subteam,
 *           subteamAr, employment, email, slackId, photo, tbc.
 *
 * The output module sets WP.data.REAL = { PEOPLE: [...] } and a marker
 * WP.data.realDataLoaded = true, so the loader hook (mock-data.js) can
 * prefer it and flip the "Sample data" badge off. See docs/ROADMAP-golive.md.
 * ========================================================== */
'use strict';
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const DEFAULT_INPUTS = ['data/real-directory.json', 'data/real-directory.csv'];
const OUT = path.join(ROOT, 'src/js/data/real-data.js');

// The record contract mirrors mock-data.js P(). Keep in sync if that grows.
const REQUIRED = ['id', 'name', 'level', 'managerId'];
const KNOWN_LEVELS = ['director', 'sr_manager', 'manager', 'sr_spec', 'spec'];
const OPTIONAL = ['nameAr', 'initials', 'title', 'titleAr', 'team', 'teamAr',
  'subteam', 'subteamAr', 'employment', 'email', 'slackId', 'photo', 'tbc',
  'assignedEvents', 'dailyCheckin'];

function log(m) { process.stdout.write(m + '\n'); }
function fail(m) { process.stderr.write('ERROR: ' + m + '\n'); process.exit(1); }

// --- minimal CSV parser (handles quoted fields + commas inside quotes) ---
function parseCSV(text) {
  const rows = [];
  let row = [], field = '', inQ = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i], n = text[i + 1];
    if (inQ) {
      if (c === '"' && n === '"') { field += '"'; i++; }
      else if (c === '"') inQ = false;
      else field += c;
    } else if (c === '"') inQ = true;
    else if (c === ',') { row.push(field); field = ''; }
    else if (c === '\n' || c === '\r') {
      if (c === '\r' && n === '\n') i++;
      if (field !== '' || row.length) { row.push(field); rows.push(row); row = []; field = ''; }
    } else field += c;
  }
  if (field !== '' || row.length) { row.push(field); rows.push(row); }
  if (!rows.length) return [];
  const header = rows[0].map(function (h) { return h.trim(); });
  return rows.slice(1).filter(function (r) { return r.some(function (c) { return c.trim() !== ''; }); })
    .map(function (r) {
      const o = {};
      header.forEach(function (h, idx) { o[h] = (r[idx] || '').trim(); });
      return o;
    });
}

function initialsFrom(name) {
  return (name || '').split(/\s+/).filter(Boolean).slice(0, 2)
    .map(function (w) { return w[0].toUpperCase(); }).join('') || '?';
}

// Normalize one raw record into the app's P() shape. Coerces types, fills
// safe defaults, drops unknown keys (so a stray HR column can't inject).
function normalize(raw, idx) {
  const p = {};
  Object.keys(raw).forEach(function (k) {
    if (REQUIRED.indexOf(k) >= 0 || OPTIONAL.indexOf(k) >= 0) p[k] = raw[k];
  });
  // managerId: treat "", "null", "none", "-" as top-of-house (null)
  const m = String(p.managerId == null ? '' : p.managerId).trim().toLowerCase();
  p.managerId = (m === '' || m === 'null' || m === 'none' || m === '-') ? null : String(raw.managerId).trim();
  p.name = String(p.name || '').trim();
  p.level = String(p.level || '').trim();
  p.id = String(p.id || '').trim();
  if (!p.initials) p.initials = initialsFrom(p.name);
  if (!p.employment) p.employment = 'fulltime';
  if (p.assignedEvents == null) p.assignedEvents = [];
  else if (typeof p.assignedEvents === 'string') {
    p.assignedEvents = p.assignedEvents.split(/[;|]/).map(function (s) { return s.trim(); }).filter(Boolean);
  }
  if (p.dailyCheckin === '' || p.dailyCheckin == null) p.dailyCheckin = null;
  if (typeof p.tbc === 'string') p.tbc = /^(1|true|yes)$/i.test(p.tbc);
  return p;
}

// Validate the whole set: required fields, known levels, unique ids, every
// managerId resolves, and NO cycles in the reporting tree. Returns {people, warnings}.
function validate(list) {
  if (!Array.isArray(list) || !list.length) fail('input has no people');
  const people = list.map(normalize);
  const warnings = [];
  const byId = {};
  people.forEach(function (p, i) {
    REQUIRED.forEach(function (f) {
      if (f === 'managerId') return; // null is valid (top)
      if (!p[f]) fail('row ' + i + ' (' + (p.id || '?') + ') missing required "' + f + '"');
    });
    if (KNOWN_LEVELS.indexOf(p.level) < 0) warnings.push('row ' + i + ' unknown level "' + p.level + '" (' + p.id + ')');
    if (byId[p.id]) fail('duplicate id "' + p.id + '"');
    byId[p.id] = p;
  });
  // managerId resolves
  people.forEach(function (p) {
    if (p.managerId && !byId[p.managerId]) fail('person "' + p.id + '" has unknown managerId "' + p.managerId + '"');
  });
  // cycle detection (walk up to root; bail if we loop)
  people.forEach(function (p) {
    const seen = {}; let cur = p, hops = 0;
    while (cur && cur.managerId) {
      if (seen[cur.id]) fail('reporting cycle detected at "' + p.id + '"');
      seen[cur.id] = true;
      cur = byId[cur.managerId];
      if (++hops > people.length + 1) fail('reporting chain too long at "' + p.id + '" (cycle?)');
    }
  });
  const roots = people.filter(function (p) { return !p.managerId; });
  if (!roots.length) fail('no top-of-house person (every managerId is set - a cycle or missing root)');
  // An all-placeholder (all-TBC) export would flip the "Sample data" badge OFF while
  // showing only placeholders - almost certainly a mistake, so warn loudly.
  var realPeople = people.filter(function (p) { return !p.tbc && !/^TBC$/i.test(p.name); });
  if (!realPeople.length) warnings.push('every person is TBC/placeholder - the app will hide the "Sample data" badge but show no real people. Is this the right export?');
  return { people: people, warnings: warnings, roots: roots.length };
}

function emitModule(people) {
  const header =
    '/* GENERATED by scripts/data-load.js - DO NOT EDIT, DO NOT COMMIT.\n' +
    ' * Real Webook directory (PII). Gitignored. Regenerate with `node scripts/data-load.js`.\n' +
    ' * When present, mock-data.js prefers WP.data.REAL over the sample PEOPLE and\n' +
    ' * flips the "Sample data" badge off (real-data go-live, wave G1). */\n';
  // Escape < as < so a real name containing "</script>" can't break out of
  // the <script> tag when build.js inlines this module into dist.
  const json = JSON.stringify(people, null, 2).replace(/</g, '\\u003c');
  const body =
    '(function (WP) {\n' +
    '  "use strict";\n' +
    '  WP.data = WP.data || {};\n' +
    '  WP.data.REAL = { PEOPLE: ' + json + ' };\n' +
    '  WP.data.realDataLoaded = true;\n' +
    '})(window.WP = window.WP || {});\n';
  return header + body;
}

function readInput(inPath) {
  // Strip a UTF-8 BOM - Excel/Sheets "Save as CSV UTF-8" prepends one, and
  // String.trim() does NOT remove it, so it would poison the first header key
  // ("﻿id" != "id") and reject a perfectly valid export.
  const raw = fs.readFileSync(inPath, 'utf8').replace(/^﻿/, '');
  if (/\.csv$/i.test(inPath)) return parseCSV(raw);
  const j = JSON.parse(raw);
  return Array.isArray(j) ? j : (Array.isArray(j.people) ? j.people : fail('JSON must be an array or {people:[...]}'));
}

// ---- selftest: prove the pipeline on synthetic data, no real file needed ----
function selftest() {
  let pass = 0, failn = 0;
  function ok(c, m) { if (c) { pass++; } else { failn++; process.stderr.write('  FAIL: ' + m + '\n'); } }

  const good = [
    { id: 'a', name: 'Root Person', level: 'director', managerId: '' },
    { id: 'b', name: 'Mid Manager', level: 'manager', managerId: 'a' },
    { id: 'c', name: 'Spec One', level: 'spec', managerId: 'b', assignedEvents: 'e1;e2' }
  ];
  const v = validate(good);
  ok(v.people.length === 3, 'valid set keeps 3 people');
  ok(v.people[0].managerId === null, 'empty managerId -> null (top)');
  ok(Array.isArray(v.people[2].assignedEvents) && v.people[2].assignedEvents.length === 2, 'CSV-style events string splits to array');
  ok(v.people[1].initials === 'MM', 'initials derived from name');
  ok(emitModule(v.people).indexOf('WP.data.REAL') > 0, 'module emits WP.data.REAL');

  // failure cases must exit(1) - run in child-process-free way via try/catch on a thrown wrapper
  function expectFail(list, label) {
    const origExit = process.exit, origErr = process.stderr.write;
    let exited = false;
    process.exit = function () { exited = true; throw new Error('__exit__'); };
    process.stderr.write = function () { return true; };
    try { validate(list); } catch (e) { /* expected */ }
    process.exit = origExit; process.stderr.write = origErr;
    ok(exited, label);
  }
  expectFail([{ id: 'a', name: 'X', level: 'spec', managerId: 'ghost' }], 'unknown managerId fails');
  expectFail([{ id: 'a', name: 'X', level: 'spec', managerId: 'b' }, { id: 'b', name: 'Y', level: 'spec', managerId: 'a' }], 'cycle fails');
  expectFail([{ id: 'a', name: '', level: 'spec', managerId: '' }], 'missing name fails');
  expectFail([{ id: 'a', name: 'X', level: 'spec', managerId: '' }, { id: 'a', name: 'Z', level: 'spec', managerId: '' }], 'duplicate id fails');

  const parsed = parseCSV('id,name,level,managerId\na,"Root, Sr.",director,\nb,Mid,manager,a\n');
  ok(parsed.length === 2 && parsed[0].name === 'Root, Sr.', 'CSV quoted comma parsed');

  // emitModule escapes </script> so an inlined name can't break out of the tag
  const evil = emitModule([{ id: 'a', name: 'Bad</script><script>x', level: 'spec', managerId: null, initials: 'B', employment: 'fulltime', assignedEvents: [], dailyCheckin: null }]);
  ok(evil.indexOf('</script>') === -1, 'emitModule escapes </script> in a name');

  log('SELFTEST ' + (failn ? 'FAIL' : 'PASS') + ' - data-load: ' + pass + ' checks passed, ' + failn + ' failed.');
  process.exit(failn ? 1 : 0);
}

// ---- main ----
function main() {
  const args = process.argv.slice(2);
  if (args.indexOf('--selftest') >= 0) return selftest();
  const dry = args.indexOf('--dry') >= 0;
  const inFlag = args.indexOf('--in');
  let inPath = inFlag >= 0 ? args[inFlag + 1] : null;
  if (!inPath) {
    inPath = DEFAULT_INPUTS.map(function (p) { return path.join(ROOT, p); }).find(function (p) { return fs.existsSync(p); });
  } else if (!path.isAbsolute(inPath)) {
    inPath = path.join(ROOT, inPath);
  }
  if (!inPath || !fs.existsSync(inPath)) {
    log('No real directory found (looked for ' + DEFAULT_INPUTS.join(', ') + ').');
    log('Drop the real export there (gitignored) and re-run. The app keeps using sample data until then.');
    process.exit(0);   // not an error - the pipe is ready, just no data yet
  }
  log('Reading ' + path.relative(ROOT, inPath) + ' ...');
  const list = readInput(inPath);
  const v = validate(list);
  v.warnings.forEach(function (w) { log('  warn: ' + w); });
  log('Validated ' + v.people.length + ' people, ' + v.roots + ' at top of house, tree OK.');
  if (dry) { log('--dry: wrote nothing.'); return; }
  fs.writeFileSync(OUT, emitModule(v.people));
  log('Wrote ' + path.relative(ROOT, OUT) + ' (gitignored). Real data will load on next build/refresh.');
}

main();
