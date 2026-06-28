/* WP.db (Phase 1: evaluations) — shared backend with localStorage fallback.
 * Mocks WP._sb (no network). Highest-risk path under test: NO DATA LOSS on the
 * localStorage <-> Supabase handoff (import de-dupes by id, never overwrites a
 * newer row), and a failed write surfaces the offline state. */
const fs = require('fs'), path = require('path');
const { JSDOM } = require('jsdom');
const root = path.join(__dirname, '..');
const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const srcs = [...html.matchAll(/src="([^"]+\.js)"/g)].map(m => m[1]);
const dom = new JSDOM('<!doctype html><html><body><div id="view"></div></body></html>', { url: 'https://localhost/', runScripts: 'outside-only' });
const { window } = dom;
window.HTMLElement.prototype.scrollIntoView = function () {};
window.matchMedia = () => ({ matches: false, addEventListener() {}, removeEventListener() {} });
const errors = [];
for (const s of srcs) { try { new window.Function(fs.readFileSync(path.join(root, s), 'utf8')).call(window); } catch (e) { errors.push('[load ' + s + '] ' + e.message); } }
const WP = window.WP;
// This suite is async, so jsdom's deferred DOMContentLoaded would fire the app
// boot against this minimal DOM (the sync suites exit before that tick). We test
// WP.db directly, not the shell, so neutralize the boot render.
if (WP) WP.render = function () {};
function assert(c, m) { if (!c) errors.push('[assert] ' + m); }

// In-memory fake of the supabase-js query builder used by db.js.
function makeFakeSb(server, opts) {
  opts = opts || {};
  return { from() { return {
    select() { return opts.failSelect ? { data: null, error: { message: 'net' } }
                                       : { data: Object.keys(server).map(id => server[id]), error: null }; },
    upsert(rowOrRows) {
      if (opts.failWrite) return { error: { message: 'net' } };
      (Array.isArray(rowOrRows) ? rowOrRows : [rowOrRows]).forEach(r => { server[r.id] = r; });
      return { error: null };
    },
    delete() { return { eq(col, val) { if (opts.failWrite) return { error: { message: 'net' } }; delete server[val]; return { error: null }; } }; }
  }; } };
}
function resetDb() { WP.db._resetImport(); WP.db.status.offline = false; WP.db.status.synced = false; WP.db.status.loading = false; }

// --- Role-scoped read simulation (mirrors supabase/0003 can_read_person) -----
// 0003 moves reads server-side: SELECT on evaluations/events is gated by
// can_read_person(subject_id). RLS itself can't run in jsdom, so this fake
// applies the SAME predicate the SQL does, against a tiny directory fixture
// seeded from the 0003 INSERT block — proving WP.db surfaces ONLY the rows a
// given viewer may read. SQL note: the live policy is
// `using (public.can_read_person(subject_id))` — see supabase/0003_directory_and_rls.sql.
const DIR = {
  'akram@webook.com':         { person_id: 'p_akram',       role: 'admin',    manager_email: null },
  'ahmed.othman@webook.com':  { person_id: 'p_ahmed',       role: 'director', manager_email: null },
  'maksousa@webook.com':      { person_id: 'p_abdulrahman', role: 'employee', manager_email: null },
  'shamma@webook.com':        { person_id: 'p_shamma',      role: 'employee', manager_email: null },
  'meshal@webook.com':        { person_id: 'p_meshalB',     role: 'employee', manager_email: null },
  'o.taher.c@webook.com':     { person_id: 'p_osama',       role: 'employee', manager_email: 'akram@webook.com' },
  'talal.samir.c@webook.com': { person_id: 'p_talal',       role: 'employee', manager_email: 'maksousa@webook.com' }
};
function canReadPerson(viewerEmail, subjectId) {
  const me = DIR[viewerEmail];
  if (me && me.person_id === subjectId) return true;                       // (a) own row
  if (me && (me.role === 'director' || me.role === 'admin')) return true;  // (b) director/admin
  const subj = Object.keys(DIR).map(function (e) { return DIR[e]; })
    .find(function (r) { return r.person_id === subjectId; });
  if (subj && subj.manager_email === viewerEmail) return true;            // (c) subject's manager
  return false;
}
// Like makeFakeSb, but select() only returns rows the viewerEmail may read.
function makeScopedSb(server, viewerEmail) {
  return { from() { return {
    select() {
      const data = Object.keys(server).map(function (id) { return server[id]; })
        .filter(function (row) { return canReadPerson(viewerEmail, row.subject_id); });
      return { data: data, error: null };
    },
    upsert() { return { error: null }; },                                  // reads-only scenario
    delete() { return { eq() { return { error: null }; } }; }
  }; } };
}

(async () => {
  try {
    assert(WP.db && WP.db.evaluations && WP.db.evaluations.list && WP.db.evaluations.upsert && WP.db.evaluations.remove, 'WP.db.evaluations API present');

    // --- A) backend round-trip: upsert -> list merges into WP.data.EVALUATIONS
    let server = {};
    WP._sb = makeFakeSb(server); resetDb();
    WP.data.EVALUATIONS = {};
    let r = await WP.db.evaluations.upsert('p_test', { period: 'Q1-2026', status: 'In progress', evaluatorId: 'p_akram', scores: { punctuality: 5 }, feedback: { achievements: 'x' } });
    assert(r.ok && !r.offline, 'A: signed-in upsert reports ok, not offline');
    assert(server['p_test'] && server['p_test'].subject_id === 'p_test' && server['p_test'].scores.punctuality === 5, 'A: row written to backend with mapped columns');
    WP.data.EVALUATIONS = {}; resetDb();                 // wipe local; only the server has it
    const store = await WP.db.evaluations.list();
    assert(store.p_test && store.p_test.scores.punctuality === 5 && store.p_test.status === 'In progress', 'A: list() pulls from backend and merges into local store');
    assert(WP.db.status.offline === false, 'A: online after a successful list');

    // --- B) fallback when no client: still saves locally (no data loss), no throw
    WP._sb = null; resetDb();
    WP.data.EVALUATIONS = {};
    r = await WP.db.evaluations.upsert('p_local', { status: 'In progress', scores: { culture: 3 }, feedback: {} });
    assert(r.ok && r.local, 'B: signed-out upsert saves locally and reports local');
    assert(WP.data.EVALUATIONS.p_local && WP.data.EVALUATIONS.p_local.scores.culture === 3, 'B: no data loss on local-only write');
    const localStore = await WP.db.evaluations.list();
    assert(localStore.p_local, 'B: list() returns the local store when offline (no throw)');

    // --- C) failed backend write surfaces offline state, keeps local copy
    server = {}; WP._sb = makeFakeSb(server, { failWrite: true }); resetDb();
    WP.data.EVALUATIONS = {};
    r = await WP.db.evaluations.upsert('p_x', { status: 'In progress', scores: { stress: 2 }, feedback: {} });
    assert(!r.ok && r.offline, 'C: failed write resolves offline (not a rejection)');
    assert(WP.db.status.offline === true, 'C: status.offline flipped on write failure');
    assert(WP.data.EVALUATIONS.p_x && WP.data.EVALUATIONS.p_x.scores.stress === 2, 'C: local copy preserved despite backend failure');

    // --- D) import handoff: de-dupe by id, push local-only & locally-newer up,
    //         NEVER overwrite a newer server row, NEVER duplicate.
    server = {
      p_a: WP.db._recToRow('p_a', { period: 'old-server', status: 'Completed', evaluatorId: 'p_akram', scores: {}, feedback: {}, updated_at: '2026-01-01T00:00:00Z' }),
      p_c: WP.db._recToRow('p_c', { period: 'new-server', status: 'Completed', evaluatorId: 'p_akram', scores: {}, feedback: {}, updated_at: '2026-06-20T00:00:00Z' })
    };
    WP._sb = makeFakeSb(server); resetDb();
    WP.data.EVALUATIONS = {
      p_a: { period: 'new-local', status: 'In progress', scores: {}, feedback: {}, updated_at: '2026-06-01T00:00:00Z' }, // local NEWER than server
      p_b: { period: 'local-only', status: 'Not started', scores: {}, feedback: {}, updated_at: '2026-06-01T00:00:00Z' }, // not on server
      p_c: { period: 'old-local', status: 'Not started', scores: {}, feedback: {}, updated_at: '2026-01-01T00:00:00Z' }    // local OLDER than server
    };
    const merged = await WP.db.evaluations.list();
    assert(Object.keys(server).length === 3, 'D: no duplicate rows created on import (exactly p_a,p_b,p_c)');
    assert(server.p_a.cycle === 'new-local', 'D: locally-newer row pushed up to backend');
    assert(server.p_b && server.p_b.cycle === 'local-only', 'D: local-only row imported to backend');
    assert(merged.p_c.period === 'new-server', 'D: newer server row wins locally (not overwritten by older local)');
    assert(server.p_c.cycle === 'new-server', 'D: newer server row NOT overwritten by older local on import');

    // --- E) import runs once (de-dupe guard): a second list does not re-push
    const before = JSON.stringify(server);
    await WP.db.evaluations.list();
    assert(JSON.stringify(server) === before, 'E: import is one-time per session (no repeated pushes)');

    // --- F) remove deletes locally and on backend
    resetDb(); server = { p_test: WP.db._recToRow('p_test', { scores: {}, feedback: {} }) };
    WP._sb = makeFakeSb(server); WP.data.EVALUATIONS = { p_test: { scores: {}, feedback: {} } };
    await WP.db.evaluations.remove('p_test');
    assert(!WP.data.EVALUATIONS.p_test && !server.p_test, 'F: remove clears local and backend');

    // --- Role-scoped reads (0003) — the SEV2 fix. Same server set, three viewers.
    // Server holds evals for: p_abdulrahman, p_talal (his report), p_osama,
    // p_shamma. Local store is empty so list() is a pure read (no import push).
    function scopedServer() {
      return {
        p_abdulrahman: WP.db._recToRow('p_abdulrahman', { scores: {}, feedback: {} }),
        p_talal:       WP.db._recToRow('p_talal',       { scores: {}, feedback: {} }),
        p_osama:       WP.db._recToRow('p_osama',       { scores: {}, feedback: {} }),
        p_shamma:      WP.db._recToRow('p_shamma',      { scores: {}, feedback: {} })
      };
    }

    // --- G) PEER → no rows. meshal is an employee with no reports and no own
    //         eval row in the set: a peer can read nothing.
    WP._sb = makeScopedSb(scopedServer(), 'meshal@webook.com'); resetDb();
    WP.data.EVALUATIONS = {};
    let scoped = await WP.db.evaluations.list();
    assert(Object.keys(scoped).length === 0, 'G: peer (meshal) sees NO rows — own row absent, no reports');

    // --- H) MANAGER → own + direct reports only. maksousa (p_abdulrahman)
    //         manages p_talal; must NOT see p_osama (akram's report).
    WP._sb = makeScopedSb(scopedServer(), 'maksousa@webook.com'); resetDb();
    WP.data.EVALUATIONS = {};
    scoped = await WP.db.evaluations.list();
    assert(scoped.p_abdulrahman, 'H: manager sees own row');
    assert(scoped.p_talal, 'H: manager sees direct report (p_talal)');
    assert(!scoped.p_osama && !scoped.p_shamma, 'H: manager does NOT see non-reports');
    assert(Object.keys(scoped).length === 2, 'H: manager sees exactly own + reports (2 rows)');

    // --- I) DIRECTOR → all rows. ahmed (director) sees everyone.
    WP._sb = makeScopedSb(scopedServer(), 'ahmed.othman@webook.com'); resetDb();
    WP.data.EVALUATIONS = {};
    scoped = await WP.db.evaluations.list();
    assert(Object.keys(scoped).length === 4, 'I: director sees ALL rows (4)');
    assert(scoped.p_abdulrahman && scoped.p_talal && scoped.p_osama && scoped.p_shamma, 'I: director sees every subject');

    // --- J) Slack check-in EVENTS (F-034) are role-scoped too. The ingest writes
    //         source:'slack:#daily-checkin' events to the SAME events store, gated
    //         by the SAME can_read_person(subject_id) policy (0003). So a peer must
    //         not see another person's check-ins; the subject + their manager do.
    //         (events.list() filters by subject_id and maps rows -> events.)
    function checkinEventServer() {
      // two check-in events for p_osama (osama reports to akram)
      return {
        ev1: WP.db._eventToRow({ id: 'ev1', ts: '1782900000.0001', type: 'evidence', subjectId: 'p_osama', category: 'delivery', description: 'issued 40 tickets', source: 'slack:#daily-checkin', evidenceRefs: ['https://slack/x'] }),
        ev2: WP.db._eventToRow({ id: 'ev2', ts: '1782900000.0002', type: 'evidence', subjectId: 'p_osama', category: 'plan', description: 'close the MotoGP defect', source: 'slack:#daily-checkin', evidenceRefs: ['https://slack/x'] })
      };
    }
    // peer (meshal): no relationship to p_osama → zero check-in events
    WP._sb = makeScopedSb(checkinEventServer(), 'meshal@webook.com'); resetDb();
    let evList = await WP.db.events.list('p_osama');
    assert(evList.length === 0, 'J: peer (meshal) sees NO Slack check-in events for p_osama');
    // subject (osama): sees own check-ins
    WP._sb = makeScopedSb(checkinEventServer(), 'o.taher.c@webook.com'); resetDb();
    evList = await WP.db.events.list('p_osama');
    assert(evList.length === 2 && evList.every(function (e) { return e.source === 'slack:#daily-checkin'; }), 'J: subject (osama) sees own check-in events');
    // direct manager (akram): sees the report's check-ins
    WP._sb = makeScopedSb(checkinEventServer(), 'akram@webook.com'); resetDb();
    evList = await WP.db.events.list('p_osama');
    assert(evList.length === 2, 'J: direct manager (akram) sees the report\'s check-in events');
  } catch (e) { errors.push('[run] ' + e.message + '\n' + e.stack); }

  if (errors.length) { console.log('FAIL\n' + errors.join('\n')); process.exit(1); }
  console.log('PASS — WP.db evaluations: backend round-trip, localStorage fallback, offline on failed write, lossless de-duped import handoff, and role-scoped reads (peer→none, manager→own+reports, director→all).');
  process.exit(0);
})();
