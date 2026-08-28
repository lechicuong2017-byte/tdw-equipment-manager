begin;

alter table public.vehicle_insurances
  add column if not exists archived_at timestamptz,
  add column if not exists archived_by uuid references public.profiles(id) on delete set null,
  add column if not exists renewed_from_id uuid references public.vehicle_insurances(id) on delete set null,
  add column if not exists renewed_at timestamptz,
  add column if not exists renewed_by uuid references public.profiles(id) on delete set null,
  add column if not exists renewed_by_name text not null default '';

create index if not exists vehicle_insurances_active_due_idx
  on public.vehicle_insurances (expires_on, vehicle_id)
  where archived_at is null;

create index if not exists vehicle_insurances_archived_idx
  on public.vehicle_insurances (vehicle_id, archived_at desc)
  where archived_at is not null;

create unique index if not exists vehicle_insurances_renewed_from_unique
  on public.vehicle_insurances (renewed_from_id)
  where renewed_from_id is not null;

create or replace function public.renew_vehicle_insurance(
  target_source_insurance_id uuid,
  target_vehicle_id uuid,
  target_insurance_name text,
  target_insurance_type text,
  target_insurance_company text,
  target_certificate_number text,
  target_starts_on date,
  target_expires_on date,
  target_cost numeric,
  target_reminder_days integer,
  target_note text
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  source_record public.vehicle_insurances%rowtype;
  renewed_record_id uuid;
  renewal_time timestamptz := clock_timestamp();
  actor_name text;
begin
  select *
  into source_record
  from public.vehicle_insurances
  where id = target_source_insurance_id
    and archived_at is null
  for update;

  if not found then
    raise exception 'VEHICLE_INSURANCE_NOT_ACTIVE';
  end if;

  if source_record.vehicle_id <> target_vehicle_id then
    raise exception 'VEHICLE_INSURANCE_VEHICLE_MISMATCH';
  end if;

  if not public.can_access_vehicle(source_record.vehicle_id, 'vehicles.manage') then
    raise exception 'VEHICLE_INSURANCE_RENEWAL_FORBIDDEN';
  end if;

  if target_starts_on is null or target_expires_on is null or target_expires_on < target_starts_on then
    raise exception 'VEHICLE_INSURANCE_INVALID_DATES';
  end if;

  if btrim(coalesce(target_insurance_name, '')) = ''
    or btrim(coalesce(target_insurance_type, '')) = ''
    or btrim(coalesce(target_insurance_company, '')) = '' then
    raise exception 'VEHICLE_INSURANCE_REQUIRED_FIELDS';
  end if;

  if coalesce(target_cost, 0) < 0 or target_reminder_days not between 1 and 365 then
    raise exception 'VEHICLE_INSURANCE_INVALID_VALUES';
  end if;

  select coalesce(nullif(btrim(full_name), ''), email, 'Người dùng hệ thống')
  into actor_name
  from public.profiles
  where id = auth.uid();

  insert into public.vehicle_insurances (
    vehicle_id,
    insurance_name,
    insurance_type,
    insurance_company,
    certificate_number,
    starts_on,
    expires_on,
    cost,
    reminder_days,
    note,
    created_by,
    updated_by,
    renewed_from_id,
    renewed_at,
    renewed_by,
    renewed_by_name
  ) values (
    target_vehicle_id,
    btrim(target_insurance_name),
    btrim(target_insurance_type),
    btrim(target_insurance_company),
    btrim(coalesce(target_certificate_number, '')),
    target_starts_on,
    target_expires_on,
    coalesce(target_cost, 0),
    target_reminder_days,
    btrim(coalesce(target_note, '')),
    auth.uid(),
    auth.uid(),
    source_record.id,
    renewal_time,
    auth.uid(),
    coalesce(actor_name, 'Người dùng hệ thống')
  )
  returning id into renewed_record_id;

  update public.vehicle_insurances
  set archived_at = renewal_time,
      archived_by = auth.uid(),
      updated_by = auth.uid()
  where id = source_record.id;

  return renewed_record_id;
exception
  when unique_violation then
    raise exception 'VEHICLE_INSURANCE_ALREADY_RENEWED';
end;
$$;

revoke all on function public.renew_vehicle_insurance(
  uuid,
  uuid,
  text,
  text,
  text,
  text,
  date,
  date,
  numeric,
  integer,
  text
) from public;

grant execute on function public.renew_vehicle_insurance(
  uuid,
  uuid,
  text,
  text,
  text,
  text,
  date,
  date,
  numeric,
  integer,
  text
) to authenticated;

commit;
