begin;

alter table public.vehicle_inspections
  add column if not exists archived_at timestamptz,
  add column if not exists archived_by uuid references public.profiles(id) on delete set null,
  add column if not exists archived_by_name text not null default '',
  add column if not exists renewed_from_id uuid references public.vehicle_inspections(id) on delete set null,
  add column if not exists renewed_at timestamptz,
  add column if not exists renewed_by uuid references public.profiles(id) on delete set null,
  add column if not exists renewed_by_name text not null default '';

-- Dữ liệu cũ chưa có quan hệ gia hạn. Với mỗi xe, hồ sơ có ngày đăng kiểm
-- mới nhất là hiện hành; các hồ sơ trước đó được giữ nguyên trong lịch sử.
with ordered as (
  select
    inspection.id,
    inspection.created_by,
    inspection.created_at,
    lag(inspection.id) over (
      partition by inspection.vehicle_id
      order by inspection.inspection_date, inspection.created_at, inspection.id
    ) as previous_id,
    lead(inspection.created_at) over (
      partition by inspection.vehicle_id
      order by inspection.inspection_date, inspection.created_at, inspection.id
    ) as next_created_at,
    lead(inspection.created_by) over (
      partition by inspection.vehicle_id
      order by inspection.inspection_date, inspection.created_at, inspection.id
    ) as next_created_by,
    row_number() over (
      partition by inspection.vehicle_id
      order by inspection.inspection_date desc, inspection.created_at desc, inspection.id desc
    ) as latest_rank
  from public.vehicle_inspections inspection
), archived as (
  update public.vehicle_inspections inspection
  set
    archived_at = coalesce(ordered.next_created_at, clock_timestamp()),
    archived_by = ordered.next_created_by,
    archived_by_name = coalesce(
      nullif(btrim(profile.full_name), ''),
      profile.email,
      'Dữ liệu lịch sử'
    )
  from ordered
  left join public.profiles profile on profile.id = ordered.next_created_by
  where inspection.id = ordered.id
    and ordered.latest_rank > 1
    and inspection.archived_at is null
  returning inspection.id
)
select count(*) from archived;

with ordered as (
  select
    inspection.id,
    inspection.created_by,
    inspection.created_at,
    lag(inspection.id) over (
      partition by inspection.vehicle_id
      order by inspection.inspection_date, inspection.created_at, inspection.id
    ) as previous_id
  from public.vehicle_inspections inspection
)
update public.vehicle_inspections inspection
set
  renewed_from_id = ordered.previous_id,
  renewed_at = inspection.created_at,
  renewed_by = inspection.created_by,
  renewed_by_name = coalesce(
    nullif(btrim(profile.full_name), ''),
    profile.email,
    'Dữ liệu lịch sử'
  )
from ordered
left join public.profiles profile on profile.id = ordered.created_by
where inspection.id = ordered.id
  and ordered.previous_id is not null
  and inspection.renewed_from_id is null;

create unique index if not exists vehicle_inspections_one_active_per_vehicle
  on public.vehicle_inspections (vehicle_id)
  where archived_at is null;

create unique index if not exists vehicle_inspections_renewed_from_unique
  on public.vehicle_inspections (renewed_from_id)
  where renewed_from_id is not null;

create index if not exists vehicle_inspections_active_due_idx
  on public.vehicle_inspections (expires_on, vehicle_id)
  where archived_at is null;

create index if not exists vehicle_inspections_history_idx
  on public.vehicle_inspections (vehicle_id, archived_at desc)
  where archived_at is not null;

create or replace function public.renew_vehicle_inspection(
  target_source_inspection_id uuid,
  target_vehicle_id uuid,
  target_inspection_date date,
  target_expires_on date,
  target_cost numeric,
  target_reminder_days integer,
  target_certificate_number text,
  target_inspection_center text,
  target_seat_count integer,
  target_odometer_km integer,
  target_note text
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  source_record public.vehicle_inspections%rowtype;
  renewed_record_id uuid;
  renewal_time timestamptz := clock_timestamp();
  actor_name text;
begin
  select *
  into source_record
  from public.vehicle_inspections
  where id = target_source_inspection_id
    and archived_at is null
  for update;

  if not found then
    raise exception 'VEHICLE_INSPECTION_NOT_ACTIVE';
  end if;

  if source_record.vehicle_id <> target_vehicle_id then
    raise exception 'VEHICLE_INSPECTION_VEHICLE_MISMATCH';
  end if;

  if not public.can_access_vehicle(source_record.vehicle_id, 'vehicles.manage') then
    raise exception 'VEHICLE_INSPECTION_RENEWAL_FORBIDDEN';
  end if;

  if target_inspection_date is null
    or target_expires_on is null
    or target_expires_on < target_inspection_date
    or target_inspection_date <= source_record.inspection_date then
    raise exception 'VEHICLE_INSPECTION_INVALID_DATES';
  end if;

  if coalesce(target_cost, 0) < 0
    or target_reminder_days not between 1 and 180
    or (target_seat_count is not null and target_seat_count not between 1 and 100)
    or (target_odometer_km is not null and target_odometer_km < 0) then
    raise exception 'VEHICLE_INSPECTION_INVALID_VALUES';
  end if;

  select coalesce(nullif(btrim(full_name), ''), email, 'Người dùng hệ thống')
  into actor_name
  from public.profiles
  where id = auth.uid();

  update public.vehicle_inspections
  set
    archived_at = renewal_time,
    archived_by = auth.uid(),
    archived_by_name = coalesce(actor_name, 'Người dùng hệ thống'),
    updated_by = auth.uid()
  where id = source_record.id;

  insert into public.vehicle_inspections (
    vehicle_id,
    inspection_date,
    expires_on,
    cost,
    reminder_days,
    certificate_number,
    inspection_center,
    seat_count,
    odometer_km,
    note,
    created_by,
    updated_by,
    renewed_from_id,
    renewed_at,
    renewed_by,
    renewed_by_name
  ) values (
    target_vehicle_id,
    target_inspection_date,
    target_expires_on,
    coalesce(target_cost, 0),
    target_reminder_days,
    btrim(coalesce(target_certificate_number, '')),
    btrim(coalesce(target_inspection_center, '')),
    target_seat_count,
    target_odometer_km,
    btrim(coalesce(target_note, '')),
    auth.uid(),
    auth.uid(),
    source_record.id,
    renewal_time,
    auth.uid(),
    coalesce(actor_name, 'Người dùng hệ thống')
  )
  returning id into renewed_record_id;

  return renewed_record_id;
exception
  when unique_violation then
    raise exception 'VEHICLE_INSPECTION_ALREADY_RENEWED';
end;
$$;

revoke all on function public.renew_vehicle_inspection(
  uuid,
  uuid,
  date,
  date,
  numeric,
  integer,
  text,
  text,
  integer,
  integer,
  text
) from public;

grant execute on function public.renew_vehicle_inspection(
  uuid,
  uuid,
  date,
  date,
  numeric,
  integer,
  text,
  text,
  integer,
  integer,
  text
) to authenticated;

comment on column public.vehicle_inspections.archived_at is
  'Thời điểm hồ sơ được thay thế bởi lần đăng kiểm mới; hồ sơ vẫn được giữ trong lịch sử.';

commit;
