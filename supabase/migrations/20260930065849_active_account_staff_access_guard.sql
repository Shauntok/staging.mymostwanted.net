-- Staff roles do not override an account restriction. This protects every
-- existing staff RPC and RLS policy that delegates authorization to
-- private.has_staff_role, including requests made with an older live session.
-- Reversal, if needed, is to restore the prior definitions from
-- 20260928073422_mmwr_native_staff_recovery_codes.sql and
-- 20260928043745_mmwr_staff_identity_gate.sql.

create or replace function private.has_staff_role(p_role text)
returns boolean
language sql
volatile
security definer
set search_path = ''
as $function$
  select case
    when (select auth.uid()) is null then false
    when (select auth.jwt() ->> 'aal') is distinct from 'aal2' then false
    when not (
      coalesce((select auth.jwt() -> 'amr'), '[]'::jsonb)
      @> '[{"method":"totp"}]'::jsonb
      or coalesce((select auth.jwt() -> 'amr'), '[]'::jsonb)
      @> '[{"method":"mfa/totp"}]'::jsonb
    ) then false
    when p_role not in ('admin', 'owner') then false
    else exists (
      select 1
      from private.user_roles as user_role
      join public.profiles as profile on profile.id = user_role.user_id
      where user_role.user_id = (select auth.uid())
        and user_role.role = p_role
        and profile.account_state = 'active'
    )
  end;
$function$;

create or replace function private.has_staff_identity()
returns boolean
language sql
volatile
security definer
set search_path = ''
as $function$
  select exists (
    select 1
    from private.user_roles as user_role
    join public.profiles as profile on profile.id = user_role.user_id
    where user_role.user_id = (select auth.uid())
      and user_role.role in ('admin', 'owner')
      and profile.account_state = 'active'
  );
$function$;
