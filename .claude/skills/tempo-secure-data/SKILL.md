---
name: tempo-secure-data
description: >-
  Use when touching auth, sessions, Supabase RLS, SQL migrations, WP.db data
  access, or anything handling real people/evaluations in Tempo — sign-in flows
  (login.js), row-level-security predicates, secret hygiene, query performance,
  and the ethics invariants. Apply BEFORE writing auth/RLS/migration code and as
  a review gate after.
---

# Tempo — Secure Data & Auth

Master checklist for the backend/data/auth lane. Grounded in OWASP ASVS 4.0,
Microsoft SDL, Supabase Auth/RLS docs, PostgreSQL RLS, and 12-Factor. Tempo's
own supreme law is `ai-os/CONSTITUTION.md` (Human-First: track work, never
surveil people). This skill turns those into concrete do/don't + skeletons.

---

## 0. The HARD rule (never negotiable)

**Real personal data, passwords, and secrets live ONLY in Supabase — NEVER in
the repo or the bundle.**

- ✅ Public-safe in the front-end: Supabase project URL + `sb_publishable_…`
  (anon/publishable) key. These are designed to ship in the page.
- ❌ NEVER in repo/bundle/CI logs: `service_role` key, any private/JWT signing
  key, DB password, SMTP creds, OAuth client *secret*, real user passwords,
  real names/emails/evaluations as fixtures.
- Passwords are set by users in Supabase Auth; the app only calls
  `signInWithPassword` / `resetPasswordForEmail`. **Store no password anywhere.**
- Before every push: `git diff --cached | grep -iE 'service_role|BEGIN.*PRIVATE|secret'`
  — a hit that isn't an identifier name is a STOP. (12-Factor III: config in env.)

---

## 1. Auth modes + the identity rule

Tempo supports 4 sign-in modes via `WP.config.authMode`, strongest configured
wins. Selector lives in `core/config.js`; flows in `ui/login.js`:

| mode | how identity is proven | impersonation-proof? |
|------|------------------------|----------------------|
| `password` | Supabase `signInWithPassword` → session email | ✅ yes |
| `google` | Google OIDC (`hd=webook.com`) → session email | ✅ yes |
| `verified-link` | magic link to the real inbox → session email | ✅ yes |
| `directory` | exact email match, no proof | ❌ NO — pilot only |

**THE IDENTITY RULE (anti-impersonation):**

> The **verified session email is the ONLY identity.** Map it, and only it, to a
> person: `session.user.email → findByEmail → person → hasAccess → signIn`.
> There is **no account picker** and **no path** where a value the user *typed*
> becomes the identity they sign in as.

```js
// ✅ correct — identity comes from the verified session, never the form
function onSession(session) {
  const email = String(session?.user?.email || '').toLowerCase();
  const r = WP.auth.findByEmail(email);          // session email only
  if (r.error || !r.person) { sb.auth.signOut(); return; }
  if (!WP.access.hasAccess(r.person.id)) { deny(r.person); sb.auth.signOut(); return; }
  WP.auth.signIn(r.person.id);
}
```

```js
// ❌ WRONG — trusting a typed value = account impersonation
const typed = form.email.value;
WP.auth.signIn(WP.auth.findByEmail(typed).person.id);   // never do this
```

Do / Don't:
- ✅ Wrong credentials → ONE generic message ("email or password is incorrect").
  Never reveal which was wrong (ASVS 2.2.1 — no user enumeration).
- ✅ Forgot/reset → same neutral confirmation whether or not the account exists
  (anti-enumeration). `resetPasswordForEmail(email, { redirectTo })`.
- ✅ Keep the Supabase client live whenever Supabase is configured — `WP.db`
  reads through it regardless of auth mode.
- ✅ Every mode ends in the SAME `hasAccess(person.id)` gate; deny → `signOut`.
- ✅ New modes must be reversible (one line in `config.js`) and never regress the
  others; add/extend a `test/verify-*.js` with an anti-impersonation assertion.
- ❌ Don't pre-resolve a person from the typed email and then "confirm" via auth.
- ❌ Don't add an account picker / "sign in as" list in an identity-proof mode.

---

## 2. RLS predicate patterns (defence in the database)

RLS is the last line of defence — the UI gate (`WP.access`) can be bypassed, the
DB cannot. Every table with real data has RLS **enabled** and a policy per verb.
Tempo's visibility ladder: **self / direct-manager / director — NO skip-level.**

```sql
alter table public.people        enable row level security;
alter table public.evaluations   enable row level security;

-- who is the caller as a person row
create or replace function public.current_person_id() returns text
  language sql stable as $$
    select p.id from public.people p
    where lower(p.email) = lower(auth.jwt()->>'email') limit 1
  $$;

-- can the caller READ this person? self OR their DIRECT manager OR a director.
create or replace function public.can_read_person(target text) returns boolean
  language sql stable as $$
    select
      target = public.current_person_id()                                   -- self
      or exists (select 1 from public.people t
                 where t.id = target and t.manager_id = public.current_person_id())  -- direct mgr
      or exists (select 1 from public.people me
                 where me.id = public.current_person_id() and me.is_director)        -- director
  $$;

-- sensitive fields (evaluation detail): self + direct manager + director only,
-- and NEVER skip-level (a manager's manager sees only via director flag).
create or replace function public.can_see_sensitive(target text) returns boolean
  language sql stable as $$
    select
      target = public.current_person_id()
      or exists (select 1 from public.people t
                 where t.id = target and t.manager_id = public.current_person_id())
      or exists (select 1 from public.people me
                 where me.id = public.current_person_id() and me.is_director)
  $$;

create policy people_read on public.people
  for select using (public.can_read_person(id));

create policy eval_read on public.evaluations
  for select using (public.can_see_sensitive(subject_id));
```

Do / Don't:
- ✅ `enable row level security` on EVERY table holding real data — a table with
  no policy + RLS on = deny-all (fail closed). That's the safe default.
- ✅ One policy per command (`select`/`insert`/`update`/`delete`); write policies
  need a `with check` that re-asserts the predicate.
- ✅ Predicate functions `stable`, `security definer` only when required, and
  never widen scope inside the function.
- ✅ Index every column an RLS predicate filters on (`manager_id`, `email`,
  `subject_id`) — RLS runs the predicate per row (see §4).
- ❌ No skip-level read. A manager sees direct reports only; higher visibility is
  the `is_director` flag, never "manager of my manager".
- ❌ Never rely on the client to filter sensitive rows — the server must.

---

## 3. Migration discipline (idempotent, no-broaden)

- ✅ **Idempotent**: `create table if not exists`, `create or replace function`,
  `drop policy if exists` before `create policy`, guarded `alter … add column if
  not exists`. Re-running a migration must be a no-op.
- ✅ **No-broaden guard**: a migration may TIGHTEN access; broadening needs an
  explicit, reviewed reason in the migration header comment. Default deny.
- ✅ Forward-only, one concern per file, named `NNNN_verb_object.sql`, header
  comment stating what + why + rollback note.
- ✅ Enable RLS in the SAME migration that creates the table — never leave a
  window where the table exists without RLS.
- ❌ No `grant … to anon`/`authenticated` that bypasses RLS. No `security
  definer` function that returns rows the caller couldn't read directly.
- ❌ Don't disable RLS "temporarily" to backfill — use a `service_role` job that
  never touches the front-end.

---

## 4. Query performance (fast + cheap, per OWASP + SRE)

- ✅ **Select only needed columns** — never `select *` on a table with sensitive
  fields (limits accidental exposure AND payload).
- ✅ **Server-side range/limit**: `.range(from,to)` / `.limit(n)` + `.order()`.
  Never fetch-all-then-slice in JS.
- ✅ **Index RLS columns** (§2) and any column in a `where`/`order`.
- ✅ **Kill N+1**: batch with `in (…)` or an embedded resource
  (`select('*, manager:manager_id(*)')`) instead of a query per row.
- ✅ **Cache the directory once per session** — `WP.data.PEOPLE` is loaded once;
  `findByEmail` reads memory, not a round-trip per keystroke.
- ❌ No unbounded list queries. No client-side join across two full-table fetches.
- ❌ Don't put per-row `hasAccess` calls inside a render loop that re-queries.

---

## 5. Ethics invariants (Constitution — non-negotiable)

These are correctness, not preference. Any data/query/feature must hold ALL:

- **Work, not people** — measure work/decisions, never surveil individuals. No
  keystroke/activity/presence metrics.
- **Ranges, not per-person scores** — surface ranges/bands with "not enough
  evidence" as first-class; never a lone number that ranks a person.
- **k-anonymity on aggregates** — suppress any cohort/bucket below the k
  threshold; never leak the suppressed count or identities.
- **Explainable + evidence-cited** — every figure links to the evidence that
  produced it; no unexplained verdicts.
- **No skip-level exposure** — visibility ladder is self / direct-manager /
  director only (mirrors §2 RLS).

Do / Don't:
- ✅ Aggregate by type/focus, de-identify evidence refs, gate sensitive views.
- ❌ No field named `score`/`rank`/`verdict`/`profile` on a per-person row.
- ❌ Don't add a metric without naming the decision it serves (Constitution:
  Evidence).

---

## Pre-push finish-gate (run every time)

1. `node build.js` → clean, `js=0 css=0` un-inlined; dist regenerated (never
   hand-edited).
2. `npm test` → green, incl. a new/updated `verify-*.js` with an
   anti-impersonation assertion when auth changed.
3. `git diff --cached --stat` → only intended files; no stray, no dist by hand.
4. Secret scan (§0) → no hit.
5. Auth change reversible; RLS enabled + indexed; migration idempotent + no
   broaden; all 5 ethics invariants hold.
