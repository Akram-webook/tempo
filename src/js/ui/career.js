/* ============================================================
 * Tempo — Career Profile view (Employee Intelligence · VIEW)
 * SPEC: the Career Profile brief. Engine: WP.career. Ethics gate: readiness is a
 *       CATEGORICAL stage with reasons, never a score/rank; every assessment names
 *       its source or says "Evidence unavailable"; the manager decides.
 * ------------------------------------------------------------
 * Surfaces WP.career.build() as a 60-second development picture:
 *   header · executive summary (readiness + reasons) · skills · strengths · gaps ·
 *   manager feedback + timeline · promotion readiness · development plan ·
 *   career path · training · data & sources.
 *
 * Access (spec §18, fail-closed): must canSee() the person to open; sensitive
 * sections (feedback, readiness reasons, dev plan) need canSeeSensitive() (self /
 * direct manager / director). Self sees their development view but not the raw
 * director note. No selection (or a manager landing here) → a person picker of
 * exactly the people the viewer may see. EN+AR, LTR+RTL, both themes.
 * ========================================================== */
(function (WP) {
  'use strict';
  var ui = WP.ui;

  function statusPill(key) {
    var t = WP.i18n.t;
    var map = {
      ready:      { icon: 'check',  cls: 'ready',  lbl: t('cpStReady') },
      developing: { icon: 'sprout', cls: 'dev',    lbl: t('cpStDeveloping') },
      notyet:     { icon: 'clock',  cls: 'notyet', lbl: t('cpStNotYet') }
    };
    var m = map[key] || map.notyet;
    return '<span class="cp-st cp-st--' + m.cls + '">' + WP.ui.icon(m.icon, 12) + ' ' + m.lbl + '</span>';
  }
  function srcLabel(s) {
    var t = WP.i18n.t;
    return { manager: t('cpSrcManager'), system: t('cpSrcSystem'), configurable: t('cpSrcConfig') }[s] || s;
  }
  function srcChip(s) { return '<span class="cp-src">' + WP.ui.icon('eye', 11) + ' ' + srcLabel(s) + '</span>'; }

  /* ---- person picker (manager / director landing, or no selection) ---- */
  function picker(root, viewer) {
    var t = WP.i18n.t;
    var people = WP.access.visiblePeople(viewer).filter(function (p) { return !p.tbc && p.id !== '__admin__'; });
    var q = (WP._cpQuery || '').trim().toLowerCase();
    var shown = q ? people.filter(function (p) { return (WP.i18n.name(p) + ' ' + WP.i18n.title(p)).toLowerCase().indexOf(q) >= 0; }) : people;
    var rows = shown.map(function (p) {
      return '<button type="button" class="cp-pick" data-open="' + p.id + '">' +
        ui.avatar(p, 'var(--brand)') +
        '<span class="cp-pick-id"><span class="cp-pick-nm">' + ui.esc(WP.i18n.name(p)) + '</span>' +
          '<span class="cp-pick-ttl">' + ui.esc(WP.i18n.title(p)) + '</span></span>' +
        '<span class="cp-pick-lvl">' + ui.esc(WP.career.levelName(p.level, WP.state.lang === 'ar')) + '</span>' +
        '<span class="ar ' + (WP.i18n.isRTL() ? 'ar-left' : 'ar-right') + '"></span>' +
      '</button>';
    }).join('') || '<div class="sub" style="padding:16px 0">' + t('noResults') + '</div>';

    root.innerHTML =
      '<div class="wbk-pageheader"><div class="wbk-ph-main">' +
        '<h2 class="wbk-ph-title">' + t('cpTitle') + '</h2>' +
        '<div class="wbk-ph-sub">' + t('cpPickSub') + '</div>' +
      '</div></div>' +
      '<div class="section">' +
        '<div class="cp-search"><input id="cp-q" class="input" type="search" placeholder="' + t('searchPerson') + '" value="' + ui.esc(WP._cpQuery || '') + '" aria-label="' + t('searchPerson') + '"></div>' +
        '<div class="cp-picklist">' + rows + '</div>' +
      '</div>';

    var qi = root.querySelector('#cp-q');
    if (qi) qi.oninput = function () { WP._cpQuery = qi.value; var l = root.querySelector('.cp-picklist'); if (!l) return;
      var v = qi.value.trim().toLowerCase();
      var sh = v ? people.filter(function (p) { return (WP.i18n.name(p) + ' ' + WP.i18n.title(p)).toLowerCase().indexOf(v) >= 0; }) : people;
      l.innerHTML = sh.map(function (p) {
        return '<button type="button" class="cp-pick" data-open="' + p.id + '">' + ui.avatar(p, 'var(--brand)') +
          '<span class="cp-pick-id"><span class="cp-pick-nm">' + ui.esc(WP.i18n.name(p)) + '</span>' +
          '<span class="cp-pick-ttl">' + ui.esc(WP.i18n.title(p)) + '</span></span>' +
          '<span class="cp-pick-lvl">' + ui.esc(WP.career.levelName(p.level, WP.state.lang === 'ar')) + '</span>' +
          '<span class="ar ' + (WP.i18n.isRTL() ? 'ar-left' : 'ar-right') + '"></span></button>';
      }).join('') || '<div class="sub" style="padding:16px 0">' + WP.i18n.t('noResults') + '</div>';
      wirePicks(l);
    };
    wirePicks(root);
  }
  function wirePicks(scope) {
    scope.querySelectorAll('[data-open]').forEach(function (b) {
      b.onclick = function () { WP.setState({ route: 'career', selectedId: b.dataset.open }); };
    });
  }

  /* ---- section builders (all return HTML strings) ---- */

  function headerHTML(b, sens, selfView) {
    var t = WP.i18n.t, p = b.person, ar = WP.state.lang === 'ar';
    var mgr = p.managerId ? WP.access.byId(p.managerId) : null;
    var kv = function (k, v) { return v ? '<div class="cp-hx"><span class="cp-hx-k">' + k + '</span><span class="cp-hx-v">' + v + '</span></div>' : ''; };
    var teamName = ar ? (p.teamAr || p.team) : (p.team);
    var meta =
      kv(t('cpDept'), t('sigDept')) +
      kv(t('tblTeam'), teamName ? ui.esc(teamName) : '') +
      kv(t('cpManager'), mgr ? ui.esc(WP.i18n.name(mgr)) : '—') +
      kv(t('cpJoined'), p.joined ? WP.i18n.shortDate(p.joined) + ' ' + p.joined.slice(0, 4) : '—') +
      kv(t('cpLevel'), ui.esc(b.level.name)) +
      kv(t('cpNextLevel'), b.careerPath.next ? ui.esc(b.careerPath.next.name) : t('cpTopLevel')) +
      kv(t('cpLastReview'), b.review.last ? WP.i18n.shortDate(b.review.last) + ' ' + b.review.last.slice(0, 4) : '—') +
      kv(t('cpNextReview'), b.review.next ? WP.i18n.shortDate(b.review.next) + ' ' + b.review.next.slice(0, 4) : '—');

    var actions =
      '<div class="cp-actions">' +
        '<button class="btn" id="cp-workload">' + WP.ui.icon('gauge', 14) + ' ' + t('cpViewWorkload') + '</button>' +
        (sens ? '<button class="btn" data-cp-scroll="cp-devplan">' + WP.ui.icon('target', 14) + ' ' + t('cpViewDevPlan') + '</button>' : '') +
        (sens ? '<button class="btn" data-cp-scroll="cp-feedback">' + WP.ui.icon('clipboard', 14) + ' ' + t('cpViewFeedback') + '</button>' : '') +
      '</div>';

    return '<div class="cp-head">' +
        '<div class="cp-head-main">' + ui.avatar(p, 'var(--brand)') +
          '<div><div class="nm" style="font-size:22px">' + ui.esc(WP.i18n.name(p)) + '</div>' +
          '<div class="ttl">' + ui.esc(WP.i18n.title(p)) + '</div></div>' +
        '</div>' +
        actions +
        '<div class="cp-hgrid">' + meta + '</div>' +
      '</div>';
  }

  // Executive summary (spec §2): the readiness STAGE + its reasons. Never a % score.
  function summaryHTML(b, sens) {
    var t = WP.i18n.t;
    var rd = b.readiness;
    var meta = {
      ready:      { cls: 'ready',    icon: 'check',  lbl: t('cpReadyReady') },
      nearly:     { cls: 'nearly',   icon: 'sprout', lbl: t('cpReadyNearly') },
      developing: { cls: 'dev',      icon: 'sprout', lbl: t('cpReadyDeveloping') },
      notready:   { cls: 'notready', icon: 'clock',  lbl: t('cpReadyNotYet') }
    }[rd.key] || {};
    var tag = function (arr, icon) { return (arr && arr.length) ? arr.map(function (x) { return '<span class="tag">' + WP.ui.icon(icon, 12) + ' ' + ui.esc(x) + '</span>'; }).join('') : '<span class="sub">—</span>'; };
    var reasons = sens
      ? '<div class="cp-sum-cols">' +
          '<div><div class="mini-label">' + t('cpStrong') + '</div>' + tag(rd.strong, 'check') + '</div>' +
          '<div><div class="mini-label">' + t('cpDevPriorities') + '</div>' + tag(rd.developing.concat(rd.blocking), 'sprout') + '</div>' +
        '</div>'
      : '<div class="disclaimer" style="margin-top:0">' + WP.ui.icon('lock', 13) + ' ' + t('cpSensHidden') + '</div>';

    return '<div class="section cp-summary">' +
      '<div class="cp-sum-top">' +
        '<div><div class="mini-label">' + t('cpNextLevelReadiness') + '</div>' +
          '<div class="cp-ready cp-ready--' + (meta.cls || 'dev') + '">' + WP.ui.icon(meta.icon || 'sprout', 18) + ' ' + (meta.lbl || '') + '</div>' +
          '<div class="sub" style="margin-top:4px">' + t('cpToward') + ' ' + ui.esc(b.careerPath.next ? b.careerPath.next.name : b.level.name) + '</div>' +
        '</div>' +
      '</div>' + reasons +
      '<div class="disclaimer">' + WP.ui.icon('bulb', 13) + ' ' + t('cpReadyDisc') + '</div>' +
    '</div>';
  }

  function skillTrackHTML(sv) {
    var maxN = 5;
    var arrow = sv.trend > 0 ? '<span class="trend-up"><span class="ar ar-up"></span> +' + sv.trend + '</span>'
              : sv.trend < 0 ? '<span class="trend-down"><span class="ar ar-dn"></span> ' + Math.abs(sv.trend) + '</span>' : '';
    var bandLbl = { strong: WP.i18n.t('cpBandStrong'), ontrack: WP.i18n.t('cpBandOnTrack'), gap: WP.i18n.t('cpBandGap') }[sv.band];
    return '<div class="cp-skill">' +
      '<div class="cp-skill-h"><span class="cp-skill-nm">' + ui.esc(sv.name) + '</span>' +
        '<span class="cp-skill-band cp-band--' + sv.band + '">' + bandLbl + '</span></div>' +
      '<div class="track"><i style="width:' + (sv.level / maxN * 100) + '%"></i>' +
        '<span class="req" style="inset-inline-start:' + (sv.target / maxN * 100) + '%" title="' + WP.i18n.t('required') + '"></span></div>' +
      '<div class="cp-skill-meta"><span>' + WP.i18n.t('cpCurrent') + ': <b>' + ui.esc(sv.levelLabel) + '</b></span>' +
        '<span>' + WP.i18n.t('required') + ': <b>' + ui.esc(sv.targetLabel) + '</b></span>' + arrow + '</div>' +
    '</div>';
  }

  function skillsHTML(b) {
    var t = WP.i18n.t, g = b.skillGroups;
    if (!b.hasGrowth) return '<div class="section"><h3>' + WP.ui.icon('grid', 16) + ' ' + t('cpSkills') + '</h3><div class="sub">' + t('cpNoCapability') + '</div></div>';
    var block = function (key, label, icon) {
      var arr = g[key] || [];
      if (!arr.length) return '';
      return '<div class="cp-skill-group"><div class="mini-label">' + WP.ui.icon(icon, 13) + ' ' + label + '</div>' + arr.map(skillTrackHTML).join('') + '</div>';
    };
    // EQ = soft skills / competency framework (spec §6), development-only.
    var eq = '';
    if (b.eq && WP.data.EQ_DOMAINS) {
      var ar = WP.state.lang === 'ar';
      eq = '<div class="cp-skill-group"><div class="mini-label">' + WP.ui.icon('sprout', 13) + ' ' + t('eq') + '</div>' +
        '<div class="cp-eq">' + WP.data.EQ_DOMAINS.map(function (d) {
          var v = b.eq[d.key];
          return '<div class="cp-eq-row"><span>' + (ar ? d.ar : d.en) + '</span><span class="eq-bar"><i style="width:' + (v / 5 * 100) + '%"></i></span><b>' + v + '/5</b></div>';
        }).join('') + '</div>' +
        '<div class="disclaimer" style="margin-top:6px">' + t('eqDisclaimer') + '</div></div>';
    }
    return '<div class="section"><h3>' + WP.ui.icon('grid', 16) + ' ' + t('cpSkills') + '</h3>' +
      '<div class="disclaimer" style="margin-top:0">' + t('cpSkillsNote') + '</div>' +
      block('technical', t('cpGroupTechnical'), 'settings') +
      block('behavioral', t('cpGroupBehavioral'), 'sprout') +
      block('leadership', t('cpGroupLeadership'), 'users') +
      eq +
    '</div>';
  }

  function strengthsHTML(b) {
    var t = WP.i18n.t;
    if (!b.strengths.length) return '';
    return '<div class="section"><h3>' + WP.ui.icon('star', 16) + ' ' + t('cpStrengths') + '</h3>' +
      '<div class="disclaimer" style="margin-top:0">' + t('cpStrengthsNote') + '</div>' +
      b.strengths.map(function (s) {
        return '<div class="cp-item"><div class="cp-item-t">' + ui.esc(s.area) + '</div>' +
          '<div class="cp-item-ev">' + ui.esc(s.evidence) + ' ' + srcChip(s.source) + '</div></div>';
      }).join('') +
    '</div>';
  }

  function gapsHTML(b) {
    var t = WP.i18n.t;
    if (!b.gaps.length) return b.hasGrowth ? '<div class="section"><h3>' + WP.ui.icon('target', 16) + ' ' + t('cpGaps') + '</h3><div class="sub">' + t('cpNoGaps') + '</div></div>' : '';
    return '<div class="section"><h3>' + WP.ui.icon('target', 16) + ' ' + t('cpGaps') + '</h3>' +
      '<div class="disclaimer" style="margin-top:0">' + t('cpGapsNote') + '</div>' +
      b.gaps.map(function (g) {
        return '<div class="cp-gap">' +
          '<div class="cp-gap-h"><span class="cp-skill-nm">' + ui.esc(g.name) + '</span>' +
            '<span class="cp-gap-lvl">' + ui.esc(g.current) + ' → <b>' + ui.esc(g.target) + '</b></span></div>' +
          '<div class="cp-gap-act">' + WP.ui.icon('arrowUp', 12) + ' <span>' + ui.esc(g.action) + '</span></div>' +
        '</div>';
      }).join('') +
    '</div>';
  }

  function feedbackHTML(b) {
    var t = WP.i18n.t;
    if (!b.feedback.length) return '<div class="section" id="cp-feedback"><h3>' + WP.ui.icon('clipboard', 16) + ' ' + t('cpFeedback') + '</h3><div class="sub">' + t('cpNoFeedback') + '</div></div>';
    var typeLabel = { review: t('cpTypeReview'), checkin: t('cpTypeCheckin'), note: t('cpTypeNote') };
    var tags = function (arr, icon) { return (arr && arr.length) ? arr.map(function (x) { return '<span class="tag">' + WP.ui.icon(icon, 11) + ' ' + ui.esc(x) + '</span>'; }).join('') : ''; };
    var items = b.feedback.map(function (e) {
      var by = e.by ? WP.access.byId(e.by) : null;
      var dt = e.date ? (WP.i18n.shortDate(e.date) + ' ' + String(e.date).slice(0, 4)) : '';
      return '<div class="cp-fb">' +
        '<div class="cp-fb-top">' +
          '<span class="cp-fb-type">' + (typeLabel[e.type] || e.type) + '</span>' +
          (e.rating ? '<span class="rating ' + e.rating + '">' + ui.esc(e.rating) + '</span>' : '') +
          '<span class="cp-fb-meta">' + (by ? ui.esc(WP.i18n.name(by)) + ' · ' : '') + dt + '</span>' +
        '</div>' +
        (e.comment ? '<div class="cp-fb-comment">' + ui.esc(e.comment) + '</div>' : '') +
        (e.strengths && e.strengths.length ? '<div class="mini-label">' + t('strengths') + '</div><div>' + tags(e.strengths, 'check') + '</div>' : '') +
        (e.improvements && e.improvements.length ? '<div class="mini-label" style="margin-top:4px">' + t('growthAreas') + '</div><div>' + tags(e.improvements, 'arrowUp') + '</div>' : '') +
        (e.actions && e.actions.length ? '<div class="mini-label" style="margin-top:4px">' + t('cpAgreedActions') + '</div><ul class="cp-ul">' + e.actions.map(function (a) { return '<li>' + ui.esc(a) + '</li>'; }).join('') + '</ul>' : '') +
      '</div>';
    }).join('');
    return '<div class="section" id="cp-feedback"><h3>' + WP.ui.icon('clipboard', 16) + ' ' + t('cpFeedback') + '</h3>' +
      '<div class="disclaimer" style="margin-top:0">' + t('cpFeedbackNote') + '</div>' +
      '<div class="cp-timeline">' + items + '</div>' +
    '</div>';
  }

  // Promotion readiness (spec §9) — the capability checklist WITH evidence + "what's blocking".
  function readinessHTML(b) {
    var t = WP.i18n.t;
    var caps = b.caps;
    var next = b.careerPath.next;
    var rows = caps.length ? caps.map(function (c) {
      var ev = (c.evidence || []).map(function (x) { return ui.esc(x.text); }).join(' · ');
      return '<div class="cp-cap">' +
        '<div class="cp-cap-h"><span class="cp-cap-nm">' + ui.esc(c.label) + '</span>' + statusPill(c.status) + '</div>' +
        (c.why ? '<div class="cp-cap-why">' + ui.esc(c.why) + '</div>' : '') +
        '<div class="cp-cap-ev">' + (ev || t('cpEvidenceNone')) + ' ' + srcChip(c.source) + '</div>' +
      '</div>';
    }).join('') : '<div class="sub">' + t('cpTopLevelNote') + '</div>';

    var blocking = b.readiness.blocking.concat(b.readiness.developing);
    var blockHTML = blocking.length
      ? '<div class="cp-block"><div class="mini-label">' + WP.ui.icon('alert', 13) + ' ' + t('cpBlocking') + '</div>' +
          '<div>' + blocking.map(function (x) { return '<span class="tag">' + ui.esc(x) + '</span>'; }).join('') + '</div></div>'
      : '<div class="cp-block cp-block--clear">' + WP.ui.icon('check', 13) + ' ' + t('cpBlockingClear') + '</div>';

    return '<div class="section"><h3>' + WP.ui.icon('key', 16) + ' ' + t('cpPromotionReadiness') +
        (next ? ' <span class="sub">→ ' + ui.esc(next.name) + '</span>' : '') + '</h3>' +
      '<div class="disclaimer" style="margin-top:0">' + t('cpReadinessNote') + '</div>' +
      rows + blockHTML +
      '<div class="disclaimer">' + WP.ui.icon('lock', 13) + ' ' + t('cpManagerDecides') + '</div>' +
    '</div>';
  }

  function devPlanHTML(b) {
    var t = WP.i18n.t;
    var ownerLbl = { employee: t('cpOwnerEmployee'), manager: t('cpOwnerManager'), both: t('cpOwnerBoth') };
    var stLbl = { inprogress: t('cpPlanInProgress'), planned: t('cpPlanPlanned'), done: t('cpPlanDone'), proposed: t('cpPlanProposed') };
    var rows = b.devPlan.length ? b.devPlan.map(function (o) {
      return '<div class="cp-obj">' +
        '<div class="cp-obj-h"><span class="cp-skill-nm">' + ui.esc(o.title) + '</span>' +
          '<span class="cp-plan-st cp-plan--' + o.status + '">' + (stLbl[o.status] || o.status) + '</span></div>' +
        '<div class="cp-obj-act">' + ui.esc(o.action) + '</div>' +
        '<div class="cp-obj-meta">' +
          '<span>' + WP.ui.icon('user', 11) + ' ' + (ownerLbl[o.owner] || o.owner) + '</span>' +
          (o.due ? '<span>' + WP.ui.icon('clock', 11) + ' ' + WP.i18n.shortDate(o.due) + ' ' + String(o.due).slice(0, 4) + '</span>' : '') +
        '</div>' +
        (o.status !== 'proposed' ? '<div class="track cp-prog"><i style="width:' + (o.progress || 0) + '%"></i></div>' : '') +
      '</div>';
    }).join('') : '<div class="sub">' + t('cpNoPlan') + '</div>';
    var proposed = b.devPlan.some(function (o) { return o.proposed; });
    return '<div class="section" id="cp-devplan"><h3>' + WP.ui.icon('target', 16) + ' ' + t('cpDevPlan') + '</h3>' +
      '<div class="disclaimer" style="margin-top:0">' + t('cpDevPlanNote') + '</div>' +
      rows +
      (proposed ? '<div class="disclaimer">' + WP.ui.icon('bulb', 13) + ' ' + t('cpProposedNote') + '</div>' : '') +
    '</div>';
  }

  function careerPathHTML(b) {
    var t = WP.i18n.t, cp = b.careerPath;
    var node = function (n, cur) { return n ? '<div class="cp-node' + (cur ? ' cp-node--cur' : '') + '"><span class="cp-node-lvl">' + ui.esc(n.name) + '</span>' + (cur ? '<span class="cp-node-tag">' + t('cpCurrent') + '</span>' : '') + '</div>' : ''; };
    var chain = node(cp.current, true) +
      (cp.next ? '<span class="cp-arrow ar ' + (WP.i18n.isRTL() ? 'ar-left' : 'ar-right') + '"></span>' + node(cp.next) : '') +
      (cp.future ? '<span class="cp-arrow ar ' + (WP.i18n.isRTL() ? 'ar-left' : 'ar-right') + '"></span>' + node(cp.future) : '');
    var reqs = (cp.next && b.caps.length)
      ? '<div class="mini-label" style="margin-top:10px">' + t('cpReqFor') + ' ' + ui.esc(cp.next.name) + '</div>' +
        '<div>' + b.caps.map(function (c) { return '<span class="tag">' + ui.esc(c.label) + '</span>'; }).join('') + '</div>'
      : '';
    return '<div class="section"><h3>' + WP.ui.icon('tree', 16) + ' ' + t('cpCareerPath') + '</h3>' +
      '<div class="cp-path">' + chain + '</div>' + reqs +
      '<div class="disclaimer">' + WP.ui.icon('bulb', 13) + ' ' + t('cpConfigurable') + '</div>' +
    '</div>';
  }

  function trainingHTML(b) {
    var t = WP.i18n.t, tr = b.training;
    var col = function (label, arr, empty) {
      return '<div class="cp-tr-col"><div class="mini-label">' + label + '</div>' +
        (arr.length ? arr.map(function (x) {
          return '<div class="cp-tr"><div class="cp-tr-nm">' + ui.esc(x.name) + '</div>' +
            '<div class="cp-tr-meta">' + (x.provider ? ui.esc(x.provider) + (x.date ? ' · ' + WP.i18n.shortDate(x.date) + ' ' + String(x.date).slice(0, 4) : '') : (x.action ? ui.esc(x.action) : '')) +
            (x.skill ? ' · ' + ui.esc(x.skill) : '') + '</div></div>';
        }).join('') : '<div class="sub">' + empty + '</div>') + '</div>';
    };
    return '<div class="section"><h3>' + WP.ui.icon('clipboard', 16) + ' ' + t('cpTraining') + '</h3>' +
      '<div class="cp-tr-grid">' +
        col(t('cpTrDone'), tr.done, t('cpTrNone')) +
        col(t('cpTrInProgress'), tr.inprogress, t('cpTrNone')) +
        col(t('cpTrRecommended'), tr.recommended, t('cpTrNone')) +
      '</div>' +
      '<div class="disclaimer">' + WP.ui.icon('bulb', 13) + ' ' + t('cpTrainingNote') + '</div>' +
    '</div>';
  }

  // Data & sources (spec §15/§16/§17) — transparency footer.
  function sourcesHTML() {
    var t = WP.i18n.t;
    return '<div class="section cp-sources"><h3>' + WP.ui.icon('eye', 16) + ' ' + t('cpSources') + '</h3>' +
      '<ul class="cp-ul">' +
        '<li><b>' + t('cpSrcManager') + '</b> — ' + t('cpSrcManagerDesc') + '</li>' +
        '<li><b>' + t('cpSrcSystem') + '</b> — ' + t('cpSrcSystemDesc') + '</li>' +
        '<li><b>' + t('cpSrcConfig') + '</b> — ' + t('cpSrcConfigDesc') + '</li>' +
      '</ul>' +
      '<div class="disclaimer">' + WP.ui.icon('lock', 13) + ' ' + t('cpEthos') + '</div>' +
    '</div>';
  }

  /* ---- full render ---- */
  function render(root) {
    var viewer = WP.viewer();
    if (!viewer) { root.innerHTML = '<div class="section">' + WP.ui.icon('lock', 14) + ' ' + WP.i18n.t('cpSensHidden') + '</div>'; return; }

    // Resolve the subject. Specialists (own-only) auto-open their own profile;
    // managers/directors with no selection get a picker. Fail closed.
    var id = WP.state.selectedId;
    var canManage = WP.access.canManage(viewer) || WP.access.canAct(viewer);
    if (!id) {
      if (!canManage) id = viewer.id;                 // members → their own profile
      else { picker(root, viewer); return; }          // managers → pick a person
    }
    if (!WP.access.canSee(viewer, id)) { root.innerHTML = '<div class="section">' + WP.ui.icon('lock', 14) + ' ' + WP.i18n.t('cpDenied') + '</div>'; return; }

    var b = WP.career.build(id, { ar: WP.state.lang === 'ar' });
    if (!b) { root.innerHTML = '<div class="section">' + WP.i18n.t('cpDenied') + '</div>'; return; }

    var rel = WP.access.relationshipTo(viewer, id);
    var sens = WP.access.canSeeSensitive(viewer, id);
    var selfView = rel === 'self';
    var relText = { self: WP.i18n.t('relSelf'), manager: WP.i18n.t('relManager'), senior: WP.i18n.t('relSenior'), director: WP.i18n.t('relDirector') }[rel] || '';

    var backBtn = canManage ? '<button class="btn" id="cp-back" style="margin-bottom:14px"><span class="ar ' + (WP.i18n.isRTL() ? 'ar-right' : 'ar-left') + '"></span> ' + WP.i18n.t('cpAllProfiles') + '</button>' : '';
    var provenance = '<div class="provenance"><span>' + WP.ui.icon('lock', 14) + '</span> ' + relText + (sens ? '' : ' · <em>' + WP.i18n.t('cpSensHidden') + '</em>') + '</div>';

    root.innerHTML =
      '<div class="wbk-pageheader"><div class="wbk-ph-main">' +
        '<h2 class="wbk-ph-title">' + WP.i18n.t('cpTitle') + '</h2>' +
        '<div class="wbk-ph-sub">' + WP.i18n.t('cpSub') + '</div>' +
      '</div></div>' +
      backBtn +
      headerHTML(b, sens, selfView) +
      provenance +
      summaryHTML(b, sens) +
      skillsHTML(b) +
      strengthsHTML(b) +
      (sens ? gapsHTML(b) : '') +
      (sens ? feedbackHTML(b) : '') +
      (sens ? readinessHTML(b) : '') +
      (sens ? devPlanHTML(b) : '') +
      careerPathHTML(b) +
      trainingHTML(b) +
      sourcesHTML();

    // wiring
    var back = root.querySelector('#cp-back');
    if (back) back.onclick = function () { WP.setState({ route: 'career', selectedId: null }); };
    var wl = root.querySelector('#cp-workload');
    if (wl) wl.onclick = function () { WP.setState({ route: 'workload', selectedId: id }); };
    root.querySelectorAll('[data-cp-scroll]').forEach(function (btn) {
      btn.onclick = function () { var el = document.getElementById(btn.dataset.cpScroll); if (el && el.scrollIntoView) el.scrollIntoView({ behavior: 'smooth', block: 'start' }); };
    });
  }

  WP.ui.career = { render: render };
})(window.WP = window.WP || {});
