#!/usr/bin/env node
/*───────────────────────────────────────────────────────────────────────────
  add-idea.mjs — push a PM idea into the Executive Status pipeline.

  What it does: POSTs one row to the Apps Script endpoint (endpoint.gs doPost),
  which appends it to the "Tempo — Feedback (Live)" sheet. From there the deck
  rebuilds itself (~60s) and the in-app page reads it live. Zero manual step.
  Also appends the same row to docs/ba-feed.tsv as a version-controlled audit log.

  Config (endpoint URL + write token) is read from a file OUTSIDE the repo so the
  token is never committed:
      $TEMPO_EXEC_CONFIG  or  ~/.tempo-exec.json
      { "endpoint": "https://script.google.com/macros/s/…/exec", "token": "…" }

  Usage:
    node add-idea.mjs --tab feedback --note "…" --area "…" --type Feature \
                      --priority MEDIUM --status Later --owner Akram [--date 2026-07-15]
    node add-idea.mjs --tab features --feature "…" --area "…" --note "what it does" \
                      --status Next [--date 2026-07-15]
    node add-idea.mjs --dry ...   # print the payload + audit row, do not POST
───────────────────────────────────────────────────────────────────────────*/
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const FEED = path.join(HERE, '..', 'ba-feed.tsv');

function parseArgs(argv) {
  const a = {}; for (let i = 0; i < argv.length; i++) {
    if (argv[i].startsWith('--')) { const k = argv[i].slice(2); const v = (argv[i + 1] && !argv[i + 1].startsWith('--')) ? argv[++i] : true; a[k] = v; }
  } return a;
}
function loadConfig() {
  const p = process.env.TEMPO_EXEC_CONFIG || path.join(os.homedir(), '.tempo-exec.json');
  if (!fs.existsSync(p)) { throw new Error(`config not found: ${p}\nCreate it with { "endpoint": "…/exec", "token": "…" }`); }
  return JSON.parse(fs.readFileSync(p, 'utf8'));
}
function today() { return new Date().toISOString().slice(0, 10); }

const args = parseArgs(process.argv.slice(2));
const tab = String(args.tab || 'feedback').toLowerCase();
const date = args.date || today();

// build the sheet payload
const payload = tab === 'features'
  ? { tab, area: args.area || '', feature: args.feature || '', note: args.note || '', status: args.status || 'Next', date }
  : { tab, area: args.area || '', type: args.type || 'Feature', note: args.note || '', priority: args.priority || 'MEDIUM', status: args.status || 'Later', owner: args.owner || 'Akram', date };

// audit-log row for ba-feed.tsv (sync=YES because the endpoint already wrote it)
const auditRow = tab === 'features'
  ? ['F', 'YES', date, payload.area, payload.feature, payload.note, payload.status].join('\t')
  : ['B', 'YES', date, payload.area, payload.type, payload.note, payload.priority, payload.status, payload.owner].join('\t');

if (args.dry) {
  console.log('POST payload:', JSON.stringify({ ...payload, token: '‹hidden›' }, null, 2));
  console.log('audit row  :', auditRow);
  process.exit(0);
}

const cfg = loadConfig();
const res = await fetch(cfg.endpoint, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ ...payload, token: cfg.token }),
  redirect: 'follow'
});
const text = await res.text();
let json; try { json = JSON.parse(text); } catch { json = { ok: false, raw: text.slice(0, 300) }; }
if (!json.ok) { console.error('WRITE FAILED:', json.error || json.raw || text.slice(0, 300)); process.exit(1); }

// append to the audit log
try { fs.appendFileSync(FEED, auditRow + '\n'); } catch (e) { console.error('audit append skipped:', e.message); }
console.log(`OK → appended to "${json.tab}" tab. Deck rebuilds ~60s; in-app page live now.`);
console.log('audit row logged in docs/ba-feed.tsv');
