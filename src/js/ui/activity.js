/* ============================================================
 * Tempo — Activity & override log (its own page)
 * ------------------------------------------------------------
 * The activity/override log used to live cramped at the foot of Settings. It is
 * a provenance record (who did what, when, why) — a director/admin scans it, so
 * it deserves a real, scannable, paginated table page.
 *
 * Gated to Super Admin ONLY (WP.can('manageAdmins')); re-checked here (defence
 * in depth). Read-only. Newest first, load-more paging. (Akram: directors/other
 * admins should NOT see the override log — Super Admin only.)
 * ========================================================== */
(function (WP) {
  'use strict';
  const ui = WP.ui;
  const PAGE = 25;
  let shown = PAGE;   // how many rows are currently expanded

  function who(id) { const p = WP.access.byId(id); return p ? WP.i18n.name(p) : (id || '—'); }

  // Human line + a short action badge for each event type.
  function describe(e) {
    const t = WP.i18n.t;
    if (e.type === 'view-as')          return { badge: t('logView'),   text: who(e.by) + ' → ' + who(e.target) };
    if (e.type === 'override-assign')  return { badge: t('logOverride'), text: who(e.by) + ' → ' + who(e.target) + (e.reason ? ' · “' + ui.esc(e.reason) + '”' : '') };
    if (e.type === 'assign')           return { badge: t('logAssign'),  text: who(e.by) + ' → ' + who(e.target) };
    if (e.type === 'config')           return { badge: t('logConfig'),  text: who(e.by) + ' · ' + ui.esc(e.target || '') };
    if (e.type === 'admin-invite')     return { badge: t('logInvite'),  text: who(e.by) + ' → ' + ui.esc(e.target || '') };
    if (e.type === 'access-grant' || e.type === 'access-revoke')
      return { badge: e.type === 'access-grant' ? t('logGrant') : t('logRevoke'), text: who(e.by) + ' → ' + who(e.target) };
    return { badge: e.type, text: [who(e.by), who(e.target)].filter(Boolean).join(' → ') };
  }

  function render(root) {
    const t = WP.i18n.t;
    if (!WP.can('manageAdmins')) { WP.setState({ route: 'map' }); return; }
    const all = (WP.activityLog || []).slice();   // already newest-first

    const head =
      '<button class="btn" id="back" style="margin-bottom:16px"><span class="ar ar-left"></span> ' + t('back') + '</button>' +
      '<div class="page-head"><div class="ph-titles">' +
        '<h2>' + t('activityLog') + '</h2>' +
        '<div class="sub">' + t('activitySub') + '</div>' +
      '</div><div class="ph-actions"><span class="tag">' + all.length + ' ' + t('logEntries') + '</span></div></div>';

    let body;
    if (!all.length) {
      body = '<div class="section"><div class="log-empty">' + ui.icon('clock', 22) + '<div style="margin-top:8px">' + t('noActivity') + '</div></div></div>';
    } else {
      const rows = all.slice(0, shown).map(function (e) {
        const d = describe(e);
        const when = e.at ? new Date(e.at).toLocaleString() : '—';
        return '<tr>' +
          '<td><span class="lg-badge">' + ui.esc(d.badge) + '</span></td>' +
          '<td>' + d.text + '</td>' +
          '<td class="lg-when">' + ui.esc(when) + '</td>' +
        '</tr>';
      }).join('');
      body = '<div class="section" style="overflow-x:auto"><table class="log-table">' +
        '<thead><tr><th>' + t('logColAction') + '</th><th>' + t('logColDetail') + '</th><th>' + t('logColWhen') + '</th></tr></thead>' +
        '<tbody>' + rows + '</tbody></table>' +
        (all.length > shown ? '<button class="btn log-more" id="log-more">' + t('logLoadMore') + '</button>' : '') +
      '</div>';
    }

    root.innerHTML = head + body;
    root.querySelector('#back').onclick = function () { WP.setState({ route: 'settings' }); };
    const more = root.querySelector('#log-more');
    if (more) more.onclick = function () { shown += PAGE; render(root); };
  }

  // Reset paging when leaving the page so a re-entry starts fresh.
  WP.ui.activity = { render: render, _reset: function () { shown = PAGE; } };
})(window.WP = window.WP || {});
