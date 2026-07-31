create schema if not exists private;

revoke all on schema private from public;
grant usage on schema private to authenticated, service_role;

create or replace function private.current_tenant_id()
returns text
language sql
stable
security definer
set search_path = pg_catalog, public, auth
as $$
  select up."tenantId"
  from public."UserProfile" up
  where up."authUserId" = auth.uid()::text
    and up."status" = 'active'
  limit 1;
$$;

alter function private.current_tenant_id() owner to postgres;
revoke all on function private.current_tenant_id() from public;
grant execute on function private.current_tenant_id() to authenticated, service_role;

do $$
declare
  policy_record record;
begin
  for policy_record in
    select schemaname, tablename, policyname
    from pg_policies
    where schemaname = 'public'
      and (
        coalesce(qual, '') ilike '%current_tenant_id%'
        or coalesce(with_check, '') ilike '%current_tenant_id%'
      )
  loop
    execute format(
      'alter policy %I on %I.%I using (%I = private.current_tenant_id()) with check (%I = private.current_tenant_id())',
      policy_record.policyname,
      policy_record.schemaname,
      policy_record.tablename,
      'tenantId',
      'tenantId'
    );
  end loop;
end
$$;

drop function public.current_tenant_id();
