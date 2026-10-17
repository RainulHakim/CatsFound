-- Seed data. Idempotent: safe to re-run.
--
-- BUILDINGS ARE PLACEHOLDERS. Names are well-known Davidson buildings;
-- coordinates are approximate centroids and must be checked before launch
-- (they drive "nearest first" and the 400 m radius in Tier 0 matching).
-- Edit this file, then re-run it.

insert into public.campuses (name, slug, email_domain)
values ('Davidson College', 'davidson', 'davidson.edu')
on conflict (slug) do nothing;

-- ---------------------------------------------------------------- categories
-- The 10 sensitive categories are fixed by SPEC §10.3.

with c as (select id from public.campuses where slug = 'davidson')
insert into public.categories (campus_id, name, slug, group_slug, is_sensitive, icon, sort_order)
select c.id, v.name, v.slug, v.group_slug, v.is_sensitive, v.icon, v.sort_order
from c, (values
  -- name                     slug            group          sensitive icon              order
  ('Water bottle',            'water-bottle', 'drinkware',   false,  'cup-soda',          10),
  ('Earbuds / headphones',    'earbuds',      'audio',       false,  'headphones',        20),
  ('Jacket / coat',           'jacket',       'outerwear',   false,  'shirt',             30),
  ('Bag / backpack',          'backpack',     'bags',        false,  'backpack',          40),
  ('Charger / cable',         'charger',      'cables',      false,  'cable',             50),
  ('Glasses / sunglasses',    'glasses',      'eyewear',     false,  'glasses',           60),
  ('Hat / gloves / scarf',    'hat',          'outerwear',   false,  'snowflake',         70),
  ('Other clothing',          'clothing',     'outerwear',   false,  'tag',               80),
  ('Book / notebook',         'book',         'books',       false,  'book-open',         90),
  ('Umbrella',                'umbrella',     'weather',     false,  'umbrella',         100),
  ('Calculator',              'calculator',   'devices',     false,  'calculator',       110),
  ('Sports equipment',        'sports',       'sports',      false,  'volleyball',       120),
  ('Other',                   'other',        'other',       false,  'package',          990),
  ('Keys',                    'keys',         'keys',        true,   'key-round',        200),
  ('Wallet',                  'wallet',       'cards',       true,   'wallet',           210),
  ('ID card',                 'id-card',      'cards',       true,   'id-card',          220),
  ('Credit / debit card',     'bank-card',    'cards',       true,   'credit-card',      230),
  ('Phone',                   'phone',        'devices',     true,   'smartphone',       240),
  ('Laptop / tablet',         'laptop',       'devices',     true,   'laptop',           250),
  ('Purse',                   'purse',        'bags',        true,   'handbag',          260),
  ('Passport',                'passport',     'documents',   true,   'book-user',        270),
  ('Medication',              'medication',   'health',      true,   'pill',             280),
  ('Jewelry',                 'jewelry',      'jewelry',     true,   'gem',              290)
) as v(name, slug, group_slug, is_sensitive, icon, sort_order)
on conflict (campus_id, slug) do update
  set name = excluded.name,
      group_slug = excluded.group_slug,
      is_sensitive = excluded.is_sensitive,
      icon = excluded.icon,
      sort_order = excluded.sort_order;

-- ---------------------------------------------------------------- buildings (placeholders, see top)

with c as (select id from public.campuses where slug = 'davidson')
insert into public.buildings (campus_id, name, slug, lat, lng)
select c.id, v.name, v.slug, v.lat, v.lng
from c, (values
  -- Academic & student life
  ('Alvarez College Union',              'alvarez-union',     35.50020, -80.84520),
  ('Chambers Building',                  'chambers',          35.50110, -80.84640),
  ('Wall Academic Center',               'wall',              35.50170, -80.84470),
  ('E.H. Little Library',                'library',           35.50060, -80.84750),
  ('Vail Commons',                       'vail-commons',      35.49990, -80.84590),
  ('Baker Sports Complex',               'baker',             35.49860, -80.84890),
  ('Belk Visual Arts Center',            'belk-arts',         35.49920, -80.84330),
  ('Cunningham Fine Arts Building',      'cunningham',        35.49900, -80.84410),
  ('Sloan Music Center',                 'sloan',             35.49950, -80.84370),
  ('Duke Family Performance Hall',       'duke-hall-perf',    35.49880, -80.84380),
  ('Chidsey Hall',                       'chidsey',           35.50190, -80.84600),
  ('Martin Chemical Laboratory',         'martin-chem',       35.50220, -80.84550),
  ('Preyer Hall',                        'preyer',            35.50070, -80.84660),
  ('Davidson College Presbyterian Church','dcpc',             35.49980, -80.84780),
  ('Richardson Stadium',                 'richardson-stadium',35.49700, -80.84970),
  ('Patterson Court',                    'patterson-court',   35.49750, -80.84470),
  -- Residence halls
  ('Akers Hall',                         'akers',             35.50270, -80.84750),
  ('Belk Hall',                          'belk-hall',         35.50300, -80.84820),
  ('Cannon Hall',                        'cannon',            35.50350, -80.84680),
  ('Duke Hall',                          'duke-res',          35.50330, -80.84620),
  ('Irwin Hall',                         'irwin',             35.50260, -80.84880),
  ('Knox Hall',                          'knox',              35.50380, -80.84760),
  ('Little Hall',                        'little',            35.50240, -80.84650),
  ('Richardson Hall',                    'richardson-hall',   35.50310, -80.84540),
  ('Rusk Hall',                          'rusk',              35.50400, -80.84850),
  ('Sentelle Hall',                      'sentelle',          35.50360, -80.84590),
  ('Tomlinson Hall',                     'tomlinson',         35.50420, -80.84700),
  ('Watts Hall',                         'watts',             35.50280, -80.84580),
  ('Martin Court',                       'martin-court',      35.49680, -80.84620),
  ('Lake Campus',                        'lake-campus',       35.47900, -80.87000)
) as v(name, slug, lat, lng)
on conflict (campus_id, slug) do update
  set name = excluded.name, lat = excluded.lat, lng = excluded.lng;

-- ---------------------------------------------------------------- drop-off points
-- Only the Union desk accepts sensitive items (SPEC §10.3: pickup at the Union, always).

with c as (select id from public.campuses where slug = 'davidson')
insert into public.drop_off_points
  (campus_id, building_id, name, slug, instructions, accepts_sensitive, sort_order)
select c.id, b.id, v.name, v.slug, v.instructions, v.accepts_sensitive, v.sort_order
from c
cross join (values
  ('Alvarez Union desk', 'union-desk', 'alvarez-union',
   'Hand it to the Union front desk staff.', true, 10),
  ('Chambers', 'chambers', 'chambers',
   'Drop-off location in Chambers. Instructions to be confirmed.', false, 20),
  ('Wall Academic Center', 'wall', 'wall',
   'Drop-off location in Wall. Instructions to be confirmed.', false, 30)
) as v(name, slug, building_slug, instructions, accepts_sensitive, sort_order)
join public.buildings b on b.slug = v.building_slug and b.campus_id = c.id
on conflict (campus_id, slug) do update
  set name = excluded.name,
      building_id = excluded.building_id,
      instructions = excluded.instructions,
      accepts_sensitive = excluded.accepts_sensitive,
      sort_order = excluded.sort_order;
