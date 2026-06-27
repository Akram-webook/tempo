-- ============================================================
-- Tempo — Supabase migration 0002: events (Intelligence Layer P1)
-- ------------------------------------------------------------
-- Append-only evidence/decision store — the spine for Performance Memory,
-- Evaluation Intelligence, and Leadership Intelligence (see
-- docs/ROADMAP-intelligence-layer.md). Gated by INTELLIGENCE-ETHICS.md:
-- operational signals only, evidence-first, access-gated, never destructive.
--
-- APPEND-ONLY by design: there is NO update/delete policy. An evidence trail you
-- can rewrite is worthless. Insert is stamped to the author (RLS); read is gated.
-- Run in the Supabase SQL editor (project ftkbjsxdrxtjdzcojnve). Idempotent.
-- ============================================================

create table if not exists public.events (
  id            text primary key,                 -- app id scheme (derived or appended)
  ts            timestamptz not null default now(),
  type          text not null,                    -- 'evidence' | 'decision'
  actor         text,                             -- who acted (p_*), null for system-derived
  subject_id    text not null,                    -- person the event is about (p_*)
  category      text not null,                    -- workload | wellbeing | evaluation | recognition | decision
  before        jsonb,
  after         jsonb,
  description   text not null,
  source        text not null,                    -- REQUIRED — provenance (Ethics #2, no fabrication)
  related       jsonb,                            -- {kpi|goal|project|event}
  confidence    text,                             -- observed | signal | recorded
  evidence_refs jsonb not null default '[]',
  visibility    text not null default 'managers', -- never peer-visible (enforced app-side + read policy)
  author_email  text not null default auth.email()
);

create index if not exists events_subject_ts on public.events (subject_id, ts desc);

alter table public.events enable row level security;

-- INSERT: append your own events only (author_email stamped server-side by default).
drop policy if exists events_insert_self on public.events;
create policy events_insert_self on public.events
  for insert to authenticated
  with check (author_email = auth.email());

-- SELECT: any authenticated user may read (Phase-1 parity with evaluations).
-- Per-person visibility is enforced app-side via canSeeSensitive (never peer-visible);
-- Phase-2 tightens this to role-scoped reads once roles live server-side.
drop policy if exists events_select_authenticated on public.events;
create policy events_select_authenticated on public.events
  for select to authenticated
  using (true);

-- NO update / delete policy on purpose: the store is append-only.
