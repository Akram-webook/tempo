---
name: tempo-settings-section
description: How to add or extend a Settings section in Tempo (Settings v2 = "My settings" personal + "Workspace" admin tabs). Use when building any settings/preferences/notifications/account/admin-config UI.
---

# Tempo — building a Settings section

Settings v2 lives in `src/js/ui/settings.js` and is split into two tabs:
- **My settings** (`tab='mine'`) — every signed-in user. Account (read-only), Preferences, Notifications.
- **Workspace** (`tab='workspace'`) — gated by `WP.can('viewSettings')` (admin/director). Org config: tiers, states, roles explainer, Slack linking.

Tab state is `WP._settingsTab` (remembered across re-renders). A non-admin who forces `'workspace'` falls back to `'mine'`.

## Where things live
- **Personal prefs** → `WP.state.prefs` (persisted per-user via `SAVE_KEYS` in `core/state.js`). Read/write with `WP.prefs.get('a.b.c')` / `WP.prefs.set('a.b.c', v)` (set persists + re-renders). Defaults + deep-merge in `DEFAULT_PREFS`/`mergePrefs` — **add new keys there** so old saves don't yield `undefined`.
- **theme / lang** stay top-level state (they drive `applyDocAttrs`), set via `WP.setState({theme})` / `{lang}`.
- **density** → `data-density` attr on `<html>` (set in `applyDocAttrs`); consumed by `:root[data-density="compact"]` CSS. Keep compact rules conservative (pads/gaps only) to avoid per-view breakage.
- **date format** → `WP.fmt.date(value)` honors `prefs.dateFormat` ('auto'|'dmy'|'mdy'|'iso').

## Building blocks (already in settings.js — reuse them)
- `settingRow(label, note, controlHTML)` — a row with **inline microcopy under the control** (SaaS best practice: explain every option right beneath it). Always pass a `note`.
- `toggle(id, on, aria)` — accessible switch (checkbox + `.tgl`). Wire `el.onchange` → `WP.prefs.set(path, el.checked)`.
- `segmented(name, [{val,label}], current)` — reuses the existing `.seg` component (`button.active`). Wire via the `[data-seg]` handler: theme/lang → `setState`; everything else → `WP.prefs.set`.
- Group with `<div class="mini-label">` headers; wrap sections in `.section`.

## Do / Don't
- ✅ A preference must **do something + persist + confirm** (toast `prefSaved`). Wire effect + persistence + toast together — never ship an inert control.
- ✅ Every new string in `i18n.js` as `{en, ar}`. Render must survive AR/dark.
- ✅ Gate admin sections with `WP.can('viewSettings')` / `'editSettings'`; never assume the viewer is admin.
- ✅ Guard the `__admin__` sentinel viewer (no `email`/`byId` row) in any account/profile read.
- ❌ Don't hand-edit `dist/`. Don't invent a new control when `.seg`/`.tgl`/`subTabs` fit.
- ❌ Don't put real secrets/passwords in prefs or the bundle (see `tempo-secure-data`).

## When you split/rename a page into tabs
Grep the tests FIRST for anything that renders it: `grep -rn "WP.ui.<view>.render" test/`. A test that asserts markup now behind a non-default tab must set the tab (`WP._settingsTab='workspace'`) before asserting. Add a new `verify-*.js` covering: gating (who sees which tab), each control renders, a change persists, i18n EN+AR, AR/dark render. Register it in `package.json`.

## Grounded in
Nicelydone (workspace/account/notification-settings patterns), memorable.design (SaaS settings 2026), Equal.design (in-app notification best practice: group by channel, allow frequency + mute). Tempo CLAUDE.md golden rules + `tempo-frontend-craft`.
