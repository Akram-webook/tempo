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
  if (WP.config.authMode === undefined)        WP.config.authMode = 'password';

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
   * Executive Status Deck link (reversible, one line).
   * ----------------------------------------------------------------
   * The live Executive Status Deck is a separate Google Slides artifact.
   * Paste its share link here once the deck is built. While this is an
   * empty string the "Executive status" entry points render NOTHING
   * (no broken link, no placeholder). When set, they appear ONLY to
   * Director + Admin (WP.can('viewSettings')) and open the deck in a
   * NEW TAB — never embedded (it is a Google-auth link).
   * Keep the deck shared to Director + Akram only.
   * -------------------------------------------------------------- */
  if (WP.config.execDeckUrl === undefined) WP.config.execDeckUrl = '';

  // True ⇒ the Executive-status entry points should render for this viewer.
  // Single source of truth for both the dashboard card and the nav item:
  // a non-empty deck URL AND the admin/director gate (same engine as Settings).
  WP.execDeckVisible = function () {
    return typeof WP.config.execDeckUrl === 'string' &&
      WP.config.execDeckUrl.trim() !== '' &&
      WP.can && WP.can('viewSettings');
  };

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
