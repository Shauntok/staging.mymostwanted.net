create extension if not exists pgtap with schema extensions;

begin;

select plan(21);

insert into auth.users (
  id, aud, role, email, encrypted_password,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at
) values (
  '80000000-0000-4000-8000-000000000001', 'authenticated', 'authenticated',
  'verification@example.invalid', '', '{}'::jsonb, '{"username":"forged"}'::jsonb,
  pg_catalog.now(), pg_catalog.now()
);

select set_config('request.jwt.claim.sub', '80000000-0000-4000-8000-000000000001', true);
select set_config('request.jwt.claims', '{"sub":"80000000-0000-4000-8000-000000000001","role":"authenticated","aal":"aal1"}', true);
set local role authenticated;

select is(public.initialize_my_profile('Safe_User'), true, 'signed-in user can create a profile without trusting Auth user metadata');
select is((select profile.username from public.profiles as profile where profile.id = auth.uid()), 'Safe_User', 'trusted initializer stores the submitted username');
select is((select profile.submission_email_verified_at from public.profiles as profile where profile.id = auth.uid()), null::timestamptz, 'new profile starts unverified for submissions');
select is(public.initialize_my_profile('Different_Name'), true, 'profile initialization safely retries without replacing an existing username');
select is((select profile.username from public.profiles as profile where profile.id = auth.uid()), 'Safe_User', 'retry cannot change the existing username');
select is(public.initialize_my_profile('x'), false, 'initializer rejects usernames outside the format contract');
select ok(
  has_column_privilege('authenticated', 'public.profiles', 'submission_email_verified_at', 'SELECT')
  and not has_column_privilege('authenticated', 'public.profiles', 'submission_email_verified_at', 'UPDATE'),
  'member may read but cannot directly alter own submission email verification state'
);
select ok(
  not has_table_privilege('authenticated', 'private.email_verification_tokens', 'SELECT')
  and not has_table_privilege('authenticated', 'private.email_verification_tokens', 'INSERT')
  and not has_table_privilege('authenticated', 'private.email_verification_tokens', 'UPDATE')
  and not has_table_privilege('authenticated', 'private.email_verification_tokens', 'DELETE')
  and not has_table_privilege('anon', 'private.email_verification_rate_limits', 'SELECT'),
  'email token hashes and rate limits have no direct API table access'
);
select ok(
  not has_function_privilege('anon', 'public.initialize_my_profile(text)', 'EXECUTE')
  and has_function_privilege('authenticated', 'public.initialize_my_profile(text)', 'EXECUTE')
  and not has_function_privilege('anon', 'private.initialize_my_profile(text)', 'EXECUTE'),
  'profile initialization is available only through the authenticated boundary'
);

select is(public.create_my_email_verification(decode(repeat('11', 32), 'hex')), true, 'first token hash can be registered');
select is(public.create_my_email_verification(decode(repeat('22', 32), 'hex')), true, 'second token request is permitted in the hourly window');
select is(public.create_my_email_verification(decode(repeat('33', 32), 'hex')), true, 'third token request is permitted in the hourly window');
select is(public.create_my_email_verification(decode(repeat('44', 32), 'hex')), false, 'fourth token request is rate limited');
select is((select pg_catalog.count(*)::integer from private.email_verification_tokens where user_id = auth.uid() and consumed_at is null), 1, 'each resend invalidates prior unused tokens');
select is(public.verify_submission_email(decode(repeat('ff', 32), 'hex')), false, 'unknown token hash cannot verify an account');
select is(public.verify_submission_email(decode(repeat('33', 32), 'hex')), true, 'valid token hash marks the profile verified');
select is(public.verify_submission_email(decode(repeat('33', 32), 'hex')), false, 'email verification token can only be consumed once');
select throws_ok(
  $$update public.profiles set submission_email_verified_at = pg_catalog.now() where id = auth.uid()$$,
  '42501', null, 'member cannot set verification state directly'
);

reset role;
update auth.users
set email = 'verification-updated@example.invalid'
where id = '80000000-0000-4000-8000-000000000001';
select is(
  (select profile.submission_email_verified_at from public.profiles as profile where profile.id = '80000000-0000-4000-8000-000000000001'),
  null::timestamptz,
  'changing the Auth email clears MMWR submission verification'
);
select set_config('request.jwt.claims', '{"sub":"80000000-0000-4000-8000-000000000001","role":"anon","aal":"aal1"}', true);
set local role anon;
select ok(
  has_function_privilege('anon', 'public.verify_submission_email(bytea)', 'EXECUTE')
  and not has_function_privilege('anon', 'private.verify_submission_email(bytea)', 'EXECUTE'),
  'anonymous verification consumes only a hash through the exposed wrapper'
);
select is(public.verify_submission_email(decode(repeat('33', 32), 'hex')), false, 'anonymous replay cannot re-consume a verification token');
reset role;

select * from finish();
rollback;
