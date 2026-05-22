-- =============================================================================
-- Survey max submissions + total_submissions counter
-- Run in Supabase SQL Editor or: psql $DATABASE_URL -f database/migration_survey_max_submissions.sql
-- =============================================================================

-- New columns on surveys
alter table public.surveys
	add column if not exists max_submissions integer,
	add column if not exists total_submissions integer not null default 0;

comment on column public.surveys.max_submissions is
	'Optional cap on form submissions. NULL = unlimited. When total_submissions reaches this value, status auto-closes.';

comment on column public.surveys.total_submissions is
	'Number of completed public form submissions (incremented once per submit).';

-- Optional: enforce positive max when set
alter table public.surveys
	drop constraint if exists surveys_max_submissions_positive;

alter table public.surveys
	add constraint surveys_max_submissions_positive
	check (max_submissions is null or max_submissions > 0);

alter table public.surveys
	drop constraint if exists surveys_total_submissions_non_negative;

alter table public.surveys
	add constraint surveys_total_submissions_non_negative
	check (total_submissions >= 0);

-- Backfill total_submissions from existing response rows (one submit ≈ one distinct second bucket)
update public.surveys s
set total_submissions = coalesce(
	(
		select count(distinct date_trunc('second', r.submitted_at))::int
		from public.responses r
		where r.survey_id = s.survey_id
	),
	0
)
where total_submissions = 0;

-- Migrate legacy archived UI rows to closed where applicable (optional data fix)
update public.surveys
set status = 'closed'::public.survey_status,
	closed_at = coalesce(closed_at, now())
where status = 'archived'::public.survey_status;

-- Auto-close surveys already at or over cap
update public.surveys
set status = 'closed'::public.survey_status,
	closed_at = coalesce(closed_at, now())
where max_submissions is not null
	and total_submissions >= max_submissions
	and status = 'active'::public.survey_status;

-- RLS: no change required — existing surveys_* policies cover new columns.
-- Service role / app pool bypasses RLS; authenticated policies remain column-agnostic.

grant select, insert, update, delete on table public.surveys to authenticated;
