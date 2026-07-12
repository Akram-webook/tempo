# Tempo — Security Model

> Grounded in `src/js/core/access.js`, `src/js/ui/login.js`, `src/js/core/config.js`, the CLAUDE.md
> GOLDEN RULES, and `ai-os/REFERENCES.md` (OWASP). Referenced from `access.js:114`. Describes what
> ships today and names, honestly, what does **not** yet lock.

Tempo runs as a **static bundle** (GitHub Pages) with a Supabase backend for identity and data. That
shape drives the whole model: the client can *filter and deter*, but only the **edge** and the
**data layer** can truly *enforce*. We say so plainly rather than imply the client is a lock.

---

## 1. The three gates (defence in depth)

| Layer | What it enforces | Ships today? |
| --- | --- | --- |
| **Identity** (Supabase Auth) | You are who you say — verified email session, never a typed string | ✅ Yes |
| **App-level allow-list** (`access.js`) | Only granted people pass the sign-in screen | ✅ Yes (deters, not a true lock) |
| **Edge gate** (Cloudflare Access, **F3**) | The bundle itself won't load for non-org identities | ❌ Not yet (infra / Akram) |
| **Data RLS** (Supabase row-level security) | Rows/fields enforced server-side per identity | Partial — per-entity; the real backstop |

The honest summary: **on a public static host, the app-level allow-list deters but does not prevent
access to the bundle.** True lockdown is F3 (edge) + RLS (data). Until F3 lands, treat anything in
the bundle as public-readable and keep all real personal data server-side under RLS.

---

## 2. Authentication (`src/js/ui/login.js`)

Four selectable auth modes (`WP.config.authMode`): `verified-link`, `password`, `google`,
`directory` (demo). Live modes:

- **Verified Link** — Supabase OTP email (`signInWithOtp`); the link's token is consumed on boot
  (`initSession` → `detectSessionInUrl`).
- **Password** — Supabase email + password (`signInWithPassword`), with "stay signed in" via a
  persisted session.
- **Password recovery** — a reset/set-password link lands as a `PASSWORD_RECOVERY` auth event and is
  **diverted** to a set-new-password screen (`WP._recovery` / `step: 'setpw'`); sign-in only
  completes **after** the new password is set.

**Anti-impersonation invariant (do not regress).** We send the typed email/password to Supabase, but
the identity we act on is **only** `session.user.email` from the verified session — never the string
the user typed. So a session for email X can never resolve to person Y, and there is no account
picker. Wrong email *or* wrong password returns one generic error (`errBadCreds`) — we never reveal
which was wrong (OWASP: no user-enumeration).

**Post-auth gate.** After a verified session maps to a registered person, `WP.access.hasAccess(id)`
must be true or the user is denied and signed out (`handleSession` / `signInWithPassword`). Domain
(`@webook.com`) + registration in `WP.data.PEOPLE` are required.

---

## 3. Authorization

The single UI gate is **`WP.can(cap, targetId?)`** — a four-role + eight-capability engine
(`resetPassword` / `manageRoles` / `editSettings` are **admin-only**). Because it delegates to the
same relationship helpers the DB mirrors, a hidden/denied button is also a denied query — not
security-by-hiding. Full role tiers, the capability matrix, the sensitive-field line, and the entry
allow-list are documented in [`ROLES.md`](ROLES.md). Server-side, the same shape is enforced by
Supabase RLS (ADR-0001):
`evaluations`, `events`, `people`, and sensitive `growth` are RLS-gated; bundled mock entities are
presentation-only and must never be treated as real (ADR-0005).

---

## 4. Secret hygiene (GOLDEN RULES #3)

- **Public-safe, fine to commit:** the Supabase URL and the `sb_publishable_…` / anon key
  (`config.js`). These are designed to be shipped to the browser.
- **Never in the front-end or repo:** the Supabase `service_role` key or any private key. RLS is what
  makes the publishable key safe — do not "fix" a permissions gap by embedding a privileged key.
- **No real personal data or passwords in the repo or bundle** — they live only in Supabase. Mock
  data is synthetic.

---

## 5. Reporting & follow-ups

- **F3 (Cloudflare Access edge gate)** is the top open item to make the allow-list a true lock — it
  is infra/Akram's call and has not shipped (`WAVE-D-runbook.md`).
- Any auth/access/RLS change must extend a `test/verify-*.js` suite (anti-impersonation,
  access-escalation, allow-list) and pass the finish-gate before merge.
- Treat every production access issue as an **Escape** (`ai-os/05-qa/ESCAPE-LEARNING.md`): close it
  only with a permanent test that prevents recurrence.

> Sources: `src/js/ui/login.js`, `src/js/core/access.js`, `src/js/core/config.js`, CLAUDE.md GOLDEN
> RULES, `docs/adr/0001-rls-access-model.md`, `docs/adr/0005-never-blank-mock-fallback.md`,
> `docs/WAVE-D-runbook.md`, `ai-os/REFERENCES.md` (OWASP).
