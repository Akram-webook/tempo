/* ============================================================
 * Tempo — Organisation Tree (Event Operations)
 * ------------------------------------------------------------
 * The OrgTree spec, built for tempo's architecture: vanilla WP.ui module (no
 * framework), colours via tokens (--ot-* / --brand / inline squad --sc) so
 * app.css stays hex-free (token-purity), classes namespaced .ot-* so they can't
 * collide with the app's shared CSS. Same DOM shape / CSS values as the spec.
 *
 * Real personal data → director/admin only (canView = canManage), defence-in-
 * depth re-check here + a route guard in app.js.
 * ========================================================== */
(function (WP) {
  'use strict';
  var ui = WP.ui;
  var esc = function (s) { return ui.esc(String(s == null ? '' : s)); };

  function DATA() { return WP.orgTreeData || { PEOPLE: [], SQUADS: [], COUNTRY_FLAG: {} }; }
  var PEOPLE = function () { return DATA().PEOPLE; };
  var SQUADS = function () { return DATA().SQUADS; };
  var FLAG = function () { return DATA().COUNTRY_FLAG; };

  /* ---- helpers ---- */
  var byId = function (id) { return PEOPLE().filter(function (p) { return p.id === id; })[0]; };
  var squadOf = function (n) { return SQUADS().filter(function (s) { return s.name === n; })[0] || { color: '#a1a1aa' }; };
  var initials = function (n) { return n === 'TBC' ? '?' : n.split(' ').slice(0, 2).map(function (w) { return w[0]; }).join('').toUpperCase(); };
  var reportsOf = function (id) { return PEOPLE().filter(function (p) { return p.manager === id; }); };
  var chain = function (p) { var out = [], c = p; while (c && c.manager) { c = byId(c.manager); if (c) out.unshift(c); } return out; };
  var LEVEL_RANK = { 'Exec': 0, 'Director': 1, 'Sr. Manager': 2, 'Manager': 3, 'Sr. Specialist': 4, 'Specialist': 5, 'Coordinator': 6 };
  var bySeniority = function (a, b) {
    // Optional `order` pins sibling order explicitly (peers the data owner wants in a
    // specific sequence); people without it sort after, by seniority as before.
    return (a.order == null ? 99 : a.order) - (b.order == null ? 99 : b.order)
      || (LEVEL_RANK[a.level] == null ? 9 : LEVEL_RANK[a.level]) - (LEVEL_RANK[b.level] == null ? 9 : LEVEL_RANK[b.level])
      || (b.lead ? 1 : 0) - (a.lead ? 1 : 0)
      || (a.status === 'open') - (b.status === 'open')
      || a.name.localeCompare(b.name);
  };
  var isPerson = function (p) { return p.status !== 'open'; };
  var people = function () { return PEOPLE().filter(isPerson); };
  var flag = function (c) { return FLAG()[c] || ''; };

  /* ---- state ---- */
  var S = { q: '', squad: null, country: 'all', city: 'all', contract: 'all', level: 'all', ddOpen: false, fOpen: false };

  function filtersActive() { return !!(S.q || S.country !== 'all' || S.city !== 'all' || S.contract !== 'all' || S.level !== 'all'); }
  function secondaryCount() { return [S.country !== 'all', S.contract !== 'all', S.level !== 'all'].filter(Boolean).length; }
  function matches(p) {
    if (S.squad && p.squad !== S.squad) return false;
    if (S.q) { var h = (p.name + ' ' + p.role + ' ' + p.squad + ' ' + (p.unit || '') + ' ' + p.city).toLowerCase(); if (h.indexOf(S.q.toLowerCase()) < 0) return false; }
    if (S.country !== 'all' && p.country !== S.country) return false;
    if (S.city !== 'all' && p.city !== S.city) return false;
    if (S.contract !== 'all' && p.contract !== S.contract) return false;
    if (S.level !== 'all' && p.level !== S.level) return false;
    return true;
  }
  function dim(p) { var s = S.squad; S.squad = null; var m = matches(p); S.squad = s; return filtersActive() && !m; }

  function canView(viewer) { return !!(WP.access && WP.access.canManage(viewer)); }
  function squadCount(name) { return PEOPLE().filter(function (p) { return p.squad === name; }).length; }
  function squadFL(name) { return PEOPLE().filter(function (p) { return p.squad === name && isPerson(p) && p.contract === 'Freelance'; }).length; }

  /* ---- stat strip ---- */
  function statStripHTML() {
    var ppl = people();
    var sa = ppl.filter(function (p) { return p.country === 'Saudi Arabia'; }).length;
    var ae = ppl.filter(function (p) { return p.country === 'UAE'; }).length;
    var fl = ppl.filter(function (p) { return p.contract === 'Freelance'; }).length;
    var open = PEOPLE().filter(function (p) { return p.status === 'open'; }).length;
    var pin = function (c, n) {
      return '<button class="ot-pinst' + (S.country === c ? ' on' : '') + '" data-country="' + esc(c) + '">' +
        '<span class="ot-pinmark"><span class="ot-fgl">' + flag(c) + '</span></span><span class="ot-pinshadow"></span>' +
        '<span class="v">' + n + '</span><span class="l">' + esc(c) + '</span></button>';
    };
    return '<div class="ot-stat"><span class="v">' + ppl.length + '</span><span class="l">People</span></div>' +
      pin('Saudi Arabia', sa) + pin('UAE', ae) +
      '<div class="ot-stat"><span class="v fl">' + fl + '</span><span class="l">Freelance</span></div>' +
      '<div class="ot-stat"><span class="v op">' + open + '</span><span class="l">Open roles</span></div>';
  }

  /* ---- squad dropdown ---- */
  function ddBtnHTML() {
    if (S.squad) { var c = squadOf(S.squad);
      return '<span class="ot-dot" style="background:' + c.color + '"></span>' + esc(S.squad) + '<span class="cnt">' + squadCount(S.squad) + '</span><span class="ot-car">▾</span>';
    }
    return '<span class="ot-dot" style="background:#a1a1aa"></span>All squads<span class="cnt">' + PEOPLE().length + '</span><span class="ot-car">▾</span>';
  }
  function ddMenuHTML() {
    var rows = '<button class="ot-ddrow" data-sq=""><span class="ot-dot" style="background:#a1a1aa"></span>All squads<span class="cnt">' + PEOPLE().length + '</span></button><div class="ot-ddsep"></div>';
    rows += SQUADS().map(function (s) { var fl = squadFL(s.name);
      return '<button class="ot-ddrow" data-sq="' + esc(s.name) + '"><span class="ot-dot" style="background:' + s.color + '"></span>' + esc(s.name) +
        (fl ? '<span class="ot-flp">' + fl + ' FL</span>' : '') + '<span class="cnt">' + squadCount(s.name) + '</span></button>';
    }).join('');
    return rows;
  }

  /* ---- filters panel ---- */
  function filtersPanelHTML() {
    var countries = ['Saudi Arabia', 'UAE'];
    var citiesIn = S.country === 'all'
      ? Array.from(new Set(people().map(function (p) { return p.city; })))
      : Array.from(new Set(people().filter(function (p) { return p.country === S.country; }).map(function (p) { return p.city; })));
    var seg = function (key, opts) {
      return '<div class="ot-seg">' + opts.map(function (o) {
        return '<button data-k="' + key + '" data-v="' + esc(o.v) + '" class="' + (String(S[key]) === String(o.v) ? 'on' : '') + '">' + esc(o.l) + '</button>';
      }).join('') + '</div>';
    };
    var cOpts = [{ v: 'all', l: 'Both' }].concat(countries.map(function (c) { return { v: c, l: flag(c) + ' ' + c + ' ' + people().filter(function (p) { return p.country === c; }).length }; }));
    var cityOpts = [{ v: 'all', l: 'All cities' }].concat(citiesIn.map(function (c) { return { v: c, l: c }; }));
    var contractOpts = [{ v: 'all', l: 'Both' }, { v: 'Full-time', l: 'Full-time staff' }, { v: 'Freelance', l: 'Freelance' }];
    var levelOpts = [{ v: 'all', l: 'All' }, { v: 'Sr. Manager', l: 'Sr. Manager' }, { v: 'Manager', l: 'Manager' }, { v: 'Sr. Specialist', l: 'Sr. Specialist' }, { v: 'Specialist', l: 'Specialist' }, { v: 'Coordinator', l: 'Coordinator' }];
    return '<div class="ot-frow"><span class="ot-fk">Country</span>' + seg('country', cOpts) + seg('city', cityOpts) + '</div>' +
      '<div class="ot-frow"><span class="ot-fk">Contract</span>' + seg('contract', contractOpts) + '</div>' +
      '<div class="ot-frow"><span class="ot-fk">Position</span>' + seg('level', levelOpts) + '</div>';
  }

  /* ---- result line ---- */
  function resultHTML() {
    if (!filtersActive() && !S.squad) return '';
    var pool = S.squad ? PEOPLE().filter(function (p) { return p.squad === S.squad; }) : PEOPLE();
    var shown = pool.filter(matches).length;
    return 'Showing <b>' + shown + '</b> of <b>' + PEOPLE().length + '</b> positions <button class="ot-rst" data-reset="1">Reset</button>';
  }

  /* ---- squad info line ---- */
  function infoHTML() {
    if (!S.squad) return '';
    var c = squadOf(S.squad);
    var inSquad = PEOPLE().filter(function (p) { return p.squad === S.squad; });
    var ppl = inSquad.filter(isPerson);
    var lead = inSquad.filter(function (p) { return p.lead && byId(p.manager) && byId(p.manager).squad !== S.squad; })[0];
    var fl = ppl.filter(function (p) { return p.contract === 'Freelance'; }).length;
    var cities = {}; ppl.forEach(function (p) { cities[p.city] = (cities[p.city] || 0) + 1; });
    var cityStr = Object.keys(cities).map(function (k) { return esc(k) + ' ' + cities[k]; }).join(' <span class="ot-isep"></span> ');
    var units = Array.from(new Set(inSquad.map(function (p) { return p.unit; }).filter(Boolean)));
    return '<span style="--sc:' + c.color + '" class="ot-info-inner">' +
      '<span><b>' + esc(S.squad) + '</b></span><span class="ot-isep"></span>' +
      (lead ? '<span>led by <b>' + esc(lead.name) + '</b></span><span class="ot-isep"></span>' : '') +
      '<span><b>' + ppl.length + '</b> people' + (fl ? ' <span class="ot-flp">' + fl + ' freelance</span>' : '') + '</span><span class="ot-isep"></span>' +
      '<span>' + cityStr + '</span>' +
      (units.length ? '<span class="ot-isep"></span><span>teams inside: <b>' + units.map(esc).join(', ') + '</b></span>' : '') +
      '<button class="ot-xclose" data-reset="1">✕ ' + esc(WP.i18n.t('orgTreeAll')) + '</button></span>';
  }

  /* ---- person card ---- */
  function cardHTML(p, iso) {
    var c = squadOf(p.squad); var cls = ['ot-card'];
    if (p.lead && p.squad !== 'Leadership') cls.push('lead');
    if (p.contract === 'Freelance') cls.push('fre');
    if (p.status === 'open') cls.push('open');
    if (dim(p)) cls.push('dim');
    var role = iso ? p.role : p.role.replace(/^Event Operations\s*/, '');
    var n = reportsOf(p.id).length;
    var tags = (p.you ? '<span class="ot-tag you">' + esc(WP.i18n.t('orgTreeYou')) + '</span>' : '') +
      (p.status === 'incoming' ? '<span class="ot-tag inc">' + esc(WP.i18n.t('orgTreeIncoming')) + '</span>' : '') +
      (p.status === 'open' ? '<span class="ot-tag opn">OPEN</span>' : '');
    var loc = p.status === 'open' ? '' :
      '<span class="ot-chip loc"><svg width="11" height="11" viewBox="0 0 24 24"><path fill="#EA4335" d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7z"/><circle cx="12" cy="9" r="2.6" fill="#7f1d1d"/></svg>' + flag(p.country) + ' <b>' + esc(p.city) + '</b></span>';
    var fre = p.contract === 'Freelance' ? '<span class="ot-chip fre">FREELANCE</span>' : '';
    var leadchip = (p.lead && p.squad !== 'Leadership') ? '<span class="ot-chip lead">LEAD · ' + n + '</span>' : '';
    var img = DATA().IMG && DATA().IMG[p.id];
    var av = '<span class="ot-av">' +
      (img ? '<img class="ot-av-pic" src="' + esc(img) + '" alt="" loading="lazy" referrerpolicy="no-referrer">' : '') +
      esc(initials(p.name)) + '</span>';
    return '<button class="' + cls.join(' ') + '" data-open="' + p.id + '" style="--sc:' + c.color + '">' +
      av +
      '<span class="ot-who"><span class="ot-l1">' + esc(p.name) + tags + '</span>' +
      '<span class="ot-l2">' + esc(role) + '</span>' +
      '<span class="ot-l3">' + loc + fre + leadchip + '</span></span></button>';
  }
  function childrenHTML(p, iso) {
    var kids = reportsOf(p.id); if (!kids.length) return '';
    var same = kids.filter(function (k) { return (k.unit || null) === (p.unit || null); }).sort(bySeniority);
    var diff = kids.filter(function (k) { return (k.unit || null) !== (p.unit || null); });
    var groups = {}; diff.forEach(function (k) { (groups[k.unit] = groups[k.unit] || []).push(k); });
    var html = same.map(function (k) { return '<div class="ot-branch">' + personHTML(k, iso) + '</div>'; }).join('');
    Object.keys(groups).forEach(function (u) {
      html += '<div class="ot-branch"><div class="ot-ulabel">▸ ' + esc(u) + '</div>' +
        groups[u].sort(bySeniority).map(function (k) { return personHTML(k, iso); }).join('') + '</div>';
    });
    return '<div class="ot-kids">' + html + '</div>';
  }
  function personHTML(p, iso) { return cardHTML(p, iso) + childrenHTML(p, iso); }
  function rootsOf(name) { return PEOPLE().filter(function (p) { return p.squad === name && (!byId(p.manager) || byId(p.manager).squad !== name); }).sort(bySeniority); }

  /* ---- tree ---- */
  function treeHTML() {
    var iso = !!S.squad;
    var squads = iso ? SQUADS().filter(function (s) { return s.name === S.squad; }) : SQUADS();
    var gtc = 'repeat(' + squads.length + ',1fr)';
    var cols = squads.map(function (s) {
      var fl = squadFL(s.name), total = squadCount(s.name);
      var matched = PEOPLE().filter(function (p) { return p.squad === s.name && matches(p); }).length;
      var cnt = filtersActive() ? (matched + ' / ' + total) : ('' + total);
      var head = '<div class="ot-chead" data-sq="' + esc(s.name) + '" style="--sc:' + s.color + '">' + esc(s.name) +
        (fl ? '<span class="ot-flp">' + fl + ' FL</span>' : '') + '<span class="cnt">' + cnt + '</span></div>';
      var body = rootsOf(s.name).map(function (r) { return personHTML(r, iso); }).join('');
      return '<div class="ot-col" style="--sc:' + s.color + '">' + head + body + '</div>';
    }).join('');
    var spine = iso ? '' :
      '<div class="ot-spine">' + cardHTML(byId('hamdi'), false) + '<div class="ot-stem"></div>' + cardHTML(byId('ahmed'), false) + '</div>' +
      '<div class="ot-stem" style="margin:0 auto"></div>' +
      '<div class="ot-bus" style="grid-template-columns:' + gtc + '">' + SQUADS().map(function () { return '<div><span></span></div>'; }).join('') + '</div>';
    return '<div class="ot-tree' + (iso ? ' iso' : '') + '">' + spine + '<div class="ot-cols" style="grid-template-columns:' + gtc + '">' + cols + '</div></div>';
  }

  /* ---- drawer ---- */
  function drawerHTML(p) {
    var c = squadOf(p.squad), mgr = byId(p.manager);
    var crumbs = chain(p).map(function (x) { return '<b>' + esc(x.name) + '</b>'; }).join(' › ') || '<span>—</span>';
    var reps = reportsOf(p.id).sort(bySeniority);
    var repList = reps.length ? reps.map(function (r) {
      return '<button class="ot-dreport" data-goto="' + r.id + '"><span class="ot-dot" style="background:' + squadOf(r.squad).color + '"></span>' + esc(r.name) + ' — ' + esc(r.role.replace(/^Event Operations\s*/, '')) + '</button>';
    }).join('') : '<div class="ot-foot">No direct reports.</div>';
    var img = DATA().IMG && DATA().IMG[p.id];
    var dav = '<span class="ot-dav' + (p.status === 'open' ? ' open' : '') + '" style="--sc:' + c.color + '">' +
      (img ? '<img class="ot-dav-pic" src="' + esc(img) + '" alt="" referrerpolicy="no-referrer">' : '') +
      esc(initials(p.name)) + '</span>';
    return '<button class="ot-dclose" data-dclose="1" aria-label="Close">✕</button>' +
      '<div class="ot-dhead">' + dav + '<div class="ot-dhead-t"><h2>' + esc(p.name) + '</h2>' +
      '<div class="ot-drole">' + esc(p.role) + '</div></div></div>' +
      '<dl>' +
        '<dt>Squad</dt><dd><span class="ot-dot" style="background:' + c.color + ';display:inline-block;margin-inline-end:6px"></span>' + esc(p.squad) + '</dd>' +
        '<dt>Sub-team</dt><dd>' + esc(p.unit || '—') + '</dd>' +
        '<dt>Position</dt><dd>' + esc(p.level) + '</dd>' +
        (DATA().SLACK_TITLES && DATA().SLACK_TITLES[p.id] ? '<dt>Title (Slack)</dt><dd>' + esc(DATA().SLACK_TITLES[p.id]) + '</dd>' : '') +
        '<dt>Working in</dt><dd>' + (p.status === 'open' ? '—' : (flag(p.country) + ' ' + esc(p.city) + ', ' + esc(p.country))) + '</dd>' +
        '<dt>Contract</dt><dd>' + esc(p.contract) + '</dd>' +
        '<dt>Nationality</dt><dd>' + esc(p.nationality || '—') + '</dd>' +
        '<dt>Status</dt><dd>' + esc(p.status) + '</dd>' +
        '<dt>Start</dt><dd>' + esc(p.start || '—') + '</dd>' +
        '<dt>Reports to</dt><dd>' + (mgr ? esc(mgr.name) : '—') + '</dd>' +
      '</dl>' +
      '<div class="ot-sect">Reporting line</div><div class="ot-crumbs">' + crumbs + '</div>' +
      '<div class="ot-sect">Direct reports (' + reps.length + ')</div>' + repList;
  }
  function openDrawer(id) {
    var p = byId(id); if (!p || !_root) return;
    var d = _root.querySelector('[data-drawer]'), sc = _root.querySelector('[data-scrim]');
    d.innerHTML = drawerHTML(p); d.classList.add('on'); sc.classList.add('on');
    d.querySelector('[data-dclose]').onclick = closeDrawer;
    d.querySelectorAll('[data-goto]').forEach(function (b) { b.onclick = function () { openDrawer(b.dataset.goto); }; });
    var f = d.querySelector('[data-dclose]'); if (f) f.focus();
  }
  function closeDrawer() { if (!_root) return; var d = _root.querySelector('[data-drawer]'), sc = _root.querySelector('[data-scrim]'); if (d) d.classList.remove('on'); if (sc) sc.classList.remove('on'); }

  /* ---- render (mount shell once) + update (dynamic regions) ---- */
  var _root = null, _docWired = false;

  function render(root) {
    var t = WP.i18n.t;
    var viewer = WP.viewer && WP.viewer();
    if (!canView(viewer)) {
      root.innerHTML = '<div class="view-pad">' + ui.pageHeader({ title: t('orgTreeTitle') }) +
        '<div class="section ex-clear">' + ui.icon('lock', 18) + ' <span>' + esc(t('orgTreeDenied')) + '</span></div></div>';
      return;
    }
    _root = root;
    root.innerHTML =
      '<div class="ot-view">' +
        '<div class="ot-head">' +
          '<div class="ot-head-l"><span class="ot-badge">⚠ ' + esc(t('orgTreeSample')) + '</span>' +
            '<h1 class="ot-title">' + esc(t('orgTreeTitle')) + '</h1>' +
            '<p class="ot-sub">' + esc(t('orgTreeSub2')) + '</p></div>' +
          '<div class="ot-stats" data-stats></div>' +
        '</div>' +
        '<div class="ot-bar">' +
          '<label class="ot-search"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="11" cy="11" r="7"/><path d="m21 21-4.3-4.3"/></svg>' +
            '<input data-q type="search" placeholder="' + esc(t('orgTreeSearch2')) + '" autocomplete="off" aria-label="' + esc(t('orgTreeSearch2')) + '"></label>' +
          '<div class="ot-dd"><button class="ot-ddbtn" data-ddbtn aria-haspopup="true"></button><div class="ot-ddmenu" data-ddmenu role="menu"></div></div>' +
          '<button class="ot-fbtn" data-fbtn><svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 5h18M6 12h12M10 19h4"/></svg> ' + esc(t('orgTreeFilters')) + ' <span class="ot-fcount" data-fcount hidden></span></button>' +
          '<div class="ot-fpanel" data-fpanel hidden></div>' +
          '<div class="ot-result" data-result hidden></div>' +
        '</div>' +
        '<div class="ot-info" data-info hidden></div>' +
        '<div data-tree></div>' +
      '</div>' +
      '<div class="ot-scrim" data-scrim></div>' +
      '<aside class="ot-drawer" data-drawer role="dialog" aria-modal="true" aria-label="Person details"></aside>';

    // static wiring (survives updates)
    var q = root.querySelector('[data-q]');
    q.value = S.q;
    q.oninput = function () { S.q = q.value; update(); };
    root.querySelector('[data-ddbtn]').onclick = function (e) { e.stopPropagation(); S.ddOpen = !S.ddOpen; update(); };
    root.querySelector('[data-fbtn]').onclick = function () { S.fOpen = !S.fOpen; update(); };
    root.querySelector('[data-scrim]').onclick = closeDrawer;

    if (!_docWired) {
      _docWired = true;
      document.addEventListener('click', function (e) { if (_root && !e.target.closest('.ot-dd') && S.ddOpen) { S.ddOpen = false; update(); } });
      document.addEventListener('keydown', function (e) { if (e.key === 'Escape') { closeDrawer(); if (S.ddOpen) { S.ddOpen = false; update(); } } });
    }
    update();
  }

  function update() {
    if (!_root) return;
    var q = function (sel) { return _root.querySelector(sel); };
    q('[data-stats]').innerHTML = statStripHTML();
    q('[data-ddbtn]').innerHTML = ddBtnHTML();
    var dd = _root.querySelector('.ot-dd'); dd.classList.toggle('open', S.ddOpen);
    var menu = q('[data-ddmenu]'); menu.hidden = !S.ddOpen; menu.innerHTML = S.ddOpen ? ddMenuHTML() : '';
    var fp = q('[data-fpanel]'); fp.hidden = !S.fOpen; fp.innerHTML = S.fOpen ? filtersPanelHTML() : '';
    var fc = q('[data-fcount]'), n = secondaryCount(); fc.hidden = !n; fc.textContent = n;
    var rl = q('[data-result]'); var rh = resultHTML(); rl.hidden = !rh; rl.innerHTML = rh;
    var info = q('[data-info]'); var ih = infoHTML(); info.hidden = !ih; info.innerHTML = ih;
    q('[data-tree]').innerHTML = treeHTML();

    // dynamic wiring
    _root.querySelectorAll('[data-country]').forEach(function (b) { b.onclick = function () { S.country = S.country === b.dataset.country ? 'all' : b.dataset.country; S.city = 'all'; update(); }; });
    if (S.ddOpen) menu.querySelectorAll('[data-sq]').forEach(function (r) { r.onclick = function () { S.squad = r.dataset.sq || null; S.ddOpen = false; update(); }; });
    if (S.fOpen) fp.querySelectorAll('button[data-k]').forEach(function (b) { b.onclick = function () { var k = b.dataset.k; S[k] = b.dataset.v === 'all' ? 'all' : b.dataset.v; if (k === 'country') S.city = 'all'; update(); }; });
    _root.querySelectorAll('[data-reset]').forEach(function (b) { b.onclick = function () {
      // info-line reset only clears the squad; the result-line Reset clears everything.
      if (b.classList.contains('ot-xclose')) { S.squad = null; }
      else { S.q = ''; S.squad = null; S.country = 'all'; S.city = 'all'; S.contract = 'all'; S.level = 'all'; var qi = _root.querySelector('[data-q]'); if (qi) qi.value = ''; }
      update();
    }; });
    _root.querySelectorAll('.ot-chead[data-sq]').forEach(function (h) { h.onclick = function () { S.squad = h.dataset.sq; update(); }; });
    _root.querySelectorAll('[data-open]').forEach(function (b) { b.onclick = function () { openDrawer(b.dataset.open); }; });
  }

  WP.ui = WP.ui || {};
  WP.ui.orgTree = { render: render, canView: canView, _state: S };
})(window.WP = window.WP || {});
