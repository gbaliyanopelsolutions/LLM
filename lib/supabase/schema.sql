-- Run in Supabase: SQL Editor → New query → paste → Run.
-- Example table for /api/supabase/example (adjust RLS for production).

create table if not exists public.example_items (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  created_at timestamptz not null default now()
);

alter table public.example_items enable row level security;

-- Demo policies: allow anonymous read/write (tighten for production).
create policy "example_items_select_anon"
  on public.example_items for select
  to anon
  using (true);

create policy "example_items_insert_anon"
  on public.example_items for insert
  to anon
  with check (true);
