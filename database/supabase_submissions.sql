-- =============================================================================
-- Standalone (Supabase SQL Editor): secure `submissions` + column user_id.
-- For full project RLS + dropping public.users, run instead:
--   database/migration_secure_rls_drop_public_users.sql
-- =============================================================================

create extension if not exists pgcrypto with schema extensions;

create table if not exists public.submissions (
	id uuid primary key default extensions.gen_random_uuid(),
	message text not null,
	result text,
	user_id uuid references auth.users (id) on delete set null default auth.uid(),
	created_at timestamptz not null default now()
);

alter table public.submissions
	add column if not exists user_id uuid references auth.users (id) on delete set null;

alter table public.submissions
	alter column user_id set default auth.uid();

alter table public.submissions enable row level security;

drop policy if exists submissions_anon_insert on public.submissions;
drop policy if exists submissions_select_own on public.submissions;
drop policy if exists submissions_insert_own on public.submissions;
drop policy if exists submissions_update_own on public.submissions;
drop policy if exists submissions_delete_own on public.submissions;

create policy submissions_select_own
	on public.submissions
	for select
	to authenticated
	using (auth.uid() = user_id);

create policy submissions_insert_own
	on public.submissions
	for insert
	to authenticated
	with check (auth.uid() = user_id);

create policy submissions_update_own
	on public.submissions
	for update
	to authenticated
	using (auth.uid() = user_id)
	with check (auth.uid() = user_id);

create policy submissions_delete_own
	on public.submissions
	for delete
	to authenticated
	using (auth.uid() = user_id);

revoke all on table public.submissions from anon;
grant usage on schema public to authenticated;
grant select, insert, update, delete on table public.submissions to authenticated;
