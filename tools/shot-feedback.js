/* Visual evidence for the global Feedback widget.
 * Boots the built dist offline and captures the acceptance-bar screenshots:
 *  - FAB desktop + mobile (icon-only)
 *  - panel: member (no priority) + director (priority), light + dark, EN + AR/RTL
 *  - AI tooltip (hover), Suggest-into-empty, Polish + Undo
 *  - 3 queued comments, edit a queued item
 *  - submit success (batch), simulated submit-failure keeping the queue
 *  - close-and-reopen restoring the draft
 * Endpoints are stubbed offline; no network. */
const path = require('path');
const fs = require('fs');
const { chromium } = require(path.join(process.env.HOME, 'tempo-hardening-ux/node_modules/playwright'));

const URL = 'file://' + path.join(__dirname, '..', 'dist', 'index.html');
const OUT = path.join(__dirname, '..', 'docs', 'shots', 'feedback');
fs.mkdirSync(OUT, { recursive: true });

async function shot(page, name) { await page.screenshot({ path: path.join(OUT, name) }); }

// Configure endpoints + intercept the AI JSONP and the submit form BEFORE the app loads.
async function initStubs(page) {
  await page.addInitScript(() => {
    window.__seedConfig = function () {
      if (window.WP && window.WP.config) {
        window.WP.config.feedbackEndpoint = 'https://stub.example/exec';
        window.WP.config.feedbackKey = 'stub-key';
        window.WP.config.aiPolishEndpoint = 'https://stub.example/ai';
      }
    };
    // Stub AI: exec.js-style jsonp override once WP.ui exists is unreliable (captured
    // at call time here, so a direct override works). We patch after load via evaluate.
    // Intercept the submit form so success/failure are deterministic offline.
    window.__failSubmit = false;
    const realSubmit = window.HTMLFormElement.prototype.submit;
    window.HTMLFormElement.prototype.submit = function () {
      const cbInput = this.querySelector('input[name="callback"]');
      const payloadInput = this.querySelector('input[name="payload"]');
      window.__lastPayload = payloadInput ? payloadInput.value : null;
      const cb = cbInput ? cbInput.value : null;
      if (window.__failSubmit) return;   // never resolve → widget shows Retry after timeout; we assert on state instead
      Promise.resolve().then(function () {
        try { const b = JSON.parse(payloadInput.value); if (window[cb]) window[cb]({ ok: true, count: b.items.length }); } catch (e) {}
      });
    };
  });
}

async function boot(page, { lang, theme, director }) {
  await page.evaluate(({ lang, theme, director }) => {
    const WP = window.WP;
    if (WP.ui.feedback && WP.ui.feedback._close) WP.ui.feedback._close();   // close any panel from a prior step
    window.__seedConfig();
    const people = WP.data.PEOPLE || [];
    const dir = people.find(p => WP.access.canManage(p));
    const mem = people.find(p => !WP.access.canManage(p));
    WP.state.authed = true;
    WP.state.viewerId = (director ? dir : mem).id;
    WP.state.lang = lang; WP.state.theme = theme; WP.state.route = 'dashboard';
    document.documentElement.lang = lang;
    document.documentElement.dir = lang === 'ar' ? 'rtl' : 'ltr';
    // Override jsonp for AI (deterministic).
    WP.ui.jsonp = function () { return Promise.resolve({ text: lang === 'ar' ? 'اقتراح مصقول للملاحظة.' : 'A clear, specific piece of feedback about this page.' }); };
    if (WP.ui.feedback) WP.ui.feedback._reset();
    WP.render();
  }, { lang, theme, director });
  await page.waitForTimeout(200);
}

async function openPanel(page) {
  await page.click('#fb-fab');
  await page.waitForTimeout(250);
}
async function type(page, text) {
  await page.fill('#fb-note', text);
}
async function add(page) { await page.click('#fb-add'); await page.waitForTimeout(120); }

(async () => {
  const errors = [];
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
  page.on('pageerror', e => errors.push('[pageerror] ' + e.message));
  page.on('console', m => { if (m.type() === 'error' && !/Failed to load resource|favicon/.test(m.text())) errors.push('[console] ' + m.text()); });

  await initStubs(page);
  await page.goto(URL, { waitUntil: 'networkidle' });

  // ---- FAB desktop (light + dark) ----
  await boot(page, { lang: 'en', theme: 'light', director: false });
  if (!(await page.$('.fb-fab'))) { console.log('SHOT FAIL — no FAB after boot'); process.exit(1); }
  await shot(page, 'fab-light.png');
  await boot(page, { lang: 'en', theme: 'dark', director: false });
  await shot(page, 'fab-dark.png');

  // ---- FAB mobile (icon-only) ----
  await page.setViewportSize({ width: 400, height: 780 });
  await boot(page, { lang: 'en', theme: 'light', director: false });
  await shot(page, 'fab-mobile.png');
  const txtVisible = await page.evaluate(() => {
    const t = document.querySelector('.fb-fab-txt');
    return t ? getComputedStyle(t).display !== 'none' : true;
  });
  if (txtVisible) { console.log('SHOT FAIL — FAB label not collapsed on mobile'); process.exit(1); }
  await page.setViewportSize({ width: 1280, height: 900 });

  // ---- Panel: member (no priority), light + dark ----
  for (const theme of ['light', 'dark']) {
    await boot(page, { lang: 'en', theme, director: false });
    await openPanel(page);
    if (await page.$('#fb-priority')) { console.log('SHOT FAIL — member sees Priority'); process.exit(1); }
    await shot(page, 'panel-member-' + theme + '.png');
    await page.click('#fb-close'); await page.waitForTimeout(120);
  }

  // ---- Panel: director (priority) ----
  await boot(page, { lang: 'en', theme: 'light', director: true });
  await openPanel(page);
  if (!(await page.$('#fb-priority'))) { console.log('SHOT FAIL — director missing Priority'); process.exit(1); }
  await shot(page, 'panel-director.png');

  // ---- AI tooltip on hover ----
  await page.hover('#fb-suggest');
  await page.waitForTimeout(200);
  await shot(page, 'ai-tooltip.png');

  // ---- Suggest into empty ----
  await page.click('#fb-suggest');
  await page.waitForTimeout(250);
  const suggested = await page.inputValue('#fb-note');
  if (!suggested) { console.log('SHOT FAIL — Suggest did not fill the empty note'); process.exit(1); }
  await shot(page, 'suggest-empty.png');

  // ---- Polish + Undo ----
  await page.click('#fb-polish');
  await page.waitForTimeout(250);
  const undoVisible = await page.evaluate(() => { const u = document.querySelector('#fb-undo'); return u && !u.hidden; });
  if (!undoVisible) { console.log('SHOT FAIL — Undo not shown after Polish'); process.exit(1); }
  await shot(page, 'polish-undo.png');
  await page.click('#fb-undo'); await page.waitForTimeout(120);

  // ---- 3 queued comments (director) ----
  await page.fill('#fb-note', ''); await type(page, 'The workload map legend is hard to read in dark mode.'); await add(page);
  await type(page, 'Add a keyboard shortcut to open search.'); await add(page);
  await type(page, 'The evaluation banner overlaps the header on mobile.'); await add(page);
  const qcount = await page.evaluate(() => document.querySelectorAll('.fb-card').length);
  if (qcount !== 3) { console.log('SHOT FAIL — expected 3 queued, got ' + qcount); process.exit(1); }
  await shot(page, 'queue-3.png');

  // ---- Edit a queued item (reloads into composer) ----
  await page.click('[data-edit="0"]'); await page.waitForTimeout(150);
  const reloaded = await page.inputValue('#fb-note');
  if (!/legend/.test(reloaded)) { console.log('SHOT FAIL — edit did not reload note'); process.exit(1); }
  await shot(page, 'edit-reload.png');
  await add(page);   // put it back

  // ---- Submit success (batch) ----
  await page.evaluate(() => { window.__failSubmit = false; });
  await page.click('#fb-submit');
  await page.waitForTimeout(300);
  const closedOnSuccess = !(await page.$('.fb-panel'));
  await shot(page, 'submit-success.png');   // toast visible, panel closed
  if (!closedOnSuccess) { console.log('SHOT FAIL — panel did not close on success'); process.exit(1); }
  const payloadCount = await page.evaluate(() => { try { return JSON.parse(window.__lastPayload).items.length; } catch (e) { return -1; } });
  if (payloadCount < 3) { console.log('SHOT FAIL — batch payload had ' + payloadCount + ' items'); process.exit(1); }

  // ---- Submit failure keeps the queue (offline) ----
  await boot(page, { lang: 'en', theme: 'light', director: true });
  await openPanel(page);
  await type(page, 'This one should survive a failed send.'); await add(page);
  await page.evaluate(() => { Object.defineProperty(window.navigator, 'onLine', { configurable: true, value: false }); });
  await page.click('#fb-submit');
  await page.waitForTimeout(300);
  const stillQueued = await page.evaluate(() => window.WP.ui.feedback._model().queue.length);
  if (stillQueued < 1) { console.log('SHOT FAIL — queue lost on failed submit'); process.exit(1); }
  await shot(page, 'submit-failure-kept.png');
  await page.evaluate(() => { Object.defineProperty(window.navigator, 'onLine', { configurable: true, value: true }); });

  // ---- Close and reopen restores the draft ----
  await type(page, 'A draft I will come back to.');
  await page.evaluate(() => window.WP.ui.feedback._close());
  await page.waitForTimeout(150);
  await openPanel(page);
  const restored = await page.inputValue('#fb-note');
  if (!/come back/.test(restored)) { console.log('SHOT FAIL — draft not restored on reopen'); process.exit(1); }
  await shot(page, 'reopen-restored.png');
  await page.evaluate(() => window.WP.ui.feedback._reset());

  // ---- Arabic / RTL, light + dark, panel + FAB ----
  for (const theme of ['light', 'dark']) {
    await boot(page, { lang: 'ar', theme, director: true });
    await openPanel(page);
    const isRtl = await page.evaluate(() => { const p = document.querySelector('.fb-panel'); return p && p.getAttribute('dir') === 'rtl'; });
    if (!isRtl) { console.log('SHOT FAIL — AR panel not RTL'); process.exit(1); }
    await type(page, 'الأزرار قريبة جداً من بعضها.'); await add(page);
    await shot(page, 'panel-ar-' + theme + '.png');
    await page.evaluate(() => { window.WP.ui.feedback._close(); window.WP.ui.feedback._reset(); });
    await page.waitForTimeout(150);
  }

  await browser.close();
  if (errors.length) { console.log('SHOT FAIL — JS errors:\n' + errors.join('\n')); process.exit(1); }
  console.log('SHOT OK — FAB (desktop+mobile), panel member/director, AI tooltip+suggest+polish+undo, 3-queue, edit, submit success + failure-kept, close/reopen restore, EN + AR/RTL x light/dark. Files in docs/shots/feedback/');
})();
