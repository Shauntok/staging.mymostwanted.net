create extension if not exists pgtap with schema extensions;

begin;

select plan(23);

insert into auth.users (
  id, aud, role, email, email_confirmed_at, encrypted_password,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at
) values
  ('9f000000-0000-4000-8000-000000000001', 'authenticated', 'authenticated', 'email-owner@example.invalid', pg_catalog.now(), '', '{}'::jsonb, '{}'::jsonb, pg_catalog.now(), pg_catalog.now()),
  ('9f000000-0000-4000-8000-000000000002', 'authenticated', 'authenticated', 'email-admin@example.invalid', pg_catalog.now(), '', '{}'::jsonb, '{}'::jsonb, pg_catalog.now(), pg_catalog.now()),
  ('9f000000-0000-4000-8000-000000000003', 'authenticated', 'authenticated', 'email-member@example.invalid', pg_catalog.now(), '', '{}'::jsonb, '{}'::jsonb, pg_catalog.now(), pg_catalog.now());

insert into public.profiles (id, username)
values
  ('9f000000-0000-4000-8000-000000000001', 'emailowner'),
  ('9f000000-0000-4000-8000-000000000002', 'emailadmin'),
  ('9f000000-0000-4000-8000-000000000003', 'emailmember');

insert into private.user_roles (user_id, role)
values
  ('9f000000-0000-4000-8000-000000000001', 'owner'),
  ('9f000000-0000-4000-8000-000000000002', 'admin');

insert into auth.sessions (id, user_id, created_at, updated_at, aal)
values ('9f000000-0000-4000-8000-000000000011', '9f000000-0000-4000-8000-000000000001', pg_catalog.now(), pg_catalog.now(), 'aal2');
insert into private.staff_session_activity (session_id, started_at, last_activity_at)
values ('9f000000-0000-4000-8000-000000000011', pg_catalog.clock_timestamp(), pg_catalog.clock_timestamp());

select is((select enabled from private.runtime_flags where flag = 'critical_security_email'), false, 'critical security email is OFF in the default database state');
select ok(
  has_function_privilege('supabase_auth_admin', 'public.mmwr_mfa_recovery_code_attempt(jsonb)', 'EXECUTE')
  and not has_function_privilege('anon', 'public.mmwr_mfa_recovery_code_attempt(jsonb)', 'EXECUTE')
  and not has_function_privilege('authenticated', 'public.mmwr_mfa_recovery_code_attempt(jsonb)', 'EXECUTE')
  and not has_function_privilege('service_role', 'public.mmwr_mfa_recovery_code_attempt(jsonb)', 'EXECUTE'),
  'only Supabase Auth admin can invoke the recovery-code MFA hook'
);
select ok(
  (select relrowsecurity from pg_catalog.pg_class where oid = 'private.critical_security_email_outbox'::regclass)
  and (select relrowsecurity from pg_catalog.pg_class where oid = 'private.recovery_code_alert_windows'::regclass)
  and not has_table_privilege('anon', 'private.critical_security_email_outbox', 'SELECT')
  and not has_table_privilege('authenticated', 'private.critical_security_email_outbox', 'SELECT')
  and not has_table_privilege('service_role', 'private.critical_security_email_outbox', 'SELECT')
  and not has_table_privilege('supabase_auth_admin', 'private.recovery_code_alert_windows', 'SELECT'),
  'email queue and short-lived recovery counters remain private from API and Hook roles'
);
select ok(
  pg_catalog.pg_get_constraintdef((
    select oid from pg_catalog.pg_constraint
    where conrelid = 'private.security_events'::regclass
      and conname = 'security_events_type_valid'
  )) like '%recovery_code_redeemed%',
  'security event allowlist preserves the recovery-code audit event'
);
select ok(
  has_function_privilege('authenticated', 'public.owner_set_critical_security_email(boolean,text)', 'EXECUTE')
  and not has_function_privilege('anon', 'public.owner_set_critical_security_email(boolean,text)', 'EXECUTE')
  and has_function_privilege('service_role', 'public.mmwr_claim_critical_security_email()', 'EXECUTE')
  and not has_function_privilege('authenticated', 'public.mmwr_claim_critical_security_email()', 'EXECUTE'),
  'Owner controls policy while only the service dispatcher can claim email'
);

select set_config('test.email_hook_result', public.mmwr_mfa_recovery_code_attempt('{"factor_type":"totp","user_id":"9f000000-0000-4000-8000-000000000002","valid":false}'::jsonb)::text, true);
select is(current_setting('test.email_hook_result')::jsonb ->> 'decision', 'continue', 'non-recovery MFA factors are ignored');
select set_config('test.email_hook_result', public.mmwr_mfa_recovery_code_attempt('{"factor_type":"recovery_code","user_id":"9f000000-0000-4000-8000-000000000002","valid":false}'::jsonb)::text, true);
select is(current_setting('test.email_hook_result')::jsonb ->> 'decision', 'continue', 'failed recovery verification still returns Auth continue while alert policy is OFF');
select ok(
  (select pg_catalog.count(*) = 0 from private.recovery_code_alert_windows)
  and (select pg_catalog.count(*) = 0 from private.security_events where event_type = 'recovery_code_redeemed')
  and (select pg_catalog.count(*) = 0 from private.critical_security_email_outbox),
  'the OFF path creates no counter, event, or email queue row'
);

select set_config('request.jwt.claim.sub', '9f000000-0000-4000-8000-000000000001', true);
select set_config('request.jwt.claims', pg_catalog.jsonb_build_object(
  'sub', '9f000000-0000-4000-8000-000000000001', 'role', 'authenticated', 'aal', 'aal2',
  'session_id', '9f000000-0000-4000-8000-000000000011',
  'amr', pg_catalog.jsonb_build_array(pg_catalog.jsonb_build_object(
    'method', 'mfa/totp', 'timestamp', pg_catalog.floor(pg_catalog.date_part('epoch', pg_catalog.clock_timestamp()))::bigint
  ))
)::text, true);
set local role authenticated;
select is(public.owner_set_critical_security_email(true, 'Synthetic local policy test'), true, 'Owner with recent TOTP can enable the mail policy');
reset role;

select set_config('test.email_hook_result', public.mmwr_mfa_recovery_code_attempt('{"factor_type":"recovery_code","user_id":"9f000000-0000-4000-8000-000000000002","valid":false}'::jsonb)::text, true);
select set_config('test.email_hook_result', public.mmwr_mfa_recovery_code_attempt('{"factor_type":"recovery_code","user_id":"9f000000-0000-4000-8000-000000000002","valid":false}'::jsonb)::text, true);
select set_config('test.email_hook_result', public.mmwr_mfa_recovery_code_attempt('{"factor_type":"recovery_code","user_id":"9f000000-0000-4000-8000-000000000002","valid":false}'::jsonb)::text, true);
select set_config('test.email_hook_result', public.mmwr_mfa_recovery_code_attempt('{"factor_type":"recovery_code","user_id":"9f000000-0000-4000-8000-000000000002","valid":false}'::jsonb)::text, true);
select is((select failure_count from private.recovery_code_alert_windows where user_id = '9f000000-0000-4000-8000-000000000002'), 4, 'first four recovery-code failures only update the short-lived counter');
select ok(
  (select pg_catalog.count(*) = 0 from private.security_events where event_type = 'recovery_code_redeemed')
  and (select pg_catalog.count(*) = 0 from private.critical_security_email_outbox),
  'below-threshold failures create no email alert'
);

select set_config('test.email_hook_result', public.mmwr_mfa_recovery_code_attempt('{"factor_type":"recovery_code","user_id":"9f000000-0000-4000-8000-000000000002","valid":false}'::jsonb)::text, true);
select is(current_setting('test.email_hook_result')::jsonb ->> 'decision', 'continue', 'threshold alert never changes Auth verification outcome');
select ok(
  (select pg_catalog.count(*) = 1 from private.security_events where event_type = 'recovery_code_redeemed' and actor_user_id = '9f000000-0000-4000-8000-000000000002')
  and (select pg_catalog.count(*) = 1 from private.critical_security_email_outbox
       where alert_type = 'brute_force_attack' and source_key like 'security_event:%'
         and recipient_user_id = '9f000000-0000-4000-8000-000000000001' and status = 'pending' and sent_at is null),
  'the fifth failure creates one fixed recovery-code alert for the confirmed Owner and leaves it pending'
);
select set_config('test.email_hook_result', public.mmwr_mfa_recovery_code_attempt('{"factor_type":"recovery_code","user_id":"9f000000-0000-4000-8000-000000000002","valid":false}'::jsonb)::text, true);
select ok(
  (select failure_count = 5 and alerted_at is not null from private.recovery_code_alert_windows where user_id = '9f000000-0000-4000-8000-000000000002')
  and (select pg_catalog.count(*) = 1 from private.security_events where event_type = 'recovery_code_redeemed')
  and (select pg_catalog.count(*) = 1 from private.critical_security_email_outbox where alert_type = 'brute_force_attack'),
  'additional failures in the same window do not duplicate the threshold event or queued alert'
);

insert into private.security_events (actor_user_id, event_type, outcome)
values ('9f000000-0000-4000-8000-000000000002', 'staff_sign_in_anomaly', 'failure');
select is((select pg_catalog.count(*)::integer from private.critical_security_email_outbox), 1, 'generic staff sign-in anomaly remains audit-only and does not enqueue email');
set local role service_role;
select set_config('test.generic_enqueue_count', public.mmwr_enqueue_critical_security_email('brute_force_attack', '9f000000-0000-4000-8000-000000000002')::text, true);
reset role;
select is(current_setting('test.generic_enqueue_count'), '0', 'generic service enqueue cannot manufacture a recovery-code alert');

select set_config('test.email_hook_result', public.mmwr_mfa_recovery_code_attempt('{"factor_type":"recovery_code","user_id":"9f000000-0000-4000-8000-000000000002","valid":true}'::jsonb)::text, true);
select is((select pg_catalog.count(*)::integer from private.recovery_code_alert_windows), 0, 'a successful recovery code clears its short-lived failure counter');

select set_config('request.jwt.claims', '{"sub":"9f000000-0000-4000-8000-000000000001","role":"authenticated","aal":"aal2","session_id":"9f000000-0000-4000-8000-000000000011","amr":[{"method":"mfa/totp","timestamp":1000}]}', true);
set local role authenticated;
select is(public.owner_set_critical_security_email(false, 'Stale TOTP must fail'), false, 'stale TOTP cannot disable or change the policy');
reset role;
select is((select enabled from private.runtime_flags where flag = 'critical_security_email'), true, 'stale-TOTP denial leaves the policy enabled');

select set_config('request.jwt.claims', pg_catalog.jsonb_build_object(
  'sub', '9f000000-0000-4000-8000-000000000001', 'role', 'authenticated', 'aal', 'aal2',
  'session_id', '9f000000-0000-4000-8000-000000000011',
  'amr', pg_catalog.jsonb_build_array(pg_catalog.jsonb_build_object(
    'method', 'mfa/totp', 'timestamp', pg_catalog.floor(pg_catalog.date_part('epoch', pg_catalog.clock_timestamp()))::bigint
  ))
)::text, true);
set local role authenticated;
select is(public.owner_set_critical_security_email(false, 'Synthetic local policy shutdown'), true, 'Owner with fresh TOTP can disable the mail policy');
reset role;
select ok(
  (select enabled = false from private.runtime_flags where flag = 'critical_security_email')
  and (select pg_catalog.count(*) = 0 from private.recovery_code_alert_windows)
  and (select status = 'skipped' and sent_at is null and last_error_code = 'policy_disabled'
       from private.critical_security_email_outbox where alert_type = 'brute_force_attack'),
  'disabling email clears counters and marks the pending alert skipped before delivery'
);
select is((select pg_catalog.count(*)::integer from private.critical_security_email_delivery_audit where action = 'skipped'), 1, 'policy shutdown appends one skipped-delivery audit event');
select ok(
  not exists (
    select 1 from information_schema.columns
    where table_schema = 'private'
      and table_name in ('recovery_code_alert_windows','critical_security_email_outbox')
      and column_name <> 'last_error_code'
      and column_name ~* '(^|_)(ip|ip_address|client_ip|forwarded_for|device|device_id|user_agent|headers|recovery_code|submitted_code|verification_code)($|_)'
  )
  and (select pg_catalog.count(*) = 1 from private.critical_security_email_outbox where status = 'skipped' and sent_at is null),
  'alert storage keeps no IP/device/code fields and no test email was sent'
);

select * from finish();
rollback;
