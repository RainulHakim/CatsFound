-- Auth hardening and rate limiting.

-- ---------------------------------------------------------------- email domain enforcement
-- The publishable key is public, so anyone can call Supabase Auth directly and
-- skip our server checks. This trigger is the real guarantee that only
-- @davidson.edu addresses ever become accounts. Plus-addressing is rejected so
-- one person cannot mint many accounts.

create function public.is_allowed_email(p_email text) returns boolean
language sql
immutable
set search_path = ''
as $$
  select p_email is not null
    and lower(p_email) ~ '^[a-z0-9._-]+@davidson\.edu$';
$$;

create function public.enforce_auth_email_domain() returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not public.is_allowed_email(new.email) then
    raise exception 'Only @davidson.edu email addresses can sign in'
      using errcode = 'check_violation';
  end if;
  new.email := lower(new.email);
  return new;
end;
$$;

create trigger enforce_email_domain
  before insert or update of email on auth.users
  for each row execute function public.enforce_auth_email_domain();

-- ---------------------------------------------------------------- profile row

create function public.handle_new_auth_user() returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.users (id, email)
  values (new.id, lower(new.email))
  on conflict (id) do nothing;
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_auth_user();

-- Keep the profile email in sync if it ever changes in auth.
create function public.handle_auth_user_email_change() returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.users set email = lower(new.email) where id = new.id;
  return new;
end;
$$;

create trigger on_auth_user_email_changed
  after update of email on auth.users
  for each row
  when (old.email is distinct from new.email)
  execute function public.handle_auth_user_email_change();

-- ---------------------------------------------------------------- rate limiting
-- Fixed-window counter. Returns true when the hit is allowed.
-- Called only by server code via the service role.

create function public.rate_limit_hit(p_key text, p_window_seconds integer, p_max integer)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_window timestamptz;
  v_hits integer;
begin
  if p_window_seconds <= 0 or p_max <= 0 then
    raise exception 'invalid rate limit parameters';
  end if;

  v_window := to_timestamp(floor(extract(epoch from now()) / p_window_seconds) * p_window_seconds);

  insert into public.rate_limits as r (key, window_start, hits)
  values (p_key, v_window, 1)
  on conflict (key, window_start) do update set hits = r.hits + 1
  returning r.hits into v_hits;

  return v_hits <= p_max;
end;
$$;

revoke all on function public.rate_limit_hit(text, integer, integer) from public, anon, authenticated;
grant execute on function public.rate_limit_hit(text, integer, integer) to service_role;

-- Old windows are deleted by the daily maintenance job.
create function public.rate_limits_prune(p_older_than interval default interval '2 days')
returns integer
language sql
security definer
set search_path = ''
as $$
  with d as (
    delete from public.rate_limits where window_start < now() - p_older_than returning 1
  )
  select count(*)::integer from d;
$$;

revoke all on function public.rate_limits_prune(interval) from public, anon, authenticated;
grant execute on function public.rate_limits_prune(interval) to service_role;
