-- Phase 1: browse and item detail.
--
-- Students never read public.items directly for browsing. These security-definer
-- functions are the only read path: they return open items only, and for
-- sensitive categories (SPEC §10.3) they return category + building + date and
-- nothing else (no photo, no description, no colours). Finder identity and the
-- verification secret are never selected.
--
-- DEMO NOTE: executable by anon because sign-in is switched off for the demo.
-- SPEC §10.2 says the index must be auth-gated; revoke from anon when sign-in
-- returns (see DECISIONS.md, 2026-10-18).

create function public.item_card_photos(p_item_id uuid, p_is_sensitive boolean)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select case when p_is_sensitive then '[]'::jsonb else coalesce((
    select jsonb_agg(
      jsonb_build_object(
        'id', p.id, 'width', p.width, 'height', p.height,
        'blurhash', p.blurhash, 'variants', p.variants
      ) order by p.sort_order)
    from public.item_photos p
    where p.item_id = p_item_id
  ), '[]'::jsonb) end;
$$;

create function public.browse_items(
  p_category uuid default null,
  p_building uuid default null,
  p_from date default null,
  p_to date default null,
  p_q text default null,
  p_before_created timestamptz default null,
  p_before_id uuid default null,
  p_limit integer default 24
)
returns table (
  id uuid,
  category_name text,
  category_slug text,
  category_icon text,
  building_name text,
  drop_off_name text,
  found_at date,
  created_at timestamptz,
  is_sensitive boolean,
  description text,
  color_tags text[],
  photos jsonb
)
language sql
stable
security definer
set search_path = ''
as $$
  select
    i.id,
    c.name,
    c.slug,
    c.icon,
    b.name,
    d.name,
    i.found_at,
    i.created_at,
    i.is_sensitive,
    case when i.is_sensitive then null else i.description end,
    case when i.is_sensitive then '{}'::text[] else i.color_tags end,
    public.item_card_photos(i.id, i.is_sensitive)
  from public.items i
  join public.categories c on c.id = i.category_id
  join public.buildings b on b.id = i.building_id
  left join public.drop_off_points d on d.id = i.drop_off_point_id
  where i.status = 'open'
    and (p_category is null or i.category_id = p_category)
    and (p_building is null or i.building_id = p_building)
    and (p_from is null or i.found_at >= p_from)
    and (p_to is null or i.found_at <= p_to)
    and (
      p_q is null
      or position(lower(p_q) in lower(c.name)) > 0
      or (not i.is_sensitive and i.search_tsv @@ websearch_to_tsquery('english', p_q))
    )
    and (
      p_before_created is null
      or (i.created_at, i.id) < (p_before_created, p_before_id)
    )
  order by i.created_at desc, i.id desc
  limit least(greatest(coalesce(p_limit, 24), 1), 48);
$$;

create function public.get_item(p_id uuid)
returns table (
  id uuid,
  category_name text,
  category_slug text,
  category_icon text,
  building_name text,
  drop_off_name text,
  drop_off_instructions text,
  found_at date,
  created_at timestamptz,
  is_sensitive boolean,
  description text,
  color_tags text[],
  photos jsonb
)
language sql
stable
security definer
set search_path = ''
as $$
  select
    i.id,
    c.name,
    c.slug,
    c.icon,
    b.name,
    coalesce(d.name, u.name),
    coalesce(d.instructions, u.instructions),
    i.found_at,
    i.created_at,
    i.is_sensitive,
    case when i.is_sensitive then null else i.description end,
    case when i.is_sensitive then '{}'::text[] else i.color_tags end,
    public.item_card_photos(i.id, i.is_sensitive)
  from public.items i
  join public.categories c on c.id = i.category_id
  join public.buildings b on b.id = i.building_id
  left join public.drop_off_points d on d.id = i.drop_off_point_id
  -- Until the finder picks a drop-off point, the Union desk is the default.
  left join public.drop_off_points u on u.slug = 'union-desk' and u.campus_id = c.campus_id
  where i.id = p_id and i.status = 'open';
$$;

-- Which stored object to serve for a photo, or nothing if it must not be shown.
create function public.photo_object(p_photo_id uuid)
returns table (storage_path text, variants smallint[])
language sql
stable
security definer
set search_path = ''
as $$
  select p.storage_path, p.variants
  from public.item_photos p
  join public.items i on i.id = p.item_id
  where p.id = p_photo_id and i.status = 'open' and not i.is_sensitive;
$$;

revoke all on function public.item_card_photos(uuid, boolean) from public;
revoke all on function public.browse_items(uuid, uuid, date, date, text, timestamptz, uuid, integer) from public;
revoke all on function public.get_item(uuid) from public;
revoke all on function public.photo_object(uuid) from public;

grant execute on function public.browse_items(uuid, uuid, date, date, text, timestamptz, uuid, integer)
  to anon, authenticated;
grant execute on function public.get_item(uuid) to anon, authenticated;
grant execute on function public.photo_object(uuid) to anon, authenticated;
