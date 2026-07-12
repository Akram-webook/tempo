/* ============================================================
 * Webook Workload — Daily check-in pop-up (on open)
 * ------------------------------------------------------------
 * When you open the app you get one tiny pop-up:
 *   • "Log what I did" — type freely, Save → goes to your progress
 *     and (in production) to Slack #daily-checkin, created if missing.
 *   • "Yesterday's summary" — just SHOWS what you did, info only, no
 *     task to fill — to minimise the work.
 * Effortless, dismissible, once per session. Free text → AI structures
 * it in production. No shaming, no required fields.
 * ========================================================== */
(function (WP) {
  'use strict';
  const ui = WP.ui;

  function open() {
    const me = WP.viewer();
    if (!me || me.id === '__admin__') return;
    const t = WP.i18n.t, host = document.getElementById('overlay-host');
    if (!host) return;
    const e = WP.engage.get(me.id);
    const mode = WP._promptMode || 'log';
    const day = (WP._meDay = WP._meDay || 'today');
    const yest = (e.doneYesterday && e.doneYesterday.length) ? e.doneYesterday
      : (me.dailyCheckin && me.dailyCheckin.done && me.dailyCheckin.done !== '—' ? [me.dailyCheckin.done] : []);

    const tabs = '<div class="seg" style="margin-bottom:12px">' +
      '<button data-mode="log" class="' + (mode === 'log' ? 'active' : '') + '">' + WP.ui.icon('pencil',15) + ' ' + t('checkinLog') + '</button>' +
      '<button data-mode="summary" class="' + (mode === 'summary' ? 'active' : '') + '">' + WP.ui.icon('eye',15) + ' ' + t('checkinSummary') + '</button></div>';

    let body;
    if (mode === 'summary') {
      body = '<div class="mini-label">' + t('yesterdaySummary') + '</div>' +
        (yest.length ? yest.map(function (d) { return '<div class="done-item"><span class="done-tick">' + WP.ui.icon('check',14) + '</span> ' + ui.esc(d) + '</div>'; }).join('')
                     : '<div class="sub">' + t('nothingYesterday') + '</div>');
    } else {
      body = '<div class="seg" style="margin-bottom:8px">' +
          '<button data-day="today" class="' + (day === 'today' ? 'active' : '') + '">' + t('forToday') + '</button>' +
          '<button data-day="yesterday" class="' + (day === 'yesterday' ? 'active' : '') + '">' + t('forYesterday') + '</button></div>' +
        '<textarea id="chk" class="eval-ta" rows="4" placeholder="' + t('checkinPh') + '"></textarea>';
    }

    host.innerHTML = '<div class="overlay"><div class="popover" style="width:420px;max-width:92vw">' +
      '<button class="popover-close" id="chk-x" aria-label="' + t('close') + '">' + WP.ui.icon('x', 14) + '</button>' +
      '<h3 style="margin:0 0 2px">' + t('hi') + ', ' + ui.esc(WP.i18n.name(me).split(' ')[0]) + '</h3>' +
      '<div class="sub" style="margin-bottom:12px">' + t('checkinTitle') + '</div>' +
      tabs + body +
      '<div class="disclaimer">' + t('checkinSlackNote') + '</div>' +
      '<div style="display:flex;gap:8px;margin-top:12px">' +
        (mode === 'log' ? '<button class="btn primary" id="chk-save" style="flex:1">' + t('save') + '</button>' : '') +
        '<button class="btn" id="chk-skip" style="flex:' + (mode === 'log' ? '0 0 auto' : '1') + '">' + t('skip') + '</button>' +
      '</div></div></div>';

    function close() { host.innerHTML = ''; }
    host.querySelector('.overlay').onclick = function (ev) { if (ev.target.classList.contains('overlay')) close(); };
    host.querySelector('#chk-x').onclick = close;
    host.querySelector('#chk-skip').onclick = close;
    host.querySelectorAll('[data-mode]').forEach(function (b) {
      b.onclick = function () { WP._promptMode = b.dataset.mode; open(); };
    });
    host.querySelectorAll('[data-day]').forEach(function (b) {
      b.onclick = function () { WP._meDay = b.dataset.day; open(); };
    });
    const save = host.querySelector('#chk-save');
    if (save) save.onclick = function () {
      const txt = (host.querySelector('#chk').value || '').trim();
      if (!txt) { close(); return; }
      const items = txt.split('\n').map(function (s) { return s.trim(); }).filter(Boolean);
      const target = day === 'yesterday' ? (e.doneYesterday = e.doneYesterday || []) : e.doneToday;
      items.forEach(function (it) { target.unshift(it); });
      if (day === 'today') e.weekDone = Math.min(e.weekGoal, e.weekDone + items.length);
      WP.logEvent({ type: 'checkin-saved', by: me.id, target: items.length + ' item(s) → Slack #daily-checkin (' + day + ')' });
      close();
      WP.setState({ route: 'me', selectedId: null }); // show them their progress update
    };
  }

  WP.ui.dailyPrompt = { open: open };
})(window.WP = window.WP || {});
