begin;

create or replace function public.export_account_data()
returns jsonb language sql stable security invoker set search_path = '' as $$
  select jsonb_build_object(
    'schema_version',1,'exported_at',now(),'owner_id',auth.uid(),
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
    'research',coalesce((select jsonb_agg(to_jsonb(x)) from public.company_research x where x.owner_id=auth.uid()),'[]'::jsonb),
    'research_facts',coalesce((select jsonb_agg(to_jsonb(x)) from public.company_facts x where x.owner_id=auth.uid()),'[]'::jsonb),
    'research_sources',coalesce((select jsonb_agg(to_jsonb(x)) from public.research_sources x where x.owner_id=auth.uid()),'[]'::jsonb),
    'data_requests',coalesce((select jsonb_agg(to_jsonb(x)) from public.data_requests x where x.owner_id=auth.uid()),'[]'::jsonb)
  );
$$;
revoke all on function public.export_account_data() from public;
grant execute on function public.export_account_data() to authenticated;

create or replace function public.purge_expired_research()
returns integer language plpgsql security definer set search_path = '' as $$
declare affected integer;
begin
  delete from public.company_research where expires_at < now() - interval '30 days';
  get diagnostics affected = row_count;
  return affected;
end $$;
revoke all on function public.purge_expired_research() from public,anon,authenticated;

commit;
