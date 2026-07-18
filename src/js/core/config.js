/* ============================================================
 * Tempo — Runtime config (sign-in security)
 * ------------------------------------------------------------
 * Tempo supports three levels of sign-in. The strongest one that is
 * configured wins:
 *
 *  1. EMAIL CODE (recommended) — set supabaseUrl + supabaseAnonKey below.
 *     The user enters their @webook.com email, gets a 6-digit code in their
 *     inbox, and types it back. The code goes to the REAL mailbox, so typing
 *     someone else's email gets you nowhere. These two values are PUBLIC by
 *     design (safe to ship in the page). See ACCESS-SETUP.md → "Email code".
 *
 *  2. GOOGLE — set googleClientId to a Google OAuth Web Client ID. Google
 *     proves the @webook.com identity. See ACCESS-SETUP.md → "Google".
 *
 *  3. DIRECTORY GATE (demo, default when nothing is set) — exact-email match
 *     only. Convenient for a trusted internal pilot, but NOT a real lock:
 *     anyone who types a registered email gets in.
 * ========================================================== */
(function (WP) {
  'use strict';
  WP.config = WP.config || {};
  // — Verified sign-in (Supabase). Project URL + publishable key (both public). —
  if (WP.config.supabaseUrl === undefined)     WP.config.supabaseUrl = 'https://ftkbjsxdrxtjdzcojnve.supabase.co';
  if (WP.config.supabaseAnonKey === undefined) WP.config.supabaseAnonKey = 'sb_publishable_0SzG8Od9htPYqlp9PSwYqQ_IvPjdYgt';
  // — Google sign-in (optional alternative). —
  if (WP.config.googleClientId === undefined)  WP.config.googleClientId = '';
  // — Auth provider selector (DECOUPLED from the Supabase DATA layer above). —
  // Supabase stays connected for WP.db (people/evaluations) no matter what this is;
  // this ONLY chooses how people sign IN.
  // Values: 'password' | 'google' | 'verified-link' | 'directory'.
  //
  // 'password' (strongest, identity-proof) — email + password via Supabase
  // signInWithPassword. The VERIFIED SESSION email is the only identity: there is
  // no account picker and no way to become another person by typing their email.
  // Requires Akram to enable Email+Password in Supabase Auth and invite the users.
  //
  // TEMPORARY STOPGAP — set to 'directory' to unblock everyone TODAY. Supabase's
  // built-in email sender is rate-limited ("Could not send the code"), so the
  // verified-LINK path locks people out. Google (PR #51) is the intended provider
  // but is blocked on the real OAuth Client ID. The directory gate is instant
  // (registered @webook.com email → straight in) but is NOT identity-proof:
  // anyone who types a known @webook.com email gets in. Acceptable short-term for
  // an internal pilot on an obscure URL; flip back to 'google' the moment the
  // Client ID is wired.
  // PASSWORD-ONLY (Akram, Jul 2026): the ONLY way in is a Supabase email+password.
  // A leftover Google/OAuth session is rejected at the session level (handleSession
  // → providerAllowedForMode). Nobody signs in without a password set via the
  // invite/reset link. Reversible: change this one word back to 'google'/'directory'.
  // DIRECTORY (Akram, Jul 2026): unblock sign-in NOW — a registered @webook.com
  // email goes straight in, no password, no external account needed. Not
  // identity-proof (anyone who types a known @webook.com email gets in), fine as
  // a short-term stopgap on an obscure URL. Flip back to 'password' once real
  // accounts exist.
  if (WP.config.authMode === undefined)        WP.config.authMode = 'directory';

  /* ----------------------------------------------------------------
   * MVP FLAG (reversible, one line) — what the org SEES in v1.
   * ----------------------------------------------------------------
   * Same idea as the theme cutover (WP.DEFAULT_THEME in state.js):
   * ONE constant flips the whole product. The advanced layer stays
   * fully merged and tested — only HIDDEN — so it is one line from
   * returning.
   *
   *   true  → lean v1: login, role dashboard + org/workload map,
   *           daily check-in, evaluations + evaluation, profile, me,
   *           permissions, settings. The deferred layer is hidden:
   *           nav entries removed, routes redirect home, and the
   *           in-screen advanced panels are not rendered.
   *   false → everything returns exactly as built (full nav, all
   *           routes, all panels). Nothing was deleted.
   *
   * ← flip to false to un-defer the advanced layer.
   *
   * NOTE: the append-only events store + Slack ingest keep running
   * under MVP so real evidence still ACCRUES quietly. The intel
   * VIEWS are hidden (compute-on-view ⇒ no cost), but the data keeps
   * building for when you un-defer.
   * -------------------------------------------------------------- */
  if (WP.config.mvp === undefined) WP.config.mvp = true;

  /* ----------------------------------------------------------------
   * Executive Status — live data endpoint + deck link (both reversible).
   * ----------------------------------------------------------------
   * The Executive Status is the "Tempo — Feedback (Live)" sheet, surfaced two
   * thin ways over ONE source of truth (the sheet) — neither stores data, so
   * neither can drift:
   *
   *  - IN-APP VIEW (native): reads a deployed Apps Script JSON endpoint (the
   *    same sheet the deck builds from) via JSONP and renders on-brand inside
   *    Tempo. Works for everyone with a Tempo role — no Google sign-in wall.
   *    See src/js/ui/exec.js. Empty string ⇒ the whole feature renders NOTHING.
   *
   *  - DECK (Google Slides): the board / PDF / present-mode artifact, reached
   *    by the "Open / present" button (new tab). Stays PRIVATE — we do NOT set
   *    it to "anyone with the link". It is NOT embedded (a private deck won't
   *    frame; it would show a sign-in box).
   *
   * Both entry points (nav item + dashboard card) show ONLY to Director + Admin
   * (WP.can('viewSettings')). Keep the deck + sheet shared to Director + Akram.
   * The endpoint URL is not a secret; it returns only status data.
   * -------------------------------------------------------------- */
  // GitHub warehouse: the Project-delivery page fetch()es this committed JSON
  // directly from GitHub Pages (no Google, no JSONP, no CORS). Relative path so
  // it works on Pages (/tempo/data/...) and from a local file:// build.
  if (WP.config.execStatusData === undefined)
    WP.config.execStatusData = 'data/exec-status.json';

  // The shareable report page (replaces Google Slides) - committed by the
  // workflow, served by Pages. The "Open full report" button links here.
  if (WP.config.execDeckUrl === undefined)
    WP.config.execDeckUrl = 'status.html';

  // True ⇒ the Project-delivery entry points render for this viewer. Data is
  // always fetchable (a committed repo file), so the ONLY gate is the
  // admin/director check - the empty state handles "no run yet" gracefully.
  WP.execDeckVisible = function () {
    return WP.can && WP.can('viewSettings');
  };

  /* ----------------------------------------------------------------
   * Notifications & Nudges (Phase 1: in-app notification center).
   * ----------------------------------------------------------------
   * A calm, work-based notification bell + inbox. Items are DERIVED from live
   * work data (Feedback "needs input", evaluation self-assessment due), never
   * from activity/presence. Reversible + dormant-safe: false ⇒ the bell renders
   * nothing; true but no items ⇒ "You're all caught up." (no nag). Phase 2
   * (Slack digest/nudge) reuses the SAME WP.notifications.buildItems() logic.
   * -------------------------------------------------------------- */
  if (WP.config.notificationsEnabled === undefined) WP.config.notificationsEnabled = true;

  /* ----------------------------------------------------------------
   * Global Feedback widget — endpoint + key + AI helper (all reversible).
   * ----------------------------------------------------------------
   * A floating "Feedback" button on every authed page. Submit sends a plain
   * fetch() FormData POST (one row per comment) to the "Feedback" tab endpoint.
   * FormData with no custom Content-Type means NO CORS preflight, so a normal
   * fetch() works cross-origin (no JSONP, no hidden-iframe form — that Google-
   * coupled transport was retired with the exec-status warehouse switch).
   *
   *  - feedbackEndpoint : write endpoint that accepts a FormData POST
   *    (key,submittedAt,owner,area,context,url,status,items=JSON) and writes one
   *    row per item, returning {ok:true,count:N}. EMPTY ⇒ the FAB STILL renders;
   *    Submit shows "Not configured yet" (compose is always available so nothing
   *    is lost while the endpoint is being wired).
   *  - feedbackKey      : shared key sent with the payload. It lives in the
   *    PUBLIC bundle, so it only deters CASUAL spam — the REAL protection is a
   *    server-side per-owner rate limit, which must also DEFAULT the priority
   *    (blank/Medium) for any caller it can't verify as a director.
   *  - aiPolishEndpoint : optional Suggest/Polish helper — a JSON fetch() POST
   *    {action:'suggest'|'polish', note, page} returning {text}. EMPTY ⇒ the AI
   *    buttons are hidden (never a dead affordance). AI never blocks Submit.
   *
   * The server side (write handler, columns, rate limit, deploy) is the
   * orchestrator's job; we build against these keys now. Set them post-deploy.
   * -------------------------------------------------------------- */
  if (WP.config.feedbackEndpoint === undefined) WP.config.feedbackEndpoint = '';
  if (WP.config.feedbackKey === undefined)      WP.config.feedbackKey = '';
  if (WP.config.aiPolishEndpoint === undefined) WP.config.aiPolishEndpoint = '';

  // The advanced surfaces deferred when mvp === true. These ids match
  // nav ids / route names AND in-screen panel keys, so a single helper
  // (WP.deferred) gates nav, routes, and panels alike.
  WP.MVP_DEFER = ['library', 'weekly', 'wellbeing', 'fairness', 'upward', 'org',
                  'evalPrep', 'evalBand', 'evalConsistency', 'devPanel', 'timeline'];

  // SINGLE GUARD HELPER — true ⇒ this surface is hidden in v1. When
  // mvp is false (un-deferred) it always returns false, so every
  // surface returns. Nothing is ever deleted — only gated.
  WP.deferred = function (id) {
    return !!WP.config.mvp && WP.MVP_DEFER.indexOf(id) >= 0;
  };
})(window.WP = window.WP || {});
