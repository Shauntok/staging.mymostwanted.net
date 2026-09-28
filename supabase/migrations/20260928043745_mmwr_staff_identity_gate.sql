-- Staff discovery is intentionally separate from staff authorization.
-- AAL1 may reveal only whether the caller has a staff role, so the app can
-- route them to the mandatory TOTP step without granting management access.
alter table private.security_events drop constraint security_events_type_valid;
alter table private.security_events
  add constraint security_events_type_valid check (
    event_type in (
      'staff_sign_in_anomaly',
      'staff_login_failure',
      'staff_mfa_failure',
      'staff_mfa_enrolled',
      'staff_mfa_reset',
      'staff_access_denied'
    )
  );

create function private.has_staff_identity()
returns boolean
language sql
stable
security definer
set search_path = ''
as $function$
  select exists (
    select 1 from private.user_roles as user_role
    where user_role.user_id = (select auth.uid())
      and user_role.role in ('admin', 'owner')
  );
$function$;

revoke all on function private.has_staff_identity() from public, anon, service_role;
grant execute on function private.has_staff_identity() to authenticated;

create function public.has_staff_identity()
returns boolean
language sql
stable
security invoker
set search_path = ''
as $function$
  select private.has_staff_identity();
$function$;

revoke all on function public.has_staff_identity() from public, anon, service_role;
grant execute on function public.has_staff_identity() to authenticated;

