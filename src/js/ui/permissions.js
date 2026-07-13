/* ============================================================
 * Webook Workload — Super Admin · Access management
 * ------------------------------------------------------------
 * The Super Admin (or Director) grants access by assigning each
 * person's ROLE. Changing a role changes what that person can see
 * IMMEDIATELY (RBAC), and every change is written to the activity
 * log (who / when / what) for accountability.
 * ========================================================== */
(function (WP) {
  'use strict';
  const ui = WP.ui;

  const ROLE_OPTIONS = [
    { v: 'spec',       en: 'Specialist',         ar: 'أخصائي' },
    { v: 'sr_spec',    en: 'Senior Specialist',  ar: 'أخصائي أول' },
    { v: 'manager',    en: 'Manager',            ar: 'مدير' },
    { v: 'sr_manager', en: 'Senior Manager',     ar: 'مدير أول' },
    { v: 'director',   en: 'Director',           ar: 'دايركتر' },
    { v: 'admin',      en: 'Super Admin',        ar: 'مدير صلاحيات' },
  ];

  function roleLabel(level) {
    const o = ROLE_OPTIONS.find(function (x) { return x.v === level; });
    return o ? (WP.state.lang === 'ar' ? o.ar : o.en) : level;
  }

  function whatTheySee(level) {
    const map = {
      admin:      { en: 'Everything + manage permissions', ar: 'كل شيء + إدارة الصلاحيات' },
      director:   { en: 'Whole department + settings',      ar: 'القسم كامل + الإعدادات' },
      sr_manager: { en: 'Their portfolio (managers + teams)',ar: 'محفظتهم (المدراء + الفرق)' },
      manager:    { en: 'Their team (full detail)',          ar: 'فريقهم (تفاصيل كاملة)' },
      sr_spec:    { en: 'Self only',                         ar: 'نفسه فقط' },
      spec:       { en: 'Self only',                         ar: 'نفسه فقط' },
    };
    const m = map[level] || map.spec;
    return WP.state.lang === 'ar' ? m.ar : m.en;
  }

  function render(root) {
    const t = WP.i18n.t;
    if (!WP.access.canManage(WP.viewer())) {
      root.innerHTML = '<button class="btn" id="back" style="margin-bottom:16px"><span class="ar ar-left"></span> ' + t('back') + '</button>' +
        '<div class="section"><div class="sub">' + WP.ui.icon('lock',14) + ' ' + t('permsDenied') + '</div></div>';
      root.querySelector('#back').onclick = function () { WP.setState({ route: 'map' }); };
      return;
    }

    const rows = WP.data.PEOPLE.slice()
      .sort(function (a, b) { return WP.i18n.name(a).localeCompare(WP.i18n.name(b)); })
      .map(function (p) {
        return '<div class="perm-row">' +
          ui.avatar(p, 'var(--brand)') +
          '<div class="perm-meta"><div class="nm">' + ui.esc(WP.i18n.name(p)) + '</div>' +
            '<div class="ttl">' + ui.esc(WP.i18n.title(p)) + '</div></div>' +
          '<div class="perm-sees ttl">' + ui.esc(whatTheySee(p.level)) + '</div>' +
          '<select class="btn" data-role="' + p.id + '">' +
            ROLE_OPTIONS.map(function (o) {
              return '<option value="' + o.v + '"' + (p.level === o.v ? ' selected' : '') + '>' +
                (WP.state.lang === 'ar' ? o.ar : o.en) + '</option>';
            }).join('') +
          '</select></div>';
      }).join('');

    root.innerHTML =
      '<button class="btn" id="back" style="margin-bottom:16px"><span class="ar ar-left"></span> ' + t('back') + '</button>' +
      '<h2 style="margin:0 0 2px">' + t('permsTitle') + '</h2>' +
      '<div class="sub" style="margin-bottom:16px">' + t('permsNote') + '</div>' +
      '<div class="section"><h3>' + t('assignRole') + '</h3>' +
        '<div class="perm-list">' + rows + '</div>' +
        '<div class="disclaimer">' + t('permsLog') + '</div></div>';

    root.querySelector('#back').onclick = function () { WP.setState({ route: 'map' }); };
    root.querySelectorAll('[data-role]').forEach(function (sel) {
      sel.onchange = function () {
        const p = WP.access.byId(sel.dataset.role);
        const oldLevel = p.level;
        const newLevel = sel.value;
        // safety: don't let an admin demote their own access and lock themselves out
        if (p.id === WP.state.viewerId && !WP.access.canManage(Object.assign({}, p, { level: newLevel }))) {
          WP.ui.toast(WP.i18n.t('cantDemoteSelf'), 'warn');
          sel.value = oldLevel; return;
        }
        // governance + risk mitigation: confirm before changing someone's access
        WP.ui.confirm({
          title: WP.i18n.t('roleChangeTitle'), icon: 'key', danger: true,
          body: WP.i18n.t('confirmRole').replace('{n}', WP.ui.esc(WP.i18n.name(p))).replace('{r}', WP.ui.esc(roleLabel(newLevel))),
          confirmLabel: WP.i18n.t('confirm'), cancelLabel: WP.i18n.t('cancel')
        }).then(function (ok) {
          if (!ok) { sel.value = oldLevel; return; }
          p.level = newLevel;
          WP.logEvent({ type: 'role-change', by: WP.state.viewerId, target: p.id,
                        reason: roleLabel(oldLevel) + ' → ' + roleLabel(p.level) });
          WP.setState({});
        });
      };
    });
  }

  WP.ui.permissions = { render: render };
})(window.WP = window.WP || {});
