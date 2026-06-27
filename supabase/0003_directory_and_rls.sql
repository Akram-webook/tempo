-- ============================================================
-- Tempo — Supabase migration 0003: directory + role-scoped RLS (Wave 3 Hardening, Part A)
-- ------------------------------------------------------------
-- QA finding (SEV2, security): 0001/0002 ship `select ... using (true)` on
-- evaluations + events, so ANY signed-in user can read EVERY row directly via
-- the anon/publishable key — only the UI gates them. Before real evaluation /
-- wellbeing data exists, the DATABASE must enforce role-scoped reads. This is
-- the "move roles server-side" milestone (see docs/ACCESS-MODEL.md).
--
-- What this migration does:
--   1. public.directory — the server-side role map (email -> person_id, role,
--      manager_email), seeded idempotently from the app's known org.
--   2. public.can_read_person(subject_person_id) — the single read predicate:
--      true if you ARE the subject, OR you're a director/admin, OR you're the
--      subject's direct manager.
--   3. Replaces the permissive SELECT policies on evaluations + events with
--      can_read_person(subject_id). INSERT/UPDATE/DELETE stay own-row-only.
--
-- Run in the Supabase SQL editor (project ftkbjsxdrxtjdzcojnve), AFTER 0001/0002.
-- Idempotent — safe to re-run.
-- ============================================================

-- ---- 1) Directory: the server-side role map ----------------------------
create table if not exists public.directory (
  email         text primary key,                 -- the auth identity (verified @webook.com)
  person_id     text,                             -- app person id (p_*)
  role          text not null default 'employee', -- employee | manager | director | admin
  manager_email text                              -- this person's direct manager's email (null at the top)
);

-- Guard the role vocabulary (added separately so re-runs don't error if present).
do $$ begin
  alter table public.directory
    add constraint directory_role_chk check (role in ('employee','manager','director','admin'));
exception when duplicate_object then null; end $$;

alter table public.directory enable row level security;

-- Role lookup as SECURITY DEFINER so the directory SELECT policy can reference
-- the caller's role WITHOUT recursively re-applying the directory policy to
-- itself (a self-referential RLS policy otherwise errors with infinite recursion).
create or replace function public.current_directory_role()
returns text
language sql
stable
security definer
set search_path = public
as $$
  select role from public.directory where email = auth.email() limit 1;
$$;

-- Directory is not sensitive: each user reads their OWN row; directors/admins
-- read all (they need the org map to do macro views).
drop policy if exists directory_select_self_or_admin on public.directory;
create policy directory_select_self_or_admin on public.directory
  for select to authenticated
  using (
    email = auth.email()
    or public.current_directory_role() in ('director','admin')
  );

-- The directory is maintained out-of-band (this migration / admin tooling),
-- so no client-facing insert/update/delete policies: writes go through the
-- service role only. RLS-on + no write policy = clients cannot mutate it.

-- ---- Seed from the app's known org (the 13 verified @webook.com accounts) --
-- Source of truth: src/js/data/mock-data.js EMAILS + managerId chain. Only
-- people with a real verified email get a directory row (sign-in is keyed on
-- these exact emails). manager_email is the manager's email, or NULL when the
-- manager has no verified account yet (e.g. p_motaa, p_hani, p_ayah, p_hamdi).
--   role mapping: level director/admin -> director (akram = admin / Super Admin),
--   level manager/sr_manager -> manager, level spec/sr_spec -> employee.
insert into public.directory (email, person_id, role, manager_email) values
  ('akram@webook.com',            'p_akram',       'admin',    null),                  -- Super Admin (mgr p_motaa: no acct)
  ('ahmed.othman@webook.com',     'p_ahmed',       'director', null),                  -- Director (mgr p_hamdi: no acct)
  ('zaidan@webook.com',           'p_zaidan',      'manager',  null),                  -- mgr p_hani: no acct
  ('faraj@webook.com',            'p_faraj',       'manager',  null),                  -- mgr p_hani: no acct
  ('fouda@webook.com',            'p_fouda',       'manager',  null),                  -- mgr p_hani: no acct
  ('abdelaal@webook.com',         'p_abdelaal',    'manager',  null),                  -- mgr p_hani: no acct
  ('maksousa@webook.com',         'p_abdulrahman', 'employee', null),                  -- sr_spec; mgr p_motaa: no acct
  ('meshal@webook.com',           'p_meshalB',     'employee', null),                  -- sr_spec; mgr p_ayah: no acct
  ('shamma@webook.com',           'p_shamma',      'employee', null),                  -- spec; mgr p_motaa: no acct
  ('o.taher.c@webook.com',        'p_osama',       'employee', 'akram@webook.com'),    -- reports to p_akram
  ('m.ali.c@webook.com',          'p_gamal',       'employee', 'akram@webook.com'),    -- reports to p_akram
  ('mohammed.adris.c@webook.com', 'p_idris',       'employee', 'akram@webook.com'),    -- reports to p_akram
  ('talal.samir.c@webook.com',    'p_talal',       'employee', 'maksousa@webook.com')  -- reports to p_abdulrahman
on conflict (email) do update
  set person_id     = excluded.person_id,
      role          = excluded.role,
      manager_email = excluded.manager_email;

-- ---- 2) The read predicate ---------------------------------------------
-- SECURITY DEFINER so it can consult the directory regardless of the caller's
-- directory RLS (and to avoid recursion when used inside policies).
create or replace function public.can_read_person(subject_person_id text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select
    -- (a) you ARE the subject (own row)
    exists (
      select 1 from public.directory d
      where d.email = auth.email() and d.person_id = subject_person_id
    )
    -- (b) you are a director / admin (macro view)
    or exists (
      select 1 from public.directory d
      where d.email = auth.email() and d.role in ('director','admin')
    )
    -- (c) you are the subject's direct manager
    or exists (
      select 1 from public.directory s
      where s.person_id = subject_person_id and s.manager_email = auth.email()
    );
$$;

-- ---- 3) Replace the permissive SELECT policies -------------------------
-- evaluations: drop the Phase-1 permissive read, add the role-scoped one.
drop policy if exists evaluations_select_authenticated on public.evaluations;
drop policy if exists evaluations_select_scoped on public.evaluations;
create policy evaluations_select_scoped on public.evaluations
  for select to authenticated
  using (public.can_read_person(subject_id));

-- events: same. (Insert stays own-row-only; there is no update/delete policy —
-- the events store is append-only by design, see 0002.)
drop policy if exists events_select_authenticated on public.events;
drop policy if exists events_select_scoped on public.events;
create policy events_select_scoped on public.events
  for select to authenticated
  using (public.can_read_person(subject_id));

-- INSERT / UPDATE / DELETE policies from 0001 (evaluations) and 0002 (events)
-- are intentionally left untouched: writes remain own-row-only
-- (author_email = auth.email()).
-- ============================================================
