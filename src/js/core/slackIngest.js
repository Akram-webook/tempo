/* ============================================================
 * Tempo — Slack Daily Check-in ingest (F-034 v1)  ·  PURE, no DOM/network
 * ------------------------------------------------------------
 * Turns a daily check-in posted in #daily-checkin into Evidence Timeline
 * events. Self-reported, structured, opt-in — we record WHAT THE WORK IS,
 * never how a person behaves (see docs/SPEC-slack-real-data.md + INTELLIGENCE-ETHICS).
 *
 * Template the team posts (form-generated or hand-typed):
 *   Daily Check-in — <name> — <date>
 *   Done today:
 *   - <thing> (counts captured, e.g. "issued 40 tickets")
 *   Blockers / need help:
 *   - <thing>  | or "none"
 *   Tomorrow:
 *   - <focus>
 *
 * Contract:
 *   parseCheckin(text) -> { isCheckin, name, date, done[], blockers[], tomorrow[] }
 *                         | { isCheckin:false, unparseable:true }
 *   toEvents(parsed, ctx) -> [event,...]   (event shape = the existing events store)
 *   extractCounts(line)   -> [{ n, unit }]
 *   dedupeKey(ts, category, i) -> string
 *
 * Hard rule: never fabricate. A line we can't read is dropped + flagged by the
 * caller, not guessed. Template hint lines (the parenthesised examples) are skipped.
 * ========================================================== */
(function (WP) {
  'use strict';

  // ---- header + section labels (EN primary; AR so Arabic posts parse too) ----
  var HEADER_RE = /^\s*(?:[*_~`>\s]*)daily\s*check-?in\b/i;
  var HEADER_AR = /(?:تشيك|التحديث|متابعة|المتابعة)\s*اليوم/;

  // Each section: the label patterns that switch the current bucket.
  var SECTIONS = [
    { key: 'done',     res: [/^done(\s+today)?\b/i, /^today\b/i, /^أنجزت/, /^ما\s*تم/, /^المنجز/] },
    { key: 'blockers', res: [/^blockers?\b/i, /^need\s*help\b/i, /^blocked\b/i, /^عوائق/, /^معوقات/, /^مساعدة/, /^عالق/] },
    { key: 'tomorrow', res: [/^tomorrow\b/i, /^next\b/i, /^غد[اً]?/, /^الغد/, /^خطة\s*الغد/] }
  ];

  var BULLET_RE = /^\s*(?:[-•*–—]|\d+[.)])\s+/;       // -, •, *, –, —, "1." "2)"
  var NONE_RE   = /^(none|n\/a|na|nothing|no blockers|لا|لا\s*شيء|لا\s*يوجد|ولا\s*شيء)\.?$/i;

  // A line that is ONLY a parenthesised template hint, or contains the template's
  // example wording — never becomes an event.
  var HINT_RE = /^\(.*\)$/;
  var HINT_WORDS = /(what you completed|add counts where|anything stuck|your main focus|e\.g\.)/i;

  function stripBullet(line) { return line.replace(BULLET_RE, '').trim(); }

  function sectionFor(line) {
    var bare = stripBullet(line).replace(/^[*_~`]+/, '').trim();
    for (var s = 0; s < SECTIONS.length; s++) {
      for (var r = 0; r < SECTIONS[s].res.length; r++) {
        if (SECTIONS[s].res[r].test(bare)) {
          // capture any inline content after a ":" on the label line (e.g. "Tomorrow: ship X")
          var colon = bare.indexOf(':');
          var inline = colon >= 0 ? bare.slice(colon + 1).trim() : '';
          return { key: SECTIONS[s].key, inline: inline };
        }
      }
    }
    return null;
  }

  function isHint(item) {
    return !item || HINT_RE.test(item) || HINT_WORDS.test(item);
  }

  // Extract count signals from a delivery line: "issued 40 tickets" -> {n:40, unit:"tickets"}.
  // Verbatim line is always the source of truth; counts are a convenience for totals.
  function extractCounts(line) {
    var out = [];
    var re = /(\d{1,6})\s+([A-Za-z؀-ۿ][A-Za-z؀-ۿ-]*)/g, m;
    while ((m = re.exec(line)) !== null) {
      out.push({ n: parseInt(m[1], 10), unit: m[2].toLowerCase() });
    }
    return out;
  }

  function parseHeader(line) {
    // "Daily Check-in — Name — Date"  → split on — / - / :  (after the label)
    var rest = line.replace(HEADER_RE, '').replace(HEADER_AR, '').replace(/^[\s:—\-]+/, '');
    // Split on field separators only — em-dash, pipe, colon, or a SPACED hyphen —
    // so an internal date like "2026-06-27" is not broken apart.
    var parts = rest.split(/\s*[—|:]\s*|\s+-\s+/).map(function (p) { return p.trim(); }).filter(Boolean);
    return { name: parts[0] || '', date: parts[1] || '' };
  }

  function parseCheckin(text) {
    var empty = { isCheckin: false, unparseable: true };
    if (!text || typeof text !== 'string') return empty;
    var lines = text.replace(/\r/g, '').split('\n').map(function (l) { return l.trim(); });

    var hasHeader = lines.some(function (l) { return HEADER_RE.test(l) || HEADER_AR.test(l); });
    var hasSection = lines.some(function (l) { return !!sectionFor(l); });
    if (!hasHeader && !hasSection) return empty;   // not a check-in → caller flags "couldn't read"

    var res = { isCheckin: true, name: '', date: '', done: [], blockers: [], tomorrow: [] };
    var cur = null;

    for (var i = 0; i < lines.length; i++) {
      var line = lines[i];
      if (!line) continue;

      if (HEADER_RE.test(line) || HEADER_AR.test(line)) {
        var h = parseHeader(line); res.name = h.name; res.date = h.date; cur = null; continue;
      }
      var sec = sectionFor(line);
      if (sec) {
        cur = sec.key;
        if (sec.inline && !isHint(sec.inline)) res[cur].push(sec.inline);
        continue;
      }
      if (!cur) continue;                          // content before any section → ignore
      var item = stripBullet(line);
      if (isHint(item)) continue;                  // skip the parenthesised template hints
      if (cur === 'blockers' && NONE_RE.test(item)) continue;  // "none" → no risk
      if (item) res[cur].push(item);
    }
    return res;
  }

  var CATEGORY = { done: 'delivery', blockers: 'risk', tomorrow: 'plan' };

  function dedupeKey(ts, category, i) { return String(ts) + ':' + category + ':' + i; }

  // parsed + ctx{ subjectId, permalink, ts, checkinId, confidence } -> events[]
  // One check-in line = one event; all share permalink + checkinId so the timeline
  // can group them. subjectId MUST be resolved by the caller (Slack user -> directory
  // person) BEFORE calling; if it couldn't resolve, the caller drops the whole post.
  function toEvents(parsed, ctx) {
    if (!parsed || !parsed.isCheckin || !ctx || !ctx.subjectId) return [];
    var conf = ctx.confidence || 'med';
    var out = [];
    ['done', 'blockers', 'tomorrow'].forEach(function (bucket) {
      var category = CATEGORY[bucket];
      parsed[bucket].forEach(function (line, i) {
        var ev = {
          type: 'evidence',
          ts: ctx.ts,
          actor: 'system:slack-ingest',
          subjectId: ctx.subjectId,
          category: category,
          description: line,
          source: 'slack:#daily-checkin',
          evidenceRefs: ctx.permalink ? [ctx.permalink] : [],
          confidence: conf,
          checkinId: ctx.checkinId || ctx.ts,
          dedupeKey: dedupeKey(ctx.ts, category, i)
        };
        if (category === 'delivery') {
          var counts = extractCounts(line);
          if (counts.length) ev.metrics = counts;
        }
        out.push(ev);
      });
    });
    return out;
  }

  WP.slackIngest = { parseCheckin: parseCheckin, toEvents: toEvents, extractCounts: extractCounts, dedupeKey: dedupeKey };
})(window.WP = window.WP || {});
