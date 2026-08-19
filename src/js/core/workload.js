/* ============================================================
 * Tempo — Workload Cockpit Engine  (MVP)
 * ------------------------------------------------------------
 * Pure functions. No DOM. Reads WP.data + WP.dates only.
 * Companion to core/capacity.js (the legacy calendar-window load model);
 * this module adds the PER-DAY, forward-looking model the manager cockpit needs:
 * today / next-7 / next-14 timeline, forecast, pressure, pressure windows,
 * team drivers, and skill-aware what-if.
 *
 * LOCKED MODEL (documented assumptions — never hidden; see docs/SPEC-workload-mvp.md):
 *   - We measure a tier-weighted LOAD INDEX, never clocked hours (Constitution Art. II).
 *   - Each event active on a day adds its tier's daily intensity to the owner's day:
 *       Mega 50 · Medium 25 · Standard 10   (WP.data.DAY_INTENSITY)
 *     Two overlapping Mega events on one day = 100% of that person that day.
 *   - dayLoad(person, date) = Σ intensity of that person's events active on `date`.
 *   - "Effort" is captured by the event TIER — the estimate that genuinely exists
 *     in the data — not by invented per-task hours (no fake precision; brief §9/§25).
 *   - Status bands (WP.data.LOAD_STATES) are OPERATIONAL rules, not science, and are
 *     configurable: Healthy 0-70 · Watch 71-85 · High 86-100 · Overloaded 101-115 · Critical >115.
 *   - Pressure ≠ load. Pressure is a transparent, factor-visible composite of peak load,
 *     concurrency, deadline proximity and top-tier presence — never an opaque AI score.
 *   - refISO ("today") pins to WP.data.DEMO_TODAY on demo data so the story is stable;
 *     real data would pass the real date. No Date.now() in the engine (determinism).
 * ========================================================== */
(function (WP) {
  'use strict';

  var DEFAULT_HORIZON = 14;

  /* The reference "today" ISO. Demo data pins to DEMO_TODAY for a stable story;
   * real data can pass an explicit ref. Falls back through WP.state then a fixed anchor. */
  function refToday(refISO) {
    if (refISO) return String(refISO).slice(0, 10);
    if (WP.state && WP.state.cockpitRef) return String(WP.state.cockpitRef).slice(0, 10);
    if (WP.data && WP.data.demoData && WP.data.DEMO_TODAY) return WP.data.DEMO_TODAY;
    if (WP.state && WP.state.refDate) return String(WP.state.refDate).slice(0, 10);
    return (WP.data && WP.data.DEMO_TODAY) || '2026-08-19';
  }

  function shift(iso, days) {
    if (WP.dates && WP.dates.shiftISO) return WP.dates.shiftISO(iso, days);
    var d = new Date(iso + 'T00:00:00Z'); d.setUTCDate(d.getUTCDate() + days);
    return d.toISOString().slice(0, 10);
  }

  function intensity(ev) {
    var map = (WP.data && WP.data.DAY_INTENSITY) || { 1: 50, 2: 25, 3: 10 };
    return map[ev && ev.tier] || 0;   // unknown/missing tier → 0 (fail-safe, never throw)
  }

  /* Event active on an ISO day? Inclusive [start, end]. String compare is valid for
   * zero-padded YYYY-MM-DD. Missing bounds → not active (fail-safe). */
  function activeOn(ev, iso) {
    if (!ev || !ev.start || !ev.end) return false;
    return ev.start <= iso && iso <= ev.end;
  }

  function eventsOf(person) {
    var EVENTS = (WP.data && WP.data.EVENTS) || {};
    return (person && person.assignedEvents || [])
      .map(function (id) { return EVENTS[id]; })
      .filter(Boolean);
  }

  /* Events active for a person on a given day, with their intensity. */
  function driversOn(person, iso) {
    return eventsOf(person)
      .filter(function (ev) { return activeOn(ev, iso); })
      .map(function (ev) { return { id: ev.id, tier: ev.tier, intensity: intensity(ev), event: ev }; })
      .sort(function (a, b) { return b.intensity - a.intensity; });
  }

  /* Load index (0..N) for one person on one day = Σ active-event intensities. */
  function dayLoad(person, iso) {
    return driversOn(person, iso).reduce(function (s, d) { return s + d.intensity; }, 0);
  }

  /* Map a load index to its 5-level state band (configurable). */
  function stateFor(load) {
    var S = (WP.data && WP.data.LOAD_STATES) || [];
    return S.find(function (b) { return load >= b.min && load <= b.max; }) || S[S.length - 1] || { key: 'healthy', labelEn: 'Healthy', labelAr: 'صحي' };
  }

  /* Forward per-day timeline: [{date, load, state, drivers, offset}] for `days` days from refISO. */
  function timeline(person, refISO, days) {
    var ref = refToday(refISO), n = days || DEFAULT_HORIZON, out = [];
    for (var i = 0; i < n; i++) {
      var iso = shift(ref, i), load = dayLoad(person, iso);
      out.push({ date: iso, offset: i, load: load, state: stateFor(load), drivers: driversOn(person, iso) });
    }
    return out;
  }

  function peakOf(tl) {
    return tl.reduce(function (m, d) { return d.load > m.load ? d : m; }, { load: -1, date: null });
  }
  function avgOf(tl) {
    if (!tl.length) return 0;
    return Math.round(tl.reduce(function (s, d) { return s + d.load; }, 0) / tl.length);
  }

  /* Forecast: today's load + the PEAK (worst day) across next-7 and next-14, plus averages.
   * Peak is the headline because hiding the peak behind an average is the exact failure this
   * cockpit fixes (a "healthy" week sitting on top of a two-day overload). */
  function forecast(person, refISO) {
    var ref = refToday(refISO);
    var full = timeline(person, ref, DEFAULT_HORIZON);
    var d7 = full.slice(0, 7), d14 = full;
    var today = full[0], p7 = peakOf(d7), p14 = peakOf(d14);
    return {
      ref: ref,
      today: today.load, todayState: today.state,
      peak7: p7.load, peak7Date: p7.date, peak7State: stateFor(p7.load),
      peak14: p14.load, peak14Date: p14.date, peak14State: stateFor(p14.load),
      avg7: avgOf(d7), avg14: avgOf(d14),
      timeline: full,
    };
  }

  /* Max simultaneous events on any single day in the window (concurrency signal). */
  function maxConcurrency(person, refISO, days) {
    var tl = timeline(person, refISO, days || DEFAULT_HORIZON), mx = 0;
    tl.forEach(function (d) { if (d.drivers.length > mx) mx = d.drivers.length; });
    return mx;
  }

  /* Earliest assigned-event END within `within` days of ref (deadline crunch), or null. */
  function nextDeadline(person, refISO, within) {
    var ref = refToday(refISO), lim = shift(ref, (within == null ? 3 : within));
    var ends = eventsOf(person)
      .filter(function (ev) { return ev.end >= ref && ev.end <= lim; })
      .map(function (ev) { return { id: ev.id, end: ev.end, event: ev }; })
      .sort(function (a, b) { return a.end < b.end ? -1 : 1; });
    return ends[0] || null;
  }

  /* PRESSURE — transparent, factor-visible. Not an opaque score:
   *   score = 0.6·min(peak14,130) + concurrencyBoost + deadlineBoost + megaBoost  (0..100)
   * Every factor is returned so the UI can show exactly WHY. Weights are tunable. */
  function pressure(person, refISO) {
    var ref = refToday(refISO);
    var fc = forecast(person, ref);
    var conc = maxConcurrency(person, ref, DEFAULT_HORIZON);
    var dl = nextDeadline(person, ref, 3);
    var mega = fc.timeline.some(function (d) { return d.drivers.some(function (x) { return x.tier === 1; }); });
    var concBoost = conc >= 3 ? 12 : conc >= 2 ? 6 : 0;
    var dlBoost = dl ? 8 : 0;
    var megaBoost = mega ? 6 : 0;
    var score = Math.max(0, Math.min(100, Math.round(0.6 * Math.min(fc.peak14, 130) + concBoost + dlBoost + megaBoost)));
    var level = score >= 90 ? 'critical' : score >= 70 ? 'high' : score >= 45 ? 'elevated' : 'low';
    return {
      score: score, level: level,
      factors: {
        peakLoad: fc.peak14, peakDate: fc.peak14Date,
        maxConcurrent: conc, deadline: dl ? dl.end : null, deadlineEvent: dl ? dl.id : null,
        megaActive: mega,
      },
    };
  }

  /* Per-person cockpit snapshot. */
  function snapshot(person, refISO) {
    var fc = forecast(person, refISO);
    return {
      id: person.id,
      today: fc.today, todayState: fc.todayState,
      peak7: fc.peak7, peak7Date: fc.peak7Date, peak7State: fc.peak7State,
      peak14: fc.peak14, peak14Date: fc.peak14Date, peak14State: fc.peak14State,
      pressure: pressure(person, fc.ref),
      forecast: fc,
    };
  }

  /* Team roll-up: counts + averages that DON'T smooth away the peak. */
  function teamMetrics(people, refISO) {
    var ref = refToday(refISO);
    var snaps = people.map(function (p) { return snapshot(p, ref); });
    var n = snaps.length || 1;
    var overloadedToday = 0, atRisk7 = 0, healthyToday = 0, sumToday = 0, peakTeam = 0, peakTeamDate = null;
    snaps.forEach(function (s) {
      sumToday += s.today;
      if (s.todayState.key === 'overloaded' || s.todayState.key === 'critical') overloadedToday++;
      if (s.todayState.key === 'healthy') healthyToday++;
      // "at risk" = not overloaded today, but peaks High+ within 7 days
      if (s.peak7 >= 86 && !(s.todayState.key === 'overloaded' || s.todayState.key === 'critical')) atRisk7++;
      if (s.peak7 > peakTeam) { peakTeam = s.peak7; peakTeamDate = s.peak7Date; }
    });
    return {
      ref: ref, snaps: snaps, size: snaps.length,
      avgToday: Math.round(sumToday / n),
      overloadedToday: overloadedToday, atRisk7: atRisk7, healthyToday: healthyToday,
      teamPeak7: peakTeam, teamPeak7Date: peakTeamDate,
    };
  }

  /* Pressure windows for ONE person: contiguous runs of days at High+ (>=86) in the horizon. */
  function personWindows(person, refISO, days) {
    var tl = timeline(person, refISO, days || DEFAULT_HORIZON);
    var runs = [], cur = null;
    tl.forEach(function (d) {
      if (d.load >= 86) {
        if (!cur) cur = { from: d.date, to: d.date, peak: d.load, peakDate: d.date, driverSet: {} };
        else cur.to = d.date;
        if (d.load > cur.peak) { cur.peak = d.load; cur.peakDate = d.date; }
        d.drivers.forEach(function (x) { cur.driverSet[x.id] = (cur.driverSet[x.id] || 0) + x.intensity; });
      } else if (cur) { runs.push(cur); cur = null; }
    });
    if (cur) runs.push(cur);
    return runs.map(function (r) {
      var drivers = Object.keys(r.driverSet)
        .map(function (id) { return { id: id, weight: r.driverSet[id] }; })
        .sort(function (a, b) { return b.weight - a.weight; });
      return {
        personId: person.id, from: r.from, to: r.to, peak: r.peak, peakDate: r.peakDate,
        drivers: drivers,
        action: r.peak > 115 ? 'add-support' : 'redistribute',   // >Critical needs headcount; else move 1–2 items
      };
    });
  }

  /* Team pressure windows, worst first (top `limit`). */
  function pressureWindows(people, refISO, limit) {
    var all = [];
    people.forEach(function (p) { all = all.concat(personWindows(p, refISO, DEFAULT_HORIZON)); });
    all.sort(function (a, b) { return b.peak - a.peak; });
    return limit ? all.slice(0, limit) : all;
  }

  /* Which EVENTS generate the most demand across the team in the horizon.
   * demand = intensity × (person-days it is active for assigned owners in the window). */
  function driversRollup(people, refISO, limit) {
    var ref = refToday(refISO), n = DEFAULT_HORIZON, tally = {};
    people.forEach(function (p) {
      eventsOf(p).forEach(function (ev) {
        for (var i = 0; i < n; i++) {
          if (activeOn(ev, shift(ref, i))) {
            tally[ev.id] = tally[ev.id] || { id: ev.id, event: ev, demand: 0, people: {} };
            tally[ev.id].demand += intensity(ev);
            tally[ev.id].people[p.id] = true;
          }
        }
      });
    });
    var out = Object.keys(tally).map(function (id) {
      var t = tally[id]; t.peopleCount = Object.keys(t.people).length; return t;
    }).sort(function (a, b) { return b.demand - a.demand; });
    return limit ? out.slice(0, limit) : out;
  }

  /* WHAT-IF: project adding an event to a person (peak over next-14 before→after). */
  function simulate(person, eventId, refISO) {
    var ref = refToday(refISO);
    var before = forecast(person, ref);
    var trial = Object.assign({}, person, { assignedEvents: (person.assignedEvents || []).concat([eventId]) });
    var after = forecast(trial, ref);
    return {
      beforePeak: before.peak14, afterPeak: after.peak14,
      beforeToday: before.today, afterToday: after.today,
      delta: after.peak14 - before.peak14,
      afterState: stateFor(after.peak14),
      softLocked: after.peak14 > 100,     // pushing into Overloaded requires a logged override
    };
  }

  function canDo(person, ev) {
    if (!ev || !ev.requiredSkill) return true;
    return ((person && person.skills) || []).indexOf(ev.requiredSkill) >= 0;
  }

  /* Does adding this event create a CRITICAL day (>115) for the person? (overlap/overload guard) */
  function createsCritical(person, ev, refISO) {
    return simulate(person, ev.id, refISO).afterPeak > 115;
  }

  /* Rank candidates for a NEW assignment. Order (each an explainable reason):
   *   1) can perform the work (required skill)   2) does NOT create a critical overload
   *   3) lowest projected peak load               4) tiebreak: lowest today load
   * Returns every candidate with {skillMatch, sim, reasons[], recommended}. */
  function rankCandidates(eventId, people, refISO) {
    var EVENTS = (WP.data && WP.data.EVENTS) || {};
    var ev = EVENTS[eventId];
    var ref = refToday(refISO);
    var rows = people.map(function (p) {
      var sim = simulate(p, eventId, ref);
      var skillMatch = canDo(p, ev);
      var safe = sim.afterPeak <= 115;
      var reasons = [];
      if (ev && ev.requiredSkill) reasons.push((skillMatch ? 'has ' : 'missing ') + ev.requiredSkill);
      reasons.push('projected ' + sim.beforePeak + '% → ' + sim.afterPeak + '%');
      if (!safe) reasons.push('would hit critical');
      return { person: p, id: p.id, skillMatch: skillMatch, safe: safe, sim: sim, reasons: reasons };
    });
    rows.sort(function (a, b) {
      return (b.skillMatch - a.skillMatch)                 // skilled first
        || (b.safe - a.safe)                                // non-critical first
        || (a.sim.afterPeak - b.sim.afterPeak)              // lowest projected peak
        || (a.sim.afterToday - b.sim.afterToday);           // tiebreak: lowest today
    });
    // recommend the top row only if it can actually do the work and stays non-critical
    if (rows[0]) rows[0].recommended = rows[0].skillMatch && rows[0].safe;
    return rows;
  }

  WP.workload = {
    refToday: refToday, dayLoad: dayLoad, driversOn: driversOn, stateFor: stateFor,
    timeline: timeline, forecast: forecast, pressure: pressure, snapshot: snapshot,
    maxConcurrency: maxConcurrency, nextDeadline: nextDeadline,
    teamMetrics: teamMetrics, personWindows: personWindows, pressureWindows: pressureWindows,
    driversRollup: driversRollup, simulate: simulate, canDo: canDo,
    createsCritical: createsCritical, rankCandidates: rankCandidates,
    HORIZON: DEFAULT_HORIZON,
  };
})(window.WP = window.WP || {});
