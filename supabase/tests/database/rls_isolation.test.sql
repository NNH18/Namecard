begin;
create extension if not exists pgtap with schema extensions;
select plan(27);

insert into auth.users(id,email,encrypted_password,aud,role) values
  ('10000000-0000-4000-8000-000000000001','a@example.test','x','authenticated','authenticated'),
  ('20000000-0000-4000-8000-000000000002','b@example.test','x','authenticated','authenticated');

set local role authenticated;
select set_config('request.jwt.claim.sub','10000000-0000-4000-8000-000000000001',true);
select set_config('request.jwt.claim.role','authenticated',true);

select throws_ok($$insert into public.contacts(owner_id,id,name,initials,draft,version) values('10000000-0000-4000-8000-000000000001','direct-contact','Bypass','B',false,1)$$,'42501',null,'authenticated direct DML is blocked');
select is(public.sync_object('contact','contact-a','UPSERT',0,1,'contact-a-v1','{"name":"Account A","initials":"AA","draft":false}'::jsonb)->>'status','COMPLETE','approved sync RPC works');
select is((select count(*)::integer from public.contacts where id='contact-a'),1,'owner A reads own contact');

select set_config('request.jwt.claim.sub','20000000-0000-4000-8000-000000000002',true);
select is((select count(*)::integer from public.contacts where id='contact-a'),0,'owner B cannot read owner A contact');
select throws_ok($$select public.sync_object('contact_method','cross-method','UPSERT',0,1,'cross-method-v1','{"contact_id":"contact-a","kind":"EMAIL","value":"b@example.test"}'::jsonb)$$,'23503',null,'composite FK blocks cross-owner link through RPC');
select is((select count(*)::integer from storage.objects where bucket_id='namecard-images' and name like '10000000-0000-4000-8000-000000000001/%'),0,'owner B cannot list owner A image metadata');
select throws_ok($$select public.locate_privacy_case_candidates('00000000-0000-0000-0000-000000000000','20000000-0000-4000-8000-000000000002','ordinary user lookup')$$,'42501',null,'ordinary user cannot run cross-tenant DSR lookup');

select set_config('request.jwt.claim.sub','10000000-0000-4000-8000-000000000001',true);
select is((public.sync_object('contact','sync-contact','UPSERT',0,1,'sync-contact-v1','{"name":"Synced","initials":"S","draft":false}'::jsonb)->>'version')::integer,1,'first optimistic write succeeds');
select is((public.sync_object('contact','sync-contact','UPSERT',0,1,'sync-contact-v1','{"name":"Synced","initials":"S","draft":false}'::jsonb)->>'version')::integer,1,'same idempotency key replays one ACK');
select is(public.sync_object('contact','sync-contact','UPSERT',0,2,'sync-contact-v2-stale','{"name":"Stale","initials":"S","draft":false}'::jsonb)->>'status','CONFLICT','stale write returns durable conflict protocol');
select is((select name from public.contacts where id='sync-contact'),'Synced','stale conflict leaves target unchanged');
select is((select sync_status from public.sync_operations where idempotency_key='sync-contact-v2-stale'),'CONFLICT','conflict evidence survives transaction');

select is(public.sync_object('card','never-created','DELETE',0,1,'never-created-delete','{"id":"never-created"}'::jsonb)->>'status','ABSENT','delete of never-sent object is a no-op');
select is((select count(*)::integer from public.cards where id='never-created'),0,'DELETE does not insert a PII row');

select is(public.normalize_contact_method('PHONE','0909 123 456'),public.normalize_contact_method('PHONE','+84 909 123 456'),'VN phone formats normalize identically');
select is(public.normalize_contact_method('PHONE','0909123456'),public.normalize_contact_method('PHONE','+84 909 123 456'),'compact VN phone matches international form');
select has_column('public','company_resolution','identity_version','company identity has an explicit version boundary');
select has_table('public','research_fact_evidence','research fact evidence table exists');
select throws_ok($$insert into public.research_fact_evidence(owner_id,id,research_id,fact_id,source_id,excerpt,retrieved_at) values('10000000-0000-4000-8000-000000000001','evidence-bypass','missing','missing','missing','unsupported excerpt',now())$$,'42501',null,'authenticated direct evidence DML is blocked');

select has_column('public','company_facts','derivation_type','research facts distinguish extracted and inferred claims');
select has_function('public','persist_company_research_bundle',array['uuid','jsonb','jsonb','jsonb','jsonb'],'atomic research persistence RPC exists');

set local role service_role;
insert into public.tenant_companies(owner_id,id,name,website,lifecycle,version)
values('10000000-0000-4000-8000-000000000001','company-research-test','Example','https://example.test','ACTIVE',1);
insert into public.company_resolution(owner_id,id,company_id,candidate_domain,candidate_website,status,reason,evidence,identity_version,input_hash,verified_at,version)
values('10000000-0000-4000-8000-000000000001','resolution-research-test','company-research-test','example.test','https://example.test','SERVER_VERIFIED','TEST','[]',1,'test',now(),1);
select lives_ok($sql$
  select public.persist_company_research_bundle(
    '10000000-0000-4000-8000-000000000001',
    '{"id":"research-test","company_id":"company-research-test","domain":"example.test","summary":"Example builds software","cache_key":"company-research-test|v1|example.test","expires_at":"2026-12-31T00:00:00Z","resolution_id":"resolution-research-test","identity_version":1,"identity_status":"SERVER_VERIFIED","action":"RESEARCH_CREATE"}'::jsonb,
    '[{"id":"source-test","url":"https://example.test","title":"Example","retrieved_at":"2026-09-23T00:00:00Z","fact_keys":["industry"]}]'::jsonb,
    '[{"id":"fact-test","fact_key":"industry","fact_value":"Software","derivation_type":"EXTRACTED","verification_status":"SUPPORTED"}]'::jsonb,
    '[{"id":"evidence-test","fact_id":"fact-test","source_id":"source-test","excerpt":"Example builds software","content_hash":"hash","retrieved_at":"2026-09-23T00:00:00Z","verification_status":"SUPPORTED"}]'::jsonb
  )
$sql$,'valid research bundle commits atomically');
select is((select status from public.company_research where owner_id='10000000-0000-4000-8000-000000000001' and id='research-test'),'COMPLETED','research is complete only after its evidence is stored');
select is((select count(*)::integer from public.company_facts where owner_id='10000000-0000-4000-8000-000000000001' and research_id='research-test'),1,'one evidence-bound claim is stored');
select throws_ok($sql$
  select public.persist_company_research_bundle(
    '10000000-0000-4000-8000-000000000001',
    '{"id":"research-test","company_id":"company-research-test","domain":"example.test","summary":"Broken replacement","cache_key":"company-research-test|v1|example.test","expires_at":"2026-12-31T00:00:00Z","resolution_id":"resolution-research-test","identity_version":1,"identity_status":"SERVER_VERIFIED","action":"RESEARCH_REFRESH"}'::jsonb,
    '[{"id":"source-new","url":"https://example.test","title":"Example","retrieved_at":"2026-09-23T00:00:00Z","fact_keys":["industry"]}]'::jsonb,
    '[{"id":"fact-new","fact_key":"industry","fact_value":"Broken","derivation_type":"INFERRED","verification_status":"SUPPORTED"}]'::jsonb,
    '[{"id":"evidence-new","fact_id":"missing-fact","source_id":"source-new","excerpt":"Example builds software","content_hash":"hash","retrieved_at":"2026-09-23T00:00:00Z","verification_status":"SUPPORTED"}]'::jsonb
  )
$sql$,'23503',null,'invalid replacement rolls back the complete research bundle');
select is((select summary from public.company_research where owner_id='10000000-0000-4000-8000-000000000001' and id='research-test'),'Example builds software','failed replacement preserves the previous complete bundle');
select is((select count(*)::integer from public.company_facts where owner_id='10000000-0000-4000-8000-000000000001' and research_id='research-test' and id='fact-test'),1,'failed replacement preserves prior evidence-bound claims');

select * from finish();
rollback;
