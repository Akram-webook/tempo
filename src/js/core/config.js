/* ============================================================
 * Tempo — Runtime config (sign-in security)
 * ------------------------------------------------------------
 * Tempo supports three levels of sign-in. The strongest one that is
 * configured wins:
 *
 *  1. EMAIL CODE (recommended) — set supabaseUrl + supabaseAnonKey below.
 *     The user enters their @example.com email, gets a 6-digit code in their
 *     inbox, and types it back. The code goes to the REAL mailbox, so typing
 *     someone else's email gets you nowhere. These two values are PUBLIC by
 *     design (safe to ship in the page). See ACCESS-SETUP.md → "Email code".
 *
 *  2. GOOGLE — set googleClientId to a Google OAuth Web Client ID. Google
 *     proves the @example.com identity. See ACCESS-SETUP.md → "Google".
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
  // (registered @example.com email → straight in) but is NOT identity-proof:
  // anyone who types a known @example.com email gets in. Acceptable short-term for
  // an internal pilot on an obscure URL; flip back to 'google' the moment the
  // Client ID is wired.
  // PASSWORD-ONLY (Akram, Jul 2026): the ONLY way in is a Supabase email+password.
  // A leftover Google/OAuth session is rejected at the session level (handleSession
  // → providerAllowedForMode). Nobody signs in without a password set via the
  // invite/reset link. Reversible: change this one word back to 'google'/'directory'.
  // DIRECTORY (Akram, Jul 2026): unblock sign-in NOW — a registered @example.com
  // email goes straight in, no password, no external account needed. Not
  // identity-proof (anyone who types a known @example.com email gets in), fine as
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
  // Un-deferred: the advanced surfaces (Library, Weekly report, Wellbeing,
  // Fairness, Upward, Org, Eval prep/band/consistency, Timeline) are BACK so we
  // can work on them. They were only hidden, never removed - flipping this to
  // false returns nav entries, routes, and in-screen panels alike. Set to true
  // again to re-hide them for a lean go-live cut.
  if (WP.config.mvp === undefined) WP.config.mvp = false;

  // G1 go-live escape hatch: force the sample directory even when a generated
  // real-data.js is present (for demos / screenshots). Reversible; default off so
  // real data wins automatically once imported. See docs/ROADMAP-golive.md.
  if (WP.config.forceSampleData === undefined) WP.config.forceSampleData = false;

  // Sign-in email domain (login.js reads this). Demo default matches the fake
  // demo directory (@example.com). Go-live (G2) sets this to the real company
  // domain here - one line, no code change, reversible.
  if (WP.config.authDomain === undefined) WP.config.authDomain = 'example.com';

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

  // Durable planned-work backlog (data/delivery-backlog.json). SEPARATE from
  // exec-status.json because the CI 'exec-status update' job regenerates that
  // file from merged PRs and would wipe any hand-added planned items. The exec
  // page folds this file's planned items + wave plan counts into the timeline
  // and the honest wave % at render time. Missing/failed load = page still works.
  if (WP.config.deliveryBacklogData === undefined)
    WP.config.deliveryBacklogData = 'data/delivery-backlog.json';

  // Raw user feedback warehouse (data/feedback.json), committed by the Receive
  // Feedback Action. The Project delivery view folds its triaged items into the
  // same timeline + filters. Same relative-path rules as execStatusData.
  if (WP.config.feedbackData === undefined)
    WP.config.feedbackData = 'data/feedback.json';

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
   * Global Feedback widget — GitHub-warehouse transport (all reversible).
   * ----------------------------------------------------------------
   * A floating "Feedback" button on every authed page. Submit dispatches ONE
   * workflow_dispatch per comment to the Receive Feedback GitHub Action, which
   * appends the item to data/feedback.json (the warehouse; git history = audit
   * log) and commits it back; GitHub Pages then serves it at
   *   https://akram-webook.github.io/tempo/data/feedback.json
   * No Google, no Apps Script, no external service - GitHub only, matching the
   * exec-status warehouse.
   *
   *  - feedbackEndpoint : the workflow_dispatch API URL. Kept EMPTY by default;
   *    the value below in the comment is the target for when a SAFE transport
   *    exists. The dispatch payload is
   *      { ref:'main', inputs:{ note,type,priority,owner,area,context,url,submittedAt } }
   *    GitHub returns 204 on success. One dispatch per comment.
   *  - feedbackDispatchToken : the GitHub token used as `Authorization: Bearer`.
   *    ⚠ A raw PAT here would ship in the PUBLIC Pages bundle where anyone could
   *    read it - and an Actions:write PAT can cancel/rerun/delete runs and poison
   *    caches, so we do NOT hardcode one. EMPTY by default. Until BOTH endpoint
   *    and token are set, Submit shows "Not configured yet" (compose still works,
   *    nothing is lost). The safe way to fill this is a tiny server-side proxy
   *    that holds the token, not a token in the bundle.
   *  - feedbackKey : legacy (unused by the GitHub transport). Left empty.
   *  - aiPolishEndpoint : optional Suggest/Polish helper — a JSON fetch() POST
   *    {action:'suggest'|'polish', note, page} returning {text}. EMPTY ⇒ the AI
   *    buttons are hidden (never a dead affordance). AI never blocks Submit.
   *
   * Target endpoint (do NOT set live until a token-safe transport exists):
   *   'https://api.github.com/repos/akram-webook/tempo/actions/workflows/receive-feedback.yml/dispatches'
   * -------------------------------------------------------------- */
  if (WP.config.feedbackEndpoint === undefined) WP.config.feedbackEndpoint = '';
  if (WP.config.feedbackDispatchToken === undefined) WP.config.feedbackDispatchToken = '';
  if (WP.config.feedbackKey === undefined)      WP.config.feedbackKey = '';
  if (WP.config.aiPolishEndpoint === undefined) WP.config.aiPolishEndpoint = '';

  /* Feedback PROXY (G3 go-live, token-safe transport). When set, Submit + triage
   * POST { op, item } here WITHOUT any token - the Supabase Edge Function
   * (supabase/functions/feedback-proxy) holds the token and forwards to the
   * Receive Feedback Action. This is the SAFE way to enable live submit: no token
   * in the public bundle. Empty by default -> falls back to the (gated) direct-
   * dispatch path, which stays "Not configured" without a token. Set this to the
   * deployed function URL (https://<ref>.supabase.co/functions/v1/feedback-proxy)
   * to go live. See supabase/functions/feedback-proxy/README.md. */
  if (WP.config.feedbackProxyEndpoint === undefined) WP.config.feedbackProxyEndpoint = '';

  /* ----------------------------------------------------------------
   * LOCAL SYSTEM transport (tools/local-server.js).
   * ----------------------------------------------------------------
   * When Tempo runs on the local Node server (npm run local), feedback -
   * INCLUDING attached images - is POSTed here and written to real files on
   * disk (data/feedback.json + data/feedback-images/), then shown on Project
   * delivery exactly like the live path. This is the seam we later repoint at
   * a real server (Supabase) with no UI change.
   *
   * Auto-on when the page is served from localhost/127.0.0.1 (i.e. via the
   * local server); OFF for the static GitHub Pages build, which falls back to
   * the existing per-browser local save. Empty string ⇒ disabled.
   * -------------------------------------------------------------- */
  if (WP.config.feedbackLocalEndpoint === undefined) {
    var host = (typeof location !== 'undefined' && location.hostname) || '';
    var isLocal = host === 'localhost' || host === '127.0.0.1';
    WP.config.feedbackLocalEndpoint = isLocal ? '/api/feedback' : '';
  }

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
