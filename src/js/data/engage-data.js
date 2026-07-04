/* ============================================================
 * Webook Workload — Engagement data (the "My Progress" dashboard)
 * ------------------------------------------------------------
 * Healthy engagement, NOT addiction-to-overwork. Built on:
 *  - Progress Principle (small daily wins) → "Done today" feed
 *  - Endowed progress (goal bar starts already partly full)
 *  - Gentle streaks WITH a freeze/forgiveness (no red shaming)
 *  - Recognition / kudos (the documented burnout-reducer)
 *  - Self-referenced growth (you vs your past) — never leaderboards.
 * All mocked for the demo.
 * ========================================================== */
(function (WP) {
  'use strict';

  // Habit science (Lally et al. 2010, UCL): a habit takes ~66 days on
  // average (range 18–254). The "21 days" figure is a myth, and missing
  // ONE day does not derail it — so streaks here are gentle, with freezes.
  const HABIT_DAYS = 66;
  const MILESTONES = [7, 14, 30, 66];

  const ENGAGE = {
    p_akram:  { streak: 9, freeze: 1, daysActive: 23, weekGoal: 8, weekDone: 6, level: 'Operator', levelNo: 4, levelPct: 70,
      doneToday: ['Locked MDLBEAST staffing grid', 'Approved crew budget'],
      kudos: [{ from: 'p_motaa', text: 'You saved the festival load-in 🙌' }] },
    p_osama:  { streak: 14, freeze: 2, daysActive: 40, weekGoal: 6, weekDone: 5, level: 'Specialist', levelNo: 3, levelPct: 85,
      doneToday: ['Two site visits (festival + summit)'],
      kudos: [{ from: 'p_akram', text: 'Carried two events at once — legend.' }] },
    p_talal:  { streak: 4, freeze: 2, daysActive: 10, weekGoal: 5, weekDone: 3, level: 'Specialist', levelNo: 2, levelPct: 40,
      doneToday: ['Helped set up the gala AV'],
      kudos: [{ from: 'p_abdulrahman', text: 'Always first to volunteer 👏' }] },
    p_idris:  { streak: 6, freeze: 2, daysActive: 12, weekGoal: 4, weekDone: 3, level: 'Rookie', levelNo: 1, levelPct: 55,
      doneToday: ['Finished signage checklist', 'Learned the booking tool'],
      kudos: [{ from: 'p_akram', text: 'Fastest-learning new hire we’ve had.' }] },
  };

  // For anyone without explicit data, derive a gentle default from their work.
  function get(personId) {
    // no-demo mode: no synthetic engagement. Return a neutral empty record so
    // the "My progress" view renders its honest empty states (no fake streak).
    if (WP.demo && !WP.demo()) {
      return { streak: 0, freeze: 0, daysActive: 0, weekGoal: 0, weekDone: 0,
        level: '—', levelNo: 0, levelPct: 0, doneToday: [], kudos: [] };
    }
    if (ENGAGE[personId]) return ENGAGE[personId];
    const p = WP.access.byId(personId);
    const done = (p && p.dailyCheckin && p.dailyCheckin.done && p.dailyCheckin.done !== '—') ? [p.dailyCheckin.done] : [];
    const wk = p ? (p.assignedEvents || []).length + done.length : 0;
    return { streak: 3, freeze: 2, daysActive: 3, weekGoal: Math.max(4, wk + 1), weekDone: wk,
      level: 'Specialist', levelNo: 1, levelPct: 30, doneToday: done, kudos: [] };
  }

  // next habit milestone above the current streak (or final)
  function nextMilestone(streak) {
    for (var i = 0; i < MILESTONES.length; i++) { if (MILESTONES[i] > streak) return MILESTONES[i]; }
    return null;
  }

  WP.data.ENGAGE = ENGAGE;
  WP.data.HABIT_DAYS = HABIT_DAYS;
  WP.data.MILESTONES = MILESTONES;
  // Persistence hooks — snapshot/restore stored records so check-ins survive a reload.
  function snapshot() { return ENGAGE; }
  function restore(o) { if (o) Object.keys(o).forEach(function (k) { ENGAGE[k] = o[k]; }); }
  WP.engage = { get: get, nextMilestone: nextMilestone, habitDays: HABIT_DAYS, snapshot: snapshot, restore: restore };
})(window.WP = window.WP || {});
