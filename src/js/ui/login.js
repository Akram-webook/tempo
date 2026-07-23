/* ============================================================
 * Tempo — Sign in
 * ------------------------------------------------------------
 * Strongest configured method wins (see src/js/core/config.js):
 *   1. VERIFIED LINK (Supabase): enter @example.com email → a one-time
 *      sign-in LINK is emailed to the REAL mailbox → open it → signed in.
 *      Typing someone else's email gets you nowhere: the link lands in
 *      THEIR inbox. (Supabase's default email sends a link; a literal typed
 *      6-digit code needs custom SMTP — see ACCESS-SETUP.md.)
 *   2. GOOGLE (GIS): Google proves the @example.com identity.
 *   3. DIRECTORY GATE (demo default): exact-email match only — convenient,
 *      but NOT a real lock (anyone who types a known email gets in).
 * In every mode the email must match a registered Tempo account, and
 * adam.foster@example.com is the Super Admin (View-as any account + access mgmt).
 * ========================================================== */
(function (WP) {
  'use strict';
  const ui = WP.ui;
  // Sign-in email domain. Demo default is example.com (matches the fake demo
  // directory). Go-live (G2) sets WP.config.authDomain to the real company domain
  // - one config line, no code change. Reversible.
  const DOMAIN = (WP.config && WP.config.authDomain) || 'example.com';

  function emailOf(p) {
    if (p && p.email) return p.email;
    return String(p && p.name || '').toLowerCase().replace(/[^a-z\s]/g, '').trim().replace(/\s+/g, '.') + '@' + DOMAIN;
  }
  function findByEmail(raw) {
    let email = String(raw || '').trim().toLowerCase();
    if (!email) return { error: 'errNoAccount' };
    if (email.indexOf('@') < 0) email += '@' + DOMAIN;
    const domain = email.slice(email.indexOf('@') + 1);
    if (domain !== DOMAIN) return { error: 'errBadDomain' };
    // Resolve via the data layer, which matches plaintext (dev) OR salted hashes (public
    // bundle) — so no real address list ships in dist. Falls back to a p.email scan only if
    // the resolver is unavailable (older data module).
    let id = (WP.data.emailToId && WP.data.emailToId(email)) || null;
    let p = id ? WP.data.PEOPLE.find(function (x) { return x.id === id; }) : null;
    if (!p) p = WP.data.PEOPLE.find(function (x) { return x.email && x.email.toLowerCase() === email; });
    return p ? { person: p } : { error: 'errNoAccount' };
  }

  // Is Supabase configured? This gates the DATA layer (WP.db) and the verified-link
  // option — NOT the same question as "which auth provider do we use".
  function dbConfigured() { return !!(WP.config && WP.config.supabaseUrl && WP.config.supabaseAnonKey); }
  function googleConfigured() { return !!(WP.config && WP.config.googleClientId); }
  // The active AUTH provider. WP.config.authMode wins when set to a known value;
  // otherwise fall back to the legacy precedence (verified-link > google > directory).
  // Decoupled from dbConfigured() so we can pick the directory gate (or Google) while
  // Supabase stays wired for data.
  function mode() {
    var m = WP.config && WP.config.authMode;
    if (m === 'password' || m === 'google' || m === 'verified-link' || m === 'directory') return m;
    if (dbConfigured()) return 'verified-link';
    if (googleConfigured()) return 'google';
    return 'directory';
  }
  function modeVerifiedLink() { return mode() === 'verified-link'; }
  function modeGoogle() { return mode() === 'google'; }
  function modePassword() { return mode() === 'password'; }
  function redirectUrl() { return location.origin + location.pathname; }

  function signIn(personId) {
    WP.logEvent({ type: 'sign-in', by: personId, target: personId });
    WP._login = null; WP._denied = null;
    WP.setState({ authed: true, viewerId: personId, route: 'dashboard', selectedId: null });
  }
  function signOut() {
    WP.logEvent({ type: 'sign-out', by: WP.state.viewerId, target: WP.state.viewerId });
    WP._login = null;
    try { if (WP._sb && WP._sb.auth) WP._sb.auth.signOut(); } catch (e) {}
    WP.setState({ authed: false, selectedId: null });
  }

  /* ---- Signed-in Security helpers (Settings → My settings → Security) ------- */
  // Change password WHILE signed in = email the SAME secure reset link to the
  // user's own verified email. We never take the old password in the client
  // (world-class: password changes happen on Supabase's hosted flow). Returns a
  // promise resolving {ok} — neutral either way (anti-enumeration not needed here
  // since it's the authenticated user's own email, but we still fail safe).
  function requestPasswordChange() {
    return new Promise(function (resolve) {
      var v = WP.viewer && WP.viewer();
      var email = v && v.email ? String(v.email).toLowerCase() : '';
      if (!email) { resolve({ ok: false }); return; }
      // Use the ALREADY-live client (it exists whenever Supabase is configured and the
      // user is signed in). We do NOT trigger a CDN load from a settings button — if the
      // client isn't up, report offline immediately rather than hang on "Sending…".
      var sb = WP._sb;
      if (!sb || !sb.auth || !sb.auth.resetPasswordForEmail) { resolve({ ok: false, offline: true }); return; }
      try {
        sb.auth.resetPasswordForEmail(email, { redirectTo: redirectUrl() })
          .then(function () { WP.logEvent && WP.logEvent({ type: 'password-change-requested', by: WP.state.viewerId, target: WP.state.viewerId }); resolve({ ok: true }); })
          .catch(function () { resolve({ ok: false }); });
      } catch (e) { resolve({ ok: false }); }
    });
  }
  // Sign out of ALL devices/sessions (Supabase global scope), then end the local
  // session too. Falls back to a plain local sign-out if the client is offline.
  function signOutEverywhere() {
    return new Promise(function (resolve) {
      WP.logEvent && WP.logEvent({ type: 'sign-out-all', by: WP.state.viewerId, target: WP.state.viewerId });
      function finish() { WP._login = null; WP.setState({ authed: false, selectedId: null }); resolve({ ok: true }); }
      var sb = WP._sb;   // use the live client; always end the LOCAL session regardless
      if (!sb || !sb.auth || !sb.auth.signOut) { finish(); return; }
      try {
        var p = sb.auth.signOut({ scope: 'global' });
        if (p && p.then) p.then(finish).catch(finish); else finish();
      } catch (e) { finish(); }
    });
  }
  // Best-effort last sign-in time from the live session (honest null if unknown).
  function lastSignInAt() {
    try {
      var u = WP._session && WP._session.user ? WP._session.user : null;
      return (u && (u.last_sign_in_at || (u.user_metadata && u.user_metadata.last_sign_in_at))) || null;
    } catch (e) { return null; }
  }

  function rerender() { const v = document.getElementById('view'); if (v && !WP.state.authed) render(v); }

  /* ---------- Supabase client (verified sign-in link) ---------- */
  function sbClient(cb) {
    if (WP._sb) { cb(WP._sb); return; }
    function make() {
      try {
        WP._sb = window.supabase.createClient(WP.config.supabaseUrl, WP.config.supabaseAnonKey, {
          auth: { persistSession: true, detectSessionInUrl: true, autoRefreshToken: true }
        });
        cb(WP._sb);
      } catch (e) { cb(null); }
    }
    if (window.supabase && window.supabase.createClient) { make(); return; }
    if (!document.getElementById('sb-script')) {
      const s = document.createElement('script');
      s.id = 'sb-script';
      s.src = 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2';
      s.onload = make; s.onerror = function () { cb(null); };
      document.head.appendChild(s);
    } else {
      let n = 0; const iv = setInterval(function () {
        if ((window.supabase && window.supabase.createClient) || ++n > 40) { clearInterval(iv); make(); }
      }, 150);
    }
  }

  // Which provider authenticated this session? Supabase records it on the user:
  // 'email' for password/OTP-link, 'google' (etc.) for OAuth. Fail closed to '' .
  function sessionProvider(session) {
    try {
      var u = session && session.user;
      if (!u) return '';
      if (u.app_metadata && u.app_metadata.provider) return String(u.app_metadata.provider);
      // Fallback: identities[].provider if app_metadata is absent.
      if (Array.isArray(u.identities) && u.identities[0] && u.identities[0].provider) return String(u.identities[0].provider);
      return '';
    } catch (e) { return ''; }
  }

  // Does the session's provider satisfy the CONFIGURED auth mode? The mode is not
  // just which button we show — it is which credential we ACCEPT. We REJECT only a
  // provider we can positively identify as disallowed (fail-safe: an absent/unknown
  // provider is NOT rejected here — the email→person→hasAccess gate still applies).
  // Password + magic-link both surface as the 'email' provider in Supabase; OAuth
  // providers (google, azure, github, …) are anything that is not 'email'.
  function providerAllowedForMode(session) {
    var prov = sessionProvider(session);
    if (!prov) return true;                                  // unknown provider → defer to the identity gate
    if (modePassword() || modeVerifiedLink()) {
      // Email-credential modes: reject a KNOWN OAuth provider (this blocks the
      // "re-enter with Google" path). 'email' is the only accepted provider string.
      return prov === 'email';
    }
    return true;                                             // google/directory modes: no extra provider gate here
  }

  // Map a verified Supabase session to a Tempo account and sign in (or deny).
  function handleSession(session) {
    // Enforce the auth mode at the SESSION level: an OAuth (Google) session must
    // never sign a person in when the app is configured password-only. This is the
    // fix for "I can re-enter with Google" — a persisted Google session used to be
    // silently accepted here.
    if (!providerAllowedForMode(session)) { try { WP._sb.auth.signOut(); } catch (e) {} return; }
    const em = session && session.user && session.user.email ? String(session.user.email).toLowerCase() : '';
    const r = findByEmail(em);
    if (r.error || !r.person) { try { WP._sb.auth.signOut(); } catch (e) {} return; }
    if (!WP.access.hasAccess(r.person.id)) { WP._denied = r.person; WP._login = null; rerender(); try { WP._sb.auth.signOut(); } catch (e) {} return; }
    WP._session = session;   // keep the verified session (Security → last sign-in)
    signIn(r.person.id);
  }

  // Called on boot when verified mode is on: consumes the link's token from the
  // URL (detectSessionInUrl) and restores any persisted session ("stay signed in").
  function initSession() {
    // Create the Supabase client whenever Supabase is configured — WP.db (the data
    // layer) reads through WP._sb, so it must exist even when the AUTH provider is
    // the directory gate or Google. Only the verified-LINK email session wiring below
    // is auth-mode specific.
    if (!dbConfigured()) return;
    sbClient(function (sb) {
      if (!sb) return;
      // Password mode also restores a persisted session ("stay signed in") and
      // consumes a recovery/verify token from the URL — identity still comes ONLY
      // from the verified session email (handleSession), never a typed value.
      if (!modeVerifiedLink() && !modePassword()) return;   // client is up for WP.db; no session auth to wire
      try {
        sb.auth.onAuthStateChange(function (_evt, session) {
          // A reset/set-password link lands here as PASSWORD_RECOVERY: divert to the
          // set-new-password screen instead of signing in. Identity still comes ONLY
          // from the verified session email, and only AFTER the new password is set.
          if (_evt === 'PASSWORD_RECOVERY' && session) { WP._recovery = session; WP._login = { step: 'setpw', email: session.user && session.user.email ? session.user.email : '' }; rerender(); return; }
          if (session && !WP.state.authed) handleSession(session);
        });
        sb.auth.getSession().then(function (res) {
          const session = res && res.data ? res.data.session : null;
          if (session && !WP.state.authed) handleSession(session);
        }).catch(function () {});
      } catch (e) {}
    });
  }

  function sendLink(email) {
    WP._login = { step: 'sent', email: email, sending: true }; rerender();
    sbClient(function (sb) {
      if (!sb) { WP._login = { step: 'email', email: email, err: 'errSendCode' }; rerender(); return; }
      sb.auth.signInWithOtp({ email: email, options: { shouldCreateUser: true, emailRedirectTo: redirectUrl() } })
        .then(function (res) {
          if (res && res.error) { WP._login = { step: 'email', email: email, err: 'errSendCode' }; }
          else { WP._login = { step: 'sent', email: email, sent: true }; }
          rerender();
        })
        .catch(function () { WP._login = { step: 'email', email: email, err: 'errSendCode' }; rerender(); });
    });
  }

  /* ---------- Password sign-in (Supabase email + password) ----------
   * ANTI-IMPERSONATION: we send the typed email/password to Supabase, but the
   * identity we act on is ONLY session.user.email returned by the verified
   * session — never the string the user typed. So a session for email X can
   * never resolve to a different person Y, and there is no account picker. */
  function signInWithPassword(email, password) {
    WP._login = { step: 'password', email: email, signing: true }; rerender();
    sbClient(function (sb) {
      if (!sb) { WP._login = { step: 'password', email: email, err: 'errBadCreds' }; rerender(); return; }
      sb.auth.signInWithPassword({ email: email, password: password })
        .then(function (res) {
          var session = res && res.data ? res.data.session : null;
          // Wrong email OR wrong password → one generic message (don't reveal which).
          if ((res && res.error) || !session) {
            WP._login = { step: 'password', email: email, err: 'errBadCreds' }; rerender(); return;
          }
          // Identity = the VERIFIED session email, not the typed field.
          var em = session.user && session.user.email ? String(session.user.email).toLowerCase() : '';
          var r = findByEmail(em);
          if (r.error || !r.person) {
            try { sb.auth.signOut(); } catch (e) {}
            WP._login = { step: 'password', email: email, err: 'errNoAccount' }; rerender(); return;
          }
          if (!WP.access.hasAccess(r.person.id)) {
            try { sb.auth.signOut(); } catch (e) {}
            WP._denied = r.person; WP._login = null; rerender(); return;
          }
          signIn(r.person.id);
        })
        .catch(function () { WP._login = { step: 'password', email: email, err: 'errBadCreds' }; rerender(); });
    });
  }

  // Forgot / set password — emails a reset link. We never reveal whether the
  // account exists (anti-enumeration): always show the same confirmation.
  function resetPassword(email) {
    if (!email) { WP._login = { step: 'password', email: email, err: 'errNoAccount' }; rerender(); return; }
    WP._login = { step: 'password', email: email, resetting: true }; rerender();
    sbClient(function (sb) {
      if (!sb) { WP._login = { step: 'password', email: email, err: 'errBadCreds' }; rerender(); return; }
      function done() { WP._login = { step: 'password', email: email, resetSent: true }; rerender(); }
      try {
        sb.auth.resetPasswordForEmail(email, { redirectTo: redirectUrl() }).then(done).catch(done);
      } catch (e) { done(); }
    });
  }

  /* ---------- Set a new password (recovery-return) ----------
   * After a reset link, Supabase fires PASSWORD_RECOVERY and we show this screen.
   * Validate client-side (length + match), then updateUser({password}); on success
   * the verified session (its email is the ONLY identity) signs the person in via
   * handleSession — a recovery link can never sign you in as someone else. */
  function updateNewPassword(pw, pw2) {
    var email = (WP._login && WP._login.email) || '';
    if (!pw || String(pw).length < 8) { WP._login = { step: 'setpw', email: email, err: 'pwTooShort' }; rerender(); return; }
    if (pw !== pw2) { WP._login = { step: 'setpw', email: email, err: 'pwMismatch' }; rerender(); return; }
    WP._login = { step: 'setpw', email: email, saving: true }; rerender();
    sbClient(function (sb) {
      if (!sb) { WP._login = { step: 'setpw', email: email, err: 'errSetPw' }; rerender(); return; }
      function fail() { WP._login = { step: 'setpw', email: email, err: 'errSetPw' }; rerender(); }
      try {
        sb.auth.updateUser({ password: pw }).then(function (res) {
          if (res && res.error) { fail(); return; }
          WP._recovery = null;
          // Sign in from the VERIFIED session (identity = session email), never a typed value.
          sb.auth.getSession().then(function (r) {
            var session = r && r.data ? r.data.session : null;
            if (session) handleSession(session); else fail();
          }).catch(fail);
        }).catch(fail);
      } catch (e) { fail(); }
    });
  }

  /* ---------- Google Identity Services ---------- */
  function decodeJwt(tok) {
    try {
      const b = tok.split('.')[1].replace(/-/g, '+').replace(/_/g, '/');
      const json = decodeURIComponent(atob(b).split('').map(function (c) {
        return '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2);
      }).join(''));
      return JSON.parse(json);
    } catch (e) { return null; }
  }
  function onGoogleCredential(resp) {
    const claims = resp && resp.credential ? decodeJwt(resp.credential) : null;
    if (!claims) { WP._login = { step: 'email', err: 'errVerify' }; rerender(); return; }
    const em = String(claims.email || '').toLowerCase();
    if (String(claims.hd || '').toLowerCase() !== DOMAIN && em.slice(-('@' + DOMAIN).length) !== '@' + DOMAIN) {
      WP._login = { step: 'email', err: 'errBadDomain' }; rerender(); return;
    }
    const r = findByEmail(em);
    if (r.error) { WP._login = { step: 'email', email: em, err: r.error }; rerender(); return; }
    if (!WP.access.hasAccess(r.person.id)) { WP._denied = r.person; WP._login = null; rerender(); return; }
    signIn(r.person.id);
  }
  function initGoogle(root) {
    if (!modeGoogle()) return;
    function setup() {
      try {
        if (!(window.google && window.google.accounts && window.google.accounts.id)) return;
        window.google.accounts.id.initialize({ client_id: WP.config.googleClientId, callback: onGoogleCredential, hd: DOMAIN });
        const host = root.querySelector('#g-btn-host');
        // Fit the button to the card so it never overflows on narrow phones
        // (Google clamps the width to 200–400).
        if (host) {
          var w = Math.max(200, Math.min(400, host.clientWidth || 320));
          window.google.accounts.id.renderButton(host, { theme: 'outline', size: 'large', width: w, text: 'continue_with' });
        }
      } catch (e) {}
    }
    if (window.google && window.google.accounts && window.google.accounts.id) { setup(); return; }
    if (!document.getElementById('gis-script')) {
      const s = document.createElement('script');
      s.id = 'gis-script'; s.src = 'https://accounts.google.com/gsi/client'; s.async = true; s.defer = true;
      s.onload = setup; document.head.appendChild(s);
    } else {
      let n = 0; const iv = setInterval(function () { if ((window.google && window.google.accounts && window.google.accounts.id) || ++n > 30) { clearInterval(iv); setup(); } }, 200);
    }
  }

  /* ---------- Render ---------- */
  function render(root) {
    const t = WP.i18n.t;
    const logo = 'src/assets/' + (WP.state.theme === 'dark' ? 'wbk-white.svg' : 'wbk-pink.svg');
    const st = WP._login || {};
    let body;

    if (WP._denied) {
      const d = WP._denied;
      body =
        '<div class="g-denied"><div class="g-denied-ic">' + WP.ui.icon('lock', 22) + '</div>' +
          '<div class="g-denied-h">' + t('accessDenied') + '</div>' +
          '<div class="g-denied-sub">' + ui.esc(emailOf(d)) + ' — ' + t('accessDeniedSub') + '</div>' +
          '<button class="g-back" id="g-denied-back">' + t('useAnother') + '</button></div>';
    } else if (st.step === 'setpw') {
      body =
        '<div class="g-denied-h">' + t('setPwTitle') + '</div>' +
        '<p class="login-sub">' + t('setPwSub') + (st.email ? ' <strong>' + ui.esc(st.email) + '</strong>' : '') + '</p>' +
        '<form id="setpw-form" class="login-row" style="flex-direction:column;align-items:stretch;">' +
          '<label class="login-lbl" for="setpw-new">' + t('newPasswordLabel') + '</label>' +
          '<input id="setpw-new" class="login-input" type="password" autocomplete="new-password" placeholder="' + t('newPasswordPh') + '" aria-label="' + t('newPasswordLabel') + '" />' +
          '<label class="login-lbl" for="setpw-confirm">' + t('confirmPasswordLabel') + '</label>' +
          '<input id="setpw-confirm" class="login-input" type="password" autocomplete="new-password" placeholder="' + t('confirmPasswordPh') + '" aria-label="' + t('confirmPasswordLabel') + '" />' +
          '<button class="btn primary" type="submit" ' + (st.saving ? 'disabled' : '') + '>' + (st.saving ? t('verifying') : t('setPwBtn')) + '</button>' +
        '</form>' +
        '<div class="login-err">' + (st.err ? t(st.err) : '') + '</div>' +
        '<div class="login-note">' + WP.ui.icon('lock', 13) + ' ' + t('setPwNote') + '</div>';
    } else if (st.step === 'sent') {
      body =
        '<div class="login-codeto">' + WP.ui.icon('mail', 15) + ' ' + t('linkSentTo') + ' <strong>' + ui.esc(st.email) + '</strong></div>' +
        '<p class="login-sub">' + t('openLinkHint') + '</p>' +
        '<div class="login-err">' + (st.err ? t(st.err) : '') + '</div>' +
        '<div class="login-actions">' +
          '<button class="linkbtn" id="resend-link" ' + (st.sending ? 'disabled' : '') + '>' + (st.sending ? t('sendingCode') : t('resendLink')) + '</button>' +
          '<span class="login-dot">·</span>' +
          '<button class="linkbtn" id="change-email">' + t('changeEmail') + '</button>' +
        '</div>';
    } else if (modePassword()) {
      const resetMsg = st.resetSent ? '<div class="login-note">' + WP.ui.icon('mail', 13) + ' ' + t('resetSent') + '</div>' : '';
      body =
        '<label class="login-lbl" for="login-email">' + t('emailLabel') + '</label>' +
        '<form id="login-form" class="login-row" style="flex-direction:column;align-items:stretch;">' +
          '<input id="login-email" class="login-input" type="email" inputmode="email" autocomplete="email" ' +
            'placeholder="' + t('emailPh') + '" value="' + ui.esc(st.email || '') + '" aria-label="' + t('emailLabel') + '" />' +
          '<input id="login-password" class="login-input" type="password" autocomplete="current-password" ' +
            'placeholder="' + t('passwordPh') + '" aria-label="' + t('passwordLabel') + '" />' +
          '<button class="btn primary" type="submit" ' + (st.signing ? 'disabled' : '') + '>' +
            (st.signing ? t('verifying') : t('signInBtn')) + '</button>' +
        '</form>' +
        '<div class="login-err">' + (st.err ? t(st.err) : '') + '</div>' +
        resetMsg +
        '<div class="login-actions">' +
          '<button class="linkbtn" id="forgot-pw" ' + (st.resetting ? 'disabled' : '') + '>' +
            (st.resetting ? t('sendingCode') : t('forgotPw')) + '</button>' +
        '</div>' +
        '<div class="login-note">' + WP.ui.icon('lock', 13) + ' ' + t('passwordNote') + '</div>';
    } else {
      const primaryLabel = modeVerifiedLink() ? t('sendLink') : t('continueBtn');
      let note;
      if (modeVerifiedLink()) note = '<div class="login-note">' + WP.ui.icon('lock', 13) + ' ' + t('verifiedNoteLink') + '</div>';
      else if (modeGoogle()) note = '<div class="login-divider">' + t('or') + '</div><div id="g-btn-host"></div>';
      else note = '<div class="login-note">' + WP.ui.icon('lock', 13) + ' ' + t('verifyNote') + '</div>';
      body =
        '<label class="login-lbl" for="login-email">' + t('emailLabel') + '</label>' +
        '<form id="login-form" class="login-row">' +
          '<input id="login-email" class="login-input" type="email" inputmode="email" autocomplete="email" ' +
            'placeholder="' + t('emailPh') + '" value="' + ui.esc(st.email || '') + '" aria-label="' + t('emailLabel') + '" />' +
          '<button class="btn primary" type="submit">' + primaryLabel + '</button>' +
        '</form>' +
        '<div class="login-err">' + (st.err ? t(st.err) : '') + '</div>' +
        note;
    }

    root.innerHTML =
      '<div class="login-wrap"><div class="login-card">' +
        '<img class="login-logo" src="' + logo + '" alt="webook.com" />' +
        '<h1 class="login-title">' + t('signInTitle') + '</h1>' +
        '<p class="login-sub">' + t('signInSub') + '</p>' +
        body +
      '</div>' +
      '<div class="login-controls">' +
        '<button class="btn" id="login-lang">' + t('lang') + '</button>' +
        '<button class="btn icon-btn" id="login-theme" aria-label="' + t('prefsTheme') + '" title="' + t('prefsTheme') + '">' +
          WP.ui.icon(WP.state.theme === 'light' ? 'moon' : 'sun') + '</button>' +
      '</div></div>';

    const form = root.querySelector('#login-form');
    if (form) form.onsubmit = function (e) {
      e.preventDefault();
      if (modePassword()) {
        const em = String(root.querySelector('#login-email').value || '').trim().toLowerCase();
        const pwEl = root.querySelector('#login-password');
        signInWithPassword(em, pwEl ? pwEl.value : '');
        return;
      }
      const v = root.querySelector('#login-email').value;
      const r = findByEmail(v);
      if (r.error) { WP._login = { step: 'email', email: v, err: r.error }; render(root); return; }
      if (!WP.access.hasAccess(r.person.id)) { WP._denied = r.person; WP._login = null; render(root); return; }
      if (modeVerifiedLink()) { sendLink(r.person.email); }   // email a verified sign-in link
      else { signIn(r.person.id); }                            // Google pre-check / demo gate
    };
    const setpwForm = root.querySelector('#setpw-form');
    if (setpwForm) setpwForm.onsubmit = function (e) {
      e.preventDefault();
      var a = root.querySelector('#setpw-new'), b = root.querySelector('#setpw-confirm');
      updateNewPassword(a ? a.value : '', b ? b.value : '');
    };
    const forgot = root.querySelector('#forgot-pw');
    if (forgot) forgot.onclick = function () {
      const em = String(root.querySelector('#login-email').value || '').trim().toLowerCase();
      resetPassword(em);
    };
    const resend = root.querySelector('#resend-link');
    if (resend) resend.onclick = function () { sendLink(st.email); };
    const change = root.querySelector('#change-email');
    if (change) change.onclick = function () { WP._login = { step: 'email', email: st.email }; render(root); };
    const dback = root.querySelector('#g-denied-back');
    if (dback) dback.onclick = function () { WP._denied = null; WP._login = { step: 'email' }; render(root); };
    root.querySelector('#login-lang').onclick = function () { WP.setState({ lang: WP.state.lang === 'en' ? 'ar' : 'en' }); };
    root.querySelector('#login-theme').onclick = function () { WP.setState({ theme: WP.state.theme === 'light' ? 'dark' : 'light' }); };
    initGoogle(root);
  }

  WP.auth = {
    domain: DOMAIN, emailOf: emailOf, findByEmail: findByEmail,
    signIn: signIn, signOut: signOut,
    sendLink: sendLink, initSession: initSession, handleSession: handleSession,
    signInWithPassword: signInWithPassword, resetPassword: resetPassword, updateNewPassword: updateNewPassword,
    requestPasswordChange: requestPasswordChange, signOutEverywhere: signOutEverywhere, lastSignInAt: lastSignInAt,
    mode: mode
  };
  WP.ui.login = { render: render };
})(window.WP = window.WP || {});
