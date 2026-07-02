/* AI-acceptance provenance PLUMBING (Wave / intel-plumbing, Item A).
 * Gate: ai-os/00-governance/INTELLIGENCE-ETHICS.md.
 *
 * P5's decisionMemory can compute aiAcceptanceRate, but only if real decision
 * events carry the signal. This proves the signal is now stamped at the actual
 * decision moment — the assignment drawer — and flows end-to-end into
 * decisionMemory.weeklyReport(). It also proves the HONEST contract:
 *   - take the system's top-ranked (suggested) pick  -> aiAccepted: true
 *   - pick a different candidate / override           -> aiAccepted: false
 *   - no AI suggestion shown                           -> no flag, rate stays null
 * Never fabricated: a manual decision with no suggestion carries no provenance. */
const fs = require('fs'), path = require('path');
const { JSDOM } = require('jsdom');
const root = path.join(__dirname, '..');
const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const srcs = [...html.matchAll(/src="([^"]+\.js)"/g)].map(m => m[1]);
const dom = new JSDOM('<!doctype html><html><body><div id="view"></div><div id="overlay-host"></div></body></html>', { url: 'https://localhost/', runScripts: 'outside-only' });
const { window } = dom;
window.HTMLElement.prototype.scrollIntoView = function () {};
window.matchMedia = () => ({ matches: false, addEventListener() {}, removeEventListener() {} });
window.prompt = () => 'capacity balance';   // override-reason prompt → non-empty
const errors = [];
for (const s of srcs) { try { new window.Function(fs.readFileSync(path.join(root, s), 'utf8')).call(window); } catch (e) { errors.push('[load ' + s + '] ' + e.message); } }
const WP = window.WP;
if (WP) WP.render = function () {};
function assert(c, m) { if (!c) errors.push('[assert] ' + m); }

(async () => {
  try {
    assert(WP.ui && WP.ui.assignmentDrawer, 'assignment drawer present');
    assert(WP.decisionMemory && WP.decisionMemory.weeklyReport, 'decisionMemory present');

    // Director viewer can act and sees everyone → the drawer ranks real candidates.
    const director = WP.data.PEOPLE.find(p => p.level === 'director');
    WP.state.viewerId = director.id;
    // Pin refDate into the sample-data window (June 2026) so the drawer ranks against REAL load —
    // otherwise, at a wall-clock date past the sample month, every load reads 0, nobody is
    // soft-locked, the override branch never fires, and we log too few decisions for a report.
    // (Same time-coupling fix as verify-eval.js / engine.test.js.)
    WP.state.refDate = '2026-06-17';
    WP.activityLog.length = 0;

    const host = window.document.getElementById('overlay-host');
    const firstDo = () => host.querySelector('[data-do]');           // a non-locked candidate

    // helper: open drawer for an event, return the ordered candidate rows
    function openRows(eventId) {
      WP.ui.assignmentDrawer.open(eventId);
      return [...host.querySelectorAll('.row')];
    }

    // --- 1) Accept the SUGGESTED (top-ranked) pick → aiAccepted: true ----------
    let rows = openRows('e_riyadh_season');
    assert(rows.length >= 2, 'drawer rendered a ranked candidate list');
    const topPid = rows[0].getAttribute('data-pid');
    const topBtn = rows[0].querySelector('[data-do]');
    assert(topBtn, 'top-ranked candidate is assignable (not soft-locked) in this fixture');
    topBtn.click();
    let last = WP.activityLog[0];
    assert(last && last.type === 'assign' && last.target === topPid, 'top pick logged as an assign for that person');
    assert(last.aiAccepted === true, 'taking the system-suggested top pick stamps aiAccepted:true');

    // --- 2) Pick a DIFFERENT (non-top) candidate → aiAccepted: false ----------
    rows = openRows('e_mdl_beast');
    // find a data-do row that is NOT rows[0]
    let otherRow = rows.slice(1).find(r => r.querySelector('[data-do]'));
    assert(otherRow, 'a non-top assignable candidate exists');
    const otherPid = otherRow.getAttribute('data-pid');
    otherRow.querySelector('[data-do]').click();
    last = WP.activityLog[0];
    assert(last.target === otherPid && last.aiAccepted === false, 'choosing a non-suggested pick stamps aiAccepted:false');

    // --- 3) Override (soft-locked) → aiAccepted:false (override ≠ accepting) ----
    // find any event whose drawer offers an override button
    let overrodeOnce = false;
    for (const eid of Object.keys(WP.data.EVENTS)) {
      const r = openRows(eid);
      const ov = host.querySelector('[data-override]');
      if (ov) {
        ov.click(); // window.prompt stubbed → reason supplied → doAssign(override=true)
        const e = WP.activityLog[0];
        assert(e.type === 'override-assign' && e.aiAccepted === false, 'override stamps aiAccepted:false (override is not acceptance)');
        overrodeOnce = true;
        break;
      }
    }
    // (not all fixtures soft-lock anyone; only assert if one was found)
    if (!overrodeOnce) console.log('note: no soft-locked candidate in fixture — override branch not exercised');

    // --- 4) decisionMemory now computes aiAcceptanceRate from the LIVE log -----
    // window the report around "now" (activityLog stamps are current time).
    const now = new Date().toISOString().slice(0, 10);
    const rep = WP.decisionMemory.weeklyReport({ start: '2000-01-01', end: now }, { viewer: director, events: WP.activityLog });
    assert(rep.enoughData, 'enough decisions for a report');
    assert(rep.aiAcceptanceRate && rep.aiAcceptanceRate.of >= 2, 'aiAcceptanceRate is computed from the UI-stamped events (live, not null)');
    assert(rep.aiAcceptanceRate.accepted >= 1 && rep.aiAcceptanceRate.accepted < rep.aiAcceptanceRate.of,
      'rate reflects both accepted and not-accepted real decisions');
    assert(Array.isArray(rep.aiAcceptanceRate.evidence) && rep.aiAcceptanceRate.evidence.length === rep.aiAcceptanceRate.of,
      'every counted decision is cited (traceable)');
    // de-identification still holds on these UI-sourced refs
    assert(rep.aiAcceptanceRate.evidence.every(r => !('target' in r) && !('by' in r) && !('reason' in r)),
      'aiAcceptanceRate evidence stays de-identified (no person fields leak)');

    // --- 5) NO provenance → rate stays null (honest "where available") --------
    const manual = [
      { type: 'role-change', by: 'p_x', target: 'p_y', at: now + 'T10:00:00Z' },
      { type: 'access-grant', by: 'p_x', target: 'p_z', at: now + 'T11:00:00Z' },
      { type: 'config',       by: 'p_x', target: 'tier 1 = 50%', at: now + 'T12:00:00Z' }
    ];
    const rep2 = WP.decisionMemory.weeklyReport({ start: '2000-01-01', end: now }, { viewer: director, events: manual });
    assert(rep2.enoughData && rep2.aiAcceptanceRate === null, 'no AI provenance on any event → aiAcceptanceRate stays null (never fabricated)');

  } catch (e) { errors.push('[throw] ' + e.message + '\n' + e.stack); }

  if (errors.length) { console.log('FAIL verify-ai-provenance\n' + errors.join('\n')); process.exit(1); }
  console.log('PASS verify-ai-provenance — AI-acceptance provenance is stamped at the decision point and computes live');
})();
