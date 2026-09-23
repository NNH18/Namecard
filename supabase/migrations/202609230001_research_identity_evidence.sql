begin;

-- Legacy RESOLVED rows were based on URL syntax/heuristics, so they must be
-- re-verified before they can authorize external research.
alter table public.company_resolution add column if not exists identity_version integer not null default 1 check(identity_version > 0);
alter table public.company_resolution add column if not exists input_hash text;
alter table public.company_resolution add column if not exists verified_at timestamptz;
alter table public.company_resolution drop constraint if exists company_resolution_status_check;
update public.company_resolution set status='CANDIDATE',reason='LEGACY_IDENTITY_REQUIRES_REVERIFICATION',verified_at=null where status='RESOLVED';
alter table public.company_resolution add constraint company_resolution_status_check check(status in ('UNRESOLVED','CANDIDATE','USER_CONFIRMED','SERVER_VERIFIED','INVALIDATED'));

alter table public.company_research add column if not exists resolution_id text;
alter table public.company_research add column if not exists identity_version integer not null default 1 check(identity_version > 0);
alter table public.company_research add column if not exists identity_status text;
alter table public.company_research drop constraint if exists company_research_status_check;
alter table public.company_research add constraint company_research_status_check check(status in ('RESEARCHING','COMPLETED','FAILED','UNRESOLVED','STALE'));
update public.company_research set status='STALE',error_code='LEGACY_IDENTITY_UNBOUND' where status='COMPLETED' and resolution_id is null;
alter table public.company_research add constraint company_research_resolution_fk foreign key(owner_id,resolution_id) references public.company_resolution(owner_id,id) on delete restrict;
create unique index if not exists company_research_identity_version on public.company_research(owner_id,company_id,identity_version) where status='COMPLETED';

alter table public.company_facts add column if not exists verification_status text not null default 'UNVERIFIED';
alter table public.company_facts add constraint company_facts_verification_status_check check(verification_status in ('SUPPORTED','UNVERIFIED','REJECTED'));

create table public.research_fact_evidence (
  owner_id uuid not null,
  id text not null,
  research_id text not null,
  fact_id text not null,
  source_id text not null,
  excerpt text not null check(length(excerpt) between 8 and 500),
  content_hash text,
  retrieved_at timestamptz not null,
  verification_status text not null default 'SUPPORTED' check(verification_status in ('SUPPORTED','REJECTED')),
  created_at timestamptz not null default now(),
  primary key(owner_id,id),
  foreign key(owner_id,research_id) references public.company_research(owner_id,id) on delete cascade,
  foreign key(owner_id,fact_id) references public.company_facts(owner_id,id) on delete cascade,
  foreign key(owner_id,source_id) references public.research_sources(owner_id,id) on delete cascade
);
create index research_fact_evidence_research on public.research_fact_evidence(owner_id,research_id,fact_id);
alter table public.research_fact_evidence enable row level security;
alter table public.research_fact_evidence force row level security;
create policy research_fact_evidence_select on public.research_fact_evidence for select using(public.can_access_owner(owner_id));
revoke insert,update,delete on table public.research_fact_evidence from anon,authenticated;
grant select on table public.research_fact_evidence to authenticated;

create or replace function public.export_account_data()
returns jsonb language sql stable security invoker set search_path = '' as $$
  select jsonb_build_object(
    'schema_version',2,'exported_at',now(),'owner_id',auth.uid(),
    'contacts',coalesce((select jsonb_agg(to_jsonb(x)) from public.contacts x where x.owner_id=auth.uid()),'[]'::jsonb),
    'contact_methods',coalesce((select jsonb_agg(to_jsonb(x)) from public.contact_methods x where x.owner_id=auth.uid()),'[]'::jsonb),
    'companies',coalesce((select jsonb_agg(to_jsonb(x)) from public.tenant_companies x where x.owner_id=auth.uid()),'[]'::jsonb),
    'contact_companies',coalesce((select jsonb_agg(to_jsonb(x)) from public.contact_companies x where x.owner_id=auth.uid()),'[]'::jsonb),
    'cards',coalesce((select jsonb_agg(to_jsonb(x)-'storage_path') from public.cards x where x.owner_id=auth.uid()),'[]'::jsonb),
    'card_images',coalesce((select jsonb_agg(to_jsonb(x)-'owner_id') from public.card_images x where x.owner_id=auth.uid()),'[]'::jsonb),
    'events',coalesce((select jsonb_agg(to_jsonb(x)) from public.events x where x.owner_id=auth.uid()),'[]'::jsonb),
    'encounters',coalesce((select jsonb_agg(to_jsonb(x)) from public.encounters x where x.owner_id=auth.uid()),'[]'::jsonb),
    'notes',coalesce((select jsonb_agg(to_jsonb(x)) from public.notes x where x.owner_id=auth.uid()),'[]'::jsonb),
    'tags',coalesce((select jsonb_agg(to_jsonb(x)) from public.tags x where x.owner_id=auth.uid()),'[]'::jsonb),
    'contact_tags',coalesce((select jsonb_agg(to_jsonb(x)) from public.contact_tags x where x.owner_id=auth.uid()),'[]'::jsonb),
    'update_proposals',coalesce((select jsonb_agg(to_jsonb(x)) from public.update_proposals x where x.owner_id=auth.uid()),'[]'::jsonb),
    'provenance',coalesce((select jsonb_agg(to_jsonb(x)) from public.field_provenance x where x.owner_id=auth.uid()),'[]'::jsonb),
    'company_resolution',coalesce((select jsonb_agg(to_jsonb(x)) from public.company_resolution x where x.owner_id=auth.uid()),'[]'::jsonb),
    'research',coalesce((select jsonb_agg(to_jsonb(x)) from public.company_research x where x.owner_id=auth.uid()),'[]'::jsonb),
    'research_facts',coalesce((select jsonb_agg(to_jsonb(x)) from public.company_facts x where x.owner_id=auth.uid()),'[]'::jsonb),
    'research_sources',coalesce((select jsonb_agg(to_jsonb(x)) from public.research_sources x where x.owner_id=auth.uid()),'[]'::jsonb),
    'research_fact_evidence',coalesce((select jsonb_agg(to_jsonb(x)) from public.research_fact_evidence x where x.owner_id=auth.uid()),'[]'::jsonb),
    'data_requests',coalesce((select jsonb_agg(to_jsonb(x)) from public.data_requests x where x.owner_id=auth.uid()),'[]'::jsonb)
  );
$$;
revoke all on function public.export_account_data() from public,anon;
grant execute on function public.export_account_data() to authenticated;

commit;
