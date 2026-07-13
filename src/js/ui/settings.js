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

  function render(root) {
    const t = WP.i18n.t;
    root.innerHTML =
      '<button class="btn" id="back" style="margin-bottom:16px"><span class="ar ar-left"></span> ' + t('back') + '</button>' +
      '<div class="page-head"><div class="ph-titles">' +
        '<h2>' + t('settings') + '</h2>' +
        '<div class="sub">' + t('orgStructure') + '</div>' +
      '</div><div class="ph-actions">' +
        '<button class="btn" id="go-activity">' + ui.icon('list', 15) + ' ' + t('activityLog') + '</button>' +
      '</div></div>' +
      '<div class="grid-2">' + tierEditor() + statesView() + '</div>' +
      rolesPanel() +
      slackLinking();

    root.querySelector('#back').onclick = function () { WP.setState({ route: 'map' }); };
    root.querySelector('#go-activity').onclick = function () { WP.setState({ route: 'activity' }); };
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
