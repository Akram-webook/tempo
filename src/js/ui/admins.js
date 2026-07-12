/* ============================================================
 * Tempo — Admins (Super Admin only)
 * ------------------------------------------------------------
 * Create admin accounts and invite them by email. SECURITY (see
 * .claude/skills/tempo-secure-data): the front-end NEVER sets or stores a
 * password. On "Create & send invite" we:
 *   1. write the admin record via WP.db.admins.create (Supabase, RLS),
 *   2. Supabase emails the admin a set-your-own-password link.
 * You never handle the password. The confirmation is neutral (anti-enumeration).
 *
 * Also: paste/CSV import from Jisr — parses rows and pre-fills the form fields
 * for review before any invite is sent.
 *
 * The route is gated in app.js (WP.can('manageAdmins')); this view re-checks the
 * gate itself (defence in depth) and renders nothing sensitive otherwise.
 * ========================================================== */
(function (WP) {
  'use strict';
  const ui = WP.ui;

  // Organizations (UI reference list — NOT PII, safe in the bundle). Trimmed to a
  // representative set; the full Jisr org list can be appended here or loaded from
  // the backend later. Sorted, de-duplicated at build time by hand.
  const ORGS = [
    'Riyadh Season', 'MOS', 'SMC', 'Golf Saudi', 'Alawwal Park', 'MDLBEAST',
    'Anghami Lab', 'Malahi', 'Big Fun Museum', 'Benchmark', 'Saudi Cup 2024',
    'Al-Ittihad Club', 'Al Ahli', 'Al Hilal Club', 'Rotana',
    'Riyadh Region Municipality', 'RAMADAN SEASON', 'One Mic', 'MOC',
    'Eid Season', 'Riyadh Calendar', 'PFL', 'The Esports World Cup Foundation',
    'Al Nassr', 'Riyadh Summer', 'Radisson Hotel', 'Jeddah Events Calendar',
    'Music Nation', 'F1', 'Al Qadsiah', 'Al Kholood', 'Al Taawoun', 'Al Okhdood',
    'Al Wehda Club', 'Al Shabab', 'Al Riyadh', 'Al Ettifaq', 'Al Raed',
    'Al-Orobah', 'Luxury Events', 'Webook', 'SOPC', 'MOI', 'MOC KSA',
    'CAMEL CLUB', 'Al Ula Club', 'webook.com', 'The Club', 'Saudi Media Company',
    'RSG', 'Riyadh Season 23', 'Red Sea Film Festival', 'Diriyah Season',
    'KAFD', 'Sport Boulevard Foundation (SBF)', 'SAFC', 'Maraya', 'LIV Golf',
    'PIF Golf', 'Sela', 'Allure Event', 'Art Week', 'AFC Elite Finals',
    'Jeddah Season 2025', 'Al Fateh', 'Big Bounce Arabia', '4M Events',
    'RCF - Riyadh Comedy Festival', 'Damac', 'Al Khaleej', 'Al Najmah',
    'Al Fayha', 'Riyadh Season 2025 / 2026', 'Kings League', 'Civil Defense',
    'Saudi Aviation Club', 'F1 SAGP', 'AFC Asian Cup U23', 'FIFA', 'Qiddiya City',
    'Roshn Group', 'Ministry Of Media', 'Havas', 'Emaar Entertainment',
    'The Esports Nations Cup', 'Webook.com'
  ];

  // A phone that looks like a Saudi/international number (loose but non-empty + digits).
  function validPhone(v) { return /^\+?[0-9\s\-()]{7,20}$/.test(String(v || '').trim()); }
  function validEmail(v) { return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(v || '').trim()); }

  // Draft state kept on the module so re-render (after import) preserves entry.
  let draft = null;
  function blank() {
    return { firstName: '', lastName: '', email: '', phone: '', gender: '',
             birthDate: '', country: '', city: '', status: '', org: '' };
  }

  function field(id, labelKey, value, type, extra) {
    const t = WP.i18n.t;
    return '<div class="adm-field">' +
      '<label for="adm-' + id + '">' + t(labelKey) + ' <span class="adm-req">*</span></label>' +
      '<input id="adm-' + id + '" name="' + id + '" type="' + (type || 'text') + '" ' +
      (extra || '') + ' value="' + ui.esc(value || '') + '" />' +
      '<div class="adm-err" data-err="' + id + '" role="alert"></div></div>';
  }

  function selectField(id, labelKey, value, options) {
    const t = WP.i18n.t;
    const opts = ['<option value="">' + t('adminOrgSelect') + '</option>'].concat(
      options.map(function (o) {
        return '<option value="' + ui.esc(o.v) + '"' + (o.v === value ? ' selected' : '') + '>' + ui.esc(o.label) + '</option>';
      })).join('');
    return '<div class="adm-field">' +
      '<label for="adm-' + id + '">' + t(labelKey) + ' <span class="adm-req">*</span></label>' +
      '<select id="adm-' + id + '" name="' + id + '">' + opts + '</select>' +
      '<div class="adm-err" data-err="' + id + '" role="alert"></div></div>';
  }

  function formHTML() {
    const t = WP.i18n.t;
    const d = draft;
    const genders = [{ v: 'male', label: t('adminMale') }, { v: 'female', label: t('adminFemale') }];
    const statuses = [{ v: 'active', label: t('adminActive') }, { v: 'inactive', label: t('adminInactive') }];
    const orgs = ORGS.map(function (o) { return { v: o, label: o }; });
    return '<form class="adm-form" novalidate>' +
      '<div class="adm-grid">' +
        field('firstName', 'adminFirstName', d.firstName) +
        field('lastName', 'adminLastName', d.lastName) +
        field('email', 'adminEmail', d.email, 'email', 'autocomplete="off"') +
        field('phone', 'adminPhone', d.phone, 'tel', 'inputmode="tel"') +
        selectField('gender', 'adminGender', d.gender, genders) +
        field('birthDate', 'adminBirth', d.birthDate, 'date') +
        field('country', 'adminCountry', d.country) +
        field('city', 'adminCity', d.city) +
        selectField('status', 'adminStatus', d.status, statuses) +
        selectField('org', 'adminOrg', d.org, orgs) +
      '</div>' +
      '<div class="adm-note">' + ui.icon('lock', 14) + ' ' + t('adminsSub') + '</div>' +
      '<button type="submit" class="btn primary" id="adm-submit">' + ui.icon('link', 15) + ' ' + t('adminSendInvite') + '</button>' +
    '</form>';
  }

  function importHTML() {
    const t = WP.i18n.t;
    return '<details class="adm-import"><summary>' + ui.icon('plus', 14) + ' ' + t('adminImport') + '</summary>' +
      '<p class="sub">' + t('adminImportHint') + '</p>' +
      '<textarea id="adm-import-box" rows="4" placeholder="Ellie, Doe, ellie@gem-grp.com, +966133692527"></textarea>' +
      '<button type="button" class="btn" id="adm-import-btn">' + t('adminImportBtn') + '</button>' +
    '</details>';
  }

  function listHTML() {
    const t = WP.i18n.t;
    const rows = WP.db.admins.list();
    if (!rows.length) return '<div class="section"><h3>' + t('adminList') + '</h3><div class="sub">' + t('adminNone') + '</div></div>';
    const items = rows.map(function (a) {
      const nm = ui.esc((a.firstName + ' ' + a.lastName).trim());
      const badge = a.invited
        ? '<span class="tag" style="color:var(--state-available)">● ' + t('adminActive') + '</span>'
        : '<span class="tag" style="color:var(--state-caution)">● ' + t('adminInvitePending') + '</span>';
      return '<div class="set-row" style="gap:10px">' +
        '<span style="flex:1">' + nm + '<div class="ttl">' + ui.esc(a.email) + (a.org ? ' · ' + ui.esc(a.org) : '') + '</div></span>' +
        badge +
        '<button type="button" class="btn small" data-resend="' + ui.esc(a.email) + '">' + t('adminResend') + '</button>' +
      '</div>';
    }).join('');
    return '<div class="section"><h3>' + t('adminList') + '</h3>' + items + '</div>';
  }

  function validate(root) {
    const t = WP.i18n.t;
    const d = draft;
    const errs = {};
    if (!d.firstName.trim()) errs.firstName = t('valFirstName');
    if (!d.lastName.trim()) errs.lastName = t('valLastName');
    if (!validEmail(d.email)) errs.email = t('valEmail');
    if (!validPhone(d.phone)) errs.phone = t('valPhone');
    if (!d.gender) errs.gender = t('valGender');
    if (!d.birthDate) errs.birthDate = t('valBirth');
    if (!d.country.trim()) errs.country = t('valCountry');
    if (!d.city.trim()) errs.city = t('valCity');
    if (!d.status) errs.status = t('valStatus');
    if (!d.org) errs.org = t('valOrg');
    // paint
    root.querySelectorAll('[data-err]').forEach(function (el) {
      const k = el.getAttribute('data-err');
      el.textContent = errs[k] || '';
      const inp = root.querySelector('#adm-' + k);
      if (inp) inp.classList.toggle('invalid', !!errs[k]);
    });
    return Object.keys(errs).length === 0;
  }

  function bindDraft(root) {
    root.querySelectorAll('.adm-form input, .adm-form select').forEach(function (el) {
      el.oninput = el.onchange = function () { draft[el.name] = el.value; };
    });
  }

  function render(root) {
    const t = WP.i18n.t;
    // Defence in depth: re-check the gate even though app.js already routed.
    if (!WP.can('manageAdmins')) { WP.setState({ route: 'map' }); return; }
    if (!draft) draft = blank();

    root.innerHTML =
      '<button class="btn" id="back" style="margin-bottom:16px"><span class="ar ar-left"></span> ' + t('back') + '</button>' +
      '<h2 style="margin:0 0 4px">' + t('adminsTitle') + '</h2>' +
      '<div class="sub" style="margin-bottom:16px">' + t('adminsSub') + '</div>' +
      '<div class="section"><h3>' + t('adminNew') + '</h3>' +
        importHTML() +
        formHTML() +
      '</div>' +
      listHTML();

    root.querySelector('#back').onclick = function () { WP.setState({ route: 'map' }); };
    bindDraft(root);

    // Jisr paste/CSV import → pre-fill the FIRST row into the form for review.
    const importBtn = root.querySelector('#adm-import-btn');
    if (importBtn) importBtn.onclick = function () {
      const box = root.querySelector('#adm-import-box');
      const lines = String(box.value || '').split(/\r?\n/).map(function (l) { return l.trim(); }).filter(Boolean);
      if (!lines.length) { ui.toast(t('adminImportEmpty'), 'error'); return; }
      const cells = lines[0].split(/\s*[,\t]\s*/);
      draft.firstName = cells[0] || draft.firstName;
      draft.lastName  = cells[1] || draft.lastName;
      draft.email     = cells[2] || draft.email;
      draft.phone     = cells[3] || draft.phone;
      ui.toast(lines.length + ' ' + t('adminImportParsed'), 'success');
      render(root);   // re-render with the pre-filled draft
    };

    // Create & invite.
    const form = root.querySelector('.adm-form');
    if (form) form.onsubmit = function (e) {
      e.preventDefault();
      if (!validate(root)) return;
      const btn = root.querySelector('#adm-submit');
      if (btn) { btn.disabled = true; }
      WP.db.admins.create({
        firstName: draft.firstName.trim(), lastName: draft.lastName.trim(),
        email: draft.email.trim().toLowerCase(), phone: draft.phone.trim(),
        gender: draft.gender, birthDate: draft.birthDate, country: draft.country.trim(),
        city: draft.city.trim(), status: draft.status, org: draft.org
      }).then(function (res) {
        WP.logEvent && WP.logEvent({ type: 'admin-invite', by: WP.state.viewerId, target: draft.email.trim().toLowerCase() });
        // Neutral confirmation (anti-enumeration). Truthful sub-state via toast status.
        if (res.invited) ui.toast(t('adminInviteSent'), 'success');
        else if (res.ok) ui.toast(t('adminInviteNoEmail'), 'success');
        else ui.toast(t('adminSaved'), 'success');
        draft = blank();
        render(root);
      });
    };

    // Resend invite.
    root.querySelectorAll('[data-resend]').forEach(function (b) {
      b.onclick = function () {
        WP.db.admins.invite(b.getAttribute('data-resend')).then(function () {
          ui.toast(t('adminInviteSent'), 'success');
        });
      };
    });
  }

  WP.ui.admins = { render: render, _orgs: ORGS, _validEmail: validEmail, _validPhone: validPhone };
})(window.WP = window.WP || {});
