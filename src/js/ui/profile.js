/* ============================================================
 * Tempo — Peek popover + Employee Profile
 * ========================================================== */
(function (WP) {
  'use strict';
  const ui = WP.ui;

  function projectsList(person) {
    const ids = (person && person.assignedEvents) || [];
    const evs = ids.map(function (eid) { return WP.data.EVENTS[eid]; }).filter(Boolean);
    if (!evs.length) {
      return '<div class="sub">' + WP.i18n.t('noProjects') + '</div>';
    }
    return evs.map(function (ev) {
      const tier = WP.data.TIERS[ev.tier] || { labelAr: '', labelEn: '', weight: 0 };
      return '<div class="proj">' +
        '<span class="tier-chip" style="background:' + ui.tierColor(ev.tier) + '">' +
          (WP.state.lang === 'ar' ? tier.labelAr : tier.labelEn).split('·')[0].trim() + '</span>' +
        '<div style="flex:1"><div class="nm" style="font-size:13px">' + ui.esc(WP.i18n.eventName(ev)) + '</div>' +
        '<div class="ttl">' + ev.start + ' → ' + ev.end + ' · ' + ui.esc(ev.city) + '</div></div>' +
        '<b>' + tier.weight + '%</b></div>';
    }).join('');
  }

  /* ---- peek popover ---- */
  function peek(id) {
    const p = WP.access.byId(id);
    if (!p || !WP.access.canSee(WP.viewer(), id)) return;
    const snap = WP.capacity.snapshot(p, WP.state.window, WP.state.refDate);
    const c = ui.stateColor(snap.state);
    const host = document.getElementById('overlay-host');
    host.innerHTML = '<div class="overlay"><div class="popover">' +
      '<button class="popover-close" id="peek-close" aria-label="Close">' + ui.icon('x', 14) + '</button>' +
      '<div class="profile-head">' + ui.avatar(p, c) +
        '<div><div class="nm">' + ui.esc(WP.i18n.name(p)) + '</div>' +
        '<div class="ttl">' + ui.esc(WP.i18n.title(p)) + '</div>' +
        '<div class="load-pill" style="--node-accent:' + c + ';margin-top:6px"><span class="dot"></span>' +
          snap.load + '% · ' + ui.esc(WP.i18n.stateLabel(snap.state)) + '</div></div></div>' +
      '<h3 style="font-size:13px;margin:6px 0">' + WP.i18n.t('currentProjects') + '</h3>' +
      projectsList(p) +
      '<button class="btn primary" id="open-profile" style="width:100%;margin-top:14px">' +
        WP.i18n.t('openProfile') + '</button></div></div>';
    host.querySelector('.overlay').onclick = function (e) { if (e.target.classList.contains('overlay')) host.innerHTML = ''; };
    host.querySelector('#peek-close').onclick = function () { host.innerHTML = ''; };
    host.querySelector('#open-profile').onclick = function () {
      host.innerHTML = '';
      WP.setState({ route: 'profile', selectedId: id });
    };
  }

  /* ---- growth: skills, EQ, lenses, quarterly, tenure ---- */
  function skillRow(sk) {
    const ladderMax = 5;
    const trend = WP.growth.skillTrend(sk);
    const arrow = trend > 0 ? '<span class="trend-up"><span class="ar ar-up"></span> +' + trend + '</span>'
                : trend < 0 ? '<span class="trend-down"><span class="ar ar-dn"></span> ' + Math.abs(trend) + '</span>'
                : '<span style="color:var(--text-muted)">–</span>';
    const typeKey = sk.type === 'hard' ? 'hardSkills' : 'softSkills';
    return '<div class="skill">' +
      '<div class="nm2">' + ui.esc(sk.name) + '<span class="chip-type">' + WP.i18n.t(typeKey) + '</span></div>' +
      '<div class="track"><i style="width:' + (sk.level / ladderMax * 100) + '%"></i>' +
        '<span class="req" style="inset-inline-start:' + (sk.required / ladderMax * 100) + '%" title="' + WP.i18n.t('required') + '"></span></div>' +
      '<div class="trend">' + sk.level + '/5 ' + arrow + '</div></div>';
  }

  function growthSections(p, sens, selfView) {
    const g = WP.data.GROWTH[p.id];
    if (!g) return '';
    const t = WP.i18n.t;
    const ar = WP.state.lang === 'ar';

    const eq = WP.data.EQ_DOMAINS.map(function (d) {
      const v = g.eq[d.key];
      return '<div class="eq-row"><span style="min-width:120px">' + (ar ? d.ar : d.en) + '</span>' +
        '<span class="eq-bar"><i style="width:' + (v / 5 * 100) + '%"></i></span>' +
        '<b style="font-size:12px">' + v + '/5</b></div>';
    }).join('');

    const q = g.quarterly[0];
    const managerLens =
      '<div class="section"><h3>' + t('managerLens') + '</h3>' +
        '<div class="mini-label">' + t('strengths') + '</div>' +
        '<div>' + g.managerNote.strengths.map(function (x) { return '<span class="tag">' + ui.icon('plus', 12) + ' ' + ui.esc(x) + '</span>'; }).join('') + '</div>' +
        '<div class="mini-label" style="margin-top:6px">' + t('growthAreas') + '</div>' +
        '<div>' + g.managerNote.growth.map(function (x) { return '<span class="tag">' + ui.icon('arrowUp', 12) + ' ' + ui.esc(x) + '</span>'; }).join('') + '</div>' +
        '<div class="mini-label" style="margin-top:8px">' + t('suggestion') + '</div><div style="font-size:13px">' + ui.esc(g.managerNote.suggestion) + '</div>' +
      '</div>';
    const directorLens =
      '<div class="section"><h3>' + t('directorLens') + '</h3>' +
        '<div class="kv"><div class="k">' + t('impact') + '</div><div>' + ui.esc(g.directorNote.impact) + '</div>' +
        '<div class="k">' + t('potential') + '</div><div>' + ui.esc(g.directorNote.potential) + '</div></div>' +
        '<div class="mini-label" style="margin-top:8px">' + t('suggestion') + '</div><div style="font-size:13px">' + ui.esc(g.directorNote.suggestion) + '</div>' +
      '</div>';

    const quarterly = '<div class="section"><h3>' + t('quarterly') +
      ' <span class="rating ' + q.rating + '">' + q.q + ' · ' + q.rating + '</span></h3>' +
      '<div style="font-size:13px;margin-bottom:8px">' + ui.esc(q.summary) + '</div>' +
      '<div class="mini-label">' + t('improved') + '</div><div>' +
        (q.improved.length ? q.improved.map(function (x) { return '<span class="tag">' + WP.ui.icon('check',14) + ' ' + ui.esc(x) + '</span>'; }).join('') : '—') + '</div>' +
      '<div class="mini-label" style="margin-top:6px">' + t('focusNext') + '</div><div>' +
        q.focus.map(function (x) { return '<span class="tag">' + ui.icon('target', 12) + ' ' + ui.esc(x) + '</span>'; }).join('') + '</div>' +
      '<div style="border-top:1px solid var(--border);margin-top:10px;padding-top:8px">' +
        '<div class="mini-label">' + t('reliability') + '</div>' +
        '<div class="kv" style="margin-top:4px"><div class="k">' + t('attendanceL') + '</div><div>' + ui.esc(q.reliability.attendance) + '</div>' +
        '<div class="k">' + t('engagementL') + '</div><div>' + ui.esc(q.reliability.engagement) + '</div></div>' +
      '</div></div>';

    const skills = '<div class="section"><h3>' + t('skills') + '</h3>' +
      g.skills.map(skillRow).join('') +
      '<div class="disclaimer">' + WP.i18n.t('required') + ' = ' + (ar ? 'العلامة الرمادية' : 'the grey marker') + '</div></div>';

    const eqSection = '<div class="section"><h3>' + t('eq') + '</h3><div class="eq-grid">' + eq + '</div>' +
      '<div class="disclaimer">' + t('eqDisclaimer') + '</div></div>';

    const tn = '<div class="section"><h3>' + t('tenure') + '</h3><div class="kv">' +
      '<div class="k">' + t('inCompany') + '</div><div>' + WP.growth.tenureMonths(p) + ' ' + t('months') + '</div>' +
      '<div class="k">' + t('inRole') + '</div><div>' + WP.growth.monthsInRole(p) + ' ' + t('months') + '</div>' +
      '</div></div>';

    const ws = g.workStyle;
    const st = ws ? WP.data.WORK_STAGES[ws.stage] : null;
    const workStyle = ws ? '<div class="section"><h3>' + t('workStyle') +
      (ws.followUp ? ' <span class="rating Developing">' + t('needsFollowUp') + '</span>' : '') + '</h3>' +
      '<div style="font-size:15px;font-weight:600">' + (ar ? st.ar : st.en) + '</div>' +
      '<div class="mini-label" style="margin-top:8px">' + t('howToManage') + '</div>' +
      '<div style="font-size:13px">' + (ar ? st.doAr : st.doEn) + '</div>' +
      '<div style="font-size:13px;margin-top:6px;color:var(--text-muted)">' + ui.esc(ws.note) + '</div>' +
      '<div class="disclaimer">' + t('workStyleNote') + '</div></div>' : '';

    // Operational data (skills, tenure) is visible to anyone who can see the
    // person; people-sensitive sections are gated to direct manager / self / director.
    if (!sens) {
      return skills + tn +
        '<div class="section"><div class="sub">' + WP.ui.icon('lock',14) + ' ' + t('sensitiveHidden') + '</div></div>';
    }
    // Self sees development view (manager coaching, skills, EQ, quarterly) but NOT
    // the raw management signals (director succession note + work-style label).
    const lensPart = managerLens + (selfView ? '' : directorLens);
    const wsPart = selfView ? '' : workStyle;
    return lensPart + wsPart + skills + eqSection + quarterly + tn;
  }

  function promoSection(p) {
    const r = WP.growth.promotionReadiness(p);
    const t = WP.i18n.t;
    const col = r.fairnessGap ? 'var(--state-near)' : (r.pct >= 70 ? 'var(--state-available)' : 'var(--state-balanced)');
    return '<div class="section"><h3>' + t('promoReady') + '</h3>' +
      '<div class="promo">' +
        '<div class="ring" style="color:' + col + ';box-shadow:inset 0 0 0 6px ' + col + '">' + r.pct + '%</div>' +
        '<div style="flex:1"><div style="font-size:13px">' + ui.esc(r.note) + '</div>' +
        '<div class="mini-label" style="margin-top:6px">Tier-1 delivered: ' + r.tier1Delivered +
          ' · ' + (r.sustainable ? (WP.state.lang === 'ar' ? 'مستدام' : 'sustainable') : (WP.state.lang === 'ar' ? 'محمّل زيادة' : 'over-loaded')) + '</div>' +
        '</div></div>' +
      '<div class="disclaimer">' + t('devOnly') + '</div></div>';
  }

  /* Upward feedback RECEIVED by a manager — visible only to people above
   * them (skip-level) / admin, aggregated + anonymous, k-threshold suppressed. */
  function upwardReceived(p) {
    if (!WP.access.canSeeUpward(WP.viewer(), p.id)) return '';
    if (!WP.access.directReports(p.id).length) return '';
    const t = WP.i18n.t, ar = WP.state.lang === 'ar';
    const u = WP.data.UPWARD[p.id];
    if (!u || u.n < WP.data.MIN_RATERS) {
      return '<div class="section"><h3>' + t('upwardReceived') + '</h3>' +
        '<div class="sub">' + WP.ui.icon('lock',14) + ' ' + t('upwardSuppressed').replace('{k}', WP.data.MIN_RATERS).replace('{n}', (u ? u.n : 0)) + '</div></div>';
    }
    const ov = WP.evaluation.upwardOverall(u);
    const bars = WP.data.UPWARD_CRITERIA.map(function (c) {
      const s = u.scores[c.id] || 0;
      return '<div class="skill"><div class="nm2">' + (ar ? c.ar : c.en) + '</div>' +
        '<div class="track"><i style="width:' + (s / 5 * 100) + '%"></i></div>' +
        '<div class="trend">' + s + '/5</div></div>';
    }).join('');
    return '<div class="section"><h3>' + t('upwardReceived') +
      ' <span class="rating Meets">' + ov + '/5 · ' + u.n + ' ' + t('raters') + '</span></h3>' +
      bars +
      '<div class="mini-label" style="margin-top:8px">' + t('themes') + '</div>' +
      '<div>' + u.themes.map(function (x) { return '<span class="tag">“' + ui.esc(x) + '”</span>'; }).join('') + '</div>' +
      '<div class="disclaimer">' + t('upwardReceivedNote') + '</div></div>';
  }

  /* Compensation — budget authority only (Director / Super Admin). Shows
   * pay-band + compa-ratio context, never peer-by-peer salaries. */
  function compPanel(p) {
    if (!WP.access.canSeeComp(WP.viewer())) return '';
    const c = WP.data.COMP[p.id];
    if (!c) return '';
    const t = WP.i18n.t;
    const compa = WP.evaluation.compaRatio(c);
    const pos = Math.max(0, Math.min(100, (c.salary - c.min) / (c.max - c.min) * 100));
    const money = function (n) { return n.toLocaleString() + ' SAR'; };
    return '<div class="section"><h3>' + WP.ui.icon('wallet',16) + ' ' + t('compensation') + '</h3>' +
      '<div class="kv"><div class="k">' + t('band') + '</div><div>' + c.band + '</div>' +
      '<div class="k">' + t('salary') + '</div><div>' + money(c.salary) + ' / mo</div>' +
      '<div class="k">' + t('compaRatio') + '</div><div>' + compa + (compa < 0.8 ? ' · below band' : compa > 1.2 ? ' · red zone' : ' · in band') + '</div></div>' +
      '<div class="mini-label" style="margin-top:8px">' + t('rangePosition') + '</div>' +
      '<div class="track" style="height:10px;position:relative"><i style="width:' + pos + '%"></i>' +
        '<span class="req" style="inset-inline-start:50%"></span></div>' +
      '<div class="ttl" style="margin-top:4px">' + money(c.min) + ' — ' + money(c.mid) + ' — ' + money(c.max) + '</div>' +
      '<div class="disclaimer">' + t('compNote') + '</div></div>';
  }

  /* ---- full profile ---- */
  function render(root) {
    const p = WP.access.byId(WP.state.selectedId);
    if (!p || !WP.access.canSee(WP.viewer(), p.id)) {
      root.innerHTML = '<div class="section">Not authorized to view this profile.</div>';
      return;
    }
    const snap = WP.capacity.snapshot(p, WP.state.window, WP.state.refDate);
    const c = ui.stateColor(snap.state);
    const dc = p.dailyCheckin;
    const t = WP.i18n.t;
    const fr = WP.growth.flightRisk(p);
    const rel = WP.access.relationshipTo(WP.viewer(), p.id);
    const sens = WP.access.canSeeSensitive(WP.viewer(), p.id);
    const selfView = rel === 'self'; // employees see their development view, not raw risk labels
    const relText = { self: t('relSelf'), manager: t('relManager'), senior: t('relSenior'), director: t('relDirector') }[rel] || '';
    const provenance = '<div class="provenance"><span>' + WP.ui.icon('lock',14) + '</span> ' + relText +
      (sens ? '' : ' · <em>' + t('sensitiveHidden') + '</em>') + '</div>';

    root.innerHTML =
      '<button class="btn" id="back" style="margin-bottom:16px"><span class="ar ar-left"></span> ' + t('back') + '</button>' +
      '<div class="profile-head">' + ui.avatar(p, c) +
        '<div><div class="nm" style="font-size:20px">' + ui.esc(WP.i18n.name(p)) + '</div>' +
        '<div class="ttl">' + ui.esc(WP.i18n.title(p)) + '</div></div>' +
        '<div style="margin-inline-start:auto;text-align:end">' +
        '<div class="value" style="color:' + c + ';font-size:28px;font-weight:700">' + snap.load + '%</div>' +
        '<div class="sub">' + ui.esc(WP.i18n.stateLabel(snap.state)) + '</div></div></div>' +

      provenance +
      ((rel === 'manager' || rel === 'director') ? '<button class="btn primary" id="open-eval" style="margin-bottom:14px">' + ui.icon('clipboard', 15) + ' ' + t('openEvaluation') + '</button>' : '') +
      (selfView ? '<button class="btn primary" id="self-eval" style="margin-bottom:14px">' + WP.ui.icon('pencil',15) + ' ' + t('mySelfAssessment') + '</button> ' : '') +
      (selfView && p.managerId ? '<button class="btn" id="eval-mgr" style="margin-bottom:14px"><span class="ar ar-up"></span> ' + t('evaluateMyManager') + '</button>' : '') +
      (snap.burnout ? '<div class="warn-banner">' + WP.ui.icon('flame',15) + ' ' + t('burnoutFlag') + '</div>' : '') +
      (sens && !selfView && fr.risk ? '<div class="banner-risk">' + WP.ui.icon('alert',15) + ' ' + t('flightRisk') + ' — ' + ui.esc(fr.reasons.join(' · ')) + '</div>' : '') +
      (WP.growth.isRamping(p) ? '<div class="banner-info">' + WP.ui.icon('sprout',15) + ' ' + t('rampingUp') + '</div>' : '') +

      (sens ? promoSection(p) : '') +

      '<div class="profile-body">' +
        '<div class="section"><h3>' + t('pressure') + '</h3>' + projectsList(p) + '</div>' +
        (dc ? '<div class="section"><h3>' + t('dailySummary') + '</h3><div class="kv">' +
          '<div class="k">' + t('plan') + '</div><div>' + ui.esc(dc.plan) + '</div>' +
          '<div class="k">' + t('done') + '</div><div>' + ui.esc(dc.done) + '</div>' +
          '<div class="k">' + t('remaining') + '</div><div>' + ui.esc(dc.remaining) + '</div>' +
          '<div class="k">' + t('learned') + '</div><div>' + ui.esc(dc.learned) + '</div>' +
          '</div></div>' : '') +
        growthSections(p, sens, selfView) +
        upwardReceived(p) +
        compPanel(p) +
      '</div>';

    root.querySelector('#back').onclick = function () { WP.setState({ route: 'map', selectedId: null }); };
    const oe = root.querySelector('#open-eval');
    if (oe) oe.onclick = function () { WP.setState({ route: 'evaluation' }); };
    const em = root.querySelector('#eval-mgr');
    if (em) em.onclick = function () { WP.setState({ route: 'upward', selectedId: p.managerId }); };
    const se = root.querySelector('#self-eval');
    if (se) se.onclick = function () { WP.setState({ route: 'evaluation', selectedId: p.id }); };
  }

  WP.ui.peek = peek;
  WP.ui.profile = { render: render };
})(window.WP = window.WP || {});
