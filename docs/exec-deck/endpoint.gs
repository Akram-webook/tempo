/*───────────────────────────────────────────────────────────────────────────
  Tempo — Executive Status ENDPOINT  (Apps Script Web App)
  ---------------------------------------------------------------------------
  ONE Web App that does BOTH directions for the "Tempo — Feedback (Live)" sheet:

    • doGet(e)  → serves the JSON the in-app Executive Status page reads
                  (WP.config.execStatusEndpoint). JSONP-aware (?callback=).
    • doPost(e) → APPENDS an idea/feedback/feature row to the sheet, so a new
                  idea flows: POST → row → deck rebuilds (onEditRebuild_ in
                  Code.gs) → in-app page reads it live. Zero human step.

  This is the piece that makes the pipeline fully automatic. The deck build
  (Code.gs) is a SEPARATE script bound to the same sheet; it rebuilds on edit,
  so appending a row here triggers it with no extra wiring.

  ── DEPLOY (once) ──────────────────────────────────────────────────────────
    1. Same Apps Script project as Code.gs (or a new one). Paste this file.
    2. Set WRITE_TOKEN below to a long random string (also put it in the sender).
    3. Deploy → New deployment → type "Web app":
         Execute as:  Me
         Who has access:  Anyone   (needed for the site's anonymous GET + POST)
    4. Copy the /exec URL → it is WP.config.execStatusEndpoint (already set if
       you're replacing the old GET-only script — the URL changes, so update
       src/js/core/config.js and redeploy the site if so).
    5. Because "Who has access = Anyone", the WRITE_TOKEN is what protects
       writes. GET is read-only + already-public sheet data, so it needs none.

  SAFE: only ever reads / appends to the sheet. Never deletes, never touches the
  Tempo app or repo. A bad field can't abort — everything is wrapped.
───────────────────────────────────────────────────────────────────────────*/

var SHEET_ID    = '11I0m0piaDVDpdP0buz7U4VgjW5TJ-_s6ale8Wcxxz9A';
var WRITE_TOKEN = 'CHANGE_ME_to_a_long_random_string';   // ← set + mirror in the sender

// Tab + header-row map (must match Code.gs CONFIG.TABS).
var T = {
  feedback: { name: 'Feedback', header: 3 },  // # · Date · Area/Page · Type · Feedback/Note · Priority · Status · Owner
  features: { name: 'Features', header: 1 },  // Area · Feature · What it does · Status · Reviewed
  waves:    { name: 'Waves',    header: 1 }
};

/*═══════════════════════════ READ (site reads this) ═══════════════════════*/
function doGet(e) {
  var payload;
  try { payload = buildPayload_(); }
  catch (err) { payload = { ok: false, error: String(err && err.message || err) }; }
  return respond_(e, payload);
}

/** Shape the JSON the in-app page (src/js/ui/exec.js) expects:
    { ok, generatedAt, cover:{done,next,later,total,pct}, requests:[{date,area,note,status,priority}], features:[...] } */
function buildPayload_() {
  var ss = SpreadsheetApp.openById(SHEET_ID);

  var fb = readTab_(ss, T.feedback).map(function (r) {
    return {
      date:     asIso_(pick_(r, ['Date'])),
      area:     str_(pick_(r, ['Area/Page', 'Area'])),
      type:     str_(pick_(r, ['Type'])),
      note:     str_(pick_(r, ['Feedback/Note', 'Feedback', 'Note'])),
      priority: str_(pick_(r, ['Priority'])),
      status:   str_(pick_(r, ['Status'])),
      owner:    str_(pick_(r, ['Owner']))
    };
  }).filter(function (r) { return r.note; });

  var feats = readTab_(ss, T.features).map(function (r) {
    return {
      area:    str_(pick_(r, ['Area'])),
      feature: str_(pick_(r, ['Feature'])),
      note:    str_(pick_(r, ['What it does', 'Whatitdoes'])),
      status:  str_(pick_(r, ['Status'])),
      date:    asIso_(pick_(r, ['Date', 'Reviewed']))
    };
  }).filter(function (r) { return r.feature; });

  // cover rollup from Waves (matches the deck's cover math)
  var done = 0, next = 0, later = 0, waves = readTab_(ss, T.waves);
  waves.forEach(function (w) {
    var k = statusColorKey_(str_(pick_(w, ['Status'])));
    if (k === 'green') done++; else if (k === 'amber') next++; else later++;
  });
  var total = waves.length;
  var pct = total ? Math.round(done / total * 100) : 0;

  return {
    ok: true,
    generatedAt: new Date().toISOString(),
    cover: { done: done, next: next, later: later, total: total, pct: pct },
    requests: fb,
    features: feats
  };
}

/*═══════════════════════════ WRITE (I POST ideas here) ════════════════════*/
/* Body (JSON or form param `payload`):
     { token, tab:'feedback'|'features',
       // feedback: date, area, type, note, priority, status, owner
       // features: area, feature, note (what it does), status, date
       ... }
   Appends ONE row, mapping fields to the tab's real header columns by name. */
function doPost(e) {
  var res;
  try {
    var body = parseBody_(e);
    if (body.token !== WRITE_TOKEN) throw new Error('unauthorized');
    var tab = String(body.tab || 'feedback').toLowerCase();
    if (tab !== 'feedback' && tab !== 'features') throw new Error('bad tab: ' + tab);
    var row = appendRow_(tab, body);
    res = { ok: true, tab: tab, row: row };
  } catch (err) {
    res = { ok: false, error: String(err && err.message || err) };
  }
  return respond_(e, res);
}

function appendRow_(tabKey, body) {
  var ss = SpreadsheetApp.openById(SHEET_ID);
  var spec = T[tabKey];
  var sh = ss.getSheetByName(spec.name);
  if (!sh) throw new Error('missing tab: ' + spec.name);

  var headers = sh.getRange(spec.header, 1, 1, sh.getLastColumn()).getValues()[0]
    .map(function (h) { return String(h || '').trim(); });

  // Field → candidate header names (tolerant, matches Code.gs pick_ normalization).
  var map = (tabKey === 'feedback')
    ? {
        '#':            autoId_(sh, spec, headers),
        'Date':         body.date || today_(),
        'Area/Page':    body.area || '',
        'Type':         body.type || 'Feature',
        'Feedback/Note':body.note || '',
        'Priority':     (body.priority || 'MEDIUM'),
        'Status':       body.status || 'Later',
        'Owner':        body.owner || 'Akram'
      }
    : {
        'Area':         body.area || '',
        'Feature':      body.feature || '',
        'What it does': body.note || '',
        'Status':       body.status || 'Next',
        'Reviewed':     body.date || today_()   // Features tab has 'Reviewed', use it for date
      };

  var out = headers.map(function (h) { return valueForHeader_(map, h); });
  // append after the last data row (below header)
  sh.appendRow(out);
  return out;
}

/* Match a header cell to a map key by normalized name (letters only, lowercased). */
function valueForHeader_(map, header) {
  var want = norm_(header);
  var keys = Object.keys(map);
  for (var i = 0; i < keys.length; i++) if (norm_(keys[i]) === want) return map[keys[i]];
  return '';
}

/* Next sequential # for the Feedback tab (max existing + 1). */
function autoId_(sh, spec, headers) {
  try {
    var idCol = -1;
    headers.forEach(function (h, i) { if (norm_(h) === norm_('#') || norm_(h) === 'no' || norm_(h) === 'id') idCol = i; });
    if (idCol < 0) return '';
    var last = sh.getLastRow();
    if (last <= spec.header) return 1;
    var vals = sh.getRange(spec.header + 1, idCol + 1, last - spec.header, 1).getValues();
    var max = 0;
    vals.forEach(function (r) { var n = parseInt(r[0], 10); if (!isNaN(n) && n > max) max = n; });
    return max + 1;
  } catch (e) { return ''; }
}

/*═══════════════════════════ SHARED HELPERS ═══════════════════════════════*/
function respond_(e, obj) {
  var json = JSON.stringify(obj);
  var cb = e && e.parameter && e.parameter.callback;
  if (cb) return ContentService.createTextOutput(cb + '(' + json + ')')
    .setMimeType(ContentService.MimeType.JAVASCRIPT);
  return ContentService.createTextOutput(json).setMimeType(ContentService.MimeType.JSON);
}

function parseBody_(e) {
  if (!e) return {};
  if (e.postData && e.postData.contents) {
    try { return JSON.parse(e.postData.contents); } catch (x) {}
  }
  if (e.parameter && e.parameter.payload) {
    try { return JSON.parse(e.parameter.payload); } catch (x) {}
  }
  return e.parameter || {};
}

function readTab_(ss, spec) {
  var out = [];
  var sh = ss.getSheetByName(spec.name);
  if (!sh) return out;
  var values = sh.getDataRange().getValues();
  if (values.length < spec.header) return out;
  var headers = values[spec.header - 1].map(function (h) { return String(h || '').trim(); });
  for (var r = spec.header; r < values.length; r++) {
    var row = values[r];
    if (row.every(function (c) { return c === '' || c == null; })) continue;
    var obj = {};
    headers.forEach(function (h, i) { if (h) obj[h] = row[i]; });
    out.push(obj);
  }
  return out;
}

function pick_(obj, names) {
  var keys = Object.keys(obj);
  for (var n = 0; n < names.length; n++)
    for (var k = 0; k < keys.length; k++)
      if (norm_(keys[k]) === norm_(names[n])) return obj[keys[k]];
  return '';
}

function statusColorKey_(raw) {
  var s = String(raw || '').trim().toLowerCase();
  if (/done|live|shipped|on.?track/.test(s)) return 'green';
  if (/working|in.?progress|in.?review|next/.test(s)) return 'amber';
  if (/needs?.?input|needs?.?you|blocked/.test(s)) return 'red';
  if (/later|planned|idea/.test(s)) return 'violet';
  return 'grey';
}

function norm_(s) { return String(s || '').toLowerCase().replace(/[^a-z0-9]/g, ''); }
function str_(v)  { return String(v == null ? '' : v).trim(); }
function today_() { return Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'yyyy-MM-dd'); }
function asIso_(v) {
  if (v instanceof Date) return Utilities.formatDate(v, Session.getScriptTimeZone(), 'yyyy-MM-dd');
  return str_(v);
}
