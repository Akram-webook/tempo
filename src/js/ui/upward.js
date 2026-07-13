/* ============================================================
 * Webook Workload — Upward feedback (employee → manager)
 * ------------------------------------------------------------
 * A report rates their manager on leadership BEHAVIORS. The result
 * is aggregated + anonymous and routed UP the chain (to the manager's
 * manager / C-level) — never shown to the rated manager raw. So the
 * rater feels safe. Behaviors, not personality.
 * ========================================================== */
(function (WP) {
  'use strict';
  const ui = WP.ui;

  // who receives the routed-up feedback about `manager`
  function recipientLabel(manager) {
    if (manager && manager.managerId) {
      const up = WP.access.byId(manager.managerId);
      return up ? WP.i18n.name(up) : 'their manager';
    }
    return 'C-level'; // rating the Director → goes to C-level
  }

  function render(root) {
    const t = WP.i18n.t, ar = WP.state.lang === 'ar';
    const manager = WP.access.byId(WP.state.selectedId);
    const viewer = WP.viewer();
    const back = function () { WP.setState({ route: 'map', selectedId: null }); };
    // you may rate only your OWN manager
    if (!manager || !viewer || viewer.managerId !== manager.id) {
      root.innerHTML = '<button class="btn" id="back" style="margin-bottom:16px"><span class="ar ar-left"></span> ' + t('back') + '</button>' +
        '<div class="section"><div class="sub">' + t('upwardOnlyOwn') + '</div></div>';
      root.querySelector('#back').onclick = back; return;
    }

    const draft = (WP._upwardDraft = WP._upwardDraft || { scores: {}, feedback: {} });
    const crit = WP.data.UPWARD_CRITERIA.map(function (c) {
      const cur = draft.scores[c.id];
      const cName = ar ? c.ar : c.en;
      const scale = [1, 2, 3, 4, 5].map(function (n) {
        return '<button class="scale-btn' + (cur === n ? ' on' : '') + '" role="radio"' +
          ' aria-checked="' + (cur === n ? 'true' : 'false') + '"' +
          ' aria-label="' + ui.esc(cName) + ' — ' + n + ' / 5"' +
          ' data-c="' + c.id + '" data-n="' + n + '">' + n + '</button>';
      }).join('');
      return '<div class="crit-row"><div class="crit-name">' + cName + '</div>' +
        '<div class="scale" role="radiogroup" aria-label="' + ui.esc(cName) + '">' + scale + '</div></div>';
    }).join('');
    const qs = WP.data.UPWARD_QUESTIONS.map(function (q) {
      return '<div class="eval-q"><div class="mini-label">' + (ar ? q.ar : q.en) + '</div>' +
        '<textarea class="eval-ta" data-q="' + q.key + '" rows="2">' + ui.esc(draft.feedback[q.key] || '') + '</textarea></div>';
    }).join('');

    root.innerHTML =
      '<button class="btn" id="back" style="margin-bottom:14px"><span class="ar ar-left"></span> ' + t('back') + '</button>' +
      '<h2 style="margin:0 0 2px">' + t('upwardTitle') + '</h2>' +
      '<div class="profile-head" style="margin:8px 0 14px">' + ui.avatar(manager, 'var(--brand)') +
        '<div><div class="nm" style="font-size:18px">' + ui.esc(WP.i18n.name(manager)) + '</div>' +
        '<div class="ttl">' + ui.esc(WP.i18n.title(manager)) + '</div></div></div>' +
      '<div class="banner-info">' + WP.ui.icon('lock',14) + ' ' + t('upwardAnon').replace('{x}', ui.esc(recipientLabel(manager))).replace('{m}', ui.esc(WP.i18n.name(manager))) + '</div>' +
      '<div class="section"><h3>' + t('leadershipBehaviors') + '</h3>' + crit + '</div>' +
      '<div class="section"><h3>' + t('feedbackQs') + '</h3>' + qs +
        '<button class="btn primary" id="submit" style="margin-top:12px">' + t('submitUpward') + '</button></div>';

    root.querySelector('#back').onclick = back;
    root.querySelectorAll('.scale-btn').forEach(function (b) {
      b.onclick = function () { draft.scores[b.dataset.c] = parseInt(b.dataset.n, 10); WP.setState({}); };
    });
    root.querySelectorAll('.eval-ta').forEach(function (ta) {
      ta.onchange = function () { draft.feedback[ta.dataset.q] = ta.value; };
    });
    root.querySelector('#submit').onclick = function () {
      // Don't log an empty anonymous review — require at least one behavior score.
      const anyScore = Object.keys(draft.scores).length > 0;
      const anyText = Object.keys(draft.feedback).some(function (k) { return (draft.feedback[k] || '').trim(); });
      if (!anyScore && !anyText) { WP.ui.toast(t('upwardIncomplete'), 'warn'); return; }
      WP.logEvent({ type: 'upward-feedback', by: viewer.id, target: manager.id, reason: 'routed to ' + recipientLabel(manager) + ' · anonymous' });
      WP._upwardDraft = null;
      const host = document.getElementById('view');
      host.innerHTML = '<div class="section" style="text-align:center;padding:40px"><div style="color:var(--state-available)">' + WP.ui.icon('check',38) + '</div>' +
        '<h3>' + t('upwardThanks') + '</h3><div class="sub">' + t('upwardThanksNote').replace('{x}', ui.esc(recipientLabel(manager))) + '</div>' +
        '<button class="btn" id="done" style="margin-top:14px">' + t('back') + '</button></div>';
      host.querySelector('#done').onclick = back;
    };
  }

  WP.ui.upward = { render: render };
})(window.WP = window.WP || {});
