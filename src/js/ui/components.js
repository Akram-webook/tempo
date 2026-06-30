/* ============================================================
 * Tempo — Shared UI helpers
 * ========================================================== */
(function (WP) {
  'use strict';

  function esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  /* CSS color value for a capacity state, read live from tokens. */
  function stateColor(stateObj) {
    return getComputedStyle(document.documentElement)
      .getPropertyValue(stateObj.token).trim() || 'var(' + stateObj.token + ')';
  }

  function tierColor(tierId) {
    // Tier 1 = overloaded-ish red weight, 2 = orange, 3 = green — purely for chip color.
    return ['', 'var(--state-overloaded)', 'var(--state-near)', 'var(--state-available)'][tierId];
  }

  function avatar(person, accentVar) {
    const inner = person.photo
      ? '<img src="' + esc(person.photo) + '" alt="" referrerpolicy="no-referrer" ' +
        'onerror="this.replaceWith(Object.assign(document.createElement(\'span\'),{textContent:\'' + esc(person.initials) + '\'}))" />'
      : esc(person.initials);
    return '<div class="avatar" style="--node-accent:' + accentVar + '">' + inner + '</div>';
  }

  /* Honest provenance pill — shows "Sample data" while the app is running on
   * seeded/mock numbers, so KPIs never read as live truth (trust signal). Hidden
   * once a backend is connected AND synced (then the numbers are real). Shared so
   * the badge stays consistent app-wide (dashboard, workload map, …). */
  function provenanceNote() {
    const t = WP.i18n.t;
    const db = WP.db;
    const live = db && db.usingBackend && db.usingBackend() && db.status && db.status.synced;
    if (live) return '';
    return '<div class="provenance-note" title="' + t('sampleDataHint') + '">' +
      WP.ui.icon('alert', 13) + ' ' + t('sampleData') + '</div>';
  }

  /* ============================================================
   * WBK PRO design-language parity — reusable shell pieces.
   * ONE breadcrumb + ONE page header + ONE status badge + ONE
   * sub-tab strip + ONE data table, reused across screens (not
   * per-screen copies). All token-driven, RTL-safe (logical CSS),
   * EN+AR via WP.i18n. ETHICS: these are presentation only — the
   * table renders exactly what the caller passes; no per-person
   * surveillance control lives here.
   * ========================================================== */

  // Breadcrumb above a page title (e.g. Home › Evaluations › List). Reuses the
  // existing .wbk-bc DS styles (RTL chevron mirror handled in CSS). Links carry
  // data-bc-go="<route>" and are wired once, centrally, in app.js.
  function breadcrumb(parts) {
    const sep = '<span class="wbk-bc-sep" aria-hidden="true">' + WP.ui.icon('chevR', 14) + '</span>';
    return '<nav class="wbk-bc" aria-label="' + esc(WP.i18n.t('breadcrumb')) + '">' + parts.map(function (p, i) {
      const last = i === parts.length - 1;
      const node = (!last && p.route)
        ? '<a href="#" data-bc-go="' + esc(p.route) + '">' + esc(p.label) + '</a>'
        : '<span' + (last ? ' aria-current="page"' : '') + '>' + esc(p.label) + '</span>';
      return node + (last ? '' : sep);
    }).join('') + '</nav>';
  }

  // Standard page header: breadcrumb + big title + one-line subtitle + a
  // right-aligned controls slot (primary action / scope / date). o.right is raw
  // HTML (caller-built controls); title/subtitle are escaped.
  function pageHeader(o) {
    return (o.crumbs ? breadcrumb(o.crumbs) : '') +
      '<div class="wbk-phead">' +
        '<div class="wbk-phead-t"><h1 class="wbk-phead-title">' + esc(o.title) + '</h1>' +
          (o.subtitle ? '<p class="wbk-phead-sub">' + esc(o.subtitle) + '</p>' : '') + '</div>' +
        (o.right ? '<div class="wbk-phead-r">' + o.right + '</div>' : '') +
      '</div>';
  }

  // Status badge — green Active / grey Inactive style (tones: ok | muted | warn | info).
  function statusBadge(tone, label) {
    return '<span class="wbk-status wbk-status--' + esc(tone) + '"><span class="wbk-status-dot"></span>' + esc(label) + '</span>';
  }

  // Sub-tab strip under a header (only where a page has genuine sub-views).
  // Buttons carry data-subtab="<val>"; the caller owns the active-state + wiring.
  function subTabs(items, active) {
    return '<div class="wbk-subtabs" role="tablist">' + items.map(function (it) {
      const on = it.val === active;
      return '<button type="button" class="wbk-subtab' + (on ? ' is-on' : '') + '" role="tab"' +
        ' aria-selected="' + (on ? 'true' : 'false') + '" data-subtab="' + esc(it.val) + '">' + esc(it.label) + '</button>';
    }).join('') + '</div>';
  }

  /* ---- Data table: search + Filters + sortable headers + status-badge cells +
   * per-row action icons + pagination. Self-contained — owns its UI state and
   * re-renders ONLY its own subtree (so typing in search never re-renders the
   * whole app or drops focus). Mount with WP.ui.table.mount(host, opts).
   * opts: { id, columns:[{key,label,num,sortable,get(row)}], rows, cell(row,key),
   *   rowId(row), searchText(row)->str, searchPlaceholder, filter:{label,get,values:[{val,label}]},
   *   actions(row)->[{act,icon,label}], onAction(act,id), onOpen(id), defaultSort:{key,dir},
   *   pageSizes:[..], emptyText } */
  const TBL = {}; // module-level per-id UI state (not persisted; survives re-renders)
  function tblState(o) {
    if (!TBL[o.id]) TBL[o.id] = { q: '', sort: o.defaultSort || null, filter: '__all', page: 1, size: (o.pageSizes && o.pageSizes[0]) || 10, fopen: false };
    return TBL[o.id];
  }
  function tblCmp(a, b) {
    if (typeof a === 'number' && typeof b === 'number') return a - b;
    return String(a == null ? '' : a).localeCompare(String(b == null ? '' : b));
  }
  function tblGet(col, row) { return col.get ? col.get(row) : row[col.key]; }
  function tblCompute(o) {
    const st = tblState(o);
    let rows = o.rows.slice();
    if (st.q && o.searchText) {
      const q = st.q.toLowerCase();
      rows = rows.filter(function (r) { return String(o.searchText(r)).toLowerCase().indexOf(q) >= 0; });
    }
    if (o.filter && st.filter !== '__all') rows = rows.filter(function (r) { return String(o.filter.get(r)) === String(st.filter); });
    if (st.sort) {
      const col = o.columns.filter(function (c) { return c.key === st.sort.key; })[0];
      if (col) rows.sort(function (a, b) { return tblCmp(tblGet(col, a), tblGet(col, b)) * (st.sort.dir === 'desc' ? -1 : 1); });
    }
    const total = rows.length;
    const pages = Math.max(1, Math.ceil(total / st.size));
    if (st.page > pages) st.page = pages;
    if (st.page < 1) st.page = 1;
    const start = (st.page - 1) * st.size;
    return { st: st, total: total, pages: pages, start: start, pageRows: rows.slice(start, start + st.size) };
  }
  function tableHTML(o) {
    const t = WP.i18n.t, c = tblCompute(o), st = c.st, ncol = o.columns.length + (o.actions ? 1 : 0);
    const search = o.searchText
      ? '<div class="search wbk-tbl-search">' + WP.ui.icon('search', 15) +
          '<input type="text" data-tbl-q value="' + esc(st.q) + '" placeholder="' + esc(o.searchPlaceholder || t('tblSearch')) +
          '" aria-label="' + esc(o.searchPlaceholder || t('tblSearch')) + '" /></div>'
      : '<span></span>';
    let filterBtn = '', chips = '';
    if (o.filter) {
      filterBtn = '<button type="button" class="btn wbk-tbl-filter" data-tbl-fopen aria-expanded="' + (st.fopen ? 'true' : 'false') + '">' +
        WP.ui.icon('filter', 15) + ' ' + t('tblFilters') + (st.filter !== '__all' ? ' <span class="wbk-tbl-fcount">1</span>' : '') + '</button>';
      if (st.fopen) {
        const vals = [{ val: '__all', label: t('tblAll') }].concat(o.filter.values);
        chips = '<div class="wbk-tbl-chips" role="group" aria-label="' + esc(o.filter.label) + '">' + vals.map(function (v) {
          const on = String(st.filter) === String(v.val);
          return '<button type="button" class="wbk-fchip' + (on ? ' is-on' : '') + '" data-tbl-filter="' + esc(v.val) + '" aria-pressed="' + (on ? 'true' : 'false') + '">' + esc(v.label) + '</button>';
        }).join('') + '</div>';
      }
    }
    const thead = '<thead><tr>' + o.columns.map(function (col) {
      const numCls = col.num ? ' wbk-th-num' : '';
      if (!col.sortable) return '<th class="' + numCls.trim() + '">' + esc(col.label) + '</th>';
      const active = st.sort && st.sort.key === col.key, dir = active ? st.sort.dir : '';
      return '<th class="wbk-th-sort' + numCls + '" aria-sort="' + (active ? (dir === 'desc' ? 'descending' : 'ascending') : 'none') + '">' +
        '<button type="button" class="wbk-sort-btn" data-tbl-sort="' + esc(col.key) + '">' + esc(col.label) +
          '<span class="wbk-sort-caret' + (active ? ' is-' + dir : '') + '">' + WP.ui.icon('caret', 14) + '</span></button></th>';
    }).join('') + (o.actions ? '<th class="wbk-th-actions"><span class="sr-only">' + t('tblActions') + '</span></th>' : '') + '</tr></thead>';
    let body;
    if (!c.pageRows.length) {
      body = '<tbody><tr><td class="wbk-tbl-empty" colspan="' + ncol + '">' + esc(o.emptyText || t('tblEmpty')) + '</td></tr></tbody>';
    } else {
      body = '<tbody>' + c.pageRows.map(function (row) {
        const id = o.rowId ? o.rowId(row) : row.id;
        const cells = o.columns.map(function (col) { return '<td class="' + (col.num ? 'wbk-td-num' : '') + '">' + o.cell(row, col.key) + '</td>'; }).join('');
        const acts = o.actions ? '<td class="wbk-td-actions">' + (o.actions(row) || []).map(function (a) {
          return '<button type="button" class="wbk-row-act" data-tbl-act="' + esc(a.act) + '" data-tbl-row="' + esc(id) + '" title="' + esc(a.label) + '" aria-label="' + esc(a.label) + '">' + WP.ui.icon(a.icon, 16) + '</button>';
        }).join('') + '</td>' : '';
        const openable = o.onOpen ? esc(id) : '';
        return '<tr data-tbl-open="' + openable + '"' + (openable ? ' tabindex="0" role="button"' : '') + '>' + cells + acts + '</tr>';
      }).join('') + '</tbody>';
    }
    const sizes = o.pageSizes || [10, 25, 50];
    const sizeSel = '<label class="wbk-tbl-size">' + t('tblPerPage') + ' <select data-tbl-size>' +
      sizes.map(function (n) { return '<option value="' + n + '"' + (n === st.size ? ' selected' : '') + '>' + n + '</option>'; }).join('') + '</select></label>';
    const from = c.total ? c.start + 1 : 0, to = Math.min(c.start + st.size, c.total);
    const count = '<span class="wbk-tbl-count">' + esc(t('tblShowing').replace('{from}', from).replace('{to}', to).replace('{total}', c.total)) + '</span>';
    let nums = '';
    for (let p = 1; p <= c.pages; p++) nums += '<button type="button" class="wbk-pg-n' + (p === st.page ? ' is-on' : '') + '" data-tbl-page="' + p + '"' + (p === st.page ? ' aria-current="page"' : '') + '>' + p + '</button>';
    const prev = '<button type="button" class="wbk-pg-n" data-tbl-page="' + (st.page - 1) + '"' + (st.page <= 1 ? ' disabled' : '') + ' aria-label="' + t('tblPrev') + '">' + WP.ui.icon('chevL', 16) + '</button>';
    const next = '<button type="button" class="wbk-pg-n" data-tbl-page="' + (st.page + 1) + '"' + (st.page >= c.pages ? ' disabled' : '') + ' aria-label="' + t('tblNext') + '">' + WP.ui.icon('chevR', 16) + '</button>';
    const footer = '<div class="wbk-tbl-foot">' + sizeSel + count + '<div class="wbk-tbl-pages">' + prev + nums + next + '</div></div>';
    return '<div class="wbk-tbl-bar">' + search + '<div class="wbk-tbl-bar-r">' + filterBtn + '</div></div>' + chips +
      '<div class="wbk-table-wrap"><table class="wbk-table wbk-table--zebra">' + thead + body + '</table></div>' + footer;
  }
  function tableWire(host, o) {
    const st = tblState(o);
    const rerender = function (refocus) {
      host.innerHTML = tableHTML(o);
      tableWire(host, o);
      if (refocus) { const i = host.querySelector('[data-tbl-q]'); if (i) { i.focus(); const v = i.value; i.value = ''; i.value = v; } }
    };
    const q = host.querySelector('[data-tbl-q]');
    if (q) q.oninput = function () { st.q = q.value; st.page = 1; rerender(true); };
    host.querySelectorAll('[data-tbl-sort]').forEach(function (b) {
      b.onclick = function () {
        const key = b.dataset.tblSort;
        if (st.sort && st.sort.key === key) st.sort.dir = st.sort.dir === 'asc' ? 'desc' : 'asc';
        else st.sort = { key: key, dir: 'asc' };
        rerender();
      };
    });
    const fo = host.querySelector('[data-tbl-fopen]');
    if (fo) fo.onclick = function () { st.fopen = !st.fopen; rerender(); };
    host.querySelectorAll('[data-tbl-filter]').forEach(function (b) { b.onclick = function () { st.filter = b.dataset.tblFilter; st.page = 1; rerender(); }; });
    host.querySelectorAll('[data-tbl-page]').forEach(function (b) { if (b.disabled) return; b.onclick = function () { st.page = parseInt(b.dataset.tblPage, 10); rerender(); }; });
    const sz = host.querySelector('[data-tbl-size]');
    if (sz) sz.onchange = function () { st.size = parseInt(sz.value, 10); st.page = 1; rerender(); };
    host.querySelectorAll('[data-tbl-act]').forEach(function (b) { b.onclick = function (e) { e.stopPropagation(); if (o.onAction) o.onAction(b.dataset.tblAct, b.dataset.tblRow); }; });
    if (o.onOpen) host.querySelectorAll('[data-tbl-open]').forEach(function (r) {
      if (!r.getAttribute('data-tbl-open')) return;
      r.onclick = function (e) { if (e.target.closest('[data-tbl-act]')) return; o.onOpen(r.getAttribute('data-tbl-open')); };
      r.onkeydown = function (e) { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); o.onOpen(r.getAttribute('data-tbl-open')); } };
    });
  }
  function tableMount(host, o) { if (!host) return; host.innerHTML = tableHTML(o); tableWire(host, o); }

  WP.ui = WP.ui || {};
  // Transient toast — REUSES the WBK `.wbk-toast` DS component (markup + styles already
  // shipped). The app had the component but no runtime show-helper, so this adds only the
  // mount + auto-dismiss behaviour (one shared aria-live host, created once). Never throws.
  function toast(message, status) {
    try {
      var host = document.getElementById('wbk-toast-host');
      if (!host) {
        host = document.createElement('div');
        host.id = 'wbk-toast-host';
        host.setAttribute('aria-live', 'polite');
        document.body.appendChild(host);
      }
      var el = document.createElement('div');
      el.className = 'wbk-toast wbk-is-' + (status || 'success');
      el.innerHTML = '<span class="wbk-status-dot"></span><span>' + esc(message) + '</span>';
      host.appendChild(el);
      setTimeout(function () {
        el.classList.add('wbk-toast-out');
        setTimeout(function () { if (el.parentNode) el.parentNode.removeChild(el); }, 220);
      }, 2600);
    } catch (e) {}
  }

  WP.ui.esc = esc;
  WP.ui.stateColor = stateColor;
  WP.ui.tierColor = tierColor;
  WP.ui.toast = toast;
  WP.ui.avatar = avatar;
  WP.ui.provenanceNote = provenanceNote;
  WP.ui.breadcrumb = breadcrumb;
  WP.ui.pageHeader = pageHeader;
  WP.ui.statusBadge = statusBadge;
  WP.ui.subTabs = subTabs;
  WP.ui.table = { html: tableHTML, wire: tableWire, mount: tableMount, _state: TBL };
})(window.WP = window.WP || {});
