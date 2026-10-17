-- Extensions and enum types.

create extension if not exists vector with schema extensions; -- pgvector, used from Phase 4

create type public.user_role as enum ('student', 'staff', 'admin');
create type public.item_status as enum ('open', 'claimed', 'collected', 'archived');
create type public.lost_report_status as enum ('active', 'matched', 'resolved', 'expired');
create type public.claim_status as enum ('pending', 'approved', 'denied', 'collected');

-- Generic updated_at maintenance.
create function public.set_updated_at() returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;
