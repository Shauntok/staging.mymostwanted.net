-- The selected alert policy covers recovery-code lockouts only. Remove the
-- separate Auth Password Verification Hook producer and its short-lived state.
do $block$
declare
  v_job_id bigint;
begin
  select job.jobid into v_job_id
  from cron.job as job
  where job.jobname = 'mmwr_staff_password_failure_window_cleanup';

  if v_job_id is not null then
    perform cron.unschedule(v_job_id);
  end if;
end;
$block$;

drop trigger if exists clear_staff_password_failure_windows_on_email_policy_change
  on private.runtime_flags;
drop function if exists private.clear_staff_password_failure_windows_on_email_policy_change();
drop function if exists private.cleanup_staff_password_failure_windows();
drop function if exists private.mmwr_password_verification_attempt(jsonb);
drop table if exists private.staff_password_failure_windows;

revoke usage on schema private from supabase_auth_admin;

-- No rollback may restore the password-failure email producer: the selected
-- policy allows recovery-code anomalies only. If recovering from an older
-- database snapshot, reapply this removal before enabling critical email.
