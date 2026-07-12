/* ============================================================
 * Webook Workload — "My Progress" (the employee's daily home)
 * ------------------------------------------------------------
 * The healthy-engagement dashboard: small wins, gentle streak,
 * endowed goal progress, recognition. No leaderboards, no shaming,
 * nothing tied to overwork. The thing that makes people WANT to
 * open it daily — for progress + recognition, not grinding.
 * ========================================================== */
(function (WP) {
  'use strict';
  const ui = WP.ui;

  function render(root) {
    const t = WP.i18n.t;
    const me = WP.viewer();
    if (!me || me.id === '__admin__') {
      root.innerHTML = '<div class="section"><div class="sub">' + t('meNoPersonal') + '</div></div>';
      return;
    }
    const e = WP.engage.get(me.id);
    const goalPct = e.weekGoal > 0 ? Math.min(100, Math.round((e.weekDone / e.weekGoal) * 100)) : 0;
    const habitDays = WP.engage.habitDays;            // ~66 (Lally 2010)
    const habitPct = Math.min(100, Math.round((e.daysActive / habitDays) * 100));
    const nextMs = WP.engage.nextMilestone(e.streak);
    const justHit = WP.data.MILESTONES.indexOf(e.streak) !== -1;
    e.doneYesterday = e.doneYesterday || [];
    const loggedToday = e.doneToday.length > 0;
    const day = (WP._meDay = WP._meDay || 'today');  // WHOOP-style: log for today OR backfill yesterday

    const doneFeed = e.doneToday.length
      ? e.doneToday.map(function (d) { return '<div class="done-item"><span class="done-tick">' + WP.ui.icon('check',14) + '</span> ' + ui.esc(d) + '</div>'; }).join('')
      : '<div class="sub">' + t('noneYet') + '</div>';

    const kudos = e.kudos.length
      ? e.kudos.map(function (k) {
          const from = WP.access.byId(k.from);
          return '<div class="kudo"><div class="kudo-from">' + (from ? ui.esc(WP.i18n.name(from)) : '—') + '</div>' +
            '<div>“' + ui.esc(k.text) + '”</div></div>';
        }).join('')
      : '<div class="sub">' + t('noKudos') + '</div>';

    root.innerHTML =
      '<div class="me-hi">' + t('hi') + ', ' + ui.esc(WP.i18n.name(me).split(' ')[0]) + '</div>' +
      '<div class="sub" style="margin-bottom:10px">' + t('meSub') + '</div>' +
      '<button class="btn primary" id="checkin-btn" style="margin-bottom:14px">' + WP.ui.icon('pencil',15) + ' ' + t('dailyCheckinBtn') + '</button>' +

      // daily reminder (WHOOP-style nudge to log — gentle, never shaming)
      (!loggedToday ? '<div class="banner-info">' + WP.ui.icon('clock',15) + ' ' + t('logReminder') + '</div>' : '') +

      // milestone celebration (gentle, only when a milestone is reached)
      (justHit ? '<div class="banner-info">' + WP.ui.icon('sparkles', 15) + ' ' + t('milestoneHit').replace('{n}', e.streak) + '</div>' : '') +

      // habit meter — the journey to ~66 days (the science, not "21 days")
      '<div class="section"><h3>' + WP.ui.icon('sprout',15) + ' ' + t('habitForming') + '</h3>' +
        '<div class="track" style="height:12px"><i style="width:' + habitPct + '%"></i></div>' +
        '<div class="ttl" style="margin-top:6px">' + t('dayOf').replace('{d}', e.daysActive).replace('{n}', habitDays) +
          (nextMs ? ' · ' + t('toMilestone').replace('{x}', Math.max(0, nextMs - e.streak)).replace('{m}', nextMs) : ' · ' + t('habitFormed')) + '</div>' +
        '<div class="disclaimer">' + t('habitNote') + '</div></div>' +

      '<div class="me-grid">' +
        // streak (gentle)
        '<div class="me-tile"><div class="me-big">' + WP.ui.icon('flame',15) + ' ' + e.streak + '</div>' +
          '<div class="me-label">' + t('dayStreak') + '</div>' +
          '<div class="ttl" style="margin-top:4px">' + e.freeze + ' ' + t('freezeAvail') + '</div></div>' +
        // weekly goal (endowed progress — never starts at 0)
        '<div class="me-tile"><div class="me-label">' + t('weeklyGoal') + '</div>' +
          '<div class="me-big" style="font-size:24px">' + e.weekDone + ' / ' + e.weekGoal + '</div>' +
          '<div class="track" style="margin-top:8px"><i style="width:' + goalPct + '%"></i></div>' +
          '<div class="ttl" style="margin-top:6px">' + (goalPct >= 100 ? t('goalHit') : t('almostThere').replace('{p}', goalPct)) + '</div></div>' +
        // growth / level
        '<div class="me-tile"><div class="me-label">' + t('yourGrowth') + '</div>' +
          '<div class="me-big" style="font-size:20px">' + ui.esc(e.level) + ' · L' + e.levelNo + '</div>' +
          '<div class="track" style="margin-top:8px"><i style="width:' + e.levelPct + '%"></i></div>' +
          '<div class="ttl" style="margin-top:6px">' + t('toNextLevel').replace('{p}', e.levelPct) + '</div></div>' +
      '</div>' +

      // Done today — the hero (Progress Principle)
      '<div class="section"><h3>' + WP.ui.icon('check',15) + ' ' + t('doneToday') + '</h3>' + doneFeed +
        (e.doneYesterday.length ? '<div class="mini-label" style="margin-top:10px">' + t('yesterdayCatchup') + '</div>' +
          e.doneYesterday.map(function (d) { return '<div class="done-item"><span class="done-tick">' + WP.ui.icon('check',14) + '</span> ' + ui.esc(d) + '</div>'; }).join('') : '') +
        '<div class="seg" style="margin-top:12px">' +
          '<button data-day="today" class="' + (day === 'today' ? 'active' : '') + '">' + t('forToday') + '</button>' +
          '<button data-day="yesterday" class="' + (day === 'yesterday' ? 'active' : '') + '">' + t('forYesterday') + '</button></div>' +
        '<div style="display:flex;gap:8px;margin-top:8px">' +
          '<input id="win" class="req-i" style="flex:1" placeholder="' + t('addWinPh') + '" />' +
          '<button class="btn primary" id="add-win">' + WP.ui.icon('plus', 14) + ' ' + t('addWin') + '</button></div>' +
        '<div class="disclaimer">' + t('backfillNote') + '</div></div>' +

      // recognition
      '<div class="section"><h3>' + WP.ui.icon('star',16) + ' ' + t('kudosInbox') + '</h3>' + kudos + '</div>' +

      '<div class="disclaimer">' + t('meEthos') + '</div>';

    const add = root.querySelector('#add-win');
    const inp = root.querySelector('#win');
    function addWin() {
      const v = (inp.value || '').trim();
      if (!v) return;
      if (day === 'yesterday') {
        e.doneYesterday.unshift(v);
        WP.logEvent({ type: 'win-backfill', by: me.id, target: v + ' (yesterday · streak protected)' });
      } else {
        e.doneToday.unshift(v);
        e.weekDone = Math.min(e.weekGoal, e.weekDone + 1);
        WP.logEvent({ type: 'win-logged', by: me.id, target: v });
      }
      WP.setState({});
    }
    if (add) add.onclick = addWin;
    if (inp) inp.onkeydown = function (ev) { if (ev.key === 'Enter') addWin(); };
    root.querySelectorAll('[data-day]').forEach(function (b) {
      b.onclick = function () { WP._meDay = b.dataset.day; WP.setState({}); };
    });
    const cb = root.querySelector('#checkin-btn');
    if (cb) cb.onclick = function () { WP.ui.dailyPrompt.open(); };
  }

  WP.ui.me = { render: render };
})(window.WP = window.WP || {});
