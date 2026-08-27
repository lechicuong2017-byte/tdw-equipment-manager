begin;

create table if not exists public.asset_documents (
  id uuid primary key default gen_random_uuid(),
  asset_id uuid not null references public.assets(id) on delete cascade,
  document_kind text not null default 'PURCHASE_INVOICE'
    check (document_kind in ('PURCHASE_INVOICE')),
  bucket_id text not null default 'asset-documents'
    check (bucket_id = 'asset-documents'),
  object_path text not null unique,
  file_name text not null,
  mime_type text not null default 'application/pdf'
    check (mime_type = 'application/pdf'),
  original_byte_size bigint not null
    check (original_byte_size > 0 and original_byte_size <= 20971520),
  stored_byte_size bigint not null
    check (stored_byte_size > 0 and stored_byte_size <= 5242880),
  compression_method text not null default 'LOSSLESS'
    check (compression_method in ('LOSSLESS', 'RASTERIZED')),
  checksum text not null check (checksum ~ '^[0-9a-f]{64}$'),
  page_count integer not null check (page_count between 1 and 200),
  created_by uuid references public.profiles(id) on delete set null default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (asset_id, document_kind)
);

create index if not exists asset_documents_asset_idx
  on public.asset_documents (asset_id, document_kind, created_at desc);

drop trigger if exists asset_documents_set_updated_at on public.asset_documents;
create trigger asset_documents_set_updated_at
before update on public.asset_documents
for each row execute procedure public.set_updated_at();

drop trigger if exists asset_documents_audit on public.asset_documents;
create trigger asset_documents_audit
after insert or update or delete on public.asset_documents
for each row execute procedure public.write_audit_log();

alter table public.asset_documents enable row level security;

drop policy if exists asset_documents_select on public.asset_documents;
create policy asset_documents_select on public.asset_documents
  for select to authenticated
  using (public.can_access_asset(asset_id, 'assets', 'assets.view'));

drop policy if exists asset_documents_insert on public.asset_documents;
create policy asset_documents_insert on public.asset_documents
  for insert to authenticated
  with check (
    created_by = auth.uid()
    and public.can_access_asset(asset_id, 'assets', 'assets.manage')
  );

drop policy if exists asset_documents_update on public.asset_documents;
create policy asset_documents_update on public.asset_documents
  for update to authenticated
  using (public.can_access_asset(asset_id, 'assets', 'assets.manage'))
  with check (
    created_by = auth.uid()
    and public.can_access_asset(asset_id, 'assets', 'assets.manage')
  );

drop policy if exists asset_documents_delete on public.asset_documents;
create policy asset_documents_delete on public.asset_documents
  for delete to authenticated
  using (public.can_access_asset(asset_id, 'assets', 'assets.manage'));

insert into storage.buckets (
  id,
  name,
  public,
  file_size_limit,
  allowed_mime_types
)
values (
  'asset-documents',
  'asset-documents',
  false,
  6291456,
  array['application/pdf']::text[]
)
on conflict (id) do update
set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

create or replace function public.can_read_asset_document_object(target_name text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.asset_documents document
    where document.object_path = target_name
      and public.can_access_asset(document.asset_id, 'assets', 'assets.view')
  );
$$;

create or replace function public.can_manage_asset_document_object(target_name text)
returns boolean
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  path_parts text[];
  target_asset_id uuid;
begin
  select document.asset_id
    into target_asset_id
  from public.asset_documents document
  where document.object_path = target_name
  limit 1;

  if target_asset_id is not null then
    return public.can_access_asset(target_asset_id, 'assets', 'assets.manage');
  end if;

  -- A replacement changes the metadata row to the new object before the old
  -- object is removed. Fall back to the asset id embedded in the private path
  -- so authorized managers can clean up that superseded object safely.
  path_parts := string_to_array(target_name, '/');
  if coalesce(array_length(path_parts, 1), 0) <> 4 then
    return false;
  end if;
  if path_parts[3] <> 'PURCHASE_INVOICE' then
    return false;
  end if;
  if path_parts[4] !~ '^[0-9a-f-]{36}[.]pdf$' then
    return false;
  end if;

  begin
    target_asset_id := path_parts[2]::uuid;
  exception when invalid_text_representation then
    return false;
  end;

  return public.can_access_asset(target_asset_id, 'assets', 'assets.manage');
end;
$$;

create or replace function public.can_upload_asset_document_object(target_name text)
returns boolean
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  path_parts text[];
  target_asset_id uuid;
begin
  path_parts := string_to_array(target_name, '/');
  if coalesce(array_length(path_parts, 1), 0) <> 4 then
    return false;
  end if;
  if path_parts[1] <> auth.uid()::text then
    return false;
  end if;
  if path_parts[3] <> 'PURCHASE_INVOICE' then
    return false;
  end if;
  if path_parts[4] !~ '^[0-9a-f-]{36}[.]pdf$' then
    return false;
  end if;

  begin
    target_asset_id := path_parts[2]::uuid;
  exception when invalid_text_representation then
    return false;
  end;

  return public.can_access_asset(target_asset_id, 'assets', 'assets.manage');
end;
$$;

drop policy if exists asset_documents_storage_select on storage.objects;
create policy asset_documents_storage_select on storage.objects
  for select to authenticated
  using (
    bucket_id = 'asset-documents'
    and public.can_read_asset_document_object(name)
  );

drop policy if exists asset_documents_storage_insert on storage.objects;
create policy asset_documents_storage_insert on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'asset-documents'
    and public.can_upload_asset_document_object(name)
  );

drop policy if exists asset_documents_storage_delete on storage.objects;
create policy asset_documents_storage_delete on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'asset-documents'
    and public.can_manage_asset_document_object(name)
  );

revoke all on function public.can_read_asset_document_object(text) from public, anon;
revoke all on function public.can_manage_asset_document_object(text) from public, anon;
revoke all on function public.can_upload_asset_document_object(text) from public, anon;

grant execute on function public.can_read_asset_document_object(text) to authenticated;
grant execute on function public.can_manage_asset_document_object(text) to authenticated;
grant execute on function public.can_upload_asset_document_object(text) to authenticated;
grant select, insert, update, delete on public.asset_documents to authenticated;
grant all on public.asset_documents to service_role;

commit;
