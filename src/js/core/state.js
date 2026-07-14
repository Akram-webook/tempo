/* ============================================================
 * Tempo — App State
 * ------------------------------------------------------------
 * Single source of truth for UI-level state. Views read this
 * and call WP.render() after mutating it via setState().
 * ========================================================== */
(function (WP) {
  'use strict';

  /* ════════════════════════════════════════════════════════════════════
   * THE V3 CUTOVER SWITCH  —  flip this ONE line to throw the default theme.
   *   'dark'  = current look (held through the directors' observation period)
   *   'light' = the WBK PRO V3 light system (navy on white)
   * Pages are built coherent in BOTH themes; the user toggle and saved prefs
   * always win over this default. Reversible at any time — change & redeploy.
   * ════════════════════════════════════════════════════════════════════ */
  var DEFAULT_THEME = 'dark';   // ← Akram: change to 'light' for the V3 cutover
  WP.DEFAULT_THEME = DEFAULT_THEME;

  WP.state = {
    lang: 'en',            // 'en' | 'ar'
    theme: DEFAULT_THEME,  // default honored only when no saved pref exists (see restore())
    authed: false,         // signed in via company email?
    window: 'month',       // 'week' | 'month' | 'year'
    viewerId: 'p_ahmed',   // who is "logged in" (set at sign-in; admin can View-as)
    route: 'dashboard',    // current screen
    selectedId: null,      // person whose profile is open
    refDate: new Date().toISOString().slice(0, 10), // default to TODAY (current period active)
    prefs: null,           // personal settings (set below from DEFAULT_PREFS); per-user persisted
  };

  /* Personal preferences (Settings v2 → "My settings"). Per-user, local, reversible.
   * theme + lang stay top-level (already persisted + drive doc attrs); these are the
   * additional personal choices. Notifications model = delivery channel × category, plus
   * a daily digest and quiet-hours mute (grounded in SaaS notification best practice:
   * group by channel, allow frequency + mute — Nicelydone / Equal.design). */
  var DEFAULT_PREFS = {
    density: 'comfortable',      // 'comfortable' | 'compact' — whole-app spacing
    dateFormat: 'auto',          // 'auto' (locale) | 'dmy' | 'mdy' | 'iso'
    notif: {
      channels: { email: true, slack: true, inapp: true },
      categories: {              // per-event opt-in
        assignments: true,       // work assigned/overridden to me
        mentions: true,          // I'm mentioned / asked
        evaluations: true,       // my review is ready / due
        digest: true             // daily summary
      },
      quietHours: { on: false, start: '19:00', end: '08:00' }  // mute in-app pings in this window
    }
  };
  // Deep-merge saved prefs over defaults so newly-added keys never come back undefined.
  function mergePrefs(saved) {
    var base = JSON.parse(JSON.stringify(DEFAULT_PREFS));
    if (!saved || typeof saved !== 'object') return base;
    if (saved.density) base.density = saved.density;
    if (saved.dateFormat) base.dateFormat = saved.dateFormat;
    if (saved.notif) {
      if (saved.notif.channels) Object.assign(base.notif.channels, saved.notif.channels);
      if (saved.notif.categories) Object.assign(base.notif.categories, saved.notif.categories);
      if (saved.notif.quietHours) Object.assign(base.notif.quietHours, saved.notif.quietHours);
    }
    return base;
  }
  WP.state.prefs = mergePrefs(null);   // defaults now; restore() overlays saved below

  /* ── F7: per-USER local cache isolation ────────────────────────────────────
   * tempo_session / tempo_data / tempo_events were GLOBAL browser keys, so on a
   * shared device (or after a handover) two people's locally-saved evals / access
   * grants / events could mix until the server re-synced. We namespace every
   * persisted key by the SIGNED-IN identity (verified email), so each user reads
   * only their own cache. This is local-cache isolation only — the real authority
   * stays the server (evaluations/events/people/growth under RLS), untouched here.
   *
   * Identity is the signed-in ACCOUNT's email — NOT WP.state.viewerId, which an
   * admin can "View as" without changing who is logged in. It is locked when authed
   * flips false→true (sign-in) and cleared when it flips true→false (sign-out); both
   * paths flow through setState, so this is observed entirely in core. A tiny global
   * pointer (tempo_uid) records the active identity so the right namespace can be
   * read at boot. All storage stays wrapped in try/catch (never throws). */
  var IDPTR = 'tempo_uid';
  function readPtr() { try { return localStorage.getItem(IDPTR) || '__anon__'; } catch (e) { return '__anon__'; } }
  function writePtr(id) { try { if (id && id !== '__anon__') localStorage.setItem(IDPTR, id); else localStorage.removeItem(IDPTR); } catch (e) {} }
  var _active = readPtr();
  function resolveEmail(viewerId) {
    if (viewerId === '__admin__') return '__admin__';
    var p = (WP.access && WP.access.byId) ? WP.access.byId(viewerId) : null;
    var em = (p && p.email) ? String(p.email).toLowerCase() : '';
    return em || (viewerId ? String(viewerId) : '__anon__');
  }
  function nsKey(base) { return base + '::' + (_active || '__anon__'); }
  // One-time migration of a legacy un-namespaced key into the current namespace,
  // then REMOVE the global so a different identity can't later re-adopt it.
  function migrateLegacy(base) {
    try {
      var legacy = localStorage.getItem(base);
      if (legacy == null) return;
      var nk = nsKey(base);
      if (localStorage.getItem(nk) == null) localStorage.setItem(nk, legacy);   // best-effort, once
      localStorage.removeItem(base);
    } catch (e) {}
  }
  // Only fold legacy globals into a REAL identity (never anonymous), so a signed-out
  // boot doesn't strand a returning user's work under '__anon__'.
  function migrateLegacyAll() {
    if (!_active || _active === '__anon__') return;
    migrateLegacy('tempo_session'); migrateLegacy('tempo_data'); migrateLegacy('tempo_events');
  }

  WP.identity = {
    current: function () { return _active || '__anon__'; },
    nsKey: nsKey,
    // Lock the namespace to the signed-in account; on a real change, fold any legacy
    // globals in and re-hydrate THIS user's saved work. Returns true if it changed.
    adopt: function (viewerId) {
      var id = resolveEmail(viewerId);
      if (!id) return false;
      if (id === _active) return false;
      _active = id; writePtr(id);
      migrateLegacyAll();
      // Wipe the previous user's in-memory work to the mock baseline, THEN load
      // this user's saved work — so a no-reload handover never leaks A's work into B.
      if (WP.persist && WP.persist.resetToBaseline) WP.persist.resetToBaseline();
      if (WP.persist && WP.persist.hydrate) WP.persist.hydrate();
      return true;
    },
    clear: function () {
      _active = '__anon__'; writePtr('__anon__');
      // Sign-out drops the in-memory work too, so the next user starts clean.
      if (WP.persist && WP.persist.resetToBaseline) WP.persist.resetToBaseline();
    },
    _resolveEmail: resolveEmail   // tests
  };

  // Persist the session so a reload keeps you signed in and on the same page
  // (no re-login after every update). Safe if storage is unavailable.
  // NOTE: refDate is intentionally NOT saved — every load defaults to TODAY (active by default).
  const SAVE_KEYS = ['authed', 'viewerId', 'theme', 'lang', 'window', 'route', 'selectedId', 'prefs'];
  const NEEDS_SELECTION = { profile: 1, evaluation: 1, upward: 1 };
  (function restore() {
    try {
      migrateLegacyAll();                       // fold a returning user's legacy keys in (no-op when anon)
      const raw = localStorage.getItem(nsKey('tempo_session'));
      if (!raw) return;
      const s = JSON.parse(raw);
      SAVE_KEYS.forEach(function (k) { if (s[k] !== undefined) WP.state[k] = s[k]; });
      // prefs get the default-merge (so new pref keys are never undefined on old saves)
      WP.state.prefs = mergePrefs(WP.state.prefs);
      // guard: a detail route with no selection → land on dashboard
      if (NEEDS_SELECTION[WP.state.route] && !WP.state.selectedId) WP.state.route = 'dashboard';
    } catch (e) {}
  })();
  function persist() {
    try {
      const o = {};
      SAVE_KEYS.forEach(function (k) { o[k] = WP.state[k]; });
      localStorage.setItem(nsKey('tempo_session'), JSON.stringify(o));
    } catch (e) {}
  }

  WP.setState = function (patch) {
    var wasAuthed = !!WP.state.authed;
    Object.assign(WP.state, patch);
    // Clamp a deferred (MVP-hidden) route to home HERE, before persist — so the
    // corrected route is what gets saved and a reload can't re-land on a hidden
    // surface. RBAC route gates stay in the render router (effectiveRoute), which
    // must not rewrite state. Guarded: WP.deferred (config.js) loads after state.js.
    if (WP.deferred && WP.deferred(WP.state.route)) WP.state.route = 'dashboard';
    var nowAuthed = !!WP.state.authed;
    // Identity lifecycle: lock on sign-in, clear on sign-out. A "View as" change
    // (viewerId changes while authed stays true) deliberately does NOT re-key.
    if (nowAuthed && !wasAuthed) { if (WP.identity) WP.identity.adopt(WP.state.viewerId); }
    else if (!nowAuthed && wasAuthed) { if (WP.identity) WP.identity.clear(); }
    persist();
    if (WP.persist) WP.persist.saveData();   // persist the user's WORK, not just the session
    if (typeof WP.render === 'function') WP.render();
  };

  WP.viewer = function () {
    if (WP.state.viewerId === '__admin__') {
      return { id: '__admin__', level: 'admin', initials: 'SA',
               name: 'Super Admin', nameAr: 'مدير الصلاحيات',
               title: 'Super Admin · Access management', titleAr: 'مدير النظام · إدارة الصلاحيات' };
    }
    // Fall back to the first person if a stale/unknown viewerId was restored,
    // so the app shell never crashes dereferencing an undefined viewer.
    return WP.access.byId(WP.state.viewerId) || (WP.data && WP.data.PEOPLE && WP.data.PEOPLE[0]) || null;
  };

  WP.activityLog = []; // overrides + view-as changes (who/when/why) — provenance
  WP.logEvent = function (entry) {
    WP.activityLog.unshift(Object.assign({ at: new Date().toISOString() }, entry));
  };

  WP.applyDocAttrs = function () {
    document.documentElement.lang = WP.state.lang;
    document.documentElement.dir = WP.i18n.isRTL() ? 'rtl' : 'ltr';
    document.documentElement.setAttribute('data-theme', WP.state.theme);
    // whole-app density (Settings v2 → Preferences). Default comfortable.
    var d = (WP.state.prefs && WP.state.prefs.density) || 'comfortable';
    document.documentElement.setAttribute('data-density', d);
  };

  /* ── Personal preferences helper (Settings v2) ──────────────────────────────
   * get(path)      → read a dotted path, e.g. WP.prefs.get('notif.channels.email')
   * set(path, val) → set it + persist + re-render (goes through setState so it saves)
   * defaults()     → a fresh copy of the defaults (for a "reset to defaults" action) */
  WP.prefs = {
    get: function (path) {
      var o = WP.state.prefs, parts = String(path).split('.');
      for (var i = 0; i < parts.length; i++) { if (o == null) return undefined; o = o[parts[i]]; }
      return o;
    },
    set: function (path, val) {
      var parts = String(path).split('.'), o = WP.state.prefs;
      for (var i = 0; i < parts.length - 1; i++) { if (o[parts[i]] == null) o[parts[i]] = {}; o = o[parts[i]]; }
      o[parts[parts.length - 1]] = val;
      WP.setState({});   // persists prefs (in SAVE_KEYS) + re-renders
    },
    defaults: function () { return JSON.parse(JSON.stringify(DEFAULT_PREFS)); }
  };

  /* Date formatting that honors the personal dateFormat pref. 'auto' = locale of the
   * current language; dmy/mdy/iso are explicit. Never throws on a bad date. */
  WP.fmt = {
    date: function (value) {
      try {
        var dt = (value instanceof Date) ? value : new Date(value);
        if (isNaN(dt.getTime())) return '';
        var f = (WP.state.prefs && WP.state.prefs.dateFormat) || 'auto';
        var y = dt.getFullYear(), m = ('0' + (dt.getMonth() + 1)).slice(-2), d = ('0' + dt.getDate()).slice(-2);
        if (f === 'iso') return y + '-' + m + '-' + d;
        if (f === 'dmy') return d + '/' + m + '/' + y;
        if (f === 'mdy') return m + '/' + d + '/' + y;
        return dt.toLocaleDateString(WP.state.lang === 'ar' ? 'ar' : 'en-GB');   // auto
      } catch (e) { return ''; }
    }
  };
})(window.WP = window.WP || {});
