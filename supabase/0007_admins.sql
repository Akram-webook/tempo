-- ============================================================
-- Tempo — Supabase migration 0007: admin accounts (create + invite)
-- ------------------------------------------------------------
-- Adds the Admins page backend. An "admin" is a public.people row with
-- level='admin', plus contact/profile PII that the org chart never needs and
-- that must NEVER ship in the public bundle (it lives here, under RLS, only).
--
-- SECURITY (see .claude/skills/tempo-secure-data §0/§1):
--   • NO password column anywhere. Passwords are set by the admin themselves via
--     Supabase Auth (the app calls auth.resetPasswordForEmail → set-password link).
--     Tempo stores no password, ever.
--   • Contact PII (email/phone/birth_date/country/city/org/gender) is added as
--     columns on public.people so it inherits the SAME read RLS (can_read_person)
--     — a peer cannot enumerate it with the publishable key.
--   • INSERT/UPDATE is restricted to the caller being an admin themselves
--     (is_admin()), NOT open to any authenticated user. Default deny otherwise.
--
-- Run in the Supabase SQL editor (project ftkbjsxdrxtjdzcojnve) AFTER 0001–0006.
-- Idempotent — safe to re-run. TIGHTENS access only (no broaden).
-- ============================================================

-- ---- 1) Profile/contact columns (nullable; only admins carry them) -------
alter table public.people add column if not exists email       text;
alter table public.people add column if not exists phone       text;
alter table public.people add column if not exists gender      text;   -- male | female
alter table public.people add column if not exists birth_date  date;
alter table public.people add column if not exists country     text;
alter table public.people add column if not exists city        text;
alter table public.people add column if not exists org         text;

-- Email is how an admin is matched to their verified session; index it (RLS/lookup).
create unique index if not exists people_email_unique
  on public.people (lower(email)) where email is not null;

-- ---- 2) "Is the caller an admin?" predicate ------------------------------
-- Mirrors access.js roleOf(): level='admin' is the Super Admin role. stable so the
-- planner can cache it per statement. Reads only the caller's own row.
create or replace function public.is_admin() returns boolean
  language sql stable as $$
    select exists (
      select 1 from public.people me
      where lower(me.email) = lower(auth.jwt()->>'email')
        and me.level = 'admin'
    )
  $$;

-- ---- 3) Write policies: admins only (create + update admin records) ------
-- READ stays governed by 0004's people_select_scoped (can_read_person). Here we
-- ADD narrowly-scoped write policies so the Admins page can persist records.
-- with check re-asserts the predicate so a non-admin cannot slip a row in.
drop policy if exists people_insert_admin on public.people;
create policy people_insert_admin on public.people
  for insert to authenticated
  with check (public.is_admin());

drop policy if exists people_update_admin on public.people;
create policy people_update_admin on public.people
  for update to authenticated
  using (public.is_admin())
  with check (public.is_admin());

-- No DELETE policy: admin records are deactivated (active=false), never hard-deleted,
-- so evaluations/events referencing them keep their provenance.
-- ============================================================
