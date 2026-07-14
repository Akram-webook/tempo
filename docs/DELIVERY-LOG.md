# Tempo — Delivery Log (for BA → Excel → Director)

Every finished item is logged here in a **paste-ready** row so the BA can drop it into the
tracking sheet and the Director can see what shipped, whether it was a **Feature** or a **Bug
fix**, and where we are. Newest at the top.

**Column key:** Date · Type (Feature / Bug fix / Improvement) · Title · What changed (plain) ·
Value (why it matters) · Status · PR · Live?

| Date | Type | Title | What changed | Value | Status | PR | Live |
|------|------|-------|--------------|-------|--------|----|------|
| 2026-07-14 | Improvement | Settings simplified (Akram review) | Trimmed My settings to what people actually use: role now explains itself in plain words; removed density, date-format picker, quiet hours, digest, in-app channel, last-sign-in, device list, sign-out-everywhere, and the privacy catalogue + data export. Notifications is now two simple questions (what / where); Security is just "change my password"; Privacy is one reassurance line. | Easier and faster to read; no clutter. Directly from Akram's feedback. | Shipped | #87 | ⏳ |
| 2026-07-14 | Feature (superseded) | Settings → Privacy (export) | Detailed "what Tempo tracks" catalogue + "export my data" (#86) — **removed in #87** as unnecessary; replaced by a single one-line privacy reassurance. | — | Reverted | #86→#87 | ➖ |
| 2026-07-14 | Feature | Settings → Privacy | A plain-language list of exactly what Tempo keeps about you (with a why for each), a clear "what Tempo never does" statement (no keystroke/presence/location tracking), and one-click "Download my data" (only your own). | Builds trust — people see the no-surveillance promise made concrete, and can take a copy of their data. | Shipped | #86 | ⏳ |
| 2026-07-14 | Feature | Executive status (deck link) | A one-click "Executive status" entry point (dashboard card + account-menu item) that opens the live Executive Status Deck in a new tab. Director + Admin only; hidden until the deck link is set. | The director reaches the live portfolio deck instantly from inside Tempo, without hunting for a link. | Shipped (awaiting deck link) | #85 | ⏳ |
| 2026-07-14 | Feature | Settings → Security | Change your password (secure emailed link — we never see it), see your last sign-in, and "sign out everywhere" (all devices at once). 2FA marked coming-soon. | Users control their own account security; a lost/shared device can be cut off instantly. | Shipped | #84 | ✅ |
| 2026-07-14 | Feature | Settings → Members & Access | Manage who can sign in (the access allowlist) + see each person's role, from the UI. Was editable only in code before. | Admins control access without a developer; every change is logged. | Shipped | #82 | ✅ |
| 2026-07-14 | Feature | Settings v2 (personal + workspace) | Split Settings into "My settings" (account, appearance, language, density, date format, notifications) for everyone, and "Workspace" (org config) for admins. | Every user can manage themselves; admin config no longer clutters everyone's view. | Shipped | #81 | ✅ |
| 2026-07-13 | Improvement | QA/UX-UI audit fixes | Reusable in-app dialogs (no more raw browser popups), WCAG contrast fixes, explainable burnout flag, mobile sign-in button, Arabic greeting. | Cleaner, more accessible, more professional across the app. | Shipped | #80 | ✅ |
| 2026-07-13 | Bug fix | Password-only sign-in | Sign-in is now password-only; a leftover Google session can no longer let someone back in. | Closes an access-control hole; only people with a password get in. | Shipped | #79 | ✅ |
| 2026-07-13 | Bug fix | Audit safe fixes | Fixed two crash cases (profile, assignment), rating-scale accessibility, empty states, undefined color tokens, mobile popovers. | Fewer crashes, more accessible, tidier UI. | Shipped | #78 | ✅ |
| 2026-07-13 | Bug fix | Account button too small to tap | Enlarged the top-right account control to a proper 44px tap target. | Fixes a "can't click it" complaint on smaller screens. | Shipped | #77 | ✅ |
| 2026-07-13 | Bug fix | Settings dead space | Removed the wasted empty strip on the Settings page (grid layout fix). | Page uses the full width; looks finished. | Shipped | #76 | ✅ |

## Open / next (roadmap — not yet built)
| Type | Title | Note |
|------|-------|------|
| Feature | Settings → Security | Change my password + active sessions + "sign out everywhere". Pairs with B1's password work. |
| Feature | Settings → Privacy | "What Tempo tracks about me" + export my data. |
| Feature | Settings → Help/About | App version, keyboard shortcuts, support/contact. |
| Feature | Notification delivery | Notification preferences are saved but not yet acted on — wire real email/Slack/in-app sending. |
