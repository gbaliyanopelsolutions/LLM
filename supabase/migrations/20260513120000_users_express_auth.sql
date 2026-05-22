-- Express email/password auth — add columns to existing public.users
-- Safe re-run. Does not change full_name nullability (legacy rows).

create extension if not exists citext with schema extensions;

alter table public.users add column if not exists password_hash text;
alter table public.users add column if not exists role text not null default 'user';

alter table public.users drop constraint if exists users_role_check;
alter table public.users add constraint users_role_check check (role in ('user', 'admin'));

alter table public.users drop constraint if exists users_password_or_legacy;
alter table public.users add constraint users_password_or_legacy check (password_hash is null or length(password_hash) >= 20);

create index if not exists users_role_idx on public.users (role);
create index if not exists users_created_at_idx on public.users (created_at desc);

comment on column public.users.password_hash is 'bcrypt hash for Express auth.';
