begin;

-- Tenant membership is separate from cross-tenant operational duties.
delete from public.account_roles where role = 'AUDITOR';
alter table public.account_roles drop constraint if exists account_roles_role_check;
alter table public.account_roles add constraint account_roles_role_check check (role in ('OWNER','ADMIN','MEMBER'));

create or replace function public.can_access_owner(target_owner uuid, required_roles text[] default array['OWNER','ADMIN','MEMBER'])
returns boolean language sql stable security definer set search_path = '' as $$
  select auth.uid() = target_owner or exists(
    select 1 from public.account_roles r
    where r.owner_id=target_owner and r.user_id=auth.uid() and r.role=any(required_roles)
  );
$$;
revoke all on function public.can_access_owner(uuid,text[]) from public,anon;
grant execute on function public.can_access_owner(uuid,text[]) to authenticated;

drop policy if exists audit_log_select on public.audit_log;
create policy audit_log_select on public.audit_log for select using(public.can_access_owner(owner_id,array['OWNER','ADMIN']));

-- Contact method identity is authoritative at the database boundary.
create or replace function public.normalize_contact_method(p_kind text, p_value text)
returns text language plpgsql immutable strict security invoker set search_path = '' as $$
declare v text := btrim(p_value); digits text;
begin
  if upper(p_kind)='EMAIL' then return lower(v); end if;
  if upper(p_kind)='PHONE' then
    digits := regexp_replace(v,'[^0-9]','','g');
    if digits like '0084%' then digits := substr(digits,3); end if;
    if digits like '84%' and length(digits) between 11 and 12 then return '0'||substr(digits,3); end if;
    return digits;
  end if;
  return lower(v);
end $$;

alter table public.contact_methods add column if not exists normalized_value text;
update public.contact_methods set normalized_value=public.normalize_contact_method(kind,value) where normalized_value is null;
alter table public.contact_methods alter column normalized_value set not null;

create or replace function public.set_contact_method_normalized()
returns trigger language plpgsql security invoker set search_path = '' as $$
begin
  new.normalized_value := public.normalize_contact_method(new.kind,new.value);
  return new;
end $$;
drop trigger if exists contact_method_normalize on public.contact_methods;
create trigger contact_method_normalize before insert or update of kind,value on public.contact_methods for each row execute function public.set_contact_method_normalized();

with ranked as (
  select owner_id,id,row_number() over(partition by owner_id,contact_id,kind,normalized_value order by created_at,id) as rn
  from public.contact_methods where lifecycle='ACTIVE'
)
update public.contact_methods m set lifecycle='RESTRICTED',updated_at=now()
from ranked r where r.owner_id=m.owner_id and r.id=m.id and r.rn>1;
drop index if exists public.contact_method_active_value;
create unique index contact_method_active_normalized on public.contact_methods(owner_id,contact_id,kind,normalized_value) where lifecycle='ACTIVE';

-- Stable value-level lineage. Legacy source text remains readable but is not treated as an object ID.
alter table public.field_provenance drop constraint if exists field_provenance_source_type_check;
alter table public.field_provenance add constraint field_provenance_source_type_check check(source_type in ('CARD','CARD_OCR','USER_INPUT','IMPORT','RESEARCH','SYSTEM'));
alter table public.field_provenance add column if not exists source_object_id text;
alter table public.field_provenance add column if not exists source_version integer;
alter table public.field_provenance add column if not exists target_object_type text;
alter table public.field_provenance add column if not exists target_object_id text;
alter table public.field_provenance add column if not exists target_value_id text;
alter table public.field_provenance add column if not exists target_version integer;
alter table public.field_provenance add column if not exists confirmed boolean not null default false;
alter table public.field_provenance add column if not exists confirmed_at timestamptz;
update public.field_provenance set
  source_object_id=case when source_type='CARD' then source_id else source_object_id end,
  target_object_type=coalesce(target_object_type,object_type),
  target_object_id=coalesce(target_object_id,object_id),
  target_value_id=coalesce(target_value_id,object_id),
  target_version=coalesce(target_version,version)
where target_object_type is null or target_object_id is null;
update public.field_provenance p set source_type='CARD',source_object_id=c.id,source_version=c.version
from public.cards c
where p.owner_id=c.owner_id and p.source_type='CARD_OCR' and p.source_id='Card #'||c.code and p.source_object_id is null;
create index if not exists provenance_source_target on public.field_provenance(owner_id,source_type,source_object_id,target_object_type,target_object_id);

-- Cross-tenant privacy operations are service-side, case-scoped and audited.
create table public.operator_roles (
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null check(role in ('SUPPORT','PRIVACY_COMPLIANCE','SECURITY')),
  active boolean not null default true,
  reason text not null,
  granted_by uuid references auth.users(id),
  expires_at timestamptz,
  created_at timestamptz not null default now(),
  primary key(user_id,role)
);
create table public.privacy_cases (
  id uuid primary key default gen_random_uuid(),
  request_reference text not null unique,
  request_type text not null check(request_type in ('ACCESS','CORRECT','DELETE','RESTRICT','OBJECT')),
  verification_status text not null default 'PENDING' check(verification_status in ('PENDING','VERIFIED','REJECTED','EXPIRED')),
  scope text not null,
  criteria_hashes jsonb not null default '{}'::jsonb check(
    jsonb_typeof(criteria_hashes)='object'
    and (criteria_hashes-'email_sha256'-'phone_sha256')='{}'::jsonb
    and (not (criteria_hashes ? 'email_sha256') or criteria_hashes->>'email_sha256' ~ '^[0-9a-f]{64}$')
    and (not (criteria_hashes ? 'phone_sha256') or criteria_hashes->>'phone_sha256' ~ '^[0-9a-f]{64}$')
  ),
  status text not null default 'OPEN' check(status in ('OPEN','MATCH_REVIEW','ACTION_PENDING','COMPLETED','REJECTED')),
  retention_until timestamptz not null,
  created_by uuid not null references auth.users(id),
  verified_by uuid references auth.users(id),
  created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create table public.privacy_case_matches (
  case_id uuid not null references public.privacy_cases(id) on delete cascade,
  id uuid not null default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  contact_id text not null,
  matched_on text[] not null,
  review_status text not null default 'CANDIDATE' check(review_status in ('CANDIDATE','CONFIRMED','REJECTED')),
  reviewed_by uuid references auth.users(id),
  reviewed_at timestamptz,
  created_at timestamptz not null default now(),
  primary key(case_id,id),
  unique(case_id,owner_id,contact_id),
  foreign key(owner_id,contact_id) references public.contacts(owner_id,id) on delete cascade
);
create table public.privacy_case_actions (
  case_id uuid not null references public.privacy_cases(id) on delete cascade,
  id uuid not null default gen_random_uuid(),
  match_id uuid,
  actor_id uuid not null references auth.users(id),
  action text not null,
  reason text not null,
  result_status text not null check(result_status in ('PENDING','COMPLETED','REJECTED','FAILED')),
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  primary key(case_id,id),
  foreign key(case_id,match_id) references public.privacy_case_matches(case_id,id) on delete restrict
);
create table public.operator_audit_log (
  id bigint generated always as identity primary key,
  case_id uuid references public.privacy_cases(id) on delete restrict,
  actor_id uuid not null references auth.users(id),
  action text not null,
  reason text not null,
  scope text not null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
do $$ declare t text; begin
  foreach t in array array['operator_roles','privacy_cases','privacy_case_matches','privacy_case_actions','operator_audit_log'] loop
    execute format('alter table public.%I enable row level security',t);
    execute format('alter table public.%I force row level security',t);
    execute format('revoke all on table public.%I from anon,authenticated',t);
    execute format('grant all on table public.%I to service_role',t);
  end loop;
end $$;

create or replace function public.locate_privacy_case_candidates(p_case_id uuid,p_actor_id uuid,p_reason text)
returns integer language plpgsql security definer set search_path = '' as $$
declare c public.privacy_cases; affected integer; v_email text; v_phone text;
begin
  if coalesce(auth.jwt()->>'role','') <> 'service_role' then raise exception using errcode='42501',message='SERVICE_ROLE_REQUIRED'; end if;
  if not exists(select 1 from public.operator_roles r where r.user_id=p_actor_id and r.role='PRIVACY_COMPLIANCE' and r.active and (r.expires_at is null or r.expires_at>now())) then raise exception using errcode='42501',message='PRIVACY_OPERATOR_REQUIRED'; end if;
  select * into c from public.privacy_cases where id=p_case_id for update;
  if not found or c.verification_status <> 'VERIFIED' then raise exception using errcode='42501',message='VERIFIED_CASE_REQUIRED'; end if;
  if length(btrim(coalesce(p_reason,''))) < 8 then raise exception using errcode='22023',message='AUDIT_REASON_REQUIRED'; end if;
  v_email := c.criteria_hashes->>'email_sha256'; v_phone := c.criteria_hashes->>'phone_sha256';
  insert into public.privacy_case_matches(case_id,owner_id,contact_id,matched_on)
  select c.id,m.owner_id,m.contact_id,array_agg(distinct case when m.kind='EMAIL' then 'EMAIL_HASH' else 'PHONE_HASH' end)
  from public.contact_methods m
  where m.lifecycle='ACTIVE' and ((v_email is not null and m.kind='EMAIL' and encode(extensions.digest(convert_to(m.normalized_value,'UTF8'),'sha256'),'hex')=v_email) or (v_phone is not null and m.kind='PHONE' and encode(extensions.digest(convert_to(m.normalized_value,'UTF8'),'sha256'),'hex')=v_phone))
  group by m.owner_id,m.contact_id on conflict(case_id,owner_id,contact_id) do nothing;
  get diagnostics affected=row_count;
  update public.privacy_cases set status='MATCH_REVIEW',updated_at=now() where id=c.id;
  insert into public.operator_audit_log(case_id,actor_id,action,reason,scope,metadata) values(c.id,p_actor_id,'DSR_CANDIDATE_LOOKUP',p_reason,c.scope,jsonb_build_object('candidate_count',affected));
  return affected;
end $$;
revoke all on function public.locate_privacy_case_candidates(uuid,uuid,text) from public,anon,authenticated;
grant execute on function public.locate_privacy_case_candidates(uuid,uuid,text) to service_role;

-- Atomic quota consumption shared by resolver and research.
alter table public.research_rate_limits add column if not exists bucket text not null default 'research';
alter table public.research_rate_limits drop constraint if exists research_rate_limits_pkey;
alter table public.research_rate_limits add primary key(owner_id,bucket);

create or replace function public.consume_research_quota(p_owner_id uuid,p_bucket text,p_limit integer,p_units integer default 1)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_count integer; v_start timestamptz;
begin
  if coalesce(auth.jwt()->>'role','') <> 'service_role' then raise exception using errcode='42501',message='SERVICE_ROLE_REQUIRED'; end if;
  if p_limit < 1 or p_units < 1 then raise exception using errcode='22023',message='INVALID_QUOTA'; end if;
  if p_bucket not in ('resolver','research') then raise exception using errcode='22023',message='INVALID_QUOTA_BUCKET'; end if;
  insert into public.research_rate_limits(owner_id,bucket,window_started_at,request_count,updated_at)
  values(p_owner_id,p_bucket,now(),p_units,now())
  on conflict(owner_id,bucket) do update set
    window_started_at=case when public.research_rate_limits.window_started_at < now()-interval '1 hour' then now() else public.research_rate_limits.window_started_at end,
    request_count=case when public.research_rate_limits.window_started_at < now()-interval '1 hour' then p_units else public.research_rate_limits.request_count+p_units end,
    updated_at=now()
  where (case when public.research_rate_limits.window_started_at < now()-interval '1 hour' then p_units else public.research_rate_limits.request_count+p_units end) <= p_limit
  returning request_count,window_started_at into v_count,v_start;
  if v_count is null then select request_count,window_started_at into v_count,v_start from public.research_rate_limits where owner_id=p_owner_id and bucket=p_bucket; end if;
  return jsonb_build_object('allowed',v_count <= p_limit,'count',v_count,'limit',p_limit,'window_started_at',v_start);
end $$;
revoke all on function public.consume_research_quota(uuid,text,integer,integer) from public,anon,authenticated;
grant execute on function public.consume_research_quota(uuid,text,integer,integer) to service_role;

revoke all on function public.handle_new_user() from public,anon,authenticated;

-- Preserve the deployed UPSERT adapters, but interpose a safe lifecycle/conflict protocol.
alter function public.sync_object(text,text,text,integer,integer,text,jsonb) rename to sync_object_legacy;
revoke all on function public.sync_object_legacy(text,text,text,integer,integer,text,jsonb) from public,anon,authenticated;

create or replace function public.sync_object(
  p_object_type text,p_object_id text,p_operation_type text,p_expected_version integer,
  p_object_version integer,p_idempotency_key text,p_payload jsonb
) returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_owner uuid:=auth.uid(); v_existing public.sync_operations; v_current integer:=0; v_hash text; v_table text; v_response jsonb; v_lifecycle text;
begin
  if v_owner is null then raise exception using errcode='28000',message='AUTH_REQUIRED'; end if;
  v_table:=case p_object_type when 'event' then 'events' when 'contact' then 'contacts' when 'contact_method' then 'contact_methods' when 'tenant_company' then 'tenant_companies' when 'contact_company' then 'contact_companies' when 'card' then 'cards' when 'card_image' then 'card_images' when 'encounter' then 'encounters' when 'note' then 'notes' when 'tag' then 'tags' when 'contact_tag' then 'contact_tags' when 'update_proposal' then 'update_proposals' when 'field_provenance' then 'field_provenance' when 'data_request' then 'data_requests' end;
  if v_table is null or p_operation_type not in ('UPSERT','DELETE','RESTRICT') or p_object_version<1 or p_expected_version<0 then raise exception using errcode='22023',message='INVALID_SYNC_REQUEST'; end if;
  if p_operation_type='RESTRICT' and p_object_type in ('tag','contact_tag') then raise exception using errcode='22023',message='RESTRICT_NOT_SUPPORTED'; end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(v_owner::text||':'||p_object_type||':'||p_object_id,0));
  v_hash:=encode(extensions.digest(convert_to(coalesce(p_payload,'{}'::jsonb)::text,'UTF8'),'sha256'),'hex');
  select * into v_existing from public.sync_operations where owner_id=v_owner and idempotency_key=p_idempotency_key;
  if found then
    if v_existing.request_hash<>v_hash or v_existing.object_type<>p_object_type or v_existing.object_id<>p_object_id then raise exception using errcode='23505',message='IDEMPOTENCY_KEY_REUSED'; end if;
    return coalesce(v_existing.response,jsonb_build_object('status',v_existing.sync_status,'version',v_existing.object_version,'replayed',true))||jsonb_build_object('replayed',true);
  end if;
  execute format('select version from public.%I where owner_id=$1 and id=$2 for update',v_table) into v_current using v_owner,p_object_id;
  v_current:=coalesce(v_current,0);
  if v_current<>p_expected_version then
    v_response:=jsonb_build_object('status','CONFLICT','current_version',v_current,'version',v_current,'replayed',false);
    insert into public.sync_operations(owner_id,id,object_type,object_id,object_version,operation_type,idempotency_key,sync_status,request_hash,response) values(v_owner,p_idempotency_key,p_object_type,p_object_id,p_object_version,p_operation_type,p_idempotency_key,'CONFLICT',v_hash,v_response);
    insert into public.audit_log(owner_id,actor_id,action,object_type,object_id,object_version,metadata) values(v_owner,auth.uid(),'SYNC_CONFLICT',p_object_type,p_object_id,p_object_version,jsonb_build_object('current_version',v_current,'idempotency_key',p_idempotency_key));
    return v_response;
  end if;
  if p_operation_type='UPSERT' and p_object_type='field_provenance' then
    insert into public.field_provenance(owner_id,id,object_type,object_id,field_name,source_type,source_id,source_object_id,source_version,target_object_type,target_object_id,target_value_id,target_version,value_hash,confirmed,confirmed_at,lifecycle,version)
    values(v_owner,p_object_id,p_payload->>'object_type',p_payload->>'object_id',p_payload->>'field_name',p_payload->>'source_type',coalesce(p_payload->>'source_object_id',p_payload->>'source_id'),coalesce(p_payload->>'source_object_id',p_payload->>'source_id'),nullif(p_payload->>'source_version','')::integer,coalesce(p_payload->>'target_object_type',p_payload->>'object_type'),coalesce(p_payload->>'target_object_id',p_payload->>'object_id'),coalesce(p_payload->>'target_value_id',p_payload->>'object_id'),coalesce(nullif(p_payload->>'target_version','')::integer,p_object_version),p_payload->>'value_hash',coalesce((p_payload->>'confirmed')::boolean,false),nullif(p_payload->>'confirmed_at','')::timestamptz,'ACTIVE',p_object_version)
    on conflict(owner_id,id) do update set source_type=excluded.source_type,source_id=excluded.source_id,source_object_id=excluded.source_object_id,source_version=excluded.source_version,target_object_type=excluded.target_object_type,target_object_id=excluded.target_object_id,target_value_id=excluded.target_value_id,target_version=excluded.target_version,value_hash=excluded.value_hash,confirmed=excluded.confirmed,confirmed_at=excluded.confirmed_at,lifecycle='ACTIVE',version=excluded.version,updated_at=now();
    v_response:=jsonb_build_object('status','COMPLETE','version',p_object_version,'replayed',false);
    insert into public.sync_operations(owner_id,id,object_type,object_id,object_version,operation_type,idempotency_key,sync_status,request_hash,response) values(v_owner,p_idempotency_key,p_object_type,p_object_id,p_object_version,p_operation_type,p_idempotency_key,'COMPLETE',v_hash,v_response);
    insert into public.audit_log(owner_id,actor_id,action,object_type,object_id,object_version,metadata) values(v_owner,auth.uid(),'SYNC_UPSERT',p_object_type,p_object_id,p_object_version,jsonb_build_object('idempotency_key',p_idempotency_key));
    return v_response;
  end if;
  if p_operation_type='UPSERT' then
    v_response:=public.sync_object_legacy(p_object_type,p_object_id,p_operation_type,p_expected_version,p_object_version,p_idempotency_key,p_payload)||jsonb_build_object('status','COMPLETE');
    update public.sync_operations set response=v_response where owner_id=v_owner and idempotency_key=p_idempotency_key;
    return v_response;
  end if;
  if v_current=0 then
    v_response:=jsonb_build_object('status','ABSENT','version',0,'replayed',false);
    insert into public.sync_operations(owner_id,id,object_type,object_id,object_version,operation_type,idempotency_key,sync_status,request_hash,response) values(v_owner,p_idempotency_key,p_object_type,p_object_id,p_object_version,p_operation_type,p_idempotency_key,'COMPLETE',v_hash,v_response);
    insert into public.audit_log(owner_id,actor_id,action,object_type,object_id,object_version,metadata) values(v_owner,auth.uid(),'SYNC_'||p_operation_type||'_ABSENT',p_object_type,p_object_id,p_object_version,jsonb_build_object('idempotency_key',p_idempotency_key));
    return v_response;
  end if;
  v_lifecycle:=case p_operation_type when 'DELETE' then 'DELETED' else 'RESTRICTED' end;
  if p_object_type='contact' then update public.contacts set name=case when p_operation_type='DELETE' then '' else name end,initials=case when p_operation_type='DELETE' then '' else initials end,personal_url=case when p_operation_type='DELETE' then null else personal_url end,lifecycle=v_lifecycle,version=p_object_version,deleted_at=case when p_operation_type='DELETE' then now() else deleted_at end,updated_at=now() where owner_id=v_owner and id=p_object_id;
  elsif p_object_type='event' then update public.events set name=case when p_operation_type='DELETE' then '' else name end,place=case when p_operation_type='DELETE' then null else place end,lifecycle=v_lifecycle,version=p_object_version,deleted_at=case when p_operation_type='DELETE' then now() else deleted_at end,updated_at=now() where owner_id=v_owner and id=p_object_id;
  elsif p_object_type='tenant_company' then update public.tenant_companies set name=case when p_operation_type='DELETE' then '' else name end,website=case when p_operation_type='DELETE' then null else website end,lifecycle=v_lifecycle,version=p_object_version,updated_at=now() where owner_id=v_owner and id=p_object_id;
  elsif p_object_type='card' then update public.cards set snapshot=case when p_operation_type='DELETE' then '{}'::jsonb else snapshot end,code=case when p_operation_type='DELETE' then '' else code end,lifecycle=v_lifecycle,version=p_object_version,deleted_at=case when p_operation_type='DELETE' then now() else deleted_at end,updated_at=now() where owner_id=v_owner and id=p_object_id;
  elsif p_object_type='card_image' then update public.card_images set upload_status=case when p_operation_type='DELETE' then 'DELETED' else upload_status end,lifecycle=v_lifecycle,version=p_object_version,updated_at=now() where owner_id=v_owner and id=p_object_id;
  elsif p_object_type='contact_method' then update public.contact_methods set value=case when p_operation_type='DELETE' then '' else value end,label=case when p_operation_type='DELETE' then '' else label end,source=case when p_operation_type='DELETE' then '' else source end,lifecycle=v_lifecycle,version=p_object_version,updated_at=now() where owner_id=v_owner and id=p_object_id;
  elsif p_object_type='contact_company' then update public.contact_companies set role=case when p_operation_type='DELETE' then '' else role end,source=case when p_operation_type='DELETE' then '' else source end,lifecycle=v_lifecycle,version=p_object_version,updated_at=now() where owner_id=v_owner and id=p_object_id;
  elsif p_object_type='note' then update public.notes set body=case when p_operation_type='DELETE' then '' else body end,lifecycle=v_lifecycle,version=p_object_version,updated_at=now() where owner_id=v_owner and id=p_object_id;
  elsif p_object_type='encounter' then update public.encounters set context=case when p_operation_type='DELETE' then '' else context end,lifecycle=v_lifecycle,version=p_object_version,updated_at=now() where owner_id=v_owner and id=p_object_id;
  elsif p_object_type='tag' then update public.tags set name=case when p_operation_type='DELETE' then 'deleted:'||p_object_id else name end,lifecycle=v_lifecycle,version=p_object_version,updated_at=now() where owner_id=v_owner and id=p_object_id;
  elsif p_object_type='contact_tag' then update public.contact_tags set lifecycle=v_lifecycle,version=p_object_version,updated_at=now() where owner_id=v_owner and id=p_object_id;
  elsif p_object_type='update_proposal' then update public.update_proposals set proposed_value=case when p_operation_type='DELETE' then '{}'::jsonb else proposed_value end,source_card_id=case when p_operation_type='DELETE' then null else source_card_id end,lifecycle=v_lifecycle,version=p_object_version,updated_at=now() where owner_id=v_owner and id=p_object_id;
  elsif p_object_type='field_provenance' then update public.field_provenance set lifecycle=v_lifecycle,version=p_object_version,updated_at=now() where owner_id=v_owner and id=p_object_id;
  elsif p_object_type='data_request' then update public.data_requests set verification_email=case when p_operation_type='DELETE' then '' else verification_email end,scope=case when p_operation_type='DELETE' then '' else scope end,lifecycle=v_lifecycle,version=p_object_version,updated_at=now() where owner_id=v_owner and id=p_object_id;
  end if;
  v_response:=jsonb_build_object('status','COMPLETE','version',p_object_version,'replayed',false);
  insert into public.sync_operations(owner_id,id,object_type,object_id,object_version,operation_type,idempotency_key,sync_status,request_hash,response) values(v_owner,p_idempotency_key,p_object_type,p_object_id,p_object_version,p_operation_type,p_idempotency_key,'COMPLETE',v_hash,v_response);
  insert into public.audit_log(owner_id,actor_id,action,object_type,object_id,object_version,metadata) values(v_owner,auth.uid(),'SYNC_'||p_operation_type,p_object_type,p_object_id,p_object_version,jsonb_build_object('idempotency_key',p_idempotency_key));
  return v_response;
end $$;
revoke all on function public.sync_object(text,text,text,integer,integer,text,jsonb) from public,anon;
grant execute on function public.sync_object(text,text,text,integer,integer,text,jsonb) to authenticated;

create or replace function public.reconcile_sync_operation(p_idempotency_key text)
returns jsonb language sql stable security definer set search_path = '' as $$
  select coalesce((select jsonb_build_object('status',s.sync_status,'version',s.object_version,'response',s.response) from public.sync_operations s where s.owner_id=auth.uid() and s.idempotency_key=p_idempotency_key),jsonb_build_object('status','ABSENT'));
$$;
revoke all on function public.reconcile_sync_operation(text) from public,anon;
grant execute on function public.reconcile_sync_operation(text) to authenticated;

-- Private object writes must use approved RPCs so version/idempotency/audit cannot be bypassed.
do $$ declare t text; begin
  foreach t in array array['events','contacts','contact_methods','tenant_companies','contact_companies','cards','card_images','encounters','notes','tags','contact_tags','update_proposals','field_provenance','sync_operations','data_requests','audit_log','company_resolution','company_research','company_facts','research_sources','research_rate_limits'] loop
    execute format('revoke insert,update,delete on table public.%I from anon,authenticated',t);
    execute format('grant select on table public.%I to authenticated',t);
  end loop;
end $$;

commit;
