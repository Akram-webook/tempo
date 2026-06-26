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
})(window.WP = window.WP || {});
