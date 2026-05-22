-- =============================================================================
-- Survey core tables — Supabase PostgreSQL (run in SQL Editor or psql)
-- Spec: questions.question_text = your "text" field; sort_order = "order".
-- Requires: auth schema (owner_id → auth.users). Use pooler/direct connection.
-- Safe to re-run: enums via DO blocks; tables use IF NOT EXISTS.
-- =============================================================================

create extension if not exists pgcrypto with schema extensions;
create extension if not exists citext with schema extensions;

-- Enums (idempotent)
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

-- Companies
create table if not exists public.companies (
	company_id uuid primary key default extensions.gen_random_uuid(),
	name text not null,
	industry text,
	region text,
	tier text,
	created_at timestamptz not null default now(),
	constraint companies_name_not_empty check (length(trim(name)) > 0)
);

comment on table public.companies is 'Tenant / organization.';

-- Respondents
create table if not exists public.respondents (
	respondent_id uuid primary key default extensions.gen_random_uuid(),
	company_id uuid not null references public.companies (company_id) on delete cascade,
	full_name text not null,
	email citext not null,
	department text,
	job_title text,
	created_at timestamptz not null default now(),
	constraint respondents_email_unique unique (email),
	constraint respondents_full_name_not_empty check (length(trim(full_name)) > 0)
);

comment on table public.respondents is 'People who respond; one company each.';

-- Surveys
create table if not exists public.surveys (
	survey_id uuid primary key default extensions.gen_random_uuid(),
	name text not null,
	description text,
	category text,
	owner_id uuid references auth.users (id) on delete set null,
	status public.survey_status not null default 'draft',
	company_id uuid not null references public.companies (company_id) on delete cascade,
	created_at timestamptz not null default now(),
	closed_at timestamptz,
	constraint surveys_name_not_empty check (length(trim(name)) > 0),
	constraint surveys_closed_after_created check (closed_at is null or closed_at >= created_at)
);

comment on table public.surveys is 'Survey definitions.';
comment on column public.surveys.owner_id is 'Supabase Auth user id (optional).';

-- Questions (question_text = spec "text"; sort_order = spec "order")
create table if not exists public.questions (
	question_id uuid primary key default extensions.gen_random_uuid(),
	survey_id uuid not null references public.surveys (survey_id) on delete cascade,
	question_text text not null,
	type public.question_type not null,
	dimension_tag text,
	sort_order integer not null,
	options_json jsonb not null default '{}'::jsonb,
	constraint questions_sort_order_positive check (sort_order > 0),
	constraint questions_unique_order_per_survey unique (survey_id, sort_order)
);

comment on column public.questions.question_text is 'Question body (your field name: text).';
comment on column public.questions.sort_order is 'Display order (your field name: order).';
comment on column public.questions.options_json is 'Choices, scales, etc.';

-- Responses
create table if not exists public.responses (
	response_id uuid primary key default extensions.gen_random_uuid(),
	survey_id uuid not null references public.surveys (survey_id) on delete cascade,
	respondent_id uuid not null references public.respondents (respondent_id) on delete cascade,
	company_id uuid not null references public.companies (company_id) on delete cascade,
	question_id uuid not null references public.questions (question_id) on delete cascade,
	answer_text text,
	answer_score smallint,
	submitted_at timestamptz not null default now(),
	constraint responses_score_range check (
		answer_score is null
		or (answer_score between 1 and 10)
	)
);

comment on column public.responses.company_id is 'Denormalized from survey for filtering.';

-- Helpful indexes
create index if not exists respondents_company_id_idx on public.respondents (company_id);
create index if not exists surveys_company_id_idx on public.surveys (company_id);
create index if not exists surveys_status_idx on public.surveys (status);
create index if not exists questions_survey_id_sort_idx on public.questions (survey_id, sort_order);
create index if not exists responses_survey_id_submitted_idx on public.responses (survey_id, submitted_at desc);
create index if not exists responses_company_id_submitted_idx on public.responses (company_id, submitted_at desc);
