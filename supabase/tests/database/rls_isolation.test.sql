begin;
create extension if not exists pgtap with schema extensions;
select plan(19);

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

select * from finish();
rollback;
