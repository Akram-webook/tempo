# Lessons

A running log of what worked, what nearly broke, and the rule to remember. Append newest at the top.

## 2026-07-14 — Settings v2 (personal / workspace split, preferences, notifications)
- **What worked:** Researched world-class settings IA first (Nicelydone / memorable.design / Equal.design) instead of guessing — confirmed the personal-vs-workspace split, "microcopy under every control", and the notifications model (channel × category + digest + quiet-hours). Reused existing components (`.seg`, `ui.subTabs`, `overlay-host`) rather than inventing new ones, so the new UI inherited house styling for free. Added `WP.prefs` with a `mergePrefs()` deep-merge so new pref keys never come back undefined on an old saved session.
- **What nearly broke / the gotcha:** Moving admin org-config under a "Workspace" tab silently broke `verify-settings-layout.js`, which rendered Settings and looked for tier/Slack markup that is now behind a non-default tab. Fix: the test sets `WP._settingsTab = 'workspace'` before asserting. Also the `__admin__` sentinel viewer has no `email`/`byId` row — the Account section had to guard (`WP.viewer()` + optional `roleLabel`) or it would throw.
- **What I'd do differently next time:** When splitting a page into tabs, grep the tests for anything that renders that page BEFORE running the suite — you can predict the break and fix the test in the same edit.
- **Rule to remember:** A preference control must actually DO something and PERSIST + confirm — `data-density` was inert until a CSS rule consumed it. Wire the effect, the persistence, and the saved-toast together, or it's a fake setting.
