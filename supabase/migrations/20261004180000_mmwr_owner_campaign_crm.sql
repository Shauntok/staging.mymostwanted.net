-- Private Owner-only campaign quote records. This is not an ad delivery or billing system.
create table private.owner_campaigns (
  campaign_id uuid primary key default pg_catalog.gen_random_uuid(),
  client_name text not null check (pg_catalog.length(pg_catalog.btrim(client_name)) between 1 and 160),
  quote_amount numeric(14,2) not null check (quote_amount >= 0),
  quote_currency text not null default 'MYR' check (quote_currency = 'MYR'),
  billing_model text not null check (billing_model in ('flat_fee','cpm','cpc')),
  ad_slot text not null check (pg_catalog.length(pg_catalog.btrim(ad_slot)) between 1 and 100),
  starts_on date,
  ends_on date,
  creative_notes text not null default '' check (pg_catalog.length(creative_notes) <= 2000),
  status text not null default 'draft' check (status in ('draft','quoted','confirmed','completed','cancelled')),
  -- Auth-account deletion must not be blocked by retained commercial records.
  -- Keep the quote and anonymize only the creator reference if that account is removed.
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default pg_catalog.clock_timestamp(),
  updated_at timestamptz not null default pg_catalog.clock_timestamp(),
  check (starts_on is null or ends_on is null or ends_on >= starts_on)
);
create index owner_campaigns_updated_idx on private.owner_campaigns(updated_at desc, campaign_id);
alter table private.owner_campaigns enable row level security;
revoke all on table private.owner_campaigns from public,anon,authenticated,service_role;

create table private.owner_campaign_audit (
  event_id bigint generated always as identity primary key,
  campaign_id uuid not null references private.owner_campaigns(campaign_id) on delete restrict,
  -- Preserve the append-only audit while allowing account deletion to clear identity.
  actor_user_id uuid references auth.users(id) on delete set null,
  action text not null check (action in ('created','updated')),
  changed_fields text[] not null check (pg_catalog.cardinality(changed_fields) between 1 and 8),
  reason text not null check (pg_catalog.length(pg_catalog.btrim(reason)) between 1 and 500),
  occurred_at timestamptz not null default pg_catalog.clock_timestamp()
);
alter table private.owner_campaign_audit enable row level security;
revoke all on table private.owner_campaign_audit from public,anon,authenticated,service_role;

create function private.reject_owner_campaign_audit_mutation()
returns trigger language plpgsql set search_path = ''
as $function$
begin
  if tg_op = 'UPDATE'
    and old.actor_user_id is not null
    and new.actor_user_id is null
    and (pg_catalog.to_jsonb(old) - 'actor_user_id') = (pg_catalog.to_jsonb(new) - 'actor_user_id') then
    return new;
  end if;
  raise exception 'campaign audit history is append-only' using errcode='42501';
end;
$function$;
revoke all on function private.reject_owner_campaign_audit_mutation() from public,anon,authenticated,service_role;
create trigger owner_campaign_audit_append_only
  before update or delete on private.owner_campaign_audit
  for each row execute function private.reject_owner_campaign_audit_mutation();
create trigger owner_campaign_audit_no_truncate
  before truncate on private.owner_campaign_audit
  for each statement execute function private.reject_owner_campaign_audit_mutation();

create function private.owner_list_campaigns(p_limit integer default 100)
returns table (
  campaign_id uuid, client_name text, quote_amount numeric, quote_currency text, billing_model text,
  ad_slot text, starts_on date, ends_on date, creative_notes text, status text, created_at timestamptz, updated_at timestamptz
)
language plpgsql volatile security definer set search_path = ''
as $function$
begin
  if (select auth.uid()) is null or not private.has_staff_role('owner') or not private.has_recent_totp() then
    raise exception 'Owner access and recent TOTP required' using errcode='42501';
  end if;
  return query
    select c.campaign_id,c.client_name,c.quote_amount,c.quote_currency,c.billing_model,c.ad_slot,
      c.starts_on,c.ends_on,c.creative_notes,c.status,c.created_at,c.updated_at
    from private.owner_campaigns as c
    order by c.updated_at desc,c.campaign_id
    limit greatest(1,least(coalesce(p_limit,100),100));
end
$function$;
revoke all on function private.owner_list_campaigns(integer) from public,anon,authenticated,service_role;
grant execute on function private.owner_list_campaigns(integer) to authenticated;

create function public.owner_list_campaigns(p_limit integer default 100)
returns table (
  campaign_id uuid, client_name text, quote_amount numeric, quote_currency text, billing_model text,
  ad_slot text, starts_on date, ends_on date, creative_notes text, status text, created_at timestamptz, updated_at timestamptz
)
language sql volatile security invoker set search_path = ''
as $function$ select * from private.owner_list_campaigns(p_limit); $function$;
revoke all on function public.owner_list_campaigns(integer) from public,anon,service_role;
grant execute on function public.owner_list_campaigns(integer) to authenticated;

create function private.owner_save_campaign(
  p_campaign_id uuid,
  p_client_name text,
  p_quote_amount numeric,
  p_billing_model text,
  p_ad_slot text,
  p_starts_on date,
  p_ends_on date,
  p_creative_notes text,
  p_status text,
  p_reason text
)
returns uuid language plpgsql security definer set search_path = ''
as $function$
declare
  v_user_id uuid := (select auth.uid());
  v_client_name text := pg_catalog.btrim(coalesce(p_client_name,''));
  v_ad_slot text := pg_catalog.btrim(coalesce(p_ad_slot,''));
  v_notes text := coalesce(p_creative_notes,'');
  v_reason text := pg_catalog.btrim(coalesce(p_reason,''));
  v_id uuid;
  v_action text;
  v_fields text[];
  v_existing private.owner_campaigns%rowtype;
begin
  if v_user_id is null or not private.has_staff_role('owner') or not private.has_recent_totp()
    or pg_catalog.length(v_client_name) not between 1 and 160
    or p_quote_amount is null or p_quote_amount < 0 or p_quote_amount > 999999999999.99
    or p_quote_amount <> pg_catalog.round(p_quote_amount,2)
    or p_billing_model not in ('flat_fee','cpm','cpc')
    or pg_catalog.length(v_ad_slot) not between 1 and 100
    or pg_catalog.length(v_notes) > 2000
    or (p_starts_on is not null and p_ends_on is not null and p_ends_on < p_starts_on)
    or p_status not in ('draft','quoted','confirmed','completed','cancelled')
    or pg_catalog.length(v_reason) not between 1 and 500 then
    raise exception 'Campaign input, Owner access, recent TOTP or reason invalid' using errcode='42501';
  end if;
  if p_campaign_id is null then
    insert into private.owner_campaigns(client_name,quote_amount,billing_model,ad_slot,starts_on,ends_on,creative_notes,status,created_by)
      values(v_client_name,p_quote_amount,p_billing_model,v_ad_slot,p_starts_on,p_ends_on,v_notes,p_status,v_user_id)
      returning campaign_id into v_id;
    v_action:='created';
    v_fields:=array['client_name','quote_amount','billing_model','ad_slot','starts_on','ends_on','creative_notes','status']::text[];
  else
    select c.* into v_existing from private.owner_campaigns as c where c.campaign_id=p_campaign_id for update;
    if not found then raise exception 'Campaign not found' using errcode='P0002'; end if;
    v_id:=v_existing.campaign_id;
    if not private.has_staff_role('owner') or not private.has_recent_totp() then
      raise exception 'Owner access and recent TOTP required' using errcode='42501';
    end if;
    v_fields:=pg_catalog.array_remove(array[
      case when v_existing.client_name is distinct from v_client_name then 'client_name' end,
      case when v_existing.quote_amount is distinct from p_quote_amount then 'quote_amount' end,
      case when v_existing.billing_model is distinct from p_billing_model then 'billing_model' end,
      case when v_existing.ad_slot is distinct from v_ad_slot then 'ad_slot' end,
      case when v_existing.starts_on is distinct from p_starts_on then 'starts_on' end,
      case when v_existing.ends_on is distinct from p_ends_on then 'ends_on' end,
      case when v_existing.creative_notes is distinct from v_notes then 'creative_notes' end,
      case when v_existing.status is distinct from p_status then 'status' end
    ]::text[],null::text);
    if coalesce(pg_catalog.cardinality(v_fields),0)=0 then
      raise exception 'Campaign must have a changed field' using errcode='22023';
    end if;
    update private.owner_campaigns set client_name=v_client_name,quote_amount=p_quote_amount,billing_model=p_billing_model,
      ad_slot=v_ad_slot,starts_on=p_starts_on,ends_on=p_ends_on,creative_notes=v_notes,status=p_status,updated_at=pg_catalog.clock_timestamp()
      where campaign_id=v_id;
    v_action:='updated';
  end if;
  insert into private.owner_campaign_audit(campaign_id,actor_user_id,action,changed_fields,reason)
    values(v_id,v_user_id,v_action,v_fields,v_reason);
  return v_id;
end
$function$;
revoke all on function private.owner_save_campaign(uuid,text,numeric,text,text,date,date,text,text,text) from public,anon,authenticated,service_role;
grant execute on function private.owner_save_campaign(uuid,text,numeric,text,text,date,date,text,text,text) to authenticated;

create function public.owner_save_campaign(
  p_campaign_id uuid,
  p_client_name text,
  p_quote_amount numeric,
  p_billing_model text,
  p_ad_slot text,
  p_starts_on date,
  p_ends_on date,
  p_creative_notes text,
  p_status text,
  p_reason text
)
returns uuid language sql volatile security invoker set search_path = ''
as $function$
  select private.owner_save_campaign(p_campaign_id,p_client_name,p_quote_amount,p_billing_model,p_ad_slot,p_starts_on,p_ends_on,p_creative_notes,p_status,p_reason);
$function$;
revoke all on function public.owner_save_campaign(uuid,text,numeric,text,text,date,date,text,text,text) from public,anon,service_role;
grant execute on function public.owner_save_campaign(uuid,text,numeric,text,text,date,date,text,text,text) to authenticated;

-- Owner receives this CRM tool as an optional dashboard widget. Admin is unchanged.
alter table private.staff_dashboard_preferences
  drop constraint staff_dashboard_preference_widget_count;
alter table private.staff_dashboard_preferences
  add constraint staff_dashboard_preference_widget_count check (pg_catalog.cardinality(widget_ids) between 1 and 20);

create or replace function private.staff_get_dashboard_layout()
returns jsonb language plpgsql volatile security definer set search_path = ''
as $function$
declare v_user_id uuid := (select auth.uid()); v_role text; v_widget_ids text[]; v_default_ids text[]; v_default_version integer;
begin
  if v_user_id is null then raise exception 'Staff access required' using errcode='42501'; end if;
  if private.has_staff_role('owner') then
    v_role:='owner';
    v_default_ids:=array['dashboard_summary','reports','submissions','post_editor','notifications','analytics','posts','homepage_tags','sanctions','staff_access','risk_lexicon','security_email','ip_blocks','recent_operations','storage_usage','hot_settings','clarifications','reaction_icons','account_deletion_reviews','campaign_crm']::text[];
  elsif private.has_staff_role('admin') then v_role:='admin';
  else raise exception 'Staff access required' using errcode='42501'; end if;
  select defaults.version into v_default_version from private.staff_dashboard_default_versions as defaults order by defaults.version desc limit 1;
  if v_role='admin' then select defaults.admin_widget_ids into v_default_ids from private.staff_dashboard_default_versions as defaults where defaults.version=v_default_version; end if;
  select preference.widget_ids into v_widget_ids from private.staff_dashboard_preferences as preference where preference.user_id=v_user_id and preference.staff_role=v_role and (v_role='owner' or preference.default_version=v_default_version);
  if v_widget_ids is null then v_widget_ids:=v_default_ids; end if;
  return pg_catalog.jsonb_build_object('role',v_role,'widget_ids',v_widget_ids,'default_version',v_default_version);
end
$function$;

create or replace function private.staff_save_dashboard_layout(p_widget_ids text[])
returns boolean language plpgsql security definer set search_path = ''
as $function$
declare v_user_id uuid := (select auth.uid()); v_role text; v_allowed text[]; v_default_version integer; v_widget_ids text[]:=coalesce(p_widget_ids,'{}'::text[]);
begin
  if v_user_id is null then return false; end if;
  if private.has_staff_role('owner') then
    v_role:='owner';
    v_allowed:=array['dashboard_summary','reports','submissions','post_editor','notifications','analytics','posts','homepage_tags','sanctions','staff_access','risk_lexicon','security_email','ip_blocks','recent_operations','storage_usage','hot_settings','clarifications','reaction_icons','account_deletion_reviews','campaign_crm']::text[];
  elsif private.has_staff_role('admin') then
    v_role:='admin';
    v_allowed:=array['dashboard_summary','reports','submissions','post_editor','notifications','analytics','sanctions','recent_operations','storage_usage','clarifications']::text[];
  else return false; end if;
  if pg_catalog.cardinality(v_widget_ids)<1 or pg_catalog.cardinality(v_widget_ids)>pg_catalog.cardinality(v_allowed)
    or pg_catalog.cardinality(v_widget_ids)<>(select pg_catalog.count(distinct selected.widget_id)::integer from pg_catalog.unnest(v_widget_ids) as selected(widget_id))
    or exists(select 1 from pg_catalog.unnest(v_widget_ids) as selected(widget_id) where selected.widget_id is null or not (selected.widget_id=any(v_allowed))) then return false; end if;
  perform pg_catalog.pg_advisory_xact_lock(70610001::bigint);
  select defaults.version into v_default_version from private.staff_dashboard_default_versions as defaults order by defaults.version desc limit 1;
  if v_default_version is null or not private.has_staff_role(v_role) then return false; end if;
  insert into private.staff_dashboard_preferences(user_id,staff_role,widget_ids,default_version,updated_at)
  values(v_user_id,v_role,v_widget_ids,v_default_version,pg_catalog.clock_timestamp())
  on conflict(user_id) do update set staff_role=excluded.staff_role,widget_ids=excluded.widget_ids,default_version=excluded.default_version,updated_at=excluded.updated_at;
  return true;
end
$function$;
