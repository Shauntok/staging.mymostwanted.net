-- Recompute supplemental-description duplicate signals when a submission
-- enters or leaves the open review set. The primary-description trigger
-- already refreshes its peers; this closes the equivalent addendum gap.

create or replace function private.refresh_submission_addendum_duplicate_peers_on_status_change()
returns trigger
language plpgsql volatile security definer set search_path = ''
as $function$
declare
  v_other_submission_id uuid;
begin
  if old.status is not distinct from new.status then
    return null;
  end if;

  for v_other_submission_id in
    select distinct other_addendum.submission_id
    from private.submission_addenda as current_addendum
    join private.submission_addenda as other_addendum
      on private.normalize_submission_description(current_addendum.additional_information)
        = private.normalize_submission_description(other_addendum.additional_information)
      and other_addendum.submission_id <> new.id
    join private.submissions as other_submission
      on other_submission.id = other_addendum.submission_id
    where current_addendum.submission_id = new.id
      and private.normalize_submission_description(current_addendum.additional_information) <> ''
      and other_submission.status in ('received', 'reviewing', 'needs_more_information')
  loop
    perform private.refresh_submission_ordinary_risk_signals(v_other_submission_id);
  end loop;

  return null;
end;
$function$;
revoke all on function private.refresh_submission_addendum_duplicate_peers_on_status_change()
  from public, anon, authenticated, service_role;

drop trigger if exists submission_ordinary_risk_addendum_status_peer_refresh
  on private.submissions;
create trigger submission_ordinary_risk_addendum_status_peer_refresh
  after update of status on private.submissions
  for each row execute function private.refresh_submission_addendum_duplicate_peers_on_status_change();
