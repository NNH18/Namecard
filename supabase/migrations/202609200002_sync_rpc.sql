begin;

create or replace function public.sync_object(
  p_object_type text, p_object_id text, p_operation_type text, p_expected_version integer,
  p_object_version integer, p_idempotency_key text, p_payload jsonb
) returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_owner uuid := auth.uid(); v_existing public.sync_operations; v_current integer := 0; v_hash text;
begin
  if v_owner is null then raise exception using errcode='28000', message='AUTH_REQUIRED'; end if;
  if p_object_type not in ('event','contact','contact_method','tenant_company','contact_company','card','card_image','encounter','note','tag','contact_tag','update_proposal','field_provenance','data_request') then
    raise exception using errcode='22023', message='UNSUPPORTED_OBJECT_TYPE';
  end if;
  if p_operation_type not in ('UPSERT','DELETE','RESTRICT') or p_object_version < 1 or p_expected_version < 0 then raise exception using errcode='22023', message='INVALID_SYNC_REQUEST'; end if;
  v_hash := encode(extensions.digest(convert_to(coalesce(p_payload,'{}'::jsonb)::text,'UTF8'),'sha256'),'hex');
  select * into v_existing from public.sync_operations where owner_id=v_owner and idempotency_key=p_idempotency_key;
  if found then
    if v_existing.request_hash <> v_hash or v_existing.object_type <> p_object_type or v_existing.object_id <> p_object_id then raise exception using errcode='23505', message='IDEMPOTENCY_KEY_REUSED'; end if;
    return coalesce(v_existing.response,jsonb_build_object('version',v_existing.object_version,'replayed',true));
  end if;
  execute format('select coalesce(version,0) from public.%I where owner_id=$1 and id=$2 for update',
    case p_object_type when 'event' then 'events' when 'contact' then 'contacts' when 'contact_method' then 'contact_methods' when 'tenant_company' then 'tenant_companies' when 'contact_company' then 'contact_companies' when 'card' then 'cards' when 'card_image' then 'card_images' when 'encounter' then 'encounters' when 'note' then 'notes' when 'tag' then 'tags' when 'contact_tag' then 'contact_tags' when 'update_proposal' then 'update_proposals' when 'field_provenance' then 'field_provenance' when 'data_request' then 'data_requests' end)
    into v_current using v_owner,p_object_id;
  v_current := coalesce(v_current,0);
  if v_current <> p_expected_version then
    insert into public.sync_operations(owner_id,id,object_type,object_id,object_version,operation_type,idempotency_key,sync_status,request_hash,response)
    values(v_owner,p_idempotency_key,p_object_type,p_object_id,p_object_version,p_operation_type,p_idempotency_key,'CONFLICT',v_hash,jsonb_build_object('current_version',v_current));
    raise exception using errcode='40001', message='STALE_VERSION', detail=jsonb_build_object('current_version',v_current)::text;
  end if;
  -- Writes are explicit per table so client payload can never choose SQL identifiers.
  if p_object_type='contact' then
    insert into public.contacts(owner_id,id,name,initials,personal_url,draft,lifecycle,version) values(v_owner,p_object_id,coalesce(p_payload->>'name',''),coalesce(p_payload->>'initials',''),nullif(p_payload->>'personalUrl',''),coalesce((p_payload->>'draft')::boolean,true),case when p_operation_type='DELETE' then 'DELETED' when p_operation_type='RESTRICT' then 'RESTRICTED' else coalesce(p_payload->>'lifecycle','ACTIVE') end,p_object_version)
    on conflict(owner_id,id) do update set name=excluded.name,initials=excluded.initials,personal_url=excluded.personal_url,draft=excluded.draft,lifecycle=excluded.lifecycle,version=excluded.version,updated_at=now();
  elsif p_object_type='event' then
    insert into public.events(owner_id,id,name,event_date,place,lifecycle,version) values(v_owner,p_object_id,coalesce(p_payload->>'name',''),p_payload->>'date',p_payload->>'place',case when p_operation_type='DELETE' then 'DELETED' when p_operation_type='RESTRICT' then 'RESTRICTED' else 'ACTIVE' end,p_object_version)
    on conflict(owner_id,id) do update set name=excluded.name,event_date=excluded.event_date,place=excluded.place,lifecycle=excluded.lifecycle,version=excluded.version,updated_at=now();
  elsif p_object_type='tenant_company' then
    insert into public.tenant_companies(owner_id,id,name,website,lifecycle,version) values(v_owner,p_object_id,coalesce(p_payload->>'name',''),p_payload->>'website',case when p_operation_type='DELETE' then 'DELETED' when p_operation_type='RESTRICT' then 'RESTRICTED' else 'ACTIVE' end,p_object_version)
    on conflict(owner_id,id) do update set name=excluded.name,website=excluded.website,lifecycle=excluded.lifecycle,version=excluded.version,updated_at=now();
  elsif p_object_type='card' then
    insert into public.cards(owner_id,id,contact_id,event_id,code,snapshot,acceptance,review_status,lifecycle,version) values(v_owner,p_object_id,nullif(coalesce(p_payload->>'contactId',p_payload->>'contact_id'),''),nullif(p_payload->>'event_id',''),coalesce(p_payload->>'code',''),p_payload,coalesce(p_payload->>'acceptance','LOCAL_ACCEPTED'),coalesce(p_payload->>'reviewStatus','UNCONFIRMED'),case when p_operation_type='DELETE' then 'DELETED' when p_operation_type='RESTRICT' then 'RESTRICTED' else 'ACTIVE' end,p_object_version)
    on conflict(owner_id,id) do update set contact_id=excluded.contact_id,event_id=excluded.event_id,code=excluded.code,snapshot=excluded.snapshot,acceptance=excluded.acceptance,review_status=excluded.review_status,lifecycle=excluded.lifecycle,version=excluded.version,updated_at=now();
  elsif p_object_type='card_image' then
    insert into public.card_images(owner_id,id,card_id,side,storage_path,checksum,size_bytes,content_type,upload_status,lifecycle,version) values(v_owner,p_object_id,p_payload->>'card_id',p_payload->>'side',p_payload->>'path',p_payload->>'checksum',(p_payload->>'size_bytes')::bigint,p_payload->>'content_type',case when p_operation_type='DELETE' then 'DELETED' else 'COMPLETE' end,case when p_operation_type='DELETE' then 'DELETED' when p_operation_type='RESTRICT' then 'RESTRICTED' else 'ACTIVE' end,p_object_version)
    on conflict(owner_id,id) do update set storage_path=excluded.storage_path,checksum=excluded.checksum,size_bytes=excluded.size_bytes,content_type=excluded.content_type,upload_status=excluded.upload_status,lifecycle=excluded.lifecycle,version=excluded.version,updated_at=now();
  elsif p_object_type='contact_method' then
    insert into public.contact_methods(owner_id,id,contact_id,kind,label,value,preferred,confirmed,source,lifecycle,version) values(v_owner,p_object_id,p_payload->>'contact_id',coalesce(p_payload->>'kind','OTHER'),coalesce(p_payload->>'label',''),coalesce(p_payload->>'value',''),coalesce((p_payload->>'preferred')::boolean,false),coalesce((p_payload->>'confirmed')::boolean,false),coalesce(p_payload->>'source',''),case when p_operation_type='DELETE' then 'DELETED' when p_operation_type='RESTRICT' then 'RESTRICTED' else coalesce(p_payload->>'status','ACTIVE') end,p_object_version)
    on conflict(owner_id,id) do update set label=excluded.label,value=excluded.value,preferred=excluded.preferred,confirmed=excluded.confirmed,source=excluded.source,lifecycle=excluded.lifecycle,version=excluded.version,updated_at=now();
  elsif p_object_type='contact_company' then
    insert into public.contact_companies(owner_id,id,contact_id,company_id,role,is_primary,source,lifecycle,version) values(v_owner,p_object_id,p_payload->>'contact_id',p_payload->>'company_id',coalesce(p_payload->>'role',''),coalesce((p_payload->>'primary')::boolean,false),coalesce(p_payload->>'source',''),case when p_operation_type='DELETE' then 'DELETED' when p_operation_type='RESTRICT' then 'RESTRICTED' else coalesce(p_payload->>'status','ACTIVE') end,p_object_version)
    on conflict(owner_id,id) do update set role=excluded.role,is_primary=excluded.is_primary,source=excluded.source,lifecycle=excluded.lifecycle,version=excluded.version,updated_at=now();
  elsif p_object_type='note' then
    insert into public.notes(owner_id,id,contact_id,body,lifecycle,version) values(v_owner,p_object_id,p_payload->>'contact_id',coalesce(p_payload->>'text',p_payload->>'body',''),case when p_operation_type='DELETE' then 'DELETED' when p_operation_type='RESTRICT' then 'RESTRICTED' else 'ACTIVE' end,p_object_version)
    on conflict(owner_id,id) do update set body=excluded.body,lifecycle=excluded.lifecycle,version=excluded.version,updated_at=now();
  elsif p_object_type='encounter' then
    insert into public.encounters(owner_id,id,contact_id,event_id,occurred_at,context,source_card_id,lifecycle,version) values(v_owner,p_object_id,p_payload->>'contact_id',nullif(p_payload->>'event_id',''),case when coalesce(p_payload->>'date','') ~ '^\d{4}-\d{2}-\d{2}T' then (p_payload->>'date')::timestamptz else null end,coalesce(p_payload->>'event',p_payload->>'context',''),nullif(p_payload->>'cardId',''),case when p_operation_type='DELETE' then 'DELETED' when p_operation_type='RESTRICT' then 'RESTRICTED' else 'ACTIVE' end,p_object_version)
    on conflict(owner_id,id) do update set event_id=excluded.event_id,occurred_at=excluded.occurred_at,context=excluded.context,source_card_id=excluded.source_card_id,lifecycle=excluded.lifecycle,version=excluded.version,updated_at=now();
  elsif p_object_type='tag' then
    insert into public.tags(owner_id,id,name,lifecycle,version) values(v_owner,p_object_id,coalesce(p_payload->>'name',''),case when p_operation_type='DELETE' then 'DELETED' else 'ACTIVE' end,p_object_version)
    on conflict(owner_id,id) do update set name=excluded.name,lifecycle=excluded.lifecycle,version=excluded.version,updated_at=now();
  elsif p_object_type='contact_tag' then
    insert into public.contact_tags(owner_id,id,contact_id,tag_id,lifecycle,version) values(v_owner,p_object_id,p_payload->>'contact_id',p_payload->>'tag_id',case when p_operation_type='DELETE' then 'DELETED' else 'ACTIVE' end,p_object_version)
    on conflict(owner_id,id) do update set lifecycle=excluded.lifecycle,version=excluded.version,updated_at=now();
  elsif p_object_type='update_proposal' then
    insert into public.update_proposals(owner_id,id,contact_id,target_type,target_id,proposal_type,proposed_value,target_version,status,source_card_id,lifecycle,version) values(v_owner,p_object_id,p_payload->>'contact_id',coalesce(p_payload->>'target','UNKNOWN'),nullif(p_payload->>'targetId',''),coalesce(p_payload->>'kind','UPDATE'),jsonb_build_object('value',p_payload->'value','metadata',p_payload->'metadata'),coalesce((p_payload->>'targetVersion')::integer,0),case coalesce(p_payload->>'status','PENDING') when 'ACCEPTED' then 'APPROVED' else coalesce(p_payload->>'status','PENDING') end,nullif(p_payload->>'sourceCardId',''),case when p_operation_type='DELETE' then 'DELETED' when p_operation_type='RESTRICT' then 'RESTRICTED' else 'ACTIVE' end,p_object_version)
    on conflict(owner_id,id) do update set proposed_value=excluded.proposed_value,target_version=excluded.target_version,status=excluded.status,lifecycle=excluded.lifecycle,version=excluded.version,updated_at=now();
  elsif p_object_type='field_provenance' then
    insert into public.field_provenance(owner_id,id,object_type,object_id,field_name,source_type,source_id,value_hash,lifecycle,version) values(v_owner,p_object_id,p_payload->>'object_type',p_payload->>'object_id',p_payload->>'field_name',p_payload->>'source_type',p_payload->>'source_id',p_payload->>'value_hash',case when p_operation_type='DELETE' then 'DELETED' when p_operation_type='RESTRICT' then 'RESTRICTED' else 'ACTIVE' end,p_object_version)
    on conflict(owner_id,id) do update set source_type=excluded.source_type,source_id=excluded.source_id,value_hash=excluded.value_hash,lifecycle=excluded.lifecycle,version=excluded.version,updated_at=now();
  elsif p_object_type='data_request' then
    insert into public.data_requests(owner_id,id,request_type,verification_email,scope,status,lifecycle,version) values(v_owner,p_object_id,p_payload->>'request_type',p_payload->>'verification_email',coalesce(p_payload->>'scope',''),'PENDING','ACTIVE',p_object_version)
    on conflict(owner_id,id) do update set scope=excluded.scope,status='PENDING',version=excluded.version,updated_at=now();
  else
    raise exception using errcode='0A000', message='OBJECT_ADAPTER_NOT_IMPLEMENTED';
  end if;
  insert into public.sync_operations(owner_id,id,object_type,object_id,object_version,operation_type,idempotency_key,sync_status,request_hash,response)
  values(v_owner,p_idempotency_key,p_object_type,p_object_id,p_object_version,p_operation_type,p_idempotency_key,'COMPLETE',v_hash,jsonb_build_object('version',p_object_version));
  insert into public.audit_log(owner_id,actor_id,action,object_type,object_id,object_version,metadata) values(v_owner,auth.uid(),'SYNC_'||p_operation_type,p_object_type,p_object_id,p_object_version,jsonb_build_object('idempotency_key',p_idempotency_key));
  return jsonb_build_object('version',p_object_version,'replayed',false);
end $$;
revoke all on function public.sync_object(text,text,text,integer,integer,text,jsonb) from public;
grant execute on function public.sync_object(text,text,text,integer,integer,text,jsonb) to authenticated;

commit;
