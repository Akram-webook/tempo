/* ============================================================
 * WBK Global Feedback Widget — Phase 2 (embeddable, self-contained)
 * ------------------------------------------------------------
 * A single floating feedback button that ANY Webook internal tool can drop in:
 *
 *   <script src="https://akram-webook.github.io/tempo/widget.js"></script>
 *   <script>window.WBK.Feedback.init({ tool: 'hr-portal', endpoint: '<proxy-url>' })</script>
 *
 * It surfaces the same FAB -> form -> submit flow as the in-app widget, and routes
 * every submission to the SAME data/feedback.json warehouse via the SAME token-safe
 * proxy (POST { op:'create', item } -> 200 { ok:true }). The browser never holds a
 * token; the proxy attaches it server-side.
 *
 * SELF-CONTAINED BY DESIGN — it runs inside a HOST tool's page, not inside Tempo:
 *   - No framework, no external deps, no network requests baked into the bundle.
 *   - The proxy endpoint is passed at runtime via init({ endpoint }) — NEVER hardcoded.
 *   - Styles are injected inline via one <style> tag. Colours are WBK design tokens
 *     with rgb() fallbacks (var(--token, rgb(...))) so it adopts a WBK host's theme
 *     when present and still renders correctly on a plain host. No raw hex here.
 *   - DOM is built programmatically; user text is only ever set via textContent
 *     (never innerHTML) — no XSS surface. The one innerHTML use is a CONSTANT icon.
 *
 * PUBLIC API (window.WBK.Feedback):
 *   init(config)  — mount the FAB. Requires { tool, endpoint }. See README/spec.
 *   destroy()     — remove all DOM + listeners (fully reversible; re-init is clean).
 * ========================================================== */
(function (root) {
  'use strict';

  var WBK = root.WBK = root.WBK || {};
  if (WBK.Feedback && WBK.Feedback.__wbk) return;   // already defined (double-load guard)

  var NS = 'wbkfb';                 // class/id prefix — namespaced so it can't collide with a host
  var NOTE_MAX = 2000;
  var TYPES = ['Improvement', 'Bug', 'New idea', 'Design'];

  // Minimal en/ar strings (the widget can't reach WP.i18n on a foreign host).
  var STR = {
    en: {
      title: 'Share feedback', open: 'Share feedback', close: 'Close',
      noteLabel: 'What would you like to share?',
      notePlaceholder: 'Describe the idea, issue, or improvement…',
      typeLabel: 'Type', send: 'Send feedback', sending: 'Sending…',
      sent: 'Thanks — your feedback was sent.', fail: 'Could not send. Please try again.',
      offline: 'You appear to be offline. Please try again.',
      noteRequired: 'Please write a note first.',
      type_Improvement: 'Improvement', type_Bug: 'Bug', type_Newidea: 'New idea', type_Design: 'Design',
    },
    ar: {
      title: 'شارك ملاحظاتك', open: 'شارك ملاحظاتك', close: 'إغلاق',
      noteLabel: 'ما الذي تودّ مشاركته؟',
      notePlaceholder: 'صف الفكرة أو المشكلة أو التحسين…',
      typeLabel: 'النوع', send: 'إرسال الملاحظة', sending: 'جارٍ الإرسال…',
      sent: 'شكرًا — تم إرسال ملاحظتك.', fail: 'تعذّر الإرسال. حاول مرة أخرى.',
      offline: 'يبدو أنك غير متصل بالإنترنت. حاول مرة أخرى.',
      noteRequired: 'اكتب ملاحظة أولًا.',
      type_Improvement: 'تحسين', type_Bug: 'خطأ', type_Newidea: 'فكرة جديدة', type_Design: 'تصميم',
    },
  };

  // A constant, trusted inline SVG (no user data) — a chat/feedback bubble.
  var ICON = '<svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true" focusable="false">' +
    '<path fill="currentColor" d="M12 3c5 0 9 3.36 9 7.5S17 18 12 18a10.6 10.6 0 0 1-2.6-.32L5 19.5l.9-3.2A6.9 6.9 0 0 1 3 10.5C3 6.36 7 3 12 3Z"/>' +
    '</svg>';

  // Live instance state; null when not mounted.
  var state = null;   // { cfg, style, fab, overlay, panel, onKey, lastFocus, submitting, t, lang, dir }

  function slug(v) {
    return String(v == null ? '' : v).trim().toLowerCase()
      .replace(/[^a-z0-9-]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40);
  }
  function browserInfo() {
    var ua = (root.navigator && root.navigator.userAgent) || '';
    var os = /Windows/.test(ua) ? 'Windows' : /Mac OS X|Macintosh/.test(ua) ? 'macOS'
      : /Android/.test(ua) ? 'Android' : /iPhone|iPad/.test(ua) ? 'iOS' : /Linux/.test(ua) ? 'Linux' : 'Other';
    var br = /Edg\//.test(ua) ? 'Edge' : /Chrome\//.test(ua) ? 'Chrome' : /Firefox\//.test(ua) ? 'Firefox'
      : /Safari\//.test(ua) ? 'Safari' : 'Other';
    return br + ' · ' + os;
  }

  /* -------- styles — WBK design system (single dark theme).
   * Token-first so an embedding WBK tool themes it automatically; each var() has a
   * DARK rgb() fallback (the Workload brand is dark-only) for plain hosts. No raw
   * hex anywhere (token-purity rule) — fallbacks are rgb()/rgba() mirroring the WBK
   * reference: brand rgb(255,44,121) / hover rgb(255,77,141) · surface-l2 rgb(39,39,42)
   * · surface-l3 rgb(63,63,70) · content rgb(228,228,231) / rgb(161,161,170) · border
   * rgba(255,255,255,.10) · glow rgba(255,44,121,.40). Component specs: FAB 56px circle
   * · radius M=8 (inputs/buttons) · modal 12px + backdrop rgba(0,0,0,.6) + slide-up 200ms. */
  function css() {
    var pos = (state.cfg.position === 'bottom-left') ? 'left:24px;' : 'right:24px;';
    return [
      '.' + NS + '-root{',
      '--' + NS + '-brand:var(--brand,rgb(255,44,121));',
      '--' + NS + '-brand-hover:var(--brand-hover,rgb(255,77,141));',
      '--' + NS + '-glow:var(--brand-glow,rgba(255,44,121,0.40));',
      '--' + NS + '-on-brand:rgb(255,255,255);',
      '--' + NS + '-surface:var(--surface-l2,rgb(39,39,42));',
      '--' + NS + '-surface-3:var(--surface-l3,rgb(63,63,70));',
      '--' + NS + '-text:var(--content-primary,rgb(228,228,231));',
      '--' + NS + '-text-2:var(--content-secondary,rgb(161,161,170));',
      '--' + NS + '-border:var(--border,rgba(255,255,255,0.10));',
      '--' + NS + '-border-strong:var(--border-strong,rgba(255,255,255,0.20));}',
      '@keyframes ' + NS + '-up{from{transform:translateY(12px);opacity:0}to{transform:translateY(0);opacity:1}}',
      // FAB: 56px circle, brand fill, white icon, hover brand-hover, active scale(.95).
      '.' + NS + '-fab{position:fixed;bottom:24px;' + pos + 'z-index:2147483000;',
      'inline-size:56px;block-size:56px;border-radius:50%;border:none;cursor:pointer;',
      'display:inline-flex;align-items:center;justify-content:center;',
      'background:var(--' + NS + '-brand);color:var(--' + NS + '-on-brand);',
      'box-shadow:0 6px 24px rgba(0,0,0,0.45);transition:background .15s ease,transform .1s ease,box-shadow .15s ease;}',
      '.' + NS + '-fab:hover{background:var(--' + NS + '-brand-hover);box-shadow:0 10px 30px rgba(0,0,0,0.5);}',
      '.' + NS + '-fab:active{transform:scale(0.95);}',
      '.' + NS + '-fab:focus-visible{outline:none;box-shadow:0 0 0 4px var(--' + NS + '-glow);}',
      // Modal: backdrop rgba(0,0,0,.6), panel surface-l2 radius 12, slide-up 200ms.
      '.' + NS + '-overlay{position:fixed;inset:0;z-index:2147483001;display:flex;',
      'align-items:center;justify-content:center;padding:20px;background:rgba(0,0,0,0.6);}',
      '.' + NS + '-panel{inline-size:100%;max-inline-size:440px;background:var(--' + NS + '-surface);',
      'color:var(--' + NS + '-text);border:1px solid var(--' + NS + '-border);border-radius:12px;',
      'box-shadow:0 24px 60px rgba(0,0,0,0.6);overflow:hidden;animation:' + NS + '-up 200ms ease;',
      'font:16px/1.5 Figtree,system-ui,-apple-system,Segoe UI,Roboto,sans-serif;}',
      '.' + NS + '-head{display:flex;align-items:center;justify-content:space-between;gap:10px;',
      'padding:16px 24px 12px;border-bottom:1px solid var(--' + NS + '-border);}',
      '.' + NS + '-h{margin:0;font-size:18px;font-weight:700;}',
      '.' + NS + '-x{border:1px solid var(--' + NS + '-border);background:transparent;color:var(--' + NS + '-text-2);',
      'inline-size:32px;block-size:32px;border-radius:8px;cursor:pointer;font-size:18px;line-height:1;}',
      '.' + NS + '-x:hover{background:var(--' + NS + '-surface-3);color:var(--' + NS + '-text);}',
      '.' + NS + '-x:focus-visible{outline:none;box-shadow:0 0 0 3px var(--' + NS + '-glow);}',
      '.' + NS + '-body{padding:16px 24px;}',
      '.' + NS + '-field{display:block;margin-bottom:16px;}',
      '.' + NS + '-label{display:block;font-size:14px;font-weight:500;color:var(--' + NS + '-text-2);margin-bottom:6px;}',
      // Inputs: surface-l3 bg, border, radius 8, focus = brand border + glow ring.
      '.' + NS + '-note,.' + NS + '-select{inline-size:100%;box-sizing:border-box;padding:10px 12px;',
      'border:1px solid var(--' + NS + '-border);border-radius:8px;background:var(--' + NS + '-surface-3);',
      'color:var(--' + NS + '-text);font:inherit;}',
      '.' + NS + '-note::placeholder{color:var(--' + NS + '-text-2);}',
      '.' + NS + '-note{min-block-size:104px;resize:vertical;}',
      '.' + NS + '-note:focus,.' + NS + '-select:focus{outline:none;border-color:var(--' + NS + '-brand);box-shadow:0 0 0 3px var(--' + NS + '-glow);}',
      '.' + NS + '-foot{display:flex;justify-content:flex-end;gap:10px;padding:0 24px 20px;}',
      // Primary button: brand, white, radius 8, hover brand-hover, active scale(.98).
      '.' + NS + '-send{background:var(--' + NS + '-brand);color:var(--' + NS + '-on-brand);border:none;',
      'padding:10px 16px;border-radius:8px;font:inherit;font-size:14px;font-weight:700;cursor:pointer;transition:background .15s ease,transform .1s ease;}',
      '.' + NS + '-send:hover{background:var(--' + NS + '-brand-hover);}',
      '.' + NS + '-send:active{transform:scale(0.98);}',
      '.' + NS + '-send[disabled]{opacity:.4;cursor:default;}',
      '.' + NS + '-send:focus-visible{outline:none;box-shadow:0 0 0 4px var(--' + NS + '-glow);}',
      '.' + NS + '-toast{position:fixed;bottom:92px;' + pos + 'z-index:2147483002;max-inline-size:300px;',
      'padding:12px 14px;border-radius:8px;background:var(--' + NS + '-surface);color:var(--' + NS + '-text);',
      'border:1px solid var(--' + NS + '-border-strong);box-shadow:0 10px 30px rgba(0,0,0,0.5);',
      'font:14px/1.4 Figtree,system-ui,sans-serif;animation:' + NS + '-up 160ms ease;}',
      '.' + NS + '-toast--err{border-color:var(--' + NS + '-brand);}',
      '.' + NS + '-root[dir="rtl"]{text-align:right;}',
    ].join('');
  }

  /* -------- small DOM helpers (textContent only for any dynamic text) -------- */
  function el(tag, cls, attrs) {
    var n = document.createElement(tag);
    if (cls) n.className = cls;
    if (attrs) for (var k in attrs) if (Object.prototype.hasOwnProperty.call(attrs, k)) n.setAttribute(k, attrs[k]);
    return n;
  }

  function toast(msg, kind) {
    if (!state) return;
    var old = document.querySelector('.' + NS + '-toast');
    if (old && old.parentNode) old.parentNode.removeChild(old);
    var n = el('div', NS + '-toast' + (kind === 'err' ? ' ' + NS + '-toast--err' : ''), { role: 'status', 'aria-live': 'polite' });
    n.textContent = msg;
    state.fab.parentNode.appendChild(n);
    setTimeout(function () { if (n.parentNode) n.parentNode.removeChild(n); }, 4000);
  }

  /* -------- panel open / close -------- */
  function openPanel() {
    if (!state || state.overlay) return;
    var t = state.t;
    state.lastFocus = document.activeElement;

    var overlay = el('div', NS + '-overlay');
    var panel = el('div', NS + '-panel', {
      role: 'dialog', 'aria-modal': 'true', 'aria-label': t.title,
    });

    var head = el('div', NS + '-head');
    var h = el('h2', NS + '-h'); h.textContent = t.title;
    var x = el('button', NS + '-x', { type: 'button', 'aria-label': t.close }); x.textContent = '×';
    head.appendChild(h); head.appendChild(x);

    var body = el('div', NS + '-body');
    // Note field
    var f1 = el('label', NS + '-field');
    var l1 = el('span', NS + '-label'); l1.textContent = t.noteLabel;
    var note = el('textarea', NS + '-note', { id: NS + '-note', maxlength: String(NOTE_MAX), placeholder: t.notePlaceholder });
    f1.appendChild(l1); f1.appendChild(note);
    // Type field
    var f2 = el('label', NS + '-field');
    var l2 = el('span', NS + '-label'); l2.textContent = t.typeLabel;
    var sel = el('select', NS + '-select', { id: NS + '-type' });
    TYPES.forEach(function (ty) {
      var o = el('option'); o.value = ty; o.textContent = t['type_' + ty.replace(/\s/g, '')] || ty; sel.appendChild(o);
    });
    f2.appendChild(l2); f2.appendChild(sel);
    body.appendChild(f1); body.appendChild(f2);

    var foot = el('div', NS + '-foot');
    var send = el('button', NS + '-send', { type: 'button' }); send.textContent = t.send;
    foot.appendChild(send);

    panel.appendChild(head); panel.appendChild(body); panel.appendChild(foot);
    overlay.appendChild(panel);
    state.fab.parentNode.appendChild(overlay);
    state.overlay = overlay;

    x.addEventListener('click', closePanel);
    overlay.addEventListener('click', function (e) { if (e.target === overlay) closePanel(); });
    send.addEventListener('click', submit);

    setTimeout(function () { try { note.focus(); } catch (e) {} }, 20);
  }

  function closePanel() {
    if (!state || !state.overlay) return;
    if (state.overlay.parentNode) state.overlay.parentNode.removeChild(state.overlay);
    state.overlay = null;
    state.submitting = false;
    try { (state.fab || state.lastFocus).focus(); } catch (e) {}
  }

  /* -------- submit (create via the token-safe proxy; no token in the browser) -------- */
  function submit() {
    if (!state || state.submitting) return;   // double-submit guard
    var t = state.t;
    var overlay = state.overlay;
    var note = overlay.querySelector('#' + NS + '-note');
    var sel = overlay.querySelector('#' + NS + '-type');
    var send = overlay.querySelector('.' + NS + '-send');
    var text = (note.value || '').trim().slice(0, NOTE_MAX);
    if (!text) { toast(t.noteRequired, 'err'); try { note.focus(); } catch (e) {} return; }

    if (root.navigator && root.navigator.onLine === false) { toast(t.offline, 'err'); return; }

    var item = {
      note: text,
      type: sel.value,
      priority: '',                               // host-tool users are not directors
      owner: String(state.cfg.owner || ''),
      source: state.cfg.tool,                     // WHICH tool submitted (auto)
      area: String(state.cfg.tool),               // the embedding tool is the "area"
      context: browserInfo(),
      url: (root.location && root.location.href) || '',   // auto
      submittedAt: new Date().toISOString(),
    };

    state.submitting = true;
    send.disabled = true; send.textContent = t.sending;

    var ctrl = (typeof AbortController !== 'undefined') ? new AbortController() : null;
    var timer = setTimeout(function () { if (ctrl) ctrl.abort(); }, 20000);
    var opts = { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ op: 'create', item: item }) };
    if (ctrl) opts.signal = ctrl.signal;

    fetch(state.cfg.endpoint, opts).then(function (res) {
      clearTimeout(timer);
      if (!res || res.status !== 200) throw new Error('http ' + (res && res.status));
      return res.json().then(function (j) { if (!j || j.ok !== true) throw new Error('not ok'); return true; });
    }).then(function () {
      // Success: confirm + close (nothing to roll back).
      closePanel();
      toast(t.sent);
    }).catch(function () {
      clearTimeout(timer);
      // Rollback: keep the user's text + re-enable so they can retry (never lose work).
      if (state && state.submitting) {
        state.submitting = false;
        if (send) { send.disabled = false; send.textContent = t.send; }
        toast((root.navigator && root.navigator.onLine === false) ? t.offline : t.fail, 'err');
      }
    });
  }

  /* -------- mount / init / destroy -------- */
  function mount(cfg) {
    var lang = (cfg.locale === 'ar') ? 'ar' : 'en';
    var dir = (lang === 'ar') ? 'rtl' : 'ltr';
    var t = STR[lang];

    // One root wrapper carries the token scope + dir. FAB lives inside it, in <body>.
    var wrapper = el('div', NS + '-root'); wrapper.setAttribute('dir', dir);

    // Styles are injected after state is set (css() reads state.cfg.position).
    var style = el('style'); style.setAttribute('data-' + NS, '1');

    var fab = el('button', NS + '-fab', {
      type: 'button', 'aria-haspopup': 'dialog', 'aria-label': t.open, title: t.open,
    });
    fab.innerHTML = ICON;   // CONSTANT trusted markup — no user data (see ICON above)

    state = { cfg: cfg, style: style, fab: fab, overlay: null, wrapper: wrapper, lang: lang, dir: dir, t: t, submitting: false, lastFocus: null };
    // css() reads state.cfg.position — set state first, then fill the style text.
    try { style.textContent = css(); } catch (e) { try { root.console && root.console.warn('[WBK.Feedback] style injection blocked by CSP; rendering unstyled.'); } catch (e2) {} }

    wrapper.appendChild(fab);
    document.head && document.head.appendChild(style);
    document.body.appendChild(wrapper);

    fab.addEventListener('click', openPanel);

    // Esc closes the panel; captured at document level, removed on destroy.
    state.onKey = function (e) {
      if (!state) return;
      if (e.key === 'Escape' && state.overlay) { e.preventDefault(); closePanel(); }
    };
    document.addEventListener('keydown', state.onKey, true);
  }

  function init(cfg) {
    var log = (root.console && root.console.error) ? root.console.error.bind(root.console) : function () {};
    if (!cfg || typeof cfg !== 'object') { log('[WBK.Feedback] init(config) requires a config object; widget not mounted.'); return false; }
    var tool = slug(cfg.tool);
    if (!tool) { log('[WBK.Feedback] init() requires a non-empty "tool" identifier; widget not mounted.'); return false; }
    var endpoint = (typeof cfg.endpoint === 'string') ? cfg.endpoint.trim() : '';
    if (!endpoint) { log('[WBK.Feedback] init() requires an "endpoint" URL (the feedback proxy); widget not mounted.'); return false; }
    if (typeof document === 'undefined' || !document.body) { log('[WBK.Feedback] no document.body available; widget not mounted.'); return false; }

    // Idempotent: a second init() replaces cleanly (never a duplicate FAB / ghost listeners).
    if (state) destroy();

    mount({
      tool: tool,
      endpoint: endpoint,
      owner: (typeof cfg.owner === 'string') ? cfg.owner : '',
      position: (cfg.position === 'bottom-left') ? 'bottom-left' : 'bottom-right',
      locale: (cfg.locale === 'ar') ? 'ar' : 'en',
      theme: 'wbk',
    });
    return true;
  }

  function destroy() {
    if (!state) return;
    try { if (state.onKey) document.removeEventListener('keydown', state.onKey, true); } catch (e) {}
    closePanel();
    var toastEl = document.querySelector('.' + NS + '-toast');
    [toastEl, state.wrapper, state.style].forEach(function (n) { if (n && n.parentNode) n.parentNode.removeChild(n); });
    state = null;
  }

  WBK.Feedback = { init: init, destroy: destroy, __wbk: true };

  // Support module contexts too (harmless in the browser bundle).
  if (typeof module !== 'undefined' && module.exports) module.exports = WBK.Feedback;
})(typeof window !== 'undefined' ? window : this);
