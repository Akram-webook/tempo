#!/usr/bin/env node
/* ============================================================
 * compute-exec-status.js — DERIVE exec status from real PR data
 * ------------------------------------------------------------
 * Runs in GitHub Actions on every merge to main (and daily 7am UTC).
 * It does NOT let anyone assert numbers - everything is derived from the
 * GitHub API. Narrative is a template over the facts, never free prose.
 * Two ORTHOGONAL signals (progress != health):
 *
 *   PROGRESS (how far)  = round( merged change-size / total change-size )
 *                         effort-weighted (lines), NOT PR count (1/1 != 100%).
 *   HEALTH   (stuck?)   = green | amber | red, from open-PR state:
 *                         red   = build failing, changes-requested, or >10d stuck
 *                         amber = awaiting review 3-10d
 *                         green = nothing stuck
 *   BLOCKED-ON per PR   = build | author | reviewers (whose move is it).
 *
 * Then it POSTs the computed {ship} to the Apps Script endpoint, which
 * writes the Google Sheet + rebuilds the Slides deck; the in-app page
 * reads the sheet over JSONP.
 *
 * Env:
 *   GITHUB_TOKEN  — provided by Actions (read PRs)
 *   GITHUB_REPO   — "owner/repo" (defaults to Akram-webook/tempo)
 *   EXEC_ENDPOINT — Apps Script /exec (defaults to the known URL)
 * ========================================================== */
'use strict';
const https = require('https');

const REPO     = process.env.GITHUB_REPO  || 'Akram-webook/tempo';
const TOKEN    = process.env.GITHUB_TOKEN || '';
const ENDPOINT = process.env.EXEC_ENDPOINT ||
  'https://script.google.com/macros/s/AKfycbzcvghQNmEFZ5fNSjPIYONrNZVV8fjiboi93_cffS1vrfXPy9Cx4fskGmeVRhjFGu3Krw/exec';

// Wave name (EXACT — sheet matches by name) -> the GitHub label on its PRs.
const WAVES = [
  { name: 'Executive Status Deck', label: 'wave:exec-status' },
  { name: 'Capacity Engine',       label: 'wave:capacity'    },
  { name: 'Real Data Go-live',     label: 'wave:real-data'   },
  { name: 'Slack Integration',     label: 'wave:slack'       },
];

function today_() { return new Date().toISOString().slice(0, 10); }
const TODAY_ISO = today_();   // one stable "today" per run (used for age math + date stamp)

// --- GitHub API: all PRs with a given label (open + closed) ------------------
function ghGet(path) {
  return new Promise((resolve, reject) => {
    const req = https.request(
      { hostname: 'api.github.com', path, method: 'GET',
        headers: {
          'User-Agent': 'tempo-exec-status',
          'Accept': 'application/vnd.github+json',
          ...(TOKEN ? { Authorization: 'Bearer ' + TOKEN } : {}),
        } },
      (res) => {
        let data = '';
        res.on('data', (c) => (data += c));
        res.on('end', () => {
          if (res.statusCode >= 400) return reject(new Error(`GitHub ${res.statusCode}: ${data.slice(0, 200)}`));
          try { resolve(JSON.parse(data)); } catch (e) { reject(e); }
        });
      });
    req.on('error', reject);
    req.end();
  });
}

const DAY_MS = 86400000;
function ageDays(iso) { return iso ? (Date.parse(TODAY_ISO + 'T00:00:00Z') - Date.parse(iso)) / DAY_MS : 0; }

// Fetch the PRs for a label WITH the fields the intelligence layer needs. The
// search API gives state + merged_at cheaply; per-OPEN-PR we fetch details
// (additions, review state, checks) since only open PRs can be "blocked" and
// only they need the extra call. Merged PRs just need additions for weighting,
// pulled from the same detail call (bounded: few PRs per wave).
async function prsForLabel(label) {
  const q = encodeURIComponent(`repo:${REPO} is:pr label:"${label}"`);
  const out = await ghGet(`/search/issues?q=${q}&per_page=100`);
  const items = out.items || [];
  const prs = [];
  for (const it of items) {
    const merged = !!(it.pull_request && it.pull_request.merged_at);
    const open = it.state === 'open';
    let additions = 0, blockedOn = '', stuckDays = 0;
    try {
      const d = await ghGet(`/repos/${REPO}/pulls/${it.number}`);
      additions = (d.additions || 0) + (d.deletions || 0);   // total churn = effort proxy
      if (open) {
        const updated = d.updated_at;
        stuckDays = Math.round(ageDays(updated));
        // blocked-on, derived from GitHub state (no new data source):
        const reviews = await ghGet(`/repos/${REPO}/pulls/${it.number}/reviews`).catch(() => []);
        const lastByUser = {};
        (reviews || []).forEach((r) => { lastByUser[r.user && r.user.login] = r.state; });
        const states = Object.values(lastByUser);
        const changesReq = states.includes('CHANGES_REQUESTED');
        const reviewRequested = (d.requested_reviewers || []).length > 0;
        // checks: combined status on the head sha
        let checksFailing = false;
        if (d.head && d.head.sha) {
          const cs = await ghGet(`/repos/${REPO}/commits/${d.head.sha}/status`).catch(() => ({}));
          checksFailing = cs && cs.state === 'failure';
        }
        if (checksFailing) blockedOn = 'build';
        else if (changesReq) blockedOn = 'author';
        else if (reviewRequested || states.length === 0) blockedOn = 'reviewers';
        else blockedOn = '';
      }
    } catch (e) { /* detail fetch failed — fall back to count-only for this PR */ }
    prs.push({ number: it.number, title: it.title, merged, open, additions, blockedOn, stuckDays });
  }
  return prs;
}

function statusFor(pct, total) {
  if (total === 0) return 'Later';
  if (pct >= 100)  return 'Done';
  if (pct > 0)     return 'In Progress';
  return 'Next';
}

// #2 Health flag (orthogonal to progress): a wave is unhealthy if any open PR is
// stuck. red = stuck >10d OR changes-requested untouched OR build failing;
// amber = blocked on reviewers 3-10d; green = nothing stuck.
function healthFlagFor(prs) {
  const open = prs.filter((p) => p.open);
  let flag = 'green';
  const blockers = [];
  for (const p of open) {
    if (p.blockedOn === 'build' || (p.blockedOn === 'author') || p.stuckDays > 10) {
      flag = 'red'; blockers.push(`#${p.number} blocked on ${p.blockedOn || 'age'} (${p.stuckDays}d)`);
    } else if (p.blockedOn === 'reviewers' && p.stuckDays >= 3) {
      if (flag !== 'red') flag = 'amber';
      blockers.push(`#${p.number} awaiting review (${p.stuckDays}d)`);
    }
  }
  return { flag, blockers };
}

// Template narrative — facts only, no opinion.
function narrativeFor(waves, cover) {
  const done = waves.filter((w) => w.status === 'Done').length;
  const active = waves.filter((w) => w.status === 'In Progress').length;
  const unhealthy = waves.filter((w) => w.healthFlag && w.healthFlag !== 'green').length;
  const tail = unhealthy ? ` - ${unhealthy} wave(s) need attention.` : '';
  return `${cover.progress}% delivered across ${waves.length} waves - ` +
    `${done} done, ${active} in progress (weighted by change size).${tail}`;
}

async function computeShip() {
  const waves = [];
  let mergedChurn = 0, totalChurn = 0;
  for (const w of WAVES) {
    const prs = await prsForLabel(w.label);
    const m = prs.filter((p) => p.merged).length;
    const t = prs.length;
    // #1 PROGRESS = merged churn / total churn (effort-weighted), NOT PR count.
    // Falls back to count if churn data is unavailable (all zero).
    const wChurnMerged = prs.filter((p) => p.merged).reduce((s, p) => s + p.additions, 0);
    const wChurnTotal = prs.reduce((s, p) => s + p.additions, 0);
    mergedChurn += wChurnMerged; totalChurn += wChurnTotal;
    const pct = wChurnTotal > 0 ? Math.round((wChurnMerged / wChurnTotal) * 100)
      : (t === 0 ? 0 : Math.round((m / t) * 100));   // fallback: count-based
    const { flag, blockers } = healthFlagFor(prs);
    waves.push({
      name: w.name,
      status: statusFor(pct, t),
      percent: pct,
      healthFlag: flag,                               // #2 green/amber/red
      blockedOn: blockers.join('; '),                 // #2 whose move is it
      notes: `${m}/${t} PRs merged, ${Math.round(wChurnMerged / 1000)}k/${Math.round(wChurnTotal / 1000)}k lines.`,
      needs: blockers.length ? blockers[0] : '',
    });
  }
  // Overall progress = effort-weighted, not a mean of percentages.
  const progress = totalChurn > 0 ? Math.round((mergedChurn / totalChurn) * 100) : 0;
  const anyRed = waves.some((w) => w.healthFlag === 'red');
  const cover = {
    status: progress >= 100 ? 'Done' : (anyRed ? 'Needs input' : 'In Progress'),
    progress,                                         // #1 the effort-weighted number
    health: anyRed ? 'red' : (waves.some((w) => w.healthFlag === 'amber') ? 'amber' : 'green'),  // #2 flag, not %
    narrative: '',
  };
  cover.narrative = narrativeFor(waves, cover);
  return { date: TODAY_ISO, agent: 'exec-status-bot', cover, waves };
}

// --- POST to Apps Script, redirect-aware (Apps Script always 302s once) ------
// Delegates to the shared postShipTo() transport so live + selftest use the
// exact same redirect handling — no divergence.
function postShip(ship) {
  return postShipTo(ENDPOINT, ship);
}

// --- Self-test: prove compute + redirect-aware POST end-to-end -------------
// Spins a throwaway local server that mimics Apps Script exactly (a 302 to a
// second path that returns {"ok":true}), then runs the REAL postShip against
// it. Green here == the machine works, independent of the live endpoint's
// deployment state. Run with: node compute-exec-status.js --selftest
function selftest() {
  const http = require('http');
  return new Promise((resolve, reject) => {
    const server = http.createServer((req, res) => {
      let body = '';
      req.on('data', (c) => (body += c));
      req.on('end', () => {
        const port = server.address().port;
        if (req.url === '/exec') {
          // mimic Apps Script: 302 to the echo path, preserving nothing but Location
          res.writeHead(302, { Location: `http://127.0.0.1:${port}/echo` });
          return res.end();
        }
        if (req.url === '/echo') {
          // a real doPost would return its ContentService JSON here
          if (req.method !== 'POST') { res.writeHead(405); return res.end('method'); }
          const payload = JSON.parse(body);
          if (!payload.ship || typeof payload.ship.cover.progress !== 'number' ||
              typeof payload.ship.cover.health !== 'string') {
            res.writeHead(400); return res.end('bad payload');
          }
          res.writeHead(200, { 'Content-Type': 'application/json' });
          return res.end(JSON.stringify({ ok: true, rebuilt: true, date: payload.ship.date }));
        }
        res.writeHead(404); res.end();
      });
    });
    server.listen(0, '127.0.0.1', async () => {
      const port = server.address().port;
      const endpoint = `http://127.0.0.1:${port}/exec`;
      try {
        const ship = await computeShip();
        console.log('SELFTEST computed ship:\n', JSON.stringify(ship, null, 2));
        // Same transport the live path uses (postShip -> postShipTo), aimed at the mock.
        const res = await postShipTo(endpoint, ship);
        console.log('SELFTEST response:', JSON.stringify(res));
        if (!res.ok) throw new Error('selftest response not ok');
        console.log('SELFTEST PASS — compute + redirect-aware POST verified end-to-end.');
        server.close(); resolve();
      } catch (e) { server.close(); reject(e); }
    });
  });
}

// postShip parameterised by URL so both live + selftest share the SAME transport.
function postShipTo(url0, ship) {
  const body = JSON.stringify({ ship });
  const proto = url0.startsWith('https') ? require('https') : require('http');
  function doRequest(url) {
    return new Promise((resolve, reject) => {
      const u = new URL(url);
      const req = proto.request(
        { hostname: u.hostname, port: u.port || undefined, path: u.pathname + u.search, method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) } },
        (res) => {
          if (res.statusCode === 301 || res.statusCode === 302) {
            const loc = res.headers.location;
            if (!loc) return reject(new Error('Redirect with no Location header'));
            res.resume();
            return doRequest(loc).then(resolve).catch(reject);
          }
          let data = '';
          res.on('data', (c) => (data += c));
          res.on('end', () => {
            if (res.statusCode === 405) return reject(new Error('405 — check Apps Script deployment settings'));
            if (res.statusCode >= 400) return reject(new Error(`SHIP failed ${res.statusCode}: ${data}`));
            const parsed = JSON.parse(data);
            if (!parsed.ok) return reject(new Error(`SHIP returned ok:false — ${parsed.error}`));
            resolve(parsed);
          });
        }
      );
      req.on('error', reject);
      req.write(body);
      req.end();
    });
  }
  return doRequest(url0);
}

(async () => {
  if (process.argv.includes('--selftest')) {
    try { await selftest(); process.exit(0); }
    catch (e) { console.error('SELFTEST FAIL:', e.message); process.exit(1); }
  }
  // Compute is REQUIRED to succeed (a failure here is a real code/API bug).
  let ship;
  try {
    ship = await computeShip();
  } catch (err) {
    console.error('exec-status COMPUTE failed (hard error):', err.message);
    process.exit(1);
  }
  console.log('Computed ship:\n', JSON.stringify(ship, null, 2));

  // The live POST is BEST-EFFORT. The Apps Script doPost is a server-side
  // prerequisite outside this repo's control; while it is undeployed the
  // endpoint returns 405. That is a known-pending state, NOT a code defect, so
  // it must not fail the run forever (a permanently-red job is ignored noise).
  // The real result is always logged. Set EXEC_REQUIRE_POST=1 to make a failed
  // POST hard-fail the job once the endpoint is expected to be live.
  try {
    const res = await postShip(ship);
    console.log('SHIP live POST ok:', JSON.stringify(res));
  } catch (err) {
    console.warn('SHIP live POST did not succeed:', err.message);
    console.warn('  (endpoint prerequisite: doPost must be deployed as a public Web App.)');
    if (process.env.EXEC_REQUIRE_POST === '1') process.exit(1);
  }
})();
