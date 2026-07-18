/* Headless verify: the global Feedback widget (src/js/ui/feedback.js).
 * Boots the bundled scripts in jsdom (same harness as verify-exec) and asserts
 * the QA acceptance bar A-J plus the design/behaviour contract:
 *  - FAB renders on an authed route; hidden on the sign-in screen (signed-out);
 *  - composer order feedback-first; Type has the 4 allowed types (NO "Question");
 *  - Priority ONLY for director/admin;
 *  - note required + capped at NOTE_MAX; note escaped in the queue (XSS);
 *  - Suggest works when empty / Polish disabled when empty / both provide Undo;
 *  - Add queues + resets composer + shows "New comment #N" marker + confirmation;
 *  - edit reloads a card into the composer, remove drops it;
 *  - Submit sends queue + composer as SEPARATE items in ONE fetch() FormData
 *    POST (correct count, status="New", no JSONP/iframe);
 *  - double-submit guarded (one request);
 *  - submit-FAILURE keeps the queue intact (draft not cleared);
 *  - close-with-content persists to sessionStorage + restores on reopen;
 *  - image >5MB rejected; wrong type rejected;
 *  - client priority defaulted blank for a non-director in the payload (QA F);
 *  - endpoints empty -> graceful ("not set up yet"), AI buttons hidden;
 *  - EN + AR; no console errors. */
const fs = require('fs'), path = require('path');
const { JSDOM } = require('jsdom');

const root = path.join(__dirname, '..');
const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const srcs = [...html.matchAll(/src="([^"]+\.js)"/g)].map(m => m[1]);

const dom = new JSDOM('<!doctype html><html><head></head><body><div id="app"></div></body></html>', {
  url: 'https://example.org/tempo/', pretendToBeVisual: true, runScripts: 'outside-only',
});
const { window } = dom;
const document = window.document;
const errors = [];
const benign = /font|stylesheet|localStorage|sessionStorage|Security|scrollIntoView|Not implemented|opaque|insertRule|cssRules|execCommand|canvas|getContext|toDataURL/i;
['error', 'warn'].forEach(k => {
  const orig = window.console[k].bind(window.console);
  window.console[k] = (...a) => { const s = a.join(' '); if (!benign.test(s)) errors.push('[' + k + '] ' + s); orig(...a); };
});
window.addEventListener('error', e => { if (!benign.test(String(e.message))) errors.push('[onerror] ' + e.message); });
window.HTMLElement.prototype.scrollIntoView = function () {};
window.matchMedia = window.matchMedia || function () { return { matches: false, addEventListener() {}, removeEventListener() {} }; };
// sessionStorage shim (jsdom has it, but be defensive across versions).
if (!window.sessionStorage) {
  const store = {};
  window.sessionStorage = {
    getItem: k => (k in store ? store[k] : null), setItem: (k, v) => { store[k] = String(v); },
    removeItem: k => { delete store[k]; }, clear: () => { Object.keys(store).forEach(k => delete store[k]); },
  };
}
// Canvas downscale is exercised but jsdom has no 2d context — the module falls
// back to the original data URL (size guard still applies), which is what we test.
window.HTMLCanvasElement.prototype.getContext = function () { return null; };

// jsdom has no fetch/FormData/AbortController — provide test doubles. The default
// fetch double is a controllable mock: each test sets fbFetch.next (a function that
// returns a Promise given (url, opts)) and reads fbFetch.calls to inspect requests.
if (!window.FormData) {
  window.FormData = function () { this._d = {}; };
  window.FormData.prototype.append = function (k, v) { this._d[k] = v; };
  window.FormData.prototype.get = function (k) { return this._d[k]; };
}
if (!window.AbortController) {
  window.AbortController = function () { this.signal = {}; this.abort = function () {}; };
}
const fbFetch = { calls: [], next: null };
window.fetch = function (url, opts) {
  fbFetch.calls.push({ url: url, opts: opts || {} });
  if (fbFetch.next) return fbFetch.next(url, opts || {});
  return Promise.reject(new Error('no fetch handler set'));
};
// Read the FormData body of the most recent fetch as a plain object. jsdom ships
// a native FormData (with .get()), so read via .get() for the known fields; fall
// back to the ._d bag if the polyfill was used.
const FORM_FIELDS = ['key', 'submittedAt', 'owner', 'area', 'context', 'url', 'status', 'items'];
function lastForm() {
  const c = fbFetch.calls[fbFetch.calls.length - 1];
  const body = c && c.opts && c.opts.body;
  if (!body) return null;
  if (body._d) return body._d;
  if (typeof body.get === 'function') {
    const o = {};
    FORM_FIELDS.forEach(k => { const v = body.get(k); if (v !== null && v !== undefined) o[k] = v; });
    return o;
  }
  return null;
}
function okJson(obj) { return function () { return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve(obj) }); }; }

for (const s of srcs) {
  const code = fs.readFileSync(path.join(root, s), 'utf8');
  const script = new window.Function(code);
  try { script.call(window); } catch (e) { errors.push('[load ' + s + '] ' + e.message); }
}

const WP = window.WP;
WP.render = function () {};   // neutralize app.js bootstrap
function assert(c, m) { if (!c) errors.push('[assert] ' + m); }

const fb = WP.ui.feedback;
const $ = sel => document.querySelector(sel);
const $$ = sel => Array.prototype.slice.call(document.querySelectorAll(sel));
function clickable(el) { return el && (el.tagName === 'BUTTON'); }
function fireInput(el, value) {
  el.value = value;
  el.dispatchEvent(new window.Event('input', { bubbles: true }));
}
function fireChange(el, value) {
  el.value = value;
  el.dispatchEvent(new window.Event('change', { bubbles: true }));
}
function tick() { return new Promise(r => setTimeout(r, 0)); }

(async () => {
  try {
    // --- viewer setup: pick a director and a member -----------------------------
    WP.state = WP.state || {};
    const people = (WP.data && WP.data.PEOPLE) || [];
    const director = people.find(p => WP.access.canManage(p));
    const member = people.find(p => !WP.access.canManage(p));
    assert(director, 'found a director in the directory');
    assert(member, 'found a member in the directory');

    // Reset any prior draft.
    fb._reset();

    // ========================================================================
    // FAB visibility (QA G) — signed-in only. Compose is always available; the
    // endpoint being unset only changes the Submit button (see below), never the
    // FAB, so a user's typed feedback is never blocked by config.
    // ========================================================================
    WP.config.feedbackEndpoint = 'https://script.example/exec';
    WP.state.authed = false;
    fb.mount();
    assert(!$('.fb-fab'), 'FAB hidden when signed out');

    // Signed in but endpoint EMPTY → FAB STILL renders (Submit will read "not configured").
    WP.state.authed = true; WP.state.viewerId = member.id; WP.state.route = 'dashboard';
    WP.config.feedbackEndpoint = '';
    fb.mount();
    assert(!!$('.fb-fab'), 'FAB renders when authed even if endpoint empty');

    // Signed in AND endpoint set → FAB renders.
    WP.config.feedbackEndpoint = 'https://script.example/exec';
    fb.mount();
    assert(!!$('.fb-fab'), 'FAB renders when authed AND endpoint set');
    assert($('#fb-fab').getAttribute('aria-label'), 'FAB has an aria-label');

    // ========================================================================
    // Panel opens: order feedback-first, Type has 4 types (no "Question")
    // ========================================================================
    fb.open();
    await tick();
    assert(!!$('.fb-panel'), 'panel opens');
    assert($('.fb-panel').getAttribute('role') === 'dialog' && $('.fb-panel').getAttribute('aria-modal') === 'true', 'panel is a modal dialog');
    // Feedback-first: the note textarea appears before the Type select in the DOM.
    const composerHTML = $('.fb-composer').innerHTML;
    assert(composerHTML.indexOf('fb-note') < composerHTML.indexOf('fb-type'), 'note (feedback) comes before Type');
    const typeOpts = $$('#fb-type option').map(o => o.value);
    assert(typeOpts.length === 4, 'exactly 4 types');
    assert(typeOpts.indexOf('Improvement') >= 0 && typeOpts.indexOf('Bug') >= 0 && typeOpts.indexOf('New idea') >= 0 && typeOpts.indexOf('Design') >= 0, 'the 4 allowed types present');
    assert(typeOpts.every(v => !/question/i.test(v)), 'NO "Question" type');

    // Priority hidden for a member (QA context: director/admin only)
    assert(!$('#fb-priority'), 'Priority hidden for a member');

    // AI buttons hidden when aiPolishEndpoint empty (default)
    assert(!$('#fb-suggest') && !$('#fb-polish'), 'AI buttons hidden when aiPolishEndpoint empty');

    // Queue card actions are REAL buttons (QA E) — verify after we add one below.

    // ========================================================================
    // Note required (QA D) + Add queues + resets + marker + confirmation
    // ========================================================================
    // Add with empty note → nothing queued.
    $('#fb-add').click();
    await tick();
    assert(fb._model().queue.length === 0, 'empty note is not queued (note required)');

    // Type a note + add.
    fireInput($('#fb-note'), 'The dashboard cards feel cramped.');
    $('#fb-add').click();
    await tick();
    assert(fb._model().queue.length === 1, 'note added to queue');
    assert($('#fb-note').value === '', 'composer note reset after add');
    assert(/#2/.test($('.fb-composer-h').textContent), 'marker advances to "New comment #2"');

    // Queue card actions are real, focusable buttons.
    const editBtn = $('[data-edit]'), rmBtn = $('[data-remove]');
    assert(clickable(editBtn) && clickable(rmBtn), 'queue edit/remove are real <button>s');

    // ========================================================================
    // Note max length (QA D)
    // ========================================================================
    const huge = 'x'.repeat(5000);
    fireInput($('#fb-note'), huge);
    assert(fb._model().composer.note.length <= 2000, 'note capped at NOTE_MAX (2000)');
    fireInput($('#fb-note'), '');   // clear for later

    // ========================================================================
    // XSS: note escaped in the queue card (QA J)
    // ========================================================================
    fireInput($('#fb-note'), '<img src=x onerror=alert(1)> & <b>bold</b>');
    $('#fb-add').click();
    await tick();
    const cardNote = $$('.fb-card-note').pop().innerHTML;
    assert(cardNote.indexOf('<img') === -1 && cardNote.indexOf('&lt;img') >= 0, 'note HTML-escaped in queue card');
    assert(fb._model().queue.length === 2, 'second card queued');

    // ========================================================================
    // Edit reloads into composer + drops from queue; remove drops a card
    // ========================================================================
    $('[data-edit="0"]').click();
    await tick();
    assert(fb._model().queue.length === 1, 'edit removed the card from the queue');
    assert($('#fb-note').value.indexOf('cramped') >= 0, 'edit reloaded the note into the composer');
    // Re-add it back.
    $('#fb-add').click(); await tick();
    assert(fb._model().queue.length === 2, 're-added after edit');
    // Remove the first card.
    $('[data-remove="0"]').click(); await tick();
    assert(fb._model().queue.length === 1, 'remove dropped a card');

    // ========================================================================
    // Close-with-content persists to sessionStorage + restores on reopen (QA A)
    // ========================================================================
    fireInput($('#fb-note'), 'a pending note');
    const key = 'tempo_fb_draft:dashboard';
    assert(!!window.sessionStorage.getItem(key), 'draft mirrored to sessionStorage while composing');
    // Force-close (bypass confirm dialog) then reopen.
    fb._close();
    await tick();
    assert(!$('.fb-panel'), 'panel closed');
    assert(!!window.sessionStorage.getItem(key), 'draft persisted after close');
    fb.open(); await tick();
    assert($('#fb-note').value === 'a pending note', 'composer restored from sessionStorage on reopen');
    assert(fb._model().queue.length === 1, 'queue restored on reopen');

    // ========================================================================
    // Image handling (QA C): wrong type rejected, >5MB rejected
    // ========================================================================
    // Wrong type.
    let toastMsg = null;
    const realToast = WP.ui.toast;
    WP.ui.toast = (m, s) => { toastMsg = m; };
    const input = $('#fb-img-input');
    // Simulate a non-image file.
    Object.defineProperty(input, 'files', { configurable: true, value: [{ type: 'application/pdf', name: 'x.pdf' }] });
    input.dispatchEvent(new window.Event('change', { bubbles: true }));
    await tick();
    assert(toastMsg && /image/i.test(toastMsg), 'wrong file type rejected with a message');
    assert(!fb._model().composer.image, 'wrong type not attached');

    // >5MB image: build a data URL whose decoded size exceeds 5MB (no canvas → no downscale).
    toastMsg = null;
    const bigB64 = 'A'.repeat(Math.ceil(5.5 * 1024 * 1024 * 4 / 3));   // ~5.5MB decoded
    const bigDataUrl = 'data:image/png;base64,' + bigB64;
    // Stub Image so onload fires (jsdom doesn't load data URLs).
    const RealImage = window.Image;
    window.Image = function () { const o = {}; setTimeout(() => o.onload && o.onload(), 0); return o; };
    const RealFR = window.FileReader;
    window.FileReader = function () {
      this.readAsDataURL = function () { const self = this; setTimeout(() => self.onload && self.onload(), 0); };
    };
    Object.defineProperty(window.FileReader.prototype ? window.FileReader.prototype : {}, 'result', { configurable: true, get() { return bigDataUrl; } });
    // Re-wire: FileReader instance needs .result — set on instance in onImagePick via reader.result.
    window.FileReader = function () {
      const self = this; self.result = bigDataUrl;
      this.readAsDataURL = function () { setTimeout(() => self.onload && self.onload(), 0); };
    };
    Object.defineProperty(input, 'files', { configurable: true, value: [{ type: 'image/png', name: 'big.png' }] });
    input.dispatchEvent(new window.Event('change', { bubbles: true }));
    await tick(); await tick();
    assert(toastMsg && /large|5\s?MB|كبيرة/i.test(toastMsg), 'oversize image rejected');
    assert(!fb._model().composer.image, 'oversize image not attached');
    window.Image = RealImage; window.FileReader = RealFR;
    WP.ui.toast = realToast;

    // ========================================================================
    // Submit: graceful when endpoint empty — button reads "Not configured yet"
    // with an explainer tip; clicking still surfaces the message and clears nothing.
    // ========================================================================
    toastMsg = null; WP.ui.toast = (m, s) => { toastMsg = m; };
    WP.config.feedbackEndpoint = '';
    fb._close(); await tick(); fb.open(); await tick();   // re-render with empty endpoint
    assert(/not configured|configured|مُهيأ/i.test($('.fb-submit-txt').textContent), 'Submit reads "Not configured yet" when endpoint empty');
    assert($('#fb-submit').getAttribute('data-tip'), 'Submit has an explainer tooltip when not configured');
    $('#fb-submit').click();
    await tick();
    assert(toastMsg && /not configured|configured|مُهيأ/i.test(toastMsg), 'empty endpoint → graceful "not configured" message');
    assert(fb._model().queue.length >= 1, 'nothing cleared when endpoint empty');
    WP.ui.toast = realToast;

    // ========================================================================
    // Submit: batch of queue + composer as SEPARATE items, one request, count
    // ========================================================================
    WP.config.feedbackEndpoint = 'https://script.example/exec';
    Object.defineProperty(window.navigator, "onLine", { configurable: true, value: true });
    // Force a fresh render now the endpoint is configured (the prior block left the
    // panel open showing the "Not configured" submit button).
    fb._close(); await tick(); fb.open(); await tick();
    // Intercept fetch: capture the FormData body, resolve {ok,count}.
    fbFetch.calls = [];
    fbFetch.next = (url, opts) => {
      const items = JSON.parse(opts.body.get('items'));
      return okJson({ ok: true, count: items.length })();
    };
    // Ensure a composed-but-not-added note is folded into the batch too.
    fireInput($('#fb-note'), 'plus a pending one');
    const expectItems = fb._model().queue.length + 1;
    $('#fb-submit').click();
    await tick(); await tick();
    const postCalls = fbFetch.calls.filter(c => c.url === 'https://script.example/exec');
    assert(postCalls.length === 1, 'exactly ONE fetch for the whole batch');
    const sentForm = lastForm();
    const sentItems = sentForm && JSON.parse(sentForm.items);
    assert(sentItems && sentItems.length === expectItems, 'queue + composer sent as separate items (count ' + expectItems + ')');
    assert(sentForm.status === 'New', 'status="New" in the FormData');
    assert(!window.sessionStorage.getItem(key), 'draft cleared after successful submit');
    assert(!$('.fb-panel'), 'panel closed after successful submit');

    // ========================================================================
    // Double-submit guard (QA B): a slow endpoint, two clicks → one request
    // ========================================================================
    fb._reset();
    WP.state.route = 'settings';
    fb.open(); await tick();
    fireInput($('#fb-note'), 'guarded submit');
    fbFetch.calls = [];
    let resolveHeld = null;
    fbFetch.next = () => new Promise(res => { resolveHeld = () => res({ ok: true, status: 200, json: () => Promise.resolve({ ok: true, count: 1 }) }); });
    $('#fb-submit').click();
    $('#fb-submit').click();   // second click while in-flight
    await tick();
    assert(fbFetch.calls.length === 1, 'double-submit guarded (only one request in flight)');
    if (resolveHeld) resolveHeld();
    await tick(); await tick();

    // ========================================================================
    // Submit FAILURE keeps the queue (QA A/B)
    // ========================================================================
    fb._reset();
    WP.state.route = 'me';
    fb.open(); await tick();
    fireInput($('#fb-note'), 'will fail'); $('#fb-add').click(); await tick();
    const failKey = 'tempo_fb_draft:me';
    // Force offline to get a deterministic immediate failure (module checks navigator.onLine
    // before it even calls fetch), so nothing hangs.
    Object.defineProperty(window.navigator, 'onLine', { configurable: true, value: false });
    fbFetch.next = () => Promise.reject(new Error('network'));
    toastMsg = null; WP.ui.toast = (m) => { toastMsg = m; };
    $('#fb-submit').click();
    await tick();
    assert(toastMsg && /offline|غير متصل/i.test(toastMsg), 'offline submit → offline message');
    assert(fb._model().queue.length === 1, 'queue intact after failed submit');
    assert(!!window.sessionStorage.getItem(failKey), 'draft kept after failed submit');
    Object.defineProperty(window.navigator, "onLine", { configurable: true, value: true });
    WP.ui.toast = realToast;

    // ========================================================================
    // Priority visible + trusted only for a director (QA F)
    // ========================================================================
    fb._close(); await tick();
    fb._reset();
    WP.state.viewerId = director.id; WP.state.route = 'dashboard';
    assert(fb._canSetPriority() === true, 'director can set priority');
    fb.open(); await tick();
    assert(!!$('#fb-priority'), 'Priority shown for a director');
    // Priority has all four levels including Critical (spec).
    const prioOpts = $$('#fb-priority option').map(o => o.value);
    assert(prioOpts.length === 4 && prioOpts.indexOf('Critical') >= 0, 'priority has Low/Medium/High/Critical');
    fireChange($('#fb-priority'), 'Critical');
    fireInput($('#fb-note'), 'director note');
    WP.config.feedbackEndpoint = 'https://script.example/exec';
    fbFetch.next = okJson({ ok: true, count: 1 });
    $('#fb-submit').click(); await tick(); await tick();
    let dirForm = lastForm();
    let dirItems = dirForm && JSON.parse(dirForm.items);
    assert(dirItems && dirItems[0].priority === 'Critical', 'director priority carried in payload');

    // Member: priority forced blank in the payload even if model somehow held one.
    fb._reset();
    WP.state.viewerId = member.id; WP.state.route = 'dashboard';
    fb.open(); await tick();
    fireInput($('#fb-note'), 'member note');
    fbFetch.next = okJson({ ok: true, count: 1 });
    $('#fb-submit').click(); await tick(); await tick();
    const memForm = lastForm();
    const memItems = memForm && JSON.parse(memForm.items);
    assert(memItems && memItems[0].priority === '', 'member priority defaulted BLANK in payload (QA F)');
    // Silent metadata present but never rendered (owner/submittedAt/area/context/url).
    assert(memForm.owner !== undefined && memForm.submittedAt && memForm.area && memForm.context && memForm.url, 'silent metadata rides in FormData');

    // ========================================================================
    // AI helpers (QA H): Suggest works empty, Polish disabled empty, both Undo
    // ========================================================================
    fb._reset();
    WP.config.aiPolishEndpoint = 'https://ai.example/exec';
    fb._close(); await tick();
    fb.open(); await tick();
    assert(!!$('#fb-suggest') && !!$('#fb-polish'), 'AI buttons shown when aiPolishEndpoint set');
    assert($('#fb-polish').disabled === true, 'Polish disabled when note empty');
    assert($('#fb-suggest').disabled !== true, 'Suggest enabled when note empty');
    // Suggest sends a fetch POST {action:'suggest', note, page}; endpoint returns {text}.
    fbFetch.calls = [];
    fbFetch.next = okJson({ text: 'A polished suggestion.' });
    $('#fb-suggest').click();
    await tick(); await tick();
    const aiCall = fbFetch.calls[fbFetch.calls.length - 1];
    const aiBody = aiCall && JSON.parse(aiCall.opts.body);
    assert(aiBody && aiBody.action === 'suggest' && 'note' in aiBody && 'page' in aiBody, 'Suggest posts {action,note,page}');
    assert($('#fb-note').value === 'A polished suggestion.', 'Suggest filled the empty note');
    assert($('#fb-undo').hidden === false, 'Undo available after an AI action');
    $('#fb-undo').click();
    assert($('#fb-note').value === '', 'Undo restored pre-action text');
    // AI failure keeps original text.
    fireInput($('#fb-note'), 'keep me');
    fbFetch.next = () => Promise.reject(new Error('boom'));
    toastMsg = null; WP.ui.toast = (m) => { toastMsg = m; };
    $('#fb-polish').click();
    await tick(); await tick();
    assert($('#fb-note').value === 'keep me', 'AI failure keeps the original text');
    assert(toastMsg && /again|أخرى/i.test(toastMsg), 'AI failure shows a friendly retry message');
    WP.ui.toast = realToast;
    WP.config.aiPolishEndpoint = '';

    // ========================================================================
    // Arabic / RTL render (QA I)
    // ========================================================================
    fb._reset();
    WP.state.lang = 'ar';
    fb._close(); await tick();
    fb.open(); await tick();
    assert($('.fb-panel').getAttribute('dir') === 'rtl', 'panel is dir=rtl in Arabic');
    assert(/ملاحظات|شارك/.test($('.fb-h').textContent), 'panel title localized to Arabic');
    assert(/تعليق/.test($('.fb-composer-h').textContent), 'composer marker localized to Arabic');
    WP.state.lang = 'en';
    fb._close();

    // --- done -------------------------------------------------------------------
    if (errors.length) {
      console.log('FAIL — verify-feedback:\n' + errors.join('\n'));
      process.exit(1);
    }
    console.log('PASS — feedback widget: FAB when authed (hidden signed-out), renders even if endpoint unset; feedback-first composer, 4 types (no Question); priority director-only incl. Critical + defaulted blank for members; note required + capped + escaped; Suggest posts {action,note,page} + Polish-disabled-empty + Undo; add queues+resets+marker; edit reloads, remove drops; batch submit = separate items in ONE fetch() FormData POST (status=New); double-submit guarded; failure keeps the queue; close persists + reopen restores (sessionStorage); wrong-type + >5MB images rejected; empty endpoint → "Not configured yet" + tip; silent metadata (owner/context/url) in FormData; EN + AR/RTL; no console errors.');
  } catch (e) {
    console.log('FAIL — verify-feedback threw: ' + e.stack);
    process.exit(1);
  }
})();
