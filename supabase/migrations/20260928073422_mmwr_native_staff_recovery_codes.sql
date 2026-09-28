-- Recovery codes are a Supabase Auth MFA factor. Let Auth own the plaintext-once
-- lifecycle, single-use redemption, AAL2 elevation and failed-attempt lockout.
-- Remove the earlier app-owned hash store, whose redemption could not elevate
-- an Auth session and therefore was not a complete second-factor flow.
-- Recovery-code verification raises assurance to AAL2 but is not itself a
-- TOTP assertion for normal staff data access. Require the signed MFA method
-- claim to contain mfa/totp; recovery-code sessions stay in the factor-reset
-- flow until the replacement authenticator is verified.
create or replace function private.has_staff_role(p_role text)
returns boolean
language sql
stable
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
      where user_role.user_id = (select auth.uid())
        and user_role.role = p_role
    )
  end;
$function$;

drop function public.redeem_recovery_code(bytea);
drop function private.consume_recovery_code(bytea);
drop table private.recovery_code_hashes;
drop table private.recovery_code_rate_limits;
