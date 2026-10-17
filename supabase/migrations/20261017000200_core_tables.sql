-- Core tables. All public-facing IDs are UUIDs.
-- Deviations from SPEC §7 (see PLAN.md §A and DECISIONS.md):
--   * campuses table + campus_id on reference tables (tenancy possible later, single tenant now)
--   * categories.group_slug (Tier 0 "same category group")
--   * drop_off_points table + items.drop_off_point_id
--   * finder identity and the verification secret live in item_private, not items
--   * embedding columns are added in Phase 4, not now

-- ---------------------------------------------------------------- reference data

create table public.campuses (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text not null unique,
  email_domain text not null,
  created_at timestamptz not null default now()
);

create table public.categories (
  id uuid primary key default gen_random_uuid(),
  campus_id uuid not null references public.campuses (id) on delete restrict,
  name text not null,
  slug text not null,
  group_slug text not null,
  is_sensitive boolean not null default false,
  icon text not null,
  sort_order smallint not null default 0,
  unique (campus_id, slug)
);

create table public.buildings (
  id uuid primary key default gen_random_uuid(),
  campus_id uuid not null references public.campuses (id) on delete restrict,
  name text not null,
  slug text not null,
  -- Building centroid. Building-level only; never a precise find location.
  lat double precision not null check (lat between -90 and 90),
  lng double precision not null check (lng between -180 and 180),
  is_active boolean not null default true,
  unique (campus_id, slug)
);

create table public.drop_off_points (
  id uuid primary key default gen_random_uuid(),
  campus_id uuid not null references public.campuses (id) on delete restrict,
  building_id uuid not null references public.buildings (id) on delete restrict,
  name text not null,
  slug text not null,
  instructions text not null default '',
  -- Sensitive items (SPEC §10.3) may only be dropped where this is true.
  accepts_sensitive boolean not null default false,
  is_active boolean not null default true,
  sort_order smallint not null default 0,
  unique (campus_id, slug)
);

-- ---------------------------------------------------------------- people

create table public.users (
  id uuid primary key references auth.users (id) on delete cascade,
  email text not null unique check (email = lower(email) and email like '%@davidson.edu'),
  display_name text check (char_length(display_name) <= 80),
  role public.user_role not null default 'student',
  notification_prefs jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

-- ---------------------------------------------------------------- found items

create table public.items (
  id uuid primary key default gen_random_uuid(),
  status public.item_status not null default 'open',
  category_id uuid not null references public.categories (id) on delete restrict,
  color_tags text[] not null default '{}',
  building_id uuid not null references public.buildings (id) on delete restrict,
  drop_off_point_id uuid references public.drop_off_points (id) on delete set null,
  found_at date not null default current_date,
  description text not null default '' check (char_length(description) <= 500),
  -- Derived from the category by trigger; never trusted from the client.
  is_sensitive boolean not null default false,
  search_tsv tsvector generated always as (to_tsvector('english', description)) stored,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  collected_at timestamptz,
  archived_at timestamptz,
  check (cardinality(color_tags) <= 5)
);

-- Who found it and what only the owner would know. Staff + the poster only.
create table public.item_private (
  item_id uuid primary key references public.items (id) on delete cascade,
  posted_by uuid references public.users (id) on delete set null, -- null = anonymous finder
  verification_secret_enc text,  -- AES-256-GCM, app-level key
  posted_by_contact_enc text,    -- AES-256-GCM, app-level key
  created_at timestamptz not null default now()
);

create table public.item_photos (
  id uuid primary key default gen_random_uuid(),
  item_id uuid not null references public.items (id) on delete cascade,
  -- Object key prefix in the private bucket; variants are "<path>_<width>.webp".
  storage_path text not null unique,
  variants smallint[] not null,
  width integer not null check (width > 0),
  height integer not null check (height > 0),
  blurhash text not null,
  sort_order smallint not null default 0 check (sort_order between 0 and 3),
  created_at timestamptz not null default now(),
  unique (item_id, sort_order)
);

-- ---------------------------------------------------------------- lost reports & matching

create table public.lost_reports (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users (id) on delete cascade,
  status public.lost_report_status not null default 'active',
  category_id uuid not null references public.categories (id) on delete restrict,
  color_tags text[] not null default '{}',
  building_ids uuid[] not null default '{}',
  lost_after date not null,
  lost_before date not null,
  description text not null default '' check (char_length(description) <= 1000),
  distinguishing_marks text not null default '' check (char_length(distinguishing_marks) <= 1000),
  reference_photo_path text,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default (now() + interval '90 days'),
  renewal_notified_at timestamptz,
  check (lost_after <= lost_before)
);

create table public.matches (
  id uuid primary key default gen_random_uuid(),
  lost_report_id uuid not null references public.lost_reports (id) on delete cascade,
  item_id uuid not null references public.items (id) on delete cascade,
  score numeric(6, 3) not null,
  tier smallint not null check (tier in (0, 1, 2)),
  notified_at timestamptz,
  dismissed_at timestamptz,
  created_at timestamptz not null default now(),
  unique (lost_report_id, item_id)
);

-- ---------------------------------------------------------------- claims

create table public.claims (
  id uuid primary key default gen_random_uuid(),
  item_id uuid not null references public.items (id) on delete cascade,
  claimant_id uuid not null references public.users (id) on delete cascade,
  status public.claim_status not null default 'pending',
  verification_answer_enc text,
  verification_attempts smallint not null default 0,
  verification_passed boolean,
  honor_pledge_accepted boolean not null default false,
  reviewed_by uuid references public.users (id) on delete set null,
  reviewed_at timestamptz,
  notes text check (char_length(notes) <= 2000),
  created_at timestamptz not null default now()
);

-- ---------------------------------------------------------------- operations

create table public.audit_log (
  id uuid primary key default gen_random_uuid(),
  actor_id uuid references public.users (id) on delete set null,
  action text not null,
  entity_type text not null,
  entity_id uuid,
  metadata jsonb not null default '{}'::jsonb,
  ip_hash text,
  created_at timestamptz not null default now()
);

create table public.rate_limits (
  key text not null,
  window_start timestamptz not null,
  hits integer not null default 0,
  primary key (key, window_start)
);

-- Product metrics (SPEC §14). Rates are derived from items/matches/claims;
-- only time-to-post needs its own event.
create table public.metrics_events (
  id uuid primary key default gen_random_uuid(),
  name text not null check (name in ('time_to_post')),
  value numeric not null,
  item_id uuid references public.items (id) on delete set null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

-- ---------------------------------------------------------------- indexes (SPEC §13 + browse/FK paths)

create index items_status_category_found_idx on public.items (status, category_id, found_at);
create index items_building_idx on public.items (building_id);
create index items_search_idx on public.items using gin (search_tsv);
create index items_browse_idx on public.items (status, created_at desc, id desc);
create index item_private_posted_by_idx on public.item_private (posted_by);
create index lost_reports_status_user_idx on public.lost_reports (status, user_id);
create index matches_lost_report_idx on public.matches (lost_report_id);
create index matches_item_idx on public.matches (item_id);
create index claims_item_idx on public.claims (item_id);
create index claims_claimant_idx on public.claims (claimant_id);
create index audit_log_created_idx on public.audit_log (created_at);
create index audit_log_entity_idx on public.audit_log (entity_type, entity_id);
create index rate_limits_window_idx on public.rate_limits (window_start);
create index metrics_events_name_created_idx on public.metrics_events (name, created_at);

-- ---------------------------------------------------------------- triggers

create function public.items_derive_sensitive() returns trigger
language plpgsql
set search_path = ''
as $$
begin
  select c.is_sensitive into new.is_sensitive
  from public.categories c
  where c.id = new.category_id;
  return new;
end;
$$;

-- BEFORE triggers fire in name order: derive sensitivity first, then validate.
create trigger items_10_derive_sensitive
  before insert or update of category_id, is_sensitive on public.items
  for each row execute function public.items_derive_sensitive();

create trigger items_set_updated_at
  before update on public.items
  for each row execute function public.set_updated_at();

-- Sensitive items can only be routed to a drop-off point that accepts them.
create function public.items_check_drop_off() returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.drop_off_point_id is not null and new.is_sensitive and not exists (
    select 1 from public.drop_off_points d
    where d.id = new.drop_off_point_id and d.accepts_sensitive
  ) then
    raise exception 'sensitive items must go to a drop-off point that accepts them'
      using errcode = 'check_violation';
  end if;
  return new;
end;
$$;

create trigger items_20_check_drop_off
  before insert or update of drop_off_point_id, category_id on public.items
  for each row execute function public.items_check_drop_off();
