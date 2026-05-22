-- =============================================================================
-- LLM Survey + Express auth — idempotent bootstrap (Supabase PostgreSQL)
-- Run automatically via database/initDb.js on server startup.
-- Safe to re-run: IF NOT EXISTS, DO blocks for enums, seed ON CONFLICT.
-- Tip: DDL on Supabase is most reliable with direct DB (port 5432); pooler
--      (6543) can fail for some operations — use session mode if needed.
-- =============================================================================

create extension if not exists pgcrypto with schema extensions;
create extension if not exists citext with schema extensions;

-- ---------------------------------------------------------------------------
-- Enums
-- ---------------------------------------------------------------------------
do $$
begin
	create type public.survey_status as enum ('draft', 'active', 'closed', 'archived');
exception
	when duplicate_object then null;
end $$;

do $$
begin
	create type public.question_type as enum (
		'multiple_choice',
		'single_choice',
		'likert',
		'text',
		'rating',
		'number',
		'date',
		'matrix'
	);
exception
	when duplicate_object then null;
end $$;

-- ---------------------------------------------------------------------------
-- Companies (tenant)
-- ---------------------------------------------------------------------------
create table if not exists public.companies (
	company_id uuid primary key default extensions.gen_random_uuid(),
	name text not null,
	industry text,
	region text,
	tier text,
	metadata jsonb not null default '{}'::jsonb,
	created_at timestamptz not null default now(),
	updated_at timestamptz not null default now(),
	constraint companies_name_not_empty check (length(trim(name)) > 0)
);

comment on column public.companies.metadata is 'Arbitrary org settings (JSONB).';

alter table public.companies drop column if exists logo_url;

-- ---------------------------------------------------------------------------
-- Respondents
-- ---------------------------------------------------------------------------
create table if not exists public.respondents (
	respondent_id uuid primary key default extensions.gen_random_uuid(),
	company_id uuid not null references public.companies (company_id) on delete cascade,
	full_name text not null,
	email citext not null,
	department text,
	job_title text,
	profile_json jsonb not null default '{}'::jsonb,
	created_at timestamptz not null default now(),
	updated_at timestamptz not null default now(),
	constraint respondents_email_unique unique (email),
	constraint respondents_full_name_not_empty check (length(trim(full_name)) > 0)
);

-- ---------------------------------------------------------------------------
-- Surveys
-- ---------------------------------------------------------------------------
create table if not exists public.surveys (
	survey_id uuid primary key default extensions.gen_random_uuid(),
	name text not null,
	description text,
	category text,
	status public.survey_status not null default 'draft',
	company_id uuid not null references public.companies (company_id) on delete cascade,
	settings_json jsonb not null default '{}'::jsonb,
	max_submissions integer,
	total_submissions integer not null default 0,
	form_html text,
	form_css text,
	created_at timestamptz not null default now(),
	updated_at timestamptz not null default now(),
	closed_at timestamptz,
	constraint surveys_name_not_empty check (length(trim(name)) > 0),
	constraint surveys_closed_after_created check (closed_at is null or closed_at >= created_at),
	constraint surveys_max_submissions_positive check (max_submissions is null or max_submissions > 0),
	constraint surveys_total_submissions_non_negative check (total_submissions >= 0)
);

comment on column public.surveys.settings_json is 'Survey-level config (JSONB).';
comment on column public.surveys.max_submissions is 'Optional cap on form submissions. NULL = unlimited.';
comment on column public.surveys.total_submissions is 'Completed public form submissions (incremented once per submit).';
comment on column public.surveys.form_html is 'Sanitized LLM form body HTML for public iframe (fields bound to question_id).';
comment on column public.surveys.form_css is 'Extracted CSS from LLM form for public iframe.';

-- ---------------------------------------------------------------------------
-- Questions
-- ---------------------------------------------------------------------------
create table if not exists public.questions (
	question_id uuid primary key default extensions.gen_random_uuid(),
	survey_id uuid not null references public.surveys (survey_id) on delete cascade,
	question_text text not null,
	type public.question_type not null,
	dimension_tag text,
	sort_order integer not null,
	options_json jsonb not null default '{}'::jsonb,
	placeholder text,
	validation_rules jsonb not null default '{}'::jsonb,
	created_at timestamptz not null default now(),
	updated_at timestamptz not null default now(),
	constraint questions_sort_order_positive check (sort_order > 0),
	constraint questions_unique_order_per_survey unique (survey_id, sort_order)
);

comment on column public.questions.options_json is 'Choices, scales, matrix config, etc.';
comment on column public.questions.placeholder is 'Optional placeholder string shown in text/number/date/textarea inputs.';
comment on column public.questions.validation_rules is 'Validation hints: minLength, maxLength, min, max, pattern, accept.';

create index if not exists questions_validation_rules_gin_idx on public.questions using gin (validation_rules);

-- ---------------------------------------------------------------------------
-- Responses
-- ---------------------------------------------------------------------------
create table if not exists public.responses (
	response_id uuid primary key default extensions.gen_random_uuid(),
	survey_id uuid not null references public.surveys (survey_id) on delete cascade,
	respondent_id uuid not null references public.respondents (respondent_id) on delete cascade,
	company_id uuid not null references public.companies (company_id) on delete cascade,
	question_id uuid not null references public.questions (question_id) on delete cascade,
	answer_text text,
	answer_score smallint,
	answer_json jsonb,
	submitted_at timestamptz not null default now(),
	constraint responses_score_range check (
		answer_score is null
		or (answer_score between 1 and 10)
	)
);

comment on column public.responses.company_id is 'Denormalized for filtering.';
comment on column public.responses.answer_json is 'Structured answer payload (JSONB).';

-- ---------------------------------------------------------------------------
-- Indexes
-- ---------------------------------------------------------------------------
create index if not exists companies_name_idx on public.companies (lower(name));
create index if not exists companies_created_at_idx on public.companies (created_at desc);

create index if not exists respondents_company_id_idx on public.respondents (company_id);
create index if not exists respondents_email_idx on public.respondents (lower(email::text));

create index if not exists surveys_company_id_idx on public.surveys (company_id);
create index if not exists surveys_status_idx on public.surveys (status);

create index if not exists questions_survey_id_sort_idx on public.questions (survey_id, sort_order);
create index if not exists questions_type_idx on public.questions (type);

create index if not exists responses_survey_id_submitted_idx on public.responses (survey_id, submitted_at desc);
create index if not exists responses_company_id_submitted_idx on public.responses (company_id, submitted_at desc);
create index if not exists responses_respondent_id_idx on public.responses (respondent_id);
create index if not exists responses_question_id_idx on public.responses (question_id);

-- ---------------------------------------------------------------------------
-- updated_at triggers (mutable survey entities)
-- ---------------------------------------------------------------------------
create or replace function public.touch_updated_at()
returns trigger
language plpgsql
as $$
begin
	new.updated_at = now();
	return new;
end;
$$;

drop trigger if exists companies_touch_updated_at on public.companies;
create trigger companies_touch_updated_at
	before update on public.companies
	for each row
	execute function public.touch_updated_at();

drop trigger if exists respondents_touch_updated_at on public.respondents;
create trigger respondents_touch_updated_at
	before update on public.respondents
	for each row
	execute function public.touch_updated_at();

drop trigger if exists surveys_touch_updated_at on public.surveys;
create trigger surveys_touch_updated_at
	before update on public.surveys
	for each row
	execute function public.touch_updated_at();

drop trigger if exists questions_touch_updated_at on public.questions;
create trigger questions_touch_updated_at
	before update on public.questions
	for each row
	execute function public.touch_updated_at();

-- ---------------------------------------------------------------------------
-- Seed data (fixed UUIDs — idempotent)
-- ---------------------------------------------------------------------------
insert into public.companies (company_id, name, industry, metadata)
values (
	'b1000000-0000-4000-8000-000000000001'::uuid,
	'Seed Company',
	'Technology',
	'{"seed": true}'::jsonb
)
on conflict (company_id) do nothing;

insert into public.respondents (respondent_id, company_id, full_name, email, department, profile_json)
values (
	'b1000000-0000-4000-8000-000000000003'::uuid,
	'b1000000-0000-4000-8000-000000000001'::uuid,
	'Seed Respondent',
	'respondent.seed@localhost.example',
	'Operations',
	'{"seed": true}'::jsonb
)
on conflict (email) do nothing;

insert into public.surveys (
	survey_id,
	name,
	description,
	category,
	status,
	company_id,
	settings_json
)
values (
	'b1000000-0000-4000-8000-000000000004'::uuid,
	'Seed Satisfaction Survey',
	'Demo survey created by database/init.sql',
	'HR',
	'active',
	'b1000000-0000-4000-8000-000000000001'::uuid,
	'{"seed": true, "anonymous": false}'::jsonb
)
on conflict (survey_id) do nothing;

insert into public.questions (question_id, survey_id, question_text, type, sort_order, options_json)
values
	(
		'b1000000-0000-4000-8000-000000000005'::uuid,
		'b1000000-0000-4000-8000-000000000004'::uuid,
		'How satisfied are you with our service?',
		'likert',
		1,
		'{"scale_min": 1, "scale_max": 5, "labels": ["Very dissatisfied", "Very satisfied"]}'::jsonb
	),
	(
		'b1000000-0000-4000-8000-000000000006'::uuid,
		'b1000000-0000-4000-8000-000000000004'::uuid,
		'Any additional comments?',
		'text',
		2,
		'{"placeholder": "Optional feedback"}'::jsonb
	)
on conflict (question_id) do nothing;

insert into public.responses (
	response_id,
	survey_id,
	respondent_id,
	company_id,
	question_id,
	answer_text,
	answer_score,
	answer_json
)
values (
	'b1000000-0000-4000-8000-000000000007'::uuid,
	'b1000000-0000-4000-8000-000000000004'::uuid,
	'b1000000-0000-4000-8000-000000000003'::uuid,
	'b1000000-0000-4000-8000-000000000001'::uuid,
	'b1000000-0000-4000-8000-000000000005'::uuid,
	null,
	4,
	'{"likert_value": 4}'::jsonb
)
on conflict (response_id) do nothing;

-- =============================================================================
-- LLM survey + RLS: authenticated Data API only (no anonymous access)
-- =============================================================================
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

comment on table public.submissions is 'LLM survey app: user prompt and generated HTML.';
comment on column public.submissions.message is 'User prompt or form requirement.';
comment on column public.submissions.result is 'Model output (full HTML document).';
comment on column public.submissions.user_id is 'Owner (auth.users). Default auth.uid() on insert via PostgREST.';

-- RLS: core tables
alter table public.companies enable row level security;
alter table public.respondents enable row level security;
alter table public.surveys enable row level security;
alter table public.questions enable row level security;
alter table public.responses enable row level security;
alter table public.submissions enable row level security;

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
