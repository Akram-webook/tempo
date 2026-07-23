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
// Classified lane (from the widget's local Polish, or classified server-side).
const KLASSES = ['Frontend', 'Backend', 'Bug', 'Feature', 'Enhancement', 'New skill', ''];
// Triage lifecycle statuses a director may set via an update op.
const STATUSES = ['New', 'Testing', 'Review', 'Assigned', 'Discarded'];
// The ONLY fields an update op may change. id/submittedAt/owner/note/context/url
// are immutable after create - a caller can never overwrite them (anti-tamper).
const UPDATABLE = ['status', 'wave', 'priority', 'triageNote', 'triagedBy', 'triagedAt'];

function str(v) { return v == null ? '' : String(v); }
function oneOf(v, allowed, fallback) { return allowed.indexOf(v) >= 0 ? v : fallback; }
// Strip control chars + hard-cap length so a hostile field can't bloat/corrupt the file.
function sanitize(v) { return str(v).slice(0, 2000).replace(/[\x00-\x08\x0b\x0c\x0e-\x1f]/g, ''); }

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
    klass: oneOf(str(raw.klass), KLASSES, ''),
    priority: oneOf(str(raw.priority), PRIORITIES, ''),
    note: str(raw.note),
    context: str(raw.context),
    url: str(raw.url),
    // Triage lifecycle: New -> Testing -> Review -> Assigned | Discarded.
    // A submission starts at New; a director advances it in the triage board.
    status: 'New',
    wave: null,          // set when Assigned to a delivery wave
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

// Pure core: apply an update/discard to an existing item by id, returning the
// next file object. Only UPDATABLE fields change; id/submittedAt/owner/note are
// immutable. Unknown id throws (caller maps to a 404). Discard is idempotent.
function applyOp(prev, op, raw, nowIso) {
  const items = (prev && Array.isArray(prev.items)) ? prev.items.map(function (x) { return Object.assign({}, x); }) : [];
  const id = str(raw && raw.id);
  const idx = items.findIndex(function (x) { return x.id === id; });
  if (idx < 0) { const e = new Error('item not found: ' + id); e.code = 'ENOITEM'; throw e; }
  const it = items[idx];                 // the clone we mutate (immutable fields never touched)

  if (op === 'discard') {
    it.status = 'Discarded';             // idempotent: discarding a Discarded item is a no-op change
    it.triagedAt = str(raw.triagedAt) || nowIso;
    if (raw.triagedBy !== undefined) it.triagedBy = sanitize(raw.triagedBy);
    return { generated: nowIso, items: items };
  }

  // op === 'update': touch ONLY whitelisted fields. Anything else in `raw`
  // (id, submittedAt, owner, note, __proto__, ...) is ignored by construction.
  if (raw.status !== undefined) {
    const s = oneOf(str(raw.status), STATUSES, null);
    if (s === null) { const e = new Error('invalid status: ' + raw.status); e.code = 'EBADSTATUS'; throw e; }
    it.status = s;
    if (s !== 'Assigned') it.wave = null;         // a non-Assigned status carries no wave
  }
  if (raw.wave !== undefined) it.wave = (raw.wave === '' || raw.wave == null) ? null : raw.wave;
  if (raw.priority !== undefined) it.priority = oneOf(str(raw.priority), PRIORITIES, it.priority);
  if (raw.triageNote !== undefined) it.triageNote = sanitize(raw.triageNote);
  if (raw.triagedBy !== undefined) it.triagedBy = sanitize(raw.triagedBy);
  it.triagedAt = str(raw.triagedAt) || nowIso;
  return { generated: nowIso, items: items };
}

function readFile(file) {
  try { return JSON.parse(fs.readFileSync(file, 'utf8')); }
  catch (e) { return { generated: '', items: [] }; }
}

function run() {
  const nowIso = new Date().toISOString();
  const runId = process.env.FB_RUN_ID || '';
  const op = oneOf(str(process.env.FB_OP) || 'create', ['create', 'update', 'discard'], 'create');
  const prev = readFile(FILE);

  if (op === 'create') {
    const raw = {
      note: process.env.FB_NOTE, type: process.env.FB_TYPE, klass: process.env.FB_KLASS,
      priority: process.env.FB_PRIORITY, owner: process.env.FB_OWNER, area: process.env.FB_AREA,
      context: process.env.FB_CONTEXT, url: process.env.FB_URL, submittedAt: process.env.FB_SUBMITTED_AT,
    };
    if (!str(raw.note).trim()) {
      console.error('append-feedback: empty note - refusing to append.');
      process.exit(1);
    }
    const next = appendItem(prev, buildItem(raw, runId, nowIso), nowIso);
    fs.writeFileSync(FILE, JSON.stringify(next, null, 2) + '\n');
    console.log('append-feedback: appended run ' + (runId || '(local)') +
      ' - items now ' + next.items.length + '/' + MAX_ITEMS + '.');
    return;
  }

  // update | discard: mutate an existing item by id.
  const raw = {
    id: process.env.FB_ID, status: process.env.FB_STATUS, wave: process.env.FB_WAVE,
    priority: process.env.FB_PRIORITY, triageNote: process.env.FB_TRIAGE_NOTE,
    triagedBy: process.env.FB_TRIAGED_BY, triagedAt: process.env.FB_SUBMITTED_AT,
  };
  if (!str(raw.id).trim()) { console.error('append-feedback: ' + op + ' needs an id.'); process.exit(1); }
  try {
    const next = applyOp(prev, op, raw, nowIso);
    fs.writeFileSync(FILE, JSON.stringify(next, null, 2) + '\n');
    console.log('append-feedback: ' + op + ' ' + raw.id + ' - items now ' + next.items.length + '.');
  } catch (e) {
    console.error('append-feedback: ' + op + ' failed - ' + e.message);
    process.exit(1);
  }
}

function selftest() {
  let ok = true;
  const assert = (c, m) => { if (!c) { ok = false; console.error('FAIL: ' + m); } };

  // buildItem: enum coercion + status New + run id.
  const it = buildItem({ note: 'hi', type: 'Bogus', klass: 'Nonsense', priority: 'Nope', owner: 'a@b.c',
    area: 'Dashboard', context: 'Chrome', url: 'https://x', submittedAt: '2026-01-01T00:00:00Z' }, '42', 'NOW');
  assert(it.id === '42', 'run id used as item id');
  assert(it.type === 'Improvement', 'bad type coerced to Improvement');
  assert(it.klass === '', 'bad klass coerced to blank');
  assert(it.priority === '', 'bad priority coerced to blank');
  assert(it.status === 'New', 'status is New');
  assert(it.wave === null, 'wave starts null (unassigned)');
  assert(it.submittedAt === '2026-01-01T00:00:00Z', 'submittedAt preserved');

  // valid enums pass through.
  const it2 = buildItem({ note: 'x', type: 'Bug', klass: 'Backend', priority: 'Critical' }, '', 'NOW');
  assert(it2.type === 'Bug' && it2.priority === 'Critical', 'valid enums pass through');
  assert(it2.klass === 'Backend', 'valid klass passes through');
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

  // --- applyOp: update / discard / guards ---
  const base = { generated: '', items: [
    { id: 'x1', submittedAt: '2026-01-01T00:00:00Z', owner: 'real@owner', note: 'keep me', context: 'ctx', url: 'u',
      type: 'Bug', klass: 'Backend', priority: 'Medium', status: 'New', wave: null },
  ] };
  // update status + wave
  let u = applyOp(base, 'update', { id: 'x1', status: 'Assigned', wave: 2, triagedBy: 'dir' }, 'T2');
  assert(u.items[0].status === 'Assigned' && u.items[0].wave === 2, 'update sets status + wave');
  assert(u.items[0].triagedBy === 'dir' && u.items[0].triagedAt === 'T2', 'update stamps triagedBy/At');
  // non-Assigned status clears wave
  let u2 = applyOp({ generated: '', items: [Object.assign({}, base.items[0], { status: 'Assigned', wave: 3 })] },
    'update', { id: 'x1', status: 'Review' }, 'T');
  assert(u2.items[0].wave === null, 'non-Assigned status clears wave');
  // invalid status rejected
  let threw = false; try { applyOp(base, 'update', { id: 'x1', status: 'HACKED' }, 'T'); } catch (e) { threw = e.code === 'EBADSTATUS'; }
  assert(threw, 'invalid status rejected (EBADSTATUS)');
  // unknown id rejected
  threw = false; try { applyOp(base, 'update', { id: 'nope', status: 'New' }, 'T'); } catch (e) { threw = e.code === 'ENOITEM'; }
  assert(threw, 'unknown id rejected (ENOITEM)');
  // immutable fields cannot be overwritten via update
  let inj = applyOp(base, 'update', { id: 'x1', status: 'Testing', submittedAt: '2000-01-01', owner: 'attacker@evil', note: 'HACKED' }, 'T');
  assert(inj.items[0].submittedAt === '2026-01-01T00:00:00Z', 'submittedAt immutable on update');
  assert(inj.items[0].owner === 'real@owner', 'owner immutable on update');
  assert(inj.items[0].note === 'keep me', 'note immutable on update');
  // prototype pollution attempt is inert (only whitelisted fields copied)
  let pp = applyOp(base, 'update', JSON.parse('{"id":"x1","status":"Testing","__proto__":{"isAdmin":true}}'), 'T');
  assert(pp.items[0].status === 'Testing' && ({}).isAdmin === undefined, 'prototype pollution inert');
  // partial update preserves other fields
  let partial = applyOp({ generated: '', items: [Object.assign({}, base.items[0], { triageNote: 'earlier' })] },
    'update', { id: 'x1', status: 'Testing' }, 'T');
  assert(partial.items[0].triageNote === 'earlier', 'partial update preserves existing triageNote');
  // discard sets status + is idempotent
  let d1 = applyOp(base, 'discard', { id: 'x1' }, 'T');
  assert(d1.items[0].status === 'Discarded', 'discard sets Discarded');
  let d2 = applyOp(d1, 'discard', { id: 'x1' }, 'T2');
  assert(d2.items[0].status === 'Discarded', 'discard is idempotent');
  // sanitize caps length + strips control chars
  assert(sanitize('a'.repeat(5000)).length === 2000, 'sanitize caps at 2000');
  assert(sanitize('a\x00b\x07c').indexOf('\x00') === -1, 'sanitize strips control chars');

  if (!ok) { console.error('append-feedback selftest FAILED'); process.exit(1); }
  console.log('SELFTEST PASS - append-feedback: create (enum/cap/tolerant) + update/discard (guards, immutable fields, no proto-pollution, idempotent).');
}

// Only act when run directly (node scripts/append-feedback.js [...]) - NOT when
// require()d by a test, which would otherwise trigger run()/exit.
if (require.main === module) {
  if (process.argv.indexOf('--selftest') >= 0) selftest();
  else run();
}

module.exports = { buildItem, appendItem, applyOp, readFile, sanitize, MAX_ITEMS, STATUSES, UPDATABLE };
