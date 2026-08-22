begin;

create table if not exists public.vehicle_insurances (
  id uuid primary key default gen_random_uuid(),
  vehicle_id uuid not null references public.vehicles(id) on delete cascade,
  insurance_name text not null,
  insurance_type text not null,
  insurance_company text not null,
  certificate_number text not null default '',
  starts_on date not null,
  expires_on date not null,
  cost numeric(18, 2) not null default 0 check (cost >= 0),
  reminder_days integer not null default 30 check (reminder_days between 1 and 365),
  note text not null default '',
  created_by uuid references public.profiles(id) on delete set null default auth.uid(),
  updated_by uuid references public.profiles(id) on delete set null default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (expires_on >= starts_on)
);

create index if not exists vehicle_insurances_due_idx
  on public.vehicle_insurances (expires_on, vehicle_id);
create index if not exists vehicle_insurances_vehicle_idx
  on public.vehicle_insurances (vehicle_id, starts_on desc);

drop trigger if exists vehicle_insurances_set_updated_at on public.vehicle_insurances;
create trigger vehicle_insurances_set_updated_at
before update on public.vehicle_insurances
for each row execute procedure public.set_updated_at();

drop trigger if exists vehicle_insurances_audit on public.vehicle_insurances;
create trigger vehicle_insurances_audit
after insert or update or delete on public.vehicle_insurances
for each row execute procedure public.write_audit_log();

alter table public.vehicle_insurances enable row level security;

create policy vehicle_insurances_select on public.vehicle_insurances
  for select to authenticated
  using (public.can_access_vehicle(vehicle_id, 'vehicles.view'));
create policy vehicle_insurances_insert on public.vehicle_insurances
  for insert to authenticated
  with check (public.can_access_vehicle(vehicle_id, 'vehicles.manage'));
create policy vehicle_insurances_update on public.vehicle_insurances
  for update to authenticated
  using (public.can_access_vehicle(vehicle_id, 'vehicles.manage'))
  with check (public.can_access_vehicle(vehicle_id, 'vehicles.manage'));
create policy vehicle_insurances_delete on public.vehicle_insurances
  for delete to authenticated
  using (public.can_access_vehicle(vehicle_id, 'vehicles.delete'));

alter table public.vehicle_documents
  add column if not exists document_kind text not null default 'INVOICE';

alter table public.vehicle_documents
  drop constraint if exists vehicle_documents_record_type_check;
alter table public.vehicle_documents
  add constraint vehicle_documents_record_type_check
  check (record_type in ('INSPECTION', 'REPAIR', 'FUEL', 'INSURANCE'));

alter table public.vehicle_documents
  drop constraint if exists vehicle_documents_document_kind_check;
alter table public.vehicle_documents
  add constraint vehicle_documents_document_kind_check
  check (document_kind in ('INVOICE', 'CERTIFICATE'));

alter table public.vehicle_documents
  drop constraint if exists vehicle_documents_record_type_record_id_key;
alter table public.vehicle_documents
  add constraint vehicle_documents_record_document_kind_key
  unique (record_type, record_id, document_kind);

create or replace function public.validate_vehicle_document_owner()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.record_type = 'INSPECTION' and not exists (
    select 1 from public.vehicle_inspections item
    where item.id = new.record_id and item.vehicle_id = new.vehicle_id
  ) then
    raise exception 'Vehicle inspection document owner is invalid';
  elsif new.record_type = 'REPAIR' and not exists (
    select 1 from public.vehicle_repairs item
    where item.id = new.record_id and item.vehicle_id = new.vehicle_id
  ) then
    raise exception 'Vehicle repair document owner is invalid';
  elsif new.record_type = 'FUEL' and not exists (
    select 1 from public.vehicle_fuel_logs item
    where item.id = new.record_id and item.vehicle_id = new.vehicle_id
  ) then
    raise exception 'Vehicle fuel document owner is invalid';
  elsif new.record_type = 'INSURANCE' and not exists (
    select 1 from public.vehicle_insurances item
    where item.id = new.record_id and item.vehicle_id = new.vehicle_id
  ) then
    raise exception 'Vehicle insurance document owner is invalid';
  end if;

  return new;
end;
$$;

create or replace function public.can_upload_vehicle_document_object(target_name text)
returns boolean
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  path_parts text[];
  target_vehicle_id uuid;
begin
  path_parts := storage.foldername(target_name);
  if coalesce(array_length(path_parts, 1), 0) < 4 then
    return false;
  end if;
  if path_parts[1] <> auth.uid()::text then
    return false;
  end if;
  if path_parts[3] not in ('INSPECTION', 'REPAIR', 'FUEL', 'INSURANCE') then
    return false;
  end if;

  begin
    target_vehicle_id := path_parts[2]::uuid;
  exception when invalid_text_representation then
    return false;
  end;

  return public.can_access_vehicle(target_vehicle_id, 'vehicles.manage');
end;
$$;

grant select, insert, update, delete on public.vehicle_insurances to authenticated;
grant all on public.vehicle_insurances to service_role;

commit;
