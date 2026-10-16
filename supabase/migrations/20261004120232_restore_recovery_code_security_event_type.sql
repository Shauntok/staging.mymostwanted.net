-- The account-deletion migration replaced this allowlist without carrying
-- forward recovery_code_redeemed. Keep the recovery-code alert hook's audit
-- event valid while retaining every currently supported event type.
alter table private.security_events drop constraint security_events_type_valid;
alter table private.security_events
  add constraint security_events_type_valid check (
    event_type in (
      'staff_sign_in_anomaly',
      'staff_login_failure',
      'staff_mfa_failure',
      'staff_mfa_enrolled',
      'staff_mfa_reset',
      'recovery_code_redeemed',
      'staff_access_denied',
      'staff_role_changed',
      'staff_owner_bootstrapped',
      'account_deletion_requested',
      'account_deletion_cancelled'
    )
  );
