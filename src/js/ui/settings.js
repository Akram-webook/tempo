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

  function tierEditor() {
    const t = WP.i18n.t;
    const rows = Object.keys(WP.data.TIERS).map(function (k) {
      const tier = WP.data.TIERS[k];
      const label = WP.state.lang === 'ar' ? tier.labelAr : tier.labelEn;
      return '<div class="set-row"><label>' + ui.esc(label) + '</label>' +
        '<input type="number" min="0" max="100" value="' + tier.weight + '" data-tier="' + k + '" /> %</div>';
    }).join('');
    return '<div class="section"><h3>' + t('tierWeights') + '</h3>' + rows +
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
    const rows = WP.data.PEOPLE.map(function (p) {
      return '<div class="set-row" style="gap:10px">' + ui.avatar(p, 'var(--brand)') +
        '<span style="flex:1">' + ui.esc(WP.i18n.name(p)) + '<div class="ttl">' + ui.esc(WP.i18n.title(p)) + '</div></span>' +
        '<span class="tag" style="color:var(--state-available)">● ' + (p.slackId || '—') + '</span></div>';
    }).join('');
    return '<div class="section"><h3>' + t('slackLinking') + '</h3>' + rows +
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

  function render(root) {
    const t = WP.i18n.t;
    root.innerHTML =
      '<button class="btn" id="back" style="margin-bottom:16px"><span class="ar ar-left"></span> ' + t('back') + '</button>' +
      '<h2 style="margin:0 0 4px">' + t('settings') + '</h2>' +
      '<div class="sub" style="margin-bottom:16px">' + t('orgStructure') + '</div>' +
      '<div class="grid-2">' + tierEditor() + statesView() + '</div>' +
      rolesPanel() +
      slackLinking() +
      activityLog();

    root.querySelector('#back').onclick = function () { WP.setState({ route: 'map' }); };
    root.querySelectorAll('[data-tier]').forEach(function (inp) {
      inp.onchange = function () {
        const v = Math.max(0, Math.min(100, parseInt(inp.value, 10) || 0));
        WP.data.TIERS[inp.dataset.tier].weight = v;
        WP.logEvent({ type: 'config', by: WP.state.viewerId, target: 'tier ' + inp.dataset.tier + ' = ' + v + '%' });
        WP.setState({});
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
