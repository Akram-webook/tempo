/* ============================================================
 * Tempo — Organisation Tree (Event Operations)
 * ------------------------------------------------------------
 * A dedicated, on-brand org chart of the Event Operations department: the exec
 * spine (CCO -> Director) and five category-coded squads (+ the Anti-Fraud
 * sub-unit), with squad leads, members and open (TBC) roles. Presentation only,
 * DOM built here; no engine dependency. Visible to any signed-in employee (an
 * org chart is all-staff), with a defence-in-depth authed re-check.
 *
 * Styled to the webook Brand Visual Guidelines v2.0 — Electric Pink #FF2C79 as
 * the key colour, brand-only palette, category-coded squads, outlined icons.
 * ========================================================== */
(function (WP) {
  'use strict';
  var ui = WP.ui;
  var esc = function (s) { return ui.esc(String(s == null ? '' : s)); };

  /* Roster — reconciled to the Slack directory (authoritative spellings). */
  var ORG = {
    exec: [
      { name: 'Hamdi Missaoui', role: 'Chief Commercial Officer' },
      { name: 'Ahmed Othman',   role: 'Event Operations Director' },
    ],
    teams: [
      { name: 'Automation & Execution', cat: '#7A4AFF', ink: '#fff',
        lead: { name: 'Ayman Albasha', role: 'Event Operations Sr. Manager' },
        reports: [ { name: 'Shahad Joudah', role: 'Event Operations Specialist - Trainer' } ],
        sub: { name: 'Anti-Fraud',
          lead: { name: 'Batool Emad', role: 'Event Operations Manager - Anti-Fraud' },
          reports: [
            { name: 'TBC', role: 'Event Operations Specialist - Anti-Fraud', open: true },
            { name: 'TBC', role: 'Event Operations Coordinator - Anti-Fraud', open: true },
          ] } },
      { name: 'Sports', cat: '#0047C7', ink: '#fff',
        lead: { name: 'Motaa Aldarra', role: 'Event Operations Sr. Manager' },
        reports: [
          { name: 'Mohammed Akram',       role: 'Event Operations Manager', you: true },
          { name: 'Abdulrahman Maksousa', role: 'Event Operations Sr. Specialist' },
          { name: 'Khaled Jeneina',       role: 'Event Operations Sr. Specialist' },
          { name: 'Shamma Alsagr',        role: 'Event Operations Specialist' },
          { name: 'Mohammed Idris',       role: 'Event Operations Specialist' },
          { name: 'TBC',                  role: 'Event Operations Specialist', open: true },
        ] },
      { name: 'Entertainment', cat: '#FF2C79', ink: '#fff',
        lead: { name: 'Ayah Nasif', role: 'Event Operations Sr. Manager' },
        reports: [
          { name: 'Farah Alsmay',      role: 'Event Operations Manager' },
          { name: 'Amen Shannah',      role: 'Event Operations Sr. Specialist' },
          { name: 'Meshal Bin Howshan', role: 'Event Operations Sr. Specialist' },
          { name: 'Meshal Alsmari',    role: 'Event Operations Coordinator' },
          { name: 'Raghdaa Abuazzah',  role: 'Event Operations Coordinator', neu: true },
        ] },
      { name: 'On Ground', cat: '#F46241', ink: '#fff',
        lead: { name: 'Hani Ahmed', role: 'Event Operations Sr. Manager' },
        reports: [
          { name: 'Mohamed Zaidan',   role: 'Event Operations Manager - Execution' },
          { name: 'Ahmed Faraj',      role: 'Event Operations Manager - Execution' },
          { name: 'Mohammed Batarfi', role: 'Event Operations Sr. Specialist (Logistics)' },
        ] },
      { name: 'Cashless', cat: '#00FFD0', ink: '#000',
        lead: { name: 'Omar Zarea', role: 'Event Operations Manager' },
        reports: [
          { name: 'Rafah Alansari',    role: 'Event Operations Sr. Specialist' },
          { name: 'Aljazi Alshubaike', role: 'Event Operations Sr. Specialist' },
          { name: 'Rosa Alansari',     role: 'Event Operations Specialist' },
          { name: 'Mohammed Altahini', role: 'Event Operations Specialist' },
        ] },
    ],
  };

  /* Avatar colours: brand palette only; ink chosen by luminance for legibility. */
  var BRAND = ['#FF2C79', '#7A4AFF', '#00FFD0', '#B3E100', '#F46241', '#0047C7', '#FFDE00'];
  function inkFor(hex) {
    var r = parseInt(hex.slice(1, 3), 16), g = parseInt(hex.slice(3, 5), 16), b = parseInt(hex.slice(5, 7), 16);
    return (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255 > 0.6 ? '#000' : '#fff';
  }
  function initials(n) {
    var p = String(n).trim().split(/\s+/).filter(Boolean);
    if (!p.length) return '?';
    return (p[0][0] + (p.length > 1 ? p[p.length - 1][0] : (p[0][1] || ''))).toUpperCase();
  }
  function swatch(n) { var h = 0; for (var i = 0; i < n.length; i++) h = (h * 31 + n.charCodeAt(i)) >>> 0; return BRAND[h % BRAND.length]; }

  function card(p, opts) {
    opts = opts || {};
    var cls = ['otc-card'];
    if (opts.lead) cls.push('is-lead');
    if (p.open) cls.push('is-open');
    if (p.neu) cls.push('is-new');
    if (p.you) cls.push('is-you');
    var av;
    if (p.open) av = '<span class="otc-av">?</span>';
    else if (p.neu) av = '<span class="otc-av">' + esc(initials(p.name)) + '</span>';
    else { var c = swatch(p.name); av = '<span class="otc-av" style="background:' + c + ';color:' + inkFor(c) + '">' + esc(initials(p.name)) + '</span>'; }
    var s = (p.name + ' ' + p.role + ' ' + (opts.team || '')).toLowerCase();
    return '<div class="' + cls.join(' ') + '" data-s="' + esc(s) + '">' +
      (p.you ? '<span class="otc-you">' + esc(WP.i18n.t('orgTreeYou')) + '</span>' : '') + av +
      '<div class="otc-who"><div class="otc-nm">' + esc(p.name) + '</div>' +
        '<div class="otc-rl">' + esc(p.role) + '</div>' +
        (p.neu ? '<span class="otc-tag">' + esc(WP.i18n.t('orgTreeIncoming')) + '</span>' : '') +
      '</div></div>';
  }

  function statsHTML() {
    var t = WP.i18n.t, filled = ORG.exec.length, open = 0;
    ORG.teams.forEach(function (tm) {
      [tm.lead].concat(tm.reports, tm.sub ? [tm.sub.lead].concat(tm.sub.reports) : [])
        .forEach(function (p) { if (p.open) open++; else filled++; });
    });
    return '<div class="metrics otc-stats">' +
      '<div class="card"><div class="label">' + esc(t('orgTreePeople')) + '</div><div class="value" style="color:var(--brand-text)">' + filled + '</div></div>' +
      '<div class="card"><div class="label">' + esc(t('orgTreeSquads')) + '</div><div class="value">' + ORG.teams.length + '</div></div>' +
      '<div class="card"><div class="label">' + esc(t('orgTreeOpen')) + '</div><div class="value">' + open + '</div></div>' +
    '</div>';
  }

  // Director/admin only — this is real personal data (names + reporting lines),
  // so it's gated like the other people-data views (Sales, Org capability),
  // not shown to every signed-in employee. Defence-in-depth re-check here.
  function canView(viewer) { return !!(WP.access && WP.access.canManage(viewer)); }

  function render(root) {
    var t = WP.i18n.t;
    var viewer = WP.viewer && WP.viewer();
    if (!canView(viewer)) {
      root.innerHTML = '<div class="view-pad">' + ui.pageHeader({ title: t('orgTreeTitle') }) +
        '<div class="section ex-clear">' + ui.icon('lock', 18) + ' <span>' + esc(t('orgTreeDenied')) + '</span></div></div>';
      return;
    }

    var exec = ORG.exec.map(function (p, i) {
      return card(p, { lead: true }) + (i < ORG.exec.length - 1 ? '<div class="otc-drop"></div>' : '');
    }).join('');

    var board = ORG.teams.map(function (tm) {
      var inner = '<div class="otc-head" style="--cat:' + tm.cat + ';--cat-ink:' + tm.ink + '">' + esc(tm.name) + '</div>';
      inner += card(tm.lead, { lead: true, team: tm.name });
      inner += tm.reports.map(function (r) { return card(r, { team: tm.name }); }).join('');
      if (tm.sub) {
        inner += '<div class="otc-sub"><p class="otc-sub-h">' + esc(tm.sub.name) + '</p>' +
          card(tm.sub.lead, { lead: true, team: tm.name + ' ' + tm.sub.name }) +
          tm.sub.reports.map(function (r) { return card(r, { team: tm.name + ' ' + tm.sub.name }); }).join('') + '</div>';
      }
      return '<div class="otc-col">' + inner + '</div>';
    }).join('');

    root.innerHTML = '<div class="view-pad otree-view">' +
      ui.provenanceNote() +
      ui.pageHeader({
        crumbs: [{ label: t('navDashboard'), route: 'dashboard' }, { label: t('orgTreeTitle') }],
        title: t('orgTreeTitle'),
        subtitle: t('orgTreeSub'),
      }) +
      statsHTML() +
      '<div class="otc-tools"><label class="otc-search">' + ui.icon('search', 16) +
        '<input type="search" data-otc-search placeholder="' + esc(t('orgTreeSearch')) + '" aria-label="' + esc(t('orgTreeSearch')) + '" autocomplete="off"></label>' +
        '<div class="otc-legend">' +
          '<span><i class="otc-lg-lead"></i>' + esc(t('orgTreeLead')) + '</span>' +
          '<span><i class="otc-lg-new"></i>' + esc(t('orgTreeIncoming')) + '</span>' +
          '<span><i class="otc-lg-open"></i>' + esc(t('orgTreeOpenRole')) + '</span>' +
        '</div>' +
      '</div>' +
      '<div class="otc-exec">' + exec + '</div>' +
      '<div class="otc-scroll"><div class="otc-board">' + board + '</div></div>' +
    '</div>';

    // Search: dim non-matching cards, fade a squad whose cards all drop out.
    var q = root.querySelector('[data-otc-search]');
    if (q) q.oninput = function () {
      var v = q.value.trim().toLowerCase();
      root.querySelectorAll('.otc-card').forEach(function (c) { c.classList.toggle('is-dim', !!v && c.dataset.s.indexOf(v) < 0); });
      root.querySelectorAll('.otc-col').forEach(function (col) {
        var any = [].slice.call(col.querySelectorAll('.otc-card')).some(function (c) { return !c.classList.contains('is-dim'); });
        col.classList.toggle('is-faded', !!v && !any);
      });
    };
  }

  WP.ui = WP.ui || {};
  WP.ui.orgTree = { render: render, canView: canView, _org: ORG };
})(window.WP = window.WP || {});
