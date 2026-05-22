-- Remove deprecated company logo column (safe to re-run).
-- Run against databases that previously added `logo_url`.

alter table public.companies drop column if exists logo_url;
