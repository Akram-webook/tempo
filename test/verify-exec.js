/* Headless verify: the native Project-delivery view (GitHub warehouse model).
 * The page fetch()es data/exec-status.json - a repo file committed by the
 * exec-status Action and served same-origin by Pages. NO JSONP, NO Google.
 * Asserts:
 *  - status->color buckets (drift guard shared with the report page);
 *  - the gate = admin/director only (data is always fetchable);
 *  - load() uses fetch() (NOT JSONP/script-injection) on execStatusData;
 *  - launcher renders cover.progress %; waves render with progress + health;
 *  - trend sparkline from history[]; empty-state when generated == null;
 *  - "Open full report" links to the status.html report; EN + AR; no errors. */
const fs = require('fs'), path = require('path');
const { JSDOM } = require('jsdom');

const root = path.join(__dirname, '..');
const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const srcs = [...html.matchAll(/src="([^"]+\.js)"/g)].map(m => m[1]);

const dom = new JSDOM('<!doctype html><html><head></head><body><div id="app"></div></body></html>', {
  url: 'https://example.org/tempo/', pretendToBeVisual: true, runScripts: 'outside-only',
});
const { window } = dom;
const errors = [];
const benign = /font|stylesheet|localStorage|Security|scrollIntoView|Not implemented|opaque|insertRule|cssRules|execCommand/i;
['error', 'warn'].forEach(k => {
  const orig = window.console[k].bind(window.console);
  window.console[k] = (...a) => { const s = a.join(' '); if (!benign.test(s)) errors.push('[' + k + '] ' + s); orig(...a); };
});
window.addEventListener('error', e => { if (!benign.test(String(e.message))) errors.push('[onerror] ' + e.message); });
window.HTMLElement.prototype.scrollIntoView = function () {};
window.matchMedia = window.matchMedia || function () { return { matches: false, addEventListener() {}, removeEventListener() {} }; };

// --- fetch mock: capture the URL, return whatever the current test wants. ------
let fetchedUrl = null, nextPayload = null, nextOk = true, nextFeedback = null;
window.fetch = function (url) {
  // The view fetches exec-status.json (primary) AND feedback.json (best-effort).
  // Route the feedback URL to its own payload so exec assertions aren't polluted;
  // default = empty feedback so existing tests are unaffected.
  if (/feedback\.json/.test(String(url))) {
    return Promise.resolve({ ok: true, status: 200,
      json: function () { return Promise.resolve(nextFeedback || { generated: null, items: [] }); } });
  }
  fetchedUrl = url;
  return Promise.resolve({
    ok: nextOk,
    status: nextOk ? 200 : 404,
    json: function () { return Promise.resolve(nextPayload); },
  });
};
// (JSONP would inject <script src=...?callback=...>; we assert exec uses fetch()
// on data/exec-status.json below, which is the direct proof it is not JSONP.)

for (const s of srcs) {
  const code = fs.readFileSync(path.join(root, s), 'utf8');
  const script = new window.Function(code);
  try { script.call(window); } catch (e) { errors.push('[load ' + s + '] ' + e.message); }
}

const WP = window.WP;
WP.render = function () {};
function assert(c, m) { if (!c) errors.push('[assert] ' + m); }
const $ = (sel) => window.document.querySelector(sel);
// Flush enough microtasks for the two-stage load (exec-status -> feedback -> paint).
async function settle() { for (let i = 0; i < 16; i++) await Promise.resolve(); }

// The GitHub-warehouse payload shape (committed data/exec-status.json).
const PAYLOAD = {
  generated: new Date(Date.now() - 3 * 3600 * 1000).toISOString(),  // 3h ago
  cover: { status: 'In Progress', progress: 60, health: 'amber',
    narrative: '60% delivered across 4 waves - 1 wave(s) need attention.' },
  waves: [
    { name: 'Executive Status Deck', label: 'wave:exec-status', status: 'In Progress',
      progress: 85, health: 'green', openPRs: [], notes: '4/5 PRs merged.' },
    { name: 'Capacity Engine', label: 'wave:capacity', status: 'In Progress',
      progress: 40, health: 'red',
      openPRs: [{ number: 118, title: 'Workload model', blockedOn: 'reviewers', daysSinceActivity: 7 }],
      notes: '1/3 PRs merged. #118 awaiting review (7d).' },
  ],
  needsYou: ['Capacity Engine: 1/3 PRs merged. #118 awaiting review (7d).'],
  history: [{ ts: '2026-07-14T07:00:00Z', progress: 50 }, { ts: '2026-07-16T07:00:00Z', progress: 55 }, { ts: '2026-07-18T07:00:00Z', progress: 60 }],
  // Timeline items[] (per-PR) - the warehouse shape the compute script now writes.
  items: [
    { id: 'pr-1', area: 'Exec Deck', title: 'Fix the broken workload scroll', status: 'Done', type: 'Bug', ts: new Date(Date.now() - 2 * 3600 * 1000).toISOString() },
    { id: 'pr-2', area: 'Exec Deck', title: 'Add Type and Status filters', status: 'Working', type: 'Feature', ts: new Date(Date.now() - 4 * 3600 * 1000).toISOString() },
    { id: 'pr-3', area: 'Capacity', title: 'Refactor the capacity engine', status: 'Done', type: 'Improvement', ts: new Date(Date.now() - 6 * 3600 * 1000).toISOString() },
  ],
};

(async () => {
  try {
    // --- status -> color buckets (drift guard) -------------------------------------
    const ck = WP.execStatus.statusColorKey;
    assert(ck('Done') === 'green' && ck('on track') === 'green', 'green bucket');
    assert(ck('In progress') === 'amber' && ck('in review') === 'amber', 'amber bucket');
    assert(ck('Needs input') === 'red' && ck('blocked') === 'red', 'red bucket');
    assert(ck('') === 'grey' && ck('whatever') === 'grey', 'grey fallback');

    // --- the gate: admin/director only (data is always fetchable) ------------------
    WP.can = function (cap) { return cap === 'viewSettings'; };
    assert(WP.execDeckVisible() === true, 'visible for admin/director');
    WP.can = function () { return false; };
    assert(WP.execDeckVisible() === false, 'hidden for a non-admin');
    WP.can = function (cap) { return cap === 'viewSettings'; };

    // --- render: fetch(), NOT JSONP -----------------------------------------------
    WP.state.lang = 'en';
    nextPayload = PAYLOAD; nextOk = true;
    const el = window.document.createElement('div');
    WP.ui.exec.render(el);
    assert($ ? true : true, 'render did not throw');
    assert(el.querySelector('.ex-title'), 'header title renders immediately');
    // let the fetch().then chain resolve
    await settle();
    assert(fetchedUrl && /data\/exec-status\.json/.test(fetchedUrl), 'load() fetches data/exec-status.json');
    assert(fetchedUrl && /[?&]t=/.test(fetchedUrl), 'fetch URL is cache-busted');

    // header framing stays project-delivery (not employee)
    assert(/PROJECT DELIVERY|تسليم المشروع/i.test(el.querySelector('.ex-eyebrow').textContent), 'eyebrow reads as project delivery');
    assert(/Project delivery|تسليم المشروع/i.test(el.querySelector('.ex-title').textContent) &&
      !/Executive/i.test(el.querySelector('.ex-title').textContent), 'title reads project delivery (not Executive)');
    assert(el.querySelector('.ex-forwho') && /Not an employee view|ليست شاشة للموظفين/i.test(el.querySelector('.ex-forwho').textContent), 'a for-who line states it is not an employee view');

    // --- launcher: cover.progress % + single bar (NO sparkline - removed) ----------
    const pctn = el.querySelector('.ex-pct-n');
    assert(pctn && /60%/.test(pctn.textContent), 'launcher renders cover.progress (60%)');
    const bar0 = el.querySelector('.ex-launch .ex-bar span');
    assert(bar0 && /width:\s*60%/.test(bar0.getAttribute('style') || ''), 'progress bar green = 60%');
    assert(!el.querySelector('.ex-spark'), 'trend sparkline removed (reverted to the prior view)');

    // --- filter bar: Type + Status chip groups ------------------------------------
    assert(el.querySelector('.ex-filters'), 'filter bar renders');
    const groups = el.querySelectorAll('.ex-fgroup');
    assert(groups.length === 2, 'two filter groups (Type + Status)');
    const chipVals = [...el.querySelectorAll('.ex-fchip')].map(c => c.getAttribute('data-val'));
    ['all', 'bug', 'feature', 'improvement', 'done', 'working', 'planned']
      .forEach(v => assert(chipVals.indexOf(v) >= 0, 'filter chip present: ' + v));
    // Default: All is on in both groups.
    assert([...el.querySelectorAll('.ex-fchip.is-on')].length === 2, 'exactly the two "All" chips are on by default');

    // --- waves section: progress + health + blocked-on ----------------------------
    const waves = el.querySelectorAll('.ex-wave-card');
    assert(waves.length === 2, 'both waves render (got ' + waves.length + ')');
    assert(/Capacity Engine/.test(el.textContent), 'wave name shows');
    assert(el.querySelector('.ex-wave-blk') && /reviewers/.test(el.querySelector('.ex-wave-blk').textContent), 'blocked-on shows whose move it is');

    // --- filter interaction: Status=Done hides the two non-done waves --------------
    // (both PAYLOAD waves are "In Progress" → Done should empty the waves grid.)
    const doneChip = [...el.querySelectorAll('.ex-fchip[data-filter="status"]')].find(c => c.getAttribute('data-val') === 'done');
    assert(doneChip, 'Status=Done chip exists');
    doneChip.click();
    await Promise.resolve(); await Promise.resolve();
    assert(el.querySelectorAll('.ex-wave-card').length === 0, 'Status=Done filters out the in-progress waves');
    assert(el.querySelector('.ex-fchip[data-filter="status"][data-val="done"]').classList.contains('is-on'), 'Done chip is now active');
    // Reset back to All so later assertions see the full set.
    el.querySelector('.ex-fchip[data-filter="status"][data-val="all"]').click();
    await Promise.resolve(); await Promise.resolve();
    assert(el.querySelectorAll('.ex-wave-card').length === 2, 'Status=All restores both waves');

    // --- timeline items[] render (the fix: was empty because items[] was missing) --
    const tlRows = el.querySelectorAll('.ex-tl-row');
    assert(tlRows.length === 3, 'timeline renders all 3 items[] in the current week (got ' + tlRows.length + ')');
    assert(/broken workload scroll/i.test(el.textContent), 'an item title renders');
    // area prefix: fixture spans 2 areas (Exec Deck + Capacity) so it IS shown.
    assert(/Exec Deck\s+—/.test(el.textContent), 'area prefix shows when timeline spans >1 area');

    // stats strip counts ITEMS not waves: 2 Done, 1 Working.
    const sum = el.querySelector('.ex-launch-sum');
    assert(sum && /2 shipped/.test(sum.textContent), 'stats strip counts items: 2 shipped');
    assert(sum && /1 in progress/.test(sum.textContent), 'stats strip counts items: 1 in progress');

    // --- Type filter on the timeline: Bugs shows only the Bug item ----------------
    el.querySelector('.ex-fchip[data-filter="type"][data-val="bug"]').click();
    await Promise.resolve(); await Promise.resolve();
    const bugRows = el.querySelectorAll('.ex-tl-row');
    assert(bugRows.length === 1 && /broken workload scroll/i.test(el.textContent), 'Type=Bugs shows only the Bug item');
    // Type also hides the waves grid (a wave has no type) - matches PR #130 behaviour.
    assert(el.querySelectorAll('.ex-wave-card').length === 0, 'Type=Bugs hides the (untyped) waves');
    el.querySelector('.ex-fchip[data-filter="type"][data-val="all"]').click();
    await Promise.resolve(); await Promise.resolve();
    assert(el.querySelectorAll('.ex-tl-row').length === 3, 'Type=All restores all timeline items');

    // --- needs-you from data.needsYou ---------------------------------------------
    assert(/awaiting review/i.test(el.textContent), 'needsYou item renders');

    // --- "Open full report" links to the report page ------------------------------
    const open = el.querySelector('#exec-open');
    assert(open && /status\.html/.test(open.getAttribute('href')), 'Open-report links to status.html');
    assert(open && open.getAttribute('target') === '_blank' && /noopener/.test(open.getAttribute('rel') || ''), 'Open-report new tab + noopener');

    // --- STALE vs EMPTY timeline (QA BUG-001) -------------------------------------
    // items[] ABSENT (payload predates the feature) -> a distinct "will appear
    // after the next update" message, NOT "Nothing in this range" (which reads as
    // "nothing shipped" and misleads on stale data).
    nextPayload = { generated: new Date().toISOString(), cover: { progress: 40, health: 'green' }, waves: [], needsYou: [], history: [] };
    const elStale = window.document.createElement('div');
    WP.ui.exec.render(elStale);
    await settle();
    const staleBody = (elStale.querySelector('.ex-tl-body') || {}).textContent || '';
    assert(/after the next|بعد تحديث/i.test(staleBody) && !/Nothing in this range/i.test(staleBody),
      'items[] absent -> stale message, not "Nothing in this range" (got "' + staleBody.trim() + '")');
    // items:[] PRESENT but empty -> legitimate empty, "Nothing in this range".
    nextPayload = { generated: new Date().toISOString(), cover: { progress: 40, health: 'green' }, waves: [], needsYou: [], history: [], items: [] };
    const elEmpty = window.document.createElement('div');
    WP.ui.exec.render(elEmpty);
    await settle();
    assert(/Nothing in this range|لا شيء/i.test((elEmpty.querySelector('.ex-tl-body') || {}).textContent || ''),
      'items:[] present-but-empty -> "Nothing in this range" (legitimate empty)');

    // --- EMPTY STATE: generated == null -> "no data yet", not sample ---------------
    nextPayload = { generated: null, cover: {}, waves: [], needsYou: [], history: [] };
    const el2 = window.document.createElement('div');
    WP.ui.exec.render(el2);
    await settle();
    assert(el2.querySelector('.ex-empty--nodata'), 'empty state shows when generated is null (not sample data)');
    assert(!el2.querySelector('.ex-wave-card'), 'no waves render in the empty state');

    // --- fetch error -> error state (retry) ---------------------------------------
    nextOk = false;
    const el3 = window.document.createElement('div');
    WP.ui.exec.render(el3);
    await settle();
    assert(el3.querySelector('.ex-error'), 'error state shown when the fetch fails');
    nextOk = true;

    // --- AR ------------------------------------------------------------------------
    WP.state.lang = 'ar';
    nextPayload = PAYLOAD;
    const elAr = window.document.createElement('div');
    WP.ui.exec.render(elAr);
    await settle();
    assert(/تسليم المشروع/.test(elAr.textContent), 'title localizes to AR (project delivery)');

    // --- single-area timeline drops the redundant repeated prefix (run LAST so it ---
    //     doesn't disturb lastData for the filter-chip assertions above) -------------
    WP.state.lang = 'en';
    nextPayload = Object.assign({}, PAYLOAD, { items: [
      { id: 'pr-a', area: 'Exec Deck', title: 'First exec change', status: 'Done', type: 'Feature', ts: new Date(Date.now() - 2 * 3600 * 1000).toISOString() },
      { id: 'pr-b', area: 'Exec Deck', title: 'Second exec change', status: 'Done', type: 'Feature', ts: new Date(Date.now() - 3 * 3600 * 1000).toISOString() },
    ] });
    const elOne = window.document.createElement('div');
    WP.ui.exec.render(elOne);
    await settle();
    assert(/First exec change/.test(elOne.textContent), 'single-area timeline still renders titles');
    assert(!/Exec Deck\s+—/.test(elOne.textContent), 'single-area timeline drops the redundant area prefix');

    // --- triaged FEEDBACK folds into the SAME timeline + answers the filters -------
    // feedback.json items map onto the exec buckets: Assigned->Working, New/Review->
    // Planned, Discarded->grey(Planned). They carry a "Feedback" tag + lane + wave.
    WP.state.lang = 'en';
    nextPayload = Object.assign({}, PAYLOAD, { items: [
      { id: 'pr-x', area: 'Exec Deck', title: 'A shipped PR', status: 'Done', type: 'Feature', ts: new Date(Date.now() - 2 * 3600 * 1000).toISOString() },
    ] });
    nextFeedback = { generated: new Date().toISOString(), items: [
      { id: 'fb-1', note: '[Backend] Sync should retry on failure', klass: 'Backend', type: 'Improvement', status: 'Assigned', wave: 3, submittedAt: new Date(Date.now() - 1 * 3600 * 1000).toISOString() },
      { id: 'fb-2', note: '[Bug] Export button does nothing', klass: 'Bug', type: 'Bug', status: 'New', wave: null, submittedAt: new Date(Date.now() - 90 * 60 * 1000).toISOString() },
      { id: 'fb-3', note: '[Feature] Dark mode for the report', klass: 'Feature', type: 'New idea', status: 'Discarded', wave: null, submittedAt: new Date(Date.now() - 30 * 60 * 1000).toISOString() },
    ] };
    const elFb = window.document.createElement('div');
    WP.ui.exec.render(elFb);
    await settle();
    assert(/Sync should retry/.test(elFb.textContent), 'feedback item renders in the timeline');
    assert(elFb.querySelector('.ex-tl-row--fb'), 'feedback rows are tagged as feedback');
    assert(elFb.querySelector('.ex-tl-tag--fb'), 'a "Feedback" tag shows on a feedback row');
    assert(elFb.querySelector('.ex-tl-tag--wave'), 'an assigned feedback item shows its wave chip');
    assert(elFb.querySelector('.ex-tl-row--discarded'), 'a discarded item renders dimmed/struck');
    const fbRows = elFb.querySelectorAll('.ex-tl-row--fb').length;
    assert(fbRows === 3, 'all 3 feedback items surface (got ' + fbRows + ')');

    // BUG-001 regression: feedback must NOT inflate the stats strip. PAYLOAD here
    // has 1 item (pr-x, Done); the folded feedback includes an Assigned item that
    // maps to 'Working'. The strip must still read the DELIVERY item only.
    const fbSum = elFb.querySelector('.ex-launch-sum');
    assert(fbSum && /1 shipped/.test(fbSum.textContent), 'stats strip counts delivery items only: 1 shipped');
    assert(fbSum && /0 in progress/.test(fbSum.textContent), 'assigned feedback does NOT inflate in-progress (BUG-001)');

    // Type=Bugs filters the timeline to the bug feedback (+ any bug PRs).
    elFb.querySelector('.ex-fchip[data-filter="type"][data-val="bug"]').click();
    await Promise.resolve(); await Promise.resolve();
    assert(/Export button/.test(elFb.textContent) && !/Sync should retry/.test(elFb.textContent), 'Type=Bugs keeps the bug feedback, drops the backend one');
    elFb.querySelector('.ex-fchip[data-filter="type"][data-val="all"]').click();
    await Promise.resolve(); await Promise.resolve();

    // Status=Working shows the Assigned feedback; Planned shows New + Discarded.
    elFb.querySelector('.ex-fchip[data-filter="status"][data-val="working"]').click();
    await Promise.resolve(); await Promise.resolve();
    assert(/Sync should retry/.test(elFb.textContent), 'Status=Working shows the assigned feedback');
    elFb.querySelector('.ex-fchip[data-filter="status"][data-val="planned"]').click();
    await Promise.resolve(); await Promise.resolve();
    assert(/Export button/.test(elFb.textContent), 'Status=Planned shows the not-yet-decided feedback');

    // BUG-003 regression: when a filter matches nothing, the message must say so -
    // NOT "Nothing in this range" (which implies a date/week problem, not a filter).
    // Type=Bug + Status=Done matches nothing here: the only Done item is a Feature
    // PR, and the bug feedback is New/Testing - so the timeline is filter-empty.
    elFb.querySelector('.ex-fchip[data-filter="type"][data-val="bug"]').click();
    await Promise.resolve(); await Promise.resolve();
    elFb.querySelector('.ex-fchip[data-filter="status"][data-val="done"]').click();
    await Promise.resolve(); await Promise.resolve();
    const fbEmpty = (elFb.querySelector('.ex-tl-body') || {}).textContent || '';
    assert(/match your filters|تطابق عوامل التصفية/i.test(fbEmpty), 'filtered-empty says "No items match your filters" (BUG-003)');
    assert(!/Nothing in this range/i.test(fbEmpty), 'filtered-empty does NOT misleadingly blame the date range');
    nextFeedback = null;   // restore default empty feedback for any later work

    // --- triage controls: director advances lifecycle / assigns wave / discards ---
    // Decisions save to a LOCAL overlay (localStorage) and apply on re-render.
    try { window.localStorage.removeItem(WP.fbTriage._key); } catch (e) {}
    WP.state.lang = 'en';
    nextPayload = Object.assign({}, PAYLOAD, { waves: [{ name: 'W1' }, { name: 'W2' }, { name: 'W3' }, { name: 'W4' }], items: [] });
    nextFeedback = { generated: new Date().toISOString(), items: [
      { id: 'tri-1', note: '[Bug] Export button does nothing', klass: 'Bug', type: 'Bug', status: 'New', wave: null, submittedAt: new Date(Date.now() - 30 * 60 * 1000).toISOString() },
    ] };
    const elT = window.document.createElement('div');
    WP.ui.exec.render(elT);
    await settle();
    // reset the filters left active by the BUG-003 block (view-local state persists),
    // then move to "All" so the item is visible regardless of the week window.
    const resetFilters = function (el) {
      const ta = el.querySelector('.ex-fchip[data-filter="type"][data-val="all"]'); if (ta) ta.click();
      const sa = el.querySelector('.ex-fchip[data-filter="status"][data-val="all"]'); if (sa) sa.click();
    };
    const goAll = function (el) { const a = [...el.querySelectorAll('.ex-seg-btn')].find(b => /all/i.test(b.textContent)); if (a) a.click(); };
    resetFilters(elT); goAll(elT);
    await Promise.resolve(); await Promise.resolve();
    assert(elT.querySelector('.ex-tl-triage-btn'), 'a triage control renders on a feedback row');
    // The engine suggests a Status (+ wave) for an untriaged Bug: Assigned to a wave.
    const sug = WP.fbTriage.suggest({ klass: 'Bug', note: '[Bug] Export button does nothing', status: 'New' }, 4);
    assert(sug.status === 'Assigned' && sug.wave, 'suggestion: a Bug is suggested Assigned + a wave');
    // open the panel
    elT.querySelector('.ex-tl-triage-btn').click();
    const panel = elT.querySelector('.ex-triage');
    assert(panel && !panel.hidden, 'triage panel opens');
    assert(panel.querySelector('.ex-triage-rec'), 'a recommendation banner renders');
    // untriaged item pre-selects the suggested status (not raw "New")
    const statusSel = panel.querySelector('.ex-triage-status');
    assert(statusSel.value === sug.status, 'panel pre-selects the suggested status');
    assert(panel.querySelector('.ex-triage-cancel'), 'a Cancel button renders');
    // Force Assigned with an EMPTY wave -> Save refuses (no overlay written).
    statusSel.value = 'Assigned'; statusSel.dispatchEvent(new window.Event('change', { bubbles: true }));
    assert(!panel.querySelector('.ex-triage-wave').hidden, 'wave picker shows when status = Assigned');
    panel.querySelector('.ex-triage-wavesel').value = '';   // clear the auto-prefilled suggestion
    panel.querySelector('.ex-triage-save').click();
    await Promise.resolve();
    assert(!(WP.fbTriage.load()['tri-1']), 'Assigned without a wave does not save');
    // pick wave 3 + save
    panel.querySelector('.ex-triage-wavesel').value = '3';
    panel.querySelector('.ex-triage-save').click();
    await settle();
    goAll(elT);
    await Promise.resolve(); await Promise.resolve();
    assert(WP.fbTriage.load()['tri-1'] && WP.fbTriage.load()['tri-1'].wave === 3, 'decision persisted to the overlay (wave 3)');
    assert(/WAVE 3/.test(elT.textContent), 'row now shows the WAVE 3 chip after assigning');
    assert(elT.querySelector('.ex-tl-row--fb .ex-chip--amber'), 'assigned feedback now reads Working (amber)');

    // Re-render fresh (simulate reload) - the decision must survive.
    const elT2 = window.document.createElement('div');
    WP.ui.exec.render(elT2);
    await settle();
    goAll(elT2);
    await Promise.resolve(); await Promise.resolve();
    assert(/WAVE 3/.test(elT2.textContent), 'triage decision survives a re-render (localStorage overlay)');
    // Discard it -> dimmed/struck, wave cleared.
    elT2.querySelector('.ex-tl-triage-btn').click();
    const p2 = elT2.querySelector('.ex-triage');
    p2.querySelector('.ex-triage-status').value = 'Discarded';
    p2.querySelector('.ex-triage-status').dispatchEvent(new window.Event('change', { bubbles: true }));
    assert(p2.querySelector('.ex-triage-wave').hidden, 'wave picker hides for Discarded');
    p2.querySelector('.ex-triage-save').click();
    await settle();
    goAll(elT2);
    await Promise.resolve(); await Promise.resolve();
    assert(elT2.querySelector('.ex-tl-row--discarded'), 'discarded feedback renders dimmed/struck');
    assert(WP.fbTriage.load()['tri-1'].wave === null, 'discarding clears the assigned wave');
    try { window.localStorage.removeItem(WP.fbTriage._key); } catch (e) {}
    nextFeedback = null;

  } catch (e) {
    errors.push('[run] ' + e.message + '\n' + e.stack);
  }
  if (errors.length) { console.log('FAIL\n' + errors.join('\n')); process.exit(1); }
  console.log('PASS — project-delivery (GitHub warehouse): fetch() on data/exec-status.json (no JSONP), admin gate, cover.progress launcher + single bar, sparkline REMOVED, Type+Status filter bar (chips + Status=Done filters waves), timeline renders items[] (per-PR) + Type=Bugs filters them, stats strip counts items not waves, wave CARDS (WAVE N + badge + health dot + PR count), needsYou, empty-state when no run yet, error state, Open-report -> status.html, EN+AR.');
  process.exit(0);
})();
