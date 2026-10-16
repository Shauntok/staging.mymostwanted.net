-- Clarification posts use the existing post identity/content model, with a
-- separate typed one-to-one relationship to an already published story.
alter table private.posts
  add column post_type text not null default 'story',
  add constraint posts_type_valid check (post_type in ('story', 'clarification'));

alter table public.published_previews
  add column content_type text not null default 'story',
  add constraint published_previews_content_type_valid check (content_type in ('story', 'clarification'));

create table private.clarification_settings (
  singleton boolean primary key default true check (singleton),
  publication_enabled boolean not null default false,
  updated_at timestamptz not null default pg_catalog.clock_timestamp()
);
insert into private.clarification_settings(singleton, publication_enabled) values (true, false);
alter table private.clarification_settings enable row level security;
revoke all on table private.clarification_settings from public, anon, authenticated, service_role;

create table private.post_relationships (
  clarification_post_id uuid primary key references private.posts(id) on delete restrict,
  referenced_post_id uuid not null unique references private.posts(id) on delete restrict,
  relationship_type text not null default 'clarifies' check (relationship_type = 'clarifies'),
  created_by uuid not null references auth.users(id) on delete restrict,
  created_at timestamptz not null default pg_catalog.clock_timestamp(),
  unique (clarification_post_id, referenced_post_id)
);
create index post_relationships_referenced_idx on private.post_relationships(referenced_post_id);
alter table private.post_relationships enable row level security;
revoke all on table private.post_relationships from public, anon, authenticated, service_role;

create table private.clarification_audit_events (
  event_id bigint generated always as identity primary key,
  clarification_post_id uuid references private.posts(id) on delete restrict,
  referenced_post_id uuid references private.posts(id) on delete restrict,
  actor_user_id uuid references auth.users(id) on delete set null,
  event_type text not null check (event_type in ('created','revised','published','rebound','hidden','restored','removal_proposed','removal_resolved','publication_gate_changed')),
  reason text not null check (pg_catalog.char_length(pg_catalog.btrim(reason)) between 1 and 500),
  before_state jsonb,
  after_state jsonb,
  occurred_at timestamptz not null default pg_catalog.clock_timestamp()
);
create index clarification_audit_post_idx on private.clarification_audit_events(clarification_post_id, occurred_at desc);
alter table private.clarification_audit_events enable row level security;
revoke all on table private.clarification_audit_events from public, anon, authenticated, service_role;

create table private.clarification_removal_proposals (
  proposal_id bigint generated always as identity primary key,
  clarification_post_id uuid not null references private.posts(id) on delete restrict,
  proposed_by uuid not null references auth.users(id) on delete restrict,
  proposal_reason text not null check (pg_catalog.char_length(pg_catalog.btrim(proposal_reason)) between 1 and 500),
  proposed_at timestamptz not null default pg_catalog.clock_timestamp(),
  decision text check (decision in ('approved','rejected')),
  decided_by uuid references auth.users(id) on delete restrict,
  decision_reason text,
  decided_at timestamptz,
  constraint clarification_removal_decision_consistent check (
    (decision is null and decided_by is null and decision_reason is null and decided_at is null)
    or (decision is not null and decided_by is not null and pg_catalog.char_length(pg_catalog.btrim(coalesce(decision_reason,''))) between 1 and 500 and decided_at is not null)
  )
);
alter table private.clarification_removal_proposals enable row level security;
revoke all on table private.clarification_removal_proposals from public, anon, authenticated, service_role;

create function private.reject_clarification_audit_mutation()
returns trigger language plpgsql set search_path = '' as $function$
begin raise exception 'clarification audit data is append-only' using errcode='42501'; end;
$function$;
revoke all on function private.reject_clarification_audit_mutation() from public, anon, authenticated, service_role;
create trigger clarification_audit_append_only before update or delete on private.clarification_audit_events for each row execute function private.reject_clarification_audit_mutation();
create trigger clarification_audit_no_truncate before truncate on private.clarification_audit_events for each statement execute function private.reject_clarification_audit_mutation();
create trigger clarification_proposal_no_delete before delete or truncate on private.clarification_removal_proposals for each statement execute function private.reject_clarification_audit_mutation();

create function public.owner_set_clarification_publication(p_enabled boolean,p_reason text)
returns boolean language plpgsql volatile security definer set search_path = '' as $function$
declare v_actor uuid:=(select auth.uid()); v_old boolean; v_reason text:=pg_catalog.btrim(coalesce(p_reason,'')); v_now timestamptz;
begin
  if v_actor is null or p_enabled is null or not private.has_staff_role('owner') or not private.has_recent_totp() or pg_catalog.char_length(v_reason) not between 1 and 500 then return false; end if;
  select s.publication_enabled into v_old from private.clarification_settings s where s.singleton for update;
  if not found or not private.has_staff_role('owner') or not private.has_recent_totp() then return false; end if;
  if v_old=p_enabled then return true; end if;
  v_now:=pg_catalog.clock_timestamp();
  update private.clarification_settings set publication_enabled=p_enabled,updated_at=v_now where singleton;
  insert into private.clarification_audit_events(actor_user_id,event_type,reason,before_state,after_state,occurred_at)
  values(v_actor,'publication_gate_changed',v_reason,pg_catalog.jsonb_build_object('publication_enabled',v_old),pg_catalog.jsonb_build_object('publication_enabled',p_enabled),v_now);
  return true;
end;
$function$;
revoke all on function public.owner_set_clarification_publication(boolean,text) from public,anon,authenticated,service_role;
grant execute on function public.owner_set_clarification_publication(boolean,text) to authenticated;

create function private.guard_post_relationship()
returns trigger language plpgsql security definer set search_path = '' as $function$
begin
  if new.relationship_type <> 'clarifies'
    or not exists(select 1 from private.posts p where p.id=new.clarification_post_id and p.post_type='clarification')
    or not exists(select 1 from private.posts p where p.id=new.referenced_post_id and p.post_type='story') then
    raise exception 'invalid clarification relationship' using errcode='23514';
  end if;
  if tg_op='UPDATE' and current_setting('mmwr.clarification_rebind',true) is distinct from 'on' and (old.clarification_post_id is distinct from new.clarification_post_id or old.referenced_post_id is distinct from new.referenced_post_id or old.relationship_type is distinct from new.relationship_type or old.created_by is distinct from new.created_by or old.created_at is distinct from new.created_at) then
    raise exception 'relationship changes require the Owner RPC' using errcode='42501';
  end if;
  return new;
end;
$function$;
revoke all on function private.guard_post_relationship() from public, anon, authenticated, service_role;
create trigger post_relationships_guard before insert or update on private.post_relationships for each row execute function private.guard_post_relationship();
create trigger post_relationships_no_delete before delete or truncate on private.post_relationships for each statement execute function private.reject_clarification_audit_mutation();

create function private.allow_clarification_rebind()
returns trigger language plpgsql set search_path = '' as $function$
begin
  if current_setting('mmwr.clarification_rebind',true) is distinct from 'on'
    and (old.clarification_post_id is distinct from new.clarification_post_id or old.referenced_post_id is distinct from new.referenced_post_id or old.relationship_type is distinct from new.relationship_type or old.created_by is distinct from new.created_by or old.created_at is distinct from new.created_at) then
    raise exception 'relationship changes require the Owner RPC' using errcode='42501';
  end if;
  return new;
end;
$function$;
revoke all on function private.allow_clarification_rebind() from public,anon,authenticated,service_role;
drop trigger post_relationships_guard on private.post_relationships;
create trigger post_relationships_guard before insert or update on private.post_relationships for each row execute function private.guard_post_relationship();
create trigger post_relationships_rebind_guard before update on private.post_relationships for each row execute function private.allow_clarification_rebind();

-- Keep projection type synchronized even when legacy publication RPCs rebuild it.
create function private.set_public_preview_content_type()
returns trigger language plpgsql security definer set search_path = '' as $function$
begin
  select p.post_type into new.content_type from private.posts p where p.id=new.post_id;
  if new.content_type is null then raise exception 'post missing' using errcode='23503'; end if;
  if new.content_type='clarification' and exists(
    select 1 from private.post_relationships r join private.posts son on son.id=r.referenced_post_id
    left join private.areas son_area on son_area.id=son.area_id and son_area.is_active
    where r.clarification_post_id=new.post_id and (son.status<>'published' or son_area.id is null)
  ) then
    new.approved_title:='Clarification';
    new.primary_name:='Clarification';
    new.public_excerpt:='The related post is temporarily unavailable.';
    new.public_area_name:='Location withheld';
    new.public_tag_ids:='{}'::uuid[];
    new.public_tag_labels:='{}'::text[];
  end if;
  return new;
end;
$function$;
revoke all on function private.set_public_preview_content_type() from public, anon, authenticated, service_role;
create trigger published_preview_content_type before insert or update on public.published_previews for each row execute function private.set_public_preview_content_type();

create function private.refresh_linked_clarification_projection()
returns trigger language plpgsql security definer set search_path = '' as $function$
declare v_mother uuid;
begin
  if old.status is distinct from new.status and new.post_type='story' then
    select r.clarification_post_id into v_mother from private.post_relationships r where r.referenced_post_id=new.id;
    if v_mother is not null then perform private.sync_public_post_projection(v_mother); end if;
  end if;
  return new;
end;
$function$;
revoke all on function private.refresh_linked_clarification_projection() from public,anon,authenticated,service_role;
create trigger posts_refresh_linked_clarification after update of status on private.posts for each row execute function private.refresh_linked_clarification_projection();

create function private.refresh_linked_clarification_for_area()
returns trigger language plpgsql security definer set search_path = '' as $function$
declare v_mother uuid;
begin
  if old.is_active is distinct from new.is_active then
    for v_mother in select r.clarification_post_id from private.post_relationships r join private.posts son on son.id=r.referenced_post_id where son.area_id=new.id loop
      perform private.sync_public_post_projection(v_mother);
    end loop;
  end if;
  return new;
end;
$function$;
revoke all on function private.refresh_linked_clarification_for_area() from public,anon,authenticated,service_role;
create trigger areas_refresh_linked_clarification after update of is_active on private.areas for each row execute function private.refresh_linked_clarification_for_area();

-- If an Owner leaves a clarification public while hiding its related story,
-- do not expose the clarification's authored copy or tags as a way to recover
-- details that are no longer public. Restoring the story refreshes its normal
-- public projection again.
create or replace function public.read_published_post_body(p_post_id uuid)
returns text language sql stable security definer set search_path = '' as $function$
  select case
    when post.post_type='clarification' and exists(
      select 1 from private.post_relationships r
      join private.posts son on son.id=r.referenced_post_id
      left join private.areas son_area on son_area.id=son.area_id and son_area.is_active
      where r.clarification_post_id=post.id and (son.status<>'published' or son_area.id is null)
    ) then 'The related post is temporarily unavailable.'
    else post.full_body
  end
  from private.posts post
  join private.areas area on area.id=post.area_id and area.is_active
  join public.published_previews preview on preview.post_id=post.id
  join public.profiles profile on profile.id=(select auth.uid())
  where post.id=p_post_id and post.status='published'
    and profile.account_state in ('active','suspended')
  limit 1
$function$;
revoke all on function public.read_published_post_body(uuid) from public,anon,authenticated,service_role;
grant execute on function public.read_published_post_body(uuid) to authenticated;

create function private.guard_clarification_publication()
returns trigger language plpgsql security definer set search_path = '' as $function$
declare v_restore boolean:=tg_op='UPDATE' and old.status='temporarily_hidden' and old.published_at is not null;
begin
  if new.post_type='clarification' and new.status='published' and ((not v_restore and not exists (
    select 1 from private.clarification_settings s where s.singleton and s.publication_enabled
  )) or not exists(select 1 from private.post_relationships r join private.posts son on son.id=r.referenced_post_id join private.areas son_area on son_area.id=son.area_id and son_area.is_active join public.published_previews preview on preview.post_id=son.id where r.clarification_post_id=new.id and son.post_type='story' and son.status='published' and preview.content_type='story')) then
    raise exception 'clarification publication is disabled or its linked story is unavailable' using errcode='55000'; end if;
  if tg_op='UPDATE' and old.post_type='clarification' and (new.post_type is distinct from old.post_type or new.area_id is distinct from old.area_id) then
    raise exception 'clarification identity and region are immutable' using errcode='42501';
  end if;
  return new;
end;
$function$;
revoke all on function private.guard_clarification_publication() from public, anon, authenticated, service_role;
create trigger posts_guard_clarification before insert or update of status, post_type, area_id on private.posts for each row execute function private.guard_clarification_publication();

create function public.staff_find_clarification_sons(p_query text, p_limit integer default 20)
returns table(post_id uuid, approved_title text, primary_name text, area_id uuid, public_area_name text, first_published_at timestamptz, status text)
language sql stable security definer set search_path = '' as $function$
  select p.post_id,p.approved_title,p.primary_name,p.public_area_id,p.public_area_name,p.first_published_at,'published'::text
  from public.published_previews p join private.posts story on story.id=p.post_id and story.status='published' and story.post_type='story'
  join private.areas area on area.id=story.area_id and area.is_active
  where p.content_type='story' and pg_catalog.char_length(pg_catalog.btrim(coalesce(p_query,''))) between 2 and 120
    and (pg_catalog.strpos(pg_catalog.lower(p.approved_title),pg_catalog.lower(pg_catalog.btrim(p_query)))>0
      or pg_catalog.strpos(pg_catalog.lower(p.primary_name),pg_catalog.lower(pg_catalog.btrim(p_query)))>0
      or pg_catalog.strpos(pg_catalog.lower(p.public_area_name),pg_catalog.lower(pg_catalog.btrim(p_query)))>0)
    and (private.has_staff_role('admin') or private.has_staff_role('owner'))
  order by p.last_listed_at desc,p.post_id limit least(greatest(coalesce(p_limit,20),1),20)
$function$;
revoke all on function public.staff_find_clarification_sons(text,integer) from public, anon, authenticated, service_role;
grant execute on function public.staff_find_clarification_sons(text,integer) to authenticated;

create function public.staff_create_clarification(p_referenced_post_id uuid,p_title text,p_public_excerpt text,p_full_body text,p_tag_ids uuid[],p_reason text)
returns uuid language plpgsql volatile security definer set search_path = '' as $function$
declare v_actor uuid:=(select auth.uid()); v_son private.posts%rowtype; v_id uuid; v_now timestamptz; v_reason text:=pg_catalog.btrim(coalesce(p_reason,''));
begin
  if v_actor is null or not (private.has_staff_role('admin') or private.has_staff_role('owner')) or not private.has_recent_totp()
    or pg_catalog.char_length(v_reason) not between 1 and 500 or pg_catalog.char_length(pg_catalog.btrim(coalesce(p_title,''))) not between 1 and 200
    or pg_catalog.char_length(pg_catalog.btrim(coalesce(p_public_excerpt,''))) not between 1 and 200 or pg_catalog.char_length(pg_catalog.btrim(coalesce(p_full_body,''))) not between 1 and 20000
    or coalesce(pg_catalog.cardinality(p_tag_ids),0)>20 then return null; end if;
  select s.* into v_son from private.posts s join private.areas area on area.id=s.area_id and area.is_active join public.published_previews p on p.post_id=s.id and p.content_type='story'
  where s.id=p_referenced_post_id and s.post_type='story' and s.status='published' for update of s;
  if not found or exists(select 1 from private.post_relationships r where r.referenced_post_id=p_referenced_post_id) then return null; end if;
  if not private.has_recent_totp() or not (private.has_staff_role('admin') or private.has_staff_role('owner')) then return null; end if;
  perform tag_row.id from private.tags tag_row
  where tag_row.id in (select distinct requested.tag_id from pg_catalog.unnest(coalesce(p_tag_ids,'{}'::uuid[])) requested(tag_id))
    and tag_row.is_active
  order by tag_row.id for share of tag_row;
  if not private.has_recent_totp() or not (private.has_staff_role('admin') or private.has_staff_role('owner')) then return null; end if;
  v_now:=pg_catalog.clock_timestamp();
  insert into private.posts(area_id,approved_title,primary_name,public_excerpt,full_body,risk_level,status,post_type,created_at,updated_at)
  values(v_son.area_id,pg_catalog.btrim(p_title),v_son.primary_name,pg_catalog.btrim(p_public_excerpt),pg_catalog.btrim(p_full_body),'ordinary','draft','clarification',v_now,v_now) returning id into v_id;
  insert into private.post_relationships(clarification_post_id,referenced_post_id,created_by,created_at) values(v_id,p_referenced_post_id,v_actor,v_now);
  insert into private.post_tags(post_id,tag_id) select v_id,t.tag_id from (select distinct x as tag_id from pg_catalog.unnest(coalesce(p_tag_ids,'{}'::uuid[])) x) t join private.tags tag_row on tag_row.id=t.tag_id and tag_row.is_active;
  if (select pg_catalog.count(*) from private.post_tags pt where pt.post_id=v_id)<>coalesce(pg_catalog.cardinality(p_tag_ids),0) then raise exception 'invalid clarification tags' using errcode='22023'; end if;
  insert into private.clarification_audit_events(clarification_post_id,referenced_post_id,actor_user_id,event_type,reason,after_state,occurred_at)
  values(v_id,p_referenced_post_id,v_actor,'created',v_reason,pg_catalog.jsonb_build_object('title',pg_catalog.btrim(p_title),'status','draft'),v_now);
  return v_id;
end;
$function$;
revoke all on function public.staff_create_clarification(uuid,text,text,text,uuid[],text) from public,anon,authenticated,service_role;
grant execute on function public.staff_create_clarification(uuid,text,text,text,uuid[],text) to authenticated;

create function public.staff_update_clarification(p_clarification_post_id uuid,p_expected_updated_at timestamptz,p_title text,p_public_excerpt text,p_full_body text,p_tag_ids uuid[],p_reason text)
returns boolean language plpgsql volatile security definer set search_path = '' as $function$
declare v_actor uuid:=(select auth.uid()); v_post private.posts%rowtype; v_son uuid; v_old_tag_ids uuid[]; v_new_tag_ids uuid[]; v_before jsonb; v_after jsonb; v_now timestamptz; v_reason text:=pg_catalog.btrim(coalesce(p_reason,''));
begin
  if v_actor is null or not (private.has_staff_role('admin') or private.has_staff_role('owner')) or not private.has_recent_totp()
    or pg_catalog.char_length(v_reason) not between 1 and 500 or pg_catalog.char_length(pg_catalog.btrim(coalesce(p_title,''))) not between 1 and 200
    or pg_catalog.char_length(pg_catalog.btrim(coalesce(p_public_excerpt,''))) not between 1 and 200 or pg_catalog.char_length(pg_catalog.btrim(coalesce(p_full_body,''))) not between 1 and 20000
    or coalesce(pg_catalog.cardinality(p_tag_ids),0)>20 then return false; end if;
  select p.* into v_post from private.posts p where p.id=p_clarification_post_id and p.post_type='clarification' and p.status in ('draft','approved','published') for update;
  if not found or v_post.updated_at is distinct from p_expected_updated_at then return false; end if;
  select r.referenced_post_id into v_son from private.post_relationships r where r.clarification_post_id=v_post.id for update;
  if not found or not private.has_recent_totp() or not (private.has_staff_role('admin') or private.has_staff_role('owner')) then return false; end if;
  perform tag_row.id from private.tags tag_row
  where tag_row.id in (select distinct requested.tag_id from pg_catalog.unnest(coalesce(p_tag_ids,'{}'::uuid[])) requested(tag_id))
    and tag_row.is_active
  order by tag_row.id for share of tag_row;
  if exists(select 1 from pg_catalog.unnest(coalesce(p_tag_ids,'{}'::uuid[])) t(id) left join private.tags tag on tag.id=t.id and tag.is_active where tag.id is null)
    or (select pg_catalog.count(*) from (select distinct unnest(coalesce(p_tag_ids,'{}'::uuid[])) id) x)<>coalesce(pg_catalog.cardinality(p_tag_ids),0) then return false; end if;
  select coalesce(pg_catalog.array_agg(distinct t.id order by t.id),'{}'::uuid[]) into v_new_tag_ids
  from pg_catalog.unnest(coalesce(p_tag_ids,'{}'::uuid[])) t(id);
  select coalesce(pg_catalog.array_agg(pt.tag_id order by pt.tag_id),'{}'::uuid[]) into v_old_tag_ids from private.post_tags pt where pt.post_id=v_post.id;
  v_before:=pg_catalog.jsonb_build_object('approved_title',v_post.approved_title,'public_excerpt',v_post.public_excerpt,'full_body',v_post.full_body,'tag_ids',v_old_tag_ids);
  v_after:=pg_catalog.jsonb_build_object('approved_title',pg_catalog.btrim(p_title),'public_excerpt',pg_catalog.btrim(p_public_excerpt),'full_body',pg_catalog.btrim(p_full_body),'tag_ids',v_new_tag_ids);
  if v_before=v_after then return false; end if;
  if not private.has_recent_totp() or not (private.has_staff_role('admin') or private.has_staff_role('owner')) then return false; end if;
  v_now:=pg_catalog.clock_timestamp();
  update private.posts set approved_title=pg_catalog.btrim(p_title),public_excerpt=pg_catalog.btrim(p_public_excerpt),full_body=pg_catalog.btrim(p_full_body),updated_at=v_now where id=v_post.id;
  delete from private.post_tags where post_id=v_post.id;
  insert into private.post_tags(post_id,tag_id) select v_post.id,t.id from pg_catalog.unnest(v_new_tag_ids) t(id);
  insert into private.post_revision_events(post_id,actor_user_id,reason,before_value,after_value)
  values(v_post.id,v_actor,v_reason,v_before,v_after);
  insert into private.clarification_audit_events(clarification_post_id,referenced_post_id,actor_user_id,event_type,reason,before_state,after_state,occurred_at)
  values(v_post.id,v_son,v_actor,'revised',v_reason,pg_catalog.jsonb_build_object('title',v_post.approved_title,'excerpt',v_post.public_excerpt,'status',v_post.status),pg_catalog.jsonb_build_object('title',pg_catalog.btrim(p_title),'excerpt',pg_catalog.btrim(p_public_excerpt),'status',v_post.status),v_now);
  return true;
end;
$function$;
revoke all on function public.staff_update_clarification(uuid,timestamptz,text,text,text,uuid[],text) from public,anon,authenticated,service_role;
grant execute on function public.staff_update_clarification(uuid,timestamptz,text,text,text,uuid[],text) to authenticated;

create function public.staff_publish_clarification(p_clarification_post_id uuid,p_expected_updated_at timestamptz,p_reason text)
returns boolean language plpgsql volatile security definer set search_path = '' as $function$
declare v_post private.posts%rowtype; v_rel private.post_relationships%rowtype; v_enabled boolean; v_actor uuid:=(select auth.uid()); v_now timestamptz; v_reason text:=pg_catalog.btrim(coalesce(p_reason,''));
begin
  if v_actor is null or not (private.has_staff_role('admin') or private.has_staff_role('owner')) or not private.has_recent_totp() or pg_catalog.char_length(v_reason) not between 1 and 500 then return false; end if;
  select p.* into v_post from private.posts p where p.id=p_clarification_post_id and p.post_type='clarification' for update;
  if not found or v_post.status not in ('draft','approved') or v_post.updated_at is distinct from p_expected_updated_at then return false; end if;
  select r.* into v_rel from private.post_relationships r where r.clarification_post_id=v_post.id;
  if not found or not exists(select 1 from private.posts s join private.areas area on area.id=s.area_id and area.is_active join public.published_previews pp on pp.post_id=s.id where s.id=v_rel.referenced_post_id and s.post_type='story' and s.status='published' and pp.content_type='story') then return false; end if;
  select s.publication_enabled into v_enabled from private.clarification_settings s where s.singleton for share;
  if not found or not v_enabled then return false; end if;
  if not private.has_recent_totp() or not (private.has_staff_role('admin') or private.has_staff_role('owner')) then return false; end if;
  v_now:=pg_catalog.clock_timestamp();
  update private.posts set status='published',published_at=coalesce(published_at,v_now),last_published_at=v_now,updated_at=v_now where id=v_post.id;
  insert into private.clarification_audit_events(clarification_post_id,referenced_post_id,actor_user_id,event_type,reason,before_state,after_state,occurred_at)
  values(v_post.id,v_rel.referenced_post_id,v_actor,'published',v_reason,pg_catalog.jsonb_build_object('status',v_post.status),pg_catalog.jsonb_build_object('status','published'),v_now);
  return true;
end;
$function$;
revoke all on function public.staff_publish_clarification(uuid,timestamptz,text) from public,anon,authenticated,service_role;
grant execute on function public.staff_publish_clarification(uuid,timestamptz,text) to authenticated;

create function public.staff_clarification_draft_version(p_clarification_post_id uuid)
returns timestamptz language sql stable security definer set search_path = '' as $function$
  select p.updated_at from private.posts p where p.id=p_clarification_post_id and p.post_type='clarification' and p.status in ('draft','approved','published') and (private.has_staff_role('admin') or private.has_staff_role('owner'))
$function$;
revoke all on function public.staff_clarification_draft_version(uuid) from public,anon,authenticated,service_role;
grant execute on function public.staff_clarification_draft_version(uuid) to authenticated;

create function public.staff_clarification_feature_state()
returns boolean language sql stable security definer set search_path = '' as $function$
  select s.publication_enabled from private.clarification_settings s where s.singleton and (private.has_staff_role('admin') or private.has_staff_role('owner'))
$function$;
revoke all on function public.staff_clarification_feature_state() from public,anon,authenticated,service_role;
grant execute on function public.staff_clarification_feature_state() to authenticated;

create function public.staff_list_clarifications(p_query text default null)
returns table(clarification_post_id uuid,approved_title text,primary_name text,area_name text,status text,referenced_post_id uuid,updated_at timestamptz)
language sql stable security definer set search_path = '' as $function$
  select m.id,m.approved_title,m.primary_name,a.area_name,m.status,r.referenced_post_id,m.updated_at
  from private.posts m join private.areas a on a.id=m.area_id left join private.post_relationships r on r.clarification_post_id=m.id
  where m.post_type='clarification' and (private.has_staff_role('admin') or private.has_staff_role('owner'))
    and (nullif(pg_catalog.btrim(coalesce(p_query,'')),'') is null or pg_catalog.char_length(pg_catalog.btrim(p_query)) between 2 and 120)
    and (nullif(pg_catalog.btrim(coalesce(p_query,'')),'') is null or pg_catalog.strpos(pg_catalog.lower(m.approved_title),pg_catalog.lower(pg_catalog.btrim(p_query)))>0 or pg_catalog.strpos(pg_catalog.lower(m.primary_name),pg_catalog.lower(pg_catalog.btrim(p_query)))>0)
  order by m.updated_at desc,m.id limit 100
$function$;
revoke all on function public.staff_list_clarifications(text) from public,anon,authenticated,service_role;
grant execute on function public.staff_list_clarifications(text) to authenticated;

create function public.staff_clarification_edit_data(p_clarification_post_id uuid)
returns table(public_excerpt text,full_body text,tag_ids uuid[])
language sql stable security definer set search_path = '' as $function$
  select m.public_excerpt,m.full_body,coalesce(array(select pt.tag_id from private.post_tags pt where pt.post_id=m.id order by pt.tag_id),'{}'::uuid[])
  from private.posts m where m.id=p_clarification_post_id and m.post_type='clarification' and (private.has_staff_role('admin') or private.has_staff_role('owner'))
$function$;
revoke all on function public.staff_clarification_edit_data(uuid) from public,anon,authenticated,service_role;
grant execute on function public.staff_clarification_edit_data(uuid) to authenticated;

create function public.staff_clarification_audit(p_clarification_post_id uuid)
returns table(event_id bigint,event_type text,reason text,before_state jsonb,after_state jsonb,occurred_at timestamptz)
language sql stable security definer set search_path = '' as $function$
  select a.event_id,a.event_type,a.reason,a.before_state,a.after_state,a.occurred_at from private.clarification_audit_events a
  where (p_clarification_post_id is not null and a.clarification_post_id=p_clarification_post_id and (private.has_staff_role('admin') or private.has_staff_role('owner')))
    or (p_clarification_post_id is null and a.clarification_post_id is null and private.has_staff_role('owner'))
  order by a.occurred_at desc,a.event_id desc limit 100
$function$;
revoke all on function public.staff_clarification_audit(uuid) from public,anon,authenticated,service_role;
grant execute on function public.staff_clarification_audit(uuid) to authenticated;

create function public.public_clarification_for_story(p_son_post_id uuid)
returns table(clarification_post_id uuid) language sql stable security definer set search_path = '' as $function$
  select r.clarification_post_id from private.post_relationships r join private.posts m on m.id=r.clarification_post_id and m.post_type='clarification' and m.status='published'
  join private.posts son on son.id=r.referenced_post_id and son.status='published' and son.post_type='story'
  join private.areas area on area.id=son.area_id and area.is_active
  where r.referenced_post_id=p_son_post_id
$function$;
revoke all on function public.public_clarification_for_story(uuid) from public,anon,authenticated,service_role;
grant execute on function public.public_clarification_for_story(uuid) to anon,authenticated;

create function public.public_referenced_story_for_clarification(p_clarification_post_id uuid)
returns table(post_id uuid,approved_title text,primary_name text,public_area_name text,first_published_at timestamptz,thumbnail_available boolean)
language sql stable security definer set search_path = '' as $function$
  select p.post_id,p.approved_title,p.primary_name,p.public_area_name,p.first_published_at,p.thumbnail_available
  from private.post_relationships r join private.posts m on m.id=r.clarification_post_id and m.post_type='clarification' and m.status='published'
  join public.published_previews p on p.post_id=r.referenced_post_id and p.content_type='story'
  join private.posts s on s.id=p.post_id and s.status='published' and s.post_type='story'
  join private.areas area on area.id=s.area_id and area.is_active
  where r.clarification_post_id=p_clarification_post_id
$function$;
revoke all on function public.public_referenced_story_for_clarification(uuid) from public,anon,authenticated,service_role;
grant execute on function public.public_referenced_story_for_clarification(uuid) to anon,authenticated;

create function public.public_story_for_clarification_request(p_post_id uuid)
returns table(post_id uuid,approved_title text,primary_name text,public_area_name text,first_published_at timestamptz,thumbnail_available boolean,content_type text)
language sql stable security definer set search_path = '' as $function$
  select p.post_id,p.approved_title,p.primary_name,p.public_area_name,p.first_published_at,p.thumbnail_available,p.content_type
  from public.published_previews p join private.posts story on story.id=p.post_id and story.status='published' and story.post_type='story'
  join private.areas area on area.id=story.area_id and area.is_active
  where p.post_id=p_post_id and p.content_type='story'
$function$;
revoke all on function public.public_story_for_clarification_request(uuid) from public,anon,authenticated,service_role;
grant execute on function public.public_story_for_clarification_request(uuid) to anon,authenticated;

create function public.public_clarification_directory(p_limit integer default 13,p_offset integer default 0)
returns table(
  post_id uuid,approved_title text,primary_name text,public_excerpt text,last_listed_at timestamptz,
  public_tag_labels text[],public_area_name text,content_type text,
  son_post_id uuid,son_title text,son_primary_name text,son_area_name text,son_first_published_at timestamptz,son_thumbnail_available boolean
)
language sql stable security definer set search_path = '' as $function$
  select mother.post_id,mother.approved_title,mother.primary_name,mother.public_excerpt,mother.last_listed_at,
    mother.public_tag_labels,mother.public_area_name,mother.content_type,
    son_preview.post_id,son_preview.approved_title,son_preview.primary_name,
    son_preview.public_area_name,son_preview.first_published_at,coalesce(son_preview.thumbnail_available,false)
  from public.published_previews mother
  join private.posts mother_post on mother_post.id=mother.post_id and mother_post.status='published' and mother_post.post_type='clarification'
  left join private.post_relationships relation on relation.clarification_post_id=mother.post_id
  left join private.posts son on son.id=relation.referenced_post_id and son.post_type='story' and son.status='published'
  left join private.areas son_area on son_area.id=son.area_id and son_area.is_active
  left join public.published_previews son_preview on son_preview.post_id=son.id and son_preview.content_type='story' and son_area.id is not null
  where mother.content_type='clarification'
  order by mother.last_listed_at desc,mother.post_id
  limit least(greatest(coalesce(p_limit,13),1),13) offset least(greatest(coalesce(p_offset,0),0),1000000)
$function$;
revoke all on function public.public_clarification_directory(integer,integer) from public,anon,authenticated,service_role;
grant execute on function public.public_clarification_directory(integer,integer) to anon,authenticated;

create function public.owner_hide_story_with_clarification_decision(p_son_post_id uuid,p_keep_mother_public boolean,p_reason text)
returns boolean language plpgsql volatile security definer set search_path = '' as $function$
declare v_actor uuid:=(select auth.uid()); v_son private.posts%rowtype; v_mother private.posts%rowtype; v_rel private.post_relationships%rowtype; v_mother_id uuid; v_reason text:=pg_catalog.btrim(coalesce(p_reason,'')); v_now timestamptz;
begin
  if v_actor is null or p_keep_mother_public is null or not private.has_staff_role('owner') or not private.has_recent_totp() or pg_catalog.char_length(v_reason) not between 1 and 500 then return false; end if;
  select s.* into v_son from private.posts s where s.id=p_son_post_id for update;
  if not found then return false; end if;
  if v_son.post_type='clarification' then
    if not private.has_recent_totp() or not private.has_staff_role('owner') or v_son.status<>'published' then return false; end if;
    select r.* into v_rel from private.post_relationships r where r.clarification_post_id=v_son.id for update;
    if not found or not private.has_recent_totp() or not private.has_staff_role('owner') then return false; end if;
    v_now:=pg_catalog.clock_timestamp();
    update private.posts set status='temporarily_hidden',updated_at=v_now where id=v_son.id;
    insert into private.moderation_events(actor_user_id,post_id,action,reason,prior_state,next_state,risk_level,occurred_at) values(v_actor,v_son.id,'hide',v_reason,v_son.status,'temporarily_hidden',v_son.risk_level,v_now);
    insert into private.clarification_audit_events(clarification_post_id,referenced_post_id,actor_user_id,event_type,reason,before_state,after_state,occurred_at)
    values(v_son.id,v_rel.referenced_post_id,v_actor,'hidden',v_reason,pg_catalog.jsonb_build_object('mother',v_son.status),pg_catalog.jsonb_build_object('mother','temporarily_hidden'),v_now);
    return true;
  end if;
  if v_son.post_type<>'story' then return false; end if;
  select r.clarification_post_id into v_mother_id from private.post_relationships r where r.referenced_post_id=p_son_post_id;
  if found then
    select m.* into v_mother from private.posts m where m.id=v_mother_id for update;
    if not found then return false; end if;
    select r.* into v_rel from private.post_relationships r where r.clarification_post_id=v_mother_id and r.referenced_post_id=p_son_post_id for update;
    if not found then return false; end if;
  end if;
  if not private.has_recent_totp() or not private.has_staff_role('owner') or v_son.status<>'published' then return false; end if;
  v_now:=pg_catalog.clock_timestamp();
  update private.posts set status='temporarily_hidden',updated_at=v_now where id=v_son.id;
  insert into private.moderation_events(actor_user_id,post_id,action,reason,prior_state,next_state,risk_level,occurred_at) values(v_actor,v_son.id,'hide',v_reason,v_son.status,'temporarily_hidden',v_son.risk_level,v_now);
  if v_rel.clarification_post_id is not null then
    if not p_keep_mother_public and v_mother.status='published' then update private.posts set status='temporarily_hidden',updated_at=v_now where id=v_mother.id; end if;
    insert into private.clarification_audit_events(clarification_post_id,referenced_post_id,actor_user_id,event_type,reason,before_state,after_state,occurred_at)
    values(v_mother.id,v_son.id,v_actor,'hidden',v_reason,pg_catalog.jsonb_build_object('son',v_son.status,'mother',v_mother.status),pg_catalog.jsonb_build_object('son','temporarily_hidden','mother',case when not p_keep_mother_public and v_mother.status='published' then 'temporarily_hidden' else v_mother.status end,'mother_public_metadata_suppressed',p_keep_mother_public),v_now);
  end if;
  return true;
end;
$function$;
revoke all on function public.owner_hide_story_with_clarification_decision(uuid,boolean,text) from public,anon,authenticated,service_role;
grant execute on function public.owner_hide_story_with_clarification_decision(uuid,boolean,text) to authenticated;

create function public.owner_rebind_clarification_son(p_clarification_post_id uuid,p_new_son_post_id uuid,p_reason text)
returns boolean language plpgsql volatile security definer set search_path = '' as $function$
declare v_actor uuid:=(select auth.uid()); v_old uuid; v_current uuid; v_reason text:=pg_catalog.btrim(coalesce(p_reason,'')); v_now timestamptz;
begin
  if v_actor is null or not private.has_staff_role('owner') or not private.has_recent_totp() or p_clarification_post_id=p_new_son_post_id or pg_catalog.char_length(v_reason) not between 1 and 500 then return false; end if;
  select r.referenced_post_id into v_old from private.post_relationships r where r.clarification_post_id=p_clarification_post_id;
  if not found then return false; end if;
  perform 1 from private.posts p where p.id in (v_old,p_new_son_post_id) order by p.id for update;
  if not found then return false; end if;
  perform 1 from private.posts p where p.id=p_clarification_post_id and p.post_type='clarification' and p.status in ('draft','approved','published') for update;
  if not found then return false; end if;
  select r.referenced_post_id into v_current from private.post_relationships r where r.clarification_post_id=p_clarification_post_id for update;
  if not found or v_current is distinct from v_old or not exists(select 1 from private.posts m where m.id=p_clarification_post_id and m.post_type='clarification' and m.status in ('draft','approved','published'))
    or not exists(select 1 from private.posts m join private.posts s on s.id=p_new_son_post_id and s.area_id=m.area_id join private.areas area on area.id=s.area_id and area.is_active join public.published_previews p on p.post_id=s.id where m.id=p_clarification_post_id and s.post_type='story' and s.status='published' and p.content_type='story')
    or exists(select 1 from private.post_relationships r where r.referenced_post_id=p_new_son_post_id and r.clarification_post_id<>p_clarification_post_id) or not private.has_recent_totp() or not private.has_staff_role('owner') then return false; end if;
  v_now:=pg_catalog.clock_timestamp();
  perform pg_catalog.set_config('mmwr.clarification_rebind','on',true);
  update private.post_relationships set referenced_post_id=p_new_son_post_id where clarification_post_id=p_clarification_post_id;
  perform pg_catalog.set_config('mmwr.clarification_rebind','off',true);
  perform private.sync_public_post_projection(p_clarification_post_id);
  insert into private.clarification_audit_events(clarification_post_id,referenced_post_id,actor_user_id,event_type,reason,before_state,after_state,occurred_at)
  values(p_clarification_post_id,p_new_son_post_id,v_actor,'rebound',v_reason,pg_catalog.jsonb_build_object('referenced_post_id',v_old),pg_catalog.jsonb_build_object('referenced_post_id',p_new_son_post_id),v_now);
  return true;
end;
$function$;
revoke all on function public.owner_rebind_clarification_son(uuid,uuid,text) from public,anon,authenticated,service_role;
grant execute on function public.owner_rebind_clarification_son(uuid,uuid,text) to authenticated;

create function public.staff_propose_clarification_removal(p_clarification_post_id uuid,p_reason text)
returns bigint language plpgsql volatile security definer set search_path = '' as $function$
declare v_actor uuid:=(select auth.uid()); v_reason text:=pg_catalog.btrim(coalesce(p_reason,'')); v_proposal bigint; v_son uuid; v_now timestamptz;
begin
  if v_actor is null or not private.has_staff_role('admin') or not private.has_recent_totp() or pg_catalog.char_length(v_reason) not between 1 and 500 then return null; end if;
  perform 1 from private.posts m where m.id=p_clarification_post_id and m.post_type='clarification' and m.status in ('published','temporarily_hidden') for update;
  if not found or not private.has_recent_totp() or not private.has_staff_role('admin') then return null; end if;
  select r.referenced_post_id into v_son from private.post_relationships r where r.clarification_post_id=p_clarification_post_id for update;
  if not found or not private.has_recent_totp() or not private.has_staff_role('admin') then return null; end if;
  v_now:=pg_catalog.clock_timestamp();
  insert into private.clarification_removal_proposals(clarification_post_id,proposed_by,proposal_reason,proposed_at) values(p_clarification_post_id,v_actor,v_reason,v_now) returning proposal_id into v_proposal;
  insert into private.clarification_audit_events(clarification_post_id,referenced_post_id,actor_user_id,event_type,reason,occurred_at) values(p_clarification_post_id,v_son,v_actor,'removal_proposed',v_reason,v_now);
  return v_proposal;
end;
$function$;
revoke all on function public.staff_propose_clarification_removal(uuid,text) from public,anon,authenticated,service_role;
grant execute on function public.staff_propose_clarification_removal(uuid,text) to authenticated;

create function public.owner_resolve_clarification_removal(p_proposal_id bigint,p_decision text,p_reason text)
returns boolean language plpgsql volatile security definer set search_path = '' as $function$
declare v_actor uuid:=(select auth.uid()); v_proposal private.clarification_removal_proposals%rowtype; v_reason text:=pg_catalog.btrim(coalesce(p_reason,'')); v_now timestamptz; v_son uuid;
begin
  if v_actor is null or not private.has_staff_role('owner') or not private.has_recent_totp() or p_decision is null or p_decision not in ('approved','rejected') or pg_catalog.char_length(v_reason) not between 1 and 500 then return false; end if;
  select p.* into v_proposal from private.clarification_removal_proposals p where p.proposal_id=p_proposal_id and p.decision is null for update;
  if not found then return false; end if;
  perform 1 from private.posts m where m.id=v_proposal.clarification_post_id and m.post_type='clarification' for update;
  if not found or not private.has_recent_totp() or not private.has_staff_role('owner') then return false; end if;
  select r.referenced_post_id into v_son from private.post_relationships r where r.clarification_post_id=v_proposal.clarification_post_id for update;
  if not found or not private.has_recent_totp() or not private.has_staff_role('owner') then return false; end if;
  v_now:=pg_catalog.clock_timestamp();
  update private.clarification_removal_proposals set decision=p_decision,decided_by=v_actor,decision_reason=v_reason,decided_at=v_now where proposal_id=p_proposal_id;
  if p_decision='approved' then update private.posts set status='permanently_removed',updated_at=v_now where id=v_proposal.clarification_post_id and status in ('published','temporarily_hidden'); end if;
  insert into private.clarification_audit_events(clarification_post_id,referenced_post_id,actor_user_id,event_type,reason,before_state,after_state,occurred_at)
  values(v_proposal.clarification_post_id,v_son,v_actor,'removal_resolved',v_reason,pg_catalog.jsonb_build_object('decision',null),pg_catalog.jsonb_build_object('decision',p_decision),v_now);
  return true;
end;
$function$;
revoke all on function public.owner_resolve_clarification_removal(bigint,text,text) from public,anon,authenticated,service_role;
grant execute on function public.owner_resolve_clarification_removal(bigint,text,text) to authenticated;

-- Existing general lifecycle UI/RPC cannot bypass the explicit Mother choice.
create or replace function private.owner_post_action(p_post_id uuid,p_action text,p_reason text)
returns boolean language plpgsql security definer set search_path = '' as $function$
declare v_post private.posts%rowtype; v_actor uuid:=(select auth.uid()); v_next_state text; v_now timestamptz;
begin
  if v_actor is null or p_post_id is null or p_reason is null or pg_catalog.btrim(p_reason)='' or pg_catalog.char_length(p_reason)>500 or p_action not in ('hide','restore','remove') or not private.has_staff_role('owner') or not private.has_recent_totp() then return false; end if;
  select p.* into v_post from private.posts p where p.id=p_post_id for update;
  if not found or not private.has_staff_role('owner') or not private.has_recent_totp() then return false; end if;
  if p_action='hide' and exists(select 1 from private.post_relationships r where r.referenced_post_id=v_post.id) then return false; end if;
  if p_action='hide' and v_post.status='published' then v_next_state:='temporarily_hidden';
  elsif p_action='restore' and v_post.status='temporarily_hidden' and exists(select 1 from private.areas a where a.id=v_post.area_id and a.is_active) then v_next_state:='published';
  elsif p_action='remove' and v_post.status in ('published','temporarily_hidden') then v_next_state:='permanently_removed'; else return false; end if;
  v_now:=pg_catalog.clock_timestamp();
  update private.posts set status=v_next_state,last_published_at=case when p_action='restore' then v_now else last_published_at end,updated_at=v_now where id=p_post_id;
  insert into private.moderation_events(actor_user_id,post_id,action,reason,prior_state,next_state,risk_level,occurred_at) values(v_actor,p_post_id,p_action,pg_catalog.btrim(p_reason),v_post.status,v_next_state,v_post.risk_level,v_now);
  return true;
end;
$function$;
revoke all on function private.owner_post_action(uuid,text,text) from public,anon,service_role;
grant execute on function private.owner_post_action(uuid,text,text) to authenticated;

-- Replace search result shape with a public type badge. Other story feeds are
-- explicitly kept story-only in the application layer and Hot RPC below.
drop function public.search_published_previews(text,integer,integer);
create function public.search_published_previews(p_query text,p_limit integer default 13,p_offset integer default 0,p_content_type text default null)
returns table(post_id uuid,approved_title text,primary_name text,public_excerpt text,last_listed_at timestamptz,public_tag_labels text[],public_area_name text,content_type text)
language sql stable security definer set search_path = '' as $function$
  with params as (select nullif(pg_catalog.lower(pg_catalog.btrim(pg_catalog.left(coalesce(p_query,''),120))),'') q,least(greatest(coalesce(p_limit,13),1),24) lim,greatest(coalesce(p_offset,0),0) off,case when p_content_type in ('story','clarification') then p_content_type else null end requested_type)
  select p.post_id,p.approved_title,p.primary_name,p.public_excerpt,p.last_listed_at,p.public_tag_labels,p.public_area_name,p.content_type
  from public.published_previews p cross join params x
  where pg_catalog.char_length(coalesce(x.q,''))>=2 and (x.requested_type is null or p.content_type=x.requested_type)
    and (x.requested_type is distinct from 'story' or exists(select 1 from private.posts story join private.areas area on area.id=story.area_id and area.is_active where story.id=p.post_id and story.status='published' and story.post_type='story')) and (
    pg_catalog.strpos(pg_catalog.lower(p.primary_name),x.q)>0 or pg_catalog.strpos(pg_catalog.lower(p.approved_title),x.q)>0 or pg_catalog.strpos(pg_catalog.lower(p.public_excerpt),x.q)>0 or pg_catalog.strpos(pg_catalog.lower(p.public_area_name),x.q)>0
    or exists(select 1 from pg_catalog.unnest(p.public_tag_labels) t(label) where pg_catalog.strpos(pg_catalog.lower(t.label),x.q)>0)
    or exists(select 1 from private.aliases a where a.post_id=p.post_id and a.state='approved' and pg_catalog.strpos(pg_catalog.lower(a.alias_text),x.q)>0)
  )
  order by case
    when pg_catalog.lower(p.primary_name)=x.q then 1
    when exists(select 1 from private.aliases a where a.post_id=p.post_id and a.state='approved' and pg_catalog.lower(a.alias_text)=x.q) then 2
    when pg_catalog.lower(p.approved_title)=x.q then 3
    when pg_catalog.lower(p.public_area_name)=x.q then 4
    when exists(select 1 from pg_catalog.unnest(p.public_tag_labels) t(label) where pg_catalog.lower(t.label)=x.q) then 5
    when pg_catalog.strpos(pg_catalog.lower(p.primary_name),x.q)>0 then 6
    when exists(select 1 from private.aliases a where a.post_id=p.post_id and a.state='approved' and pg_catalog.strpos(pg_catalog.lower(a.alias_text),x.q)>0) then 7
    when pg_catalog.strpos(pg_catalog.lower(p.approved_title),x.q)>0 then 8
    when pg_catalog.strpos(pg_catalog.lower(p.public_area_name),x.q)>0 then 9
    when exists(select 1 from pg_catalog.unnest(p.public_tag_labels) t(label) where pg_catalog.strpos(pg_catalog.lower(t.label),x.q)>0) then 10
    else 11 end,p.last_listed_at desc,p.post_id
  limit (select lim from params) offset (select off from params)
$function$;
revoke all on function public.search_published_previews(text,integer,integer,text) from public,anon,authenticated,service_role;
grant execute on function public.search_published_previews(text,integer,integer,text) to anon,authenticated;

create or replace function public.public_hot_ranked_posts(p_limit integer default 8)
returns table(post_id uuid,valid_reads_24h bigint,hot_score numeric)
language plpgsql volatile security definer set search_path = '' as $function$
declare v_now timestamptz:=pg_catalog.clock_timestamp(); v_minimum integer;
begin
  if p_limit is null or p_limit not between 1 and 8 then raise exception 'unsupported result limit'; end if;
  select s.minimum_reads_24h into v_minimum from private.analytics_valid_read_settings s where s.singleton and s.hot_enabled and s.collection_enabled;
  if not found then return; end if;
  return query with reads as (
    select h.post_id,pg_catalog.sum(h.valid_reads) filter(where h.read_hour>=v_now-interval '1 hour')::bigint reads_1h,pg_catalog.sum(h.valid_reads) filter(where h.read_hour>=v_now-interval '6 hours')::bigint reads_6h,pg_catalog.sum(h.valid_reads)::bigint reads_24h
    from private.analytics_valid_read_hourly h join private.posts p on p.id=h.post_id and p.status='published' and p.post_type='story'
    join private.areas a on a.id=p.area_id and a.is_active join public.published_previews pp on pp.post_id=p.id and pp.content_type='story'
    where h.read_hour>v_now-interval '24 hours' and h.read_hour<=v_now group by h.post_id having pg_catalog.sum(h.valid_reads)>=v_minimum
  ) select r.post_id,r.reads_24h,(3*coalesce(r.reads_1h,0)+2*coalesce(r.reads_6h,0)+r.reads_24h)::numeric from reads r join private.posts p on p.id=r.post_id and p.status='published' and p.post_type='story' order by 3 desc,p.last_published_at desc nulls last,r.post_id limit p_limit;
end;
$function$;
revoke all on function public.public_hot_ranked_posts(integer) from public,anon,authenticated,service_role;
grant execute on function public.public_hot_ranked_posts(integer) to anon,authenticated;

create or replace function public.public_posts_for_area(p_area_name text,p_limit integer default 13,p_offset integer default 0)
returns table(post_id uuid,approved_title text,primary_name text,public_excerpt text,last_listed_at timestamptz,public_tag_labels text[],public_area_name text)
language sql stable security definer set search_path = '' as $function$
  with recursive requested_area as (select a.id from private.areas a where a.is_active and a.area_name=pg_catalog.left(pg_catalog.btrim(coalesce(p_area_name,'')),80) and a.area_type in ('state','independent_admin_area')),
  area_scope(area_id,depth) as (select r.id,0 from requested_area r union all select child.id,parent.depth+1 from private.areas child join area_scope parent on parent.area_id=child.parent_area_id where child.is_active and parent.depth<4),
  parameters as (select least(greatest(coalesce(p_limit,13),1),24) result_limit,least(greatest(coalesce(p_offset,0),0),1000000) result_offset)
  select p.post_id,p.approved_title,p.primary_name,p.public_excerpt,p.last_listed_at,p.public_tag_labels,p.public_area_name from public.published_previews p join area_scope s on s.area_id=p.public_area_id cross join parameters x
  where p.content_type='story' order by p.last_listed_at desc,p.post_id limit (select result_limit from parameters) offset (select result_offset from parameters)
$function$;
revoke all on function public.public_posts_for_area(text,integer,integer) from public,anon,authenticated,service_role;
grant execute on function public.public_posts_for_area(text,integer,integer) to anon,authenticated;

create or replace function public.public_posts_for_city(p_city_id uuid,p_parent_area_name text,p_limit integer default 13,p_offset integer default 0)
returns table(post_id uuid,approved_title text,primary_name text,public_excerpt text,last_listed_at timestamptz,public_tag_labels text[],public_area_name text)
language sql stable security definer set search_path = '' as $function$
  with requested_area as (select city.id from private.areas city join private.areas parent on parent.id=city.parent_area_id where city.id=p_city_id and city.is_active and city.area_type='city' and parent.is_active and parent.area_type in ('state','independent_admin_area') and parent.area_name=pg_catalog.left(pg_catalog.btrim(coalesce(p_parent_area_name,'')),80)),
  parameters as (select least(greatest(coalesce(p_limit,13),1),24) result_limit,least(greatest(coalesce(p_offset,0),0),1000000) result_offset)
  select p.post_id,p.approved_title,p.primary_name,p.public_excerpt,p.last_listed_at,p.public_tag_labels,p.public_area_name from public.published_previews p join requested_area a on a.id=p.public_area_id cross join parameters x
  where p.content_type='story' order by p.last_listed_at desc,p.post_id limit (select result_limit from parameters) offset (select result_offset from parameters)
$function$;
revoke all on function public.public_posts_for_city(uuid,text,integer,integer) from public,anon,authenticated,service_role;
grant execute on function public.public_posts_for_city(uuid,text,integer,integer) to anon,authenticated;

create or replace function public.public_home_tag_spotlight(p_limit integer default 12)
returns table(tag_id uuid,tag_label text,public_post_count bigint)
language sql stable security invoker set search_path = '' as $function$
  with settings as (select sort_mode,manual_tag_ids from public.home_tag_settings where singleton=1),
  tag_metrics as (
    select ids.tag_id,labels.tag_label,pg_catalog.count(distinct p.post_id)::bigint public_post_count,pg_catalog.max(p.last_listed_at) last_active_at
    from public.published_previews p cross join lateral pg_catalog.unnest(p.public_tag_ids) with ordinality ids(tag_id,position)
    join lateral pg_catalog.unnest(p.public_tag_labels) with ordinality labels(tag_label,position) on labels.position=ids.position
    where p.content_type='story' and labels.tag_label<>'' group by ids.tag_id,labels.tag_label
  ),
  most_posts_ranked as (select m.*,pg_catalog.row_number() over(order by m.public_post_count desc,m.last_active_at desc,pg_catalog.lower(m.tag_label),m.tag_id) selection_rank from tag_metrics m),
  popular_ranked as (select m.*,pg_catalog.row_number() over(order by m.public_post_count desc,m.last_active_at desc,pg_catalog.lower(m.tag_label),m.tag_id) segment_rank from tag_metrics m),
  popular as (select r.*,1 segment from popular_ranked r where r.segment_rank<=4),
  recent_ranked as (select m.*,pg_catalog.row_number() over(order by m.last_active_at desc,m.public_post_count asc,pg_catalog.lower(m.tag_label),m.tag_id) segment_rank from tag_metrics m where not exists(select 1 from popular p where p.tag_id=m.tag_id)),
  recent as (select r.*,2 segment from recent_ranked r where r.segment_rank<=4),
  low_ranked as (select m.*,pg_catalog.row_number() over(order by m.public_post_count asc,m.last_active_at desc,pg_catalog.lower(m.tag_label),m.tag_id) segment_rank from tag_metrics m where not exists(select 1 from popular p where p.tag_id=m.tag_id) and not exists(select 1 from recent r where r.tag_id=m.tag_id)),
  low_exposure as (select r.*,3 segment from low_ranked r where r.segment_rank<=4),
  smart_selected as (select tag_id,tag_label,public_post_count,segment,segment_rank from popular union all select tag_id,tag_label,public_post_count,segment,segment_rank from recent union all select tag_id,tag_label,public_post_count,segment,segment_rank from low_exposure),
  smart_filled as (select * from smart_selected union all select r.tag_id,r.tag_label,r.public_post_count,4 segment,r.segment_rank from popular_ranked r where not exists(select 1 from smart_selected s where s.tag_id=r.tag_id)),
  manual_selected as (select m.tag_id,m.tag_label,m.public_post_count,0 segment,x.position::bigint selection_rank from settings s cross join lateral pg_catalog.unnest(s.manual_tag_ids) with ordinality x(tag_id,position) join tag_metrics m on m.tag_id=x.tag_id where s.sort_mode='manual'),
  manual_filled as (select tag_id,tag_label,public_post_count,segment,selection_rank from manual_selected union all select r.tag_id,r.tag_label,r.public_post_count,1 segment,r.selection_rank from most_posts_ranked r where not exists(select 1 from manual_selected m where m.tag_id=r.tag_id)),
  mode_selected as (select f.tag_id,f.tag_label,f.public_post_count,f.segment::bigint sort_group,f.segment_rank sort_rank from smart_filled f cross join settings s where s.sort_mode='smart_mix'
    union all select r.tag_id,r.tag_label,r.public_post_count,0::bigint,r.selection_rank from most_posts_ranked r cross join settings s where s.sort_mode='most_posts'
    union all select f.tag_id,f.tag_label,f.public_post_count,f.segment::bigint,f.selection_rank from manual_filled f cross join settings s where s.sort_mode='manual')
  select tag_id,tag_label,public_post_count from mode_selected order by sort_group,sort_rank,tag_id limit least(greatest(coalesce(p_limit,12),1),12)
$function$;
revoke all on function public.public_home_tag_spotlight(integer) from public,anon,authenticated,service_role;
grant execute on function public.public_home_tag_spotlight(integer) to anon,authenticated;
