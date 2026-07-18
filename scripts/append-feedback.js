#!/usr/bin/env node
/* Append one feedback submission to data/feedback.json (the GitHub warehouse for
 * raw user feedback from the FAB widget). Run by .github/workflows/receive-feedback.yml
 * on a workflow_dispatch; the workflow then git-commits + pushes the result so
 * GitHub Pages serves it at /tempo/data/feedback.json.
 *
 * This is a SEPARATE file from data/exec-status.json (curated director notes /
 * AI ideas for the executive brief). The two are never merged.
 *
 * Inputs arrive as env vars (FB_NOTE, FB_TYPE, ...) so the YAML never string-
 * interpolates untrusted submission text into a shell command. Reads the current
 * file, appends, caps at MAX_ITEMS (drop oldest), rewrites.
 *
 * --selftest exercises append + cap + field mapping against a temp file with no
 * network and no git, so `npm test` proves the logic independent of Actions.
 */
'use strict';
const fs = require('fs');
const path = require('path');

const MAX_ITEMS = 200;
const FILE = path.join(__dirname, '..', 'data', 'feedback.json');

// The allowed enumerations - anything else is coerced to a safe default so a
// malformed dispatch can never write a bogus type/priority into the warehouse.
const TYPES = ['Improvement', 'Bug', 'New idea', 'Design'];
const PRIORITIES = ['Low', 'Medium', 'High', 'Critical', ''];

function str(v) { return v == null ? '' : String(v); }
function oneOf(v, allowed, fallback) { return allowed.indexOf(v) >= 0 ? v : fallback; }

// Build a normalized item from raw input (env-style object) + a run id + a
// "now" ISO string (passed in so the workflow controls the clock; Date is not
// used here so the function stays pure and testable).
function buildItem(raw, runId, nowIso) {
  const submittedAt = str(raw.submittedAt) || nowIso;
  return {
    id: str(runId) || submittedAt,
    submittedAt: submittedAt,
    owner: str(raw.owner),
    area: str(raw.area),
    type: oneOf(str(raw.type), TYPES, 'Improvement'),
    priority: oneOf(str(raw.priority), PRIORITIES, ''),
    note: str(raw.note),
    context: str(raw.context),
    url: str(raw.url),
    status: 'New',
  };
}

// Pure core: given the previous file object + a new item + now, return the next
// file object (append, cap oldest-first, refresh generated).
function appendItem(prev, item, nowIso) {
  const items = (prev && Array.isArray(prev.items)) ? prev.items.slice() : [];
  items.push(item);
  const capped = items.length > MAX_ITEMS ? items.slice(items.length - MAX_ITEMS) : items;
  return { generated: nowIso, items: capped };
}

function readFile(file) {
  try { return JSON.parse(fs.readFileSync(file, 'utf8')); }
  catch (e) { return { generated: '', items: [] }; }
}

function run() {
  const nowIso = new Date().toISOString();
  const runId = process.env.FB_RUN_ID || '';
  const raw = {
    note: process.env.FB_NOTE,
    type: process.env.FB_TYPE,
    priority: process.env.FB_PRIORITY,
    owner: process.env.FB_OWNER,
    area: process.env.FB_AREA,
    context: process.env.FB_CONTEXT,
    url: process.env.FB_URL,
    submittedAt: process.env.FB_SUBMITTED_AT,
  };
  if (!str(raw.note).trim()) {
    console.error('append-feedback: empty note - refusing to append.');
    process.exit(1);
  }
  const prev = readFile(FILE);
  const next = appendItem(prev, buildItem(raw, runId, nowIso), nowIso);
  fs.writeFileSync(FILE, JSON.stringify(next, null, 2) + '\n');
  console.log('append-feedback: appended run ' + (runId || '(local)') +
    ' - items now ' + next.items.length + '/' + MAX_ITEMS + '.');
}

function selftest() {
  let ok = true;
  const assert = (c, m) => { if (!c) { ok = false; console.error('FAIL: ' + m); } };

  // buildItem: enum coercion + status New + run id.
  const it = buildItem({ note: 'hi', type: 'Bogus', priority: 'Nope', owner: 'a@b.c',
    area: 'Dashboard', context: 'Chrome', url: 'https://x', submittedAt: '2026-01-01T00:00:00Z' }, '42', 'NOW');
  assert(it.id === '42', 'run id used as item id');
  assert(it.type === 'Improvement', 'bad type coerced to Improvement');
  assert(it.priority === '', 'bad priority coerced to blank');
  assert(it.status === 'New', 'status is New');
  assert(it.submittedAt === '2026-01-01T00:00:00Z', 'submittedAt preserved');

  // valid enums pass through.
  const it2 = buildItem({ note: 'x', type: 'Bug', priority: 'Critical' }, '', 'NOW');
  assert(it2.type === 'Bug' && it2.priority === 'Critical', 'valid enums pass through');
  assert(it2.id === 'NOW', 'no run id -> falls back to submittedAt/now');

  // appendItem: append + refresh generated.
  let f = { generated: 'old', items: [] };
  f = appendItem(f, it, 'T1');
  assert(f.items.length === 1 && f.generated === 'T1', 'append + refresh generated');

  // cap at MAX_ITEMS, dropping oldest.
  let big = { generated: '', items: [] };
  for (let i = 0; i < MAX_ITEMS + 5; i++) big = appendItem(big, buildItem({ note: 'n' + i }, String(i), 'T'), 'T');
  assert(big.items.length === MAX_ITEMS, 'capped at ' + MAX_ITEMS);
  assert(big.items[0].id === '5', 'oldest 5 dropped (first kept id is 5)');
  assert(big.items[big.items.length - 1].id === String(MAX_ITEMS + 4), 'newest kept');

  // readFile tolerates a missing/garbage file.
  const garbage = readFile(path.join(__dirname, 'does-not-exist.json'));
  assert(garbage && Array.isArray(garbage.items) && garbage.items.length === 0, 'missing file -> empty items');

  if (!ok) { console.error('append-feedback selftest FAILED'); process.exit(1); }
  console.log('SELFTEST PASS - append-feedback: enum coercion, status=New, append, cap-oldest, tolerant read.');
}

// Only act when run directly (node scripts/append-feedback.js [...]) - NOT when
// require()d by a test, which would otherwise trigger run()/exit.
if (require.main === module) {
  if (process.argv.indexOf('--selftest') >= 0) selftest();
  else run();
}

module.exports = { buildItem, appendItem, readFile, MAX_ITEMS };
