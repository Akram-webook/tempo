/* ============================================================
 * Tempo — Career Profile engine (Employee Intelligence · ENGINE ONLY, DOM-free)
 * SPEC: the Career Profile brief (header → skills → gaps → strengths → feedback →
 *       readiness → dev plan → career path → evidence → training).
 * GATE: ai-os/00-governance/INTELLIGENCE-ETHICS.md + Constitution (TAOS).
 * ------------------------------------------------------------
 * COMPOSES existing engines — it invents nothing:
 *   growth-data.js  → skills (0–5 ladder + target + history), EQ, manager/director
 *                     lens, quarterly reviews.
 *   mock-data.js    → tenure, role dates, tier-1 track record, reporting lines.
 *   career-data.js  → the CONFIGURABLE ladder, next-level capabilities, dated
 *                     feedback history, dev-plan objectives, training.
 *   WP.growth       → tenure/ramp/overload/promotion SIGNAL helpers.
 *   WP.access       → direct-reports (for leadership/mentoring evidence).
 *
 * Hard guardrails (mirrors readiness.js + asserted in test/verify-career.js):
 *  - NO opaque employee score. Readiness is a CATEGORICAL development STAGE
 *    (ready | nearly | developing | notready) with its REASONS always attached —
 *    never a 0–100 number, never a rank, never a promote/hold decision.
 *  - Evidence-first. Every capability/skill assessment carries its source + a
 *    citable line, or an honest "Evidence unavailable". Nothing is fabricated.
 *  - Human decides. Output INFORMS; the view repeats that the manager decides.
 *  - No surveillance signals — capability & development only (never presence/hours).
 *
 * Pure-ish: reads WP.data + WP.growth + WP.state.refDate; returns plain objects.
 * NO DOM, NO network. Renders in ui/career.js.
 * ========================================================== */
(function (WP) {
  'use strict';

  function C() { return (WP.data && WP.data.CAREER) || {}; }
  function levelMeta(key) { return (C().LEVELS || {})[key] || null; }
  function levelName(key, ar) { var m = levelMeta(key); return m ? (ar ? m.ar : m.en) : (key || '—'); }

  function reviewDates(id) {
    var c = C();
    return (c.REVIEW && c.REVIEW[id]) || c.REVIEW_DEFAULT || { last: null, next: null };
  }

  // Ladder label for a 0–5 skill level (spec §3: use levels, not a bare %).
  function ladderLabel(n, ar) {
    var L = (WP.data && WP.data.SKILL_LADDER) || [];
    var row = L[Math.max(0, Math.min(L.length - 1, n | 0))];
    return row ? (ar ? row.ar : row.en) : String(n);
  }

  // Technical (hard) / Leadership (soft leadership-ish) / Behavioral (other soft).
  // Uses the EXISTING hard|soft framework (spec §6 — don't invent a new one).
  var LEADERSHIP_RX = /leader|deleg|mentor|coach|scal|manage/i;
  function skillGroupKey(sk) {
    if (sk.type === 'hard') return 'technical';
    return LEADERSHIP_RX.test(sk.name) ? 'leadership' : 'behavioral';
  }

  // A skill's development band vs its target (spec §3/§4). Never a %.
  function skillBand(sk) {
    var gap = Math.max(0, (sk.required || 0) - (sk.level || 0));
    if (gap <= 0) return 'strong';                 // meets or exceeds target
    if (gap === 1) return 'ontrack';               // one rung below
    return 'gap';                                  // material gap
  }

  function skillView(sk, ar) {
    var trend = WP.growth.skillTrend(sk);
    return {
      name: sk.name, type: sk.type, group: skillGroupKey(sk),
      level: sk.level, target: sk.required, gap: Math.max(0, (sk.required || 0) - (sk.level || 0)),
      levelLabel: ladderLabel(sk.level, ar), targetLabel: ladderLabel(sk.required, ar),
      band: skillBand(sk), trend: trend, history: (sk.history || []).slice()
    };
  }

  function skillGroups(growth, ar) {
    var out = { technical: [], behavioral: [], leadership: [] };
    (growth && growth.skills || []).forEach(function (sk) {
      out[skillGroupKey(sk)].push(skillView(sk, ar));
    });
    return out;
  }

  function findSkill(growth, altPattern) {
    if (!growth || !growth.skills) return null;
    var rx = new RegExp(altPattern, 'i');
    for (var i = 0; i < growth.skills.length; i++) {
      if (rx.test(growth.skills[i].name)) return growth.skills[i];
    }
    return null;
  }

  function directReportCount(id) {
    return (WP.access.directReports(id) || []).filter(function (p) { return !p.tbc; }).length;
  }

  // Resolve ONE next-level capability to a status + evidence. source is one of
  // 'manager' | 'system' | 'configurable' (spec §17 — always name the source).
  function resolveCap(cap, person, growth, ar) {
    var out = {
      key: cap.key, label: ar ? cap.ar : cap.en, why: cap.why ? (ar ? cap.why.ar : cap.why.en) : '',
      status: 'notyet', current: null, target: null, source: 'configurable', evidence: []
    };

    // 1) Skill-backed capability.
    if (cap.skill) {
      var sk = findSkill(growth, cap.skill);
      if (sk) {
        var band = skillBand(sk);
        out.current = ladderLabel(sk.level, ar);
        out.target = ladderLabel(sk.required, ar);
        out.source = 'manager';
        out.status = band === 'strong' ? 'ready' : (band === 'ontrack' || WP.growth.skillTrend(sk) > 0 ? 'developing' : 'notyet');
        out.evidence.push({ text: sk.name + ': ' + ladderLabel(sk.level, ar) + ' / ' + ladderLabel(sk.required, ar) + (WP.growth.skillTrend(sk) > 0 ? ' ↑' : ''), source: 'manager' });
        return out;
      }
    }

    // 2) Signal-backed capability.
    if (cap.signal === 'ownership' || cap.signal === 'delivery') {
      var pr = WP.growth.promotionReadiness(person);
      var t1 = pr.tier1Delivered || 0;
      out.source = 'system';
      out.status = t1 >= 3 ? 'ready' : (t1 >= 1 ? 'developing' : 'notyet');
      out.current = t1 + (t1 === 1 ? ' Tier-1' : ' Tier-1s');
      out.target = '3+ Tier-1s';
      out.evidence.push({ text: t1 + ' Tier-1 event(s) delivered' + (pr.sustainable ? ' · sustainable load' : ' · under sustained pressure'), source: 'system' });
      if (pr.fairnessGap) out.evidence.push({ text: 'Not given a Tier-1 in ' + pr.monthsSinceTier1 + ' months — org opportunity gap, not a deficiency', source: 'system' });
      return out;
    }
    if (cap.signal === 'mentoring') {
      var dr = directReportCount(person.id);
      out.target = '2+ reports / active mentoring';
      if (dr >= 2) { out.status = 'ready'; out.source = 'system'; out.current = dr + ' direct reports'; out.evidence.push({ text: 'Leads ' + dr + ' people', source: 'system' }); return out; }
      if (dr === 1) { out.status = 'developing'; out.source = 'system'; out.current = '1 direct report'; out.evidence.push({ text: 'Leads 1 person — growing the span', source: 'system' }); return out; }
      // no reports — look for a manager/director note about mentoring/delegation
      var note = growth && (mentionOf(growth.managerNote) || mentionOf(growth.directorNote));
      if (note) { out.status = 'developing'; out.source = 'manager'; out.current = 'no reports yet'; out.evidence.push({ text: note, source: 'manager' }); return out; }
      out.status = 'notyet'; out.source = 'system'; out.current = 'no reports yet';
      out.evidence.push({ text: 'Not yet demonstrated — no reports or mentoring on record', source: 'system' });
      return out;
    }
    if (cap.signal === 'tenure') {
      var m = WP.growth.monthsInRole(person) || 0;
      out.source = 'system'; out.target = '12+ months at level'; out.current = m + ' months in role';
      out.status = m >= 12 ? 'ready' : (m >= 6 ? 'developing' : 'notyet');
      out.evidence.push({ text: m + ' months in current role', source: 'system' });
      return out;
    }
    if (cap.signal === 'strategy') {
      var pot = growth && growth.directorNote && growth.directorNote.potential;
      if (pot === 'High' && levelMeta(person.level) && levelMeta(person.level).order >= 2) {
        out.status = 'developing'; out.source = 'manager';
        out.evidence.push({ text: 'Director view: ' + (growth.directorNote.impact || 'high potential'), source: 'manager' });
      } else {
        out.status = 'notyet'; out.source = 'configurable';
        out.evidence.push({ text: 'Evidence unavailable — assessed by the line manager', source: 'configurable' });
      }
      out.target = 'Demonstrated at next level';
      return out;
    }

    // 3) Unmapped — honest, never invented.
    out.evidence.push({ text: 'Evidence unavailable — capability is configurable', source: 'configurable' });
    return out;
  }

  function mentionOf(note) {
    if (!note) return null;
    var hay = [note.suggestion, note.impact, note.potential].concat(note.growth || [], note.strengths || []).filter(Boolean).join(' ');
    return LEADERSHIP_RX.test(hay) ? (note.suggestion || (note.growth && note.growth[0]) || null) : null;
  }

  // Next-level capabilities, each resolved to evidence.
  function nextCaps(person, growth, ar) {
    var list = (C().NEXT_CAPS || {})[person.level] || [];
    return list.map(function (cap) { return resolveCap(cap, person, growth, ar); });
  }

  // CATEGORICAL readiness stage from the resolved caps (spec §2/§9). NOT a score.
  // Always returned WITH its reasons so the view can never show a bare label.
  function readiness(caps, person) {
    var ready = caps.filter(function (c) { return c.status === 'ready'; });
    var dev = caps.filter(function (c) { return c.status === 'developing'; });
    var notyet = caps.filter(function (c) { return c.status === 'notyet'; });
    var total = caps.length;
    var key;
    if (!total) key = 'developing';
    else {
      var ratio = ready.length / total;
      if (ratio >= 1) key = 'ready';
      else if (ratio >= 0.6 && notyet.length === 0) key = 'nearly';
      else if (ratio >= 0.4 || (dev.length >= Math.ceil(total / 2) && notyet.length <= 1)) key = 'developing';
      else key = 'notready';
    }
    // New-hire ramp guard — a brand-new person is never "ready"/"nearly".
    var m = WP.growth.monthsInRole(person) || 0;
    if (WP.growth.isRamping(person) || m < 6) {
      if (key === 'ready' || key === 'nearly') key = 'developing';
      if (m < 4) key = 'notready';
    }
    return {
      key: key,
      configurable: !total,
      strong: ready.map(function (c) { return c.label; }),
      developing: dev.map(function (c) { return c.label; }),
      blocking: notyet.map(function (c) { return c.label; }),
      counts: { ready: ready.length, developing: dev.length, notyet: notyet.length, total: total }
    };
  }

  // Strengths with evidence (spec §5) — from ready caps + skills that meet/beat target
  // + the manager's noted strengths. Never praise without a source.
  function strengths(growth, caps, ar) {
    var out = [];
    (growth && growth.skills || []).forEach(function (sk) {
      if (skillBand(sk) === 'strong') out.push({ area: sk.name, evidence: 'Rated ' + ladderLabel(sk.level, ar) + ' vs target ' + ladderLabel(sk.required, ar), source: 'manager' });
    });
    if (growth && growth.managerNote && growth.managerNote.strengths) {
      growth.managerNote.strengths.forEach(function (s) { out.push({ area: s, evidence: 'Noted by line manager', source: 'manager' }); });
    }
    return out;
  }

  // Skill gaps (spec §4) — skills below target, worst first, each with a recommended action.
  function gaps(growth, ar) {
    var out = [];
    (growth && growth.skills || []).forEach(function (sk) {
      var g = Math.max(0, (sk.required || 0) - (sk.level || 0));
      if (g > 0) out.push({
        name: sk.name, group: skillGroupKey(sk), gap: g,
        current: ladderLabel(sk.level, ar), target: ladderLabel(sk.required, ar),
        action: recommendedAction(sk, ar)
      });
    });
    return out.sort(function (a, b) { return b.gap - a.gap; });
  }

  // Actionable "how" (spec §12) — specific, never "improve X".
  function recommendedAction(sk, ar) {
    var n = sk.name.toLowerCase();
    var map = [
      [/report|docum/, { en: 'Own the post-event report for your next event, unaided.', ar: 'تولَّ تقرير ما بعد الفعالية لفعاليتك القادمة دون مساعدة.' }],
      [/deleg|scal|team/, { en: 'Delegate one full workstream to a colleague and coach them through it.', ar: 'فوّض مسار عمل كامل لزميل ودرّبه خلاله.' }],
      [/leader|manage/, { en: 'Lead one operational workstream end-to-end this quarter.', ar: 'قُد مسار عمل تشغيلي كاملاً هذا الربع.' }],
      [/mentor|coach/, { en: 'Mentor a junior on a live event and review it with your manager.', ar: 'أرشد مبتدئاً في فعالية مباشرة وراجعها مع مديرك.' }],
      [/boundary|owner/, { en: 'Own the next Tier-2 event solo; flag capacity before a third overlap.', ar: 'تولَّ الفعالية القادمة من الفئة ٢ منفرداً، وأبلغ عن طاقتك قبل التداخل الثالث.' }],
      [/stakeholder|client|relations/, { en: 'Run a stakeholder meeting for your next event without your lead.', ar: 'أدر اجتماع أصحاب المصلحة لفعاليتك القادمة دون قائدك.' }],
      [/english|communication/, { en: 'Present your next event debrief in English to the team.', ar: 'قدّم ملخص فعاليتك القادمة بالإنجليزية للفريق.' }]
    ];
    for (var i = 0; i < map.length; i++) if (map[i][0].test(n)) return ar ? map[i][1].ar : map[i][1].en;
    return ar ? ('اعمل على «' + sk.name + '» بمهمة محددة يتفق عليها مع مديرك.') : ('Take a specific stretch task on “' + sk.name + '”, agreed with your manager.');
  }

  // Feedback timeline (spec §7/§8) — dated career-data history + growth-data quarterly,
  // newest first. Historical entries are additive, never overwritten.
  var Q_DATE = { Q1: '-03-31', Q2: '-06-30', Q3: '-09-30', Q4: '-12-31' };
  function quarterlyToEntry(q, byId) {
    var mm = String(q.q || '').match(/Q([1-4])\s*(\d{4})/);
    var date = mm ? (mm[2] + Q_DATE['Q' + mm[1]]) : null;
    return {
      date: date, type: 'review', by: byId,
      strengths: q.improved && q.improved.length ? q.improved.slice() : [],
      improvements: q.focus ? q.focus.slice() : [],
      comment: q.summary || '', actions: q.focus ? q.focus.slice() : [], rating: q.rating || null
    };
  }
  function feedbackTimeline(person, growth) {
    var out = ((C().FEEDBACK || {})[person.id] || []).map(function (e) { var o = {}; for (var k in e) o[k] = e[k]; return o; });
    if (growth && growth.quarterly) growth.quarterly.forEach(function (q) { out.push(quarterlyToEntry(q, person.managerId)); });
    out.sort(function (a, b) { return String(b.date || '').localeCompare(String(a.date || '')); });
    return out;
  }

  // Development plan (spec §11) — explicit objectives, else PROPOSED from live gaps.
  function devPlan(person, growth, ar) {
    var explicit = (C().DEV_PLAN || {})[person.id];
    if (explicit && explicit.length) {
      return explicit.map(function (o) {
        return { title: ar ? o.titleAr : o.title, action: ar ? o.actionAr : o.action, owner: o.owner, due: o.due, status: o.status, progress: o.progress || 0, proposed: o.status === 'proposed' };
      });
    }
    // propose from the two worst gaps — honest ("Proposed"), never marked done
    return gaps(growth, ar).slice(0, 2).map(function (g) {
      return { title: g.name, action: g.action, owner: 'both', due: null, status: 'proposed', progress: 0, proposed: true };
    });
  }

  // Training (spec §13) — recorded items + recommended (derived from open gaps, so it
  // can't go stale). Training is evidence, never proof of mastery.
  function training(person, growth, ar) {
    var recs = (C().TRAINING || {})[person.id] || [];
    var done = [], inprogress = [];
    recs.forEach(function (r) {
      var row = { name: ar ? (r.nameAr || r.name) : r.name, date: r.date, provider: r.provider, status: r.status, skill: r.skill };
      (r.status === 'done' ? done : inprogress).push(row);
    });
    var covered = {};
    recs.forEach(function (r) { if (r.skill) covered[r.skill.toLowerCase()] = true; });
    var recommended = gaps(growth, ar).slice(0, 3).filter(function (g) { return !covered[g.name.toLowerCase()]; })
      .map(function (g) { return { name: g.name, skill: g.name, action: g.action }; });
    return { done: done, inprogress: inprogress, recommended: recommended };
  }

  // Career path (spec §10) — current → next → future, with next-level requirements.
  function careerPath(person, ar) {
    var cur = person.level;
    var curM = levelMeta(cur);
    var next = curM && curM.next;
    var nextM = next && levelMeta(next);
    var future = nextM && nextM.next;
    return {
      current: { key: cur, name: levelName(cur, ar) },
      next: next ? { key: next, name: levelName(next, ar) } : null,
      future: future ? { key: future, name: levelName(future, ar) } : null,
      configurable: true // this ladder is a configurable org framework (spec §10)
    };
  }

  // The whole bundle the view renders. Synchronous + pure-ish. `ar` picks the language
  // for pre-localized labels; raw keys (status/source) stay language-neutral for the view.
  function build(personId, opts) {
    opts = opts || {};
    var ar = !!opts.ar;
    var person = WP.access.byId(personId);
    if (!person) return null;
    var growth = (WP.data.GROWTH || {})[personId] || null;
    var caps = nextCaps(person, growth, ar);
    var rd = reviewDates(personId);
    return {
      person: person,
      hasGrowth: !!growth,
      level: { key: person.level, name: levelName(person.level, ar) },
      review: rd,
      caps: caps,
      readiness: readiness(caps, person),
      skillGroups: skillGroups(growth, ar),
      strengths: strengths(growth, caps, ar),
      gaps: gaps(growth, ar),
      eq: growth ? growth.eq : null,
      managerNote: growth ? growth.managerNote : null,
      feedback: feedbackTimeline(person, growth),
      devPlan: devPlan(person, growth, ar),
      training: training(person, growth, ar),
      careerPath: careerPath(person, ar),
      tenureMonths: WP.growth.tenureMonths(person),
      roleMonths: WP.growth.monthsInRole(person),
      ramping: WP.growth.isRamping(person)
    };
  }

  WP.career = {
    build: build,
    levelName: levelName, levelMeta: levelMeta, ladderLabel: ladderLabel,
    skillGroups: skillGroups, skillBand: skillBand, skillGroupKey: skillGroupKey,
    resolveCap: resolveCap, nextCaps: nextCaps, readiness: readiness,
    strengths: strengths, gaps: gaps, feedbackTimeline: feedbackTimeline,
    devPlan: devPlan, training: training, careerPath: careerPath, reviewDates: reviewDates
  };
})(window.WP = window.WP || {});
