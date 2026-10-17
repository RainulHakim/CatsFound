-- Row-level security: default deny everywhere, then grant narrowly.
-- Roles are read from public.users, never from a JWT claim.
-- service_role bypasses RLS and is used only by server code that has
-- already authorised the action (anonymous posting, jobs, rate limits).

-- ---------------------------------------------------------------- privileges baseline

revoke all on all tables in schema public from anon, authenticated;
revoke all on all functions in schema public from anon, authenticated, public;
alter default privileges in schema public revoke all on tables from anon, authenticated;
alter default privileges in schema public revoke all on functions from anon, authenticated, public;

alter table public.campuses        enable row level security;
alter table public.categories      enable row level security;
alter table public.buildings       enable row level security;
alter table public.drop_off_points enable row level security;
alter table public.users           enable row level security;
alter table public.items           enable row level security;
alter table public.item_private    enable row level security;
alter table public.item_photos     enable row level security;
alter table public.lost_reports    enable row level security;
alter table public.matches         enable row level security;
alter table public.claims          enable row level security;
alter table public.audit_log       enable row level security;
alter table public.rate_limits     enable row level security;
alter table public.metrics_events  enable row level security;

-- ---------------------------------------------------------------- role helpers

create function public.app_role() returns public.user_role
language sql
stable
security definer
set search_path = ''
as $$
  select u.role from public.users u where u.id = auth.uid();
$$;

create function public.is_staff() returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(public.app_role() in ('staff', 'admin'), false);
$$;

create function public.is_admin() returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(public.app_role() = 'admin', false);
$$;

-- Is the current user the signed-in finder of this item?
create function public.is_item_poster(p_item_id uuid) returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select auth.uid() is not null and exists (
    select 1 from public.item_private p
    where p.item_id = p_item_id and p.posted_by = auth.uid()
  );
$$;

grant execute on function public.app_role(), public.is_staff(), public.is_admin(),
  public.is_item_poster(uuid) to authenticated;

-- ---------------------------------------------------------------- reference data: readable by all

grant select on public.campuses, public.categories, public.buildings, public.drop_off_points
  to anon, authenticated;

create policy campuses_read on public.campuses for select to anon, authenticated using (true);
create policy categories_read on public.categories for select to anon, authenticated using (true);
create policy buildings_read on public.buildings for select to anon, authenticated using (is_active);
create policy drop_off_points_read on public.drop_off_points for select to anon, authenticated
  using (is_active);

-- ---------------------------------------------------------------- users

grant select on public.users to authenticated;
grant update (display_name, notification_prefs) on public.users to authenticated;

create policy users_read_self_or_staff on public.users for select to authenticated
  using (id = auth.uid() or public.is_staff());

create policy users_update_self on public.users for update to authenticated
  using (id = auth.uid())
  with check (id = auth.uid());

-- ---------------------------------------------------------------- items
-- Students may read open, non-sensitive items. Sensitive items reach students
-- only as placeholder cards through a security-definer browse function
-- (Phase 1) that returns no photo and no description.

grant select on public.items to authenticated;
grant update (description, color_tags, status, drop_off_point_id, archived_at, collected_at)
  on public.items to authenticated;

create policy items_read on public.items for select to authenticated
  using (
    (status = 'open' and not is_sensitive)
    or public.is_staff()
    or public.is_item_poster(id)
  );

create policy items_update_staff on public.items for update to authenticated
  using (public.is_staff())
  with check (public.is_staff());

-- ---------------------------------------------------------------- item_private: staff + poster only

grant select on public.item_private to authenticated;

create policy item_private_read on public.item_private for select to authenticated
  using (public.is_staff() or posted_by = auth.uid());

-- ---------------------------------------------------------------- item_photos: visible iff the item is

grant select on public.item_photos to authenticated;

create policy item_photos_read on public.item_photos for select to authenticated
  using (
    exists (
      select 1 from public.items i
      where i.id = item_id
        and (
          (i.status = 'open' and not i.is_sensitive)
          or public.is_staff()
          or public.is_item_poster(i.id)
        )
    )
  );

-- ---------------------------------------------------------------- lost reports: owner + staff

grant select, insert on public.lost_reports to authenticated;
grant update (status, description, distinguishing_marks, building_ids, color_tags,
  lost_after, lost_before) on public.lost_reports to authenticated;

create policy lost_reports_read on public.lost_reports for select to authenticated
  using (user_id = auth.uid() or public.is_staff());

create policy lost_reports_insert_own on public.lost_reports for insert to authenticated
  with check (user_id = auth.uid());

create policy lost_reports_update_own on public.lost_reports for update to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

-- ---------------------------------------------------------------- matches: report owner + staff

grant select on public.matches to authenticated;
grant update (dismissed_at) on public.matches to authenticated;

create policy matches_read on public.matches for select to authenticated
  using (
    public.is_staff()
    or exists (
      select 1 from public.lost_reports r
      where r.id = lost_report_id and r.user_id = auth.uid()
    )
  );

create policy matches_dismiss_own on public.matches for update to authenticated
  using (
    exists (
      select 1 from public.lost_reports r
      where r.id = lost_report_id and r.user_id = auth.uid()
    )
  )
  with check (
    exists (
      select 1 from public.lost_reports r
      where r.id = lost_report_id and r.user_id = auth.uid()
    )
  );

-- ---------------------------------------------------------------- claims: claimant + staff
-- Inserts go through the server (verification logic needs the secret).

grant select on public.claims to authenticated;
grant update (status, reviewed_by, reviewed_at, notes) on public.claims to authenticated;

create policy claims_read on public.claims for select to authenticated
  using (claimant_id = auth.uid() or public.is_staff());

create policy claims_review_staff on public.claims for update to authenticated
  using (public.is_staff())
  with check (public.is_staff());

-- ---------------------------------------------------------------- audit log: admin read only

grant select on public.audit_log to authenticated;

create policy audit_log_read_admin on public.audit_log for select to authenticated
  using (public.is_admin());

-- rate_limits and metrics_events: RLS enabled, no grants, no policies.
-- Only service_role touches them.
