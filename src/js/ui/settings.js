/* ============================================================
 * Tempo — Settings (Super Admin)
 * ------------------------------------------------------------
 * - Tier weights + capacity ceiling (LIVE — editing recomputes loads)
 * - Capacity states (the fuel-gauge bands)
 * - Slack linking (identity only — Slack does NOT define hierarchy)
 * - Org structure note
 * - Activity / override log (provenance: who / when / why)
 * ========================================================== */
(function (WP) {
  'use strict';
  const ui = WP.ui;

  // Per-tier "what it means" + whether it's the ROUTINE/recurring baseline. Standard
  // (Tier 3) is the day-to-day routine work a director assigns against most often; the
  // heavier tiers are the exceptional pushes. This gives the number a decision meaning
  // (Constitution: Evidence — no metric without the decision it serves).
  const TIER_MEANING = {
    mega:     { en: 'Flagship / mega events — rare, all-hands pushes.',        ar: 'الفعاليات الكبرى — نادرة وتتطلب الجميع.',        routine: false },
    medium:   { en: 'Mid-size events — recurring but planned ahead.',          ar: 'فعاليات متوسطة — متكررة لكن مخطط لها مسبقاً.',    routine: false },
    standard: { en: 'Standard / routine work — the day-to-day baseline load.', ar: 'العمل القياسي / الروتيني — الحمل اليومي الأساسي.', routine: true }
  };

  // Live count of events currently sitting on each tier (so the director sees where
  // the actual work is, not just an abstract weight).
  function tierEventCounts() {
    const counts = {};
    const ev = WP.data.EVENTS || {};
    Object.keys(ev).forEach(function (id) {
      const tid = ev[id].tier;
      counts[tid] = (counts[tid] || 0) + 1;
    });
    return counts;
  }

  function tierEditor() {
    const t = WP.i18n.t;
    const ar = WP.state.lang === 'ar';
    const counts = tierEventCounts();
    const cards = Object.keys(WP.data.TIERS).map(function (k) {
      const tier = WP.data.TIERS[k];
      const label = ar ? tier.labelAr : tier.labelEn;
      const mean = TIER_MEANING[tier.key] || { en: '', ar: '', routine: false };
      const routineTag = mean.routine
        ? '<span class="tier-routine">' + ui.icon('clock', 12) + ' ' + t('tierRoutine') + '</span>' : '';
      const n = counts[tier.id] || 0;
      const dotColor = tier.key === 'mega' ? 'var(--state-overloaded)' : tier.key === 'medium' ? 'var(--state-near)' : 'var(--state-available)';
      return '<div class="tier-card">' +
        '<span class="tier-dot" style="background:' + dotColor + '"></span>' +
        '<div class="tier-main">' +
          '<div class="tier-name">' + ui.esc(label) + routineTag + '</div>' +
          '<div class="tier-mean">' + ui.esc(ar ? mean.ar : mean.en) + '</div>' +
          '<div class="tier-count"><b>' + n + '</b> ' + t('tierEventsNow') + '</div>' +
        '</div>' +
        '<div class="tier-weight"><input type="number" min="0" max="100" value="' + tier.weight + '" data-tier="' + k + '" aria-label="' + ui.esc(label) + '" /> %</div>' +
      '</div>';
    }).join('');
    return '<div class="section"><h3>' + t('tierWeights') + '</h3>' +
      '<div class="tier-list">' + cards + '</div>' +
      '<div class="set-row"><label>' + t('capacityCeiling') + '</label>' +
      '<input type="number" min="50" max="200" value="' + WP.data.CEILING + '" id="ceiling" /> %</div>' +
      '<div class="disclaimer">' + t('settingsNote') + '</div></div>';
  }

  function statesView() {
    const t = WP.i18n.t;
    return '<div class="section"><h3>' + t('healthyBand') + '</h3>' +
      WP.data.STATES.map(function (s) {
        const c = ui.stateColor(s);
        return '<div class="set-row"><span style="display:inline-flex;align-items:center;gap:8px">' +
          '<span class="dot" style="background:' + c + '"></span>' + ui.esc(WP.i18n.stateLabel(s)) + '</span>' +
          '<b>' + s.min + '–' + (s.max > 100 ? '100+' : s.max) + '%</b></div>';
      }).join('') + '</div>';
  }

  function slackLinking() {
    const t = WP.i18n.t;
    // Alphabetical by display name (senior BA: a directory you scan should be sorted).
    const people = WP.data.PEOPLE.slice().sort(function (a, b) {
      return WP.i18n.name(a).localeCompare(WP.i18n.name(b), WP.state.lang === 'ar' ? 'ar' : 'en');
    });
    const missing = people.filter(function (p) { return !p.slackId; }).length;
    const rows = people.map(function (p) {
      const has = !!p.slackId;
      return '<div class="set-row" style="gap:10px">' + ui.avatar(p, 'var(--brand)') +
        '<span style="flex:1">' + ui.esc(WP.i18n.name(p)) + '<div class="ttl">' + ui.esc(WP.i18n.title(p)) + '</div></span>' +
        (has ? '<span class="dot" style="background:var(--state-available)"></span>' : '<span class="dot slack-missing" style="background:var(--state-near)"></span>') +
        '<input class="slack-edit' + (has ? '' : ' slack-missing') + '" data-slack="' + p.id + '" value="' + ui.esc(p.slackId || '') + '" placeholder="' + t('slackIdPlaceholder') + '" aria-label="Slack ID ' + ui.esc(WP.i18n.name(p)) + '" />' +
      '</div>';
    }).join('');
    const banner = missing
      ? '<div class="disclaimer slack-missing">' + missing + ' ' + t('slackMissingNote') + '</div>' : '';
    return '<div class="section"><h3>' + t('slackLinking') + '</h3>' + banner + rows +
      '<div class="disclaimer">' + t('slackNote') + '</div></div>';
  }

  function activityLog() {
    const t = WP.i18n.t;
    if (!WP.activityLog.length) return '<div class="section"><h3>' + t('activityLog') + '</h3><div class="sub">' + t('noActivity') + '</div></div>';
    const nm = function (id) { const p = WP.access.byId(id); return p ? WP.i18n.name(p) : id; };
    const rows = WP.activityLog.slice(0, 20).map(function (e) {
      let line = '';
      if (e.type === 'view-as') line = nm(e.by) + ' → viewing as ' + nm(e.target);
      else if (e.type === 'override-assign') line = '' + WP.ui.icon('alert',15) + ' ' + nm(e.by) + ' override-assigned ' + nm(e.target) + ' · "' + ui.esc(e.reason || '') + '"';
      else if (e.type === 'assign') line = nm(e.by) + ' assigned ' + nm(e.target);
      else line = e.type;
      return '<div class="proj"><span style="flex:1;font-size:13px">' + line + '</span>' +
        '<span class="ttl">' + new Date(e.at).toLocaleString() + '</span></div>';
    }).join('');
    return '<div class="section"><h3>' + t('activityLog') + '</h3>' + rows + '</div>';
  }

  function rolesPanel() {
    const t = WP.i18n.t;
    const ar = WP.state.lang === 'ar';
    const ROLES = [
      { en: 'Director', ar: 'الدايركتر', who: 'Ahmed Othman',
        sees:  { en: ['The whole department — every team’s load & health', 'Flight-risk & promotion-readiness across the org', 'Capacity vs demand · fairness across teams', 'All sensitive detail, org-wide'],
                 ar: ['القسم كامل — حمل وصحة كل فريق', 'خطر الاستقالة وجاهزية الترقية على مستوى القسم', 'الطاقة مقابل الطلب · العدالة بين الفرق', 'كل التفاصيل الحساسة للقسم كله'] },
        can:   { en: ['Configure the system (tiers, structure, Slack)', 'See the activity & override log', 'Assign anyone · view as any role'],
                 ar: ['ضبط النظام (الفئات، الهيكل، سلاك)', 'رؤية سجل النشاط والتجاوزات', 'إسناد أي شخص · العرض بأي دور'] },
        only:  { en: 'Only role that sees ACROSS all teams + the whole-org sensitive picture + settings.',
                 ar: 'الدور الوحيد اللي يشوف عبر كل الفرق + الصورة الحساسة للقسم كامل + الإعدادات.' } },
      { en: 'Senior Manager', ar: 'مدير أول', who: 'Ayman · Motaa · Ayah · Hani',
        sees:  { en: ['Their portfolio — all teams under them, rolled up', 'Their managers’ team-health & development', 'Who’s overloaded across their sub-org'],
                 ar: ['محفظتهم — كل الفرق تحتهم مجمّعة', 'صحة فرق مدرائهم وتطويرهم', 'مين محمّل زيادة في فرعهم'] },
        can:   { en: ['Assign & rebalance across their teams', 'Drill into their managers’ teams'],
                 ar: ['الإسناد وإعادة التوزيع عبر فرقهم', 'الدخول لتفاصيل فرق مدرائهم'] },
        only:  { en: 'Cannot see: other seniors’ sub-orgs · budget/comp · skip-level specialists’ sensitive detail.',
                 ar: 'ما يشوف: فروع المدراء الأوائل الآخرين · الميزانية/الرواتب · تفاصيل أخصائيي الطبقات الأبعد الحساسة.' } },
      { en: 'Manager', ar: 'مدير', who: 'Akram · Khaled · Faraj · …',
        sees:  { en: ['Their team’s FULL detail — load, skills, growth, KPIs, risk, notes', 'Their Team-Health KPI · daily check-ins'],
                 ar: ['تفاصيل فريقهم الكاملة — حمل، مهارات، تطوير، KPIs، مخاطر، ملاحظات', 'مؤشر صحة فريقهم · التحديثات اليومية'] },
        can:   { en: ['Assign work to their team', 'Log requests · prep 1:1s'],
                 ar: ['إسناد العمل لفريقهم', 'تسجيل الطلبات · تحضير الـ 1:1'] },
        only:  { en: 'Cannot see: other teams’ detail (aggregate only) · comp · settings.',
                 ar: 'ما يشوف: تفاصيل الفرق الأخرى (مجمّع فقط) · الرواتب · الإعدادات.' } },
      { en: 'Specialist', ar: 'أخصائي', who: 'Idris · Osama · Talal · …',
        sees:  { en: ['Their OWN load, skills, development, KPIs, check-ins', 'A developmental view of themselves'],
                 ar: ['حمله ومهاراته وتطويره وKPIs وتحديثاته', 'نسخة تطويرية عن نفسه'] },
        can:   { en: ['Log their own check-in · update own goals'],
                 ar: ['تسجيل تحديثه اليومي · تحديث أهدافه'] },
        only:  { en: 'Cannot see: others’ profiles · their own raw risk labels · assign · settings.',
                 ar: 'ما يشوف: ملفات الآخرين · تصنيفات المخاطر الخام عن نفسه · الإسناد · الإعدادات.' } },
    ];
    const list = function (arr) { return '<ul class="role-list">' + arr.map(function (x) { return '<li>' + WP.ui.esc(x) + '</li>'; }).join('') + '</ul>'; };
    const cards = ROLES.map(function (r) {
      return '<div class="role-card">' +
        '<div class="role-name">' + (ar ? r.ar : r.en) + '</div>' +
        '<div class="ttl">' + WP.ui.esc(r.who) + '</div>' +
        '<div class="mini-label" style="margin-top:8px">' + (ar ? 'يشوف' : 'Sees') + '</div>' + list(ar ? r.sees.ar : r.sees.en) +
        '<div class="mini-label" style="margin-top:6px">' + (ar ? 'يقدر' : 'Can do') + '</div>' + list(ar ? r.can.ar : r.can.en) +
        '<div class="role-only">' + WP.ui.esc(ar ? r.only.ar : r.only.en) + '</div>' +
      '</div>';
    }).join('');
    return '<div class="section"><h3>' + t('accessModel') + '</h3>' +
      '<div class="role-grid">' + cards + '</div>' +
      '<div class="disclaimer">Role + relationship (manager-of). Sensitive detail opens only along the management line; everyone sees the aggregate situation, individual detail is gated.</div></div>';
  }

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
    var roleLbl = WP.i18n.roleLabel ? WP.i18n.roleLabel(v) : (v.level || '');
    return '<div class="section"><h3>' + t('acctTitle') + '</h3>' +
      '<div class="acct-head" style="margin-bottom:10px">' + ui.avatar(v, 'var(--brand)') +
        '<div><div class="acct-nm">' + ui.esc(WP.i18n.name(v)) + '</div>' +
        '<div class="ttl">' + ui.esc(WP.i18n.title(v)) + '</div></div></div>' +
      row(t('acctName'), WP.i18n.name(v)) +
      row(t('acctTitleField'), WP.i18n.title(v)) +
      row(t('acctEmail'), v.email) +
      row(t('acctRole'), roleLbl) +
      '<div class="disclaimer">' + ui.icon('lock', 12) + ' ' + t('acctReadonly') + '</div></div>';
  }

  /* ── Personal: Preferences (theme / language / density / date format) ─────── */
  function preferencesView() {
    const t = WP.i18n.t;
    const df = WP.prefs.get('dateFormat') || 'auto';
    // live sample so the date-format choice is concrete
    const sample = { dmy: '31/12/2026', mdy: '12/31/2026', iso: '2026-12-31' };
    return '<div class="section"><h3>' + t('prefsTitle') + '</h3>' +
      settingRow(t('prefTheme'), t('prefThemeNote'),
        segmented('theme', [{ val: 'light', label: t('prefThemeLight') }, { val: 'dark', label: t('prefThemeDark') }], WP.state.theme)) +
      settingRow(t('prefLang'), t('prefLangNote'),
        segmented('lang', [{ val: 'en', label: 'English' }, { val: 'ar', label: 'العربية' }], WP.state.lang)) +
      settingRow(t('prefDensity'), t('prefDensityNote'),
        segmented('density', [{ val: 'comfortable', label: t('prefComfortable') }, { val: 'compact', label: t('prefCompact') }], WP.prefs.get('density'))) +
      settingRow(t('prefDateFmt'), t('prefDateFmtNote'),
        segmented('dateFormat', [
          { val: 'auto', label: t('prefDateAuto') },
          { val: 'dmy', label: sample.dmy }, { val: 'mdy', label: sample.mdy }, { val: 'iso', label: sample.iso }
        ], df)) +
      '</div>';
  }

  /* ── Personal: Notifications (channels × categories + digest + quiet hours) ── */
  function notificationsView() {
    const t = WP.i18n.t;
    const ch = WP.prefs.get('notif.channels') || {};
    const cat = WP.prefs.get('notif.categories') || {};
    const q = WP.prefs.get('notif.quietHours') || {};
    return '<div class="section"><h3>' + t('notifTitle') + '</h3>' +
      '<div class="sub" style="margin:-4px 0 12px">' + t('notifSub') + '</div>' +

      '<div class="mini-label">' + t('notifChannels') + '</div>' +
      '<div class="set-item-note" style="margin-bottom:8px">' + t('notifChannelsNote') + '</div>' +
      settingRow(t('notifEmail'), '', toggle('nc-email', ch.email, t('notifEmail'))) +
      settingRow(t('notifSlack'), '', toggle('nc-slack', ch.slack, t('notifSlack'))) +
      settingRow(t('notifInapp'), '', toggle('nc-inapp', ch.inapp, t('notifInapp'))) +

      '<div class="mini-label" style="margin-top:14px">' + t('notifWhat') + '</div>' +
      settingRow(t('notifAssignments'), t('notifAssignmentsNote'), toggle('ct-assignments', cat.assignments, t('notifAssignments'))) +
      settingRow(t('notifMentions'), t('notifMentionsNote'), toggle('ct-mentions', cat.mentions, t('notifMentions'))) +
      settingRow(t('notifEvaluations'), t('notifEvaluationsNote'), toggle('ct-evaluations', cat.evaluations, t('notifEvaluations'))) +
      settingRow(t('notifDigest'), t('notifDigestNote'), toggle('ct-digest', cat.digest, t('notifDigest'))) +

      '<div class="mini-label" style="margin-top:14px">' + t('notifQuiet') + '</div>' +
      settingRow(t('notifQuiet'), t('notifQuietNote'), toggle('q-on', q.on, t('notifQuiet'))) +
      '<div class="set-row" id="q-times"' + (q.on ? '' : ' hidden') + '>' +
        '<label>' + t('notifQuietFrom') + '</label><input type="time" id="q-start" value="' + ui.esc(q.start || '19:00') + '" />' +
        '<label style="margin-inline-start:12px">' + t('notifQuietTo') + '</label><input type="time" id="q-end" value="' + ui.esc(q.end || '08:00') + '" />' +
      '</div>' +
      '<div class="disclaimer">' + ui.icon('info', 12) + ' ' + t('notifPrototype') + '</div></div>';
  }

  /* ── Wire the personal tab's controls (segmented + toggles + times) ────────── */
  function wirePersonal(root) {
    // segmented groups → theme/lang go to top-level state; density/dateFormat to prefs
    root.querySelectorAll('[data-seg]').forEach(function (b) {
      b.onclick = function () {
        var group = b.dataset.seg, val = b.dataset.val;
        if (group === 'theme') WP.setState({ theme: val });
        else if (group === 'lang') WP.setState({ lang: val });
        else WP.prefs.set(group, val);   // density | dateFormat
        WP.ui.toast(WP.i18n.t('prefSaved'), 'success');
      };
    });
    // channel toggles
    [['nc-email', 'notif.channels.email'], ['nc-slack', 'notif.channels.slack'], ['nc-inapp', 'notif.channels.inapp'],
     ['ct-assignments', 'notif.categories.assignments'], ['ct-mentions', 'notif.categories.mentions'],
     ['ct-evaluations', 'notif.categories.evaluations'], ['ct-digest', 'notif.categories.digest']
    ].forEach(function (pair) {
      var el = root.querySelector('#' + pair[0]);
      if (el) el.onchange = function () { WP.prefs.set(pair[1], el.checked); };
    });
    // quiet-hours toggle reveals the time inputs
    var qon = root.querySelector('#q-on');
    if (qon) qon.onchange = function () { WP.prefs.set('notif.quietHours.on', qon.checked); };
    var qs = root.querySelector('#q-start'), qe = root.querySelector('#q-end');
    if (qs) qs.onchange = function () { WP.prefs.set('notif.quietHours.start', qs.value); };
    if (qe) qe.onchange = function () { WP.prefs.set('notif.quietHours.end', qe.value); };
    wireSecurity(root);
  }

  /* ── Personal: Security (password · devices · last sign-in) ────────────────
   * Change password = email a secure reset link to the user's own verified email
   * (we never handle the old password client-side). "Sign out everywhere" uses
   * Supabase global sign-out. A full per-device list needs the sessions service,
   * so we're honest about that instead of faking rows. */
  function securityView() {
    const t = WP.i18n.t;
    const last = WP.auth && WP.auth.lastSignInAt && WP.auth.lastSignInAt();
    const lastStr = last ? WP.fmt.date(last) : t('secLastLoginUnknown');
    return '<div class="section"><h3>' + t('secTitle') + '</h3>' +
      '<div class="sub" style="margin:-4px 0 12px">' + t('secSub') + '</div>' +

      // Password
      settingRow(t('secPassword'), t('secPasswordNote'),
        '<button class="btn" id="sec-changepw">' + ui.icon('key', 14) + ' ' + t('secChangePw') + '</button>') +
      // Last sign-in
      settingRow(t('secLastLogin'), '', '<span class="ttl">' + ui.esc(lastStr) + '</span>') +

      // Devices / sessions
      '<div class="mini-label" style="margin-top:14px">' + t('secSessions') + '</div>' +
      '<div class="set-item-note" style="margin-bottom:10px">' + t('secSessionsNote') + '</div>' +
      '<div class="sec-device"><span class="dot" style="background:var(--state-available)"></span>' +
        '<div class="sec-device-id"><div class="nm">' + t('secThisDevice') + '</div>' +
        '<div class="ttl">' + t('secActive') + '</div></div></div>' +
      '<div style="margin-top:12px"><button class="btn danger" id="sec-signout-all">' +
        ui.icon('logout', 14) + ' ' + t('secSignOutAll') + '</button></div>' +

      // 2FA (coming soon — honest placeholder, not a fake control)
      settingRow(t('sec2fa'), t('sec2faNote'),
        '<span class="tag">' + t('comingSoon') + '</span>') +
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
    const so = root.querySelector('#sec-signout-all');
    if (so) so.onclick = function () {
      WP.ui.confirm({
        title: t('secSignOutAllConfirmTitle'), icon: 'logout', danger: true,
        body: t('secSignOutAllConfirmBody'),
        confirmLabel: t('secSignOutAll'), cancelLabel: t('cancel')
      }).then(function (ok) {
        if (!ok) return;
        WP.auth.signOutEverywhere();   // ends local session too → app returns to login
      });
    };
  }

  /* ── Workspace: Members & Access ──────────────────────────────────────────
   * The single place to see WHO can enter Tempo and their role — the "app-level
   * gate" (allowlist) that used to be editable only in access.js code. Grant/revoke
   * flows through WP.access.grantAccess (which logs) + WP.setState (which persists
   * the granted set). Role CHANGING stays in the dedicated permissions screen (we
   * link to it) so we don't duplicate that confirm flow. Gated to editSettings. */
  const LEVEL_LABEL = {
    admin:      { en: 'Super Admin',      ar: 'مدير صلاحيات' },
    director:   { en: 'Director',         ar: 'دايركتر' },
    sr_manager: { en: 'Senior Manager',   ar: 'مدير أول' },
    manager:    { en: 'Manager',          ar: 'مدير' },
    sr_spec:    { en: 'Senior Specialist',ar: 'أخصائي أول' },
    spec:       { en: 'Specialist',       ar: 'أخصائي' }
  };
  function levelLabel(level) {
    const o = LEVEL_LABEL[level];
    return o ? (WP.state.lang === 'ar' ? o.ar : o.en) : (level || '—');
  }

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
        '<span class="mbr-role tag">' + ui.esc(levelLabel(p.level)) + '</span>' +
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
        '<button class="btn" id="mbr-roles">' + ui.icon('key', 14) + ' ' + t('membersManageRoles') + '</button>' +
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
    const rl = root.querySelector('#mbr-roles');
    if (rl) rl.onclick = function () { WP.setState({ route: 'permissions' }); };

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

  /* ── Workspace (admin) tab — Members & Access + the org-config sections ────── */
  function workspaceView() {
    const t = WP.i18n.t;
    return '<div class="page-head" style="margin-bottom:12px"><div class="ph-titles">' +
        '<div class="sub">' + t('setWsSub') + '</div></div>' +
      '<div class="ph-actions"><button class="btn" id="go-activity">' + ui.icon('list', 15) + ' ' + t('activityLog') + '</button></div></div>' +
      membersView() +
      '<div class="grid-2">' + tierEditor() + statesView() + '</div>' +
      rolesPanel() +
      slackLinking();
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
      : (accountView() + preferencesView() + notificationsView() + securityView());

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

    // ── workspace wiring (unchanged admin behavior) ──
    wireMembers(root);   // Members & Access (search + grant/revoke toggles + links)
    const ga = root.querySelector('#go-activity');
    if (ga) ga.onclick = function () { WP.setState({ route: 'activity' }); };
    root.querySelectorAll('[data-tier]').forEach(function (inp) {
      inp.onchange = function () {
        const v = Math.max(0, Math.min(100, parseInt(inp.value, 10) || 0));
        WP.data.TIERS[inp.dataset.tier].weight = v;
        WP.logEvent({ type: 'config', by: WP.state.viewerId, target: 'tier ' + inp.dataset.tier + ' = ' + v + '%' });
        WP.setState({});
      };
    });
    // Editable Slack ID — save inline (identity mapping only; never changes hierarchy).
    root.querySelectorAll('[data-slack]').forEach(function (inp) {
      inp.onchange = function () {
        const p = WP.access.byId(inp.dataset.slack);
        if (!p) return;
        const val = inp.value.trim();
        if (p.slackId === val) return;
        p.slackId = val;
        WP.logEvent({ type: 'config', by: WP.state.viewerId, target: 'slackId ' + p.id + ' = ' + (val || '(cleared)') });
        WP.setState({});   // persists + re-renders (missing-count banner updates)
      };
    });
    const ceil = root.querySelector('#ceiling');
    if (ceil) ceil.onchange = function () {
      WP.data.CEILING = Math.max(50, Math.min(200, parseInt(ceil.value, 10) || 100));
      WP.setState({});
    };
  }

  WP.ui.settings = { render: render };
})(window.WP = window.WP || {});
