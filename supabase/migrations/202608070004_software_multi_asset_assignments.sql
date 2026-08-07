begin;

create table if not exists public.software_license_assets (
  id uuid primary key default gen_random_uuid(),
  license_id uuid not null references public.software_licenses(id) on delete cascade,
  asset_id uuid not null references public.assets(id) on delete restrict,
  assigned_by uuid references public.profiles(id) on delete set null default auth.uid(),
  created_at timestamptz not null default now(),
  unique (license_id, asset_id)
);

create index if not exists software_license_assets_asset_idx
  on public.software_license_assets (asset_id, license_id);

insert into public.software_license_assets (license_id, asset_id, assigned_by)
select license.id, license.assigned_asset_id, license.created_by
from public.software_licenses license
where license.assigned_asset_id is not null
on conflict (license_id, asset_id) do nothing;

alter table public.software_license_assets enable row level security;

drop policy if exists software_license_assets_select on public.software_license_assets;
create policy software_license_assets_select on public.software_license_assets
  for select to authenticated
  using (
    public.has_permission('software.view')
    and public.can_access_asset(asset_id, 'assets', 'assets.view')
  );

revoke all on public.software_license_assets from anon, authenticated;
grant select on public.software_license_assets to authenticated;

drop trigger if exists software_license_assets_audit on public.software_license_assets;
create trigger software_license_assets_audit
after insert or update or delete on public.software_license_assets
for each row execute function public.write_audit_log();

create or replace function public.save_software_license_with_assets(
  target_license_id uuid,
  target_software_name text,
  target_version text,
  target_assigned_asset_ids uuid[],
  target_assigned_user_name text,
  target_expiry_date date,
  target_status text,
  target_note text
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  saved_license_id uuid;
  cleaned_asset_ids uuid[];
  normalized_name text := btrim(coalesce(target_software_name, ''));
  normalized_status text := coalesce(target_status, '');
begin
  if auth.uid() is null or not public.has_permission('software.manage') then
    raise insufficient_privilege using message = 'Software management permission is required';
  end if;

  if normalized_name = '' or length(normalized_name) > 200 then
    raise exception 'Invalid software name' using errcode = '22023';
  end if;
  if length(coalesce(target_version, '')) > 120
    or length(coalesce(target_assigned_user_name, '')) > 200
    or length(coalesce(target_note, '')) > 3000
    or normalized_status not in ('ACTIVE', 'EXPIRING', 'EXPIRED', 'SUSPENDED', '')
  then
    raise exception 'Invalid software license data' using errcode = '22023';
  end if;

  select coalesce(array_agg(unique_asset.asset_id order by unique_asset.first_position), '{}'::uuid[])
  into cleaned_asset_ids
  from (
    select asset_id, min(position) as first_position
    from unnest(coalesce(target_assigned_asset_ids, '{}'::uuid[]))
      with ordinality as submitted(asset_id, position)
    where asset_id is not null
    group by asset_id
  ) unique_asset;

  if cardinality(cleaned_asset_ids) > 1000 then
    raise exception 'Too many assigned assets' using errcode = '22023';
  end if;

  if exists (
    select 1
    from unnest(cleaned_asset_ids) submitted_asset_id
    where not exists (
      select 1
      from public.assets asset
      where asset.id = submitted_asset_id
        and asset.deleted_at is null
        and asset.status <> 'DA_THANH_LY'
        and public.can_access_asset(asset.id, 'assets', 'assets.view')
    )
  ) then
    raise exception 'One or more assigned assets are invalid or inaccessible'
      using errcode = '22023';
  end if;

  if target_license_id is null then
    insert into public.software_licenses (
      software_name,
      version,
      assigned_asset_id,
      assigned_user_name,
      expiry_date,
      status,
      note,
      created_by
    )
    values (
      normalized_name,
      btrim(coalesce(target_version, '')),
      cleaned_asset_ids[1],
      btrim(coalesce(target_assigned_user_name, '')),
      target_expiry_date,
      normalized_status,
      btrim(coalesce(target_note, '')),
      auth.uid()
    )
    returning id into saved_license_id;
  else
    update public.software_licenses
    set
      software_name = normalized_name,
      version = btrim(coalesce(target_version, '')),
      assigned_asset_id = cleaned_asset_ids[1],
      assigned_user_name = btrim(coalesce(target_assigned_user_name, '')),
      expiry_date = target_expiry_date,
      status = normalized_status,
      note = btrim(coalesce(target_note, ''))
    where id = target_license_id
    returning id into saved_license_id;

    if saved_license_id is null then
      raise no_data_found using message = 'Software license not found';
    end if;
  end if;

  delete from public.software_license_assets assignment
  where assignment.license_id = saved_license_id
    and not (assignment.asset_id = any(cleaned_asset_ids));

  insert into public.software_license_assets (
    license_id,
    asset_id,
    assigned_by
  )
  select saved_license_id, asset_id, auth.uid()
  from unnest(cleaned_asset_ids) asset_id
  on conflict (license_id, asset_id) do nothing;

  return saved_license_id;
end;
$$;

revoke all on function public.save_software_license_with_assets(
  uuid, text, text, uuid[], text, date, text, text
) from public;
grant execute on function public.save_software_license_with_assets(
  uuid, text, text, uuid[], text, date, text, text
) to authenticated;

commit;
