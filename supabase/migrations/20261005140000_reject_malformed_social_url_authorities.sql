-- Keep the social-link allowlist limited to syntactically valid DNS hostnames.
-- The previous suffix test also accepted URL userinfo and malformed labels
-- when the raw authority happened to end in an approved domain suffix.
create or replace function private.is_valid_public_social_url(p_platform text, p_url text)
returns boolean
language plpgsql immutable
set search_path = ''
as $function$
declare
  v_parts text[];
  v_host text;
begin
  if p_platform not in ('facebook','instagram','tiktok','telegram')
    or p_url is null or pg_catalog.char_length(p_url) > 500
    or p_url <> pg_catalog.btrim(p_url)
    or p_url ~ '[[:space:][:cntrl:]]' then
    return false;
  end if;
  v_parts := pg_catalog.regexp_match(pg_catalog.lower(p_url), '^https://([^/:?#]+)(/[^?#]*)?$');
  if v_parts is null then return false; end if;
  v_host := v_parts[1];
  if pg_catalog.char_length(v_host) > 253
    or v_host !~ '^[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?([.][a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?)*$' then
    return false;
  end if;
  return case p_platform
    when 'facebook' then v_host = 'facebook.com' or v_host = 'fb.com'
      or v_host like '%.facebook.com' or v_host like '%.fb.com'
    when 'instagram' then v_host = 'instagram.com' or v_host like '%.instagram.com'
    when 'tiktok' then v_host = 'tiktok.com' or v_host like '%.tiktok.com'
    when 'telegram' then v_host in ('t.me','telegram.me')
      or v_host like '%.t.me' or v_host like '%.telegram.me'
    else false
  end;
end;
$function$;

revoke all on function private.is_valid_public_social_url(text, text) from public, anon, authenticated, service_role;
