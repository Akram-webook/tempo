#!/usr/bin/env node
/* ---------------------------------------------------------------------------
 * Tempo LOCAL SYSTEM server (no framework, no external deps - pure Node http).
 *
 * WHAT IT IS
 *   A tiny on-your-machine server so Tempo runs as a real local app instead of
 *   a static file:// page. It serves the built app AND accepts feedback (with
 *   images) - saving them as REAL FILES on disk so nothing lives only in the
 *   browser and nothing is lost when the browser is cleared.
 *
 *     * Serves dist/index.html + dist/chart.html + /src + /data statically.
 *     * POST /api/feedback  -> appends full records to data/feedback.json,
 *       writing each attached image as a real file under data/feedback-images/
 *       and rewriting the record's `image` to a served URL (/data/feedback-images/..).
 *     * The Project delivery page then fetches data/feedback.json as usual and
 *       shows the thumbnail from the saved file - identical to the live path,
 *       just backed by local disk instead of a remote warehouse.
 *
 * WHY THIS SHAPE
 *   This is the exact seam we swap for a real server (Supabase) at go-live:
 *   the client just POSTs feedback to an endpoint; only the endpoint URL and
 *   the storage behind it change. Nothing in the UI has to change.
 *
 * RUN
 *   npm run local            # builds dist, then serves http://localhost:4000
 *   node tools/local-server.js --port 4000 --no-build
 *
 * SAFETY
 *   Local only. Binds 127.0.0.1 by default. No secrets, no network calls out.
 * ------------------------------------------------------------------------- */
'use strict';

const http = require('http');
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const ROOT = path.join(__dirname, '..');
const DATA_DIR = path.join(ROOT, 'data');
const FEEDBACK_FILE = path.join(DATA_DIR, 'feedback.json');
const IMG_DIR = path.join(DATA_DIR, 'feedback-images');

/* ---- args ---- */
const argv = process.argv.slice(2);
function argVal(flag, def) {
  const i = argv.indexOf(flag);
  return i !== -1 && argv[i + 1] ? argv[i + 1] : def;
}
const PORT = parseInt(argVal('--port', process.env.PORT || '4000'), 10);
const HOST = argVal('--host', '127.0.0.1');
const NO_BUILD = argv.includes('--no-build');
const MAX_BODY = 12 * 1024 * 1024; // 12MB - one downscaled screenshot is well under this

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.map': 'application/json',
};

function log(msg) { process.stdout.write('[local] ' + msg + '\n'); }

function ensureDirs() {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
  if (!fs.existsSync(IMG_DIR)) fs.mkdirSync(IMG_DIR, { recursive: true });
}

function readFeedback() {
  try {
    const raw = fs.readFileSync(FEEDBACK_FILE, 'utf8');
    const j = JSON.parse(raw);
    if (!j || !Array.isArray(j.items)) return { generated: '', items: [] };
    return j;
  } catch (e) {
    return { generated: '', items: [] };
  }
}

function writeFeedback(model) {
  const tmp = FEEDBACK_FILE + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(model, null, 2) + '\n', 'utf8');
  fs.renameSync(tmp, FEEDBACK_FILE); // atomic-ish rename so a crash never truncates the file
}

/* A monotonic-ish id without Date.now() collisions across a batch. */
function makeId(seq) {
  return 'local-' + seq + '-' + Math.floor(Math.random() * 1e6).toString(36);
}

/* data:image/png;base64,AAAA...  ->  { ext, buffer }  (null if not a data URL) */
function decodeDataUrl(dataUrl) {
  if (typeof dataUrl !== 'string') return null;
  const m = /^data:(image\/(png|jpeg|jpg|gif|webp));base64,([A-Za-z0-9+/=]+)$/.exec(dataUrl.trim());
  if (!m) return null;
  const ext = m[2] === 'jpeg' ? 'jpg' : m[2];
  let buf;
  try { buf = Buffer.from(m[3], 'base64'); } catch (e) { return null; }
  if (!buf.length) return null;
  return { ext: ext, buffer: buf };
}

/* Persist one feedback record. Turns an inline data-URL image into a real file
 * and rewrites `image` to the served path, so the app shows it like any URL. */
function persistRecord(rec, seq, stamp) {
  const id = makeId(seq);
  const out = Object.assign({}, rec, {
    id: id,
    submittedAt: rec.submittedAt || stamp,
    status: rec.status || 'New',
    savedLocal: true,
  });
  const decoded = decodeDataUrl(rec.image);
  if (decoded) {
    const fname = id + '.' + decoded.ext;
    fs.writeFileSync(path.join(IMG_DIR, fname), decoded.buffer);
    out.image = 'data/feedback-images/' + fname; // served path, relative to app root
  } else if (typeof rec.image !== 'string' || !rec.image) {
    out.image = null;
  }
  return out;
}

/* ---- static file serving (path-traversal safe) ---- */
function safeJoin(base, urlPath) {
  const clean = decodeURIComponent(urlPath.split('?')[0].split('#')[0]);
  const target = path.normalize(path.join(base, clean));
  if (target !== base && !target.startsWith(base + path.sep)) return null; // escape guard
  return target;
}

function serveStatic(req, res) {
  let urlPath = req.url.split('?')[0];
  if (urlPath === '/' || urlPath === '') urlPath = '/dist/index.html';
  // Bare app entry: map /index.html and /chart.html to the built bundle.
  if (urlPath === '/index.html') urlPath = '/dist/index.html';
  if (urlPath === '/chart.html') urlPath = '/dist/chart.html';

  const file = safeJoin(ROOT, urlPath);
  if (!file) { res.writeHead(403); res.end('forbidden'); return; }

  fs.stat(file, (err, st) => {
    if (err || !st.isFile()) { res.writeHead(404); res.end('not found'); return; }
    const ext = path.extname(file).toLowerCase();
    const mime = MIME[ext] || 'application/octet-stream';
    // Never cache data/ or the bundle while developing locally.
    res.writeHead(200, { 'Content-Type': mime, 'Cache-Control': 'no-store' });
    fs.createReadStream(file).pipe(res);
  });
}

/* ---- POST /api/feedback ---- */
function handleFeedback(req, res) {
  let size = 0;
  const chunks = [];
  let aborted = false;
  req.on('data', (c) => {
    size += c.length;
    if (size > MAX_BODY) {
      aborted = true;
      res.writeHead(413, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ ok: false, error: 'payload too large' }));
      req.destroy();
      return;
    }
    chunks.push(c);
  });
  req.on('end', () => {
    if (aborted) return;
    let body;
    try { body = JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}'); }
    catch (e) {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ ok: false, error: 'bad json' }));
      return;
    }
    const records = Array.isArray(body.items) ? body.items
      : (body.item ? [body.item] : []);
    if (!records.length) {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ ok: false, error: 'no items' }));
      return;
    }
    try {
      ensureDirs();
      const model = readFeedback();
      const stamp = new Date().toISOString();
      const base = model.items.length;
      const saved = records.map((r, i) => persistRecord(r, base + i + 1, stamp));
      model.items = model.items.concat(saved);
      model.generated = stamp;
      writeFeedback(model);
      log('saved ' + saved.length + ' feedback item(s), '
        + saved.filter((s) => s.image).length + ' with image -> ' + FEEDBACK_FILE);
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ ok: true, saved: saved.length, items: saved }));
    } catch (e) {
      log('ERROR saving feedback: ' + e.message);
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ ok: false, error: 'write failed' }));
    }
  });
}

/* ---- router ---- */
const server = http.createServer((req, res) => {
  // CORS for local dev convenience (same-origin in practice; harmless locally).
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') { res.writeHead(204); res.end(); return; }

  if (req.method === 'GET' && req.url.split('?')[0] === '/api/health') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ ok: true, service: 'tempo-local', items: readFeedback().items.length }));
    return;
  }
  if (req.method === 'POST' && req.url.split('?')[0] === '/api/feedback') {
    handleFeedback(req, res);
    return;
  }
  if (req.method === 'GET') { serveStatic(req, res); return; }

  res.writeHead(405); res.end('method not allowed');
});

/* ---- boot ---- */
function build() {
  if (NO_BUILD) return;
  log('building dist/ ...');
  execFileSync('node', ['build.js'], { cwd: ROOT, stdio: 'inherit' });
}

if (require.main === module) {
  ensureDirs();
  build();
  server.listen(PORT, HOST, () => {
    log('Tempo local system running');
    log('  open   ->  http://' + (HOST === '0.0.0.0' ? 'localhost' : HOST) + ':' + PORT + '/');
    log('  data   ->  ' + FEEDBACK_FILE);
    log('  images ->  ' + IMG_DIR + '/');
    log('Feedback (with images) is saved to real files on disk. Ctrl+C to stop.');
  });
}

module.exports = { decodeDataUrl, persistRecord, readFeedback, writeFeedback, safeJoin };
