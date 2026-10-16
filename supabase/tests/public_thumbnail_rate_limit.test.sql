create extension if not exists pgtap with schema extensions;

begin;

select plan(4);

select ok(
  (select relrowsecurity from pg_catalog.pg_class where oid='private.public_thumbnail_rate_limits'::regclass)
  and not has_table_privilege('anon','private.public_thumbnail_rate_limits','SELECT')
  and not has_table_privilege('authenticated','private.public_thumbnail_rate_limits','SELECT')
  and not has_table_privilege('service_role','private.public_thumbnail_rate_limits','SELECT'),
  'thumbnail rate-limit hashes are RLS protected with no direct table access'
);

select ok(
  has_function_privilege('service_role','public.check_public_thumbnail_rate_limit(text)','EXECUTE')
  and not has_function_privilege('anon','public.check_public_thumbnail_rate_limit(text)','EXECUTE')
  and not has_function_privilege('authenticated','public.check_public_thumbnail_rate_limit(text)','EXECUTE')
  and not exists (
    select 1
    from pg_catalog.pg_proc as proc
    cross join lateral pg_catalog.aclexplode(
      coalesce(proc.proacl,pg_catalog.acldefault('f',proc.proowner))
    ) as acl
    where proc.oid='public.check_public_thumbnail_rate_limit(text)'::regprocedure
      and acl.grantee=0
      and acl.privilege_type='EXECUTE'
  ),
  'thumbnail rate-limit RPC is callable only by the server role'
);

select is(
  (select allowed from public.check_public_thumbnail_rate_limit(repeat('a',64))),
  true,
  'first request for a valid keyed client hash is allowed'
);

do $test$
declare
  v_allowed boolean;
  v_retry integer;
  v_index integer;
begin
  for v_index in 1..179 loop
    select result.allowed into v_allowed
    from public.check_public_thumbnail_rate_limit(repeat('a',64)) as result;
  end loop;
  select result.allowed,result.retry_after_seconds into v_allowed,v_retry
  from public.check_public_thumbnail_rate_limit(repeat('a',64)) as result;
  if not v_allowed or v_retry <> 0 then
    raise exception 'request 180 should remain allowed';
  end if;
  select result.allowed,result.retry_after_seconds into v_allowed,v_retry
  from public.check_public_thumbnail_rate_limit(repeat('a',64)) as result;
  if v_allowed or v_retry < 1 then
    raise exception 'request 181 should be rate limited with a positive retry delay';
  end if;
end
$test$;

select ok(
  not (select allowed from public.check_public_thumbnail_rate_limit('not-a-hash')),
  'malformed client hashes fail closed'
);

select * from finish();
rollback;
