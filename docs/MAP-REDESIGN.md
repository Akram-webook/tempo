# Tempo — Workload Map Redesign

> Grounded in `src/js/ui/workloadMap.js`, `src/js/chart-boot.js`, `build.js`, and the before/after
> captures under `docs/shots/map-fullwidth/`, `docs/shots/map-simple-tree/`, `docs/shots/ops-chart/`.
> Descriptive of what ships today. See also [`FEATURES.md`](FEATURES.md) §2 (Workload map) and
> [`ROLES.md`](ROLES.md) (who sees which nodes).

The Workload Map is Tempo's home screen: the org chart **and** the capacity read in one view — who
reports to whom, what each person is carrying, and where attention is needed. The redesign's job was
to make a ~37-person / 5-department org **scan at a glance** without turning into an unreadable wall
of cards, and to stay honest about scale (no premature infinite-canvas engineering).

---

## 1. The problem it solved

The earlier map rendered every node expanded and full-detail, so the first view was a dense,
overflowing grid you had to scroll to parse (see `docs/shots/map-fullwidth/before-*` and
`docs/shots/map-simple-tree/before-*`). The redesign traded "show everything" for **progressive
disclosure + density control + a full-width layout**, so the first paint fills the canvas with the
leadership spine and each team drills in on demand.

---

## 2. What shipped

### Progressive disclosure (default collapsed)
- On first render only the leadership spine is open; each team's internals are collapsed
  (`defaultCollapsed`). One click on a team card drills in. This keeps the first view readable and
  fills the canvas instead of overflowing it.
- `expandAll` / `collapseAll` act on the current scope; collapse state is per-subtree (`collapsed`).

### Density toggle — compact (default) / detailed
- **Compact** is the default so a large team scans at a glance: photo + name + a small workload bar +
  the workload **color** (the key signal). **Detailed** restores the full card.
- Persisted **per signed-in user** via the identity-namespaced key (`tempo_map_density` through
  `WP.identity.nsKey`) — never a global key, and never throws if storage is gone (`loadDensity` /
  `saveDensity`).

### Focus mode
- The target icon on a team card scopes the tree to that subtree (`focusId`), with a one-shot
  enter/exit animation (`animateNext`). A breadcrumb returns to the full org.

### Tree / list toggle
- `listMode` swaps the chart for a flat, sortable list of the same people — useful for search and
  bulk scanning. Both modes read the same access-scoped data.

### Unified search, date navigation, node peek
- One search box matches people **and** teams (`role="combobox"`, `aria-autocomplete="list"`).
- Date navigation (`prev` / `next` / `today`) drives the capacity window; the label is `aria-live`.
- Clicking an avatar opens the **node-peek** popover — a lightweight profile without leaving the map.

### Full-width layout + responsive
- The canvas now uses the full content width (`docs/shots/map-fullwidth/after-*`), with layouts
  verified narrow → wide and in both themes and RTL/LTR (`after-mobile-*`, `after-wide-*`,
  `*-ar-*` captures).

### Accessibility
- Collapse buttons carry `aria-expanded` + localized `showTeamA11y` / `hideTeamA11y` labels; focus,
  date-nav, and search controls are keyboard-reachable with aria labels; icons are inline SVG.

---

## 3. Deliberately NOT built (scope discipline)

Per the note in `workloadMap.js`: an **infinite-canvas + minimap** (Figma-style zoom/pan) was
**deliberately deferred** — it is over-engineering for ~37 people / 5 departments. The vertical
stack + density toggle + focus mode solve the real readability pain. **Upgrade path** if the org ever
reaches hundreds–thousands of nodes: introduce a virtualized pan/zoom viewport (transform-scaled
viewport + minimap) — the data + render stay; only the viewport wrapper changes. Revisit only at
that scale. (Simplicity, Constitution Art. III.)

---

## 4. Standalone "Operations Chart" export (`chart.html`)

`build.js` emits a second page, `dist/chart.html`, booted by `chart-boot.js`:

- **Public, read-only, SAMPLE DATA only.** No login, no app shell, no backend — it never loads
  auth/db/Supabase, so it **cannot reach real people**. Emails are stripped at build
  (`buildPage('chart.html', …, { stripEmails: true })`).
- It **reuses the same org data + the same `workloadMap` chart renderer + WBK V3 tokens** as the app,
  swapping only the shell for a slim standalone header (`WP.EMBED = true` tells `workloadMap` to skip
  the in-app page header/breadcrumb).
- The in-app map links to it (the fullscreen / "Operations Chart" button) plus a copy-link action.
- A visible "sample data" chip keeps it honest that this is not real workforce data.

---

## 5. Tests

- `test/verify-chart-entrypoint.js` — the standalone entrypoint boots and renders the chart.
- `test/verify-ops-chart.js` — the Operations Chart export behavior (sample-only, no auth/db reach).

> Sources: `src/js/ui/workloadMap.js`, `src/js/chart-boot.js`, `build.js`,
> `docs/shots/{map-fullwidth,map-simple-tree,ops-chart}/`, `docs/FEATURES.md` §2,
> `test/verify-chart-entrypoint.js`, `test/verify-ops-chart.js`.
