/* ============================================================
 * Webook Workload — Daily Tasks (auto-read from Slack #daily-checkin)
 * ------------------------------------------------------------
 * IA: overview-first summary, then compact "smart cards" — one key line
 * (today's done) + icon chips for status. Full detail (remaining/learned)
 * opens on click (progressive disclosure) to cut cognitive load & space.
 * ========================================================== */
(function (WP) {
  'use strict';
  const ui = WP.ui;

  function isAvailable(p, snap) {
    const dc = p.dailyCheckin;
    return (dc && dc.remaining && /noth|نشيء|nothing/i.test(dc.remaining)) || snap.load === 0;
  }

  function chip(icon, cls, title) {
    return '<span class="dt-chip ' + cls + '" title="' + ui.esc(title) + '" aria-label="' + ui.esc(title) + '">' + WP.ui.icon(icon, 14) + '</span>';
  }

  function card(p) {
    const dc = p.dailyCheckin;
    const snap = WP.capacity.snapshot(p, WP.state.window, WP.state.refDate);
    const c = ui.stateColor(snap.state);
    const t = WP.i18n.t;

    const avail = dc && isAvailable(p, snap);
    const chips =
      (snap.burnout ? chip('flame', 'risk', t('burnoutFlag')) : '') +
      (avail ? chip('sprout', 'ok', t('availableFlag')) : '') +
      (dc && dc.learned && dc.learned !== '—' ? chip('bulb', 'mut', t('learned') + ': ' + dc.learned) : '');

    const line = dc
      ? '<div class="dt-done">' + WP.ui.icon('check', 14) + '<span>' + ui.esc(dc.done || '—') + '</span></div>'
      : '<div class="dt-done none">' + t('noCheckin') + '</div>';

    return '<div class="dt-card" data-id="' + p.id + '" style="--node-accent:' + c + '" title="' + ui.esc(WP.i18n.title(p)) + '">' +
      '<div class="dt-top">' + ui.avatar(p, c) +
        '<div class="dt-id"><div class="nm">' + ui.esc(WP.i18n.name(p)) + '</div>' +
        '<div class="ttl">' + ui.esc(WP.i18n.title(p)) + '</div></div>' +
        '<div class="dt-load" style="color:' + c + '">' + snap.load + '%</div></div>' +
      line +
      (chips ? '<div class="dt-chips">' + chips + '</div>' : '') +
    '</div>';
  }

  function stat(icon, n, label, cls) {
    return '<div class="dt-stat ' + (cls || '') + '">' + WP.ui.icon(icon, 15) +
      '<b>' + n + '</b><span>' + label + '</span></div>';
  }

  function render(root) {
    const t = WP.i18n.t;
    const people = WP.access.visiblePeople(WP.viewer())
      .filter(function (p) { return p.dailyCheckin !== undefined; });

    // counts for the overview strip
    let checkedIn = 0, atRisk = 0, available = 0, noCheckin = 0;
    people.forEach(function (p) {
      const snap = WP.capacity.snapshot(p, WP.state.window, WP.state.refDate);
      if (p.dailyCheckin) checkedIn++; else noCheckin++;
      if (snap.burnout) atRisk++;
      if (p.dailyCheckin && isAvailable(p, snap)) available++;
    });

    // attention-first: at-risk → checked-in (recent) → no check-in last
    people.sort(function (a, b) {
      const sa = WP.capacity.snapshot(a, WP.state.window, WP.state.refDate);
      const sb = WP.capacity.snapshot(b, WP.state.window, WP.state.refDate);
      const rank = function (p, s) { return s.burnout ? 0 : (p.dailyCheckin ? 1 : 2); };
      const ra = rank(a, sa), rb = rank(b, sb);
      if (ra !== rb) return ra - rb;
      return new Date((b.dailyCheckin || {}).at || 0) - new Date((a.dailyCheckin || {}).at || 0);
    });

    root.innerHTML =
      '<button class="btn" id="back" style="margin-bottom:16px"><span class="ar ar-left"></span> ' + t('back') + '</button>' +
      '<h2 style="margin:0 0 2px">' + t('dailyTasks') + '</h2>' +
      '<div class="sub" style="margin-bottom:14px">' + t('dailyTasksNote') + '</div>' +
      (people.length
        ? '<div class="dt-summary">' +
            stat('check', checkedIn, t('checkedIn'), 'ok') +
            stat('flame', atRisk, t('earlyWarnings'), 'risk') +
            stat('sprout', available, t('available'), 'ok') +
            stat('clock', noCheckin, t('noCheckinShort'), 'mut') +
          '</div>' +
          '<div class="dt-grid">' + people.map(card).join('') + '</div>'
        : '<div class="section" style="text-align:center;padding:36px;color:var(--text-muted)">' +
            WP.ui.icon('clock', 22) + '<div style="margin-top:8px">' + t('emptyTeam') + '</div></div>');

    root.querySelector('#back').onclick = function () { WP.setState({ route: 'map' }); };
    root.querySelectorAll('[data-id]').forEach(function (el) {
      el.onclick = function () { WP.setState({ route: 'profile', selectedId: el.dataset.id }); };
    });
  }

  WP.ui.dailyTasks = { render: render };
})(window.WP = window.WP || {});
