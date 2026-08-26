/* ============================================================
 * Tempo — CAREER FRAMEWORK + DEVELOPMENT DATA (Career Profile layer)
 * ------------------------------------------------------------
 * Feeds the Employee Intelligence / Career Profile view (WP.ui.career) via the
 * WP.career engine. It NEVER duplicates growth-data.js (skills / EQ / manager
 * lens / quarterly) — the engine composes from BOTH. This file adds only what
 * isn't already on record:
 *   LEVELS      — the career ladder (spec §10) with the "next level" edge. This is
 *                 a CONFIGURABLE org framework, not scraped from real HR data —
 *                 the view labels it as such. Do not treat as ground truth.
 *   NEXT_CAPS   — per CURRENT level, the capabilities required to reach the NEXT
 *                 level (spec §9/§10). Each cap resolves to real evidence at render
 *                 time (a skill in growth-data, or a signal from tenure/scope/reports);
 *                 an unmapped cap is honestly surfaced as "configurable · no evidence".
 *   REVIEW      — last/next review dates (spec §1). Global default + per-person.
 *   FEEDBACK    — DATED manager-feedback history (spec §7/§8). Additive to the
 *                 growth-data quarterly[] the engine also folds in. Never overwritten.
 *   DEV_PLAN    — development objectives with owner/due/status (spec §11). Explicit
 *                 for the story people; the engine PROPOSES the rest from live gaps
 *                 (marked "Proposed", never invented as done).
 *   TRAINING    — completed / in-progress / recommended (spec §13). Training is
 *                 EVIDENCE, never auto-converted to competency.
 *
 * All strings carry ar. Names of real reviewers are proper nouns from mock-data.
 * Constitution/INTELLIGENCE-ETHICS still bind: no per-person score/rank anywhere.
 * ========================================================== */
(function (WP) {
  'use strict';

  // Career ladder (bottom → top). `next` is the immediate promotion edge; `future`
  // is one further (for the 3-step career-path view). Configurable org framework.
  var LEVELS = {
    spec:       { order: 0, en: 'Specialist',        ar: 'أخصائي',        next: 'sr_spec' },
    sr_spec:    { order: 1, en: 'Senior Specialist', ar: 'أخصائي أول',    next: 'manager' },
    manager:    { order: 2, en: 'Manager',           ar: 'مدير',          next: 'sr_manager' },
    sr_manager: { order: 3, en: 'Senior Manager',    ar: 'مدير أول',      next: 'director' },
    director:   { order: 4, en: 'Director',          ar: 'مدير تنفيذي',   next: null }
  };

  // Required capabilities to move UP from each current level. `skill` = case-insensitive
  // alternation matched against a growth-data skill name; `signal` = a derived evidence
  // signal (ownership | delivery | mentoring | tenure | strategy). `why` explains why it
  // matters for the next level (spec §4). A cap with neither a matched skill nor a signal
  // renders as "configurable — evidence unavailable" (spec §14), never invented.
  var NEXT_CAPS = {
    spec: [
      { key: 'exec',        en: 'Event execution',        ar: 'تنفيذ الفعاليات',      skill: 'operation|execution|setup|coordination|ground|ticketing|av', why: { en: 'Core of the senior-specialist role.', ar: 'جوهر دور الأخصائي الأول.' } },
      { key: 'ownership',   en: 'Independent ownership',   ar: 'الملكية المستقلة',     signal: 'ownership', why: { en: 'Owning work end-to-end without hand-holding.', ar: 'تملّك العمل من البداية للنهاية دون إشراف مستمر.' } },
      { key: 'reporting',   en: 'Reporting',               ar: 'إعداد التقارير',       skill: 'reporting|documentation', why: { en: 'Senior specialists own their event reporting.', ar: 'الأخصائي الأول مسؤول عن تقارير فعالياته.' } },
      { key: 'comm',        en: 'Communication',           ar: 'التواصل',              skill: 'communication|english|comms|stakeholder', why: { en: 'Clear updates to leads and vendors.', ar: 'تحديثات واضحة للقادة والموردين.' } },
      { key: 'reliability', en: 'Reliability',             ar: 'الالتزام',             signal: 'tenure', why: { en: 'A sustained track record at level.', ar: 'سجل مستقر ومستمر في الدور.' } }
    ],
    sr_spec: [
      { key: 'independent', en: 'Independent ownership',   ar: 'الملكية المستقلة',     signal: 'ownership', why: { en: 'Managers carry scope without being carried.', ar: 'المدير يحمل النطاق دون أن يُحمَل.' } },
      { key: 'stakeholder', en: 'Stakeholder management',  ar: 'إدارة أصحاب المصلحة',  skill: 'stakeholder|client|relations|negotiation', why: { en: 'Managing clients and partners directly.', ar: 'إدارة العملاء والشركاء مباشرة.' } },
      { key: 'mentoring',   en: 'Mentoring / coaching',    ar: 'الإرشاد والتدريب',     signal: 'mentoring', why: { en: 'Growing juniors is a manager duty.', ar: 'تنمية المبتدئين من مهام المدير.' } },
      { key: 'workstream',  en: 'Leading a workstream',    ar: 'قيادة مسار عمل',       signal: 'delivery', why: { en: 'Leading a Tier-1/Tier-2 workstream solo.', ar: 'قيادة مسار عمل من الفئة ١/٢ منفرداً.' } },
      { key: 'planning',    en: 'Planning',                ar: 'التخطيط',              skill: 'planning|plan|logistics|budget', why: { en: 'Owning the plan, not just the tasks.', ar: 'تملّك الخطة لا المهام فقط.' } }
    ],
    manager: [
      { key: 'leadership',  en: 'Leadership',              ar: 'القيادة',              skill: 'leadership|team leadership', why: { en: 'Leading a team, not just a project.', ar: 'قيادة فريق لا مشروع فقط.' } },
      { key: 'delegation',  en: 'Delegation',              ar: 'التفويض',              skill: 'delegation', why: { en: 'Scaling through others, not doing it all.', ar: 'التوسّع عبر الآخرين لا بالعمل كله ذاتياً.' } },
      { key: 'strategy',    en: 'Strategic planning',      ar: 'التخطيط الاستراتيجي',  signal: 'strategy', why: { en: 'Planning a quarter ahead, not an event ahead.', ar: 'التخطيط لربع قادم لا لفعالية قادمة.' } },
      { key: 'crossteam',   en: 'Cross-team coordination', ar: 'التنسيق بين الفرق',    skill: 'cross-team|coordination|coord|crisis', why: { en: 'Aligning multiple teams to one plan.', ar: 'مواءمة عدة فرق على خطة واحدة.' } },
      { key: 'develop',     en: 'Developing people',       ar: 'تطوير الأفراد',        signal: 'mentoring', why: { en: 'Building the bench beneath you.', ar: 'بناء الصف الثاني تحتك.' } }
    ],
    sr_manager: [
      { key: 'deptstrategy', en: 'Department strategy',    ar: 'استراتيجية الإدارة',   signal: 'strategy', why: { en: 'Setting direction for the whole function.', ar: 'رسم اتجاه الوظيفة بأكملها.' } },
      { key: 'orglead',      en: 'Organisational leadership', ar: 'القيادة المؤسسية',  signal: 'mentoring', why: { en: 'Leading leaders, not individuals.', ar: 'قيادة القادة لا الأفراد.' } },
      { key: 'budget',       en: 'Budget ownership',       ar: 'ملكية الميزانية',      skill: 'budget|budgeting', why: { en: 'Owning a department budget line.', ar: 'تملّك بند ميزانية الإدارة.' } },
      { key: 'succession',   en: 'Building successors',    ar: 'إعداد الخلفاء',        signal: 'mentoring', why: { en: 'A director makes themselves replaceable.', ar: 'المدير التنفيذي يجعل نفسه قابلاً للاستبدال.' } }
    ],
    director: [] // top of this framework — further caps are configurable per org
  };

  // Review cadence (spec §1). Global default; per-person override where a real date exists.
  var REVIEW_DEFAULT = { last: '2026-06-30', next: '2026-09-30' };
  var REVIEW = {
    p_osama: { last: '2026-06-28', next: '2026-09-28' },
    p_akram: { last: '2026-06-30', next: '2026-09-30' },
    p_talal: { last: '2026-06-25', next: '2026-09-25' },
    p_idris: { last: '2026-07-15', next: '2026-10-15' } // new hire — first review later
  };

  // Dated manager-feedback history (spec §7/§8). ADDITIVE to growth-data quarterly[].
  // `by` is a person id (reviewer). type: 'review' | 'checkin' | 'note'. Never overwritten.
  function f(date, type, by, strengths, improvements, comment, actions) {
    return { date: date, type: type, by: by, strengths: strengths, improvements: improvements, comment: comment, actions: actions };
  }
  var FEEDBACK = {
    p_osama: [
      f('2026-06-28', 'review', 'p_akram',
        ['Calm under pressure on the biggest events', 'Highest-trust operator on the team'],
        ['Protecting his own capacity', 'Delegating to juniors instead of absorbing everything'],
        'Owen carried MDLBEAST and the summit in parallel without a quality drop. The risk is over-reliance — he is a single point of failure and needs to hand work down.',
        ['Pull one event off his plate this month', 'Pair a junior with him to mentor']),
      f('2026-04-10', 'checkin', 'p_akram',
        ['Reporting is visibly improving (3→4)'],
        ['Still says yes to everything'],
        'Good progress on reporting. We talked about boundaries — he agreed to flag when a third event lands on him.',
        ['Flag capacity before accepting a third overlapping event'])
    ],
    p_talal: [
      f('2026-06-25', 'review', 'p_abdulrahman',
        ['Learns fast', 'Volunteers for anything', 'Never a no-show'],
        ['Untested on larger scope — needs a real stage to prove ownership'],
        'Tyler is hungry and underused. He has asked twice for more responsibility. Fairness check: he has never been handed a Tier-1 — give him a shot before judging readiness.',
        ['Assign him the next Tier-2/Tier-3 solo end-to-end', 'Review ownership after one solo delivery'])
    ],
    p_akram: [
      f('2026-06-30', 'review', 'p_motaa',
        ['Runs a tight operation', 'Builds systems that outlast the event'],
        ['Delegating more to the team instead of building it himself'],
        'Adam ran festival staffing and the expo cleanly while building the workload view. Successor-track for the senior role — the one gap is people-leadership breadth.',
        ['Take a stretch project that forces delegation', 'Co-lead a Tier-1 with a junior shadowing'])
    ],
    p_khaled: [
      f('2026-06-30', 'review', 'p_motaa',
        ['Clients trust him', 'Flawless corporate gala'],
        ['Scaling a team — still operates as an individual with one report'],
        'Kevin is a dependable lead. To move up he needs to grow a small team rather than do it all himself.',
        ['Take a second report and delegate a full workstream to them'])
    ],
    p_gamal: [
      f('2026-06-30', 'review', 'p_akram',
        ['Strong on the ground', 'Owns his lane end-to-end'],
        ['Ready for a Tier-1 lead role — hasn\'t led one yet'],
        'Julian is a dependable festival operator. Next step is co-leading a bigger event to build a Tier-1 track record.',
        ['Co-lead a Tier-1 event next quarter'])
    ]
  };

  // Explicit development plan objectives (spec §11) for the story people. The engine
  // PROPOSES objectives for everyone else from their live gaps (status 'Proposed').
  // status: 'inprogress' | 'planned' | 'done' | 'proposed'. owner: 'employee' | 'manager' | 'both'.
  function d(skillKey, title, titleAr, action, actionAr, owner, due, status, progress) {
    return { skillKey: skillKey, title: title, titleAr: titleAr, action: action, actionAr: actionAr, owner: owner, due: due, status: status, progress: progress };
  }
  var DEV_PLAN = {
    p_osama: [
      d('boundaries', 'Boundaries / capacity', 'الحدود والطاقة', 'Flag capacity before a third overlapping event; hand one event to a junior.', 'أبلغ عن طاقتك قبل الفعالية الثالثة المتداخلة، وسلّم فعالية لمبتدئ.', 'both', '2026-10-31', 'inprogress', 40),
      d('mentoring', 'Mentoring', 'الإرشاد', 'Mentor one junior on a live event this quarter.', 'أرشد مبتدئاً واحداً في فعالية مباشرة هذا الربع.', 'employee', '2026-11-30', 'planned', 0)
    ],
    p_akram: [
      d('delegation', 'Delegation', 'التفويض', 'Co-lead a Tier-1 with a junior owning a full workstream.', 'شارك في قيادة فعالية من الفئة ١ مع تولّي مبتدئ لمسار عمل كامل.', 'both', '2026-10-31', 'inprogress', 55)
    ],
    p_talal: [
      d('ownership', 'Independent ownership', 'الملكية المستقلة', 'Own the next Tier-2 event solo, end-to-end.', 'تولَّ الفعالية القادمة من الفئة ٢ منفرداً من البداية للنهاية.', 'both', '2026-11-15', 'planned', 0),
      d('reporting', 'Reporting', 'إعداد التقارير', 'Produce the post-event report for that event unaided.', 'أنتج تقرير ما بعد الفعالية لتلك الفعالية دون مساعدة.', 'employee', '2026-11-30', 'planned', 0)
    ],
    p_khaled: [
      d('scaling', 'Scaling a team', 'قيادة فريق', 'Take a second report and delegate a workstream to them.', 'استلم تقريراً ثانياً وفوّض إليه مسار عمل.', 'both', '2026-12-15', 'planned', 0)
    ],
    p_gamal: [
      d('workstream', 'Lead a Tier-1', 'قيادة فعالية كبرى', 'Co-lead a Tier-1 event next quarter.', 'شارك في قيادة فعالية من الفئة ١ الربع القادم.', 'both', '2026-12-31', 'planned', 0)
    ]
  };

  // Training / certifications (spec §13). status: 'done' | 'inprogress'. Recommended
  // items are DERIVED by the engine from open gaps (so they can't go stale). Training
  // is evidence, never proof of mastery — the view says so.
  function tr(name, nameAr, date, provider, status, skill) {
    return { name: name, nameAr: nameAr, date: date, provider: provider, status: status, skill: skill };
  }
  var TRAINING = {
    p_osama: [
      tr('Incident command basics', 'أساسيات إدارة الحوادث', '2026-03-12', 'webook Academy', 'done', 'On-site operations'),
      tr('Coaching for team leads', 'التدريب لقادة الفرق', '2026-08-01', 'webook Academy', 'inprogress', 'Mentoring')
    ],
    p_akram: [
      tr('Budgeting for operations', 'الميزانية للعمليات', '2026-02-20', 'webook Academy', 'done', 'Budgeting'),
      tr('People leadership I', 'قيادة الأفراد ١', '2026-07-10', 'webook Academy', 'inprogress', 'Team leadership')
    ],
    p_talal: [
      tr('Event operations fundamentals', 'أساسيات عمليات الفعاليات', '2026-01-15', 'webook Academy', 'done', 'AV setup')
    ],
    p_idris: [
      tr('Onboarding — tools & process', 'التهيئة — الأدوات والعملية', '2026-05-20', 'webook Academy', 'done', 'Vendor coordination')
    ]
  };

  WP.data.CAREER = {
    LEVELS: LEVELS,
    NEXT_CAPS: NEXT_CAPS,
    REVIEW_DEFAULT: REVIEW_DEFAULT,
    REVIEW: REVIEW,
    FEEDBACK: FEEDBACK,
    DEV_PLAN: DEV_PLAN,
    TRAINING: TRAINING
  };
})(window.WP = window.WP || {});
