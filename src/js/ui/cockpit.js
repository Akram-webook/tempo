/* ============================================================
 * Webook Workload — Manager Cockpit  (MVP)
 * ------------------------------------------------------------
 * The one screen a manager opens to answer, in ~30s:
 *   are we going to be overloaded · who · when · why · what to do.
 * Reads WP.workload (pure engine). No hours — a tier-weighted load index.
 * Route: 'workload'. Individual drawer + skill-aware what-if live here.
 * ========================================================== */
(function (WP) {
  'use strict';
  var ui = WP.ui;

  function t(k) { return WP.i18n.t(k); }
  function esc(s) { return ui.esc(s); }
  function evName(ev) { return WP.i18n.eventName ? WP.i18n.eventName(ev) : (ev && (WP.state.lang === 'ar' ? ev.nameAr : ev.nameEn) || ev.id); }
  function fdate(iso) { try { return WP.i18n.shortDate ? WP.i18n.shortDate(iso) : iso.slice(5); } catch (e) { return iso.slice(5); } }
  function stColor(state) { return ui.stateColor(state); }
  function stLabel(state) { return WP.i18n.stateLabel ? WP.i18n.stateLabel(state) : (WP.state.lang === 'ar' ? state.labelAr : state.labelEn); }

  var HORIZONS = [
    { val: 'today', label: 'hzToday' }, { val: '7', label: 'hz7' }, { val: '14', label: 'hz14' },
  ];
  function horizon() { return WP.state.cockpitHorizon || '14'; }
  function primaryLoad(snap) {
    var h = horizon();
    return h === 'today' ? { load: snap.today, state: snap.todayState, date: snap.forecast.ref }
      : h === '7' ? { load: snap.peak7, state: snap.peak7State, date: snap.peak7Date }
      : { load: snap.peak14, state: snap.peak14State, date: snap.peak14Date };
  }

  /* ---- small view helpers ---- */
  function loadChip(load, state) {
    return '<span class="wl-chip" style="--c:' + stColor(state) + '">' +
      '<span class="wl-dot"></span>' + load + '%<span class="wl-chip-l"> ' + esc(stLabel(state)) + '</span></span>';
  }
  function kpi(label, value, sub, info) {
    var inf = info ? ' <span class="kpi-info" tabindex="0" role="img" aria-label="' + esc(info) + '" title="' + esc(info) + '">' + ui.icon('info', 13) + '</span>' : '';
    return '<div class="card"><div class="label">' + esc(label) + inf + '</div>' +
      '<div class="value">' + value + '</div><div class="sub">' + (sub || '') + '</div></div>';
  }
  // A 14-day mini heat strip for one person (no numbers — the row chip carries the value).
  function spark(snap) {
    return '<span class="wl-spark" aria-hidden="true">' + snap.forecast.timeline.map(function (d) {
      return '<i class="wl-sp wl-sp--' + d.state.key + '" title="' + fdate(d.date) + ': ' + d.load + '%"></i>';
    }).join('') + '</span>';
  }

  /* ---- the "why" breakdown for a given day (load = Σ event intensities) ---- */
  function whyParts(person, iso) {
    return WP.workload.driversOn(person, iso).map(function (dr) {
      return esc(evName(dr.event)) + ' ' + dr.intensity + '%';
    });
  }

  /* ============================ TEAM COCKPIT ============================ */
  function teamView(root, viewer) {
    var people = WP.access.visiblePeople(viewer).filter(function (p) { return !p.tbc; });
    var ref = WP.workload.refToday();
    var tm = WP.workload.teamMetrics(people, ref);
    // rank people by pressure, worst first
    var ranked = tm.snaps.map(function (s) { return { s: s, p: WP.access.byId(s.id) }; })
      .filter(function (r) { return r.p; })
      .sort(function (a, b) { return b.s.pressure.score - a.s.pressure.score || b.s.peak14 - a.s.peak14; });
    var windows = WP.workload.pressureWindows(people, ref, 6);
    var drivers = WP.workload.driversRollup(people, ref, 5);

    var kpis = '<div class="metrics wl-kpis">' +
      kpi(t('kAvgToday'), tm.avgToday + '%', t('kAvgTodaySub'), t('kAvgTodayInfo')) +
      kpi(t('kOverloaded'), tm.overloadedToday, t('kOverloadedSub')) +
      kpi(t('kAtRisk'), tm.atRisk7, t('kAtRiskSub')) +
      kpi(t('kHealthy'), tm.healthyToday, t('ofN').replace('{n}', people.length)) +
      kpi(t('kTeamPeak'), tm.teamPeak7 + '%', tm.teamPeak7Date ? t('onDate').replace('{d}', fdate(tm.teamPeak7Date)) : '—') +
      kpi(t('kWindows'), windows.length, t('kWindowsSub')) +
    '</div>';

    // team workload list (ranked by risk)
    var listRows = ranked.map(function (r) {
      var pl = primaryLoad(r.s);
      return '<div class="wl-row" data-open="' + r.s.id + '" tabindex="0" role="button" ' +
        'aria-label="' + esc(t('openDetail') + ' — ' + WP.i18n.name(r.p)) + '" style="--node-accent:' + stColor(pl.state) + '">' +
        ui.avatar(r.p, stColor(pl.state)) +
        '<div class="wl-meta"><div class="nm">' + esc(WP.i18n.name(r.p)) + '</div>' +
          '<div class="ttl">' + esc(WP.i18n.title(r.p)) + '</div></div>' +
        spark(r.s) +
        '<span class="wl-peaks">' + loadChip(pl.load, pl.state) +
          '<span class="wl-sub2">' + t('peakShort') + ' ' + r.s.peak14 + '% · ' + esc(t('pr_' + r.s.pressure.level)) + '</span></span>' +
      '</div>';
    }).join('') || '<div class="sub">' + t('allClearTeam') + '</div>';

    // heatmap (people × 14 days)
    var days = WP.workload.timeline(ranked[0] ? ranked[0].p : people[0], ref, WP.workload.HORIZON);
    var head = '<div class="wl-hm-row wl-hm-head"><span class="wl-hm-name"></span>' +
      days.map(function (d, i) { return '<span class="wl-hm-col' + (i === 0 ? ' is-today' : '') + '">' + (i === 0 ? t('todayShort') : fdate(d.date)) + '</span>'; }).join('') + '</div>';
    var HM_CAP = 16;
    var hmRows = ranked.slice(0, HM_CAP).map(function (r) {
      var tl = WP.workload.timeline(r.p, ref, WP.workload.HORIZON);
      return '<div class="wl-hm-row" data-open="' + r.s.id + '" tabindex="0" role="button" aria-label="' + esc(WP.i18n.name(r.p)) + '">' +
        '<span class="wl-hm-name">' + esc(WP.i18n.name(r.p).split(' ')[0]) + '</span>' +
        tl.map(function (d) {
          return '<span class="wl-hm-cell wl-hm--' + d.state.key + '" title="' + esc(WP.i18n.name(r.p)) + ' · ' + fdate(d.date) + ': ' + d.load + '% (' + esc(stLabel(d.state)) + ')">' + (d.load || '') + '</span>';
        }).join('') + '</div>';
    }).join('');
    var hmMore = ranked.length > HM_CAP ? '<div class="sub wl-hm-more">' + t('andMore').replace('{n}', ranked.length - HM_CAP) + '</div>' : '';
    var legend = '<div class="wl-legend">' + WP.data.LOAD_STATES.map(function (b) {
      return '<span class="wl-lg"><i class="wl-hm-cell wl-hm--' + b.key + '"></i>' + esc(WP.state.lang === 'ar' ? b.labelAr : b.labelEn) + ' (' + b.min + (b.max >= 9999 ? '+' : '–' + b.max) + ')</span>';
    }).join('') + '</div>';

    // pressure windows
    var winHtml = windows.length ? windows.map(function (w) {
      var p = WP.access.byId(w.personId);
      var drv = w.drivers.slice(0, 3).map(function (d) { return esc(evName(WP.data.EVENTS[d.id])); }).join(' · ');
      var range = w.from === w.to ? fdate(w.from) : fdate(w.from) + ' → ' + fdate(w.to);
      return '<div class="wl-win"><div class="wl-win-top">' +
        '<b>' + esc(p ? WP.i18n.name(p) : w.personId) + '</b>' +
        '<span class="wl-chip" style="--c:' + stColor(WP.workload.stateFor(w.peak)) + '"><span class="wl-dot"></span>' + w.peak + '%</span></div>' +
        '<div class="wl-win-when">' + ui.icon('clock', 13) + ' ' + range + '</div>' +
        '<div class="wl-win-why sub">' + t('drivenBy') + ': ' + drv + '</div>' +
        '<div class="wl-win-act">' + ui.icon('arrowRight', 13) + ' ' + t(w.action === 'add-support' ? 'actAddSupport' : 'actRedistribute') + '</div>' +
      '</div>';
    }).join('') : '<div class="sub">' + t('noWindows') + '</div>';

    // workload drivers (top events)
    var drvHtml = drivers.length ? drivers.map(function (d) {
      return '<div class="wl-drv"><span class="wl-tier wl-tier--' + d.event.tier + '"></span>' +
        '<span class="nm">' + esc(evName(d.event)) + '</span>' +
        '<span class="sub">' + t('nPeople').replace('{n}', d.peopleCount) + '</span></div>';
    }).join('') : '<div class="sub">—</div>';

    root.innerHTML =
      ui.provenanceNote() +
      ui.pageHeader({
        crumbs: [{ label: t('bcTempo'), route: 'workload' }, { label: t('navWorkload') }],
        title: t('wlTitle'),
        subtitle: t('wlSub').replace('{n}', people.length),
        right: ui.subTabs(HORIZONS.map(function (h) { return { val: h.val, label: t(h.label) }; }), horizon()),
      }) +
      kpis +
      '<div class="wl-grid">' +
        '<div class="section wl-c-main"><h3>' + ui.icon('users', 16) + ' ' + t('secTeam') + '</h3>' + listRows + '</div>' +
        '<div class="section wl-c-side"><h3>' + ui.icon('alert', 16) + ' ' + t('secWindows') + '</h3>' + winHtml + '</div>' +
      '</div>' +
      '<div class="section"><h3>' + ui.icon('grid', 16) + ' ' + t('secHeatmap') + '</h3>' +
        '<div class="wl-hm-scroll">' + head + hmRows + '</div>' + hmMore + legend + '</div>' +
      '<div class="wl-grid">' +
        '<div class="section wl-c-side"><h3>' + ui.icon('flame', 16) + ' ' + t('secDrivers') + '</h3>' + drvHtml + '</div>' +
        '<div class="section wl-c-main"><h3>' + ui.icon('sparkles', 16) + ' ' + t('secActions') + '</h3>' + actionsHtml(windows) + '</div>' +
      '</div>';

    wire(root);
  }

  // Recommended actions derived ONLY from real pressure windows (no filler).
  function actionsHtml(windows) {
    if (!windows.length) return '<div class="sub">' + t('actNone') + '</div>';
    return windows.slice(0, 4).map(function (w) {
      var p = WP.access.byId(w.personId);
      var top = w.drivers[0] ? WP.data.EVENTS[w.drivers[0].id] : null;
      var verb = w.action === 'add-support' ? t('actAddSupport') : t('actRedistribute');
      return '<div class="wl-act">' +
        '<div class="wl-act-txt">' + esc(verb) + ' — <b>' + esc(p ? WP.i18n.name(p) : w.personId) + '</b> ' +
          t('peaksAt').replace('{load}', w.peak).replace('{date}', fdate(w.peakDate)) + '</div>' +
        (top ? '<button class="btn" data-whatif="' + esc(top.id) + '" data-from="' + esc(w.personId) + '">' + ui.icon('arrowRight', 14) + ' ' + t('simReassign') + '</button>' : '') +
      '</div>';
    }).join('');
  }

  /* ============================ INDIVIDUAL DRAWER ============================ */
  function openDrawer(personId) {
    var p = WP.access.byId(personId); if (!p) return;
    var ref = WP.workload.refToday();
    var snap = WP.workload.snapshot(p, ref);
    var pr = snap.pressure;
    var host = document.getElementById('overlay-host'); if (!host) return;

    var tl = snap.forecast.timeline;
    var strip = tl.map(function (d, i) {
      return '<div class="wl-tl-day' + (i === 0 ? ' is-today' : '') + '">' +
        '<span class="wl-hm-cell wl-hm--' + d.state.key + '" title="' + d.load + '%">' + (d.load || '') + '</span>' +
        '<span class="wl-tl-d">' + (i === 0 ? t('todayShort') : fdate(d.date)) + '</span></div>';
    }).join('');

    // WHY: today's math, explicit
    var parts = whyParts(p, ref);
    var whyToday = parts.length
      ? snap.today + '% = ' + parts.join(' + ')
      : t('whyIdle');

    // drivers (peak day)
    var peakParts = whyParts(p, snap.peak14Date);
    // pressure factors
    var f = pr.factors;
    var factorChips = [
      t('fPeak').replace('{load}', f.peakLoad).replace('{date}', fdate(f.peakDate)),
      t('fConc').replace('{n}', f.maxConcurrent),
      f.deadline ? t('fDeadline').replace('{d}', fdate(f.deadline)) : null,
      f.megaActive ? t('fMega') : null,
    ].filter(Boolean).map(function (x) { return '<span class="tag">' + esc(x) + '</span>'; }).join('');

    // actions: reassign each current driver
    var drv = WP.workload.driversOn(p, snap.peak14Date);
    var actions = drv.length ? drv.map(function (d) {
      return '<div class="wl-act"><div class="wl-act-txt">' + esc(evName(d.event)) + ' <span class="sub">' + d.intensity + '%</span></div>' +
        '<button class="btn" data-whatif="' + esc(d.id) + '" data-from="' + esc(p.id) + '">' + t('simReassign') + '</button></div>';
    }).join('') : '<div class="sub">' + t('noDrivers') + '</div>';

    host.innerHTML =
      '<div class="wl-drawer-scrim" data-close="1"></div>' +
      '<aside class="wl-drawer" role="dialog" aria-modal="true" aria-label="' + esc(WP.i18n.name(p)) + '">' +
        '<button class="wl-dclose" data-close="1" aria-label="' + esc(t('close')) + '">' + ui.icon('x', 16) + '</button>' +
        '<div class="wl-dhead">' + ui.avatar(p, stColor(snap.todayState)) +
          '<div><h2>' + esc(WP.i18n.name(p)) + '</h2><div class="sub">' + esc(WP.i18n.title(p)) + '</div></div></div>' +
        // overview
        '<div class="wl-dov">' +
          '<div><div class="label">' + t('dwToday') + '</div>' + loadChip(snap.today, snap.todayState) + '</div>' +
          '<div><div class="label">' + t('dwPeak7') + '</div>' + loadChip(snap.peak7, snap.peak7State) + '</div>' +
          '<div><div class="label">' + t('dwPeak14') + '</div>' + loadChip(snap.peak14, snap.peak14State) + '</div>' +
          '<div><div class="label">' + t('dwPressure') + '</div><span class="wl-chip wl-pr--' + pr.level + '"><span class="wl-dot"></span>' + esc(t('pr_' + pr.level)) + '</span></div>' +
        '</div>' +
        '<div class="wl-dnote sub">' + ui.icon('info', 13) + ' ' + t('dwCapacityNote') + '</div>' +
        // timeline
        '<h3>' + ui.icon('clock', 15) + ' ' + t('dwTimeline') + '</h3><div class="wl-tl">' + strip + '</div>' +
        // why / explainability
        '<h3>' + ui.icon('info', 15) + ' ' + t('dwWhy') + '</h3>' +
        '<div class="wl-why"><div>' + t('whyTodayLbl') + ' ' + esc(whyToday) + '</div>' +
          (peakParts.length ? '<div>' + t('whyPeakLbl').replace('{date}', fdate(snap.peak14Date)) + ' ' + snap.peak14 + '% = ' + peakParts.join(' + ') + '</div>' : '') + '</div>' +
        // pressure
        '<h3>' + ui.icon('flame', 15) + ' ' + t('dwPressure') + '</h3><div class="wl-facts">' + factorChips + '</div>' +
        // actions
        '<h3>' + ui.icon('sparkles', 15) + ' ' + t('dwActions') + '</h3>' + actions +
      '</aside>';

    host.querySelectorAll('[data-close]').forEach(function (el) { el.onclick = function () { host.innerHTML = ''; }; });
    host.querySelectorAll('[data-whatif]').forEach(function (b) {
      b.onclick = function () { openWhatIf(b.dataset.whatif, b.dataset.from); };
    });
    document.onkeydown = function (e) { if (e.key === 'Escape') { host.innerHTML = ''; document.onkeydown = null; } };
  }

  /* ============================ WHAT-IF ============================ */
  function openWhatIf(eventId, fromId) {
    var ev = WP.data.EVENTS[eventId]; if (!ev) return;
    var viewer = WP.viewer();
    var ref = WP.workload.refToday();
    var pool = WP.access.visiblePeople(viewer).filter(function (p) { return !p.tbc && p.id !== fromId; });
    var rows = WP.workload.rankCandidates(eventId, pool, ref);
    var host = document.getElementById('overlay-host'); if (!host) return;
    var from = WP.access.byId(fromId);

    var body = rows.slice(0, 8).map(function (r, i) {
      var afterState = WP.workload.stateFor(r.sim.afterPeak);
      var reason = r.reasons.map(function (x) { return '<span class="tag">' + esc(x) + '</span>'; }).join('');
      return '<div class="wl-cand' + (r.recommended ? ' is-rec' : '') + '">' +
        ui.avatar(r.person, stColor(afterState)) +
        '<div class="wl-cand-meta"><div class="nm">' + esc(WP.i18n.name(r.person)) +
          (r.recommended ? ' <span class="wl-rec">' + ui.icon('check', 12) + ' ' + t('wiRecommended') + '</span>' : '') +
          (!r.skillMatch ? ' <span class="wl-warn">' + t('wiNoSkill') + '</span>' : '') + '</div>' +
          '<div class="wl-cand-proj">' + r.sim.beforePeak + '% → <b style="color:' + stColor(afterState) + '">' + r.sim.afterPeak + '%</b> ' + esc(stLabel(afterState)) + '</div>' +
          '<div class="wl-cand-why">' + reason + '</div></div>' +
        '<button class="btn' + (r.recommended ? ' primary' : '') + '" data-apply="' + esc(r.id) + '"' + (r.sim.softLocked ? ' data-soft="1"' : '') + '>' + t('wiApply') + '</button>' +
      '</div>';
    }).join('');

    host.innerHTML =
      '<div class="wl-drawer-scrim" data-close="1"></div>' +
      '<aside class="wl-drawer wl-wi" role="dialog" aria-modal="true" aria-label="' + esc(t('wiTitle')) + '">' +
        '<button class="wl-dclose" data-close="1" aria-label="' + esc(t('close')) + '">' + ui.icon('x', 16) + '</button>' +
        '<h2>' + t('wiTitle').replace('{event}', esc(evName(ev))) + '</h2>' +
        '<div class="sub wl-wi-from">' + (from ? t('wiFrom').replace('{name}', esc(WP.i18n.name(from))) : '') +
          (ev.requiredSkill ? ' · ' + t('wiNeeds').replace('{skill}', esc(ev.requiredSkill)) : '') + '</div>' +
        '<div class="wl-cands">' + (body || '<div class="sub">—</div>') + '</div>' +
        '<div class="sub wl-wi-note">' + ui.icon('info', 13) + ' ' + t('wiNote') + '</div>' +
      '</aside>';

    host.querySelectorAll('[data-close]').forEach(function (el) { el.onclick = function () { host.innerHTML = ''; }; });
    host.querySelectorAll('[data-apply]').forEach(function (b) {
      b.onclick = function () { applyReassign(eventId, fromId, b.dataset.apply, !!b.dataset.soft); };
    });
  }

  // Manager-initiated reassignment. Soft-locked (would overload) → confirm w/ reason (logged).
  function applyReassign(eventId, fromId, toId, soft) {
    var doIt = function (reason) {
      var from = WP.access.byId(fromId), to = WP.access.byId(toId);
      if (from) from.assignedEvents = (from.assignedEvents || []).filter(function (id) { return id !== eventId; });
      if (to && (to.assignedEvents || []).indexOf(eventId) < 0) to.assignedEvents = (to.assignedEvents || []).concat([eventId]);
      if (WP.logEvent) WP.logEvent('workload.reassign', { event: eventId, from: fromId, to: toId, override: reason || null });
      var host = document.getElementById('overlay-host'); if (host) host.innerHTML = '';
      ui.toast(t('wiDone'), 'ok');
      WP.render();
    };
    if (soft && WP.ui.prompt) {
      WP.ui.prompt({ title: t('wiOverrideTitle'), body: t('wiOverrideBody'), okLabel: t('wiOverrideOk') })
        .then(function (r) { if (r != null && String(r).trim()) doIt(String(r).trim()); });
    } else { doIt(null); }
  }

  /* ---- personal (non-manager) mini view ---- */
  function personalView(root, viewer) {
    var ref = WP.workload.refToday();
    var snap = WP.workload.snapshot(viewer, ref);
    var parts = whyParts(viewer, ref);
    root.innerHTML =
      ui.provenanceNote() +
      ui.pageHeader({ crumbs: [{ label: t('bcTempo'), route: 'workload' }, { label: t('navWorkload') }], title: t('wlMyTitle'), subtitle: t('wlMySub') }) +
      '<div class="metrics wl-kpis">' +
        kpi(t('dwToday'), snap.today + '%', stLabel(snap.todayState)) +
        kpi(t('dwPeak7'), snap.peak7 + '%', stLabel(snap.peak7State)) +
        kpi(t('dwPeak14'), snap.peak14 + '%', stLabel(snap.peak14State)) +
      '</div>' +
      '<div class="section"><h3>' + ui.icon('info', 16) + ' ' + t('dwWhy') + '</h3>' +
        '<div class="wl-why">' + (parts.length ? snap.today + '% = ' + parts.join(' + ') : t('whyIdle')) + '</div>' +
        '<div class="wl-dnote sub">' + ui.icon('info', 13) + ' ' + t('dwCapacityNote') + '</div></div>';
  }

  function wire(root) {
    root.querySelectorAll('[data-open]').forEach(function (el) {
      var open = function () { openDrawer(el.dataset.open); };
      el.onclick = open;
      el.onkeydown = function (e) { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); open(); } };
    });
    root.querySelectorAll('[data-whatif]').forEach(function (b) {
      b.onclick = function (e) { e.stopPropagation(); openWhatIf(b.dataset.whatif, b.dataset.from); };
    });
    root.querySelectorAll('[data-subtab]').forEach(function (b) {
      b.onclick = function () { WP.setState({ cockpitHorizon: b.dataset.subtab }); };
    });
  }

  function render(root) {
    var viewer = WP.viewer();
    if (WP.access.canManage(viewer)) teamView(root, viewer);
    else personalView(root, viewer);
  }

  WP.ui.cockpit = { render: render, openDrawer: openDrawer, openWhatIf: openWhatIf };
})(window.WP = window.WP || {});
