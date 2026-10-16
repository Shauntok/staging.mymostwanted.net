-- Staff-issued account restrictions are private, append-only events. Timed
-- restrictions become inactive by comparing expires_at at authorization time;
-- no scheduler is required for expiry to take effect.

create table private.account_sanction_events (
  id bigint generated always as identity primary key,
  target_user_id uuid references auth.users (id) on delete set null,
  actor_user_id uuid references auth.users (id) on delete set null,
  action text not null,
  target_event_id bigint references private.account_sanction_events (id) on delete restrict,
  reason text not null,
  occurred_at timestamptz not null default pg_catalog.clock_timestamp(),
  expires_at timestamptz,
  constraint account_sanction_action_valid check (
    action in ('warning', 'submission_suspension', 'account_suspension', 'permanent_ban', 'lift')
  ),
  constraint account_sanction_reason_valid check (
    pg_catalog.char_length(pg_catalog.btrim(reason)) between 1 and 500
  ),
  constraint account_sanction_event_shape check (
    (action = 'lift' and target_event_id is not null and expires_at is null)
    or (action in ('submission_suspension', 'account_suspension') and target_event_id is null and expires_at is not null)
    or (action in ('warning', 'permanent_ban') and target_event_id is null and expires_at is null)
  )
);

create unique index account_sanction_one_lift_per_event_idx
  on private.account_sanction_events (target_event_id)
  where action = 'lift';

create index account_sanction_target_time_idx
  on private.account_sanction_events (target_user_id, occurred_at desc);

create index account_sanction_active_expiry_idx
  on private.account_sanction_events (target_user_id, action, expires_at)
  where action in ('submission_suspension', 'account_suspension', 'permanent_ban');

alter table private.account_sanction_events enable row level security;
revoke all on table private.account_sanction_events from public, anon, authenticated, service_role;

create function private.reject_account_sanction_mutation()
returns trigger
language plpgsql
set search_path = ''
as $function$
begin
  -- Account deletion may anonymize actor/target references through the
  -- ON DELETE SET NULL foreign keys. Permit only that narrow FK action.
  if tg_op = 'UPDATE' then
    if (
      (old.target_user_id is distinct from new.target_user_id and new.target_user_id is null)
      or (old.actor_user_id is distinct from new.actor_user_id and new.actor_user_id is null)
    )
      and (new.target_user_id is null or new.target_user_id = old.target_user_id)
      and (new.actor_user_id is null or new.actor_user_id = old.actor_user_id)
      and (to_jsonb(old) - 'target_user_id' - 'actor_user_id')
        = (to_jsonb(new) - 'target_user_id' - 'actor_user_id') then
      return new;
    end if;
  end if;
  raise exception 'account sanction events are append-only' using errcode = '42501';
end;
$function$;

revoke all on function private.reject_account_sanction_mutation() from public, anon, authenticated, service_role;

create trigger account_sanction_events_append_only
  before update or delete on private.account_sanction_events
  for each row execute function private.reject_account_sanction_mutation();

create trigger account_sanction_events_no_truncate
  before truncate on private.account_sanction_events
  for each statement execute function private.reject_account_sanction_mutation();

create function private.account_has_active_sanction(p_user_id uuid, p_action text)
returns boolean
language sql
volatile
security definer
set search_path = ''
as $function$
  select exists (
    select 1
    from private.account_sanction_events as sanction
    where sanction.target_user_id = p_user_id
      and sanction.action = p_action
      and sanction.action <> 'lift'
      and sanction.occurred_at <= pg_catalog.clock_timestamp()
      and (sanction.expires_at is null or sanction.expires_at > pg_catalog.clock_timestamp())
      and not exists (
        select 1
        from private.account_sanction_events as lift
        where lift.action = 'lift'
          and lift.target_event_id = sanction.id
      )
  );
$function$;

revoke all on function private.account_has_active_sanction(uuid, text) from public, anon, authenticated, service_role;

-- Refresh shared authorization helpers so account suspensions also cut off
-- staff access in existing sessions, not only at the login form.
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
        and not private.account_has_active_sanction(profile.id, 'account_suspension')
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
      and not private.account_has_active_sanction(profile.id, 'account_suspension')
  );
$function$;

create function private.staff_search_sanction_targets(p_username_query text)
returns table (target_user_id uuid, username text)
language plpgsql
volatile
security definer
set search_path = ''
as $function$
declare
  v_query text := pg_catalog.lower(pg_catalog.btrim(coalesce(p_username_query, '')));
begin
  if (select auth.uid()) is null
    or not (private.has_staff_role('admin') or private.has_staff_role('owner'))
    or not private.has_recent_totp()
    or pg_catalog.char_length(v_query) not between 3 and 24 then
    return;
  end if;

  return query
  select profile.id, profile.username
  from public.profiles as profile
  where profile.account_state = 'active'
    and pg_catalog.strpos(pg_catalog.lower(profile.username), v_query) > 0
    and not exists (
      select 1 from private.user_roles as user_role
      where user_role.user_id = profile.id and user_role.role = 'owner'
    )
    and (
      private.has_staff_role('owner')
      or not exists (select 1 from private.user_roles as user_role where user_role.user_id = profile.id)
    )
  order by profile.username, profile.id
  limit 25;
end;
$function$;

revoke all on function private.staff_search_sanction_targets(text) from public, anon, authenticated, service_role;
grant execute on function private.staff_search_sanction_targets(text) to authenticated;

create function public.staff_search_sanction_targets(p_username_query text)
returns table (target_user_id uuid, username text)
language sql
volatile
security invoker
set search_path = ''
as $function$
  select * from private.staff_search_sanction_targets(p_username_query);
$function$;

revoke all on function public.staff_search_sanction_targets(text) from public, anon, service_role;
grant execute on function public.staff_search_sanction_targets(text) to authenticated;

create function private.staff_list_account_sanctions(p_username_query text default null)
returns table (
  sanction_event_id bigint,
  target_username text,
  action text,
  reason text,
  actor_username text,
  occurred_at timestamptz,
  expires_at timestamptz,
  event_state text,
  lifted_at timestamptz,
  lift_reason text
)
language plpgsql
volatile
security definer
set search_path = ''
as $function$
declare
  v_query text := nullif(pg_catalog.lower(pg_catalog.btrim(coalesce(p_username_query, ''))), '');
begin
  if (select auth.uid()) is null
    or not (private.has_staff_role('admin') or private.has_staff_role('owner'))
    or not private.has_recent_totp()
    or (v_query is not null and pg_catalog.char_length(v_query) not between 3 and 24) then
    return;
  end if;

  return query
  select sanction.id,
         target.username,
         sanction.action,
         sanction.reason,
         actor.username,
         sanction.occurred_at,
         sanction.expires_at,
         case
           when sanction.action = 'warning' then 'recorded'
           when lift.id is not null then 'lifted'
           when sanction.expires_at is not null and sanction.expires_at <= pg_catalog.statement_timestamp() then 'expired'
           else 'active'
         end,
         lift.occurred_at,
         lift.reason
  from private.account_sanction_events as sanction
  join public.profiles as target on target.id = sanction.target_user_id
  left join public.profiles as actor on actor.id = sanction.actor_user_id
  left join private.account_sanction_events as lift
    on lift.action = 'lift' and lift.target_event_id = sanction.id
  where sanction.action <> 'lift'
    and (v_query is null or pg_catalog.strpos(pg_catalog.lower(target.username), v_query) > 0)
  order by sanction.occurred_at desc, sanction.id desc
  limit 100;
end;
$function$;

revoke all on function private.staff_list_account_sanctions(text) from public, anon, authenticated, service_role;
grant execute on function private.staff_list_account_sanctions(text) to authenticated;

create function public.staff_list_account_sanctions(p_username_query text default null)
returns table (
  sanction_event_id bigint,
  target_username text,
  action text,
  reason text,
  actor_username text,
  occurred_at timestamptz,
  expires_at timestamptz,
  event_state text,
  lifted_at timestamptz,
  lift_reason text
)
language sql
volatile
security invoker
set search_path = ''
as $function$
  select * from private.staff_list_account_sanctions(p_username_query);
$function$;

revoke all on function public.staff_list_account_sanctions(text) from public, anon, service_role;
grant execute on function public.staff_list_account_sanctions(text) to authenticated;

create function private.staff_apply_account_sanction(
  p_target_user_id uuid,
  p_action text,
  p_expires_at timestamptz,
  p_reason text
)
returns bigint
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_actor uuid := (select auth.uid());
  v_target uuid;
  v_event_id bigint;
  v_now timestamptz := pg_catalog.clock_timestamp();
  v_is_owner boolean;
begin
  v_is_owner := private.has_staff_role('owner');
  if v_actor is null
    or (not v_is_owner and not private.has_staff_role('admin'))
    or not private.has_recent_totp()
    or p_target_user_id is null
    or p_target_user_id = v_actor
    or p_action is null
    or p_action not in ('warning', 'submission_suspension', 'account_suspension', 'permanent_ban')
    or p_reason is null
    or pg_catalog.char_length(pg_catalog.btrim(p_reason)) not between 1 and 500
    or (p_action = 'permanent_ban' and not v_is_owner)
    or (p_action in ('submission_suspension', 'account_suspension') and (p_expires_at is null or p_expires_at <= v_now))
    or (p_action in ('warning', 'permanent_ban') and p_expires_at is not null) then
    return null;
  end if;

  select profile.id into v_target
  from public.profiles as profile
  where profile.id = p_target_user_id
    and profile.account_state = 'active'
  for update;
  if not found
    or exists (
      select 1 from private.user_roles as user_role
      where user_role.user_id = p_target_user_id
        and (user_role.role = 'owner' or (user_role.role = 'admin' and not private.has_staff_role('owner')))
    )
    or not private.has_recent_totp()
    or (not private.has_staff_role('owner') and not private.has_staff_role('admin')) then
    return null;
  end if;

  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_target_user_id::text, 0));

  -- Re-evaluate authority and requested expiry after all potentially blocking locks.
  v_now := pg_catalog.clock_timestamp();
  v_is_owner := private.has_staff_role('owner');
  if (not v_is_owner and not private.has_staff_role('admin'))
    or not private.has_recent_totp()
    or (p_action = 'permanent_ban' and not v_is_owner)
    or (p_action in ('submission_suspension', 'account_suspension') and p_expires_at <= v_now)
    or exists (
      select 1 from private.user_roles as user_role
      where user_role.user_id = p_target_user_id
        and (user_role.role = 'owner' or (user_role.role = 'admin' and not v_is_owner))
    ) then
    return null;
  end if;

  if p_action in ('submission_suspension', 'account_suspension', 'permanent_ban')
    and private.account_has_active_sanction(p_target_user_id, p_action) then
    return null;
  end if;

  if p_action = 'permanent_ban' then
    if not private.has_staff_role('owner') or not private.has_recent_totp() then return null; end if;
    update public.profiles as profile set account_state = 'banned'
    where profile.id = p_target_user_id and profile.account_state = 'active';
    if not found then return null; end if;
  end if;

  insert into private.account_sanction_events (
    target_user_id, actor_user_id, action, reason, expires_at
  ) values (
    p_target_user_id, v_actor, p_action, pg_catalog.btrim(p_reason), p_expires_at
  ) returning id into v_event_id;

  return v_event_id;
end;
$function$;

revoke all on function private.staff_apply_account_sanction(uuid, text, timestamptz, text) from public, anon, authenticated, service_role;
grant execute on function private.staff_apply_account_sanction(uuid, text, timestamptz, text) to authenticated;

create function public.staff_apply_account_sanction(
  p_target_user_id uuid,
  p_action text,
  p_expires_at timestamptz,
  p_reason text
)
returns bigint
language sql
security invoker
set search_path = ''
as $function$
  select private.staff_apply_account_sanction(p_target_user_id, p_action, p_expires_at, p_reason);
$function$;

revoke all on function public.staff_apply_account_sanction(uuid, text, timestamptz, text) from public, anon, service_role;
grant execute on function public.staff_apply_account_sanction(uuid, text, timestamptz, text) to authenticated;

create function private.staff_lift_account_sanction(p_sanction_event_id bigint, p_reason text)
returns boolean
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_actor uuid := (select auth.uid());
  v_sanction private.account_sanction_events%rowtype;
  v_target uuid;
  v_is_owner boolean;
  v_now timestamptz;
begin
  v_is_owner := private.has_staff_role('owner');
  if v_actor is null
    or (not v_is_owner and not private.has_staff_role('admin'))
    or not private.has_recent_totp()
    or p_sanction_event_id is null
    or p_reason is null
    or pg_catalog.char_length(pg_catalog.btrim(p_reason)) not between 1 and 500 then
    return false;
  end if;

  select sanction.* into v_sanction
  from private.account_sanction_events as sanction
  where sanction.id = p_sanction_event_id
    and sanction.action in ('submission_suspension', 'account_suspension', 'permanent_ban')
  for update;
  if not found then return false; end if;

  if (v_sanction.action = 'permanent_ban' and not v_is_owner)
    or (v_sanction.expires_at is not null and v_sanction.expires_at <= pg_catalog.statement_timestamp())
    or exists (
      select 1 from private.account_sanction_events as lift
      where lift.action = 'lift' and lift.target_event_id = v_sanction.id
    ) then
    return false;
  end if;

  select profile.id into v_target
  from public.profiles as profile
  where profile.id = v_sanction.target_user_id
  for update;
  if not found then return false; end if;

  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(v_target::text, 0));
  v_now := pg_catalog.clock_timestamp();
  v_is_owner := private.has_staff_role('owner');
  if not private.has_recent_totp()
    or (not v_is_owner and not private.has_staff_role('admin'))
    or (v_sanction.action = 'permanent_ban' and not v_is_owner)
    or (v_sanction.expires_at is not null and v_sanction.expires_at <= v_now)
    or exists (
      select 1 from private.account_sanction_events as lift
      where lift.action = 'lift' and lift.target_event_id = v_sanction.id
    ) then
    return false;
  end if;

  if v_sanction.action = 'permanent_ban' then
    if not private.has_staff_role('owner') then return false; end if;
    update public.profiles as profile set account_state = 'active'
    where profile.id = v_target and profile.account_state = 'banned';
    if not found then return false; end if;
  end if;

  insert into private.account_sanction_events (
    target_user_id, actor_user_id, action, target_event_id, reason
  ) values (
    v_target, v_actor, 'lift', v_sanction.id, pg_catalog.btrim(p_reason)
  );
  return true;
end;
$function$;

revoke all on function private.staff_lift_account_sanction(bigint, text) from public, anon, authenticated, service_role;
grant execute on function private.staff_lift_account_sanction(bigint, text) to authenticated;

create function public.staff_lift_account_sanction(p_sanction_event_id bigint, p_reason text)
returns boolean
language sql
security invoker
set search_path = ''
as $function$
  select private.staff_lift_account_sanction(p_sanction_event_id, p_reason);
$function$;

revoke all on function public.staff_lift_account_sanction(bigint, text) from public, anon, service_role;
grant execute on function public.staff_lift_account_sanction(bigint, text) to authenticated;

-- The submission form remains disabled, but every existing submission write
-- RPC must enforce sanctions if that feature is opened in a later phase.
create or replace function private.create_submission(p_title text, p_original_source text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_user_id uuid := (select auth.uid());
  v_submission_id uuid;
begin
  if v_user_id is null
    or p_title is null or pg_catalog.btrim(p_title) = ''
    or p_original_source is null or pg_catalog.btrim(p_original_source) = ''
    or private.account_has_active_sanction(v_user_id, 'submission_suspension')
    or private.account_has_active_sanction(v_user_id, 'account_suspension')
    or not exists (
      select 1
      from public.profiles as profile
      join auth.users as auth_user on auth_user.id = profile.id
      where profile.id = v_user_id
        and profile.account_state = 'active'
        and auth_user.email_confirmed_at is not null
    ) then
    return null;
  end if;

  insert into private.submissions (submitter_id, submitted_title, original_source)
  values (v_user_id, pg_catalog.btrim(p_title), p_original_source)
  returning id into v_submission_id;
  return v_submission_id;
end;
$function$;

create or replace function private.append_submission_information(p_submission_id uuid, p_information text)
returns boolean
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_user_id uuid := (select auth.uid());
  v_status text;
begin
  if v_user_id is null or p_information is null or pg_catalog.btrim(p_information) = ''
    or private.account_has_active_sanction(v_user_id, 'submission_suspension')
    or private.account_has_active_sanction(v_user_id, 'account_suspension')
    or not exists (
      select 1 from public.profiles as profile
      where profile.id = v_user_id and profile.account_state = 'active'
    ) then
    return false;
  end if;

  select submission.status into v_status
  from private.submissions as submission
  where submission.id = p_submission_id and submission.submitter_id = v_user_id
  for update;
  if v_status is distinct from 'needs_more_information' then return false; end if;

  insert into private.submission_addenda (submission_id, submitter_id, additional_information)
  values (p_submission_id, v_user_id, p_information);
  return true;
end;
$function$;

-- Keep evidence registration sanction-aware for a future submission launch.
-- The existing default-off migration has revoked the client grants; this
-- replacement deliberately does not grant them back.
create or replace function private.register_submission_evidence(p_submission_id uuid, p_object_name text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_user_id uuid := (select auth.uid());
  v_folders text[];
  v_mime_type text;
  v_evidence_id uuid;
begin
  if v_user_id is null or p_submission_id is null or p_object_name is null
    or private.account_has_active_sanction(v_user_id, 'submission_suspension')
    or private.account_has_active_sanction(v_user_id, 'account_suspension')
    or not exists (
      select 1 from public.profiles as profile
      where profile.id = v_user_id and profile.account_state = 'active'
    ) then
    return null;
  end if;

  v_folders := storage.foldername(p_object_name);
  if pg_catalog.cardinality(v_folders) <> 2
    or v_folders[1] <> v_user_id::text
    or v_folders[2] <> p_submission_id::text
    or storage.filename(p_object_name) !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}[.](jpg|jpeg|png|webp|pdf|mp3|m4a|wav|doc|docx)$'
    or not exists (
      select 1 from private.submissions as submission
      where submission.id = p_submission_id
        and submission.submitter_id = v_user_id
        and submission.status in ('received', 'needs_more_information')
    ) then
    return null;
  end if;

  select evidence_object.metadata ->> 'mimetype' into v_mime_type
  from storage.objects as evidence_object
  where evidence_object.bucket_id = 'mmwr-evidence-quarantine'
    and evidence_object.name = p_object_name;

  if not found or not private.evidence_mime_matches_extension(p_object_name, v_mime_type) then
    return null;
  end if;

  select evidence.id into v_evidence_id
  from private.evidence_metadata as evidence
  where evidence.object_path = p_object_name;
  if found then return v_evidence_id; end if;

  insert into private.evidence_metadata (
    submission_id, uploaded_by, object_path, mime_type, scan_state, visibility
  ) values (
    p_submission_id, v_user_id, p_object_name, pg_catalog.lower(v_mime_type), 'pending', 'internal_only'
  ) returning id into v_evidence_id;
  return v_evidence_id;
end;
$function$;

create or replace function public.toggle_my_post_reaction(p_post_id uuid, p_reaction_type text)
returns table (accepted boolean, selected_reaction text)
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_user_id uuid := (select auth.uid());
  v_account_state text;
  v_locked_user_id uuid;
  v_post_status text;
  v_area_active boolean;
  v_existing_type text;
begin
  if v_user_id is null or p_reaction_type not in ('helpful', 'thanks', 'support') then
    return query select false, null::text; return;
  end if;

  select auth_user.id into v_locked_user_id
  from auth.users as auth_user where auth_user.id = v_user_id for key share;
  if not found then return query select false, null::text; return; end if;

  select post_row.status, area.is_active into v_post_status, v_area_active
  from private.posts as post_row
  left join private.areas as area on area.id = post_row.area_id
  where post_row.id = p_post_id for update of post_row;
  if not found or v_post_status <> 'published' or v_area_active is distinct from true
    or not exists (select 1 from public.published_previews as preview where preview.post_id = p_post_id) then
    return query select false, null::text; return;
  end if;

  select profile.account_state into v_account_state
  from public.profiles as profile where profile.id = v_user_id;
  if v_account_state is distinct from 'active'
    or private.account_has_active_sanction(v_user_id, 'account_suspension') then
    return query select false, null::text; return;
  end if;

  select reaction.reaction_type into v_existing_type
  from private.reactions as reaction
  where reaction.user_id = v_user_id and reaction.post_id = p_post_id
  for update;
  if found and v_existing_type = p_reaction_type then
    delete from private.reactions as reaction where reaction.user_id = v_user_id and reaction.post_id = p_post_id;
    return query select true, null::text;
  elsif found then
    update private.reactions as reaction set reaction_type = p_reaction_type
    where reaction.user_id = v_user_id and reaction.post_id = p_post_id;
    return query select true, p_reaction_type;
  else
    insert into private.reactions (user_id, post_id, reaction_type)
    values (v_user_id, p_post_id, p_reaction_type);
    return query select true, p_reaction_type;
  end if;
end;
$function$;
