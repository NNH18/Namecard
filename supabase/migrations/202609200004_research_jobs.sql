begin;

create table public.research_jobs (
  owner_id uuid not null references auth.users(id) on delete cascade,
  cache_key text not null,
  id uuid not null default gen_random_uuid(),
  status text not null check(status in ('RUNNING','COMPLETED','FAILED')),
  lease_until timestamptz not null,
  error_code text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key(owner_id,cache_key), unique(id)
);
alter table public.research_jobs enable row level security;
alter table public.research_jobs force row level security;
create policy research_jobs_select on public.research_jobs for select using(public.can_access_owner(owner_id));

create or replace function public.claim_research_job(p_owner_id uuid, p_cache_key text, p_force boolean default false)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_id uuid := gen_random_uuid(); v_claimed uuid;
begin
  if current_user not in ('service_role','postgres','supabase_admin') then raise exception using errcode='42501',message='SERVICE_ROLE_REQUIRED'; end if;
  insert into public.research_jobs(owner_id,cache_key,id,status,lease_until,created_at,updated_at)
  values(p_owner_id,p_cache_key,v_id,'RUNNING',now()+interval '2 minutes',now(),now())
  on conflict(owner_id,cache_key) do update set id=v_id,status='RUNNING',lease_until=now()+interval '2 minutes',error_code=null,updated_at=now()
  where p_force or public.research_jobs.status <> 'RUNNING' or public.research_jobs.lease_until < now()
  returning id into v_claimed;
  return jsonb_build_object('claimed',v_claimed is not null,'job_id',coalesce(v_claimed,(select id from public.research_jobs where owner_id=p_owner_id and cache_key=p_cache_key)));
end $$;
revoke all on function public.claim_research_job(uuid,text,boolean) from public,anon,authenticated;
grant execute on function public.claim_research_job(uuid,text,boolean) to service_role;

commit;
