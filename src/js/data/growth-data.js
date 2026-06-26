/* ============================================================
 * Tempo — GROWTH / PERFORMANCE DATA  (the MOS backbone)
 * ------------------------------------------------------------
 * Separate from mock-data.js (the workload backbone). Same ids.
 *   workload → "can I load them more?"   growth → "are they developing / ready?"
 *
 * Best practice baked in (see docs/SKILLS-and-REVIEWS.md):
 *   - Skills on a 0–5 INDEPENDENCE ladder, tagged hard|soft, with
 *     a required level + quarter history (→ trend arrow).
 *   - EQ = 4 Goleman domains, DEVELOPMENT-ONLY (contested science).
 *   - Manager lens (execution) vs Director lens (impact/potential), distinct.
 *   - Quarterly review re-rates SAME skills + a SEPARATE reliability
 *     lane (attendance/conduct kept OUT of the skill score).
 *   All data mocked. Real source later = reviews + Slack + Notion.
 * ========================================================== */
(function (WP) {
  'use strict';

  const SKILL_LADDER = [
    { n: 0, en: 'None',         ar: 'لا يوجد' },
    { n: 1, en: 'Novice',       ar: 'مبتدئ' },
    { n: 2, en: 'Beginner',     ar: 'تحت إشراف' },
    { n: 3, en: 'Intermediate', ar: 'مستقل' },
    { n: 4, en: 'Advanced',     ar: 'متقدم' },
    { n: 5, en: 'Expert',       ar: 'خبير · يدرّب غيره' },
  ];

  const EQ_DOMAINS = [
    { key: 'selfAwareness',         en: 'Self-awareness',         ar: 'الوعي الذاتي' },
    { key: 'selfManagement',        en: 'Self-management',        ar: 'إدارة الذات' },
    { key: 'socialAwareness',       en: 'Social awareness',       ar: 'الوعي الاجتماعي' },
    { key: 'relationshipManagement',en: 'Relationship management',ar: 'إدارة العلاقات' },
  ];

  function s(name, type, level, required, hist) {
    return { name: name, type: type, level: level, required: required, history: hist };
  }

  const GROWTH = {
    p_osama: { // overloaded, handles Tier-1 well but stalled → flight risk
      skills: [
        s('On-site operations', 'hard', 5, 4, [4, 4, 5, 5]),
        s('Reporting',          'hard', 4, 3, [2, 3, 3, 4]),
        s('English',            'hard', 4, 4, [3, 3, 4, 4]),
        s('Problem solving',    'soft', 5, 4, [4, 4, 5, 5]),
        s('Boundaries / saying no', 'soft', 2, 4, [2, 2, 2, 2]),
      ],
      eq: { selfAwareness: 4, selfManagement: 3, socialAwareness: 4, relationshipManagement: 4 },
      managerNote: {
        strengths: ['Calm under pressure', 'Trusted on the biggest events'],
        growth: ['Protecting his own capacity', 'Delegating to juniors'],
        suggestion: 'Ready for more scope — but pull one event off him first; he is over-relied on.',
      },
      directorNote: { impact: 'Carries our hardest events without dropping the ball.', potential: 'High',
        suggestion: 'Promotion-track. Give him a junior to mentor so he stops being a single point of failure.' },
      quarterly: [{ q: 'Q2 2026', rating: 'Exceeds',
        summary: 'Delivered MDLBEAST + the international summit in parallel. Quality stayed high.',
        improved: ['Reporting (3→4)', 'On-site ops (sustained 5)'], focus: ['Boundaries', 'Delegation'],
        reliability: { attendance: 'No attendance concerns.', engagement: 'Very active in #daily-checkin; logs late on event nights.' } }],
    },
    p_talal: { // available, eager, never given Tier-1 → fairness / opportunity
      skills: [
        s('AV setup',      'hard', 4, 3, [3, 3, 4, 4]),
        s('Reporting',     'hard', 2, 3, [1, 2, 2, 2]),
        s('English',       'hard', 3, 3, [2, 2, 3, 3]),
        s('Fast learning', 'soft', 5, 3, [4, 4, 5, 5]),
        s('Ownership',     'soft', 3, 4, [2, 3, 3, 3]),
      ],
      eq: { selfAwareness: 4, selfManagement: 4, socialAwareness: 3, relationshipManagement: 3 },
      managerNote: { strengths: ['Learns fast', 'Volunteers for anything'], growth: ['Needs a bigger stage to prove ownership'],
        suggestion: 'Hungry and underused — give him the next Tier-2/Tier-3 solo to build a track record.' },
      directorNote: { impact: 'Reliable support so far; untested on big scope.', potential: 'Medium',
        suggestion: 'Has never been handed a Tier-1. Give him a shot before judging readiness — fairness check.' },
      quarterly: [{ q: 'Q2 2026', rating: 'Meets', summary: 'Solid support on the gala. Asked twice for more responsibility.',
        improved: ['AV setup (3→4)', 'English (2→3)'], focus: ['Lead something end-to-end', 'Reporting'],
        reliability: { attendance: 'Excellent — never a no-show.', engagement: 'Consistent daily check-ins.' } }],
    },
    p_akram: { // the user — strong operations manager
      skills: [
        s('Logistics',      'hard', 5, 4, [4, 4, 5, 5]),
        s('Budgeting',      'hard', 4, 4, [3, 4, 4, 4]),
        s('Reporting',      'hard', 5, 4, [4, 4, 5, 5]),
        s('Team leadership','soft', 4, 4, [3, 3, 4, 4]),
        s('Delegation',     'soft', 3, 4, [2, 3, 3, 3]),
      ],
      eq: { selfAwareness: 4, selfManagement: 4, socialAwareness: 4, relationshipManagement: 4 },
      managerNote: { strengths: ['Runs a tight operation', 'Builds systems'], growth: ['Delegating more to the team'],
        suggestion: 'Give him a stretch project that forces delegation.' },
      directorNote: { impact: 'Reliable manager; his team is the most organized.', potential: 'High',
        suggestion: 'Successor-track for the senior role; develop people-leadership breadth.' },
      quarterly: [{ q: 'Q2 2026', rating: 'Exceeds', summary: 'Ran festival staffing + expo cleanly while building the workload view.',
        improved: ['Reporting (4→5)'], focus: ['Delegation'],
        reliability: { attendance: 'No concerns.', engagement: 'Active.' } }],
    },
    p_motaa: {
      skills: [
        s('Ticketing systems', 'hard', 5, 4, [4, 5, 5, 5]),
        s('Crisis handling',   'hard', 5, 4, [4, 5, 5, 5]),
        s('Cross-team coord.', 'soft', 5, 4, [4, 4, 5, 5]),
        s('Documentation',     'hard', 3, 4, [2, 2, 3, 3]),
        s('English',           'hard', 5, 4, [5, 5, 5, 5]),
      ],
      eq: { selfAwareness: 5, selfManagement: 4, socialAwareness: 5, relationshipManagement: 5 },
      managerNote: { strengths: ['Steadies the whole team'], growth: ['Writing things down'], suggestion: 'Lean on him to mentor the leads.' },
      directorNote: { impact: 'Backbone of ticketing & operations.', potential: 'High', suggestion: 'Successor candidate; needs documentation discipline.' },
      quarterly: [{ q: 'Q2 2026', rating: 'Exceeds', summary: 'Held Riyadh Season ticketing through two vendor failures.',
        improved: ['Documentation (2→3)'], focus: ['Delegation'], reliability: { attendance: 'No concerns.', engagement: 'Active.' } }],
    },
    p_khaled: {
      skills: [
        s('Client relations', 'soft', 5, 4, [4, 5, 5, 5]),
        s('On-site operations','hard', 4, 4, [3, 4, 4, 4]),
        s('Reporting',        'hard', 3, 3, [2, 3, 3, 3]),
        s('Scaling teams',    'soft', 2, 4, [2, 2, 2, 2]),
      ],
      eq: { selfAwareness: 4, selfManagement: 4, socialAwareness: 4, relationshipManagement: 5 },
      managerNote: { strengths: ['Trusted lead', 'Clients love him'], growth: ['Growing his small team'],
        suggestion: 'Give him a second report to stretch leadership.' },
      directorNote: { impact: 'Dependable lead with one report.', potential: 'Medium', suggestion: 'Formalize his lead role if he scales the team.' },
      quarterly: [{ q: 'Q2 2026', rating: 'Meets', summary: 'Flawless corporate gala with Ibrahim.', improved: [], focus: ['Scaling teams'],
        reliability: { attendance: 'No concerns.', engagement: 'Active.' } }],
    },
    p_abdulrahman: {
      skills: [
        s('Planning',          'hard', 4, 4, [3, 4, 4, 4]),
        s('Stakeholder comms', 'soft', 4, 4, [3, 4, 4, 4]),
        s('English',           'hard', 4, 4, [4, 4, 4, 4]),
        s('Delegation',        'soft', 3, 4, [2, 2, 3, 3]),
      ],
      eq: { selfAwareness: 4, selfManagement: 4, socialAwareness: 4, relationshipManagement: 4 },
      managerNote: { strengths: ['Organized planner', 'Mentors his two specialists'], growth: ['Delegation depth'],
        suggestion: 'Stretch him with a Tier-1 co-lead.' },
      directorNote: { impact: 'Strong senior specialist leading two people.', potential: 'High', suggestion: 'Manager-track with more team scope.' },
      quarterly: [{ q: 'Q2 2026', rating: 'Meets', summary: 'Strong summit + school-fair planning; good with Shamma & Talal.',
        improved: ['Delegation (2→3)'], focus: ['Tier-1 ownership'], reliability: { attendance: 'No concerns.', engagement: 'Active.' } }],
    },
    p_idris: { // new hire, ramping
      skills: [
        s('Vendor coordination', 'hard', 2, 3, [null, null, null, 2]),
        s('Reporting',           'hard', 1, 3, [null, null, null, 1]),
        s('Communication',       'soft', 3, 3, [null, null, null, 3]),
      ],
      eq: { selfAwareness: 3, selfManagement: 3, socialAwareness: 3, relationshipManagement: 3 },
      managerNote: { strengths: ['Eager', 'Picks things up quickly'], growth: ['Still ramping — everything is new'],
        suggestion: 'New hire (joined May). Keep load light; pair with a senior this quarter.' },
      directorNote: { impact: 'Too early to tell.', potential: 'Medium', suggestion: 'Protect ramp-up; revisit next quarter.' },
      quarterly: [{ q: 'Q2 2026', rating: 'Developing', summary: 'Onboarding; shadowing the festival team.', improved: [], focus: ['Learn the tools', 'Reporting'],
        reliability: { attendance: 'No concerns.', engagement: 'Building the daily-checkin habit.' } }],
    },
    p_gamal: {
      skills: [
        s('Ground operations', 'hard', 4, 3, [3, 3, 4, 4]),
        s('Vendor coordination','hard', 4, 3, [3, 4, 4, 4]),
        s('Reporting',         'hard', 3, 3, [2, 3, 3, 3]),
        s('Ownership',         'soft', 4, 4, [3, 3, 4, 4]),
      ],
      eq: { selfAwareness: 4, selfManagement: 4, socialAwareness: 4, relationshipManagement: 4 },
      managerNote: { strengths: ['Strong on the ground', 'Owns his lane'], growth: ['Ready for a Tier-1 lead role'],
        suggestion: 'Solid — next step is co-leading a bigger event.' },
      directorNote: { impact: 'Dependable festival operator.', potential: 'Medium', suggestion: 'Give him a Tier-1 stretch.' },
      quarterly: [{ q: 'Q2 2026', rating: 'Meets', summary: 'Clean festival ground ops + marathon logistics.', improved: ['Vendor coordination (3→4)'],
        focus: ['Tier-1 leadership'], reliability: { attendance: 'No concerns.', engagement: 'Active.' } }],
    },
    p_shamma: {
      skills: [
        s('Coordination',  'hard', 3, 3, [2, 3, 3, 3]),
        s('English',       'hard', 4, 3, [3, 4, 4, 4]),
        s('Communication', 'soft', 4, 4, [3, 4, 4, 4]),
        s('Ownership',     'soft', 3, 4, [2, 3, 3, 3]),
      ],
      eq: { selfAwareness: 4, selfManagement: 4, socialAwareness: 4, relationshipManagement: 4 },
      managerNote: { strengths: ['Detail-oriented', 'Great communicator'], growth: ['Take on bigger scope'],
        suggestion: 'Ready for a larger event than the school fair.' },
      directorNote: { impact: 'Reliable specialist.', potential: 'Medium', suggestion: 'Give a Tier-2 to grow.' },
      quarterly: [{ q: 'Q2 2026', rating: 'Meets', summary: 'Solid school-fair coordination.', improved: ['English (3→4)'], focus: ['Bigger scope'],
        reliability: { attendance: 'No concerns.', engagement: 'Active.' } }],
    },
    p_ibrahim: {
      skills: [
        s('AV / setup',   'hard', 3, 3, [2, 3, 3, 3]),
        s('Reporting',    'hard', 2, 3, [1, 2, 2, 2]),
        s('Communication','soft', 3, 3, [2, 3, 3, 3]),
      ],
      eq: { selfAwareness: 3, selfManagement: 4, socialAwareness: 3, relationshipManagement: 3 },
      managerNote: { strengths: ['Dependable support'], growth: ['Reporting', 'Confidence to lead'], suggestion: 'Keep building fundamentals under Khaled.' },
      directorNote: { impact: 'Steady support specialist.', potential: 'Medium', suggestion: 'Develop reporting; revisit next quarter.' },
      quarterly: [{ q: 'Q2 2026', rating: 'Meets', summary: 'Good gala support.', improved: ['AV (2→3)'], focus: ['Reporting'],
        reliability: { attendance: 'No concerns.', engagement: 'Active.' } }],
    },
    p_ahmed: {
      skills: [
        s('Stakeholder mgmt', 'soft', 5, 5, [5, 5, 5, 5]),
        s('Vendor negotiation','hard', 5, 5, [5, 5, 5, 5]),
        s('Delegation',       'soft', 4, 5, [3, 4, 4, 4]),
      ],
      eq: { selfAwareness: 5, selfManagement: 5, socialAwareness: 5, relationshipManagement: 5 },
      managerNote: { strengths: ['Owns the C-level relationship'], growth: ['Delegation'], suggestion: '—' },
      directorNote: { impact: 'Sets department direction.', potential: 'High', suggestion: '—' },
      quarterly: [{ q: 'Q2 2026', rating: 'Exceeds', summary: 'Department-level leadership.', improved: [], focus: ['Delegation'],
        reliability: { attendance: '—', engagement: '—' } }],
    },
  };

  /* ---- Working style / "how to manage this person" ----
   * Based on Situational Leadership (Hersey-Blanchard / Blanchard SLII):
   * a development STAGE per person → the right manager response. This is
   * explicitly TASK-SPECIFIC and temporary (a stage to grow out of), NOT a
   * permanent label. `followUp` is the "needs chasing" flag the manager asked for. */
  const WORK_STAGES = {
    self_directed:   { en: 'Self-directed',               ar: 'مستقل',
      doEn: 'Delegate — give ownership, stay out of the way.',          doAr: 'فوّضه — أعطه الملكية وابتعد.' },
    capable:         { en: 'Capable but cautious',        ar: 'قادر لكن متردد',
      doEn: 'Support — listen, encourage, hand over the decision.',     doAr: 'ادعمه — استمع، شجّع، وسلّمه القرار.' },
    developing:      { en: 'Developing',                  ar: 'في طور النمو',
      doEn: 'Coach — direction plus lots of feedback and encouragement.',doAr: 'درّبه — توجيه مع تغذية راجعة وتشجيع.' },
    needs_direction: { en: 'Needs direction & follow-up', ar: 'يحتاج توجيهاً ومتابعة',
      doEn: 'Direct — clear steps and frequent check-ins until confident.',doAr: 'وجّهه — خطوات واضحة ومتابعة متكررة حتى يثق بنفسه.' },
  };

  const WORK_STYLE = {
    p_osama:       { stage: 'self_directed',   followUp: false, note: 'Owns the biggest events; the risk is over-reliance, not direction.' },
    p_talal:       { stage: 'capable',         followUp: false, note: 'Can do more than he is given — hand him a real decision to prove it.' },
    p_akram:       { stage: 'self_directed',   followUp: false, note: 'Runs his unit independently.' },
    p_motaa:       { stage: 'self_directed',   followUp: false, note: 'Senior, fully autonomous.' },
    p_khaled:      { stage: 'capable',         followUp: false, note: 'Solid lead; encourage him to make the call without checking first.' },
    p_abdulrahman: { stage: 'self_directed',   followUp: false, note: 'Leads two people well.' },
    p_idris:       { stage: 'needs_direction', followUp: true,  note: 'New hire — needs clear steps and frequent follow-up while ramping.' },
    p_gamal:       { stage: 'developing',      followUp: false, note: 'Growing fast; coach him toward leading a Tier-1.' },
    p_shamma:      { stage: 'developing',      followUp: false, note: 'Reliable on defined tasks; coach toward bigger scope.' },
    p_ibrahim:     { stage: 'needs_direction', followUp: true,  note: 'Does well when tasks are spelled out; check in regularly for now.' },
    p_ahmed:       { stage: 'self_directed',   followUp: false, note: 'Sets direction for the department.' },
  };
  Object.keys(WORK_STYLE).forEach(function (id) { if (GROWTH[id]) GROWTH[id].workStyle = WORK_STYLE[id]; });

  WP.data.SKILL_LADDER = SKILL_LADDER;
  WP.data.EQ_DOMAINS = EQ_DOMAINS;
  WP.data.WORK_STAGES = WORK_STAGES;
  WP.data.GROWTH = GROWTH;
})(window.WP = window.WP || {});
