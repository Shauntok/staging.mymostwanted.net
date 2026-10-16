create extension if not exists pgtap with schema extensions;

begin;

select plan(14);

select ok(
  (select relrowsecurity from pg_catalog.pg_class where oid = 'private.areas'::regclass)
  and not has_table_privilege('anon', 'private.areas', 'SELECT')
  and not has_table_privilege('authenticated', 'private.areas', 'SELECT'),
  'region and District catalogue rows are not directly exposed to clients'
);
select is(
  (select pg_catalog.count(*)::integer from private.areas as district
   where district.area_type = 'district' and district.is_active),
  159,
  'local migration installs exactly the 159 available District boundaries'
);
select is(
  (select pg_catalog.count(*)::integer from private.areas as district
   join private.areas as parent on parent.id = district.parent_area_id
   where district.area_type = 'district' and district.is_active
     and parent.area_type in ('state','independent_admin_area') and parent.is_active),
  159,
  'every active District has an active canonical state parent'
);
select is(
  (select pg_catalog.count(*)::integer from public.public_region_post_counts()),
  16,
  'public region summary exposes canonical regions including Singapore'
);
select ok(
  exists (select 1 from public.public_region_post_counts() where area_name = 'Singapore')
  and exists (select 1 from public.public_region_post_counts() where area_name = 'W.P. Kuala Lumpur')
  and not exists (select 1 from public.public_region_post_counts() where area_name = 'W.P. Putrajaya'),
  'public region list merges Putrajaya into Kuala Lumpur and omits it as a separate region'
);
select set_config('mmwr.test.segamat_id', (
  select child.id::text
  from private.areas as child
  join private.areas as parent on parent.id = child.parent_area_id
  where child.area_name = 'Segamat' and parent.area_name = 'Johor'
  limit 1
), true);
select is(
  (select pg_catalog.count(*)::integer from private.areas as putrajaya
   where putrajaya.area_name = 'W.P. Putrajaya' and putrajaya.parent_area_id is null and putrajaya.is_active),
  0,
  'the historical Putrajaya region is retained but inactive'
);

set local role anon;
select is((select pg_catalog.count(*)::integer from public.public_child_area_post_counts('Johor')), 10, 'anonymous users can read the 10 public Johor District names and counts');
select is((select pg_catalog.count(*)::integer from public.public_child_area_post_counts('Kelantan')), 11, 'anonymous users can read the 11 public Kelantan District names and counts');
select is((select pg_catalog.count(*)::integer from public.public_child_area_post_counts('Singapore')), 0, 'independent region has no fabricated child District catalogue');
select is((select pg_catalog.count(*)::integer from public.public_child_area_post_counts('W.P. Putrajaya')), 0, 'public District lookup rejects inactive Putrajaya parent');
select is(
  (select pg_catalog.count(*)::integer from public.public_child_area_post_counts('Johor') where public_post_count <> 0),
  0,
  'empty local database reports zero public posts without invented totals'
);
select is(
  (select pg_catalog.count(*)::integer from public.public_posts_for_city(
    pg_catalog.current_setting('mmwr.test.segamat_id')::uuid,
    'Kelantan', 24, 0
  )),
  0,
  'District post listing verifies the selected parent and does not cross region boundaries'
);
reset role;

select is(
  (select pg_catalog.count(*)::integer from private.areas as child
   join private.areas as parent on parent.id = child.parent_area_id
   where child.area_type = 'district' and parent.area_name = 'W.P. Kuala Lumpur'),
  1,
  'the Kuala Lumpur District is catalogued without fabricating Putrajaya as a second District'
);
select is(
  (select pg_catalog.count(*)::integer from private.areas as child
   join private.areas as parent on parent.id = child.parent_area_id
   where child.area_type = 'district' and parent.area_name = 'W.P. Putrajaya'),
  0,
  'the missing 160th source entry is not fabricated as a District row'
);

select * from finish();
rollback;
