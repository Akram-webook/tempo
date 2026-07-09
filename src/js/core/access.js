/* ============================================================
 * Tempo — Access Model
 * ------------------------------------------------------------
 * Locked decision:
 *   employee  → only their own page
 *   manager   → their team (their reports, recursively)
 *   director  → everyone (macro view)
 *
 * The "View as" switcher in the UI swaps the viewer to demo this.
 * ========================================================== */
(function (WP) {
  'use strict';

  function byId(id) { return WP.data.PEOPLE.find(function (p) { return p.id === id; }); }

  function directReports(managerId) {
    return WP.data.PEOPLE.filter(function (p) { return p.managerId === managerId; });
  }

  /* All descendants (team) of a person, inclusive of self. */
  function teamOf(personId) {
    const result = [];
    const seen = {};
    (function walk(id) {
      if (seen[id]) return;
      seen[id] = true;
      const p = byId(id);
      if (p) result.push(p);
      directReports(id).forEach(function (c) { walk(c.id); });
    })(personId);
    return result;
  }

  /* People a given viewer is allowed to see. */
  function visiblePeople(viewer) {
    if (!viewer) return [];
    switch (viewer.level) {
      case 'admin':
      case 'director':
        return WP.data.PEOPLE.slice();
      case 'sr_manager':
      case 'manager':
        return teamOf(viewer.id);           // self + all reports
      default:
        return [viewer];                    // specialists: self only
    }
  }

  function canSee(viewer, targetId) {
    return visiblePeople(viewer).some(function (p) { return p.id === targetId; });
  }

  /* Can this viewer act (assign / message) vs view-only?  Open question
   * in handoff §10 — defaulted to: managers+ can act, specialists view-only. */
  function canAct(viewer) {
    return viewer && (viewer.level === 'admin' || viewer.level === 'director' || viewer.level === 'sr_manager' || viewer.level === 'manager');
  }

  /* Who can manage roles & permissions (the Super Admin screen). */
  function canManage(viewer) {
    return viewer && (viewer.superAdmin || viewer.level === 'admin' || viewer.level === 'director');
  }
  function isSuperAdmin(viewer) { return !!(viewer && (viewer.superAdmin || viewer.level === 'admin')); }

  /* Upward feedback about manager M is visible to people ABOVE M (skip-level
   * routing) + admin/C-level — NEVER to M or anyone below. So raters feel safe. */
  function canSeeUpward(viewer, managerId) {
    if (!viewer || viewer.id === managerId) return false;
    if (viewer.level === 'admin') return true;               // C-level / Super Admin
    return managerChainOf(managerId).indexOf(viewer.id) !== -1; // strictly above M
  }

  /* Compensation: only the budget authority (Director / Super Admin / HR). */
  function canSeeComp(viewer) {
    return viewer && (viewer.level === 'admin' || viewer.level === 'director');
  }

  /* Management chain above a person (direct manager first, up to the top). */
  function managerChainOf(personId) {
    const chain = [];
    let p = byId(personId);
    while (p && p.managerId) { chain.push(p.managerId); p = byId(p.managerId); }
    return chain;
  }

  /* The viewer's relationship to a target — used to explain access and to
   * gate sensitive fields. */
  function relationshipTo(viewer, targetId) {
    if (!viewer) return 'none';
    if (viewer.id === targetId) return 'self';
    const t = byId(targetId);
    if (t && t.managerId === viewer.id) return 'manager';        // direct manager
    if (viewer.level === 'director' || viewer.level === 'admin') return 'director'; // exec/HR/admin privilege
    if (managerChainOf(targetId).indexOf(viewer.id) !== -1) return 'senior'; // up the chain (skip-level)
    return 'none';
  }

  /* Field-level privacy: SENSITIVE data (growth areas, manager's notes,
   * EQ, retention-risk, promotion signal) is for the person's DIRECT manager,
   * the person's own development view, and the director/HR — NOT skip-level
   * managers or peers (least privilege + protects candor). Operational data
   * (load, availability, daily check-in) stays visible to anyone who can see
   * the person at all. */
  function canSeeSensitive(viewer, targetId) {
    const rel = relationshipTo(viewer, targetId);
    return rel === 'self' || rel === 'manager' || rel === 'director';
  }

  /* ---- Access allow-list (separate from role) ----
   * "Has this person been granted entry to the app at all?" Domain is enforced
   * separately (must be @webook.com). Default: current team is granted; an admin
   * can revoke/grant from the Permissions screen. NOTE: this is the APP-LEVEL gate
   * — on a public static host it deters but does not truly lock (see SECURITY.md);
   * the real lock is an edge gate (Cloudflare Access) or a server backend. */
  // ACCESS ALLOWLIST (2026-07 lockdown) — only these people may enter the app; everyone
  // else hits the "no access" screen. Add ids here (or via the admin access screen) as
  // people are onboarded. Fully reversible: widen the list or restore the old
  // "all non-tbc granted" line. Domain (@webook.com) + identity are still enforced separately.
  const ALLOWLIST = { p_akram: true, p_ahmed: true, p_farah: true, p_motaa: true };
  const GRANTED = {};
  WP.data.PEOPLE.forEach(function (p) { if (!p.tbc && ALLOWLIST[p.id]) GRANTED[p.id] = true; });
  function hasAccess(id) { return !!GRANTED[id]; }
  function grantAccess(id, on) {
    GRANTED[id] = !!on;
    WP.logEvent && WP.logEvent({ type: on ? 'access-grant' : 'access-revoke', by: WP.state.viewerId, target: id });
  }
  function listAccess() { return Object.keys(GRANTED).filter(function (id) { return GRANTED[id]; }); }
  // Restore an exact granted set (used by the persistence layer on reload).
  function setAccess(ids) {
    if (!Array.isArray(ids)) return;
    Object.keys(GRANTED).forEach(function (id) { GRANTED[id] = false; });
    ids.forEach(function (id) { GRANTED[id] = true; });
  }

  WP.access = { byId, directReports, teamOf, visiblePeople, canSee, canAct, canManage, isSuperAdmin,
                managerChainOf, relationshipTo, canSeeSensitive, canSeeUpward, canSeeComp,
                hasAccess: hasAccess, grantAccess: grantAccess, listAccess: listAccess, setAccess: setAccess };
})(window.WP = window.WP || {});
