-- =============================================================================
-- DEPRECATED: public.users was removed from this project.
-- Use Supabase Auth (auth.users) + database/migration_secure_rls_drop_public_users.sql
-- =============================================================================
-- Supabase / PostgreSQL — Express auth users (run in SQL Editor)
-- Requires: pgcrypto (gen_random_uuid) — enable in Supabase or: create extension if not exists pgcrypto;

create extension if not exists pgcrypto with schema extensions;

create table if not exists public.users (
	id uuid primary key default gen_random_uuid(),
	full_name text not null,
	email citext not null,
	password_hash text,
	role text not null default 'user',
	created_at timestamptz not null default now(),
	updated_at timestamptz not null default now(),
	constraint users_email_unique unique (email),
	constraint users_role_check check (role in ('user', 'admin')),
	constraint users_full_name_not_empty check (length(trim(full_name)) > 0),
	constraint users_password_or_legacy check (password_hash is null or length(password_hash) >= 20)
);

comment on table public.users is 'Application users (email/password via Express). password_hash null = row created outside auth.';
comment on column public.users.password_hash is 'bcrypt hash; never expose via public API.';

create index if not exists users_email_idx on public.users (lower(email::text));
create index if not exists users_role_idx on public.users (role);
create index if not exists users_created_at_idx on public.users (created_at desc);

-- Sample user: email demo@localhost.example, password: Password123!
insert into public.users (full_name, email, password_hash, role)
values (
	'Demo User',
	'demo@localhost.example',
	$ph$$2b$12$QIpU3wHvTvZKNMPEn6RhReeN1zoNJWgXOFSK1N.lSyAH1lQX5ksd6$ph$,
	'user'
)
on conflict (email) do nothing;
