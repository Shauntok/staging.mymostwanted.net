-- Singapore is an independent browseable area; do not attach it to any Malaysian state.
insert into private.areas (area_name, area_type, is_active)
select 'Singapore', 'independent_admin_area', true
where not exists (
  select 1
  from private.areas
  where area_name = 'Singapore'
);
