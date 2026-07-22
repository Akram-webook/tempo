/* ============================================================
 * Tempo — Executive Status (native, live from the Feedback sheet)
 * ------------------------------------------------------------
 * A native, on-brand render of the SAME "Tempo - Feedback (Live)" sheet the
 * Google Slides deck builds from. This view holds NO data of its own — it reads
 * a deployed Apps Script JSON endpoint (WP.config.execStatusEndpoint) at view
 * time via JSONP and paints the result. Deck + page are two thin views over one
 * source of truth (the sheet). Transport is the shared WP.ui.jsonp helper
 * (ui layer — it needs the DOM; core is kept DOM-free by rule).
 *
 * WHY native (not an embedded deck iframe): a PRIVATE Google Slides deck does
 * not frame inline — Google shows a sign-in / request-access box. We keep the
 * deck PRIVATE and reach it via the "Open / present" button (board / PDF /
 * present mode) instead of embedding it.
 *
 * Gated to Director + Admin (WP.execDeckVisible → endpoint set AND
 * WP.can('viewSettings')). Re-checked here (defence in depth): a member or an
 * empty endpoint redirects home and renders nothing.
 * ========================================================== */
(function (WP) {
  'use strict';
  const ui = WP.ui;
  const esc = function (s) { return ui.esc(String(s == null ? '' : s)); };

  // status -> colour bucket. NOTE: the Google Slides deck (docs/exec-deck/Code.gs)
  // is a SEPARATE Apps Script runtime and keeps its OWN copy of this rule — it
  // cannot import this file, so this is NOT a shared module. The two are kept in
  // sync by hand + the bucket contract pinned in test/verify-exec.js (change one
  // side's regex and CI trips). Keep Code.gs's statusColorKey aligned.
  function statusColorKey(raw) {
    const s = String(raw || '').toLowerCase();
    if (/done|live|shipped|on.?track/.test(s)) return 'green';
    if (/working|in.?progress|in.?review|next|testing/.test(s)) return 'amber';
    if (/needs?.?input|needs?.?you|blocked/.test(s)) return 'red';
    if (/later|planned|idea|under.?review|new\b/.test(s)) return 'violet';
    if (/discard|reject|won'?t|dropped/.test(s)) return 'grey';
    return 'grey';
  }
  // Back-compat + test hook + a stable data surface for the buckets.
  WP.execStatus = { statusColorKey: statusColorKey };
  WP.execStatusColorKey = statusColorKey;
  // Presentational colour tokens for each bucket (view-owned). Resolve to
  // tokens.css --exec-* vars, which hold the exact hexes the deck uses.
  const COLORS = {
    green:  'var(--exec-green)',  amber: 'var(--exec-amber)', red: 'var(--exec-red)',
    violet: 'var(--exec-violet)', grey:  'var(--exec-grey)',
  };

  // ---- relative time from an ISO string ("just now", "3h ago", "2d ago") -----
  function relTime(iso) {
    const t = WP.i18n.t;
    if (!iso) return '';
    const then = Date.parse(iso);
    if (isNaN(then)) return '';
    const secs = Math.max(0, Math.round((Date.now() - then) / 1000));
    if (secs < 60) return t('execJustNow');
    const mins = Math.round(secs / 60);
    if (mins < 60) return mins + t('execMinAgo');
    const hrs = Math.round(mins / 60);
    if (hrs < 24) return hrs + t('execHrAgo');
    const days = Math.round(hrs / 24);
    return days + t('execDayAgo');
  }

  // Data comes from data/exec-status.json - a repo file committed by the
  // exec-status GitHub Action and served same-origin by Pages. Plain fetch(),
  // no JSONP, no CORS, no Google. See load() below.

  // ---- small on-brand pieces --------------------------------------------------
  // Status icon per bucket — so status is conveyed by SHAPE + colour, never
  // colour alone (a11y: color-blind users). Pairs with the chip's text label.
  const BUCKET_ICON = { green: 'check', amber: 'clock', red: 'alert', violet: 'clock', grey: 'minus' };
  function statusIcon(key) {
    return '<span class="ex-sic ex-sic--' + key + '" aria-hidden="true">' + ui.icon(BUCKET_ICON[key] || 'minus', 13) + '</span>';
  }
  // Known status strings localize (EN + AR); an unknown one falls back to its raw
  // text so nothing ever renders blank. Keys live in i18n as execChip_<slug>.
  var CHIP_I18N = {
    'done': 'execChip_done', 'live': 'execChip_done', 'shipped': 'execChip_done',
    'working': 'execChip_working', 'in progress': 'execChip_working',
    'under review': 'execChip_review', 'planned': 'execChip_planned',
    'testing': 'execChip_testing', 'discarded': 'execChip_discarded',
    'needs you': 'execChip_needs', 'blocked': 'execChip_blocked',
    'later': 'execChip_later', 'next': 'execChip_next',
  };
  // A localized label for a status string (EN + AR); unknown -> raw text.
  function chipLabelFor(raw) {
    const k = CHIP_I18N[String(raw || '').toLowerCase().trim()];
    return k ? WP.i18n.t(k) : String(raw || '—');
  }
  function chip(raw) {
    const key = statusColorKey(raw);
    return '<span class="ex-chip ex-chip--' + key + '">' + ui.esc(chipLabelFor(raw)) + '</span>';
  }

  // ---- section builders -------------------------------------------------------
  // Compact LAUNCHER — a small summary + % bar + one-line rollup + a big button
  // to the full Google Slides deck (the hosted, presentable artifact). The page
  // no longer duplicates the full slide-by-slide render; the deck owns that.
  function launcherHTML(data) {
    const t = WP.i18n.t;
    const c = (data && data.cover) || {};
    const waves = (data && data.waves) || [];
    // GitHub-warehouse shape: cover.progress (number) + cover.health (green/amber/red).
    // Progress bar = the single effort-weighted % ; the rest is remaining.
    const pct = (c.progress != null && !isNaN(+c.progress)) ? Math.round(+c.progress)
      : (c.pct != null ? Math.round(+c.pct) : 0);
    // Rollup counts: prefer the timeline items[] (per-PR, so "8 shipped" is real
    // delivered work), and fall back to the wave rollup when no items[] exist yet.
    // IMPORTANT: count DELIVERY items only - folded-in feedback (source:'feedback')
    // is incoming triage, not shipped/in-flight work, so it must NOT inflate the
    // stats strip (an Assigned feedback item maps to status 'Working').
    const allItems = (data && Array.isArray(data.items)) ? data.items : null;
    const items = allItems ? allItems.filter(function (x) { return x.source !== 'feedback'; }) : null;
    const done = items ? items.filter(function (x) { return x.status === 'Done'; }).length
      : waves.filter(function (x) { return x.status === 'Done'; }).length;
    const next = items ? items.filter(function (x) { return x.status === 'Working'; }).length
      : waves.filter(function (x) { return x.status === 'In Progress'; }).length;
    const need = ((data && data.needsYou) || []).length;
    const w = function (v) { return v; };   // bar segments are already percentages
    const summary = t('execSummary').replace('{done}', done).replace('{next}', next).replace('{need}', need);
    // Scope line: the headline % is roadmap-wide (total done / total planned across
    // ALL waves), so a 100% wave card sitting beside an 80% headline is NOT a
    // contradiction - it just measures the whole plan, not the current wave. Spell
    // that out from the same numbers the % is derived from (waves carry done/planned
    // after deriveWaveProgress). Only shown when we actually have a plan to count.
    const planWaves = waves.filter(function (x) { return (+x.planned || 0) > 0; });
    const scopeDone = planWaves.reduce(function (a, x) { return a + (+x.done || 0); }, 0);
    const scopeTotal = planWaves.reduce(function (a, x) { return a + (+x.planned || 0); }, 0);
    const scope = scopeTotal > 0
      ? (planWaves.length === 1 ? t('execDeliveredScope1') : t('execDeliveredScope'))
          .replace('{done}', scopeDone).replace('{total}', scopeTotal).replace('{waves}', planWaves.length)
      : '';
    const openUrl = ui.esc((WP.config.execDeckUrl || '').trim());
    const openBtn = openUrl
      ? '<a class="btn primary ex-deck-btn" id="exec-open" href="' + openUrl + '" target="_blank" rel="noopener noreferrer">' +
          ui.icon('external', 16) + ' <span>' + t('execOpenDeck') + '</span></a>' : '';
    return '<div class="section ex-launch">' +
      '<div class="ex-launch-top">' +
        '<div class="ex-pct"><span class="ex-pct-n">' + pct + '%</span> <span class="ex-pct-l">' + t('execDelivered') + '</span>' +
          (scope ? '<span class="ex-pct-scope">' + ui.esc(scope) + '</span>' : '') +
        '</div>' +
        openBtn +
      '</div>' +
      '<div class="ex-bar" role="img" aria-label="' + pct + '% ' + t('execDelivered') + '">' +
        '<span style="width:' + Math.max(0, Math.min(100, pct)) + '%;background:' + COLORS.green + '"></span>' +
        '<span style="width:' + Math.max(0, 100 - pct) + '%;background:' + COLORS.grey + '"></span>' +
      '</div>' +
      '<div class="ex-launch-sum">' + summary + '</div>' +
    '</div>';
  }

  // ---- TIMELINE (senior-BA/PM view): a calendar-style WEEK NAVIGATOR ----------
  // The director can step to ANY week (‹ prev · "Week of 8–14 Jun" · next ›) and
  // snap back with Today, or switch to "All" to see every dated item grouped by
  // week. Time-navigator pattern: ONE reference (refWeekOffset, 0 = current week)
  // drives the window; the label always names the exact week so he never loses
  // his place. Reads a date per item from the sheet (requests[].date;
  // features[].date/reviewed). Undated items surface in a labelled "No date yet"
  // group (All view) so nothing is silently hidden.
  const TL_MODES = ['week', 'all'];

  // Monday-based week window for a given offset (0 = this week, -1 = last, +1 = next).
  function weekWindow(offset) {
    const now = new Date();
    const day = (now.getUTCDay() + 6) % 7;   // 0 = Monday
    const monday = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() - day) + offset * 7 * 86400000;
    return { start: monday, end: monday + 7 * 86400000 - 1 };
  }
  function inWindow(ms, win) { return ms >= win.start && ms <= win.end; }

  // Human label for a week window, e.g. "8–14 Jun 2026" / "29 Jun – 5 Jul 2026".
  // Numbers/months stay LTR-friendly; formatting is locale-aware via toLocaleDateString.
  function weekLabel(win) {
    const loc = (WP.state && WP.state.lang === 'ar') ? 'ar' : 'en-GB';
    const a = new Date(win.start), b = new Date(win.end);
    const day = { day: 'numeric', timeZone: 'UTC' };
    const dayMon = { day: 'numeric', month: 'short', timeZone: 'UTC' };
    const full = { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' };
    const sameMonth = a.getUTCMonth() === b.getUTCMonth() && a.getUTCFullYear() === b.getUTCFullYear();
    const left = sameMonth ? a.toLocaleDateString(loc, day) : a.toLocaleDateString(loc, dayMon);
    return left + ' – ' + b.toLocaleDateString(loc, full);
  }

  // Normalize the timeline items from the payload. Preferred shape is the
  // GitHub-warehouse items[] (one per PR, written by compute-exec-status.js);
  // requests[]/features[] are kept as a fallback for older/sample payloads.
  function timelineItems(data) {
    const out = [];
    if (data && Array.isArray(data.items) && data.items.length) {
      // Prefix each row with its area ONLY when the timeline spans >1 area - a
      // single repeated prefix (e.g. "Exec Deck - ") is noise, so drop it then.
      var areas = {};
      data.items.forEach(function (it) { if (it.area) areas[it.area] = 1; });
      var showArea = Object.keys(areas).length > 1;
      data.items.forEach(function (it) {
        out.push({
          id: it.id || null,
          title: (showArea && it.area ? it.area + ' — ' : '') + (it.title || '—'),
          status: it.status,
          rawStatus: it.rawStatus || '',  // feedback lifecycle value (for triage controls)
          date: it.ts || it.date || null,
          type: it.type || '',
          source: it.source || '',        // 'feedback' rows get the tag + lane treatment
          lane: it.lane || '',
          wave: it.wave || null,
          klass: it.klass || '',          // carried through for the triage suggestion engine
          area: it.area || '',
          priority: it.priority || '',
          image: it.image || null,        // attached screenshot (locally-saved feedback) -> thumbnail
          imageName: it.imageName || '',
        });
      });
    } else {
      ((data && data.requests) || []).forEach(function (r) {
        out.push({ title: (r.area ? r.area + ' — ' : '') + (r.note || '—'), status: r.status, date: r.date || null, type: r.type || r.Type || '' });
      });
      ((data && data.features) || []).forEach(function (f) {
        const d = f.date || f.Reviewed || f.reviewed || null;
        const title = (f.area || f.Area || '') ? ((f.area || f.Area) + ' — ' + (f.feature || f.Feature || '')) : (f.feature || f.Feature || '');
        if (title) out.push({ title: title, status: f.status || f.Status, date: d, type: f.type || f.Type || '' });
      });
    }
    // Apply the view-local Type + Status + Wave filters to the timeline items.
    return out.filter(function (it) { return matchesType(it.type) && matchesStatus(it.status) && matchesWave(it); });
  }

  // Map a raw feedback warehouse item (data/feedback.json) into the SAME shape as
  // an exec timeline item, so triaged user feedback shows on the Project delivery
  // timeline and answers the existing Type + Status filter chips. The triage
  // lifecycle (New/Testing/Review/Assigned/Discarded) folds onto the exec status
  // buckets so a director can filter to "Planned" and see everything still to
  // decide, or "Working" for what's been assigned to a wave.
  //   New | Review           -> 'Planned' / 'Under review'  (violet: not yet decided)
  //   Testing | Assigned      -> 'Working'   (amber: actively being worked / in a wave)
  //   Discarded               -> 'Discarded' (grey bucket; shown dimmed)
  // Testing is a real in-progress stage (someone is actively validating it), so it
  // sits in the "In progress" band with Assigned - NOT with the undecided New/Review.
  var FB_STATUS_TO_EXEC = { New: 'Planned', Testing: 'Testing', Review: 'Under review',
    Assigned: 'Working', Discarded: 'Discarded' };
  // The raw triage lifecycle a director moves an item through, in order. Assigned
  // requires a wave; the others don't. Kept here so the controls + store agree.
  var TRIAGE_STATUSES = ['New', 'Testing', 'Review', 'Assigned', 'Discarded'];

  // ---- Triage overlay store (director decisions, local-first) -----------------
  // A director can advance an item's lifecycle / assign a wave / discard it right
  // from the Project delivery page. Until a token-safe write proxy exists (the
  // same blocker as the feedback Send transport), those decisions are saved to
  // THIS browser (localStorage) and overlaid on the warehouse data at render time.
  // Structured so flipping to a real warehouse write later is a one-function swap
  // (replace load/save; the overlay-merge in feedbackAsItems stays the same).
  var TRIAGE_KEY = 'tempo_fb_triage';
  function triageLoad() {
    try { return JSON.parse(localStorage.getItem(TRIAGE_KEY)) || {}; }
    catch (e) { return {}; }
  }
  function triageSave(map) {
    // private-mode / quota: the decision just isn't persisted, never a crash.
    try { localStorage.setItem(TRIAGE_KEY, JSON.stringify(map)); } catch (e) {}
  }
  // Merge a raw feedback item with any local override for it. Override wins.
  function triageApply(rawItem) {
    var over = triageLoad()[rawItem.id];
    if (!over) return rawItem;
    var merged = {};
    for (var k in rawItem) merged[k] = rawItem[k];
    if (over.status) merged.status = over.status;
    if ('wave' in over) merged.wave = over.wave;
    return merged;
  }
  // Record a director's decision for one item. status must be a TRIAGE_STATUS;
  // wave is required for Assigned, cleared otherwise.
  function triageSet(id, status, wave) {
    if (!id || TRIAGE_STATUSES.indexOf(status) < 0) return;
    var map = triageLoad();
    var entry = { status: status };
    if (status === 'Assigned') entry.wave = wave || null;
    else entry.wave = null;               // any non-Assigned status clears the wave
    map[id] = entry;
    triageSave(map);
  }
  WP.fbTriage = { load: triageLoad, set: triageSet, apply: triageApply,
    STATUSES: TRIAGE_STATUSES, _key: TRIAGE_KEY };

  // --- Triage suggestion engine -------------------------------------------
  // Recommend a Status (+ Wave for Assigned) for a raw feedback item, the way a
  // product person would triage it, so the director just confirms. Rules are
  // ordered + honest: a real bug -> fix now (Assigned); a feature that serves a
  // wave -> that wave; a valid-but-low-value idea -> Review (parked, not inflated).
  // Which wave "owns" a surface. Each owner has STRONG signals (specific,
  // multi-word surface names - these decide) and WEAK signals (generic single
  // words that only break ties). We SCORE every owner instead of first-match, and
  // weight the `area` field (the authoritative surface, e.g. "Slack") above the
  // free-text note, so a stray generic word in the note (e.g. "the delivery
  // story") can't hijack an item whose area clearly belongs elsewhere. The number
  // is the 1-based wave index in exec-status.json waves[]. Extend as the roadmap
  // grows; an item with no clear owner returns null (director places it).
  var WAVE_OWNERS = [
    { wave: 1,   // Executive Status Deck
      strong: /exec(utive)?\s*(status|deck)|project\s*delivery|status\s*deck|the\s*deck|broadcast|digest/i,
      weak: /\b(director|report|deck)\b/i },
    { wave: 2,   // Capacity Engine
      strong: /capacity\s*engine|workload\s*map|team.?health|burnout|overload/i,
      weak: /\b(capacit|workload|balance)\b/i },
    { wave: 3,   // Real Data Go-live
      strong: /real.?data|go.?live|data\s*(import|warehouse|migration)|nightly\s*sync/i,
      weak: /\b(import|sync|warehouse|migration)\b/i },
    { wave: 4,   // Slack Integration
      strong: /slack/i,
      weak: /\b(notif|reminder|channel|post)\b/i },
  ];
  function suggestWave(raw, waveCount) {
    var area = String(raw.area || '').toLowerCase();
    var note = String(raw.note || '').toLowerCase();
    var cap = waveCount || 4;
    var best = null, bestScore = 0;
    WAVE_OWNERS.forEach(function (o) {
      if (o.wave > cap) return;
      var score = 0;
      // Area is authoritative: a strong area match is decisive; a strong note
      // match is next; weak signals only nudge and never outweigh a strong hit.
      if (o.strong.test(area)) score += 100;
      else if (o.strong.test(note)) score += 40;
      if (o.weak.test(area)) score += 6;
      else if (o.weak.test(note)) score += 2;
      if (score > bestScore) { bestScore = score; best = o.wave; }
    });
    // Require at least a strong signal somewhere - weak-only (score < 40) is too
    // thin to auto-assign; let the director decide rather than guess a wave.
    return bestScore >= 40 ? best : null;
  }
  // Returns { status, wave, reasonKey } - reasonKey is an i18n key explaining WHY.
  function triageSuggest(raw, waveCount) {
    var k = String(raw.klass || raw.type || '').toLowerCase();
    var pri = String(raw.priority || '').toLowerCase();
    var wave = suggestWave(raw, waveCount);
    // 1. A bug is a defect - fix it now, in whichever wave owns the surface.
    if (/bug/.test(k)) {
      return { status: 'Assigned', wave: wave || 1, reasonKey: 'execSugBug' };
    }
    // 2. A feature/idea that clearly serves a wave -> assign it to that wave.
    if (wave && !/low/.test(pri)) {
      return { status: 'Assigned', wave: wave, reasonKey: 'execSugFits' };
    }
    // 3. High/critical priority with no obvious wave still deserves attention now.
    if (/high|critical/.test(pri)) {
      return { status: 'Review', wave: null, reasonKey: 'execSugHigh' };
    }
    // 4. Everything else: a valid idea with no fitting wave -> park at Review,
    //    honestly (not inflated into a wave, not dropped).
    return { status: 'Review', wave: null, reasonKey: 'execSugPark' };
  }
  WP.fbTriage.suggest = triageSuggest;
  // Its classified lane -> the Type the exec filter understands (bug/feature/improvement).
  function fbTypeFor(fb) {
    var k = String(fb.klass || fb.type || '').toLowerCase();
    if (/bug/.test(k)) return 'Bug';
    if (/frontend|design/.test(k)) return 'Design';
    if (/backend|enhanc|improv/.test(k)) return 'Improvement';
    return 'Feature';   // Feature / New skill / New idea
  }
  function feedbackAsItems(fb) {
    if (!fb || !Array.isArray(fb.items)) return [];
    return fb.items.map(function (raw) {
      // Overlay any local director decision on top of the warehouse record first.
      var it = triageApply(raw);
      // Title: prefer the polished "[Area] Title" first line; else the raw note.
      var firstLine = String(it.note || '').split('\n')[0].trim();
      var lane = it.klass || '';
      var title = firstLine || '(empty)';
      // Strip a leading "[Area] " so we can render the lane as its own tag.
      var m = /^\[([^\]]+)\]\s*(.*)$/.exec(title);
      if (m) { lane = lane || m[1]; title = m[2] || m[1]; }
      return {
        id: it.id || null,             // needed so the triage controls can target it
        title: title,
        rawStatus: it.status || 'New', // the triage lifecycle value (for the controls)
        status: FB_STATUS_TO_EXEC[it.status] || 'Planned',
        date: it.submittedAt || null,
        type: fbTypeFor(it),
        source: 'feedback',            // marks it as an incoming idea, not shipped work
        lane: lane,                    // Frontend | Backend | Bug | Feature | ...
        wave: it.wave || null,
        klass: it.klass || '',         // raw classification (drives the suggestion)
        area: it.area || '',           // the surface it's about (e.g. "Weekly Report")
        priority: it.priority || '',   // Low | Medium | High | Critical
        image: it.image || null,       // attached screenshot (locally-saved feedback only)
        imageName: it.imageName || '',
      };
    });
  }

  // Inline triage controls for ONE feedback row (director-only; the whole view is
  // already gated to director/admin). A gear toggle reveals a compact card: a
  // recommendation banner (pre-selected suggestion + WHY), a Status <select>, a
  // Wave <select> (only when Assigned), and Save / Cancel. Saving overlays the
  // local decision and repaints. data-fb-id ties the controls back to the item.
  function triageControlsHTML(it, waveCount) {
    const t = WP.i18n.t;
    if (!it.id) return '';   // can't target an item with no id
    const raw = it.rawStatus || 'New';
    // Ask the engine what it would do. Pre-select the suggestion on an untriaged
    // item ('New'); on an already-decided item, reflect the existing decision so
    // the director edits from the real state, not a fresh guess.
    const sug = triageSuggest(it, waveCount);
    const untriaged = raw === 'New';
    const cur = untriaged ? sug.status : raw;
    const curWave = untriaged ? sug.wave : it.wave;
    const statusOpts = TRIAGE_STATUSES.map(function (s) {
      var tag = (s === sug.status) ? ' ★' : '';   // star marks the recommended option
      return '<option value="' + s + '"' + (s === cur ? ' selected' : '') + '>' +
        esc(t('execTriage_' + s) + tag) + '</option>';
    }).join('');
    // Wave options 1..waveCount (fallback to at least 4 so it's usable before waves load).
    var n = waveCount > 0 ? waveCount : 4;
    var waveOpts = '<option value="">' + esc(t('execTriagePickWave')) + '</option>';
    for (var i = 1; i <= n; i++) {
      waveOpts += '<option value="' + i + '"' + (String(curWave) === String(i) ? ' selected' : '') + '>' +
        esc(t('execWave') + ' ' + i) + '</option>';
    }
    const showWave = cur === 'Assigned';
    // Recommendation banner: plain-words WHY + the suggested placement.
    var sugPlace = sug.status === 'Assigned'
      ? esc(t('execTriage_Assigned')) + ' · ' + esc(t('execWave') + ' ' + (sug.wave || 1))
      : esc(t('execTriage_' + sug.status));
    var rec = '<div class="ex-triage-rec"><span class="ex-triage-rec-k">' + esc(t('execSugLabel')) + '</span> ' +
      '<strong>' + sugPlace + '</strong> — ' + esc(t(sug.reasonKey)) + '</div>';
    return '<div class="ex-triage" data-fb-id="' + esc(it.id) + '"' +
      ' data-sug-status="' + esc(sug.status) + '" data-sug-wave="' + esc(String(sug.wave || '')) + '" hidden>' +
      rec +
      '<div class="ex-triage-fields">' +
        '<label class="ex-triage-f"><span>' + esc(t('execTriageStatus')) + '</span>' +
          '<select class="ex-triage-status">' + statusOpts + '</select></label>' +
        '<label class="ex-triage-f ex-triage-wave"' + (showWave ? '' : ' hidden') + '><span>' + esc(t('execTriageWave')) + '</span>' +
          '<select class="ex-triage-wavesel">' + waveOpts + '</select></label>' +
        '<div class="ex-triage-actions">' +
          '<button type="button" class="btn primary ex-triage-save">' + esc(t('execTriageSave')) + '</button>' +
          '<button type="button" class="btn ex-triage-cancel">' + esc(t('execTriageCancel')) + '</button>' +
          '<span class="ex-triage-saved" role="status" aria-live="polite" hidden>' +
            ui.icon('check', 14) + ' ' + esc(t('execTriageSaved')) + '</span>' +
        '</div>' +
      '</div>' +
      '<p class="ex-triage-note">' + esc(t('execTriageLocalNote')) + '</p>' +
    '</div>';
  }

  function tlRow(it, waveCount) {
    const t = WP.i18n.t;
    const k = statusColorKey(it.status);
    const isFb = it.source === 'feedback';
    const discarded = isFb && /discard/i.test(it.status);
    // A feedback row carries a small "Feedback" tag + its classified lane, and a
    // wave chip once it's been assigned - so the director sees, at a glance, what
    // it is and whether it's been placed in a wave. Discarded rows read dimmed.
    var tags = '';
    var triageBtn = '';
    if (isFb) {
      tags += '<span class="ex-tl-tag ex-tl-tag--fb">' + esc(t('execFbTag')) + '</span>';
      if (it.lane) tags += '<span class="ex-tl-tag ex-tl-tag--lane">' + esc(it.lane) + '</span>';
      if (it.wave) tags += '<span class="ex-tl-tag ex-tl-tag--wave">' + esc(t('execWave') + ' ' + it.wave) + '</span>';
      if (it.id) {
        triageBtn = '<button type="button" class="ex-tl-triage-btn" aria-expanded="false" ' +
          'aria-label="' + esc(t('execTriageOpen')) + '" title="' + esc(t('execTriageOpen')) + '">' +
          ui.icon('settings', 15) + '</button>';
      }
    }
    // A screenshot attached to (locally-saved) feedback: show a small thumbnail the
    // director can click to view full size. Only present on local feedback - the
    // shared warehouse never carries images.
    var thumb = '';
    if (isFb && it.image) {
      thumb = '<button type="button" class="ex-tl-thumb" data-ex-img="' + esc(it.image) + '"' +
        ' aria-label="' + esc(t('execImgOpen')) + '" title="' + esc(t('execImgOpen')) + '">' +
        '<img src="' + esc(it.image) + '" alt="' + esc(it.imageName || t('execImgAlt')) + '" loading="lazy" />' +
      '</button>';
    }
    return '<div class="ex-tl-item">' +
      '<div class="ex-tl-row' + (isFb ? ' ex-tl-row--fb' : '') + (discarded ? ' ex-tl-row--discarded' : '') + '">' +
        statusIcon(k) +
        '<span class="ex-tl-title">' + ui.esc(it.title) + '</span>' + tags + chip(it.status) + triageBtn +
      '</div>' +
      thumb +
      (isFb ? triageControlsHTML(it, waveCount) : '') +
    '</div>';
  }

  // Navigator control: [Week | All] granularity segment + (in Week mode) the
  // ‹ prev · "Week of …" · next › stepper and a Today button. label is aria-live
  // so screen readers announce the week on change.
  function navHTML(mode, offset) {
    const t = WP.i18n.t;
    const seg = TL_MODES.map(function (m) {
      const on = m === mode ? ' is-on' : '';
      const label = m === 'week' ? t('execWeekView') : t('execAllView');
      return '<button type="button" class="ex-seg-btn' + on + '" data-mode="' + m + '" aria-pressed="' + (on ? 'true' : 'false') + '">' + label + '</button>';
    }).join('');
    let stepper = '';
    if (mode === 'week') {
      const isNow = offset === 0;
      const label = weekLabel(weekWindow(offset));
      stepper =
        '<div class="ex-step">' +
          '<button type="button" class="ex-step-btn ex-step-prev" data-step="-1" aria-label="' + t('execPrevWeek') + '">' + ui.icon('chevronLeft', 16) + '</button>' +
          '<span class="ex-step-label" aria-live="polite">' + ui.esc(label) + '</span>' +
          '<button type="button" class="ex-step-btn ex-step-next" data-step="1" aria-label="' + t('execNextWeek') + '">' + ui.icon('chevronRight', 16) + '</button>' +
          '<button type="button" class="ex-step-today btn' + (isNow ? ' is-now' : '') + '" data-today="1"' + (isNow ? ' disabled' : '') + '>' + t('execToday') + '</button>' +
        '</div>';
    }
    return '<div class="ex-seg" role="group" aria-label="' + t('execTimeline') + '">' + seg + '</div>' + stepper;
  }

  function timelineHTML(data, mode, offset) {
    const t = WP.i18n.t;
    // Stale-data guard: if the payload has NO timeline source field at all -
    // items[] absent (not just empty) AND no requests[]/features[] - the JSON
    // predates the items[] feature. Say "will appear after the next update"
    // rather than "Nothing in this range", which reads as "nothing shipped" and
    // misleads a director looking at stale data. An empty items:[] is NOT stale
    // (the workflow ran and legitimately has nothing) - that's a normal empty.
    const staleNoSource = !!data && data.items === undefined &&
      !(data.requests && data.requests.length) && !(data.features && data.features.length);
    const items = timelineItems(data);
    const waveCount = ((data && data.waves) || []).length;   // for the Assign-to-wave control
    const dated = items.map(function (it) { return { it: it, ms: it.date ? Date.parse(it.date) : NaN }; });

    // Order WITHIN a group so the list reads logically instead of by insertion.
    // A director scans top-to-bottom, so: live/working work first, then what's
    // still to decide, discarded last (it's dimmed anyway). Ties broken by wave
    // (assigned items grouped, Wave 1 before Wave 2...), then newest first.
    // rank: lower = higher up the list.
    function statusRank(x) {
      const k = statusColorKey(x.it.status);
      // green (done/live) -> amber (working/next) -> violet (planned/review) ->
      // red (needs you) sits with amber urgency -> grey (discarded) last.
      return ({ green: 0, amber: 1, red: 1, violet: 2, grey: 4 })[k] != null
        ? ({ green: 0, amber: 1, red: 1, violet: 2, grey: 4 })[k] : 3;
    }
    function sortRows(rows) {
      return rows.slice().sort(function (a, b) {
        const sr = statusRank(a) - statusRank(b);
        if (sr) return sr;
        // within the same status band, group by wave (assigned first, ascending)
        const wa = a.it.wave || 99, wb = b.it.wave || 99;
        if (wa !== wb) return wa - wb;
        // then newest first (undated sinks to the bottom of its band)
        const ma = isNaN(a.ms) ? -Infinity : a.ms, mb = isNaN(b.ms) ? -Infinity : b.ms;
        return mb - ma;
      });
    }

    let groups;
    if (mode === 'all') {
      // group every dated item by week around the current week (±), plus undated.
      const buckets = {};
      dated.forEach(function (x) {
        if (isNaN(x.ms)) { (buckets.__undated = buckets.__undated || []).push(x); return; }
        // find its week offset relative to now
        const base = weekWindow(0).start;
        const off = Math.floor((x.ms - base) / (7 * 86400000));
        (buckets[off] = buckets[off] || []).push(x);
      });
      const offs = Object.keys(buckets).filter(function (k) { return k !== '__undated'; })
        .map(Number).sort(function (a, b) { return b - a; });   // newest week first
      groups = offs.map(function (o) { return { label: weekLabel(weekWindow(o)), rows: sortRows(buckets[o]) }; });
      if (buckets.__undated) groups.push({ label: t('execUndated'), rows: sortRows(buckets.__undated) });
    } else {
      const win = weekWindow(offset);
      const rows = dated.filter(function (x) { return !isNaN(x.ms) && inWindow(x.ms, win); });
      groups = rows.length ? [{ label: null, rows: sortRows(rows) }] : [];
    }

    // Three distinct empty reasons, so the message never misleads:
    //  - stale JSON (no items[] field at all) -> "will appear after next update"
    //  - a filter is active and matched nothing -> "no items match your filters"
    //    (NOT "Nothing in this range", which wrongly implies a date/week problem)
    //  - genuinely nothing in this week -> "Nothing in this range"
    const emptyMsg = staleNoSource ? t('execTlStale')
      : (anyFilterActive() ? t('execTlFiltered') : t('execTlEmpty'));
    // Within a (time) group, split the already-sorted rows into status BANDS with a
    // small header each - Delivered / In progress / To decide / Discarded - so the
    // list reads as clear sections instead of a flat wall. A band renders only if
    // it has rows, so a filtered view never shows an empty section.
    function bandKey(x) {
      const k = statusColorKey(x.it.status);
      if (k === 'green') return 'done';
      if (k === 'amber' || k === 'red') return 'working';
      if (k === 'grey') return 'discarded';
      return 'todecide';   // violet (planned / under review / new)
    }
    const BAND_ORDER = ['done', 'working', 'todecide', 'discarded'];
    const BAND_LABEL = { done: 'execBandDone', working: 'execBandWorking',
      todecide: 'execBandToDecide', discarded: 'execBandDiscarded' };
    function bandsHTML(rows, groupKey) {
      const by = {};
      rows.forEach(function (x) { (by[bandKey(x)] = by[bandKey(x)] || []).push(x); });
      return BAND_ORDER.filter(function (b) { return by[b]; }).map(function (b) {
        const rowsHTML = by[b].map(function (x) { return tlRow(x.it, waveCount); }).join('');
        // The Delivered band is a large finished wall - collapse it by default so
        // the timeline reads as "what's live / in progress / to decide", not a
        // history dump. It stays one click away (never deleted), and stays OPEN if
        // the user is explicitly filtering to Delivered. Each week-group's band is
        // tracked independently (deliveredOpen[groupKey]) so expanding one week
        // does NOT unfurl every other week's Delivered history.
        const collapsible = b === 'done' && filterStatus !== 'done' && filterType === 'all' && filterWave === 'all';
        const key = 'done:' + (groupKey == null ? '_' : groupKey);
        const open = !collapsible || !!deliveredOpen[key];
        if (collapsible) {
          return '<button type="button" class="ex-tl-band ex-tl-band--toggle" data-band-toggle="' + esc(key) + '" aria-expanded="' + (open ? 'true' : 'false') + '">' +
              '<span class="ex-tl-band-caret" aria-hidden="true">' + ui.icon(open ? 'caret' : 'chevronRight', 14) + '</span>' +
              esc(t(BAND_LABEL[b])) + ' <span class="ex-tl-band-n">' + by[b].length + '</span></button>' +
            (open ? rowsHTML : '');
        }
        return '<div class="ex-tl-band">' + esc(t(BAND_LABEL[b])) +
            ' <span class="ex-tl-band-n">' + by[b].length + '</span></div>' + rowsHTML;
      }).join('');
    }
    let body = groups.length
      ? groups.map(function (g, gi) {
          // Stable per-group key so each week's Delivered toggle is independent.
          var gkey = g.label ? g.label : (mode === 'week' ? 'w' + offset : 'g' + gi);
          return (g.label ? '<div class="ex-tl-group">' + ui.esc(g.label) + '</div>' : '') +
            bandsHTML(g.rows, gkey);
        }).join('')
      : '<div class="ex-empty">' + emptyMsg + '</div>';
    // Guard the "lonely collapsed header" state: when every visible row is a
    // Delivered (Done) item and all of them are collapsed, the body would be just
    // band header(s) with no rows - which reads as broken/empty. Add a one-line
    // hint that the delivered work is hidden and how to reveal it.
    if (groups.length && !/ex-tl-row/.test(body)) {
      body += '<div class="ex-tl-allhidden">' + esc(t('execTlAllDelivered')) + '</div>';
    }

    return '<div class="section">' +
      '<div class="ex-tl-head"><h3 class="ex-h3">' + t('execTimeline') + '</h3>' +
        '<div class="ex-tl-nav">' + navHTML(mode, offset) + '</div></div>' +
      '<div class="ex-tl-body">' + body + '</div>' +
    '</div>';
  }

  // "What needs you" — derived from requests[] whose status is red (needs input),
  // PLUS "New" and "In review". NOT from waves[].needs.
  function needsHTML(requests) {
    const t = WP.i18n.t;
    const list = (requests || []).filter(function (r) {
      const s = String(r.status || '').toLowerCase();
      return statusColorKey(r.status) === 'red' || /\bnew\b/.test(s) || /in.?review/.test(s);
    });
    if (!list.length) {
      return '<div class="section ex-clear">' + ui.icon('check', 18) +
        ' <span>' + t('execAllClear') + '</span></div>';
    }
    const items = list.map(function (r) {
      const note = ui.esc(r.note || '—');
      const from = r.area ? ' <span class="ex-need-from">' + t('execFrom') + ' ' + ui.esc(r.area) + '</span>' : '';
      return '<div class="ex-need">' + statusIcon('red') + '<div class="ex-need-b">' + note + from + '</div></div>';
    }).join('');
    return '<div class="section">' +
      '<h3 class="ex-h3">' + t('execNeedsYou') + '</h3>' +
      '<div class="ex-needs">' + items + '</div>' +
    '</div>';
  }

  // ---- header (always present: title, updated-time, refresh, open/present) ----
  function headerHTML(generatedAt) {
    const t = WP.i18n.t;
    const updated = generatedAt
      ? '<span class="ex-updated">' + t('execUpdated') + ' ' + ui.esc(relTime(generatedAt)) + '</span>' : '';
    return '<div class="ex-head">' +
      '<div class="ex-head-t">' +
        '<div class="ex-eyebrow">' + t('execEyebrow') + '</div>' +
        '<h2 class="ex-title">' + t('execStatus') + '</h2>' +
        '<p class="ex-forwho">' + t('execForWho') + '</p>' +
        updated +
      '</div>' +
      '<div class="ex-head-actions">' +
        '<button type="button" class="btn" id="exec-refresh">' + ui.icon('arrowRight', 15) +
          ' <span>' + t('execRefresh') + '</span></button>' +
      '</div>' +
    '</div>';
  }

  function skeleton() {
    return '<div class="section ex-skel"><div class="ex-skel-tiles">' +
      '<span></span><span></span><span></span><span></span></div>' +
      '<div class="ex-skel-bar"></div></div>' +
      '<div class="section ex-skel"><div class="ex-skel-line"></div><div class="ex-skel-line"></div>' +
      '<div class="ex-skel-line"></div></div>';
  }

  function errorHTML() {
    const t = WP.i18n.t;
    return '<div class="section ex-error">' + ui.icon('alert', 20) +
      '<div style="margin-top:8px">' + t('execError') + '</div>' +
      '<button type="button" class="btn primary" id="exec-retry" style="margin-top:12px">' +
        t('execRetry') + '</button></div>';
  }

  // ---- orchestration ----------------------------------------------------------
  let token = 0;         // guards against a stale JSONP resolving after a re-render
  let tlMode = 'week';   // 'week' (stepper) | 'all' (every week grouped) — view-local
  let refWeekOffset = 0; // current week = 0; ‹prev = -1, next› = +1 … (time-navigator reference)
  let lastData = null;   // last MERGED payload (base + folded feedback) for the timeline
  let lastBaseData = null;   // base exec payload (before feedback fold)
  let lastFeedbackRaw = null;   // raw feedback warehouse payload (re-folded each paint)
  let lastBacklog = null;   // durable planned-work backlog (data/delivery-backlog.json)

  // View-local filters applied across the whole Project-delivery view (waves +
  // timeline). Purely presentational; nothing touches WP.state. Default 'all' so
  // the view shows everything until the user narrows it.
  let filterType = 'all';    // all | bug | feature | improvement
  let filterStatus = 'all';  // all | done | working | planned
  let filterWave = 'all';    // 'all' | a 1-based wave index (as string) - focus one wave
  // Delivered band(s) collapsed by default (finished wall). In "All" view there is
  // one Delivered band PER week-group, so we track which are open by a per-group key
  // (not a single flag - a single flag made one click expand every week's band).
  const deliveredOpen = {};
  // Map a filter bucket to the raw status words the data uses (via statusColorKey
  // buckets, so "In Progress"/"in review" -> working, "Later"/"planned" -> planned).
  function matchesStatus(raw) {
    if (filterStatus === 'all') return true;
    const b = statusColorKey(raw);   // green|amber|red|violet|grey
    if (filterStatus === 'done') return b === 'green';
    if (filterStatus === 'working') return b === 'amber' || b === 'red';
    if (filterStatus === 'planned') return b === 'violet' || b === 'grey';
    return true;
  }
  // Type lives on items that carry one (timeline rows); items with no type are
  // shown under 'all' and hidden only when a specific type is selected.
  function matchesType(rawType) {
    if (filterType === 'all') return true;
    const s = String(rawType || '').toLowerCase();
    if (!s) return false;
    if (filterType === 'bug') return /bug/.test(s);
    if (filterType === 'feature') return /feature|new idea|idea/.test(s);
    if (filterType === 'improvement') return /improv|design|enhanc/.test(s);
    return true;
  }
  // Wave focus: when a wave is selected, show only items assigned to that wave.
  // Delivery items (from PRs) carry no wave index yet, so wave focus scopes the
  // feedback/idea rows that DO carry one; a delivery item is shown only under 'all'.
  function matchesWave(it) {
    if (filterWave === 'all') return true;
    return String(it && it.wave || '') === String(filterWave);
  }
  const anyFilterActive = function () { return filterType !== 'all' || filterStatus !== 'all' || filterWave !== 'all'; };

  // WAVES section (GitHub-warehouse shape): one row per wave with progress bar +
  // health dot + notes + any open-PR blockers. This is the heart of the page now.
  function wavesHTML(data) {
    const t = WP.i18n.t;
    let waves = (data && data.waves) || [];
    // Waves are structural, not typed - Status filters them; a specific Type
    // filter (Bugs/Features/…) hides them since a wave has no type. Under 'all'
    // type they always show. This keeps "Status: Done" meaningful on waves while
    // "Type: Bugs" scopes to the typed timeline items only.
    waves = waves.filter(function (w) {
      return matchesStatus(w.status) && (filterType === 'all');
    });
    if (!waves.length) {
      // Don't leave a bare heading when a filter empties the grid.
      return anyFilterActive() ? '' : '';
    }
    // Per-status card class drives the border tint + badge colour (all via CSS
    // tokens - no raw hex here, so the token-purity gate stays green).
    const stKey = function (st) {
      return st === 'Done' ? 'done' : st === 'In Progress' ? 'active'
        : st === 'Next' ? 'next' : 'later';
    };
    const cards = waves.map(function (w, idx) {
      const pct = Math.max(0, Math.min(100, +w.progress || 0));
      const h = w.health === 'red' ? 'red' : w.health === 'amber' ? 'amber' : 'green';
      const sk = stKey(w.status);
      const openCount = (w.openPRs || []).length;
      // "N/M PRs" pulled from the notes string the compute step writes.
      const m = (w.notes || '').match(/(\d+)\/(\d+) PRs merged/);
      const prLabel = m ? (m[1] + '/' + m[2] + ' PRs') : '';
      const blockers = (w.openPRs || []).filter(function (p) { return p.blockedOn; })
        .map(function (p) { return '#' + p.number + ' ' + esc(p.blockedOn) + (p.daysSinceActivity ? ' (' + p.daysSinceActivity + 'd)' : ''); })
        .join(' · ');
      const waveNo = idx + 1;
      const focused = String(filterWave) === String(waveNo);
      // Each card is a button: click to FOCUS that wave (filter the timeline to it),
      // click again to clear. A done wave stays visible - being 100% is a reason to
      // SEE it, not to hide it. aria-pressed announces the focus state.
      return '<button type="button" class="ex-wave-card ex-wc--' + sk + (focused ? ' is-focused' : '') + '"' +
          ' data-wave="' + waveNo + '" aria-pressed="' + (focused ? 'true' : 'false') + '"' +
          ' title="' + esc(t('execWaveFocusTip')) + '">' +
        '<div class="ex-wc-top">' +
          '<span class="ex-wc-num">' + t('execWave') + ' ' + waveNo + '</span>' +
          '<span class="ex-wc-health ex-wc-health--' + h + '" title="' + esc(w.health || 'green') + '"></span>' +
        '</div>' +
        '<div class="ex-wc-name">' + esc(w.name) + '</div>' +
        '<span class="ex-wc-badge">' + esc(chipLabelFor(w.status)) + '</span>' +
        '<div class="ex-wc-bar"><div class="ex-wc-fill" style="width:' + pct + '%"></div></div>' +
        '<div class="ex-wc-meta">' +
          '<span class="ex-wc-pct">' + pct + '%</span>' +
          (prLabel ? '<span>· ' + esc(prLabel) + '</span>' : '') +
          (openCount ? '<span class="ex-wc-open">' + openCount + ' ' + t('execOpen') + '</span>' : '') +
        '</div>' +
        (blockers ? '<div class="ex-wave-blk">' + esc(t('execBlockedOn')) + ': ' + blockers + '</div>' : '') +
      '</button>';
    }).join('');
    // When a wave is focused, a clear banner tells the user + offers "show all".
    var focusBar = '';
    if (filterWave !== 'all') {
      var fw = waves[+filterWave - 1];
      var fname = fw ? fw.name : (t('execWave') + ' ' + filterWave);
      focusBar = '<div class="ex-wave-focus">' +
        '<span>' + esc(t('execWaveFocused').replace('{n}', filterWave).replace('{name}', fname)) + '</span>' +
        '<button type="button" class="ex-wave-clear" data-wave-clear>' + esc(t('execWaveShowAll')) + '</button>' +
      '</div>';
    }
    return '<div class="section ex-waves"><h3 class="ex-h3">' + t('execWaves') + '</h3>' +
      '<div class="ex-waves-grid">' + cards + '</div>' + focusBar + '</div>';
  }

  // Filter bar: Type (All/Bugs/Features/Improvements) + Status (All/Done/Working/
  // Planned) chip groups. View-local - a click repaints the body from lastData.
  function filterBarHTML() {
    const t = WP.i18n.t;
    const group = function (label, key, cur, opts) {
      const chips = opts.map(function (o) {
        const on = cur === o.v ? ' is-on' : '';
        return '<button type="button" class="ex-fchip' + on + '" role="radio" aria-checked="' +
          (cur === o.v ? 'true' : 'false') + '" data-filter="' + key + '" data-val="' + o.v + '">' +
          esc(o.l) + '</button>';
      }).join('');
      return '<div class="ex-fgroup" role="radiogroup" aria-label="' + esc(label) + '">' +
        '<span class="ex-flabel">' + esc(label) + '</span>' + chips + '</div>';
    };
    // A dropdown variant of a filter group (used for Status: the values read as the
    // timeline BAND names - Delivered / In progress / To decide - so the filter and
    // the sections share one vocabulary). data-filter-select ties it to the wiring.
    const selectGroup = function (label, key, cur, opts) {
      const options = opts.map(function (o) {
        return '<option value="' + esc(o.v) + '"' + (cur === o.v ? ' selected' : '') + '>' + esc(o.l) + '</option>';
      }).join('');
      return '<div class="ex-fgroup ex-fgroup--select">' +
        '<span class="ex-flabel">' + esc(label) + '</span>' +
        '<select class="ex-fselect" data-filter-select="' + key + '" aria-label="' + esc(label) + '">' + options + '</select>' +
      '</div>';
    };
    return '<div class="section ex-filters">' +
      group(t('execFilterType'), 'type', filterType, [
        { v: 'all', l: t('execFilterAll') }, { v: 'bug', l: t('execFilterBugs') },
        { v: 'feature', l: t('execFilterFeatures') }, { v: 'improvement', l: t('execFilterImprovements') },
      ]) +
      selectGroup(t('execFilterStatus'), 'status', filterStatus, [
        { v: 'all', l: t('execFilterAll') }, { v: 'done', l: t('execBandDone') },
        { v: 'working', l: t('execBandWorking') }, { v: 'planned', l: t('execBandToDecide') },
      ]) +
    '</div>';
  }

  // Derive each wave's % from REAL work: done / planned. `done` = delivery items
  // (source !== 'feedback') assigned to that wave with status 'Done'. `planned` =
  // the wave's declared plan size (wave.planned), never less than the items we can
  // actually see assigned to it, and never less than done. The overall cover % is
  // the same ratio rolled up across all waves (total done / total planned), so the
  // headline number and the wave cards always agree and move together as we ship.
  // Reversible + fail-safe: if a wave has no plan and no assigned items, it keeps
  // whatever progress the payload declared (so the current Wave 1 = 100% stands).
  function deriveWaveProgress(data) {
    if (!data || !Array.isArray(data.waves) || !data.waves.length) return data;
    var items = Array.isArray(data.items)
      ? data.items.filter(function (x) { return x && x.source !== 'feedback'; }) : [];
    // count done + total assigned, per 1-based wave index
    var doneBy = {}, seenBy = {};
    items.forEach(function (it) {
      var wv = +it.wave;
      if (!wv) return;                 // unassigned items don't belong to a wave's ratio
      seenBy[wv] = (seenBy[wv] || 0) + 1;
      if (it.status === 'Done') doneBy[wv] = (doneBy[wv] || 0) + 1;
    });
    var totalDone = 0, totalPlanned = 0, hasAnyPlan = false;
    var waves = data.waves.map(function (w, idx) {
      // Prefer an explicit wave number if the payload carries one; only fall back
      // to array position for the current dense/ordered shape. This keeps
      // item->wave attribution correct even if waves is ever sparse or reordered.
      var no = (+w.no || +w.wave || idx + 1);
      var done = doneBy[no] || 0;
      var seen = seenBy[no] || 0;
      // planned denominator:
      //  - when a plan is DECLARED (wavePlans / payload), trust it: max(declared, done)
      //    so extra items shipping under new ids never inflate the denominator (a
      //    planned feature that ships under a fresh PR id can't push 1/3 -> 1/4), and
      //    a wave that over-delivers just caps at 100%.
      //  - with NO declared plan, fall back to what we can see: max(seen, done).
      var declared = (w.planned != null && !isNaN(+w.planned)) ? Math.max(0, Math.round(+w.planned)) : 0;
      var planned = declared > 0 ? Math.max(declared, done) : Math.max(seen, done);
      var out = Object.assign({}, w);
      if (planned > 0) {
        hasAnyPlan = true;
        out.planned = planned;
        out.done = done;
        out.progress = Math.round((done / planned) * 100);
        // status derives from the ratio unless the payload pinned a non-default one.
        out.status = out.progress >= 100 ? 'Done'
          : out.progress > 0 ? 'In Progress'
          : (w.status === 'Next' ? 'Next' : 'Later');
        // Only set the item-count note when there is NO informative note to keep -
        // preserve human/blocked-on notes ("#118 awaiting review (7d)"), and refresh
        // an existing auto note (PR-merged rollup or our own "N/M items shipped").
        var note = w.notes || '';
        var isAutoNote = !note || /\d+\/\d+ PRs merged/.test(note) || /\d+\/\d+ items shipped/.test(note);
        if (isAutoNote) out.notes = done + '/' + planned + ' items shipped';
        totalDone += done;
        totalPlanned += planned;
      }
      return out;
    });
    var out = Object.assign({}, data, { waves: waves });
    if (hasAnyPlan && totalPlanned > 0) {
      var pct = Math.round((totalDone / totalPlanned) * 100);
      out.cover = Object.assign({}, data.cover || {}, {
        progress: pct,
        status: pct >= 100 ? 'Done' : pct > 0 ? 'In Progress' : 'Later',
      });
    }
    return out;
  }

  function paintBody(host, baseData) {
    // Re-fold feedback from the RAW payload on every paint, so a just-saved triage
    // decision (which changed the local overlay) is re-applied via feedbackAsItems.
    lastBaseData = baseData;
    // Fold the durable planned-work backlog FIRST (planned items + wave plan
    // sizes + default-wave for wave-less delivery items). CI regenerates
    // exec-status.json from PRs and wipes any planned items, so they live here.
    var data = foldBacklog(baseData, lastBacklog);
    var fbItems = feedbackAsItems(lastFeedbackRaw);   // [] when no feedback / failed
    if (fbItems.length) {
      var merged = (Array.isArray(data.items) ? data.items.slice() : []).concat(fbItems);
      data = Object.assign({}, data, { items: merged });
    }
    // Recompute every wave % (and the headline %) from real done/planned before
    // rendering, so the numbers reflect what's actually shipped vs planned.
    data = deriveWaveProgress(data);
    lastData = data;
    // 1) launcher (progress + trend), 2) WAVES (health/blocked-on), 3) needs-you,
    // 4) any dated timeline items (empty in the warehouse shape, renders nothing).
    const needsList = (data.needsYou || []).map(function (n) { return { note: n, status: 'Needs input' }; });
    const body = launcherHTML(data) + filterBarHTML() + wavesHTML(data) +
      (needsList.length ? needsHTML(needsList) : '') +
      timelineHTML(data, tlMode, refWeekOffset);
    const bodyEl = host.querySelector('.ex-body');
    if (bodyEl) bodyEl.innerHTML = body;
    wireBody(host);
    // refresh the "updated" stamp with the payload's generated time
    const gen = data.generated || data.generatedAt;
    const headEl = host.querySelector('.ex-head');
    if (headEl && gen) {
      const oldU = headEl.querySelector('.ex-updated');
      const html = '<span class="ex-updated">' + WP.i18n.t('execUpdated') + ' ' + ui.esc(relTime(gen)) + '</span>';
      if (oldU) oldU.outerHTML = html;
      else headEl.querySelector('.ex-head-t').insertAdjacentHTML('beforeend', html);
    }
  }

  // Full-size screenshot lightbox. A dark overlay with the image centred; closes
  // on backdrop click, the X button, or Escape; restores focus to the thumbnail.
  function openImgLightbox(src, returnTo) {
    if (!src) return;
    const t = WP.i18n.t;
    var ov = document.createElement('div');
    ov.className = 'ex-img-ov';
    ov.setAttribute('role', 'dialog');
    ov.setAttribute('aria-modal', 'true');
    ov.setAttribute('aria-label', t('execImgTitle'));
    ov.innerHTML =
      '<div class="ex-img-box">' +
        '<button type="button" class="ex-img-close" aria-label="' + esc(t('close')) + '" title="' + esc(t('close')) + '">' +
          ui.icon('x', 18) + '</button>' +
        '<img class="ex-img-full" src="' + esc(src) + '" alt="' + esc(t('execImgAlt')) + '" />' +
      '</div>';
    function close() {
      document.removeEventListener('keydown', onKey);
      if (ov.parentNode) ov.parentNode.removeChild(ov);
      if (returnTo) { try { returnTo.focus(); } catch (e) {} }
    }
    function onKey(e) { if (e.key === 'Escape') { e.preventDefault(); close(); } }
    ov.addEventListener('click', function (e) {
      if (e.target === ov || (e.target.closest && e.target.closest('.ex-img-close'))) close();
    });
    document.addEventListener('keydown', onKey);
    document.body.appendChild(ov);
    var btn = ov.querySelector('.ex-img-close');
    if (btn) { try { btn.focus(); } catch (e) {} }
  }

  // Repaint ONLY the timeline section in place from lastData (no refetch), then
  // re-wire. Keeps focus off WP.state — this is view-local navigation.
  function repaintTimeline(host) {
    if (!lastData) return;
    const cur = host.querySelector('.ex-tl-head') && host.querySelector('.ex-tl-head').closest('.section');
    if (cur) { cur.outerHTML = timelineHTML(lastData, tlMode, refWeekOffset); wireBody(host); }
  }

  // Wire the navigator: [Week|All] segment, ‹ prev / next ›, and Today. A change
  // repaints the timeline from lastData. Purely view-local; nothing touches WP.state.
  function wireBody(host) {
    host.querySelectorAll('[data-mode]').forEach(function (b) {
      b.onclick = function () {
        tlMode = b.getAttribute('data-mode');
        if (tlMode === 'week' && isNaN(refWeekOffset)) refWeekOffset = 0;
        repaintTimeline(host);
      };
    });
    host.querySelectorAll('[data-step]').forEach(function (b) {
      b.onclick = function () {
        refWeekOffset += parseInt(b.getAttribute('data-step'), 10) || 0;
        repaintTimeline(host);
      };
    });
    const today = host.querySelector('[data-today]');
    if (today) today.onclick = function () { refWeekOffset = 0; repaintTimeline(host); };
    // Filter chips: set the view-local filter and repaint the whole body (waves +
    // timeline both respond). Keeps everything off WP.state.
    host.querySelectorAll('[data-filter]').forEach(function (b) {
      b.onclick = function () {
        const key = b.getAttribute('data-filter');
        const val = b.getAttribute('data-val');
        if (key === 'type') filterType = val;
        else if (key === 'status') filterStatus = val;
        if (lastBaseData) paintBody(host, lastBaseData);
      };
    });
    // Dropdown filter groups (Status): change sets the filter + repaints the body.
    host.querySelectorAll('[data-filter-select]').forEach(function (sel) {
      sel.onchange = function () {
        const key = sel.getAttribute('data-filter-select');
        if (key === 'type') filterType = sel.value;
        else if (key === 'status') filterStatus = sel.value;
        if (lastBaseData) paintBody(host, lastBaseData);
      };
    });
    // Wave cards: click to FOCUS that wave (filter the timeline to its items),
    // click the focused one again (or "Show all") to clear. View-local.
    host.querySelectorAll('.ex-wave-card[data-wave]').forEach(function (card) {
      card.onclick = function () {
        const w = card.getAttribute('data-wave');
        filterWave = (String(filterWave) === String(w)) ? 'all' : w;
        if (lastBaseData) paintBody(host, lastBaseData);
      };
    });
    var clearBtn = host.querySelector('[data-wave-clear]');
    if (clearBtn) clearBtn.onclick = function () { filterWave = 'all'; if (lastBaseData) paintBody(host, lastBaseData); };
    // Delivered band toggle: expand/collapse THIS group's finished wall in place.
    // Each toggle carries its own group key (data-band-toggle="done:<group>") so a
    // click flips only that band. Repaint the timeline only (not the whole body)
    // and restore focus to the same toggle so keyboard/SR users keep their place.
    host.querySelectorAll('[data-band-toggle^="done"]').forEach(function (b) {
      b.onclick = function () {
        var key = b.getAttribute('data-band-toggle');
        deliveredOpen[key] = !deliveredOpen[key];
        repaintTimeline(host);
        var again = host.querySelector('[data-band-toggle="' + (window.CSS && CSS.escape ? CSS.escape(key) : key) + '"]');
        if (again) { try { again.focus(); } catch (e) {} }
      };
    });
    // Screenshot thumbnails -> open the full image in a lightbox overlay.
    host.querySelectorAll('.ex-tl-thumb[data-ex-img]').forEach(function (b) {
      b.onclick = function () { openImgLightbox(b.getAttribute('data-ex-img'), b); };
    });
    wireTriage(host);
  }

  // Wire the per-row feedback triage controls (director-only view). Toggle reveals
  // the inline selects; changing status shows/hides the wave picker; Save records
  // the decision to the local overlay + repaints so the row reflects it at once.
  function wireTriage(host) {
    host.querySelectorAll('.ex-tl-triage-btn').forEach(function (btn) {
      btn.onclick = function () {
        var item = btn.closest('.ex-tl-item');
        var panel = item && item.querySelector('.ex-triage');
        if (!panel) return;
        var open = panel.hidden;
        panel.hidden = !open;
        btn.setAttribute('aria-expanded', open ? 'true' : 'false');
      };
    });
    host.querySelectorAll('.ex-triage').forEach(function (panel) {
      var statusSel = panel.querySelector('.ex-triage-status');
      var waveWrap = panel.querySelector('.ex-triage-wave');
      var waveSel = panel.querySelector('.ex-triage-wavesel');
      var saved = panel.querySelector('.ex-triage-saved');
      // When the director changes status: show/hide the wave picker, and if they
      // switch TO Assigned with no wave chosen, prefill the suggested wave.
      if (statusSel && waveWrap) {
        statusSel.onchange = function () {
          var assigned = statusSel.value === 'Assigned';
          waveWrap.hidden = !assigned;
          if (assigned && waveSel && !waveSel.value) {
            var sw = panel.getAttribute('data-sug-wave');
            if (sw) waveSel.value = sw;
          }
          if (saved) saved.hidden = true;   // any edit clears the "Saved" tick
        };
      }
      var cancel = panel.querySelector('.ex-triage-cancel');
      if (cancel) cancel.onclick = function () {
        var item = panel.closest('.ex-tl-item');
        var btn = item && item.querySelector('.ex-tl-triage-btn');
        panel.hidden = true;
        if (btn) btn.setAttribute('aria-expanded', 'false');
      };
      var save = panel.querySelector('.ex-triage-save');
      if (save) save.onclick = function () {
        // defence in depth: the view is director-gated, re-check before writing.
        if (WP.can && !WP.can('viewSettings')) return;
        var id = panel.getAttribute('data-fb-id');
        var status = statusSel ? statusSel.value : 'New';
        var wave = (status === 'Assigned' && waveSel) ? (parseInt(waveSel.value, 10) || null) : null;
        if (status === 'Assigned' && !wave) { toastNeedWave(host); return; }
        triageSet(id, status, wave);
        // Confirm the save inline FIRST (so the click visibly registers), then
        // re-fold from the warehouse + overlay so the row's chip/tags update.
        if (saved) saved.hidden = false;
        rememberOpenTriage(id);            // keep this panel open across the repaint
        if (lastBaseData) paintBody(host, lastBaseData);
      };
    });
    restoreOpenTriage(host);   // re-open + re-confirm the panel we just saved
  }
  // Repaint collapses every panel; remember which one was mid-save so we can
  // re-open it and re-show its "Saved" tick, so Save never feels like a no-op.
  var _openTriageId = null;
  function rememberOpenTriage(id) { _openTriageId = id; }
  function restoreOpenTriage(host) {
    if (!_openTriageId) return;
    var panel = host.querySelector('.ex-triage[data-fb-id="' + (window.CSS && CSS.escape ? CSS.escape(_openTriageId) : _openTriageId) + '"]');
    if (panel) {
      panel.hidden = false;
      var item = panel.closest('.ex-tl-item');
      var btn = item && item.querySelector('.ex-tl-triage-btn');
      if (btn) btn.setAttribute('aria-expanded', 'true');
      var saved = panel.querySelector('.ex-triage-saved');
      if (saved) saved.hidden = false;
    }
    _openTriageId = null;
  }
  // Small inline nudge when Assigned is chosen without a wave (no global toast dep).
  function toastNeedWave(host) {
    var el = host.querySelector('.ex-triage:not([hidden]) .ex-triage-wave');
    if (el) { el.hidden = false; el.classList.add('ex-triage-wave--need');
      setTimeout(function () { el.classList.remove('ex-triage-wave--need'); }, 1500); }
  }

  function paintError(host) {
    const bodyEl = host.querySelector('.ex-body');
    if (bodyEl) bodyEl.innerHTML = errorHTML();
    const retry = host.querySelector('#exec-retry');
    if (retry) retry.onclick = function () { load(host); };
  }

  // Empty state - a real "no data yet" message, NOT sample data. Shown when the
  // warehouse file is missing or has no run yet (generated == null).
  function emptyHTML() {
    const t = WP.i18n.t;
    return '<div class="ex-empty ex-empty--nodata">' + ui.icon('clock', 20) +
      ' <span>' + esc(t('execNoData')) + '</span></div>';
  }
  function paintEmpty(host) {
    const bodyEl = host.querySelector('.ex-body');
    if (bodyEl) bodyEl.innerHTML = emptyHTML();
  }

  function load(host) {
    const my = ++token;
    const bodyEl = host.querySelector('.ex-body');
    if (bodyEl) bodyEl.innerHTML = skeleton();
    // GitHub warehouse: fetch the committed JSON directly (no JSONP, no CORS -
    // same-origin file on Pages). Cache-busted so a fresh commit shows at once.
    const url = (WP.config.execStatusData || 'data/exec-status.json') + '?t=' + Date.now();
    fetch(url, { cache: 'no-store' }).then(function (res) {
      if (!res.ok) throw new Error('http ' + res.status);
      return res.json();
    }).then(function (data) {
      if (my !== token) return;                 // superseded by a newer load
      if (!data || data.generated == null) { paintEmpty(host); return; }  // first run pending
      // Also fold in triaged user feedback (data/feedback.json), so the SAME
      // timeline + filters show incoming ideas alongside shipped delivery. This
      // is best-effort: a missing/failed feedback file must never break the page.
      Promise.all([loadFeedback(), loadBacklog()]).then(function (arr) {
        if (my !== token) return;
        lastFeedbackRaw = arr[0];     // keep the RAW payload so paintBody can re-fold
        lastBacklog = arr[1];         // durable planned-work backlog (may be null)
        paintBody(host, data);        // paintBody folds feedback + backlog itself
      });
    }).catch(function () {
      if (my !== token) return;
      paintError(host);
    });
  }

  // Fetch the feedback warehouse RAW (unmapped). Resolves to null on any problem
  // (missing file, bad JSON, offline) - the Project delivery page stands on its own.
  function loadFeedback() {
    var url = (WP.config.feedbackData || 'data/feedback.json') + '?t=' + Date.now();
    return fetch(url, { cache: 'no-store' }).then(function (res) {
      if (!res.ok) return null;
      return res.json();
    }).catch(function () { return null; }).then(function (fbRaw) {
      // Fold in feedback the user SAVED locally (when the send transport is not
      // wired). Without this the saved item is written to a store the page never
      // reads, so it appears nowhere - the bug this fixes. Local records sit at
      // the top (most recent first) and are de-duped against the warehouse by id.
      return mergeLocalSaved(fbRaw);
    });
  }

  // Fetch the durable planned-work backlog. Resolves to null on any problem so
  // the page always stands on its own (the CI-regenerated exec-status.json is
  // enough by itself; the backlog only ADDS planned items + wave plan sizes).
  function loadBacklog() {
    var url = (WP.config.deliveryBacklogData || 'data/delivery-backlog.json') + '?t=' + Date.now();
    return fetch(url, { cache: 'no-store' }).then(function (res) {
      if (!res.ok) return null;
      return res.json();
    }).catch(function () { return null; });
  }

  // Fold the durable backlog into a base exec payload: append its planned items
  // (deduped by id), apply wave plan sizes to waves[].planned, and default any
  // wave-less DELIVERY item to the declared default wave so it counts toward that
  // wave's ratio. Pure + fail-safe: bad/empty backlog returns data unchanged.
  function foldBacklog(data, backlog) {
    try {
      if (!backlog || typeof backlog !== 'object') return data;
      var items = Array.isArray(data.items) ? data.items.slice() : [];
      var defWave = +backlog.defaultDeliveryWave || 1;
      // default wave for existing wave-less delivery items (not feedback)
      items = items.map(function (it) {
        if (it && it.source !== 'feedback' && !it.wave) {
          return Object.assign({}, it, { wave: defWave });
        }
        return it;
      });
      // append planned items, deduped by id
      var seen = {};
      items.forEach(function (it) { if (it && it.id) seen[it.id] = true; });
      (Array.isArray(backlog.items) ? backlog.items : []).forEach(function (b) {
        if (b && b.id && !seen[b.id]) { items.push(b); seen[b.id] = true; }
      });
      // apply wave plan sizes
      var plans = backlog.wavePlans || {};
      var names = backlog.waveNames || {};   // CI-safe wave name map (survives exec-status regen)
      var waves = Array.isArray(data.waves) ? data.waves.map(function (w, idx) {
        var no = (+w.no || +w.wave || idx + 1);
        var patch = {};
        if (plans[no] != null) patch.planned = +plans[no];
        if (names[no] && !w.name) patch.name = names[no];
        return Object.keys(patch).length ? Object.assign({}, w, patch) : w;
      }) : (data.waves ? data.waves.slice() : []);
      // Declare waves that exist ONLY in the durable backlog (e.g. the go-live
      // roadmap waves 5+): CI's exec-status.json won't know them until a PR ships
      // under that wave, so create a card here from wavePlans + waveNames. Keeps the
      // whole roadmap visible on Project delivery before any of it has shipped.
      var known = {};
      waves.forEach(function (w, idx) { known[(+w.no || +w.wave || idx + 1)] = true; });
      Object.keys(plans).forEach(function (k) {
        var no = +k;
        if (!no || known[no]) return;
        waves.push({ no: no, name: names[no] || ('Wave ' + no), planned: +plans[no], done: 0, status: 'Later', notes: '' });
        known[no] = true;
      });
      waves.sort(function (a, b) { return (+a.no || +a.wave || 0) - (+b.no || +b.wave || 0); });
      return Object.assign({}, data, { items: items, waves: waves });
    } catch (e) { return data; }
  }

  // Merge locally-saved feedback into the warehouse payload. Best-effort and
  // fail-safe: any error just returns the warehouse data unchanged.
  function mergeLocalSaved(fbRaw) {
    try {
      var local = (WP.ui.feedback && WP.ui.feedback.savedItems) ? WP.ui.feedback.savedItems() : [];
      if (!local || !local.length) return fbRaw;
      var base = (fbRaw && Array.isArray(fbRaw.items)) ? fbRaw.items : [];
      var seen = {};
      base.forEach(function (it) { if (it && it.id) seen[it.id] = true; });
      var extra = local.filter(function (it) { return it && it.id && !seen[it.id]; });
      // newest local first, then the warehouse items
      return Object.assign({}, fbRaw || {}, { items: extra.reverse().concat(base) });
    } catch (e) { return fbRaw; }
  }

  function render(root) {
    // Defence in depth — never render for a viewer who shouldn't see it, and
    // never render when no live endpoint is configured.
    if (!WP.execDeckVisible || !WP.execDeckVisible()) { WP.setState({ route: 'dashboard' }); return; }

    root.innerHTML = headerHTML(null) + '<div class="ex-body">' + skeleton() + '</div>';

    const refresh = root.querySelector('#exec-refresh');
    if (refresh) refresh.onclick = function () { load(root); };

    load(root);
  }

  WP.ui = WP.ui || {};
  WP.ui.exec = { render: render };
})(window.WP = window.WP || {});
