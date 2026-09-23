begin;

alter table public.company_facts
  add column if not exists derivation_type text not null default 'INFERRED';
alter table public.company_facts
  drop constraint if exists company_facts_derivation_type_check;
alter table public.company_facts
  add constraint company_facts_derivation_type_check
  check(derivation_type in ('EXTRACTED','INFERRED'));

create or replace function public.persist_company_research_bundle(
  p_owner_id uuid,
  p_research jsonb,
  p_sources jsonb,
  p_facts jsonb,
  p_evidence jsonb
)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_research_id text;
  v_requested_id text := nullif(p_research->>'id','');
  v_company_id text := nullif(p_research->>'company_id','');
  v_cache_key text := nullif(p_research->>'cache_key','');
  v_resolution_id text := nullif(p_research->>'resolution_id','');
  v_identity_version integer := nullif(p_research->>'identity_version','')::integer;
  v_identity_status text := nullif(p_research->>'identity_status','');
  v_domain text := nullif(p_research->>'domain','');
  v_action text := case when p_research->>'action'='RESEARCH_REFRESH' then 'RESEARCH_REFRESH' else 'RESEARCH_CREATE' end;
  v_expected_facts integer := jsonb_array_length(coalesce(p_facts,'[]'::jsonb));
  v_saved_facts integer;
  v_saved_evidence integer;
begin
  if coalesce(auth.role(),'') <> 'service_role' and current_user not in ('postgres','supabase_admin') then
    raise exception using errcode='42501',message='SERVICE_ROLE_REQUIRED';
  end if;
  if p_owner_id is null or v_requested_id is null or v_company_id is null or v_cache_key is null or v_resolution_id is null or v_identity_version is null or v_domain is null then
    raise exception using errcode='22023',message='RESEARCH_BUNDLE_INVALID';
  end if;
  if v_identity_status not in ('SERVER_VERIFIED','USER_CONFIRMED') then
    raise exception using errcode='22023',message='COMPANY_IDENTITY_NOT_VERIFIED';
  end if;
  if v_expected_facts < 1 or jsonb_array_length(coalesce(p_sources,'[]'::jsonb)) < 1 then
    raise exception using errcode='22023',message='RESEARCH_EVIDENCE_REQUIRED';
  end if;
  if not exists (
    select 1
    from public.tenant_companies c
    join public.company_resolution r on r.owner_id=c.owner_id and r.company_id=c.id
    where c.owner_id=p_owner_id and c.id=v_company_id and c.lifecycle='ACTIVE'
      and r.id=v_resolution_id and r.identity_version=v_identity_version
      and r.status=v_identity_status and r.candidate_domain=v_domain
  ) then
    raise exception using errcode='23503',message='RESEARCH_IDENTITY_BINDING_INVALID';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(p_owner_id::text||':'||v_cache_key,0));
  select id into v_research_id from public.company_research where owner_id=p_owner_id and cache_key=v_cache_key for update;
  if v_research_id is null then
    v_research_id := v_requested_id;
    insert into public.company_research(owner_id,id,company_id,domain,status,summary,confidence,cache_key,expires_at,resolution_id,identity_version,identity_status,error_code,updated_at)
    values(p_owner_id,v_research_id,v_company_id,v_domain,'RESEARCHING',p_research->>'summary',null,v_cache_key,(p_research->>'expires_at')::timestamptz,v_resolution_id,v_identity_version,v_identity_status,null,now());
  else
    update public.company_research set company_id=v_company_id,domain=v_domain,status='RESEARCHING',summary=p_research->>'summary',confidence=null,
      expires_at=(p_research->>'expires_at')::timestamptz,resolution_id=v_resolution_id,identity_version=v_identity_version,identity_status=v_identity_status,error_code=null,updated_at=now()
    where owner_id=p_owner_id and id=v_research_id;
  end if;

  delete from public.research_fact_evidence where owner_id=p_owner_id and research_id=v_research_id;
  delete from public.company_facts where owner_id=p_owner_id and research_id=v_research_id;
  delete from public.research_sources where owner_id=p_owner_id and research_id=v_research_id;

  insert into public.research_sources(owner_id,id,research_id,url,title,retrieved_at,fact_keys)
  select p_owner_id,x.id,v_research_id,x.url,x.title,x.retrieved_at,x.fact_keys
  from jsonb_to_recordset(p_sources) as x(id text,url text,title text,retrieved_at timestamptz,fact_keys text[]);

  insert into public.company_facts(owner_id,id,research_id,fact_key,fact_value,confidence,derivation_type,verification_status)
  select p_owner_id,x.id,v_research_id,x.fact_key,x.fact_value,null,x.derivation_type,x.verification_status
  from jsonb_to_recordset(p_facts) as x(id text,fact_key text,fact_value jsonb,derivation_type text,verification_status text);
  get diagnostics v_saved_facts = row_count;
  if v_saved_facts <> v_expected_facts then
    raise exception using errcode='22023',message='RESEARCH_FACT_COUNT_MISMATCH';
  end if;

  insert into public.research_fact_evidence(owner_id,id,research_id,fact_id,source_id,excerpt,content_hash,retrieved_at,verification_status)
  select p_owner_id,x.id,v_research_id,x.fact_id,x.source_id,x.excerpt,x.content_hash,x.retrieved_at,x.verification_status
  from jsonb_to_recordset(p_evidence) as x(id text,fact_id text,source_id text,excerpt text,content_hash text,retrieved_at timestamptz,verification_status text);
  get diagnostics v_saved_evidence = row_count;
  if v_saved_evidence < v_expected_facts or exists (
    select 1 from public.company_facts f
    where f.owner_id=p_owner_id and f.research_id=v_research_id
      and not exists (select 1 from public.research_fact_evidence e where e.owner_id=f.owner_id and e.research_id=f.research_id and e.fact_id=f.id and e.verification_status='SUPPORTED')
  ) then
    raise exception using errcode='22023',message='RESEARCH_CLAIM_EVIDENCE_MISSING';
  end if;

  update public.company_research set status='COMPLETED',updated_at=now()
  where owner_id=p_owner_id and id=v_research_id;
  update public.research_jobs set status='COMPLETED',lease_until=now(),error_code=null,updated_at=now()
  where owner_id=p_owner_id and cache_key=v_cache_key;
  insert into public.audit_log(owner_id,actor_id,action,object_type,object_id,object_version,metadata)
  values(p_owner_id,p_owner_id,v_action,'company_research',v_research_id,v_identity_version,jsonb_build_object('domain',v_domain,'identity_version',v_identity_version,'supported_claim_count',v_saved_facts));
  return v_research_id;
end $$;

revoke all on function public.persist_company_research_bundle(uuid,jsonb,jsonb,jsonb,jsonb) from public,anon,authenticated;
grant execute on function public.persist_company_research_bundle(uuid,jsonb,jsonb,jsonb,jsonb) to service_role;

commit;
