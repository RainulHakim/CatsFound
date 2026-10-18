-- Platform bootstrap for plain Postgres (Neon, PGlite in tests).
-- Provides the small slice of what Supabase pre-provisions that our
-- migrations rely on: the anon/authenticated/service_role roles, an auth
-- schema with auth.uid() and auth.users, and storage.buckets.
-- Idempotent. Run once before supabase/migrations/*.

do $$ begin
  if not exists (select 1 from pg_roles where rolname = 'anon') then create role anon nologin; end if;
  if not exists (select 1 from pg_roles where rolname = 'authenticated') then create role authenticated nologin; end if;
  if not exists (select 1 from pg_roles where rolname = 'service_role') then create role service_role nologin; end if;
end $$;

-- The app connects as the database owner and switches to these per request.
grant anon, authenticated, service_role to current_user;

create schema if not exists extensions;
create schema if not exists auth;
create schema if not exists storage;

create table if not exists auth.users (
  id uuid primary key default gen_random_uuid(),
  email text,
  created_at timestamptz default now()
);

-- Same contract as Supabase: the signed-in user's id from the request claims.
create or replace function auth.uid() returns uuid language sql stable as $$
  select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid
$$;

create table if not exists storage.buckets (
  id text primary key,
  name text not null,
  public boolean default false,
  file_size_limit bigint,
  allowed_mime_types text[]
);

grant usage on schema public, auth to anon, authenticated, service_role;
grant execute on function auth.uid() to anon, authenticated, service_role;
alter default privileges in schema public grant all on tables to anon, authenticated, service_role;
alter default privileges in schema public grant all on functions to anon, authenticated, service_role;

-- Migration history lives outside public, so it is never exposed.
create schema if not exists app_meta;
revoke all on schema app_meta from public;
create table if not exists app_meta.schema_migrations (
  version text primary key,
  applied_at timestamptz not null default now()
);
