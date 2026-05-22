-- =============================================================================
-- Survey form design (LLM HTML/CSS) for public form parity with builder preview
-- Run: npm run db:migrate   (includes this file when wired in runner)
-- =============================================================================

alter table public.surveys
	add column if not exists form_html text,
	add column if not exists form_css text;

comment on column public.surveys.form_html is
	'Sanitized body HTML (+ inline scripts) for public form iframe; field names bound to question_id.';

comment on column public.surveys.form_css is
	'Extracted <style> content from LLM-generated form for public form iframe.';

grant select, insert, update, delete on table public.surveys to authenticated;
