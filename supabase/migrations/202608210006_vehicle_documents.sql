begin;

create table if not exists public.vehicle_documents (
  id uuid primary key default gen_random_uuid(),
  vehicle_id uuid not null references public.vehicles(id) on delete cascade,
  record_type text not null check (record_type in ('INSPECTION', 'REPAIR', 'FUEL')),
  record_id uuid not null,
  bucket_id text not null default 'vehicle-documents'
    check (bucket_id = 'vehicle-documents'),
  object_path text not null unique,
  file_name text not null,
  mime_type text not null default 'application/pdf'
    check (mime_type = 'application/pdf'),
  original_byte_size bigint not null check (original_byte_size > 0),
  stored_byte_size bigint not null check (stored_byte_size > 0),
  compression_method text not null default 'ORIGINAL'
    check (compression_method in ('ORIGINAL', 'LOSSLESS', 'RASTERIZED')),
  checksum text not null check (checksum ~ '^[0-9a-f]{64}$'),
  page_count integer not null check (page_count between 1 and 200),
  created_by uuid references public.profiles(id) on delete set null default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (record_type, record_id)
);

create index if not exists vehicle_documents_vehicle_idx
  on public.vehicle_documents (vehicle_id, record_type, created_at desc);

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
  end if;

  return new;
end;
$$;

drop trigger if exists vehicle_documents_validate_owner on public.vehicle_documents;
create trigger vehicle_documents_validate_owner
before insert or update on public.vehicle_documents
for each row execute function public.validate_vehicle_document_owner();

create trigger vehicle_documents_set_updated_at
before update on public.vehicle_documents
for each row execute procedure public.set_updated_at();

create trigger vehicle_documents_audit
after insert or update or delete on public.vehicle_documents
for each row execute procedure public.write_audit_log();

alter table public.vehicle_documents enable row level security;

create policy vehicle_documents_select on public.vehicle_documents
  for select to authenticated
  using (public.can_access_vehicle(vehicle_id, 'vehicles.view'));

create policy vehicle_documents_insert on public.vehicle_documents
  for insert to authenticated
  with check (
    created_by = auth.uid()
    and public.can_access_vehicle(vehicle_id, 'vehicles.manage')
  );

create policy vehicle_documents_update on public.vehicle_documents
  for update to authenticated
  using (public.can_access_vehicle(vehicle_id, 'vehicles.manage'))
  with check (public.can_access_vehicle(vehicle_id, 'vehicles.manage'));

create policy vehicle_documents_delete on public.vehicle_documents
  for delete to authenticated
  using (public.can_access_vehicle(vehicle_id, 'vehicles.manage'));

insert into storage.buckets (
  id,
  name,
  public,
  file_size_limit,
  allowed_mime_types
)
values (
  'vehicle-documents',
  'vehicle-documents',
  false,
  12582912,
  array['application/pdf']::text[]
)
on conflict (id) do update
set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

create or replace function public.can_read_vehicle_document_object(target_name text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.vehicle_documents document
    where document.object_path = target_name
      and public.can_access_vehicle(document.vehicle_id, 'vehicles.view')
  );
$$;

create or replace function public.can_manage_vehicle_document_object(target_name text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.vehicle_documents document
    where document.object_path = target_name
      and public.can_access_vehicle(document.vehicle_id, 'vehicles.manage')
  );
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
  if path_parts[3] not in ('INSPECTION', 'REPAIR', 'FUEL') then
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

create policy vehicle_documents_storage_select on storage.objects
  for select to authenticated
  using (
    bucket_id = 'vehicle-documents'
    and public.can_read_vehicle_document_object(name)
  );

create policy vehicle_documents_storage_insert on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'vehicle-documents'
    and public.can_upload_vehicle_document_object(name)
  );

create policy vehicle_documents_storage_delete on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'vehicle-documents'
    and public.can_manage_vehicle_document_object(name)
  );

revoke all on function public.validate_vehicle_document_owner() from public, anon;
revoke all on function public.can_read_vehicle_document_object(text) from public, anon;
revoke all on function public.can_manage_vehicle_document_object(text) from public, anon;
revoke all on function public.can_upload_vehicle_document_object(text) from public, anon;

grant execute on function public.can_read_vehicle_document_object(text) to authenticated;
grant execute on function public.can_manage_vehicle_document_object(text) to authenticated;
grant execute on function public.can_upload_vehicle_document_object(text) to authenticated;
grant select, insert, update, delete on public.vehicle_documents to authenticated;
grant all on public.vehicle_documents to service_role;

commit;
