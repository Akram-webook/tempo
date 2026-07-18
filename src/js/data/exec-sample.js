/* ============================================================
 * Tempo - Executive / Project-delivery SAMPLE payload (demo)
 * ------------------------------------------------------------
 * The prototype has NO live backend (decision: sample-data + "Sample data"
 * badge is the honest demo; real data is a later Next.js job). The exec page
 * reads this baked payload when WP.config.execStatusEndpoint is empty, so the
 * page shows a correct, self-contained state with zero network calls.
 *
 * Shape matches what the old Apps Script endpoint returned:
 *   { ok, generatedAt, cover:{done,next,later,total,pct}, waves[], requests[], features[] }
 * requests[] drives both the timeline and the "What needs you" section.
 * ========================================================== */
(function (WP) {
  'use strict';
  WP.data = WP.data || {};
  WP.data.EXEC_SAMPLE = {
  "ok": true,
  "generatedAt": null,
  "cover": {
    "done": 8,
    "next": 2,
    "later": 1,
    "total": 11,
    "pct": 73
  },
  "waves": [
    {
      "wave": "Wave 1",
      "focus": "Operational visibility",
      "status": "Done",
      "inside": "Workload map, team-health dashboard, org tree",
      "why": "See who's overloaded at a glance",
      "needs": []
    },
    {
      "wave": "Wave 2",
      "focus": "Daily execution",
      "status": "Done",
      "inside": "Daily check-ins & tasks (from Slack)",
      "why": "Work captured every day",
      "needs": []
    },
    {
      "wave": "Wave 3",
      "focus": "Evidence & performance",
      "status": "Done",
      "inside": "Evaluations, self-assessment, 360, evidence timeline, fairness",
      "why": "Reviews backed by evidence, not memory",
      "needs": []
    },
    {
      "wave": "Security & Access",
      "focus": "Access & identity",
      "status": "Done / Planned",
      "inside": "Lockdown allow-list, 4-role permissions, password sign-in, email privacy",
      "why": "Only the right people; each sees only what their role allows",
      "needs": []
    },
    {
      "wave": "People & Workload UX",
      "focus": "Readability",
      "status": "Done",
      "inside": "Simpler tree (collapse-to-top), search, full-screen scroll",
      "why": "Cleaner and faster to read",
      "needs": []
    },
    {
      "wave": "Foundations & Quality",
      "focus": "Platform",
      "status": "Done",
      "inside": "WBK design system, dark/light + Arabic, automated tests/CI, reusable skills",
      "why": "Consistent, reliable, bilingual",
      "needs": []
    },
    {
      "wave": "Wave 4",
      "focus": "Decision intelligence",
      "status": "Next",
      "inside": "Suggested rating ranges, weekly leadership report",
      "why": "Better, fairer decisions",
      "needs": []
    },
    {
      "wave": "Go-live",
      "focus": "Real data",
      "status": "Next",
      "inside": "Real Supabase data, user invites, Cloudflare edge gate",
      "why": "Move from sample to real, truly locked",
      "needs": []
    },
    {
      "wave": "Wave 5",
      "focus": "Org intelligence",
      "status": "Later",
      "inside": "Development & promotion signals, exec dashboard",
      "why": "Talent & capacity foresight",
      "needs": []
    },
    {
      "wave": "Settings & Admin",
      "focus": "Simplify + access",
      "status": "Done",
      "inside": "Simpler My settings; Workspace = Members & Access; override log Super-Admin only",
      "why": "Cleaner app + tighter admin control",
      "needs": []
    },
    {
      "wave": "Executive Status Deck",
      "focus": "Next",
      "status": "",
      "inside": "0/1 PRs merged (wave:exec-status).",
      "why": "",
      "needs": []
    }
  ],
  "requests": [
    {
      "id": "1",
      "date": "2026-06-22T07:00:00.000Z",
      "area": "Org tree",
      "type": "Improvement",
      "note": "Example: make Freelance vs Full-time clearer on the cards",
      "priority": "Medium",
      "status": "Done",
      "owner": "Ahmed"
    },
    {
      "id": "2",
      "date": "2026-06-23T21:10:55.597Z",
      "area": "Org tree",
      "type": "Reqwest",
      "note": "Live · 00:10:07 remove this section",
      "priority": "Medium",
      "status": "Done",
      "owner": "Ahmed"
    },
    {
      "id": "3",
      "date": "2026-06-24T08:21:33.975Z",
      "area": "Events",
      "type": "",
      "note": "Stage A signage hard to read from the back — bump font size",
      "priority": "High",
      "status": "Done",
      "owner": "Ahmed"
    },
    {
      "id": "4",
      "date": "2026-06-24T10:11:29.982Z",
      "area": "Evaluations",
      "type": "",
      "note": "Create 4 quarters (Q1–Q4) for evaluation",
      "priority": "Medium",
      "status": "Working",
      "owner": "Ahmed"
    },
    {
      "id": "5",
      "date": "2026-06-24T10:11:35.580Z",
      "area": "Evaluations",
      "type": "",
      "note": "AI suggestion: recommend how to evaluate a person based on what they actually did/delivered",
      "priority": "Medium",
      "status": "Working",
      "owner": "Ahmed"
    },
    {
      "id": "6",
      "date": "2026-06-24T10:11:40.601Z",
      "area": "Evaluations",
      "type": "",
      "note": "Show a clear summary of an employee’s evaluation",
      "priority": "Medium",
      "status": "Working",
      "owner": "Ahmed"
    },
    {
      "id": "7",
      "date": "2026-06-24T10:11:41.906Z",
      "area": "Workload",
      "type": "",
      "note": "Workload view: must scroll twice before it actually scrolls — fix the scroll behavior",
      "priority": "High",
      "status": "Working",
      "owner": "Ahmed"
    },
    {
      "id": "8",
      "date": "2026-06-24T10:11:46.348Z",
      "area": "General",
      "type": "",
      "note": "Check the existing bugs across the app and fix them",
      "priority": "High",
      "status": "Working",
      "owner": "Ahmed"
    },
    {
      "id": "9",
      "date": "2026-06-24T10:11:51.265Z",
      "area": "Workload",
      "type": "",
      "note": "Remove the Freelance/Full-time pill section from the page; keep it only in the admin view",
      "priority": "Medium",
      "status": "Working",
      "owner": "Ahmed"
    },
    {
      "id": "10",
      "date": "2026-07-15T07:00:00.000Z",
      "area": "Executive Status",
      "type": "Improvement",
      "note": "Relabel Executive Status as PROJECT DELIVERY / build status (director-only, dev-facing) — not a workforce-ops employee feature; fix eyebrow/title so no employee mistakes it for a product page",
      "priority": "High",
      "status": "Done",
      "owner": "Akram"
    },
    {
      "id": "11",
      "date": "2026-07-15T07:00:00.000Z",
      "area": "Executive Status",
      "type": "New idea",
      "note": "Add a timeline / date filter (last week · this week · upcoming) — Now/Next/Later band + week navigator so the director sees what shipped when and what's coming; needs Shipped-date + Target-week columns on Waves/Features",
      "priority": "High",
      "status": "Done",
      "owner": "Akram"
    },
    {
      "id": "12",
      "date": "2026-07-15T07:00:00.000Z",
      "area": "Executive Status",
      "type": "Design",
      "note": "Colour/UX pass: red for 'Needs input' too alarming; violet for 'Later' unintuitive; 5-colour load; WCAG contrast on amber; never colour-alone (add icons+labels); dark-mode variants",
      "priority": "Medium",
      "status": "Done",
      "owner": "Akram"
    },
    {
      "id": "13",
      "date": "2026-07-15T07:00:00.000Z",
      "area": "Executive Status",
      "type": "Question",
      "note": "History of past status — nothing archived today (rebuild overwrites). Decide: weekly PDF snapshot to Drive + date history so 'last week' is viewable",
      "priority": "Medium",
      "status": "Done",
      "owner": "Akram"
    },
    {
      "id": "14",
      "date": "2026-07-15T07:00:00.000Z",
      "area": "Executive Status",
      "type": "Question",
      "note": "In-app page vs deck — keep the relabelled director-only page + timeline, or rely on the private deck only? Recommendation: keep relabelled page for the quick glance + deck as the board/PDF export",
      "priority": "Medium",
      "status": "Done",
      "owner": "Akram"
    }
  ],
  "features": [],
  "history": [
    { "date": "2026-07-11", "progress": 41 },
    { "date": "2026-07-12", "progress": 47 },
    { "date": "2026-07-14", "progress": 52 },
    { "date": "2026-07-15", "progress": 58 },
    { "date": "2026-07-16", "progress": 64 },
    { "date": "2026-07-17", "progress": 69 },
    { "date": "2026-07-18", "progress": 73 }
  ]
};
})(window.WP = window.WP || {});
