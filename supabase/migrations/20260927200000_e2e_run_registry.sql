-- Registry for manual production E2E runs. Every run mints a run_id and
-- records the rows it creates here so a run's leftovers are one query to
-- find and one command to delete. Service-role only: the app never reads
-- these, and a client must never learn that a row is test data.
-- Spec: docs/superpowers/specs/2026-09-27-production-e2e-design.md §4.

create table if not exists public.e2e_runs (
  run_id      text primary key,
  started_at  timestamptz not null default now(),
  finished_at timestamptz,
  status      text not null
              check (status in ('running', 'passed', 'failed', 'aborted')),
  operator    text not null,
  git_sha     text not null,
  image_tag   text not null,
  base_url    text not null,
  apps        text[] not null,
  notes       text
);

create table if not exists public.e2e_run_rows (
  run_id     text not null references public.e2e_runs (run_id) on delete restrict,
  table_name text not null,
  row_id     text not null,
  created_at timestamptz not null default now(),
  primary key (table_name, row_id)
);

create index if not exists e2e_run_rows_run_id_idx on public.e2e_run_rows (run_id);

alter table public.e2e_runs enable row level security;
alter table public.e2e_run_rows enable row level security;

-- Supabase's default privileges grant client roles table access and rely on
-- RLS to hide rows. With no policies that already yields zero rows, but
-- revoking removes the grant too, so tests/db/exposure-invariants keeps
-- seeing no client-readable column on these tables.
revoke all on table public.e2e_runs from anon, authenticated;
revoke all on table public.e2e_run_rows from anon, authenticated;
grant all on table public.e2e_runs to service_role;
grant all on table public.e2e_run_rows to service_role;

comment on table public.e2e_runs is
  'Manual production E2E runs (docs/superpowers/specs/2026-09-27-production-e2e-design.md). Service role only.';
comment on table public.e2e_run_rows is
  'Rows created by an E2E run, keyed by (table_name, row_id). table_name may be a storage prefix such as storage:receipts.';
