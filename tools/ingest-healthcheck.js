#!/usr/bin/env node
/* Ingest health alert consumer (System-Design principle #10).
 *
 * The Slack ingest job writes a tiny operational health record (tools/slack-ingest-job.js →
 * .slack-ingest-health.json). NOTHING read it — so a silently-stuck cursor or a creeping error
 * count was invisible without grepping logs. This is that reader: point a cron / external monitor
 * at it and it EXITS NON-ZERO with a clear reason when the ingest is unhealthy.
 *
 * PII: this consumes only operational COUNTS and timestamps from the health file — never message
 * text, author, or any person data. It cannot leak PII because the health file carries none.
 *
 * Exit codes:  0 = healthy   1 = unhealthy (one or more alert conditions)   2 = cannot read/parse
 *
 * Usage:
 *   node tools/ingest-healthcheck.js            # check the real health file
 *   node tools/ingest-healthcheck.js --selftest # run built-in cases (no file needed); CI-safe
 *   TEMPO_INGEST_HEALTH=/path/to/health.json node tools/ingest-healthcheck.js
 */
const fs = require('fs'), path = require('path');

// ── Thresholds (tune here) ───────────────────────────────────────────────────────────────────
const MAX_CONSECUTIVE_ERROR_RUNS = 3;                 // >= this many failing runs in a row → alert
const CURSOR_STUCK_MAX_MS        = 60 * 60 * 1000;    // cursor stuck longer than 1h → alert
const LAST_SUCCESS_STALE_MAX_MS  = 6 * 60 * 60 * 1000; // no successful run in 6h → alert
// ─────────────────────────────────────────────────────────────────────────────────────────────

const HEALTH_FILE = process.env.TEMPO_INGEST_HEALTH || path.join(__dirname, '..', '.slack-ingest-health.json');

function ms(iso) { const t = Date.parse(iso); return isNaN(t) ? null : t; }
function ageStr(msVal) { const m = Math.round(msVal / 60000); return m >= 60 ? (m / 60).toFixed(1) + 'h' : m + 'm'; }

/* Pure decision function — given a health record and "now" (ms epoch), return the list of alert
 * reasons. Empty list = healthy. Kept pure so --selftest can exercise every branch offline. */
function evaluate(health, nowMs) {
  const reasons = [];
  if (!health || typeof health !== 'object' || !Object.keys(health).length) {
    reasons.push('no health record found — the ingest job has not written .slack-ingest-health.json (is the cron running?)');
    return reasons;
  }
  const cer = health.consecutiveErrorRuns || 0;
  if (cer >= MAX_CONSECUTIVE_ERROR_RUNS) {
    reasons.push('consecutiveErrorRuns = ' + cer + ' (>= ' + MAX_CONSECUTIVE_ERROR_RUNS + ') — ingest failing repeatedly');
  }
  if (health.cursorStuckSince) {
    const t = ms(health.cursorStuckSince);
    if (t !== null && (nowMs - t) > CURSOR_STUCK_MAX_MS) {
      reasons.push('cursor stuck since ' + health.cursorStuckSince + ' (' + ageStr(nowMs - t) + ' ago, > ' + ageStr(CURSOR_STUCK_MAX_MS) + ') — messages present but cursor not advancing');
    }
  }
  if (health.lastSuccessAt) {
    const t = ms(health.lastSuccessAt);
    if (t !== null && (nowMs - t) > LAST_SUCCESS_STALE_MAX_MS) {
      reasons.push('last successful run ' + health.lastSuccessAt + ' (' + ageStr(nowMs - t) + ' ago, > ' + ageStr(LAST_SUCCESS_STALE_MAX_MS) + ') — no recent success');
    }
  } else if (cer > 0) {
    reasons.push('no successful run on record and ' + cer + ' error run(s) so far — ingest has never succeeded');
  }
  return reasons;
}

function selftest() {
  const NOW = Date.parse('2026-07-02T12:00:00.000Z');
  const H = 60 * 60 * 1000;
  const iso = off => new Date(NOW - off).toISOString();
  const cases = [
    ['healthy recent success',           { consecutiveErrorRuns: 0, lastSuccessAt: iso(5 * 60000), cursorStuckSince: null }, 0],
    ['3 consecutive errors',             { consecutiveErrorRuns: 3, lastSuccessAt: iso(2 * H), cursorStuckSince: null }, 1],
    ['cursor stuck 2h',                  { consecutiveErrorRuns: 1, lastSuccessAt: iso(10 * 60000), cursorStuckSince: iso(2 * H) }, 1],
    ['cursor stuck only 10m (ok)',       { consecutiveErrorRuns: 0, lastSuccessAt: iso(10 * 60000), cursorStuckSince: iso(10 * 60000) }, 0],
    ['last success 8h ago (stale)',      { consecutiveErrorRuns: 0, lastSuccessAt: iso(8 * H), cursorStuckSince: null }, 1],
    ['never succeeded, 1 error',         { consecutiveErrorRuns: 1, lastSuccessAt: null, cursorStuckSince: null }, 1],
    ['empty / missing record',           {}, 1],
  ];
  let fail = 0;
  for (const [name, health, expectUnhealthy] of cases) {
    const reasons = evaluate(health, NOW);
    const got = reasons.length > 0 ? 1 : 0;
    const ok = got === expectUnhealthy;
    if (!ok) fail++;
    console.log((ok ? 'ok  ' : 'FAIL') + ' — ' + name + (reasons.length ? '  [' + reasons.length + ' reason(s)]' : ''));
  }
  if (fail) { console.log('SELFTEST FAIL — ' + fail + ' case(s)'); process.exit(1); }
  console.log('SELFTEST PASS — ingest-healthcheck decision logic verified (' + cases.length + ' cases).');
  process.exit(0);
}

function main() {
  if (process.argv.includes('--selftest')) return selftest();
  let health;
  try {
    health = JSON.parse(fs.readFileSync(HEALTH_FILE, 'utf8'));
  } catch (e) {
    if (e.code === 'ENOENT') { console.log('UNHEALTHY — no health file at ' + HEALTH_FILE + ' (ingest job has not run)'); process.exit(1); }
    console.error('ERROR — cannot read/parse ' + HEALTH_FILE + ': ' + e.message); process.exit(2);
  }
  const reasons = evaluate(health, Date.now());
  if (reasons.length) {
    console.log('UNHEALTHY (' + reasons.length + '):');
    reasons.forEach(r => console.log('  - ' + r));
    process.exit(1);
  }
  console.log('HEALTHY — ingest looks fine (consecutiveErrorRuns=' + (health.consecutiveErrorRuns || 0) + ', lastSuccessAt=' + (health.lastSuccessAt || 'n/a') + ').');
  process.exit(0);
}

if (require.main === module) main();
module.exports = { evaluate, MAX_CONSECUTIVE_ERROR_RUNS, CURSOR_STUCK_MAX_MS, LAST_SUCCESS_STALE_MAX_MS };
