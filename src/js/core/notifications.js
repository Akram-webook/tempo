/* ============================================================
 * Tempo — Notifications engine (the "what needs me" source of truth)
 * ------------------------------------------------------------
 * ONE place that answers "what needs this person, right now?" — from WORK, not
 * people-watching. Two surfaces consume it: the in-app bell/inbox (Phase 1,
 * ui/notifications.js) and, later, a Slack digest/nudge (Phase 2). Same logic,
 * two surfaces — mirrors the sheet→deck+page pattern.
 *
 * DOM-free (core layer): pure functions + an in-memory per-viewer dismiss set.
 * The UI does the DOM + the async fetch and passes data IN (buildItems ctx), so
 * this stays unit-testable and Phase-2-reusable.
 *
 * GUARDRAILS (Constitution II/V — this is a workforce tool, not surveillance):
 *  - Work-based triggers ONLY. No "you haven't logged in", no idle/activity.
 *  - Every item must point at something the viewer could ALREADY see (the item
 *    builders here only use data the viewer's role already permits).
 *  - Dismiss/seen is PERSONAL to the viewer and never exposed to anyone else.
 * ========================================================== */
(function (WP) {
  'use strict';

  // Per-viewer dismissed item ids. SESSION-ONLY + in-memory (Phase 1): never
  // localStorage (would leak one person's private seen-state on a shared device)
  // and we do not stand up new storage infra for v1. Keyed by viewerId so a
  // "view as" switch shows the right person's inbox. Cleared on reload — an
  // honest v1 tradeoff noted in the wave.
  var DISMISSED = {};   // { viewerId: { itemId: true } }

  function dismissedSet(viewerId) {
    if (!DISMISSED[viewerId]) DISMISSED[viewerId] = {};
    return DISMISSED[viewerId];
  }
  function dismiss(viewerId, itemId) { dismissedSet(viewerId)[itemId] = true; }
  function dismissAll(viewerId, itemIds) {
    var s = dismissedSet(viewerId);
    (itemIds || []).forEach(function (id) { s[id] = true; });
  }
  function isDismissed(viewerId, itemId) { return !!dismissedSet(viewerId)[itemId]; }
  function resetDismissed(viewerId) {   // test hook
    if (viewerId) delete DISMISSED[viewerId]; else DISMISSED = {};
  }

  /* ---- item-type registry (data-driven: add a type = add one entry) --------
   * Each builder is a pure (viewer, ctx) -> [item]. An item is:
   *   { id, type, icon, text, area, route, at }  (at = ISO string or null)
   * `at` drives newest-first sort + relative time; null sinks to the bottom.
   * A builder returns [] when its data is absent — so the whole feature is
   * dormant-safe (empty sources ⇒ no items ⇒ "all caught up"). */
  var TYPES = {
    // DIRECTOR / ADMIN — Feedback items whose Status is the red "needs input"
    // bucket. Source: the Executive Status payload (ctx.execRequests), fetched
    // by the UI via the shared endpoint. Gated to viewers who may see it.
    needsInput: {
      build: function (viewer, ctx) {
        if (!viewer || !(WP.can && WP.can('viewSettings'))) return [];      // director/admin only
        var reqs = (ctx && ctx.execRequests) || [];
        var colorKey = WP.execStatus && WP.execStatus.statusColorKey;
        if (!colorKey) return [];
        return reqs.filter(function (r) { return colorKey(r.status) === 'red'; })
          .map(function (r, i) {
            var area = String(r.area || '').trim();
            var note = String(r.note || '').trim();
            return {
              id: 'needsInput:' + (r.id != null && String(r.id).trim() ? r.id : (area + '#' + i)),
              type: 'needsInput',
              icon: 'alert',
              text: WP.i18n.t('needsYourInput') + (note ? ' — ' + note : ''),
              area: area,
              route: 'exec',
              at: r.date ? String(r.date) : null,
            };
          });
      },
    },

    // EVERYONE — the viewer's own self-assessment is due while a cycle is open.
    // Purely the viewer's OWN status (no one else's) — no surveillance.
    selfAssessmentDue: {
      build: function (viewer) {
        if (!viewer || !WP.evaluation || !WP.evaluation.activeCycle) return [];
        var cycle = WP.evaluation.activeCycle();
        if (!cycle || cycle.status !== 'Active') return [];
        var self = WP.data && WP.data.SELF && WP.data.SELF[viewer.id];
        if (self && self.status === 'Completed') return [];   // already done → nothing
        return [{
          id: 'selfAssessment:' + cycle.id,
          type: 'selfAssessmentDue',
          icon: 'clipboard',
          text: WP.i18n.t('selfAssessmentDue'),
          area: cycle.name || '',
          route: 'evaluations',
          at: null,   // not time-stamped; sorts after dated items
        }];
      },
    },

    // DIRECTOR / ADMIN — a delivery WAVE just reached 100%. Source: ctx.execWaves
    // (waves[] from the warehouse). One item per completed wave; the id is stable
    // per wave name so it can be dismissed and won't nag. This is the "tell Ahmed
    // when it's done" alert (Ahmed is a director, so it lands in his feed).
    waveCompleted: {
      build: function (viewer, ctx) {
        if (!viewer || !(WP.can && WP.can('viewSettings'))) return [];   // director/admin only
        var waves = (ctx && ctx.execWaves) || [];
        return waves
          .map(function (w, i) { return { w: w, no: i + 1 }; })
          .filter(function (x) {
            var pct = +(x.w && x.w.progress);
            var done = String(x.w && x.w.status || '').toLowerCase() === 'done';
            return done || pct >= 100;
          })
          .map(function (x) {
            var name = String(x.w.name || '').trim();
            return {
              id: 'waveDone:' + (name || x.no),          // stable per wave -> dismissible
              type: 'waveCompleted',
              icon: 'check',
              text: WP.i18n.t('waveCompleteNotif').replace('{n}', x.no).replace('{name}', name),
              area: name,
              route: 'exec',
              at: null,   // no reliable completion timestamp in the payload; sorts after dated
            };
          });
      },
    },

    // MANAGER — "a direct report needs attention". Phase-1 EXTENSION POINT:
    // the app has no per-report actionable-item model yet that isn't already
    // surveillance-adjacent, so we do NOT invent one. Returns [] until a clean
    // work-item source exists (respecting canSeeSensitive). Left wired so
    // adding it later is one builder, not a rewrite.
    directReportNeedsAttention: {
      build: function () { return []; },
    },
  };

  /* Build the viewer's active notification list (dismissed removed), newest
   * first. Pure: same (viewer, ctx) → same output. ctx.execRequests optional. */
  function buildItems(viewer, ctx) {
    if (!(WP.config && WP.config.notificationsEnabled)) return [];
    if (!viewer) return [];
    var out = [];
    Object.keys(TYPES).forEach(function (k) {
      try { out = out.concat(TYPES[k].build(viewer, ctx) || []); }
      catch (e) { if (WP.log) WP.log.warn('[notifications]', 'builder failed', { type: k, err: e && e.message }); }
    });
    var live = out.filter(function (it) { return it && it.id && !isDismissed(viewer.id, it.id); });
    live.sort(function (a, b) {
      var ta = a.at ? Date.parse(a.at) : -Infinity;
      var tb = b.at ? Date.parse(b.at) : -Infinity;
      return tb - ta;   // newest first; null (=-Infinity) sinks to the bottom
    });
    return live;
  }

  // Does this viewer need the exec endpoint fetched? (only if a fetch-backed
  // type applies) — lets the UI skip the network for members.
  function needsExecData(viewer) {
    return !!(viewer && WP.can && WP.can('viewSettings') &&
      WP.config && WP.config.notificationsEnabled);
  }

  WP.notifications = {
    buildItems: buildItems,
    needsExecData: needsExecData,
    dismiss: dismiss,
    dismissAll: dismissAll,
    isDismissed: isDismissed,
    _resetDismissed: resetDismissed,   // test hook
    _types: TYPES,                     // extension point / test hook
  };
})(window.WP = window.WP || {});
