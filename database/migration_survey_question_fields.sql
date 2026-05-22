-- =============================================================================
-- Question editor: placeholder + validation_rules
-- Adds editable per-question metadata used by the in-app form editor.
-- Run via: npm run db:migrate (or Supabase SQL editor).
-- =============================================================================

alter table public.questions
	add column if not exists placeholder text,
	add column if not exists validation_rules jsonb not null default '{}'::jsonb;

comment on column public.questions.placeholder is
	'Optional placeholder string shown inside text/number/date/textarea inputs.';

comment on column public.questions.validation_rules is
	'Per-question validation hints (e.g. minLength, maxLength, min, max, pattern, accept).';

create index if not exists questions_validation_rules_gin_idx
	on public.questions using gin (validation_rules);

grant select, insert, update, delete on table public.questions to authenticated;
