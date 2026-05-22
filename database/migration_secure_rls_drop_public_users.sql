-- =============================================================================
-- One-shot migration: remove legacy public.users, enable RLS everywhere,
-- authenticated-only Data API access (no anonymous reads/writes).
-- Run in Supabase SQL Editor (or psql) as a privileged role.
--
-- After this:
-- • Express /api/auth uses Supabase Auth (auth.users) — see authController.js
-- • Browser inserts to public.submissions require a logged-in Supabase session
-- • service_role JWT still bypasses RLS (server-side admin only; never expose)
-- =============================================================================

-- --- 1. Detach surveys from legacy public.users, then drop public.users -------
alter table if exists public.surveys drop constraint if exists surveys_owner_user_id_fkey;
alter table if exists public.surveys drop column if exists owner_user_id;

drop table if exists public.users cascade;

-- --- 2. Submissions: tie rows to Supabase Auth --------------------------------
alter table if exists public.submissions
	add column if not exists user_id uuid references auth.users (id) on delete set null;

alter table if exists public.submissions
	alter column user_id set default auth.uid();

comment on column public.submissions.user_id is 'Owner (auth.users). Default auth.uid() on insert via PostgREST.';

-- --- 3. Row Level Security: submissions (own rows only) ----------------------
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

-- --- 4. RLS: survey schema tables (any signed-in user; narrow per-tenant later)
alter table public.companies enable row level security;
alter table public.respondents enable row level security;
alter table public.surveys enable row level security;
alter table public.questions enable row level security;
alter table public.responses enable row level security;

drop policy if exists companies_authenticated_all on public.companies;
create policy companies_authenticated_all
	on public.companies
	for all
	to authenticated
	using (auth.uid() is not null)
	with check (auth.uid() is not null);

drop policy if exists respondents_authenticated_all on public.respondents;
create policy respondents_authenticated_all
	on public.respondents
	for all
	to authenticated
	using (auth.uid() is not null)
	with check (auth.uid() is not null);

drop policy if exists surveys_authenticated_all on public.surveys;
create policy surveys_authenticated_all
	on public.surveys
	for all
	to authenticated
	using (auth.uid() is not null)
	with check (auth.uid() is not null);

drop policy if exists questions_authenticated_all on public.questions;
create policy questions_authenticated_all
	on public.questions
	for all
	to authenticated
	using (auth.uid() is not null)
	with check (auth.uid() is not null);

drop policy if exists responses_authenticated_all on public.responses;
create policy responses_authenticated_all
	on public.responses
	for all
	to authenticated
	using (auth.uid() is not null)
	with check (auth.uid() is not null);

-- --- 5. Revoke anonymous API access; grant authenticated ---------------------
revoke all on table public.companies from anon;
revoke all on table public.respondents from anon;
revoke all on table public.surveys from anon;
revoke all on table public.questions from anon;
revoke all on table public.responses from anon;
revoke all on table public.submissions from anon;

grant usage on schema public to authenticated;
grant select, insert, update, delete on table public.companies to authenticated;
grant select, insert, update, delete on table public.respondents to authenticated;
grant select, insert, update, delete on table public.surveys to authenticated;
grant select, insert, update, delete on table public.questions to authenticated;
grant select, insert, update, delete on table public.responses to authenticated;
grant select, insert, update, delete on table public.submissions to authenticated;
