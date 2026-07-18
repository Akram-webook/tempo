/*───────────────────────────────────────────────────────────────────────────
  Tempo — Executive Status Deck  (WBK-branded, auto-updating, director-only)
  ---------------------------------------------------------------------------
  A self-updating Google Slides deck built from the "Tempo — Feedback (Live)"
  sheet. Native Google only (no servers, no cost). Edit the sheet → the deck
  rebuilds itself in ~1 minute + daily at 06:00. The deck link never changes.

  DECK CONTENTS (auto-computed, never typed):
    1. Cover        — portfolio tiles + % delivered + proportion bar (from Waves)
    2. Your requests— the director's raised items with status + priority (Feedback)
    3. One slide per wave — status chip, what's inside, why it matters, needs-you
    4. What needs you — every "needs from director" item in ONE place

  HOW TO CHANGE IT LATER
    • Change WHAT it says   → edit the sheet tabs. Rebuilds in ~1 min.
    • Change LOOK/STRUCTURE → edit the "Deck Settings" tab (color/sections/order/
      wording) OR the CONFIG block just below. Save → run buildDeck.
    • Roll back → Apps Script or Sheet "Version history". Link never changes.
    • SAFE: this deck is standalone — it never reads/writes the Tempo app/repo,
      so no deck edit can affect the live product.
───────────────────────────────────────────────────────────────────────────*/

/*═══════════════════════════ CONFIG (edit here) ═══════════════════════════*/
/* Everything a non-expert would tweak lives in this block. The "Deck Settings"
   sheet tab overrides most of it at build time (see readSettings); if that tab
   is missing we fall back to these defaults and never break. */
var CONFIG = {
  SHEET_ID: '11I0m0piaDVDpdP0buz7U4VgjW5TJ-_s6ale8Wcxxz9A',

  // Tab names + the row their HEADER lives on (data starts the row after).
  TABS: {
    feedback:  { name: 'Feedback',      header: 3 },  // # · Date · Area/Page · Type · Feedback/Note · Priority · Status · Owner
    features:  { name: 'Features',      header: 1 },  // Area · Feature · What it does · Status · Reviewed
    waves:     { name: 'Waves',         header: 1 },  // Wave · Focus · Status · What's inside · Why it matters
    execRoll:  { name: 'Exec Dashboard',header: 1 },  // existing rollup (mirrored on cover if present)
    settings:  { name: 'Deck Settings', header: 1 }   // key · value (optional; overrides CONFIG)
    // 'My Work' is DEFERRED — not read in v1 (see SECT.myWork = false).
  },

  // Brand — WBK.
  ACCENT:    '#ff2c79',   // primary pink
  ACCENT_DK: '#d11e63',   // darker pink for small text on white
  INK:       '#14161C',
  BODY:      '#3A3F49',
  HAIR:      '#E6E8ED',   // hairline / dividers
  WHITE:     '#FFFFFF',
  MUTE:      '#8A90A0',

  // Status colors (shared by chips + dots).
  STATUS: {
    green: '#1FA655', amber: '#F19A2A', red: '#E03B3B', grey: '#C2C7CE', violet: '#7A5AF8'
  },

  // Brand strings.
  EYEBROW:  'WEBOOK · WORKFORCE OPS (TEMPO)',
  HEADLINE: 'Executive Status',
  FOOTER:   'Tempo — Workforce Ops · Confidential',
  CADENCE:  'Updates automatically on every edit and daily at 06:00',

  FONT: 'Figtree',        // closest Google Slides font to WBK (fallback: 'Inter')

  // Logo: paste a white-bg PNG (~600px) as base64 to brand the cover. Empty →
  // falls back to a text wordmark (fine for v1). Do NOT use DriveApp (flaky in
  // triggers); an embedded base64 string is reliable.
  LOGO_B64: '',

  // Which sections render + in what order. Turn a section off with false.
  // (Adding/removing a section = one edit here; the drawing code loops this.)
  SECT: {
    cover:     true,
    requests:  true,   // "Your requests" (Feedback tab)
    waves:     true,   // one slide per wave (Waves tab)
    myWork:    false,  // PHASE 2 — deferred; do not enable until after first review
    needsYou:  true    // closing "What needs you" slide
  },
  SLIDE_ORDER: ['cover', 'requests', 'waves', 'myWork', 'needsYou'],

  REFRESH_HOUR: 6       // daily rebuild hour (0-23)
};

/* Map a sheet status string → a status color key. Tolerant of casing/spacing. */
function statusColorKey(raw) {
  var s = String(raw || '').trim().toLowerCase();
  if (/done|live|shipped|on.?track/.test(s)) return 'green';
  if (/working|in.?progress|in.?review|next/.test(s)) return 'amber';
  if (/needs?.?input|needs?.?you|blocked/.test(s)) return 'red';
  if (/later|planned|idea/.test(s)) return 'violet';
  return 'grey';
}

/*═══════════════════════════ SLIDE GEOMETRY ═══════════════════════════════*/
var PT = { W: 720, H: 405 };            // 16:9 in points (10in x 5.625in)
var MARGIN = 44;

/*═══════════════════════════ ENTRY POINTS ═════════════════════════════════*/

/** Build (or rebuild) the whole deck. Safe to run manually for a preview. */
function buildDeck() {
  var cfg = withSettings_(CONFIG);              // CONFIG merged with Deck Settings tab
  var data = readData_(cfg);
  var deck = openOrCreateDeck_(cfg);

  // wipe existing slides (rebuild from scratch → deterministic)
  var slides = deck.getSlides();
  for (var i = slides.length - 1; i >= 0; i--) slides[i].remove();

  var order = cfg.SLIDE_ORDER.filter(function (k) { return cfg.SECT[k]; });
  order.forEach(function (key) {
    try {
      if (key === 'cover')    drawCover_(deck, cfg, data);
      if (key === 'requests') drawRequests_(deck, cfg, data);
      if (key === 'waves')    data.waves.forEach(function (w) { drawWave_(deck, cfg, w); });
      if (key === 'myWork')   drawMyWork_(deck, cfg, data);
      if (key === 'needsYou') drawNeedsYou_(deck, cfg, data);
    } catch (e) {
      // one bad section must never abort the whole build (spec: wrap risky calls)
      Logger.log('Section "' + key + '" failed: ' + e.message);
    }
  });

  deck.saveAndClose();
  var url = 'https://docs.google.com/presentation/d/' + deck.getId() + '/edit';
  Logger.log('DECK READY → ' + url);
  return url;
}

/** Install the on-edit (debounced) + daily rebuild triggers. Run once. */
function installTrigger() {
  // clear our own triggers first (idempotent)
  ScriptApp.getProjectTriggers().forEach(function (t) {
    var fn = t.getHandlerFunction();
    if (fn === 'onEditRebuild_' || fn === 'onSheetChange' || fn === 'buildDeck') ScriptApp.deleteTrigger(t);
  });
  var ss = SpreadsheetApp.openById(CONFIG.SHEET_ID);
  ScriptApp.newTrigger('onEditRebuild_').forSpreadsheet(ss).onEdit().create();
  ScriptApp.newTrigger('onSheetChange').forSpreadsheet(ss).onChange().create();   // structural changes too
  ScriptApp.newTrigger('buildDeck').timeBased().everyDays(1)
    .atHour(withSettings_(CONFIG).REFRESH_HOUR).create();
  Logger.log('Triggers installed: on-edit + on-change (debounced) + daily @ ' + withSettings_(CONFIG).REFRESH_HOUR + ':00');
}

/*═══════════════════════ WEEKLY HISTORY (snapshot) ════════════════════════
 * The live deck + the in-app Executive Status page always show "now" — a
 * rebuild overwrites, so nothing is archived. This adds a WEEKLY, permanent,
 * browsable history: once a week it rebuilds the deck (so it's current) and
 * exports it as a DATED PDF into a Drive folder. Past weeks are then just files
 * in that folder — this is what makes "last week" truly historical.
 *
 * SETUP (once): create/choose a Drive folder, put its ID in SNAPSHOT_FOLDER_ID
 * below (or a 'snapshot_folder_id' row in the Deck Settings tab), then run
 * installWeeklySnapshot() once. Share the folder to Director (Viewer) + you.
 * Runs Mondays ~06:00. Safe + idempotent; never touches the Tempo app/repo. */
var SNAPSHOT_FOLDER_ID = '';   // ← paste the Drive folder id (or set it in Deck Settings)

function snapshotFolderId_() {
  var s = withSettings_(CONFIG);
  return (s.SNAPSHOT_FOLDER_ID || SNAPSHOT_FOLDER_ID || '').trim();
}

/** Rebuild the deck, then save a dated PDF snapshot into the Drive folder. */
function weeklySnapshot() {
  buildDeck();                                   // ensure the deck is current
  var folderId = snapshotFolderId_();
  if (!folderId) { Logger.log('weeklySnapshot: no SNAPSHOT_FOLDER_ID set — skipped'); return; }
  var deckId = PropertiesService.getScriptProperties().getProperty('DECK_ID');
  if (!deckId) { Logger.log('weeklySnapshot: no DECK_ID yet — run buildDeck first'); return; }
  try {
    var pdf = DriveApp.getFileById(deckId).getAs('application/pdf');
    var now = new Date();
    var stamp = Utilities.formatDate(now, Session.getScriptTimeZone(), 'yyyy-MM-dd');
    pdf.setName('Tempo Executive Status — ' + stamp + '.pdf');
    DriveApp.getFolderById(folderId).createFile(pdf);
    Logger.log('weeklySnapshot: archived ' + stamp);
  } catch (e) {
    Logger.log('weeklySnapshot failed: ' + e.message);   // never throw — one bad run must not break the schedule
  }
}

/** Install the weekly snapshot trigger (Mondays ~06:00). Run once. Idempotent. */
function installWeeklySnapshot() {
  ScriptApp.getProjectTriggers().forEach(function (t) {
    if (t.getHandlerFunction() === 'weeklySnapshot') ScriptApp.deleteTrigger(t);
  });
  ScriptApp.newTrigger('weeklySnapshot').timeBased()
    .onWeekDay(ScriptApp.WeekDay.MONDAY).atHour(6).create();
  Logger.log('Weekly snapshot installed: Mondays ~06:00 → dated PDF in the Drive folder');
}

/** Debounced on-edit handler: schedules a rebuild ~60s after edits settle, so a
    burst of edits triggers ONE rebuild, not dozens. */
function onEditRebuild_() {
  var props = PropertiesService.getScriptProperties();
  props.setProperty('DIRTY', '1');
  // clear any pending one-shot rebuild, set a fresh one
  ScriptApp.getProjectTriggers().forEach(function (t) {
    if (t.getHandlerFunction() === 'rebuildIfDirty_') ScriptApp.deleteTrigger(t);
  });
  ScriptApp.newTrigger('rebuildIfDirty_').timeBased().after(60 * 1000).create();
}

function rebuildIfDirty_() {
  var props = PropertiesService.getScriptProperties();
  if (props.getProperty('DIRTY') === '1') { props.deleteProperty('DIRTY'); buildDeck(); }
  // remove this one-shot trigger
  ScriptApp.getProjectTriggers().forEach(function (t) {
    if (t.getHandlerFunction() === 'rebuildIfDirty_') ScriptApp.deleteTrigger(t);
  });
}

/**
 * On-CHANGE handler (structural: row insert/delete, paste, format) - the
 * companion to onEditRebuild_ (cell-value edits). onEdit misses changes that
 * onChange catches, so registering BOTH means a manual Sheet edit ALWAYS rebuilds
 * the deck. Only the tracked tabs (Exec Dashboard / Waves) trigger a rebuild;
 * reuses the same 60s debounce so a burst of changes = one rebuild.
 *
 * needsYou: Register this as an installable trigger (or just run installTrigger()
 * which now wires it): Apps Script -> Triggers (clock icon) -> Add trigger ->
 *   Function: onSheetChange | Event source: From spreadsheet | Event type: On change
 */
function onSheetChange(e) {
  try {
    // Tracked tabs, from the repo's real config (CFG.TABS), not a separate const.
    var tracked = [CONFIG.TABS.execRoll.name, CONFIG.TABS.waves.name];  // 'Exec Dashboard', 'Waves'
    var sheet = (e && e.source) ? e.source.getActiveSheet() : SpreadsheetApp.getActiveSheet();
    if (!sheet || tracked.indexOf(sheet.getName()) === -1) return;
    // Same debounce path as onEditRebuild_: mark dirty + schedule one rebuild.
    onEditRebuild_();
    try { CacheService.getScriptCache().remove('execStatusData'); } catch (_) {}
    Logger.log('onSheetChange: rebuild scheduled - tab: ' + sheet.getName());
  } catch (err) {
    Logger.log('onSheetChange ERROR: ' + err.message);   // never throw - one bad change must not break the sheet
  }
}

/*═══════════════════════════ DATA LAYER ═══════════════════════════════════*/

/** Merge CONFIG with the optional "Deck Settings" tab (key/value). Never breaks
    if the tab is absent — falls back to CONFIG. */
function withSettings_(base) {
  var cfg = JSON.parse(JSON.stringify(base));   // deep copy so we don't mutate CONFIG
  try {
    var ss = SpreadsheetApp.openById(base.SHEET_ID);
    var tab = ss.getSheetByName(base.TABS.settings.name);
    if (!tab) return cfg;
    var rows = tab.getDataRange().getValues();
    var kv = {};
    rows.forEach(function (r) {
      var k = String(r[0] || '').trim().toLowerCase();
      if (k) kv[k] = String(r[1] == null ? '' : r[1]).trim();
    });
    if (kv['accent_hex'])     cfg.ACCENT = kv['accent_hex'];
    if (kv['cover_headline']) cfg.HEADLINE = kv['cover_headline'];
    if (kv['refresh_hour'])   cfg.REFRESH_HOUR = parseInt(kv['refresh_hour'], 10) || cfg.REFRESH_HOUR;
    if (kv['show_my_work'])   cfg.SECT.myWork  = /^(yes|true|1|on)$/i.test(kv['show_my_work']);
    if (kv['show_needs_you']) cfg.SECT.needsYou = /^(yes|true|1|on)$/i.test(kv['show_needs_you']);
    if (kv['section_order'])  cfg.SLIDE_ORDER = kv['section_order'].split(',').map(function (s) { return s.trim(); });
  } catch (e) { Logger.log('Deck Settings read skipped: ' + e.message); }
  return cfg;
}

/** Read a tab into an array of row-objects keyed by its header cells. */
function readTab_(ss, spec) {
  var out = [];
  try {
    var sh = ss.getSheetByName(spec.name);
    if (!sh) return out;
    var values = sh.getDataRange().getValues();
    if (values.length < spec.header) return out;
    var headers = values[spec.header - 1].map(function (h) { return String(h || '').trim(); });
    for (var r = spec.header; r < values.length; r++) {
      var row = values[r];
      if (row.every(function (c) { return c === '' || c == null; })) continue; // skip blank
      var obj = {};
      headers.forEach(function (h, i) { if (h) obj[h] = row[i]; });
      out.push(obj);
    }
  } catch (e) { Logger.log('readTab "' + spec.name + '" failed: ' + e.message); }
  return out;
}

/** Pull the value of the first header that matches any of `names` (tolerant). */
function pick_(obj, names) {
  var keys = Object.keys(obj);
  for (var n = 0; n < names.length; n++) {
    for (var k = 0; k < keys.length; k++) {
      if (keys[k].toLowerCase().replace(/[^a-z]/g, '') === names[n].toLowerCase().replace(/[^a-z]/g, ''))
        return obj[keys[k]];
    }
  }
  return '';
}

function readData_(cfg) {
  var ss = SpreadsheetApp.openById(cfg.SHEET_ID);

  // Waves → normalized shape + parsed "needs from director"
  var wavesRaw = readTab_(ss, cfg.TABS.waves);
  var waves = wavesRaw.map(function (w) {
    var inside = String(pick_(w, ['What\'s inside', 'Whats inside', 'inside']) || '');
    var needs  = extractNeeds_(inside) .concat(extractNeeds_(String(pick_(w, ['Needs from director', 'needsfromdirector']) || '')));
    return {
      wave:   String(pick_(w, ['Wave']) || '').trim(),
      focus:  String(pick_(w, ['Focus']) || '').trim(),
      status: String(pick_(w, ['Status']) || '').trim(),
      inside: inside.trim(),
      why:    String(pick_(w, ['Why it matters', 'why']) || '').trim(),
      needs:  needs
    };
  }).filter(function (w) { return w.wave || w.focus; });

  // Feedback → the director's requests
  var fbRaw = readTab_(ss, cfg.TABS.feedback);
  var requests = fbRaw.map(function (f) {
    return {
      id:       String(pick_(f, ['#', 'No', 'Id']) || '').trim(),
      date:     pick_(f, ['Date']),
      area:     String(pick_(f, ['Area/Page', 'AreaPage', 'Area']) || '').trim(),
      type:     String(pick_(f, ['Type']) || '').trim(),
      note:     String(pick_(f, ['Feedback/Note', 'FeedbackNote', 'Feedback', 'Note']) || '').trim(),
      priority: String(pick_(f, ['Priority']) || '').trim(),
      status:   String(pick_(f, ['Status']) || '').trim(),
      owner:    String(pick_(f, ['Owner']) || '').trim()
    };
  }).filter(function (r) { return r.note; });

  var features = readTab_(ss, cfg.TABS.features);

  return { waves: waves, requests: requests, features: features };
}

/** Split a free-text field into "needs from director" bullets. Looks for a
    marker like "Needs:" / "Needs you:" / lines beginning with "NEEDS". */
function extractNeeds_(text) {
  if (!text) return [];
  var out = [];
  String(text).split(/\n|;|•|·/).forEach(function (line) {
    var m = line.match(/needs?\s*(?:from\s*director|you)?\s*[:\-]\s*(.+)/i);
    if (m && m[1].trim()) out.push(m[1].trim());
  });
  return out;
}

/*═══════════════════════════ DECK PLUMBING ════════════════════════════════*/

function openOrCreateDeck_(cfg) {
  var props = PropertiesService.getScriptProperties();
  var id = props.getProperty('DECK_ID');
  if (id) {
    try { return SlidesApp.openById(id); } catch (e) { /* stale id → recreate */ }
  }
  var deck = SlidesApp.create('Tempo — Executive Status');
  props.setProperty('DECK_ID', deck.getId());
  return deck;
}

/*═══════════════════════════ DRAW HELPERS ═════════════════════════════════*/

function hexColor_(s) { return s; }  // Slides accepts hex strings directly

function blank_(deck) { return deck.appendSlide(SlidesApp.PredefinedLayout.BLANK); }

function fillBg_(slide, hex) { slide.getBackground().setSolidFill(hex); }

/** A text box with brand defaults + auto-shrink so long input never overflows. */
function textBox_(slide, cfg, x, y, w, h, text, opts) {
  opts = opts || {};
  var box = slide.insertTextBox(String(text == null ? '' : text), x, y, w, h);
  var tr = box.getText();
  var style = tr.getTextStyle();
  style.setFontFamily(cfg.FONT);
  style.setForegroundColor(opts.color || cfg.BODY);
  style.setFontSize(opts.size || 12);
  if (opts.bold) style.setBold(true);
  if (opts.align) box.getText().getParagraphs().forEach(function (p) {
    p.getRange().getParagraphStyle().setParagraphAlignment(opts.align);
  });
  // fit-to-box: shrink text so it never overflows (guarded — API is finicky)
  try { box.setContentAlignment(opts.valign || SlidesApp.ContentAlignment.TOP); } catch (e) {}
  try {
    var auto = SlidesApp.AutofitType.SHRINK_TEXT_ON_OVERFLOW;
    box.getText().getAutofit && box.getText().getAutofit().setAutofitType &&
      box.getText().getAutofit().setAutofitType(auto);
  } catch (e) {}
  try { if (opts.lineSpacing) tr.getParagraphs().forEach(function (p) { p.getRange().getParagraphStyle().setLineSpacing(opts.lineSpacing); }); } catch (e) {}
  return box;
}

function rect_(slide, x, y, w, h, fillHex, opts) {
  opts = opts || {};
  var sh = slide.insertShape(SlidesApp.ShapeType.ROUNDED_RECTANGLE, x, y, w, h);
  if (fillHex) sh.getFill().setSolidFill(fillHex); else sh.getFill().setTransparent();
  if (opts.border) { sh.getBorder().setWeight(1); sh.getBorder().getLineFill().setSolidFill(opts.border); }
  else sh.getBorder().setTransparent();
  return sh;
}

function dot_(slide, x, y, hex, d) {
  d = d || 9;
  var c = slide.insertShape(SlidesApp.ShapeType.ELLIPSE, x, y, d, d);
  c.getFill().setSolidFill(hex); c.getBorder().setTransparent();
  return c;
}

/** A pill status chip. */
function chip_(slide, cfg, x, y, label, colorKey) {
  var hex = cfg.STATUS[colorKey] || cfg.STATUS.grey;
  var w = Math.max(58, 8 + String(label).length * 6.4);
  var pill = slide.insertShape(SlidesApp.ShapeType.ROUNDED_RECTANGLE, x, y, w, 18);
  pill.getFill().setSolidFill(hex); pill.getBorder().setTransparent();
  var t = pill.getText(); t.setText(String(label));
  var st = t.getTextStyle(); st.setFontFamily(cfg.FONT); st.setForegroundColor('#FFFFFF'); st.setFontSize(9); st.setBold(true);
  t.getParagraphs().forEach(function (p) { p.getRange().getParagraphStyle().setParagraphAlignment(SlidesApp.ParagraphAlignment.CENTER); });
  return w;
}

function footer_(slide, cfg) {
  textBox_(slide, cfg, MARGIN, PT.H - 24, PT.W - 2 * MARGIN, 16, cfg.FOOTER,
    { size: 8, color: cfg.MUTE });
}

function eyebrow_(slide, cfg, x, y) {
  textBox_(slide, cfg, x, y, PT.W - 2 * x, 14, cfg.EYEBROW,
    { size: 9, bold: true, color: cfg.ACCENT_DK });
}

/*═══════════════════════════ SLIDES ═══════════════════════════════════════*/

function drawCover_(deck, cfg, data) {
  var s = blank_(deck); fillBg_(s, cfg.WHITE);
  eyebrow_(s, cfg, MARGIN, MARGIN);

  // logo (base64) or text wordmark fallback
  if (cfg.LOGO_B64) {
    try {
      var blob = Utilities.newBlob(Utilities.base64Decode(cfg.LOGO_B64), 'image/png', 'logo.png');
      s.insertImage(blob, PT.W - MARGIN - 120, MARGIN - 6, 120, 30);
    } catch (e) { /* fall through to wordmark */ }
  }

  textBox_(s, cfg, MARGIN, MARGIN + 22, PT.W - 2 * MARGIN, 56, cfg.HEADLINE,
    { size: 40, bold: true, color: cfg.INK });
  textBox_(s, cfg, MARGIN, MARGIN + 78, PT.W - 2 * MARGIN, 16,
    Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'EEEE, d MMMM yyyy'),
    { size: 11, color: cfg.MUTE });

  // portfolio tiles from Waves
  var done = 0, next = 0, later = 0;
  data.waves.forEach(function (w) {
    var k = statusColorKey(w.status);
    if (k === 'green') done++; else if (k === 'amber') next++; else later++;
  });
  var total = data.waves.length || 1;
  var pct = Math.round((done / total) * 100);

  var tiles = [
    { label: 'Shipped / on track', n: done,  hex: cfg.STATUS.green },
    { label: 'In progress',        n: next,  hex: cfg.STATUS.amber },
    { label: 'Planned',            n: later, hex: cfg.STATUS.grey },
    { label: 'Total waves',        n: data.waves.length, hex: cfg.INK }
  ];
  var tw = (PT.W - 2 * MARGIN - 3 * 12) / 4, ty = MARGIN + 116;
  tiles.forEach(function (t, i) {
    var x = MARGIN + i * (tw + 12);
    rect_(s, x, ty, tw, 74, cfg.WHITE, { border: cfg.HAIR });
    dot_(s, x + 12, ty + 14, t.hex, 8);
    textBox_(s, cfg, x + 12, ty + 24, tw - 24, 34, String(t.n), { size: 28, bold: true, color: cfg.INK });
    textBox_(s, cfg, x + 12, ty + 54, tw - 24, 16, t.label, { size: 9, color: cfg.MUTE });
  });

  // big % delivered + proportion bar
  var by = ty + 96;
  textBox_(s, cfg, MARGIN, by, 220, 46, pct + '%', { size: 40, bold: true, color: cfg.ACCENT });
  textBox_(s, cfg, MARGIN, by + 46, 220, 16, 'delivered', { size: 11, color: cfg.MUTE });

  var barX = MARGIN + 150, barW = PT.W - MARGIN - barX, barY = by + 20, barH = 12;
  rect_(s, barX, barY, barW, barH, cfg.HAIR);
  var gW = barW * (done / total), aW = barW * (next / total);
  if (gW > 0) rect_(s, barX, barY, gW, barH, cfg.STATUS.green);
  if (aW > 0) rect_(s, barX + gW, barY, aW, barH, cfg.STATUS.amber);

  footer_(s, cfg);
  textBox_(s, cfg, MARGIN, PT.H - 38, PT.W - 2 * MARGIN, 14, cfg.CADENCE, { size: 8, color: cfg.MUTE });
}

function drawRequests_(deck, cfg, data) {
  var s = blank_(deck); fillBg_(s, cfg.WHITE);
  eyebrow_(s, cfg, MARGIN, MARGIN);
  textBox_(s, cfg, MARGIN, MARGIN + 16, PT.W - 2 * MARGIN, 30, 'Your requests', { size: 24, bold: true, color: cfg.INK });

  // sort: needs-input first, then working, then recently done
  var order = { red: 0, amber: 1, green: 2, grey: 3, violet: 3 };
  var items = data.requests.slice().sort(function (a, b) {
    return (order[statusColorKey(a.status)] || 9) - (order[statusColorKey(b.status)] || 9);
  });

  var raised = items.length;
  var delivered = items.filter(function (r) { return statusColorKey(r.status) === 'green'; }).length;
  var progress  = items.filter(function (r) { return statusColorKey(r.status) === 'amber'; }).length;
  var need      = items.filter(function (r) { return statusColorKey(r.status) === 'red'; }).length;

  textBox_(s, cfg, MARGIN, MARGIN + 48, PT.W - 2 * MARGIN, 16,
    'You raised ' + raised + ' · ' + delivered + ' delivered · ' + progress + ' in progress · ' + need + ' need your input',
    { size: 11, color: cfg.ACCENT_DK, bold: true });

  var y = MARGIN + 74, rowH = 26, max = 9;
  items.slice(0, max).forEach(function (r) {
    var k = statusColorKey(r.status);
    dot_(s, MARGIN, y + 5, cfg.STATUS[k] || cfg.STATUS.grey, 9);
    textBox_(s, cfg, MARGIN + 18, y, PT.W - 2 * MARGIN - 190, rowH,
      (r.area ? r.area + ' — ' : '') + r.note, { size: 11, color: cfg.INK });
    chip_(s, cfg, PT.W - MARGIN - 170, y + 2, r.status || '—', k);
    if (r.priority) textBox_(s, cfg, PT.W - MARGIN - 92, y + 2, 92, 16, r.priority, { size: 9, color: cfg.MUTE });
    y += rowH;
  });
  if (items.length > max) textBox_(s, cfg, MARGIN + 18, y, 300, 16, '+ ' + (items.length - max) + ' more in the sheet', { size: 9, color: cfg.MUTE });
  if (!items.length) textBox_(s, cfg, MARGIN, y, 400, 16, 'No requests logged yet.', { size: 11, color: cfg.MUTE });

  footer_(s, cfg);
}

function drawWave_(deck, cfg, w) {
  var s = blank_(deck); fillBg_(s, cfg.WHITE);
  eyebrow_(s, cfg, MARGIN, MARGIN);

  var k = statusColorKey(w.status);
  var chipLabel = k === 'green' ? 'On track' : k === 'amber' ? 'Next' : k === 'violet' ? 'Later' : (w.status || '—');
  textBox_(s, cfg, MARGIN, MARGIN + 16, PT.W - 2 * MARGIN - 120, 30,
    (w.wave ? w.wave + ' — ' : '') + w.focus, { size: 22, bold: true, color: cfg.INK });
  chip_(s, cfg, PT.W - MARGIN - 110, MARGIN + 20, chipLabel, k);

  // "What's inside" as short timeline dots
  var y = MARGIN + 62;
  textBox_(s, cfg, MARGIN, y, 300, 16, 'What\'s inside', { size: 10, bold: true, color: cfg.MUTE });
  y += 22;
  var pieces = String(w.inside || '').split(/\n|;|•|·|,/).map(function (p) { return p.trim(); }).filter(Boolean).slice(0, 6);
  pieces.forEach(function (p, i) {
    var c = i === 0 ? cfg.STATUS.green : (i === 1 ? cfg.STATUS.amber : cfg.STATUS.grey);
    dot_(s, MARGIN, y + 4, c, 8);
    textBox_(s, cfg, MARGIN + 16, y, PT.W - 2 * MARGIN - 16, 18, p, { size: 11, color: cfg.BODY });
    y += 22;
  });

  // Why it matters
  if (w.why) {
    y += 6;
    textBox_(s, cfg, MARGIN, y, 300, 16, 'Why it matters', { size: 10, bold: true, color: cfg.MUTE });
    textBox_(s, cfg, MARGIN, y + 18, PT.W - 2 * MARGIN, 34, w.why, { size: 12, color: cfg.INK });
    y += 58;
  }

  // NEEDS YOUR INPUT block (most important thing on the slide)
  if (w.needs && w.needs.length) {
    var bh = 26 + w.needs.length * 16;
    rect_(s, MARGIN, PT.H - 40 - bh, PT.W - 2 * MARGIN, bh, '#FDECEC', { border: cfg.STATUS.red });
    textBox_(s, cfg, MARGIN + 12, PT.H - 40 - bh + 8, 300, 16, 'Needs your input', { size: 11, bold: true, color: cfg.STATUS.red });
    var ny = PT.H - 40 - bh + 28;
    w.needs.forEach(function (n) { textBox_(s, cfg, MARGIN + 12, ny, PT.W - 2 * MARGIN - 24, 16, '• ' + n, { size: 10, color: cfg.INK }); ny += 16; });
  }

  footer_(s, cfg);
}

/* PHASE 2 — deferred. Kept so enabling SECT.myWork later just works. */
function drawMyWork_(deck, cfg, data) {
  var s = blank_(deck); fillBg_(s, cfg.WHITE);
  eyebrow_(s, cfg, MARGIN, MARGIN);
  textBox_(s, cfg, MARGIN, MARGIN + 16, PT.W - 2 * MARGIN, 30, 'This week — team execution', { size: 24, bold: true, color: cfg.INK });
  textBox_(s, cfg, MARGIN, MARGIN + 56, PT.W - 2 * MARGIN, 16, 'Enable in the "Deck Settings" tab (show_my_work = yes) once the My Work tab is live.', { size: 11, color: cfg.MUTE });
  footer_(s, cfg);
}

function drawNeedsYou_(deck, cfg, data) {
  var s = blank_(deck); fillBg_(s, cfg.WHITE);
  eyebrow_(s, cfg, MARGIN, MARGIN);
  textBox_(s, cfg, MARGIN, MARGIN + 16, PT.W - 2 * MARGIN, 30, 'What needs you', { size: 24, bold: true, color: cfg.INK });

  var all = [];
  data.waves.forEach(function (w) { (w.needs || []).forEach(function (n) { all.push({ wave: w.wave || w.focus, text: n }); }); });
  data.requests.forEach(function (r) { if (statusColorKey(r.status) === 'red') all.push({ wave: r.area || 'Request', text: r.note }); });

  if (!all.length) {
    textBox_(s, cfg, MARGIN, MARGIN + 60, PT.W - 2 * MARGIN, 20, 'Nothing needs you right now. You\'re all clear.', { size: 13, color: cfg.STATUS.green, bold: true });
    footer_(s, cfg); return;
  }

  textBox_(s, cfg, MARGIN, MARGIN + 48, PT.W - 2 * MARGIN, 16,
    all.length + ' item' + (all.length === 1 ? '' : 's') + ' waiting on your decision', { size: 11, color: cfg.ACCENT_DK, bold: true });

  var y = MARGIN + 74;
  all.slice(0, 8).forEach(function (it) {
    dot_(s, MARGIN, y + 5, cfg.STATUS.red, 9);
    textBox_(s, cfg, MARGIN + 18, y, PT.W - 2 * MARGIN - 18, 20, it.text, { size: 12, color: cfg.INK });
    textBox_(s, cfg, MARGIN + 18, y + 18, PT.W - 2 * MARGIN - 18, 14, 'from ' + it.wave, { size: 9, color: cfg.MUTE });
    y += 40;
  });
  footer_(s, cfg);
}
