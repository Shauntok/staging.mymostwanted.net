-- Scope duplicate-signal refreshes to peers with matching primary or
-- supplemental descriptions when a submission enters/leaves the open set.
-- The previous status trigger refreshed every active duplicate signal.

drop trigger if exists submission_ordinary_risk_status_refresh
  on private.submissions;
drop trigger if exists submission_ordinary_risk_addendum_status_peer_refresh
  on private.submissions;

create or replace function private.refresh_submission_duplicate_peers_after_status_change()
returns trigger
language plpgsql volatile security definer set search_path = ''
as $function$
declare
  v_peer_submission_id uuid;
begin
  perform private.refresh_submission_ordinary_risk_signals(new.id);

  for v_peer_submission_id in
    select peer.submission_id
    from (
      select other_submission.id as submission_id
      from private.submissions as current_submission
      join private.submissions as other_submission
        on other_submission.id <> current_submission.id
       and private.normalize_submission_description(other_submission.original_source)
         = private.normalize_submission_description(current_submission.original_source)
       and other_submission.status in ('received', 'reviewing', 'needs_more_information')
      where current_submission.id = new.id
        and private.normalize_submission_description(current_submission.original_source) <> ''

      union

      select other_addendum.submission_id
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
    ) as peer
  loop
    perform private.refresh_submission_ordinary_risk_signals(v_peer_submission_id);
  end loop;

  return null;
end;
$function$;
revoke all on function private.refresh_submission_duplicate_peers_after_status_change()
  from public, anon, authenticated, service_role;

create trigger submission_ordinary_risk_status_peer_refresh
  after update of status on private.submissions
  for each row
  when ((old.status in ('received', 'reviewing', 'needs_more_information'))
    is distinct from (new.status in ('received', 'reviewing', 'needs_more_information')))
  execute function private.refresh_submission_duplicate_peers_after_status_change();
