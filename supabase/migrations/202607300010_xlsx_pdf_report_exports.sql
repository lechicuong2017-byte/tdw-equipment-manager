begin;

alter table public.export_jobs
  alter column output_format set default 'xlsx';

alter table public.export_jobs
  drop constraint if exists export_jobs_output_format_check;
alter table public.export_jobs
  add constraint export_jobs_output_format_check
  check (output_format in ('spreadsheet', 'google_doc', 'xlsx', 'pdf'));

create or replace function public.claim_export_job(
  target_export_type text,
  target_output_format text,
  target_idempotency_key text,
  target_filters jsonb default '{}'::jsonb
)
returns table (
  job_id uuid,
  job_status text,
  result_url text,
  is_new boolean
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  required_permission text;
  inserted_id uuid;
begin
  required_permission := case target_export_type
    when 'assets' then 'reports.assets.export'
    when 'maintenance' then 'reports.maintenance.export'
    when 'movement' then 'reports.movement.export'
    when 'software' then 'reports.software.export'
    else null
  end;

  if required_permission is null
    or not public.has_permission(required_permission)
  then
    raise exception 'Report export permission is required'
      using errcode = '42501';
  end if;

  if target_output_format not in ('xlsx', 'pdf')
    or coalesce(target_idempotency_key, '') !~ '^[a-f0-9]{64}$'
  then
    raise exception 'Invalid export job request' using errcode = '22023';
  end if;

  insert into public.export_jobs (
    export_type,
    output_format,
    idempotency_key,
    filters,
    status,
    requested_by
  )
  values (
    target_export_type,
    target_output_format,
    target_idempotency_key,
    coalesce(target_filters, '{}'::jsonb),
    'processing',
    auth.uid()
  )
  on conflict (requested_by, idempotency_key)
    where idempotency_key is not null
  do nothing
  returning id into inserted_id;

  return query
  select
    ej.id,
    ej.status,
    ej.result_url,
    coalesce(ej.id = inserted_id, false)
  from public.export_jobs ej
  where ej.requested_by = auth.uid()
    and ej.idempotency_key = target_idempotency_key
  limit 1;
end;
$$;

revoke all on function public.claim_export_job(text, text, text, jsonb)
  from public, anon;
grant execute on function public.claim_export_job(text, text, text, jsonb)
  to authenticated;

commit;
