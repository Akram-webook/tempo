/* ============================================================
 * Tempo — Privacy (self data access + export)
 * GATE: ai-os/CONSTITUTION.md Article II (Human-First: track work, never
 * surveil people) · tempo-secure-data §5 (ethics invariants).
 * ------------------------------------------------------------
 * Gives a person an HONEST, plain answer to "what does Tempo hold about me?"
 * and the ability to DOWNLOAD it (a right-to-access export). This reads only
 * the current signed-in viewer's own data — never anyone else's — from the
 * data we already have client-side: their directory record, their saved
 * preferences/session, and their OWN work-evidence events (each carrying its
 * source, so nothing is unexplained).
 *
 * What Tempo intentionally does NOT hold (and this module must never invent):
 * no keystroke/mouse/presence/location tracking, no screen recording, no
 * private message content — Tempo measures WORK and DECISIONS, not people.
 * ========================================================== */
(function (WP) {
  'use strict';

  // The honest catalogue of data CATEGORIES Tempo keeps about a person. Each is
  // a real store we can point at; `key` maps to an i18n label/why pair in the UI.
  var CATEGORIES = [
    { key: 'identity',    source: 'directory' },   // name, title, email, role, manager
    { key: 'preferences', source: 'this device' }, // theme, language, density, notifications
    { key: 'evidence',    source: 'work signals' },// derived work-evidence events (with sources)
    { key: 'decisions',   source: 'activity log' } // decisions recorded ABOUT the person (assignments, evals, access)
  ];

  // Fields from the person record that are safe + relevant to show the owner.
  // Deliberately excludes nothing sensitive that is theirs, but never pulls
  // another person's row.
  function identityOf(person) {
    if (!person) return null;
    return {
      id: person.id,
      name: person.name || null,
      title: person.title || null,
      email: person.email || null,
      level: person.level || null,
      managerId: person.manager_id || person.managerId || null
    };
  }

  // Everything Tempo holds about ME, assembled for display + export. Async
  // because the event store may query the backend; falls back to local events.
  // Returns { generatedAt, subject, identity, preferences, events } — events
  // each keep their `source` (Ethics: explainable, no fabrication).
  function myData(refDate) {
    var viewer = WP.viewer && WP.viewer();
    var id = viewer && viewer.id;
    var identity = identityOf(viewer);
    var preferences = null;
    try { preferences = JSON.parse(JSON.stringify(WP.state.prefs || {})); } catch (e) { preferences = {}; }

    var evP = (id && WP.events && WP.events.query)
      ? WP.events.query(id, {}, refDate)
      : Promise.resolve([]);

    return Promise.resolve(evP).then(function (events) {
      // keep only this person's events (defence in depth) + strip to the
      // owner-facing shape, preserving the source of every entry.
      var mine = (events || [])
        .filter(function (e) { return !id || e.subjectId === id; })
        .map(function (e) {
          return { ts: e.ts, category: e.category, description: e.description, source: e.source };
        });
      return {
        subject: id || null,
        identity: identity,
        preferences: preferences,
        events: mine,
        note: 'Tempo measures work and decisions, not people. It holds no ' +
              'keystroke, presence, location, or message-content tracking.'
      };
    });
  }

  // Build the downloadable export object (adds a wrapper + generated stamp).
  // `now` is passed in so callers control the timestamp (testable, no Date.now
  // buried here). Returns a plain object ready to JSON.stringify.
  function buildExport(data, now) {
    return {
      _tempoExport: 'personal-data',
      _generatedAt: now || null,
      _scope: 'Only your own data. Tempo tracks work and decisions, not people.',
      data: data
    };
  }

  WP.privacy = {
    CATEGORIES: CATEGORIES,
    myData: myData,
    buildExport: buildExport
  };
})(window.WP = window.WP || {});
