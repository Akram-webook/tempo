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
const GEN_TS = Date.now();    // one stable generation timestamp per run

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
    prs.push({
      number: it.number, title: it.title, merged, open, additions, blockedOn, stuckDays,
      mergedAt: (it.pull_request && it.pull_request.merged_at) || null,
      createdAt: it.created_at || null,
    });
  }
  return prs;
}

// Coarse item type inferred from the PR title (no new data source). Feature is
// the default so anything not clearly a fix/cleanup reads as delivered scope.
function inferType(title) {
  const t = (title || '').toLowerCase();
  if (/fix|bug|repair|broken|crash|error|revert/.test(t)) return 'Bug';
  if (/improv|polish|refactor|clean|perf|optim|simplif/.test(t)) return 'Improvement';
  return 'Feature';
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
  const unhealthy = waves.filter((w) => w.health && w.health !== 'green').length;
  const tail = unhealthy ? ` - ${unhealthy} wave(s) need attention.` : '';
  return `${cover.progress}% delivered across ${waves.length} waves - ` +
    `${done} done, ${active} in progress (weighted by change size).${tail}`;
}

async function computeShip() {
  const waves = [];
  const wavesPrs = [];   // keep each wave's PRs so we can build timeline items below
  let mergedChurn = 0, totalChurn = 0;
  for (const w of WAVES) {
    const prs = await prsForLabel(w.label);
    wavesPrs.push({ wave: w, prs });
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
    const openPRs = prs.filter((p) => p.open).map((p) => ({
      number: p.number, title: p.title,
      blockedOn: p.blockedOn || null,
      daysSinceActivity: p.stuckDays,
    }));
    waves.push({
      name: w.name,
      label: w.label,
      status: statusFor(pct, t),
      progress: pct,
      health: flag,                                   // #2 green/amber/red
      openPRs: openPRs,
      notes: `${m}/${t} PRs merged, ${Math.round(wChurnMerged / 1000)}k/${Math.round(wChurnTotal / 1000)}k lines.` +
        (blockers.length ? ' ' + blockers[0] + '.' : ''),
    });
  }
  // Overall progress = effort-weighted, not a mean of percentages.
  const progress = totalChurn > 0 ? Math.round((mergedChurn / totalChurn) * 100) : 0;
  const anyRed = waves.some((w) => w.health === 'red');
  const cover = {
    status: progress >= 100 ? 'Done' : (anyRed ? 'Needs input' : 'In Progress'),
    progress,                                         // #1 the effort-weighted number
    health: anyRed ? 'red' : (waves.some((w) => w.health === 'amber') ? 'amber' : 'green'),  // #2 flag, not %
    narrative: '',
  };
  cover.narrative = narrativeFor(waves, cover);
  // needsYou = one line per unhealthy wave (whose move it is).
  const needsYou = waves
    .filter((w) => w.health !== 'green' && w.openPRs.length)
    .map((w) => `${w.name}: ${w.notes}`);

  // Timeline items - one per PR across all waves. status = merged->Done else
  // Working; type inferred from the title; ts = merged or created. Newest first.
  const SHORT = {
    'Executive Status Deck': 'Exec Deck',
    'Capacity Engine': 'Capacity',
    'Real Data Go-live': 'Real Data',
    'Slack Integration': 'Slack',
  };
  const items = [];
  for (const { wave, prs } of wavesPrs) {
    const area = SHORT[wave.name] || wave.name;
    for (const pr of prs) {
      const ts = pr.mergedAt || pr.createdAt;
      if (!ts) continue;
      items.push({
        id: `pr-${pr.number}`,
        area,
        title: pr.title,
        status: pr.merged ? 'Done' : 'Working',
        type: inferType(pr.title),
        ts,
      });
    }
  }
  items.sort((a, b) => Date.parse(b.ts) - Date.parse(a.ts));

  return { generated: new Date(GEN_TS).toISOString(), cover, waves, needsYou, items };
}

/*═══════════════════ GITHUB WAREHOUSE (replaces Apps Script) ═══════════════════
 * Data lives IN the repo: data/exec-status.json (the warehouse, git = audit log)
 * + src/status.html (the shareable report, replaces Slides). Both are committed
 * via the GitHub Contents API using the built-in GITHUB_TOKEN. No Google, no
 * JSONP, no external secret. GitHub Pages then serves them with no auth/CORS. */

function ghApi(method, path, token, bodyObj) {
  const body = bodyObj ? JSON.stringify(bodyObj) : null;
  return new Promise((resolve, reject) => {
    const req = https.request(
      { hostname: 'api.github.com', path, method,
        headers: {
          'User-Agent': 'tempo-exec-status',
          'Accept': 'application/vnd.github+json',
          'Authorization': 'token ' + token,
          ...(body ? { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) } : {}),
        } },
      (res) => {
        let data = '';
        res.on('data', (c) => (data += c));
        res.on('end', () => {
          if (res.statusCode === 404) return resolve(null);          // missing file → null (first run)
          if (res.statusCode >= 400) return reject(new Error(`GitHub ${method} ${path} → ${res.statusCode}: ${data.slice(0, 200)}`));
          try { resolve(data ? JSON.parse(data) : {}); } catch (e) { reject(e); }
        });
      });
    req.on('error', reject);
    if (body) req.write(body);
    req.end();
  });
}
const b64 = (s) => Buffer.from(s, 'utf8').toString('base64');

// Commit a file to the repo (create or update). Returns the new content SHA.
async function commitFile(repo, token, filePath, contentStr, message) {
  const existing = await ghApi('GET', `/repos/${repo}/contents/${filePath}`, token);
  const sha = existing && existing.sha ? existing.sha : undefined;
  const res = await ghApi('PUT', `/repos/${repo}/contents/${filePath}`, token, {
    message, content: b64(contentStr), ...(sha ? { sha } : {}),
  });
  return res && res.content ? res.content.sha : null;
}

// Read the current warehouse JSON from the repo (for history append). null if absent.
async function readStatusJson(repo, token) {
  const existing = await ghApi('GET', `/repos/${repo}/contents/data/exec-status.json`, token);
  if (!existing || !existing.content) return null;
  try { return JSON.parse(Buffer.from(existing.content, 'base64').toString('utf8')); }
  catch (e) { return null; }
}

// Append one history entry, keep the last 30, newest last.
function appendHistory(prev, status) {
  const hist = (prev && Array.isArray(prev.history)) ? prev.history.slice() : [];
  hist.push({ ts: status.generated, progress: status.cover.progress, health: status.cover.health });
  return hist.slice(-30);
}

// Apply optional manual overrides from workflow_dispatch inputs (Option B).
function applyOverrides(status) {
  const nar = (process.env.OVERRIDE_NARRATIVE || '').trim();
  if (nar) status.cover.narrative = nar;
  const notesRaw = (process.env.OVERRIDE_WAVE_NOTES || '').trim();
  if (notesRaw) {
    try {
      const map = JSON.parse(notesRaw);
      status.waves.forEach((w) => { if (map[w.name]) w.notes = String(map[w.name]); });
    } catch (e) { console.warn('OVERRIDE_WAVE_NOTES not valid JSON — ignored:', e.message); }
  }
  const ny = (process.env.OVERRIDE_NEEDSYOU || '').trim();
  if (ny) status.needsYou = ny.split(',').map((s) => s.trim()).filter(Boolean);
  return status;
}

/*───────────────────────── status.html (replaces Slides) ─────────────────────
 * Self-contained leadership brief: data BAKED IN (no fetch at view time), WBK
 * design, print/PDF button, prominent freshness stamp. Works offline. */
function esc(s) {
  return String(s == null ? '' : s).replace(/[&<>"]/g, (c) =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
}
function healthDot(h) {
  const c = h === 'red' ? '#ef4444' : h === 'amber' ? '#f59e0b' : '#22c55e';
  return `<svg width="10" height="10" viewBox="0 0 10 10" aria-hidden="true"><circle cx="5" cy="5" r="5" fill="${c}"/></svg>`;
}
function renderStatusHtml(status) {
  const c = status.cover;
  const gen = status.generated ? new Date(status.generated) : null;
  const genStr = gen ? gen.toISOString().replace('T', ' ').slice(0, 16) + ' UTC' : 'not yet run';
  const waveRows = (status.waves || []).map((w) => `
      <tr>
        <td class="wn">${esc(w.name)}</td>
        <td>${esc(w.status)}</td>
        <td class="num">${esc(w.progress)}%
          <span class="bar"><span style="width:${Math.max(0, Math.min(100, +w.progress || 0))}%"></span></span>
        </td>
        <td class="hc">${healthDot(w.health)} ${esc(w.health)}</td>
        <td class="notes">${esc(w.notes || '')}</td>
      </tr>`).join('');
  const needs = (status.needsYou || []).length
    ? `<ul>${status.needsYou.map((n) => `<li>${esc(n)}</li>`).join('')}</ul>`
    : `<p class="clear">Nothing needs you right now.</p>`;
  return `<!doctype html><html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Tembo - Project Delivery</title>
<style>
  :root{--pink:#ff2c79;--bg:#09090b;--l2:#27272a;--fg:#e4e4e7;--fg2:#a1a1aa;--bd:rgba(255,255,255,.10);--g:#22c55e;--a:#f59e0b;--r:#ef4444}
  *{box-sizing:border-box}
  body{margin:0;background:var(--bg);color:var(--fg);font-family:Figtree,system-ui,sans-serif;line-height:1.5;padding:32px}
  .wrap{max-width:900px;margin:0 auto}
  .eyebrow{color:var(--pink);font-weight:600;font-size:12px;letter-spacing:.08em;text-transform:uppercase}
  h1{font-family:Gellix,Figtree,sans-serif;font-size:30px;margin:6px 0 2px}
  .gen{color:var(--fg2);font-size:13px}
  .cover{background:var(--l2);border:1px solid var(--bd);border-radius:8px;padding:20px;margin:18px 0}
  .cover .big{font-size:40px;font-weight:700;color:var(--pink)}
  .cover .nar{color:var(--fg2);margin-top:6px}
  table{width:100%;border-collapse:collapse;margin-top:8px}
  th,td{text-align:left;padding:10px 8px;border-bottom:1px solid var(--bd);vertical-align:top;font-size:14px}
  th{color:var(--fg2);font-size:12px;text-transform:uppercase;letter-spacing:.04em}
  .wn{font-weight:600}
  .num{white-space:nowrap}
  .bar{display:inline-block;width:80px;height:6px;border-radius:4px;background:var(--l2);vertical-align:middle;margin-inline-start:6px;overflow:hidden}
  .bar span{display:block;height:100%;background:var(--pink)}
  .hc{white-space:nowrap;text-transform:capitalize}
  .notes{color:var(--fg2)}
  h2{font-size:16px;margin:24px 0 4px}
  .clear{color:var(--g)}
  .actions{margin:18px 0}
  button{background:var(--pink);color:#fff;border:0;border-radius:8px;padding:10px 16px;font:inherit;font-weight:600;cursor:pointer}
  @media print{body{background:#fff;color:#111}.actions{display:none}.cover{background:#f6f6f7}.cover .big,.eyebrow{color:#c81e63}}
</style></head><body><div class="wrap">
  <div class="eyebrow">WEBOOK · TEMBO - PROJECT DELIVERY</div>
  <h1>Project delivery</h1>
  <div class="gen">Generated ${esc(genStr)} · computed from merged PRs</div>
  <div class="actions"><button onclick="window.print()">Print / Export PDF</button></div>
  <div class="cover">
    <div class="big">${esc(c.progress)}% delivered</div>
    <div>${healthDot(c.health)} ${esc(c.status)}</div>
    <div class="nar">${esc(c.narrative)}</div>
  </div>
  <h2>Waves</h2>
  <table><thead><tr><th>Wave</th><th>Status</th><th>Progress</th><th>Health</th><th>Notes</th></tr></thead>
  <tbody>${waveRows || '<tr><td colspan="5" class="notes">No waves yet.</td></tr>'}</tbody></table>
  <h2>What needs you</h2>
  ${needs}
</div></body></html>`;
}

// --- Self-test: prove compute + history + commit shape against a MOCK GitHub API.
function selftest() {
  const http = require('http');
  const files = {};   // in-memory "repo"
  return new Promise((resolve, reject) => {
    const server = http.createServer((req, res) => {
      let body = ''; req.on('data', (c) => (body += c));
      req.on('end', () => {
        const m = req.url.match(/\/repos\/[^/]+\/[^/]+\/contents\/(.+)$/);
        const key = m ? decodeURIComponent(m[1]) : null;
        if (req.method === 'GET') {
          if (key && files[key]) { res.writeHead(200, { 'Content-Type': 'application/json' });
            return res.end(JSON.stringify({ sha: 'sha_' + key, content: Buffer.from(files[key]).toString('base64') })); }
          res.writeHead(404); return res.end('{}');
        }
        if (req.method === 'PUT') {
          const p = JSON.parse(body);
          files[key] = Buffer.from(p.content, 'base64').toString('utf8');
          res.writeHead(200, { 'Content-Type': 'application/json' });
          return res.end(JSON.stringify({ content: { sha: 'newsha_' + key } }));
        }
        res.writeHead(400); res.end();
      });
    });
    server.listen(0, '127.0.0.1', async () => {
      const port = server.address().port;
      const realRequest = https.request;
      try {
        // Compute FIRST against the real GitHub API (before the shim redirects it).
        const status = await computeShip();
        // Now redirect only the commit/read (contents API) calls to the mock repo.
        https.request = function (opts, cb) { opts.hostname = '127.0.0.1'; opts.port = port; opts.protocol = 'http:';
          return http.request(opts, cb); };
        const prev = await readStatusJson('x/y', 'tok');   // null first
        status.history = appendHistory(prev, status);
        const html = renderStatusHtml(status);
        if (!/Print \/ Export PDF/.test(html)) throw new Error('status.html missing print button');
        if (typeof status.cover.progress !== 'number' || typeof status.cover.health !== 'string')
          throw new Error('bad status shape');
        await commitFile('x/y', 'tok', 'data/exec-status.json', JSON.stringify(status, null, 2), 'test json');
        await commitFile('x/y', 'tok', 'src/status.html', html, 'test html');
        // second run appends a 2nd history entry
        const prev2 = await readStatusJson('x/y', 'tok');
        const h2 = appendHistory(prev2, status);
        if (h2.length !== 2) throw new Error('history did not append on 2nd run (got ' + h2.length + ')');
        https.request = realRequest;
        console.log('SELFTEST computed status:\n', JSON.stringify(status, null, 2).slice(0, 600));
        console.log('SELFTEST PASS - compute + history append + commit (json+html) verified against mock GitHub API.');
        server.close(); resolve();
      } catch (e) { https.request = realRequest; server.close(); reject(e); }
    });
  });
}

(async () => {
  if (process.argv.includes('--selftest')) {
    try { await selftest(); process.exit(0); }
    catch (e) { console.error('SELFTEST FAIL:', e.message); process.exit(1); }
  }
  // Compute is REQUIRED (a failure here is a real code/API bug).
  let status;
  try { status = await computeShip(); }
  catch (err) { console.error('exec-status COMPUTE failed:', err.message); process.exit(1); }
  status = applyOverrides(status);

  const repo = process.env.GITHUB_REPOSITORY || REPO;
  const token = TOKEN;
  if (!token) { console.error('No GITHUB_TOKEN - cannot commit.'); if (process.env.EXEC_REQUIRE_COMMIT === '1') process.exit(1); return; }

  try {
    const prev = await readStatusJson(repo, token);
    status.history = appendHistory(prev, status);
    const json = JSON.stringify(status, null, 2);
    const html = renderStatusHtml(status);
    console.log('Computed status:\n', json.slice(0, 800));
    const stamp = new Date(GEN_TS).toISOString().slice(0, 16);
    await commitFile(repo, token, 'data/exec-status.json', json, `chore: exec-status update [${stamp}]`);
    await commitFile(repo, token, 'src/status.html', html, `chore: status report update [${stamp}]`);
    console.log('Committed data/exec-status.json and src/status.html to', repo, '(history:', status.history.length, 'entries)');
  } catch (err) {
    console.error('COMMIT failed:', err.message);
    if (process.env.EXEC_REQUIRE_COMMIT === '1') process.exit(1);
  }
})();
