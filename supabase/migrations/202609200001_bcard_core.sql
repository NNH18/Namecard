begin;

create extension if not exists pgcrypto;

create or replace function public.set_updated_at()
returns trigger language plpgsql security invoker set search_path = '' as $$
begin
  new.updated_at = now();
  return new;
end $$;

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.account_roles (
  owner_id uuid not null references auth.users(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null check (role in ('OWNER','ADMIN','MEMBER','AUDITOR')),
  created_at timestamptz not null default now(),
  primary key (owner_id, user_id)
);

create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  insert into public.profiles(id, display_name) values (new.id, coalesce(new.raw_user_meta_data->>'display_name','')) on conflict do nothing;
  insert into public.account_roles(owner_id, user_id, role) values (new.id, new.id, 'OWNER') on conflict do nothing;
  return new;
end $$;
drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created after insert on auth.users for each row execute procedure public.handle_new_user();

create table public.events (
  owner_id uuid not null references auth.users(id) on delete cascade,
  id text not null,
  name text not null,
  event_date text,
  place text,
  lifecycle text not null default 'ACTIVE' check (lifecycle in ('ACTIVE','RESTRICTED','DELETED')),
  version integer not null default 1 check (version > 0),
  deleted_at timestamptz,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  primary key(owner_id,id)
);

create table public.contacts (
  owner_id uuid not null references auth.users(id) on delete cascade,
  id text not null,
  name text not null default '', initials text not null default '', personal_url text,
  draft boolean not null default true,
  lifecycle text not null default 'ACTIVE' check (lifecycle in ('ACTIVE','RESTRICTED','DELETED')),
  version integer not null default 1 check (version > 0),
  deleted_at timestamptz,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  primary key(owner_id,id)
);

create table public.contact_methods (
  owner_id uuid not null, id text not null, contact_id text not null,
  kind text not null check(kind in ('PHONE','EMAIL','URL','OTHER')), label text not null default '', value text not null,
  preferred boolean not null default false, confirmed boolean not null default false, source text not null default '',
  lifecycle text not null default 'ACTIVE' check (lifecycle in ('ACTIVE','REVOKED','RESTRICTED','DELETED')),
  version integer not null default 1 check(version > 0), created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  primary key(owner_id,id), foreign key(owner_id,contact_id) references public.contacts(owner_id,id) on delete cascade
);
create unique index contact_method_active_value on public.contact_methods(owner_id,contact_id,kind,lower(value)) where lifecycle='ACTIVE';

create table public.tenant_companies (
  owner_id uuid not null references auth.users(id) on delete cascade, id text not null, name text not null, website text,
  lifecycle text not null default 'ACTIVE' check(lifecycle in ('ACTIVE','RESTRICTED','DELETED')),
  version integer not null default 1 check(version > 0), created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  primary key(owner_id,id)
);

create table public.contact_companies (
  owner_id uuid not null, id text not null, contact_id text not null, company_id text not null,
  role text not null default '', is_primary boolean not null default false, source text not null default '',
  lifecycle text not null default 'ACTIVE' check(lifecycle in ('ACTIVE','REVOKED','RESTRICTED','DELETED')),
  version integer not null default 1 check(version > 0), created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  primary key(owner_id,id),
  foreign key(owner_id,contact_id) references public.contacts(owner_id,id) on delete cascade,
  foreign key(owner_id,company_id) references public.tenant_companies(owner_id,id) on delete restrict
);

create table public.cards (
  owner_id uuid not null, id text not null, contact_id text, event_id text,
  code text not null default '', snapshot jsonb not null default '{}'::jsonb,
  acceptance text not null default 'LOCAL_ACCEPTED' check(acceptance in ('LOCAL_ACCEPTED','REJECTED')),
  review_status text not null default 'UNCONFIRMED' check(review_status in ('UNCONFIRMED','USER_CONFIRMED')),
  lifecycle text not null default 'ACTIVE' check(lifecycle in ('ACTIVE','RESTRICTED','DELETED')),
  version integer not null default 1 check(version > 0), deleted_at timestamptz,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  primary key(owner_id,id),
  foreign key(owner_id,contact_id) references public.contacts(owner_id,id) on delete set null (contact_id),
  foreign key(owner_id,event_id) references public.events(owner_id,id) on delete set null (event_id)
);

create table public.card_images (
  owner_id uuid not null, id text not null, card_id text not null, side text not null check(side in ('front','back')),
  storage_path text not null, checksum text not null, size_bytes bigint not null check(size_bytes > 0), content_type text not null,
  upload_status text not null default 'PENDING' check(upload_status in ('PENDING','COMPLETE','RETRY_WAIT','SUPERSEDED','DELETED')),
  lifecycle text not null default 'ACTIVE' check(lifecycle in ('ACTIVE','RESTRICTED','DELETED')),
  version integer not null default 1 check(version > 0), created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  primary key(owner_id,id), unique(owner_id,storage_path), unique(owner_id,card_id,side,checksum),
  foreign key(owner_id,card_id) references public.cards(owner_id,id) on delete cascade
);

create table public.encounters (
  owner_id uuid not null, id text not null, contact_id text not null, event_id text,
  occurred_at timestamptz, context text not null default '', source_card_id text,
  lifecycle text not null default 'ACTIVE' check(lifecycle in ('ACTIVE','RESTRICTED','DELETED')),
  version integer not null default 1 check(version > 0), created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  primary key(owner_id,id), foreign key(owner_id,contact_id) references public.contacts(owner_id,id) on delete cascade,
  foreign key(owner_id,event_id) references public.events(owner_id,id) on delete set null (event_id),
  foreign key(owner_id,source_card_id) references public.cards(owner_id,id) on delete set null (source_card_id)
);

create table public.notes (
  owner_id uuid not null, id text not null, contact_id text not null, body text not null,
  lifecycle text not null default 'ACTIVE' check(lifecycle in ('ACTIVE','RESTRICTED','DELETED')),
  version integer not null default 1 check(version > 0), created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  primary key(owner_id,id), foreign key(owner_id,contact_id) references public.contacts(owner_id,id) on delete cascade
);

create table public.tags (
  owner_id uuid not null references auth.users(id) on delete cascade, id text not null, name text not null,
  lifecycle text not null default 'ACTIVE' check(lifecycle in ('ACTIVE','DELETED')), version integer not null default 1,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(), primary key(owner_id,id), unique(owner_id,name)
);
create table public.contact_tags (
  owner_id uuid not null, id text not null, contact_id text not null, tag_id text not null,
  lifecycle text not null default 'ACTIVE' check(lifecycle in ('ACTIVE','DELETED')), version integer not null default 1,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(), primary key(owner_id,id), unique(owner_id,contact_id,tag_id),
  foreign key(owner_id,contact_id) references public.contacts(owner_id,id) on delete cascade,
  foreign key(owner_id,tag_id) references public.tags(owner_id,id) on delete cascade
);

create table public.update_proposals (
  owner_id uuid not null, id text not null, contact_id text not null, target_type text not null, target_id text,
  proposal_type text not null check(proposal_type in ('ADD','UPDATE','REMOVE')), proposed_value jsonb not null,
  target_version integer not null default 0, status text not null default 'PENDING' check(status in ('PENDING','APPROVED','REJECTED','SUPERSEDED')),
  source_card_id text, lifecycle text not null default 'ACTIVE', version integer not null default 1,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(), primary key(owner_id,id),
  foreign key(owner_id,contact_id) references public.contacts(owner_id,id) on delete cascade,
  foreign key(owner_id,source_card_id) references public.cards(owner_id,id) on delete set null (source_card_id)
);

create table public.field_provenance (
  owner_id uuid not null references auth.users(id) on delete cascade, id text not null, object_type text not null, object_id text not null,
  field_name text not null, source_type text not null check(source_type in ('CARD_OCR','USER_INPUT','IMPORT','RESEARCH','SYSTEM')),
  source_id text, value_hash text, observed_at timestamptz not null default now(), lifecycle text not null default 'ACTIVE', version integer not null default 1,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(), primary key(owner_id,id)
);

create table public.sync_operations (
  owner_id uuid not null references auth.users(id) on delete cascade, id text not null, object_type text not null, object_id text not null,
  object_version integer not null, operation_type text not null check(operation_type in ('UPSERT','DELETE','RESTRICT')),
  idempotency_key text not null, sync_status text not null check(sync_status in ('COMPLETE','CONFLICT','REJECTED')),
  request_hash text not null, response jsonb, created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  primary key(owner_id,id), unique(owner_id,idempotency_key)
);

create table public.data_requests (
  owner_id uuid not null references auth.users(id) on delete cascade, id text not null, request_type text not null,
  verification_email text not null, scope text not null default '', status text not null default 'PENDING' check(status in ('PENDING','VERIFIED','IN_PROGRESS','COMPLETED','REJECTED')),
  retention_until timestamptz, lifecycle text not null default 'ACTIVE', version integer not null default 1,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(), primary key(owner_id,id)
);

create table public.audit_log (
  owner_id uuid not null references auth.users(id) on delete cascade, id bigint generated always as identity,
  actor_id uuid, action text not null, object_type text not null, object_id text not null, object_version integer,
  metadata jsonb not null default '{}'::jsonb, created_at timestamptz not null default now(), primary key(owner_id,id)
);

create table public.company_resolution (
  owner_id uuid not null, id text not null, company_id text not null, candidate_domain text, candidate_website text, confidence numeric(5,2),
  status text not null check(status in ('RESOLVED','UNRESOLVED')), reason text, evidence jsonb not null default '[]'::jsonb, version integer not null default 1,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(), primary key(owner_id,id),
  foreign key(owner_id,company_id) references public.tenant_companies(owner_id,id) on delete cascade
);
create table public.company_research (
  owner_id uuid not null, id text not null, company_id text not null, domain text not null, status text not null check(status in ('RESEARCHING','COMPLETED','FAILED','UNRESOLVED')),
  summary text, confidence numeric(5,2), cache_key text not null, expires_at timestamptz, error_code text, version integer not null default 1,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(), primary key(owner_id,id), unique(owner_id,cache_key),
  foreign key(owner_id,company_id) references public.tenant_companies(owner_id,id) on delete cascade
);
create table public.company_facts (
  owner_id uuid not null, id text not null, research_id text not null, fact_key text not null, fact_value jsonb not null, confidence numeric(5,2), version integer not null default 1,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(), primary key(owner_id,id),
  foreign key(owner_id,research_id) references public.company_research(owner_id,id) on delete cascade
);
create table public.research_sources (
  owner_id uuid not null, id text not null, research_id text not null, url text not null, title text not null, retrieved_at timestamptz not null, fact_keys text[] not null default '{}', version integer not null default 1,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(), primary key(owner_id,id),
  foreign key(owner_id,research_id) references public.company_research(owner_id,id) on delete cascade
);
create table public.research_rate_limits (
  owner_id uuid primary key references auth.users(id) on delete cascade, window_started_at timestamptz not null default now(), request_count integer not null default 0 check(request_count >= 0), updated_at timestamptz not null default now()
);

create index contacts_owner_lifecycle_name on public.contacts(owner_id,lifecycle,lower(name));
create index cards_owner_contact on public.cards(owner_id,contact_id);
create index notes_owner_contact on public.notes(owner_id,contact_id);
create index research_owner_domain on public.company_research(owner_id,domain,expires_at);
create index audit_owner_created on public.audit_log(owner_id,created_at desc);

do $$ declare table_name text; begin
  foreach table_name in array array['profiles','account_roles','events','contacts','contact_methods','tenant_companies','contact_companies','cards','card_images','encounters','notes','tags','contact_tags','update_proposals','field_provenance','sync_operations','data_requests','audit_log','company_resolution','company_research','company_facts','research_sources','research_rate_limits'] loop
    execute format('alter table public.%I enable row level security', table_name);
    execute format('alter table public.%I force row level security', table_name);
  end loop;
end $$;

create or replace function public.can_access_owner(target_owner uuid, required_roles text[] default array['OWNER','ADMIN','MEMBER','AUDITOR'])
returns boolean language sql stable security definer set search_path = '' as $$
  select auth.uid() = target_owner or exists(select 1 from public.account_roles r where r.owner_id=target_owner and r.user_id=auth.uid() and r.role=any(required_roles));
$$;
revoke all on function public.can_access_owner(uuid,text[]) from public;
grant execute on function public.can_access_owner(uuid,text[]) to authenticated;

create policy profiles_select on public.profiles for select using(id=auth.uid());
create policy profiles_update on public.profiles for update using(id=auth.uid()) with check(id=auth.uid());
create policy roles_select on public.account_roles for select using(public.can_access_owner(owner_id));
create policy roles_owner_write on public.account_roles for all using(public.can_access_owner(owner_id,array['OWNER'])) with check(public.can_access_owner(owner_id,array['OWNER']));

do $$ declare table_name text; begin
  foreach table_name in array array['events','contacts','contact_methods','tenant_companies','contact_companies','cards','card_images','encounters','notes','tags','contact_tags','update_proposals','field_provenance','sync_operations','data_requests','company_resolution','company_research','company_facts','research_sources','research_rate_limits'] loop
    execute format('create policy %I on public.%I for select using (public.can_access_owner(owner_id))', table_name||'_select', table_name);
    execute format('create policy %I on public.%I for insert with check (public.can_access_owner(owner_id,array[''OWNER'',''ADMIN'',''MEMBER'']))', table_name||'_insert', table_name);
    execute format('create policy %I on public.%I for update using (public.can_access_owner(owner_id,array[''OWNER'',''ADMIN'',''MEMBER''])) with check (public.can_access_owner(owner_id,array[''OWNER'',''ADMIN'',''MEMBER'']))', table_name||'_update', table_name);
    execute format('create policy %I on public.%I for delete using (public.can_access_owner(owner_id,array[''OWNER'',''ADMIN'']))', table_name||'_delete', table_name);
  end loop;
end $$;
create policy audit_log_select on public.audit_log for select using(public.can_access_owner(owner_id,array['OWNER','ADMIN','AUDITOR']));
revoke insert,update,delete on public.audit_log from anon,authenticated;

insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values('namecard-images','namecard-images',false,15728640,array['image/jpeg','image/png','image/webp','image/heic','image/heif'])
on conflict(id) do update set public=false,file_size_limit=excluded.file_size_limit,allowed_mime_types=excluded.allowed_mime_types;
create policy namecard_images_select on storage.objects for select to authenticated using(bucket_id='namecard-images' and (storage.foldername(name))[1]=auth.uid()::text);
create policy namecard_images_insert on storage.objects for insert to authenticated with check(bucket_id='namecard-images' and (storage.foldername(name))[1]=auth.uid()::text);
create policy namecard_images_update on storage.objects for update to authenticated using(bucket_id='namecard-images' and (storage.foldername(name))[1]=auth.uid()::text) with check(bucket_id='namecard-images' and (storage.foldername(name))[1]=auth.uid()::text);
create policy namecard_images_delete on storage.objects for delete to authenticated using(bucket_id='namecard-images' and (storage.foldername(name))[1]=auth.uid()::text);

commit;
