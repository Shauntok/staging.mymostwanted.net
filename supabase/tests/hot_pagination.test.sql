create extension if not exists pgtap with schema extensions;

begin;

select plan(14);

insert into private.areas(id, area_name, area_type)
values ('88000000-0000-4000-8000-000000000001', 'Hot Pagination Fixture', 'state');

insert into private.posts(
  id, area_id, approved_title, primary_name, public_excerpt, full_body,
  risk_level, status
)
values
  ('89000000-0000-4000-8000-000000000001', '88000000-0000-4000-8000-000000000001', 'Hot Fixture One', 'Fixture One', 'Public fixture excerpt.', 'Private fixture body.', 'ordinary', 'approved'),
  ('89000000-0000-4000-8000-000000000002', '88000000-0000-4000-8000-000000000001', 'Hot Fixture Two', 'Fixture Two', 'Public fixture excerpt.', 'Private fixture body.', 'ordinary', 'approved'),
  ('89000000-0000-4000-8000-000000000003', '88000000-0000-4000-8000-000000000001', 'Hot Fixture Three', 'Fixture Three', 'Public fixture excerpt.', 'Private fixture body.', 'ordinary', 'approved'),
  ('89000000-0000-4000-8000-000000000004', '88000000-0000-4000-8000-000000000001', 'Hot Fixture Four', 'Fixture Four', 'Public fixture excerpt.', 'Private fixture body.', 'ordinary', 'approved');

update private.posts
set status = 'published',
    published_at = pg_catalog.statement_timestamp(),
    last_published_at = pg_catalog.statement_timestamp()
where id in (
  '89000000-0000-4000-8000-000000000001',
  '89000000-0000-4000-8000-000000000002',
  '89000000-0000-4000-8000-000000000003',
  '89000000-0000-4000-8000-000000000004'
);

-- Enable the gates only within this test transaction. The final rollback keeps
-- both the settings and all synthetic posts/reads out of the local database.
update private.analytics_valid_read_settings
set collection_enabled = true, hot_enabled = true, minimum_reads_24h = 1
where singleton;

insert into private.analytics_valid_read_hourly(post_id, read_hour, valid_reads)
values
  ('89000000-0000-4000-8000-000000000001', pg_catalog.date_trunc('hour', pg_catalog.clock_timestamp()), 10),
  ('89000000-0000-4000-8000-000000000001', pg_catalog.date_trunc('hour', pg_catalog.clock_timestamp()) - interval '2 hours', 5),
  ('89000000-0000-4000-8000-000000000001', pg_catalog.date_trunc('hour', pg_catalog.clock_timestamp()) - interval '12 hours', 2),
  ('89000000-0000-4000-8000-000000000002', pg_catalog.date_trunc('hour', pg_catalog.clock_timestamp()), 5),
  ('89000000-0000-4000-8000-000000000003', pg_catalog.date_trunc('hour', pg_catalog.clock_timestamp()) - interval '12 hours', 10),
  ('89000000-0000-4000-8000-000000000004', pg_catalog.date_trunc('hour', pg_catalog.clock_timestamp()) - interval '12 hours', 10);

select is(
  (select pg_catalog.count(*)::integer from public.public_hot_ranked_posts(2, 0)),
  2,
  'the first Hot page returns its requested slice'
);
select is(
  (select pg_catalog.array_agg(post_id order by post_id)
   from public.public_hot_ranked_posts(2, 0)),
  array['89000000-0000-4000-8000-000000000001'::uuid, '89000000-0000-4000-8000-000000000002'::uuid],
  'the first page contains the two highest-ranked published stories'
);
select is(
  (select pg_catalog.array_agg(hot_score order by hot_score desc)
   from public.public_hot_ranked_posts(2, 0)),
  array[77::numeric, 30::numeric],
  'Hot score applies 3x one-hour, 2x six-hour, and 1x 24-hour reads'
);
select is(
  (select pg_catalog.array_agg(valid_reads_24h order by hot_score desc)
   from public.public_hot_ranked_posts(2, 0)),
  array[17::bigint, 5::bigint],
  'the returned 24-hour count includes all score windows exactly once'
);
select is(
  (select pg_catalog.array_agg(post_id order by row_position)
   from public.public_hot_ranked_posts(2, 2) with ordinality as ranked(post_id, valid_reads_24h, hot_score, row_position)),
  array['89000000-0000-4000-8000-000000000003'::uuid, '89000000-0000-4000-8000-000000000004'::uuid],
  'equal scores use deterministic publication-time and post-ID tie breaks'
);
select is(
  (select pg_catalog.array_agg(hot_score order by hot_score desc)
   from public.public_hot_ranked_posts(2, 2)),
  array[10::numeric, 10::numeric],
  'the older fixture reads contribute to the 24-hour window only'
);
select is(
  (select pg_catalog.count(*)::integer from public.public_hot_ranked_posts(2, 4)),
  0,
  'a page beyond the final ranked result is empty'
);
select is(
  (select pg_catalog.count(*)::integer from public.public_hot_ranked_posts(13, 0)),
  4,
  'the public RPC accepts the bounded 13-row page including its sentinel slot'
);
select throws_ok(
  $$select * from public.public_hot_ranked_posts(14, 0)$$,
  'P0001', null,
  'the public RPC rejects a limit above the bounded sentinel maximum'
);
select throws_ok(
  $$select * from public.public_hot_ranked_posts(2, -1)$$,
  'P0001', null,
  'the public RPC rejects a negative page offset'
);
select throws_ok(
  $$select * from public.public_hot_ranked_posts(2, 999997)$$,
  'P0001', null,
  'the public RPC rejects offsets beyond its supported bound'
);
select ok(
  (select pg_catalog.count(*) = 4
   from public.public_hot_ranked_posts(2, 0) first_page
   full join public.public_hot_ranked_posts(2, 2) next_page using (post_id)),
  'adjacent pages cover every fixture once without overlap'
);
update private.analytics_valid_read_settings set minimum_reads_24h = 100 where singleton;
select is(
  (select pg_catalog.count(*)::integer from public.public_hot_ranked_posts(13, 0)),
  0,
  'the default 100-read threshold excludes fixtures below its 24-hour minimum'
);
update private.analytics_valid_read_settings set minimum_reads_24h = 1 where singleton;
select is(
  (select pg_catalog.count(*)::integer from private.analytics_valid_read_settings
   where singleton and collection_enabled and hot_enabled),
  1,
  'the ranking path can be exercised under temporary transaction-local test settings'
);

select * from finish();
rollback;
