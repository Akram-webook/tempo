#!/usr/bin/env node
/* ============================================================
 * compute-exec-status.js — DERIVE exec status from real PR data
 * ------------------------------------------------------------
 * Runs in GitHub Actions on every merge to main (and daily 7am UTC).
 * It does NOT let anyone assert a health number: health is computed
 * as merged PRs / total PRs per wave, from the GitHub API. Narrative
 * is built from a template over those facts, never free prose.
 *
 *   health(wave) = round( mergedPRs / totalPRs * 100 )   (0 if none)
 *   cover.health = round( sum(merged) / sum(total) * 100 ) across waves
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

// Search PRs by label. Returns [{merged:bool}] for the health math.
async function prsForLabel(label) {
  const q = encodeURIComponent(`repo:${REPO} is:pr label:"${label}"`);
  const out = await ghGet(`/search/issues?q=${q}&per_page=100`);
  const items = out.items || [];
  // is:pr search returns issues; "merged" is not on the search item, so a PR
  // counts as delivered when it is closed AND has a merged_at (fetched cheaply
  // via pull_request.merged_at when present, else treat closed as merged=false).
  return items.map((it) => ({
    merged: !!(it.pull_request && it.pull_request.merged_at),
    closed: it.state === 'closed',
  }));
}

function statusFor(pct, total) {
  if (total === 0) return 'Later';
  if (pct >= 100)  return 'Done';
  if (pct > 0)     return 'In Progress';
  return 'Next';
}

// Template narrative — facts only, no opinion.
function narrativeFor(waves, cover) {
  const done = waves.filter((w) => w.status === 'Done').length;
  const active = waves.filter((w) => w.status === 'In Progress').length;
  return `${cover.health}% delivered across ${waves.length} waves — ` +
    `${done} done, ${active} in progress (computed from merged PRs).`;
}

async function computeShip() {
  const waves = [];
  let merged = 0, total = 0;
  for (const w of WAVES) {
    const prs = await prsForLabel(w.label);
    const m = prs.filter((p) => p.merged).length;
    const t = prs.length;
    merged += m; total += t;
    const pct = t === 0 ? 0 : Math.round((m / t) * 100);
    waves.push({
      name: w.name,
      status: statusFor(pct, t),
      percent: pct,
      notes: `${m}/${t} PRs merged (${w.label}).`,
      needs: '',
    });
  }
  const health = total === 0 ? 0 : Math.round((merged / total) * 100);
  const cover = { status: health >= 100 ? 'Done' : 'In Progress', health, narrative: '' };
  cover.narrative = narrativeFor(waves, cover);
  return { date: today_(), agent: 'exec-status-bot', cover, waves };
}

// --- POST to Apps Script, redirect-aware (Apps Script always 302s once) ------
function postShip(ship) {
  const body = JSON.stringify({ ship });
  function doRequest(url) {
    return new Promise((resolve, reject) => {
      const u = new URL(url);
      const req = https.request(
        { hostname: u.hostname, path: u.pathname + u.search, method: 'POST',
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
  return doRequest(ENDPOINT);
}

(async () => {
  try {
    const ship = await computeShip();
    console.log('Computed ship:', JSON.stringify(ship, null, 2));
    const res = await postShip(ship);
    console.log('SHIP ok:', JSON.stringify(res));
  } catch (err) {
    console.error('exec-status compute/post failed:', err.message);
    process.exit(1);
  }
})();
