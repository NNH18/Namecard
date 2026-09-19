begin;
create extension if not exists pgtap with schema extensions;
select plan(7);

insert into auth.users(id,email,encrypted_password,aud,role) values
  ('10000000-0000-4000-8000-000000000001','a@example.test','x','authenticated','authenticated'),
  ('20000000-0000-4000-8000-000000000002','b@example.test','x','authenticated','authenticated');

set local role authenticated;
select set_config('request.jwt.claim.sub','10000000-0000-4000-8000-000000000001',true);
insert into public.contacts(owner_id,id,name,initials,draft,version) values('10000000-0000-4000-8000-000000000001','contact-a','Account A','AA',false,1);
select is((select count(*)::integer from public.contacts where id='contact-a'),1,'owner A reads own contact');

select set_config('request.jwt.claim.sub','20000000-0000-4000-8000-000000000002',true);
select is((select count(*)::integer from public.contacts where id='contact-a'),0,'owner B cannot read owner A contact');
select throws_ok($$insert into public.contact_methods(owner_id,id,contact_id,kind,value) values('20000000-0000-4000-8000-000000000002','cross-method','contact-a','EMAIL','b@example.test')$$,'23503',null,'composite FK blocks cross-owner link');
select is((select count(*)::integer from storage.objects where bucket_id='namecard-images' and name like '10000000-0000-4000-8000-000000000001/%'),0,'owner B cannot list owner A image metadata');

select set_config('request.jwt.claim.sub','10000000-0000-4000-8000-000000000001',true);
select is((public.sync_object('contact','sync-contact','UPSERT',0,1,'sync-contact-v1','{"name":"Synced","initials":"S","draft":false}'::jsonb)->>'version')::integer,1,'first optimistic write succeeds');
select is((public.sync_object('contact','sync-contact','UPSERT',0,1,'sync-contact-v1','{"name":"Synced","initials":"S","draft":false}'::jsonb)->>'version')::integer,1,'same idempotency key replays one ACK');
select throws_ok($$select public.sync_object('contact','sync-contact','UPSERT',0,2,'sync-contact-v2-stale','{"name":"Stale","initials":"S","draft":false}'::jsonb)$$,'40001','STALE_VERSION','stale write cannot overwrite current version');

select * from finish();
rollback;
