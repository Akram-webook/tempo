# Tempo — Roles & Permissions

> Grounded in `src/js/core/access.js` (the single source of truth) + `docs/ACCESS-MODEL.md` +
> `test/verify-permissions.js`. Reflects the `WP.can()` role/capability engine shipped in
> `wave/roles-can-engine` (PR #65). This doc is descriptive — if code and this doc disagree, the
> code wins and this doc is the bug.

Tempo answers two orthogonal questions for every viewer:

1. **May you enter the app at all?** → the **access allow-list** (`hasAccess`), separate from role.
2. **Once in, what may you see and do?** → your **role + capabilities** via `WP.can(cap, target)`.

`WP.can()` is the **single gate the UI checks**. Because it delegates to the same relationship
helpers the DB RLS mirrors, a hidden/denied button is also a denied query — not security-by-hiding.

---

## 1. The four roles

Every person carries a `level` (from `WP.data.PEOPLE`) plus an optional `superAdmin` flag.
`roleOf(viewer)` normalizes those into exactly four roles:

| Role | Derived from (`level` / flag) | Scope |
| --- | --- | --- |
| **admin** | `superAdmin` OR `level: 'admin'` | Everything; the only role that can reset passwords / manage roles / edit settings |
| **director** | `level: 'director'` | Org-wide view + sensitive + manage access; cannot reset passwords or edit settings |
| **manager** | `level: 'sr_manager'` or `'manager'` | Self + team (recursive reports); sensitive only for direct reports |
| **member** | `level: 'spec'`, `'sr_spec'`, or unknown | Self only; view-only |

- **Super Admin** = `akram@webook.com` (`superAdmin: true`) → `admin`.
- A missing/unknown viewer defaults to `member` (fail-closed).
- `WP.roleOf(viewer?)` resolves the current viewer when no argument is given.

---

## 2. The capability matrix (`WP.can(cap, targetId?)`)

`WP.can(cap, target)` gates the current viewer; `WP.access.can(cap, viewer, target)` gates an
explicit viewer. Eight capabilities ship today:

| Capability | admin | director | manager | member | Rule (from `access.js`) |
| --- | :---: | :---: | :---: | :---: | --- |
| `viewOrg` | ✅ | ✅ | ✅ | ✅ | any signed-in viewer |
| `viewSensitive` (no target) | ✅ | ✅ | ❌ | ❌ | director/admin org-wide |
| `viewSensitive` (with target) | ✅ | ✅ | ✅¹ | ✅² | `canSeeSensitive` — self, direct manager, or director |
| `writeEval` (no target) | ✅ | ✅ | ✅ | ❌ | `canAct` (managers+) |
| `writeEval` (with target) | ✅ | ✅ | ✅¹ | ✅² | `canSeeSensitive(target)` |
| `manageAccess` | ✅ | ✅ | ❌ | ❌ | admin or director |
| `viewSettings` | ✅ | ✅ | ❌ | ❌ | admin or director |
| `resetPassword` | ✅ | ❌ | ❌ | ❌ | **admin only** |
| `manageRoles` | ✅ | ❌ | ❌ | ❌ | **admin only** |
| `editSettings` | ✅ | ❌ | ❌ | ❌ | **admin only** |
| _unknown cap_ | ❌ | ❌ | ❌ | ❌ | `default: false` (fail-closed) |

¹ manager: only for their **direct reports** (relationship-scoped, not skip-level).
² member: only for **themselves** (`self`).

The relationship-scoped caps (`viewSensitive` / `writeEval` **with a target**) collapse to
`canSeeSensitive` — the sensitive-field line below — so managers cannot reach skip-level reports or
peers, and members are limited to their own record.

---

## 3. The underlying predicates (`WP.access.*`)

`WP.can()` composes these; call the specific one when you need finer detail than a capability:

| Predicate | Truth rule |
| --- | --- |
| `visiblePeople(viewer)` | admin/director → all; manager → `teamOf(self)`; member → self only |
| `teamOf(id)` | self + all recursive `directReports` |
| `canSee(viewer, targetId)` | `targetId ∈ visiblePeople(viewer)` |
| `canAct(viewer)` | managers+ act; specialists view-only |
| `canManage(viewer)` | `superAdmin`/`admin`/`director` (opens the permissions screen) |
| `isSuperAdmin(viewer)` | `superAdmin` or `admin` |
| `canSeeSensitive(viewer, targetId)` | relationship is `self`, `manager` (direct), or `director` — **no skip-level, no peers** |
| `canSeeUpward(viewer, managerId)` | strictly **above** M in the chain, or admin — never M or below |
| `canSeeComp(viewer)` | director or admin only (budget authority) |
| `relationshipTo(viewer, targetId)` | `self` / `manager` / `director` / `senior` (up-chain) / `none` |

**Field-level privacy line.** Operational data (load, availability, daily check-in) is visible to
anyone who can see the person. **Sensitive** data (growth areas, manager's notes, EQ, retention-risk,
promotion signal) opens **only** along the direct management line — self, direct manager, or
director/HR (`canSeeSensitive`). Skip-level managers and peers are excluded by design to protect
candor (ADR-0001).

---

## 4. The access allow-list (entry gate — separate from role)

Distinct from role: "has this person been granted entry to the app at all?"

- **2026-07 lockdown:** `ALLOWLIST = { p_akram, p_ahmed, p_farah, p_motaa }` in `access.js`. Only
  these four may enter; everyone else hits the "access denied" screen and is signed out.
- Enforced at sign-in for **all** auth modes via `WP.access.hasAccess(personId)` (see `login.js`
  `handleSession` / `signInWithPassword`).
- **Fully reversible:** widen `ALLOWLIST`, grant from the admin access screen (`grantAccess`, gated
  by `manageAccess`), or restore the old "all non-`tbc` granted" line. Domain (`@webook.com`) +
  verified identity are enforced separately and always.
- `grantAccess` / `listAccess` / `setAccess` let an admin toggle and the persistence layer restore
  the exact granted set on reload.

> **Important — this is an app-level gate, not a true lock.** On a public static host (GitHub Pages)
> the allow-list *deters* but does not *prevent* access to the bundle. The real lock is an edge gate
> (Cloudflare Access, feature **F3**) or a server backend + Supabase RLS on the data. See
> [`SECURITY.md`](SECURITY.md). F3 has **not shipped yet** (infra / Akram — see `WAVE-D-runbook.md`).

---

## 5. Adding or changing a role or capability

1. To place a person, set `level` (and `superAdmin` for admin) in the data / Supabase.
2. To add a capability, extend the `can()` switch in `access.js` with a **named cap** delegating to a
   predicate — do not add a generic action sink, and keep `default: false` (fail-closed).
3. Extend `test/verify-permissions.js`: assert the cap for each of the four roles, and that a viewer
   **cannot** escalate (skip-level sensitive, cross-team, admin-only caps).
4. Mirror the rule in Supabase RLS so the denied button is also a denied query.
5. Update this doc + `docs/ACCESS-MODEL.md` in the same PR.

> Sources: `src/js/core/access.js`, `test/verify-permissions.js`, `docs/ACCESS-MODEL.md`,
> `docs/adr/0001-rls-access-model.md`, `docs/FEATURES.md` §1, `docs/WAVE-D-runbook.md` (F3).
