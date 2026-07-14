/* ============================================================
 * Tempo — Settings
 * ------------------------------------------------------------
 * My settings (every user): Account · Preferences (theme/language) ·
 *   Notifications (what + where) · Security (change password) · Privacy line.
 * Workspace (admin/director): Members & Access — who can sign in.
 * (Tier weights, capacity-state reference, the roles wall, the activity-log
 *  button and Slack linking were removed as clutter — Akram review.)
 * ========================================================== */
(function (WP) {
  'use strict';
  const ui = WP.ui;

  /* ── Settings v2 shared controls ─────────────────────────────────────────── */
  // A labelled row with inline microcopy under the control (SaaS best practice:
  // explain what every option does right beneath it).
  function settingRow(label, note, controlHTML) {
    return '<div class="set-item">' +
      '<div class="set-item-main"><div class="set-item-label">' + ui.esc(label) + '</div>' +
        (note ? '<div class="set-item-note">' + ui.esc(note) + '</div>' : '') + '</div>' +
      '<div class="set-item-control">' + controlHTML + '</div></div>';
  }
  // Accessible toggle switch (checkbox under the hood).
  function toggle(id, on, aria) {
    return '<label class="tgl"><input type="checkbox" id="' + id + '"' + (on ? ' checked' : '') +
      ' aria-label="' + ui.esc(aria || id) + '"><span class="tgl-track"><span class="tgl-thumb"></span></span></label>';
  }
  // Segmented radio group (theme/lang/density/date) — reuses the existing .seg component.
  function segmented(name, options, val) {
    return '<div class="seg" role="radiogroup">' + options.map(function (o) {
      var on = o.val === val;
      return '<button type="button" class="' + (on ? 'active' : '') + '" role="radio"' +
        ' aria-checked="' + (on ? 'true' : 'false') + '" data-seg="' + name + '" data-val="' + ui.esc(o.val) + '">' +
        ui.esc(o.label) + '</button>';
    }).join('') + '</div>';
  }

  /* ── Personal: Account (read-only; managed by admin) ─────────────────────── */
  function accountView() {
    const t = WP.i18n.t, v = WP.viewer();
    if (!v) return '';
    function row(k, val) { return '<div class="set-row"><label>' + k + '</label><span>' + ui.esc(val || '—') + '</span></div>'; }
    return '<div class="section"><h3>' + t('acctTitle') + '</h3>' +
      '<div class="acct-head" style="margin-bottom:10px">' + ui.avatar(v, 'var(--brand)') +
        '<div><div class="acct-nm">' + ui.esc(WP.i18n.name(v)) + '</div>' +
        '<div class="ttl">' + ui.esc(WP.i18n.title(v)) + '</div></div></div>' +
      row(t('acctName'), WP.i18n.name(v)) +
      row(t('acctEmail'), v.email) +
      '<div class="disclaimer">' + ui.icon('lock', 12) + ' ' + t('acctReadonly') + '</div></div>';
  }

  /* ── Personal: Preferences (theme / language / density / date format) ─────── */
  function preferencesView() {
    const t = WP.i18n.t;
    // Just the two choices people actually change: theme + language.
    return '<div class="section"><h3>' + t('prefsTitle') + '</h3>' +
      settingRow(t('prefTheme'), t('prefThemeNote'),
        segmented('theme', [{ val: 'light', label: t('prefThemeLight') }, { val: 'dark', label: t('prefThemeDark') }], WP.state.theme)) +
      settingRow(t('prefLang'), t('prefLangNote'),
        segmented('lang', [{ val: 'en', label: 'English' }, { val: 'ar', label: 'العربية' }], WP.state.lang)) +
      '</div>';
  }

  /* ── Personal: Notifications (channels × categories + digest + quiet hours) ── */
  /* Simple, readable notifications: two plain questions —
   *   1) What do you want to hear about?  (assignments / mentions / evaluations)
   *   2) Where?  (email / Slack)
   * No in-app toggle (always on), no digest, no quiet hours — just the choices
   * that actually matter, easy to scan. */
  function notificationsView() {
    const t = WP.i18n.t;
    const ch = WP.prefs.get('notif.channels') || {};
    const cat = WP.prefs.get('notif.categories') || {};
    return '<div class="section"><h3>' + t('notifTitle') + '</h3>' +
      '<div class="sub" style="margin:-4px 0 14px">' + t('notifSub') + '</div>' +

      '<div class="mini-label">' + t('notifWhat') + '</div>' +
      settingRow(t('notifAssignments'), t('notifAssignmentsNote'), toggle('ct-assignments', cat.assignments, t('notifAssignments'))) +
      settingRow(t('notifMentions'), t('notifMentionsNote'), toggle('ct-mentions', cat.mentions, t('notifMentions'))) +
      settingRow(t('notifEvaluations'), t('notifEvaluationsNote'), toggle('ct-evaluations', cat.evaluations, t('notifEvaluations'))) +

      '<div class="mini-label" style="margin-top:16px">' + t('notifWhere') + '</div>' +
      settingRow(t('notifEmail'), '', toggle('nc-email', ch.email, t('notifEmail'))) +
      settingRow(t('notifSlack'), '', toggle('nc-slack', ch.slack, t('notifSlack'))) +

      '<div class="disclaimer">' + ui.icon('info', 12) + ' ' + t('notifPrototype') + '</div></div>';
  }

  /* ── Wire the personal tab's controls (segmented + toggles + times) ────────── */
  function wirePersonal(root) {
    // segmented groups → theme + language (the only two live choices now)
    root.querySelectorAll('[data-seg]').forEach(function (b) {
      b.onclick = function () {
        var group = b.dataset.seg, val = b.dataset.val;
        if (group === 'theme') WP.setState({ theme: val });
        else if (group === 'lang') WP.setState({ lang: val });
        WP.ui.toast(WP.i18n.t('prefSaved'), 'success');
      };
    });
    // notification toggles: WHAT (categories) + WHERE (email/Slack)
    [['ct-assignments', 'notif.categories.assignments'], ['ct-mentions', 'notif.categories.mentions'],
     ['ct-evaluations', 'notif.categories.evaluations'],
     ['nc-email', 'notif.channels.email'], ['nc-slack', 'notif.channels.slack']
    ].forEach(function (pair) {
      var el = root.querySelector('#' + pair[0]);
      if (el) el.onchange = function () { WP.prefs.set(pair[1], el.checked); };
    });
    wireSecurity(root);
  }

  /* ── Personal: Security (password · devices · last sign-in) ────────────────
   * Change password = email a secure reset link to the user's own verified email
   * (we never handle the old password client-side). "Sign out everywhere" uses
   * Supabase global sign-out. A full per-device list needs the sessions service,
   * so we're honest about that instead of faking rows. */
  /* Security = just the one useful action: change my password (emails a secure
   * reset link to the user's own verified email — never handled client-side).
   * Last-sign-in / device list / sign-out-everywhere / 2FA were noise, removed. */
  function securityView() {
    const t = WP.i18n.t;
    return '<div class="section"><h3>' + t('secTitle') + '</h3>' +
      settingRow(t('secPassword'), t('secPasswordNote'),
        '<button class="btn" id="sec-changepw">' + ui.icon('key', 14) + ' ' + t('secChangePw') + '</button>') +
      '</div>';
  }

  function wireSecurity(root) {
    const t = WP.i18n.t;
    const cp = root.querySelector('#sec-changepw');
    if (cp) cp.onclick = function () {
      const label = cp.innerHTML;
      cp.disabled = true; cp.textContent = t('secPwSending');
      WP.auth.requestPasswordChange().then(function (res) {
        cp.disabled = false; cp.innerHTML = label;
        WP.ui.toast(res && res.ok ? t('secPwSent') : t('secPwError'), res && res.ok ? 'success' : 'error');
      });
    };
  }

  /* ── Personal: Privacy (what Tempo tracks about me + export my data) ───────
   * The no-surveillance stance made concrete and honest: a plain-language list
   * of the DATA CATEGORIES Tempo actually holds about you (each with a why),
   * an explicit statement of what Tempo does NOT do, and a one-click export of
   * your own data (client-side JSON download — no server round-trip, only you). */
  /* Privacy trimmed to a single reassurance line (no catalogue, no export) —
   * Tempo measures work, not people. Kept because the promise is worth stating;
   * everything detailed was noise. */
  function privacyLine() {
    const t = WP.i18n.t;
    return '<div class="pv-line">' + ui.icon('lock', 13) + ' ' + t('pvNeverBody') + '</div>';
  }

  /* ── Workspace: Members & Access ──────────────────────────────────────────
   * The single place to see WHO can enter Tempo and their role — the "app-level
   * gate" (allowlist) that used to be editable only in access.js code. Grant/revoke
   * flows through WP.access.grantAccess (which logs) + WP.setState (which persists
   * the granted set). Role CHANGING stays in the dedicated permissions screen (we
   * granted set). Invite (manageAdmins) links to the admins screen. Gated to
   * editSettings. */
  function memberRows(query) {
    const t = WP.i18n.t, q = (query || '').trim().toLowerCase();
    const people = WP.data.PEOPLE.slice()
      .filter(function (p) { return !p.tbc; })   // real people only (open roles aren't members)
      .filter(function (p) {
        if (!q) return true;
        return (WP.i18n.name(p) + ' ' + (p.email || '') + ' ' + WP.i18n.title(p)).toLowerCase().indexOf(q) > -1;
      })
      .sort(function (a, b) { return WP.i18n.name(a).localeCompare(WP.i18n.name(b), WP.state.lang === 'ar' ? 'ar' : 'en'); });
    if (!people.length) return '<div class="log-empty">' + t('membersEmpty') + '</div>';
    return people.map(function (p) {
      const on = WP.access.hasAccess(p.id);
      return '<div class="mbr-row">' +
        ui.avatar(p, 'var(--brand)') +
        '<div class="mbr-id"><div class="nm">' + ui.esc(WP.i18n.name(p)) + '</div>' +
          '<div class="ttl">' + ui.esc(p.email || WP.i18n.title(p)) + '</div></div>' +
        '<span class="mbr-access ' + (on ? 'is-on' : 'is-off') + '">' +
          '<span class="dot" style="background:' + (on ? 'var(--state-available)' : 'var(--text-muted)') + '"></span>' +
          (on ? t('accessOn') : t('accessOff')) + '</span>' +
        toggle('acc-' + p.id, on, (on ? t('revokeConfirmTitle') : t('grantConfirmTitle')) + ' — ' + WP.i18n.name(p)) +
      '</div>';
    }).join('');
  }

  function membersView() {
    const t = WP.i18n.t;
    const q = WP._membersQuery || '';
    const n = WP.access.listAccess().length;
    return '<div class="section"><div class="page-head" style="margin-bottom:6px"><div class="ph-titles">' +
        '<h3 style="margin:0">' + t('membersTitle') + '</h3>' +
        '<div class="sub">' + t('membersCount').replace('{n}', n) + '</div></div>' +
      '<div class="ph-actions">' +
        (WP.can('manageAdmins') ? '<button class="btn" id="mbr-invite">' + ui.icon('link', 14) + ' ' + t('membersInvite') + '</button>' : '') +
      '</div></div>' +
      '<div class="sub" style="margin:2px 0 12px">' + t('membersNote') + '</div>' +
      '<input class="mbr-search" id="mbr-search" type="search" value="' + ui.esc(q) + '" placeholder="' + t('membersSearch') + '" aria-label="' + t('membersSearch') + '" />' +
      '<div class="mbr-list" id="mbr-list">' + memberRows(q) + '</div></div>';
  }

  // Wire Members & Access controls (search re-renders only the list; toggles confirm).
  function wireMembers(root) {
    const t = WP.i18n.t;
    const inv = root.querySelector('#mbr-invite');
    if (inv) inv.onclick = function () { WP.setState({ route: 'admins' }); };

    const search = root.querySelector('#mbr-search');
    const list = root.querySelector('#mbr-list');
    if (search && list) {
      search.oninput = function () {
        WP._membersQuery = search.value;
        list.innerHTML = memberRows(search.value);   // re-render ONLY the list (keeps focus)
        wireToggles(root);
      };
    }
    wireToggles(root);
  }
  function wireToggles(root) {
    const t = WP.i18n.t;
    root.querySelectorAll('[id^="acc-"]').forEach(function (el) {
      el.onchange = function () {
        const id = el.id.slice(4);
        const p = WP.access.byId(id);
        if (!p) return;
        const turningOn = el.checked;
        // guard: never let an admin revoke their own entry
        if (!turningOn && id === WP.state.viewerId) {
          WP.ui.toast(t('cantRevokeSelf'), 'warn'); el.checked = true; return;
        }
        WP.ui.confirm({
          title: turningOn ? t('grantConfirmTitle') : t('revokeConfirmTitle'),
          icon: turningOn ? 'check' : 'lock', danger: !turningOn,
          body: (turningOn ? t('grantConfirmBody') : t('revokeConfirmBody')).replace('{n}', ui.esc(WP.i18n.name(p))),
          confirmLabel: t('confirm'), cancelLabel: t('cancel')
        }).then(function (ok) {
          if (!ok) { el.checked = !turningOn; return; }   // revert the visual toggle on cancel
          WP.access.grantAccess(id, turningOn);           // logs access-grant/revoke
          WP.ui.toast(turningOn ? t('accessGranted') : t('accessRevoked'), turningOn ? 'success' : 'info');
          WP.setState({});                                // persists the granted set + re-renders
        });
      };
    });
  }

  /* ── Workspace (admin) tab — just Members & Access ─────────────────────────
   * Trimmed to the one thing an admin manages here: who can sign in. Tier
   * weights, capacity-state reference, the roles reference wall, the activity-
   * log button and Slack linking were removed as clutter (Akram review). */
  function workspaceView() {
    return membersView();
  }

  function render(root) {
    const t = WP.i18n.t;
    const canWs = WP.can('viewSettings');
    // remembered tab (default: personal, since every user has it)
    var tab = WP._settingsTab || 'mine';
    if (tab === 'workspace' && !canWs) tab = 'mine';

    const tabs = [{ val: 'mine', label: t('setTabMine') }];
    if (canWs) tabs.push({ val: 'workspace', label: t('setTabWorkspace') });

    const body = tab === 'workspace'
      ? workspaceView()
      : (accountView() + preferencesView() + notificationsView() + securityView() + privacyLine());

    root.innerHTML =
      '<button class="btn" id="back" style="margin-bottom:16px"><span class="ar ar-left"></span> ' + t('back') + '</button>' +
      '<div class="page-head"><div class="ph-titles">' +
        '<h2>' + t('settings') + '</h2>' +
        '<div class="sub">' + (tab === 'workspace' ? t('setWsSub') : t('setMineSub')) + '</div>' +
      '</div></div>' +
      (tabs.length > 1 ? ui.subTabs(tabs, tab) : '') +
      '<div class="set-body">' + body + '</div>';

    root.querySelector('#back').onclick = function () { WP.setState({ route: 'map' }); };
    root.querySelectorAll('[data-subtab]').forEach(function (b) {
      b.onclick = function () { WP._settingsTab = b.dataset.subtab; render(root); };
    });

    if (tab === 'mine') { wirePersonal(root); return; }

    // ── workspace wiring — just Members & Access ──
    wireMembers(root);   // search + grant/revoke toggles + invite link
  }

  WP.ui.settings = { render: render };
})(window.WP = window.WP || {});
