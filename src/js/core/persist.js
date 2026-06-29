/* ============================================================
 * Tempo — Data persistence (localStorage)
 * ------------------------------------------------------------
 * The session (who/route/theme) is persisted by state.js. THIS layer persists
 * the user's WORK — completed evaluations, self-assessments, role changes,
 * access grants, daily check-ins, the active cycle, and the activity log — so a
 * reload no longer wipes everything (the SEV1 "forgets on refresh" finding).
 *
 * This is the right fix for a single-user browser prototype. A multi-user
 * "system of record" still needs a real backend (see Tempo-Expert-Review.md);
 * this is the honest best within a static, no-server build.
 * ========================================================== */
(function (WP) {
  'use strict';
  var BASE = 'tempo_data', V = 2;
  // F7: read/write the CURRENT signed-in user's namespaced key (tempo_data::<id>),
  // falling back to the global base only if the identity layer isn't present.
  function KEY() { return (WP.identity && WP.identity.nsKey) ? WP.identity.nsKey(BASE) : BASE; }

  function snapshot() {
    var d = WP.data || {};
    return {
      v: V,
      evaluations: d.EVALUATIONS || {},
      self: d.SELF || {},
      roles: (d.PEOPLE || []).reduce(function (m, p) { if (p && p.id) m[p.id] = p.level; return m; }, {}),
      granted: (WP.access && WP.access.listAccess) ? WP.access.listAccess() : null,
      engage: (WP.engage && WP.engage.snapshot) ? WP.engage.snapshot() : null,
      activeCycle: (WP.evaluation && WP.evaluation.activeCycle && WP.evaluation.activeCycle()) ? WP.evaluation.activeCycle().id : null,
      activity: WP.activityLog || []
    };
  }

  function saveData() { try { localStorage.setItem(KEY(), JSON.stringify(snapshot())); } catch (e) {} }

  function hydrate() {
    try {
      var raw = localStorage.getItem(KEY()); if (!raw) return;
      var s = JSON.parse(raw); if (!s || s.v !== V) return;     // ignore old/foreign shapes
      var d = WP.data || {};
      if (s.evaluations && d.EVALUATIONS) Object.keys(s.evaluations).forEach(function (k) { d.EVALUATIONS[k] = s.evaluations[k]; });
      if (s.self && d.SELF) Object.keys(s.self).forEach(function (k) { d.SELF[k] = s.self[k]; });
      if (s.roles && d.PEOPLE) d.PEOPLE.forEach(function (p) { if (p && s.roles[p.id]) p.level = s.roles[p.id]; });
      if (s.granted && WP.access && WP.access.setAccess) WP.access.setAccess(s.granted);
      if (s.engage && WP.engage && WP.engage.restore) WP.engage.restore(s.engage);
      if (s.activeCycle && WP.evaluation && WP.evaluation.setActiveCycle) WP.evaluation.setActiveCycle(s.activeCycle);
      if (Array.isArray(s.activity)) WP.activityLog = s.activity;
    } catch (e) {}
  }

  /* F7 (in-memory completion): namespacing isolates the PERSISTED caches, but the
   * mutable work stores (EVALUATIONS/SELF/roles/grants/engage/activity) live in
   * one shared WP.data. On a no-reload handover (user A signs out, user B signs in
   * in the same page) B's hydrate would MERGE onto A's lingering in-memory work.
   * So on every identity change we first reset those stores to the synthetic
   * BASELINE (the mock captured at load, before any saved work was applied), then
   * hydrate the new user. Unlike hydrate() (which merges), this REPLACES — it
   * deletes keys not in the baseline so nothing from the previous user survives.
   * Same user reloading is unaffected: identity doesn't change, so reset isn't called. */
  function deep(o) { try { return JSON.parse(JSON.stringify(o)); } catch (e) { return o; } }
  var BASELINE = deep(snapshot());   // captured at module load = the pure mock state

  function resetToBaseline() {
    try {
      var s = BASELINE || {}; var d = WP.data || {};
      if (d.EVALUATIONS) { Object.keys(d.EVALUATIONS).forEach(function (k) { delete d.EVALUATIONS[k]; });
        if (s.evaluations) Object.keys(s.evaluations).forEach(function (k) { d.EVALUATIONS[k] = deep(s.evaluations[k]); }); }
      if (d.SELF) { Object.keys(d.SELF).forEach(function (k) { delete d.SELF[k]; });
        if (s.self) Object.keys(s.self).forEach(function (k) { d.SELF[k] = deep(s.self[k]); }); }
      if (s.roles && d.PEOPLE) d.PEOPLE.forEach(function (p) { if (p && s.roles[p.id]) p.level = s.roles[p.id]; });
      if (WP.access && WP.access.setAccess) WP.access.setAccess(s.granted || []);
      if (WP.engage && WP.engage.restore) WP.engage.restore(deep(s.engage));
      if (s.activeCycle && WP.evaluation && WP.evaluation.setActiveCycle) WP.evaluation.setActiveCycle(s.activeCycle);
      WP.activityLog = Array.isArray(s.activity) ? deep(s.activity) : [];
    } catch (e) {}
  }

  WP.persist = { saveData: saveData, hydrate: hydrate, resetToBaseline: resetToBaseline };
})(window.WP = window.WP || {});
