/* ============================================================
 * Tempo — Assignment Drawer
 * ------------------------------------------------------------
 * AI suggests, humans decide. Candidates are ranked by proximity
 * then lowest load. Hover/select simulates the projected load and
 * state change. Overloaded candidates are soft-locked and require
 * a logged override (who/when/why) — transparency, not punishment.
 * ========================================================== */
(function (WP) {
  'use strict';
  const ui = WP.ui;

  function proximity(viewer, person) {
    if (person.managerId === viewer.id) return 0;          // direct report
    if (WP.access.teamOf(viewer.id).some(function (p) { return p.id === person.id; })) return 1; // in team
    return 2;
  }

  /* Step 1 — capture the work request (this is what makes the tool the
   * single place requests land, instead of Slack + verbal). */
  function openRequest() {
    const viewer = WP.viewer();
    if (!WP.access.canAct(viewer)) return;
    const t = WP.i18n.t;
    const host = document.getElementById('overlay-host');
    const tierOpts = Object.keys(WP.data.TIERS).map(function (k) {
      const ti = WP.data.TIERS[k];
      return '<option value="' + k + '">' + (WP.state.lang === 'ar' ? ti.labelAr : ti.labelEn) + ' · ' + ti.weight + '%</option>';
    }).join('');
    host.innerHTML = '<div class="overlay"><div class="drawer">' +
      '<button class="btn icon-btn" id="close" style="margin-bottom:14px" aria-label="' + WP.i18n.t('close') + '">' + WP.ui.icon('x', 14) + '</button>' +
      '<h3>' + WP.ui.icon('plus', 16) + ' ' + t('newRequest') + '</h3>' +
      '<div class="sub" style="margin-bottom:14px">' + t('newRequestNote') + '</div>' +
      '<label class="req-l">' + t('reqTitle') + '</label><input id="r-title" class="req-i" placeholder="e.g. Pop-up Concert" />' +
      '<label class="req-l">' + t('reqTier') + '</label><select id="r-tier" class="req-i">' + tierOpts + '</select>' +
      '<div style="display:flex;gap:10px">' +
        '<div style="flex:1"><label class="req-l">' + t('reqStart') + '</label><input id="r-start" type="date" class="req-i" value="' + WP.state.refDate + '" /></div>' +
        '<div style="flex:1"><label class="req-l">' + t('reqEnd') + '</label><input id="r-end" type="date" class="req-i" value="' + WP.state.refDate + '" /></div></div>' +
      '<label class="req-l">' + t('reqCity') + '</label><input id="r-city" class="req-i" placeholder="Riyadh" />' +
      '<button class="btn primary" id="r-find" style="margin-top:16px;width:100%">' + t('findCandidates') + ' →</button>' +
      '</div></div>';
    host.querySelector('#close').onclick = function () { host.innerHTML = ''; };
    host.querySelector('.overlay').onclick = function (e) { if (e.target.classList.contains('overlay')) host.innerHTML = ''; };
    host.querySelector('#r-find').onclick = function () {
      const title = host.querySelector('#r-title').value.trim() || t('untitledRequest');
      const tier = parseInt(host.querySelector('#r-tier').value, 10);
      const start = host.querySelector('#r-start').value || WP.state.refDate;
      const end = host.querySelector('#r-end').value || start;
      const city = host.querySelector('#r-city').value.trim() || '—';
      const id = 'req_' + Date.now();
      WP.data.EVENTS[id] = { id: id, tier: tier, nameEn: title, nameAr: title, start: start, end: (end < start ? start : end), city: city, intl: false };
      WP.logEvent({ type: 'request-created', by: WP.state.viewerId, target: title + ' (T' + tier + ')' });
      open(id); // step 2 → ranked candidates
    };
  }

  function open(eventId) {
    const viewer = WP.viewer();
    if (!WP.access.canAct(viewer)) return;
    const ev = WP.data.EVENTS[eventId];
    const people = WP.access.visiblePeople(viewer).filter(function (p) { return p.id !== viewer.id; });

    const ranked = people.map(function (p) {
      return { p: p, sim: WP.capacity.simulateAssignment(p, eventId, WP.state.window, WP.state.refDate),
               prox: proximity(viewer, p) };
    }).sort(function (a, b) {
      if (a.prox !== b.prox) return a.prox - b.prox;       // proximity first
      return a.sim.before - b.sim.before;                  // then lowest current load
    });

    // The top of the ranked list is the system's SUGGESTED pick (capacity + proximity).
    // We record whether the human took it — honest AI-acceptance provenance, only when
    // a suggestion was actually shown (ranked has candidates). No ranking → no flag.
    const aiSuggested = ranked.length ? ranked[0].p.id : null;

    const host = document.getElementById('overlay-host');
    host.innerHTML = '<div class="overlay"><div class="drawer">' +
      '<button class="btn icon-btn" id="close" style="margin-bottom:14px" aria-label="' + WP.i18n.t('close') + '">' + WP.ui.icon('x', 14) + '</button>' +
      '<h3>' + WP.i18n.t('assign') + ': ' + ui.esc(WP.i18n.eventName(ev)) +
        ' <span class="tier-chip" style="background:' + ui.tierColor(ev.tier) + '">T' + ev.tier + '</span></h3>' +
      '<div class="sub" style="margin-bottom:12px">' + WP.i18n.t('candidates') + '</div>' +
      ranked.map(function (r) {
        const after = r.sim.afterState, c = ui.stateColor(after);
        const locked = r.sim.softLocked;
        return '<div class="row" data-pid="' + r.p.id + '" style="--node-accent:' + ui.stateColor(r.sim.beforeState) + '">' +
          ui.avatar(r.p, ui.stateColor(r.sim.beforeState)) +
          '<div style="flex:1"><div class="nm" style="font-size:13px">' + ui.esc(WP.i18n.name(r.p)) + '</div>' +
          '<div class="ttl">' + WP.i18n.t('projected') + ': ' + r.sim.before + '% → <b style="color:' + c + '">' +
            r.sim.after + '%</b> · ' + ui.esc(WP.i18n.stateLabel(after)) + '</div></div>' +
          (locked
            ? '<button class="btn" data-override="' + r.p.id + '">' + WP.i18n.t('softLocked') + '</button>'
            : '<button class="btn primary icon-btn" data-do="' + r.p.id + '" aria-label="' + WP.i18n.t('assign') + '">' + WP.ui.icon('plus', 15) + '</button>') +
        '</div>';
      }).join('') +
      '</div></div>';

    host.querySelector('#close').onclick = function () { host.innerHTML = ''; };
    host.querySelector('.overlay').onclick = function (e) { if (e.target.classList.contains('overlay')) host.innerHTML = ''; };

    host.querySelectorAll('[data-do]').forEach(function (b) {
      b.onclick = function () { doAssign(eventId, b.dataset.do, false, null, aiSuggested); host.innerHTML = ''; };
    });
    host.querySelectorAll('[data-override]').forEach(function (b) {
      b.onclick = function () {
        const why = prompt('Override reason (logged):');
        if (why) { doAssign(eventId, b.dataset.override, true, why, aiSuggested); host.innerHTML = ''; }
      };
    });
  }

  function doAssign(eventId, personId, override, why, aiSuggested) {
    const p = WP.access.byId(personId);
    if (!p) return;
    p.assignedEvents = p.assignedEvents || [];
    if (!p.assignedEvents.includes(eventId)) p.assignedEvents.push(eventId);
    const entry = {
      type: override ? 'override-assign' : 'assign',
      by: WP.state.viewerId, target: personId, event: eventId, reason: why || null,
    };
    // AI-acceptance provenance: only stamp when a suggestion was actually shown.
    // Taking the top-ranked pick = accepted; choosing another / overriding = not.
    if (aiSuggested != null) entry.aiAccepted = (!override && personId === aiSuggested);
    WP.logEvent(entry);
    WP.setState({}); // re-render
  }

  WP.ui.assignmentDrawer = { open: open, openRequest: openRequest };
})(window.WP = window.WP || {});
