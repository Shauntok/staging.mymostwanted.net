-- Install the verified 159-feature geoBoundaries ADM2 catalogue and merge
-- Putrajaya's public region scope into Kuala Lumpur without rewriting source rows.

with canonical_regions(area_name, area_type) as (
  values
    ('Johor', 'state'), ('Kedah', 'state'), ('Kelantan', 'state'), ('Melaka', 'state'),
    ('Negeri Sembilan', 'state'), ('Pahang', 'state'), ('Penang', 'state'), ('Perak', 'state'),
    ('Perlis', 'state'), ('Sabah', 'state'), ('Sarawak', 'state'), ('Selangor', 'state'),
    ('Terengganu', 'state'), ('W.P. Kuala Lumpur', 'state'), ('W.P. Labuan', 'state'),
    ('Singapore', 'independent_admin_area')
)
insert into private.areas (area_name, area_type, is_active)
select regions.area_name, regions.area_type, true
from canonical_regions as regions
where not exists (
  select 1 from private.areas as existing
  where existing.parent_area_id is null
    and existing.area_name = regions.area_name
    and existing.area_type = regions.area_type
);

with canonical_regions(area_name, area_type) as (
  values
    ('Johor', 'state'), ('Kedah', 'state'), ('Kelantan', 'state'), ('Melaka', 'state'),
    ('Negeri Sembilan', 'state'), ('Pahang', 'state'), ('Penang', 'state'), ('Perak', 'state'),
    ('Perlis', 'state'), ('Sabah', 'state'), ('Sarawak', 'state'), ('Selangor', 'state'),
    ('Terengganu', 'state'), ('W.P. Kuala Lumpur', 'state'), ('W.P. Labuan', 'state'),
    ('Singapore', 'independent_admin_area')
)
update private.areas as existing
set is_active = true
from canonical_regions as regions
where existing.parent_area_id is null
  and existing.area_name = regions.area_name
  and existing.area_type = regions.area_type;

-- Hide the former top-level Putrajaya region while keeping its row and any
-- existing post references available for aggregation and internal traceability.
update private.areas
set is_active = false
where parent_area_id is null
  and area_name = 'W.P. Putrajaya'
  and area_type in ('state', 'independent_admin_area');

-- Existing published posts may retain the inactive Putrajaya area ID for audit
-- history. Keep their public projection synchronized when unrelated post fields
-- change; a new post cannot select this inactive area through the public flow.
create or replace function private.sync_public_post_projection(p_post_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $function$
begin
  perform post_row.id from private.posts as post_row where post_row.id = p_post_id for update;
  if not found then
    delete from public.published_previews as preview where preview.post_id = p_post_id;
    delete from public.reaction_counts as reaction_count where reaction_count.post_id = p_post_id;
    return;
  end if;

  if not exists (
    select 1
    from private.posts as post_row
    join private.areas as area on area.id = post_row.area_id
    where post_row.id = p_post_id
      and post_row.status = 'published'
      and (
        area.is_active
        or (area.area_name = 'W.P. Putrajaya' and exists (
          select 1 from public.published_previews as existing
          where existing.post_id = post_row.id and existing.public_area_id = area.id
        ))
      )
  ) then
    delete from public.published_previews as preview where preview.post_id = p_post_id;
    delete from public.reaction_counts as reaction_count where reaction_count.post_id = p_post_id;
    return;
  end if;

  insert into public.published_previews (
    post_id, approved_title, primary_name, public_excerpt, first_published_at, last_listed_at,
    public_tag_ids, public_tag_labels, public_area_id, public_area_name, thumbnail_available
  )
  select post_row.id, post_row.approved_title, post_row.primary_name, post_row.public_excerpt,
         post_row.published_at, post_row.last_published_at,
         array(
           select post_tag.tag_id from private.post_tags as post_tag
           join private.tags as tag_row on tag_row.id = post_tag.tag_id
           where post_tag.post_id = p_post_id and tag_row.is_active
           order by tag_row.display_name, tag_row.id
         ),
         array(
           select tag_row.display_name from private.post_tags as post_tag
           join private.tags as tag_row on tag_row.id = post_tag.tag_id
           where post_tag.post_id = p_post_id and tag_row.is_active
           order by tag_row.display_name, tag_row.id
         ),
         post_row.area_id, area.area_name,
         exists (
           select 1 from private.evidence_metadata as evidence
           where evidence.post_id = p_post_id
             and evidence.scan_state = 'clean'
             and evidence.visibility = 'public_thumbnail'
         )
  from private.posts as post_row
  join private.areas as area on area.id = post_row.area_id
  where post_row.id = p_post_id
    and post_row.status = 'published'
    and (
      area.is_active
      or (area.area_name = 'W.P. Putrajaya' and exists (
        select 1 from public.published_previews as existing
        where existing.post_id = post_row.id and existing.public_area_id = area.id
      ))
    )
  on conflict (post_id) do update set
    approved_title = excluded.approved_title,
    primary_name = excluded.primary_name,
    public_excerpt = excluded.public_excerpt,
    first_published_at = excluded.first_published_at,
    last_listed_at = excluded.last_listed_at,
    public_tag_ids = excluded.public_tag_ids,
    public_tag_labels = excluded.public_tag_labels,
    public_area_id = excluded.public_area_id,
    public_area_name = excluded.public_area_name,
    thumbnail_available = excluded.thumbnail_available;

  insert into public.reaction_counts (post_id, reaction_count)
  select reaction.post_id, pg_catalog.count(*)
  from private.reactions as reaction
  where reaction.post_id = p_post_id
    and exists (select 1 from public.published_previews as preview where preview.post_id = p_post_id)
  group by reaction.post_id
  having pg_catalog.count(*) > 0
  on conflict (post_id) do update set reaction_count = excluded.reaction_count;

  delete from public.reaction_counts as reaction_count
  where reaction_count.post_id = p_post_id
    and (
      not exists (select 1 from public.published_previews as preview where preview.post_id = p_post_id)
      or not exists (select 1 from private.reactions as reaction where reaction.post_id = p_post_id)
    );
end;
$function$;
revoke all on function private.sync_public_post_projection(uuid) from public, anon, authenticated, service_role;

-- The official source hierarchy assigns parent states; the fixed ADM2 geometry
-- supplies 159 of the 160 source entries. Putrajaya has no feature. Ledang's
-- geometry is catalogued under its current source-page name, Tangkak.
with district_catalog(parent_area_name, area_name) as (
  values
    ('Johor', 'Segamat'),
    ('Johor', 'Tangkak'),
    ('Johor', 'Muar'),
    ('Johor', 'Batu Pahat'),
    ('Johor', 'Kluang'),
    ('Johor', 'Kulaijaya'),
    ('Johor', 'Pontian'),
    ('Johor', 'Johor Bahru'),
    ('Johor', 'Kota Tinggi'),
    ('Johor', 'Mersing'),
    ('Kedah', 'Bandar Baharu'),
    ('Kedah', 'Kulim'),
    ('Kedah', 'Baling'),
    ('Kedah', 'Kuala Muda'),
    ('Kedah', 'Yan'),
    ('Kedah', 'Pendang'),
    ('Kedah', 'Sik'),
    ('Kedah', 'Kota Setar'),
    ('Kedah', 'Pokok Sena'),
    ('Kedah', 'Padang Terap'),
    ('Kedah', 'Kubang Pasu'),
    ('Kedah', 'Langkawi'),
    ('Kelantan', 'Tumpat'),
    ('Kelantan', 'Kota Bharu'),
    ('Kelantan', 'Pasir Puteh'),
    ('Kelantan', 'Pasir Mas'),
    ('Kelantan', 'Machang'),
    ('Kelantan', 'Tanah Merah'),
    ('Kelantan', 'Jeli'),
    ('Kelantan', 'Kuala Krai'),
    ('Kelantan', 'Kecil Lojing'),
    ('Kelantan', 'Gua Musang'),
    ('Kelantan', 'Bachok'),
    ('Melaka', 'Alor Gajah'),
    ('Melaka', 'Melaka Tengah'),
    ('Melaka', 'Jasin'),
    ('Negeri Sembilan', 'Jelebu'),
    ('Negeri Sembilan', 'Jempol'),
    ('Negeri Sembilan', 'Kuala Pilah'),
    ('Negeri Sembilan', 'Rembau'),
    ('Negeri Sembilan', 'Tampin'),
    ('Negeri Sembilan', 'Seremban'),
    ('Negeri Sembilan', 'Port Dickson'),
    ('Pahang', 'Cameron Highlands'),
    ('Pahang', 'Lipis'),
    ('Pahang', 'Jerantut'),
    ('Pahang', 'Raub'),
    ('Pahang', 'Kuantan'),
    ('Pahang', 'Temerloh'),
    ('Pahang', 'Maran'),
    ('Pahang', 'Pekan'),
    ('Pahang', 'Bentong'),
    ('Pahang', 'Bera'),
    ('Pahang', 'Rompin'),
    ('Penang', 'Seberang Perai Selatan'),
    ('Penang', 'Seberang Perai Tengah'),
    ('Penang', 'Seberang Perai Utara'),
    ('Penang', 'Barat Daya'),
    ('Penang', 'Timur Laut'),
    ('Perak', 'Hulu Perak'),
    ('Perak', 'Selama'),
    ('Perak', 'Kerian'),
    ('Perak', 'Larut dan Matang'),
    ('Perak', 'Kuala Kangsar'),
    ('Perak', 'Kampar'),
    ('Perak', 'Kinta'),
    ('Perak', 'Perak Tengah'),
    ('Perak', 'Hilir Perak'),
    ('Perak', 'Muallim'),
    ('Perak', 'Batang Padang'),
    ('Perak', 'Bagan Datuk'),
    ('Perak', 'Manjung'),
    ('Perlis', 'Perlis'),
    ('Sabah', 'Sipitang'),
    ('Sabah', 'Tenom'),
    ('Sabah', 'Beaufort'),
    ('Sabah', 'Kuala Penyu'),
    ('Sabah', 'Nabawan / Persiangan'),
    ('Sabah', 'Keningau'),
    ('Sabah', 'Papar'),
    ('Sabah', 'Putatan'),
    ('Sabah', 'Tambunan'),
    ('Sabah', 'Penampang'),
    ('Sabah', 'Kota Kinabalu'),
    ('Sabah', 'Tuaran'),
    ('Sabah', 'Kota Belud'),
    ('Sabah', 'Ranau'),
    ('Sabah', 'Kota Marudu'),
    ('Sabah', 'Kudat'),
    ('Sabah', 'Kalabakan'),
    ('Sabah', 'Tawau'),
    ('Sabah', 'Kunak'),
    ('Sabah', 'Semporna'),
    ('Sabah', 'Lahad Datu'),
    ('Sabah', 'Tongod'),
    ('Sabah', 'Kinabatangan'),
    ('Sabah', 'Sandakan'),
    ('Sabah', 'Telupid'),
    ('Sabah', 'Beluran'),
    ('Sabah', 'Pitas'),
    ('Sarawak', 'Lundu'),
    ('Sarawak', 'Bau'),
    ('Sarawak', 'Kuching'),
    ('Sarawak', 'Samarahan'),
    ('Sarawak', 'Asajaya'),
    ('Sarawak', 'Tebedu'),
    ('Sarawak', 'Serian'),
    ('Sarawak', 'Simunjan'),
    ('Sarawak', 'Sri Aman'),
    ('Sarawak', 'Betong'),
    ('Sarawak', 'Pusa'),
    ('Sarawak', 'Saratok'),
    ('Sarawak', 'Kabong'),
    ('Sarawak', 'Sarikei'),
    ('Sarawak', 'Pakan'),
    ('Sarawak', 'Lubok Antu'),
    ('Sarawak', 'Julau'),
    ('Sarawak', 'Maradong'),
    ('Sarawak', 'Kanowit'),
    ('Sarawak', 'Sibu'),
    ('Sarawak', 'Song'),
    ('Sarawak', 'Selangau'),
    ('Sarawak', 'Dalat'),
    ('Sarawak', 'Kapit'),
    ('Sarawak', 'Tatau'),
    ('Sarawak', 'Mukah'),
    ('Sarawak', 'Matu'),
    ('Sarawak', 'Daro'),
    ('Sarawak', 'Bintulu'),
    ('Sarawak', 'Sebauh'),
    ('Sarawak', 'Bukit Mabong'),
    ('Sarawak', 'Belaga'),
    ('Sarawak', 'Beluru'),
    ('Sarawak', 'Subis'),
    ('Sarawak', 'Miri'),
    ('Sarawak', 'Telang Usan'),
    ('Sarawak', 'Marudi'),
    ('Sarawak', 'Lawas'),
    ('Sarawak', 'Limbang'),
    ('Sarawak', 'Tanjung Manis'),
    ('Selangor', 'Sabak Bernam'),
    ('Selangor', 'Kuala Selangor'),
    ('Selangor', 'Ulu Selangor'),
    ('Selangor', 'Sepang'),
    ('Selangor', 'Klang'),
    ('Selangor', 'Kuala Langat'),
    ('Selangor', 'Petaling'),
    ('Selangor', 'Gombak'),
    ('Selangor', 'Ulu Langat'),
    ('Terengganu', 'Hulu Terengganu'),
    ('Terengganu', 'Setiu'),
    ('Terengganu', 'Kuala Terengganu'),
    ('Terengganu', 'Dungun'),
    ('Terengganu', 'Kemaman'),
    ('Terengganu', 'Besut'),
    ('Terengganu', 'Kuala Nerus'),
    ('Terengganu', 'Marang'),
    ('W.P. Kuala Lumpur', 'Kuala Lumpur'),
    ('W.P. Labuan', 'Labuan')
)
update private.areas as child
set area_type = 'district', is_active = true
from district_catalog as catalog
cross join lateral (
  select parent.id
  from private.areas as parent
  where parent.parent_area_id is null
    and parent.area_name = catalog.parent_area_name
    and parent.is_active
  order by parent.created_at, parent.id
  limit 1
) as parent
where child.parent_area_id = parent.id
  and child.area_name = catalog.area_name
  and child.area_type = 'city';

with district_catalog(parent_area_name, area_name) as (
  values
    ('Johor', 'Segamat'),
    ('Johor', 'Tangkak'),
    ('Johor', 'Muar'),
    ('Johor', 'Batu Pahat'),
    ('Johor', 'Kluang'),
    ('Johor', 'Kulaijaya'),
    ('Johor', 'Pontian'),
    ('Johor', 'Johor Bahru'),
    ('Johor', 'Kota Tinggi'),
    ('Johor', 'Mersing'),
    ('Kedah', 'Bandar Baharu'),
    ('Kedah', 'Kulim'),
    ('Kedah', 'Baling'),
    ('Kedah', 'Kuala Muda'),
    ('Kedah', 'Yan'),
    ('Kedah', 'Pendang'),
    ('Kedah', 'Sik'),
    ('Kedah', 'Kota Setar'),
    ('Kedah', 'Pokok Sena'),
    ('Kedah', 'Padang Terap'),
    ('Kedah', 'Kubang Pasu'),
    ('Kedah', 'Langkawi'),
    ('Kelantan', 'Tumpat'),
    ('Kelantan', 'Kota Bharu'),
    ('Kelantan', 'Pasir Puteh'),
    ('Kelantan', 'Pasir Mas'),
    ('Kelantan', 'Machang'),
    ('Kelantan', 'Tanah Merah'),
    ('Kelantan', 'Jeli'),
    ('Kelantan', 'Kuala Krai'),
    ('Kelantan', 'Kecil Lojing'),
    ('Kelantan', 'Gua Musang'),
    ('Kelantan', 'Bachok'),
    ('Melaka', 'Alor Gajah'),
    ('Melaka', 'Melaka Tengah'),
    ('Melaka', 'Jasin'),
    ('Negeri Sembilan', 'Jelebu'),
    ('Negeri Sembilan', 'Jempol'),
    ('Negeri Sembilan', 'Kuala Pilah'),
    ('Negeri Sembilan', 'Rembau'),
    ('Negeri Sembilan', 'Tampin'),
    ('Negeri Sembilan', 'Seremban'),
    ('Negeri Sembilan', 'Port Dickson'),
    ('Pahang', 'Cameron Highlands'),
    ('Pahang', 'Lipis'),
    ('Pahang', 'Jerantut'),
    ('Pahang', 'Raub'),
    ('Pahang', 'Kuantan'),
    ('Pahang', 'Temerloh'),
    ('Pahang', 'Maran'),
    ('Pahang', 'Pekan'),
    ('Pahang', 'Bentong'),
    ('Pahang', 'Bera'),
    ('Pahang', 'Rompin'),
    ('Penang', 'Seberang Perai Selatan'),
    ('Penang', 'Seberang Perai Tengah'),
    ('Penang', 'Seberang Perai Utara'),
    ('Penang', 'Barat Daya'),
    ('Penang', 'Timur Laut'),
    ('Perak', 'Hulu Perak'),
    ('Perak', 'Selama'),
    ('Perak', 'Kerian'),
    ('Perak', 'Larut dan Matang'),
    ('Perak', 'Kuala Kangsar'),
    ('Perak', 'Kampar'),
    ('Perak', 'Kinta'),
    ('Perak', 'Perak Tengah'),
    ('Perak', 'Hilir Perak'),
    ('Perak', 'Muallim'),
    ('Perak', 'Batang Padang'),
    ('Perak', 'Bagan Datuk'),
    ('Perak', 'Manjung'),
    ('Perlis', 'Perlis'),
    ('Sabah', 'Sipitang'),
    ('Sabah', 'Tenom'),
    ('Sabah', 'Beaufort'),
    ('Sabah', 'Kuala Penyu'),
    ('Sabah', 'Nabawan / Persiangan'),
    ('Sabah', 'Keningau'),
    ('Sabah', 'Papar'),
    ('Sabah', 'Putatan'),
    ('Sabah', 'Tambunan'),
    ('Sabah', 'Penampang'),
    ('Sabah', 'Kota Kinabalu'),
    ('Sabah', 'Tuaran'),
    ('Sabah', 'Kota Belud'),
    ('Sabah', 'Ranau'),
    ('Sabah', 'Kota Marudu'),
    ('Sabah', 'Kudat'),
    ('Sabah', 'Kalabakan'),
    ('Sabah', 'Tawau'),
    ('Sabah', 'Kunak'),
    ('Sabah', 'Semporna'),
    ('Sabah', 'Lahad Datu'),
    ('Sabah', 'Tongod'),
    ('Sabah', 'Kinabatangan'),
    ('Sabah', 'Sandakan'),
    ('Sabah', 'Telupid'),
    ('Sabah', 'Beluran'),
    ('Sabah', 'Pitas'),
    ('Sarawak', 'Lundu'),
    ('Sarawak', 'Bau'),
    ('Sarawak', 'Kuching'),
    ('Sarawak', 'Samarahan'),
    ('Sarawak', 'Asajaya'),
    ('Sarawak', 'Tebedu'),
    ('Sarawak', 'Serian'),
    ('Sarawak', 'Simunjan'),
    ('Sarawak', 'Sri Aman'),
    ('Sarawak', 'Betong'),
    ('Sarawak', 'Pusa'),
    ('Sarawak', 'Saratok'),
    ('Sarawak', 'Kabong'),
    ('Sarawak', 'Sarikei'),
    ('Sarawak', 'Pakan'),
    ('Sarawak', 'Lubok Antu'),
    ('Sarawak', 'Julau'),
    ('Sarawak', 'Maradong'),
    ('Sarawak', 'Kanowit'),
    ('Sarawak', 'Sibu'),
    ('Sarawak', 'Song'),
    ('Sarawak', 'Selangau'),
    ('Sarawak', 'Dalat'),
    ('Sarawak', 'Kapit'),
    ('Sarawak', 'Tatau'),
    ('Sarawak', 'Mukah'),
    ('Sarawak', 'Matu'),
    ('Sarawak', 'Daro'),
    ('Sarawak', 'Bintulu'),
    ('Sarawak', 'Sebauh'),
    ('Sarawak', 'Bukit Mabong'),
    ('Sarawak', 'Belaga'),
    ('Sarawak', 'Beluru'),
    ('Sarawak', 'Subis'),
    ('Sarawak', 'Miri'),
    ('Sarawak', 'Telang Usan'),
    ('Sarawak', 'Marudi'),
    ('Sarawak', 'Lawas'),
    ('Sarawak', 'Limbang'),
    ('Sarawak', 'Tanjung Manis'),
    ('Selangor', 'Sabak Bernam'),
    ('Selangor', 'Kuala Selangor'),
    ('Selangor', 'Ulu Selangor'),
    ('Selangor', 'Sepang'),
    ('Selangor', 'Klang'),
    ('Selangor', 'Kuala Langat'),
    ('Selangor', 'Petaling'),
    ('Selangor', 'Gombak'),
    ('Selangor', 'Ulu Langat'),
    ('Terengganu', 'Hulu Terengganu'),
    ('Terengganu', 'Setiu'),
    ('Terengganu', 'Kuala Terengganu'),
    ('Terengganu', 'Dungun'),
    ('Terengganu', 'Kemaman'),
    ('Terengganu', 'Besut'),
    ('Terengganu', 'Kuala Nerus'),
    ('Terengganu', 'Marang'),
    ('W.P. Kuala Lumpur', 'Kuala Lumpur'),
    ('W.P. Labuan', 'Labuan')
)
insert into private.areas (parent_area_id, area_name, area_type, is_active)
select parent.id, catalog.area_name, 'district', true
from district_catalog as catalog
cross join lateral (
  select area.id
  from private.areas as area
  where area.parent_area_id is null
    and area.area_name = catalog.parent_area_name
    and area.is_active
  order by area.created_at, area.id
  limit 1
) as parent
where not exists (
  select 1 from private.areas as existing
  where existing.parent_area_id = parent.id
    and existing.area_name = catalog.area_name
    and existing.area_type = 'district'
    and existing.is_active
);

create or replace function private.canonicalize_merged_putrajaya_preview_area()
returns trigger
language plpgsql
security definer
set search_path = ''
as $function$
begin
  if exists (
    select 1 from private.areas as area
    where area.id = new.public_area_id
      and area.area_name = 'W.P. Putrajaya'
  ) then
    new.public_area_name := 'W.P. Kuala Lumpur';
  end if;
  return new;
end;
$function$;
revoke all on function private.canonicalize_merged_putrajaya_preview_area() from public, anon, authenticated, service_role;

create trigger canonicalize_merged_putrajaya_preview_area
before insert or update of public_area_id, public_area_name on public.published_previews
for each row execute function private.canonicalize_merged_putrajaya_preview_area();

update public.published_previews as preview
set public_area_name = 'W.P. Kuala Lumpur'
from private.areas as area
where area.id = preview.public_area_id
  and area.area_name = 'W.P. Putrajaya'
  and preview.public_area_name is distinct from 'W.P. Kuala Lumpur';

create or replace function public.public_region_post_counts()
returns table (area_name text, public_post_count bigint)
language sql
stable
security definer
set search_path = ''
as $function$
  with recursive regions as (
    select area.id, area.area_name
    from private.areas as area
    where area.is_active
      and area.parent_area_id is null
      and area.area_type in ('state', 'independent_admin_area')
  ), area_scope(region_id, area_id, depth, include_inactive) as (
    select region.id, region.id, 0, false from regions as region
    union all
    select region.id, alias.id, 0, true
    from regions as region
    join private.areas as alias
      on alias.parent_area_id is null
     and alias.area_name = 'W.P. Putrajaya'
     and alias.area_type in ('state', 'independent_admin_area')
    where region.area_name = 'W.P. Kuala Lumpur'
    union all
    select scope.region_id, child.id, scope.depth + 1, scope.include_inactive
    from area_scope as scope
    join private.areas as child on child.parent_area_id = scope.area_id
    where (scope.include_inactive or child.is_active) and scope.depth < 4
  )
  select region.area_name, count(distinct preview.post_id)::bigint
  from regions as region
  join area_scope as scope on scope.region_id = region.id
  left join public.published_previews as preview on preview.public_area_id = scope.area_id
  group by region.id, region.area_name
  order by region.area_name
$function$;
revoke all on function public.public_region_post_counts() from public, anon, authenticated, service_role;
grant execute on function public.public_region_post_counts() to anon, authenticated;

create or replace function public.public_posts_for_area(p_area_name text, p_limit integer default 13, p_offset integer default 0)
returns table (
  post_id uuid, approved_title text, primary_name text, public_excerpt text,
  last_listed_at timestamptz, public_tag_labels text[], public_area_name text
)
language sql
stable
security definer
set search_path = ''
as $function$
  with recursive requested_area as (
    select area.id, area.area_name
    from private.areas as area
    where area.is_active
      and area.parent_area_id is null
      and area.area_name = pg_catalog.left(pg_catalog.btrim(coalesce(p_area_name, '')), 80)
      and area.area_type in ('state', 'independent_admin_area')
  ), area_scope(area_id, depth, include_inactive) as (
    select requested.id, 0, false from requested_area as requested
    union all
    select alias.id, 0, true
    from requested_area as requested
    join private.areas as alias
      on alias.parent_area_id is null
     and alias.area_name = 'W.P. Putrajaya'
     and alias.area_type in ('state', 'independent_admin_area')
    where requested.area_name = 'W.P. Kuala Lumpur'
    union all
    select child.id, scope.depth + 1, scope.include_inactive
    from private.areas as child
    join area_scope as scope on scope.area_id = child.parent_area_id
    where (scope.include_inactive or child.is_active) and scope.depth < 4
  ), parameters as (
    select least(greatest(coalesce(p_limit, 13), 1), 24) as result_limit,
           least(greatest(coalesce(p_offset, 0), 0), 1000000) as result_offset
  )
  select preview.post_id, preview.approved_title, preview.primary_name,
         preview.public_excerpt, preview.last_listed_at,
         preview.public_tag_labels, preview.public_area_name
  from public.published_previews as preview
  cross join parameters
  where preview.content_type = 'story'
    and preview.public_area_id in (select scope.area_id from area_scope as scope)
  order by preview.last_listed_at desc, preview.post_id
  limit (select parameters.result_limit from parameters)
  offset (select parameters.result_offset from parameters)
$function$;
revoke all on function public.public_posts_for_area(text, integer, integer) from public, anon, authenticated, service_role;
grant execute on function public.public_posts_for_area(text, integer, integer) to anon, authenticated;

-- Rollback: restore the prior area list and public functions, then drop the
-- Putrajaya preview trigger/function. Do not delete District rows or source-area
-- references while published posts may depend on them.
