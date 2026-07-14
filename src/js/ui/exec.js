/* ============================================================
 * Tempo — Executive Status (the live "deck", in-app)
 * ------------------------------------------------------------
 * A director/admin's one-screen status: portfolio health, what needs
 * you now, and team-by-team load — all from the SAME live engine the
 * dashboard uses (capacity + growth + access scope). No mock numbers,
 * no external Slides to keep in sync: it updates itself.
 *
 * Gated to viewSettings (director/admin) — re-checked here (defence in
 * depth). ETHICS: work + decisions only (Constitution II); the "needs
 * you" list is early SUPPORT, never a ranking of people.
 * ========================================================== */
(function (WP) {
  'use strict';
  const ui = WP.ui;

  // Single gate for every Executive-status entry point (page, nav tab, card).
  WP.execVisible = function () { return !!(WP.can && WP.can('viewSettings')); };

  function stat(label, value, sub, color, info) {
    const infoHtml = info
      ? ' <span class="kpi-info" tabindex="0" role="img" aria-label="' + ui.esc(info) + '" title="' + ui.esc(info) + '">' + ui.icon('info', 13) + '</span>'
      : '';
    return '<div class="card"><div class="label">' + label + infoHtml + '</div>' +
      '<div class="value"' + (color ? ' style="color:' + color + '"' : '') + '>' + value + '</div>' +
      '<div class="sub">' + (sub || '') + '</div></div>';
  }

  function loadBar(pct) {
    const c = ui.stateColor(WP.capacity.stateForLoad(pct));
    return '<span class="bar"><i style="width:' + Math.min(100, pct) + '%;background:' + c + '"></i></span>';
  }

  function render(root) {
    const t = WP.i18n.t;
    if (!WP.execVisible()) { WP.setState({ route: 'map' }); return; }

    const viewer = WP.viewer();
    const win = WP.state.window, ref = WP.state.refDate;
    const people = WP.access.visiblePeople(viewer);
    const m = WP.capacity.teamMetrics(people, win, ref);
    const mPrev = WP.capacity.teamMetrics(people, win, WP.capacity.priorRefDate(win, ref));
    const period = t(win);

    // ── "What needs you" — people at/over capacity or flagged for support.
    // Framed as support (Ethics #5), capped, sorted by load. Never a ranking.
    const attn = m.snaps.filter(function (s) {
      return s.state.key === 'overloaded' || s.state.key === 'near' || s.burnout;
    }).sort(function (a, b) { return b.load - a.load; }).slice(0, 8);

    // Talent signals across the org (fair-shot / flight-risk / ramping) — counts only.
    let risk = 0, fairShot = 0, ramp = 0;
    people.forEach(function (p) {
      if (WP.growth.flightRisk(p).risk) risk++;
      if (WP.growth.promotionReadiness(p).fairnessGap) fairShot++;
      if (WP.growth.isRamping(p)) ramp++;
    });

    // ── Team-by-team load (per direct report who leads a team).
    const leads = WP.access.directReports(viewer.id);
    const teamRows = leads.map(function (lead) {
      const team = WP.access.teamOf(lead.id);
      const tm = WP.capacity.teamMetrics(team, win, ref);
      const avg = Math.round(tm.snaps.reduce(function (a, s) { return a + s.load; }, 0) / (tm.snaps.length || 1));
      return '<div class="lr"><span class="nm">' + ui.esc(WP.i18n.name(lead).split(' ')[0]) +
        '<span class="ttl"> · ' + team.length + '</span></span>' + loadBar(avg) +
        '<span class="dash-pct">' + avg + '%</span>' +
        '<span class="tag">' + tm.teamHealth + '% ' + t('healthy') + '</span></div>';
    }).join('');

    const attnHtml = attn.length ? attn.map(function (s) {
      const p = WP.access.byId(s.id);
      const c = ui.stateColor(s.state);
      const reason = s.burnout ? t('burnoutShort') : t('overloadedShort');
      return '<div class="dash-row" data-open="' + s.id + '" style="--node-accent:' + c + '">' +
        ui.avatar(p, c) +
        '<div class="dash-meta"><div class="nm">' + ui.esc(WP.i18n.name(p)) + '</div>' +
          '<div class="ttl">' + ui.esc(WP.i18n.title(p)) + '</div></div>' +
        '<span class="dash-pct" style="color:' + c + '">' + s.load + '%</span>' +
        '<span class="tag" style="color:var(--state-' + (s.state.key === 'overloaded' || s.burnout ? 'overloaded' : 'near') + ')">' + reason + '</span>' +
      '</div>';
    }).join('') : '<div class="sub">' + t('allClear') + '</div>';

    const hasData = m.snaps.some(function (s) { return s.load > 0; });
    const healthVal = hasData ? m.teamHealth + '%' : '—';
    const healthSub = hasData
      ? t('healthyBandSplit').replace('{h}', m.healthyCount).replace('{n}', m.size)
      : t('noDataYet');

    root.innerHTML =
      ui.pageHeader({
        crumbs: [{ label: t('bcTempo'), route: 'dashboard' }, { label: t('execStatus') }],
        title: t('execStatus'),
        subtitle: t('execSub').replace('{n}', people.length),
      }) +
      ui.provenanceNote() +
      '<div class="metrics">' +
        stat(t('teamHealth'), healthVal, healthSub, 'var(--state-balanced)', t('teamHealthInfo')) +
        stat(t('available'), m.counts.available, t('ofPeople').replace('{n}', people.length), 'var(--state-available)') +
        stat(t('nearCapacity'), m.nearOrOver, t('nearCapSub'), 'var(--state-overloaded)', t('nearCapInfo')) +
        stat(t('earlyWarnings'), m.earlyWarnings, t('burnoutShort')) +
      '</div>' +

      '<div class="grid-2" style="align-items:start">' +
        '<div class="section"><h3>' + ui.icon('alert', 16) + ' ' + t('needsAttention') + '</h3>' + attnHtml + '</div>' +
        '<div class="section"><h3>' + ui.icon('sprout', 16) + ' ' + t('talent') + '</h3>' +
          '<div class="metrics" style="grid-template-columns:repeat(3,1fr)">' +
            stat(t('dashFairShot'), fairShot, t('rdFairTitle'), 'var(--state-available)') +
            stat(t('flightRisk').split(' ')[0], risk, t('flightRisk'), 'var(--state-overloaded)') +
            stat(t('rampingShort'), ramp, t('rampingUp').split('—')[0]) +
          '</div></div>' +
      '</div>' +

      (teamRows
        ? '<div class="section"><h3>' + ui.icon('users', 16) + ' ' + t('teamLoad') + '</h3>' + teamRows + '</div>'
        : '');

    // Clicking a "needs you" person opens their profile (accessible rows).
    root.querySelectorAll('[data-open]').forEach(function (el) {
      const open = function () { WP.setState({ route: 'profile', selectedId: el.dataset.open }); };
      el.setAttribute('tabindex', '0');
      el.setAttribute('role', 'button');
      const p = WP.access.byId(el.dataset.open);
      if (p) el.setAttribute('aria-label', WP.i18n.t('openProfile') + ' — ' + WP.i18n.name(p));
      el.onclick = open;
      el.onkeydown = function (ev) { if (ev.key === 'Enter' || ev.key === ' ') { ev.preventDefault(); open(); } };
    });
  }

  WP.ui.exec = { render: render };
})(window.WP = window.WP || {});
