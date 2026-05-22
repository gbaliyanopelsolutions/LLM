-- =============================================================================
-- Survey schema for Supabase (PostgreSQL)
-- Run order: single migration (enums → tables → indexes → triggers → RLS → seed)
-- Requires: Supabase project with auth schema (owner_id references auth.users)
-- Spec mapping: questions.question_text = your "text" field; sort_order = "order".
-- PostgREST / SQL examples: sql/survey_supabase_examples.sql
-- Company rows: no INSERT policy for authenticated (provision via SQL / service role).
-- =============================================================================

-- Extensions (Supabase: keep in "extensions" schema)
create extension if not exists pgcrypto with schema extensions;
create extension if not exists citext with schema extensions;

-- -----------------------------------------------------------------------------
-- ENUM types (survey workflow + question rendering)
-- -----------------------------------------------------------------------------
create type public.survey_status as enum (
	'draft',
	'active',
	'closed',
	'archived'
);

comment on type public.survey_status is 'Lifecycle of a survey definition.';

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

comment on type public.question_type is 'How clients render the question and validate answers.';

-- -----------------------------------------------------------------------------
-- Tables
-- -----------------------------------------------------------------------------

-- Companies (tenant / organization)
create table public.companies (
	company_id uuid primary key default extensions.gen_random_uuid(),
	name text not null,
	industry text,
	region text,
	tier text,
	created_at timestamptz not null default now(),
	updated_at timestamptz not null default now(),
	constraint companies_name_not_empty check (length(trim(name)) > 0)
);

comment on table public.companies is 'Organizations that own respondents and surveys.';
comment on column public.companies.tier is 'Commercial or service tier label (e.g. enterprise, smb).';

-- Respondents (people who answer surveys)
create table public.respondents (
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

comment on table public.respondents is 'People invited or eligible to respond; scoped to one company.';
comment on column public.respondents.email is 'Case-insensitive unique email (citext).';

-- Surveys (instrument under a company, owned by an Auth user)
create table public.surveys (
	survey_id uuid primary key default extensions.gen_random_uuid(),
	name text not null,
	description text,
	category text,
	owner_id uuid references auth.users (id) on delete set null,
	status public.survey_status not null default 'draft',
	company_id uuid not null references public.companies (company_id) on delete cascade,
	created_at timestamptz not null default now(),
	updated_at timestamptz not null default now(),
	closed_at timestamptz,
	constraint surveys_name_not_empty check (length(trim(name)) > 0),
	constraint surveys_closed_after_created check (closed_at is null or closed_at >= created_at)
);

comment on table public.surveys is 'Survey definitions; questions hang off each survey.';
comment on column public.surveys.owner_id is 'Supabase Auth user responsible for the survey (RLS anchor).';

-- Questions (ordered items on a survey)
create table public.questions (
	question_id uuid primary key default extensions.gen_random_uuid(),
	survey_id uuid not null references public.surveys (survey_id) on delete cascade,
	question_text text not null,
	type public.question_type not null,
	dimension_tag text,
	sort_order integer not null,
	options_json jsonb not null default '{}'::jsonb,
	created_at timestamptz not null default now(),
	updated_at timestamptz not null default now(),
	constraint questions_sort_order_positive check (sort_order > 0),
	constraint questions_unique_order_per_survey unique (survey_id, sort_order)
);

comment on table public.questions is 'Individual prompts on a survey; sort_order is display sequence (spec "order").';
comment on column public.questions.options_json is 'JSONB choices, scale labels, matrix config, etc.';

-- Responses (one row per answer; denormalized company_id for RLS + analytics)
create table public.responses (
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

comment on table public.responses is 'Atomic answers; company_id mirrors survey company for fast filters and RLS.';
comment on column public.responses.answer_score is 'Optional numeric score (1–10); NULL for purely text answers.';

-- -----------------------------------------------------------------------------
-- Sync company_id on responses from survey (keep denormalized column correct)
-- -----------------------------------------------------------------------------
create or replace function public.responses_set_company_id()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
declare
	v_company uuid;
begin
	select s.company_id
	into v_company
	from public.surveys s
	where s.survey_id = new.survey_id;

	if v_company is null then
		raise exception 'Survey % not found', new.survey_id;
	end if;

	new.company_id := v_company;
	return new;
end;
$$;

comment on function public.responses_set_company_id() is 'Before insert/update: set company_id from parent survey.';

create trigger responses_set_company_id_trg
	before insert or update of survey_id
	on public.responses
	for each row
	execute procedure public.responses_set_company_id();

-- Optional: ensure respondent belongs to same company as survey
create or replace function public.responses_validate_respondent_company()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
declare
	r_company uuid;
	s_company uuid;
begin
	select r.company_id into r_company
	from public.respondents r
	where r.respondent_id = new.respondent_id;

	select s.company_id into s_company
	from public.surveys s
	where s.survey_id = new.survey_id;

	if r_company is distinct from s_company then
		raise exception 'Respondent % is not in the same company as survey %',
			new.respondent_id, new.survey_id;
	end if;

	return new;
end;
$$;

create trigger responses_validate_respondent_company_trg
	before insert or update of survey_id, respondent_id
	on public.responses
	for each row
	execute procedure public.responses_validate_respondent_company();

-- -----------------------------------------------------------------------------
-- updated_at maintenance
-- -----------------------------------------------------------------------------
create or replace function public.set_updated_at()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
begin
	new.updated_at := now();
	return new;
end;
$$;

create trigger companies_set_updated_at
	before update on public.companies
	for each row
	execute procedure public.set_updated_at();

create trigger surveys_set_updated_at
	before update on public.surveys
	for each row
	execute procedure public.set_updated_at();

create trigger questions_set_updated_at
	before update on public.questions
	for each row
	execute procedure public.set_updated_at();

-- -----------------------------------------------------------------------------
-- Indexes (dashboards: time ranges, tenant slices, question rollups)
-- -----------------------------------------------------------------------------
create index companies_region_industry_idx
	on public.companies (region, industry);

create index respondents_company_idx
	on public.respondents (company_id);

create index respondents_company_created_idx
	on public.respondents (company_id, created_at desc);

create index surveys_company_status_idx
	on public.surveys (company_id, status);

create index surveys_company_created_idx
	on public.surveys (company_id, created_at desc);

create index surveys_owner_idx
	on public.surveys (owner_id)
	where owner_id is not null;

create index surveys_status_closed_idx
	on public.surveys (status, closed_at desc);

create index questions_survey_sort_idx
	on public.questions (survey_id, sort_order);

create index questions_survey_type_idx
	on public.questions (survey_id, type);

create index questions_options_gin_idx
	on public.questions using gin (options_json jsonb_path_ops);

create index responses_survey_submitted_idx
	on public.responses (survey_id, submitted_at desc);

create index responses_company_submitted_idx
	on public.responses (company_id, submitted_at desc);

create index responses_question_submitted_idx
	on public.responses (question_id, submitted_at desc);

create index responses_respondent_submitted_idx
	on public.responses (respondent_id, submitted_at desc);

create index responses_survey_question_score_idx
	on public.responses (survey_id, question_id, answer_score)
	where answer_score is not null;

-- Latest-first lookups when respondents answer the same question more than once
create index responses_respondent_question_submitted_idx
	on public.responses (respondent_id, question_id, submitted_at desc);

-- -----------------------------------------------------------------------------
-- Row Level Security (sample policies — tighten for production)
-- Pattern: survey owner (auth.users.id) can manage their company's survey graph.
-- Service role bypasses RLS in Supabase PostgREST.
-- -----------------------------------------------------------------------------

alter table public.companies enable row level security;
alter table public.respondents enable row level security;
alter table public.surveys enable row level security;
alter table public.questions enable row level security;
alter table public.responses enable row level security;

-- Companies visible if the user owns any survey in that company.
create policy companies_select_for_survey_owners
	on public.companies
	for select
	to authenticated
	using (
		exists (
			select 1
			from public.surveys s
			where s.company_id = companies.company_id
				and s.owner_id = (select auth.uid())
		)
	);

-- Survey owners can insert/update companies they reference when creating surveys
-- (optional bootstrap; often company rows are created by service role only).
create policy companies_update_for_survey_owners
	on public.companies
	for update
	to authenticated
	using (
		exists (
			select 1
			from public.surveys s
			where s.company_id = companies.company_id
				and s.owner_id = (select auth.uid())
		)
	)
	with check (
		exists (
			select 1
			from public.surveys s
			where s.company_id = companies.company_id
				and s.owner_id = (select auth.uid())
		)
	);

-- Surveys: full CRUD for owner
create policy surveys_select_owner_or_demo_null_owner
	on public.surveys
	for select
	to authenticated
	using (
		owner_id = (select auth.uid())
		or owner_id is null
	);

create policy surveys_insert_owner
	on public.surveys
	for insert
	to authenticated
	with check (owner_id = (select auth.uid()) or owner_id is null);

create policy surveys_update_owner
	on public.surveys
	for update
	to authenticated
	using (owner_id = (select auth.uid()) or owner_id is null)
	with check (owner_id = (select auth.uid()) or owner_id is null);

create policy surveys_delete_owner
	on public.surveys
	for delete
	to authenticated
	using (owner_id = (select auth.uid()));

-- Respondents in companies tied to owned surveys (or demo null-owner surveys)
create policy respondents_select_same_visibility_as_surveys
	on public.respondents
	for select
	to authenticated
	using (
		exists (
			select 1
			from public.surveys s
			where s.company_id = respondents.company_id
				and (s.owner_id = (select auth.uid()) or s.owner_id is null)
		)
	);

create policy respondents_insert_same_visibility
	on public.respondents
	for insert
	to authenticated
	with check (
		exists (
			select 1
			from public.surveys s
			where s.company_id = respondents.company_id
				and (s.owner_id = (select auth.uid()) or s.owner_id is null)
		)
	);

create policy respondents_update_same_visibility
	on public.respondents
	for update
	to authenticated
	using (
		exists (
			select 1
			from public.surveys s
			where s.company_id = respondents.company_id
				and (s.owner_id = (select auth.uid()) or s.owner_id is null)
		)
	)
	with check (
		exists (
			select 1
			from public.surveys s
			where s.company_id = respondents.company_id
				and (s.owner_id = (select auth.uid()) or s.owner_id is null)
		)
	);

create policy respondents_delete_same_visibility
	on public.respondents
	for delete
	to authenticated
	using (
		exists (
			select 1
			from public.surveys s
			where s.company_id = respondents.company_id
				and s.owner_id = (select auth.uid())
		)
	);

-- Questions follow survey visibility
create policy questions_select_visible_survey
	on public.questions
	for select
	to authenticated
	using (
		exists (
			select 1
			from public.surveys s
			where s.survey_id = questions.survey_id
				and (s.owner_id = (select auth.uid()) or s.owner_id is null)
		)
	);

create policy questions_insert_owner_survey
	on public.questions
	for insert
	to authenticated
	with check (
		exists (
			select 1
			from public.surveys s
			where s.survey_id = questions.survey_id
				and (s.owner_id = (select auth.uid()) or s.owner_id is null)
		)
	);

create policy questions_update_owner_survey
	on public.questions
	for update
	to authenticated
	using (
		exists (
			select 1
			from public.surveys s
			where s.survey_id = questions.survey_id
				and (s.owner_id = (select auth.uid()) or s.owner_id is null)
		)
	)
	with check (
		exists (
			select 1
			from public.surveys s
			where s.survey_id = questions.survey_id
				and (s.owner_id = (select auth.uid()) or s.owner_id is null)
		)
	);

create policy questions_delete_owner_survey
	on public.questions
	for delete
	to authenticated
	using (
		exists (
			select 1
			from public.surveys s
			where s.survey_id = questions.survey_id
				and s.owner_id = (select auth.uid())
		)
	);

-- Responses: readable/writable when survey is visible to user
create policy responses_select_visible_survey
	on public.responses
	for select
	to authenticated
	using (
		exists (
			select 1
			from public.surveys s
			where s.survey_id = responses.survey_id
				and (s.owner_id = (select auth.uid()) or s.owner_id is null)
		)
	);

create policy responses_insert_visible_survey
	on public.responses
	for insert
	to authenticated
	with check (
		exists (
			select 1
			from public.surveys s
			where s.survey_id = responses.survey_id
				and (s.owner_id = (select auth.uid()) or s.owner_id is null)
		)
	);

create policy responses_update_visible_survey
	on public.responses
	for update
	to authenticated
	using (
		exists (
			select 1
			from public.surveys s
			where s.survey_id = responses.survey_id
				and (s.owner_id = (select auth.uid()) or s.owner_id is null)
		)
	)
	with check (
		exists (
			select 1
			from public.surveys s
			where s.survey_id = responses.survey_id
				and (s.owner_id = (select auth.uid()) or s.owner_id is null)
		)
	);

create policy responses_delete_owner_survey
	on public.responses
	for delete
	to authenticated
	using (
		exists (
			select 1
			from public.surveys s
			where s.survey_id = responses.survey_id
				and s.owner_id = (select auth.uid())
		)
	);

-- -----------------------------------------------------------------------------
-- Sample data (fixed UUIDs for reproducible local seeds)
-- Replace owner_id with your auth.users id if you remove the "null owner" demo policies.
-- -----------------------------------------------------------------------------
insert into public.companies (company_id, name, industry, region, tier)
values
	('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'Northwind Analytics', 'Software', 'NA', 'enterprise'),
	('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'Contoso Health', 'Healthcare', 'EU', 'smb');

insert into public.surveys (survey_id, name, description, category, owner_id, status, company_id, closed_at)
values
	(
		'cccccccc-cccc-cccc-cccc-cccccccccccc',
		'Quarterly Engagement',
		'Short pulse on team morale and clarity.',
		'HR',
		null,
		'active',
		'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
		null
	),
	(
		'dddddddd-dddd-dddd-dddd-dddddddddddd',
		'Patient Safety Culture',
		'Annual safety perception inventory.',
		'Clinical',
		null,
		'draft',
		'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb',
		null
	);

insert into public.questions (question_id, survey_id, question_text, type, dimension_tag, sort_order, options_json)
values
	(
		'eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee',
		'cccccccc-cccc-cccc-cccc-cccccccccccc',
		'I understand how my work contributes to company goals.',
		'likert',
		'alignment',
		1,
		'{"scale": ["Strongly disagree", "Disagree", "Neutral", "Agree", "Strongly agree"]}'::jsonb
	),
	(
		'ffffffff-ffff-ffff-ffff-ffffffffffff',
		'cccccccc-cccc-cccc-cccc-cccccccccccc',
		'My manager gives actionable feedback.',
		'likert',
		'management',
		2,
		'{"scale": ["1", "2", "3", "4", "5"]}'::jsonb
	),
	(
		'11111111-1111-1111-1111-1111111111ee',
		'cccccccc-cccc-cccc-cccc-cccccccccccc',
		'Which benefit matters most to you?',
		'single_choice',
		'benefits',
		3,
		'{"choices": ["Health", "Learning budget", "Flexible hours", "Remote work"]}'::jsonb
	),
	(
		'22222222-2222-2222-2222-2222222222ee',
		'dddddddd-dddd-dddd-dddd-dddddddddddd',
		'Reporting near-misses is encouraged on my unit.',
		'likert',
		'safety',
		1,
		'{"scale": ["Never", "Rarely", "Sometimes", "Often", "Always"]}'::jsonb
	),
	(
		'33333333-3333-3333-3333-3333333333ee',
		'dddddddd-dddd-dddd-dddd-dddddddddddd',
		'Describe one process change that would reduce risk.',
		'text',
		'freeform',
		2,
		'{"max_chars": 500}'::jsonb
	);

insert into public.respondents (respondent_id, company_id, full_name, email, department, job_title)
values
	(
		'44444444-4444-4444-4444-444444444444',
		'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
		'Ada Lovelace',
		'ada@northwind.example',
		'Engineering',
		'Staff Engineer'
	),
	(
		'55555555-5555-5555-5555-555555555555',
		'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
		'Alan Turing',
		'alan@northwind.example',
		'Research',
		'Research Scientist'
	),
	(
		'66666666-6666-6666-6666-666666666666',
		'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb',
		'Florence Nightingale',
		'florence@contoso.example',
		'Nursing',
		'Charge Nurse'
	);

-- 10 responses: mix of scores and text across engagement survey + one draft survey text answer
insert into public.responses (
	response_id,
	survey_id,
	respondent_id,
	company_id,
	question_id,
	answer_text,
	answer_score,
	submitted_at
)
values
	('77777777-7777-7777-7777-777777777701', 'cccccccc-cccc-cccc-cccc-cccccccccccc', '44444444-4444-4444-4444-444444444444', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee', null, 8, now() - interval '6 days'),
	('77777777-7777-7777-7777-777777777702', 'cccccccc-cccc-cccc-cccc-cccccccccccc', '44444444-4444-4444-4444-444444444444', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'ffffffff-ffff-ffff-ffff-ffffffffffff', null, 7, now() - interval '6 days'),
	('77777777-7777-7777-7777-777777777703', 'cccccccc-cccc-cccc-cccc-cccccccccccc', '44444444-4444-4444-4444-444444444444', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', '11111111-1111-1111-1111-1111111111ee', 'Learning budget', null, now() - interval '6 days'),
	('77777777-7777-7777-7777-777777777704', 'cccccccc-cccc-cccc-cccc-cccccccccccc', '55555555-5555-5555-5555-555555555555', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee', null, 6, now() - interval '5 days'),
	('77777777-7777-7777-7777-777777777705', 'cccccccc-cccc-cccc-cccc-cccccccccccc', '55555555-5555-5555-5555-555555555555', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'ffffffff-ffff-ffff-ffff-ffffffffffff', null, 9, now() - interval '5 days'),
	('77777777-7777-7777-7777-777777777706', 'cccccccc-cccc-cccc-cccc-cccccccccccc', '55555555-5555-5555-5555-555555555555', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', '11111111-1111-1111-1111-1111111111ee', 'Remote work', null, now() - interval '5 days'),
	('77777777-7777-7777-7777-777777777707', 'cccccccc-cccc-cccc-cccc-cccccccccccc', '44444444-4444-4444-4444-444444444444', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee', null, 9, now() - interval '1 day'),
	('77777777-7777-7777-7777-777777777708', 'cccccccc-cccc-cccc-cccc-cccccccccccc', '44444444-4444-4444-4444-444444444444', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'ffffffff-ffff-ffff-ffff-ffffffffffff', null, 8, now() - interval '1 day'),
	('77777777-7777-7777-7777-777777777709', 'dddddddd-dddd-dddd-dddd-dddddddddddd', '66666666-6666-6666-6666-666666666666', 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', '22222222-2222-2222-2222-2222222222ee', null, 5, now() - interval '12 hours'),
	('77777777-7777-7777-7777-777777777710', 'dddddddd-dddd-dddd-dddd-dddddddddddd', '66666666-6666-6666-6666-666666666666', 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', '33333333-3333-3333-3333-3333333333ee', 'Add a second nurse on rounds during peak admissions.', null, now() - interval '12 hours');

-- Foreign keys are declared inline on CREATE TABLE (same effect as ALTER TABLE ... ADD CONSTRAINT).
