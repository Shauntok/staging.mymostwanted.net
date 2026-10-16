create extension if not exists pgtap with schema extensions;

begin;

select plan(11);

select ok(
  not exists (
    select 1
    from pg_catalog.pg_class as relation
    join pg_catalog.pg_namespace as namespace on namespace.oid = relation.relnamespace
    where namespace.nspname in ('public', 'private')
      and relation.relkind in ('r', 'p')
      and not relation.relrowsecurity
  ),
  'every public and private application table has RLS enabled'
);

select ok(
  not exists (
    select 1
    from pg_catalog.pg_policies as policy
    where policy.schemaname in ('public', 'private')
      and 'public' = any(policy.roles)
  ),
  'application RLS policies never target the unrestricted PUBLIC role'
);

select ok(
  not exists (
    select 1
    from pg_catalog.pg_class as relation
    join pg_catalog.pg_namespace as namespace on namespace.oid = relation.relnamespace
    where namespace.nspname = 'private'
      and relation.relkind in ('r', 'p')
      and (
        pg_catalog.has_table_privilege('anon', relation.oid, 'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER')
        or pg_catalog.has_table_privilege('service_role', relation.oid, 'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER')
        or (
          relation.relname not in ('role_change_audit', 'home_tag_settings_audit')
          and pg_catalog.has_table_privilege('authenticated', relation.oid, 'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER')
        )
      )
  ),
  'private tables deny anon and service-role direct grants; authenticated exceptions are limited to RLS-protected Owner audit reads'
);

select ok(
  pg_catalog.has_table_privilege('authenticated', 'private.role_change_audit', 'SELECT')
  and pg_catalog.has_table_privilege('authenticated', 'private.home_tag_settings_audit', 'SELECT')
  and not pg_catalog.has_table_privilege('authenticated', 'private.role_change_audit', 'INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER')
  and not pg_catalog.has_table_privilege('authenticated', 'private.home_tag_settings_audit', 'INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER'),
  'the two private audit read exceptions grant SELECT only'
);

select ok(
  pg_catalog.has_table_privilege('anon', 'public.home_tag_settings', 'SELECT')
  and pg_catalog.has_table_privilege('anon', 'public.published_social_links', 'SELECT')
  and not exists (
    select 1
    from pg_catalog.pg_class as relation
    join pg_catalog.pg_namespace as namespace on namespace.oid = relation.relnamespace
    where namespace.nspname = 'public'
      and relation.relkind in ('r', 'p')
      and relation.relname not in ('home_tag_settings', 'published_social_links')
      and pg_catalog.has_table_privilege('anon', relation.oid, 'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER')
  ),
  'anon table reads are limited to the public homepage setting and published social-link projection'
);

select ok(
  pg_catalog.has_table_privilege('authenticated', 'public.home_tag_settings', 'SELECT')
  and pg_catalog.has_table_privilege('authenticated', 'public.published_social_links', 'SELECT')
  and not pg_catalog.has_table_privilege('authenticated', 'public.home_tag_settings', 'INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER')
  and not pg_catalog.has_table_privilege('authenticated', 'public.published_social_links', 'INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER')
  and not pg_catalog.has_table_privilege('authenticated', 'public.profiles', 'INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER')
  and pg_catalog.has_column_privilege('authenticated', 'public.profiles', 'display_name', 'UPDATE')
  and not exists (
    select 1
    from pg_catalog.pg_attribute as column_info
    where column_info.attrelid = 'public.profiles'::regclass
      and column_info.attnum > 0
      and not column_info.attisdropped
      and column_info.attname <> 'display_name'
      and pg_catalog.has_column_privilege('authenticated', column_info.attrelid, column_info.attnum, 'UPDATE')
  ),
  'authenticated public-table access is read-only except the self-scoped display-name column grant'
);

select ok(
  not exists (
    select 1
    from pg_catalog.pg_class as relation
    join pg_catalog.pg_namespace as namespace on namespace.oid = relation.relnamespace
    where namespace.nspname in ('public', 'private')
      and relation.relkind in ('r', 'p')
      and pg_catalog.has_table_privilege('service_role', relation.oid, 'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER')
  )
  and not exists (
    select 1
    from pg_catalog.pg_attribute as column_info
    join pg_catalog.pg_class as relation on relation.oid = column_info.attrelid
    join pg_catalog.pg_namespace as namespace on namespace.oid = relation.relnamespace
    where namespace.nspname in ('public', 'private')
      and column_info.attnum > 0
      and not column_info.attisdropped
      and pg_catalog.has_column_privilege('service_role', column_info.attrelid, column_info.attnum, 'SELECT,INSERT,UPDATE,REFERENCES')
  ),
  'service_role also uses narrowly scoped privileged RPCs rather than direct application-table grants'
);

select ok(
  not exists (
    select 1
    from pg_catalog.pg_class as relation
    join pg_catalog.pg_namespace as namespace on namespace.oid = relation.relnamespace
    where namespace.nspname in ('public', 'private')
      and relation.relkind in ('v', 'm')
      and (
        pg_catalog.has_table_privilege('anon', relation.oid, 'SELECT')
        or pg_catalog.has_table_privilege('authenticated', relation.oid, 'SELECT')
      )
      and (
        relation.relkind = 'm'
        or not coalesce(relation.reloptions, array[]::text[]) @> array['security_invoker=true']
      )
  ),
  'client-readable application views enforce invoker security; materialized views are never directly exposed'
);

select ok(
  not exists (
    select 1
    from pg_catalog.pg_proc as routine
    join pg_catalog.pg_namespace as namespace on namespace.oid = routine.pronamespace
    cross join lateral pg_catalog.aclexplode(
      coalesce(routine.proacl, pg_catalog.acldefault('f', routine.proowner))
    ) as privilege
    where namespace.nspname in ('public', 'private')
      and routine.prosecdef
      and privilege.grantee = 0
      and privilege.privilege_type = 'EXECUTE'
  ),
  'application SECURITY DEFINER functions do not grant EXECUTE to PUBLIC'
);

select ok(
  not exists (
    select 1
    from pg_catalog.pg_proc as routine
    join pg_catalog.pg_namespace as namespace on namespace.oid = routine.pronamespace
    where namespace.nspname in ('public', 'private')
      and routine.prosecdef
      and not coalesce(routine.proconfig, array[]::text[]) @> array['search_path=""']
  ),
  'application SECURITY DEFINER functions pin an empty search_path'
);

select ok(
  pg_catalog.has_function_privilege(
    'authenticated',
    'private.can_upload_evidence_object(text,jsonb)',
    'EXECUTE'
  )
  and not pg_catalog.has_function_privilege(
    'anon',
    'private.can_upload_evidence_object(text,jsonb)',
    'EXECUTE'
  )
  and not pg_catalog.has_function_privilege(
    'service_role',
    'private.can_upload_evidence_object(text,jsonb)',
    'EXECUTE'
  ),
  'evidence-upload policy helper is executable only by authenticated users'
);

select * from finish();
rollback;
