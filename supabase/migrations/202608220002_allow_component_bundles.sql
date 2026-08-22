begin;

-- Một số hệ thống (ví dụ camera) quản lý nhiều linh kiện cùng loại trong một
-- hồ sơ và toàn bộ cụm được lắp vào cùng một thiết bị cha. Giữ một lịch sử
-- lắp/tháo cho cả cụm, đồng thời tiếp tục ngăn một hồ sơ linh kiện được gắn
-- đồng thời vào nhiều thiết bị bằng unique index hiện có.
create or replace function public.install_asset_component(
  target_host_asset_id uuid,
  target_component_asset_id uuid,
  target_installed_at date,
  target_slot_name text,
  target_note text
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  host public.assets%rowtype;
  component public.assets%rowtype;
  installation_id uuid;
begin
  if target_installed_at is null then
    raise exception 'Installation date is required' using errcode = '22023';
  end if;
  if target_host_asset_id = target_component_asset_id then
    raise exception 'An asset cannot contain itself' using errcode = '22023';
  end if;
  if not public.can_access_asset(target_host_asset_id, 'assets', 'assets.manage')
    or not public.can_access_asset(target_component_asset_id, 'assets', 'assets.manage')
  then
    raise insufficient_privilege using message = 'Asset management permission is required';
  end if;

  select * into host
  from public.assets
  where id = target_host_asset_id and deleted_at is null
  for update;
  select * into component
  from public.assets
  where id = target_component_asset_id and deleted_at is null
  for update;

  if host.id is null or host.asset_kind <> 'DEVICE' then
    raise exception 'Host must be an active device' using errcode = '22023';
  end if;
  if component.id is null or component.asset_kind <> 'COMPONENT' then
    raise exception 'Installed asset must be an active component' using errcode = '22023';
  end if;

  insert into public.asset_component_installations (
    host_asset_id,
    component_asset_id,
    installed_at,
    slot_name,
    install_note,
    installed_by
  )
  values (
    target_host_asset_id,
    target_component_asset_id,
    target_installed_at,
    left(coalesce(target_slot_name, ''), 120),
    left(coalesce(target_note, ''), 1000),
    auth.uid()
  )
  returning id into installation_id;

  update public.assets
  set
    status = 'CON_SU_DUNG',
    department_id = host.department_id,
    department_legacy_name = host.department_legacy_name,
    assigned_to_name = host.assigned_to_name,
    location = host.location,
    updated_by = auth.uid()
  where id = target_component_asset_id;

  return installation_id;
exception
  when unique_violation then
    raise exception 'Component is already installed in another device'
      using errcode = '23505';
end;
$$;

create or replace function public.replace_asset_component(
  target_installation_id uuid,
  target_new_component_asset_id uuid,
  target_changed_at date,
  target_slot_name text,
  target_note text,
  target_old_component_status text
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  installation public.asset_component_installations%rowtype;
  host public.assets%rowtype;
  new_component public.assets%rowtype;
  new_installation_id uuid;
begin
  if target_old_component_status not in (
    'CON_SU_DUNG', 'MOI_100', 'KEM_PHAM_CHAT', 'CAN_KIEM_TRA',
    'KHONG_SU_DUNG', 'LUU_KHO_THANH_LY'
  ) then
    raise exception 'Invalid component status' using errcode = '22023';
  end if;

  select * into installation
  from public.asset_component_installations
  where id = target_installation_id and removed_at is null
  for update;
  if installation.id is null then
    raise no_data_found using message = 'Active component installation not found';
  end if;
  if target_changed_at is null or target_changed_at < installation.installed_at then
    raise exception 'Replacement date must not precede installation date'
      using errcode = '22023';
  end if;
  if target_new_component_asset_id = installation.component_asset_id then
    raise exception 'Select a different replacement component' using errcode = '22023';
  end if;
  if not public.can_access_asset(installation.host_asset_id, 'assets', 'assets.manage')
    or not public.can_access_asset(installation.component_asset_id, 'assets', 'assets.manage')
    or not public.can_access_asset(target_new_component_asset_id, 'assets', 'assets.manage')
  then
    raise insufficient_privilege using message = 'Asset management permission is required';
  end if;

  select * into host
  from public.assets
  where id = installation.host_asset_id and deleted_at is null
  for update;
  select * into new_component
  from public.assets
  where id = target_new_component_asset_id and deleted_at is null
  for update;
  if new_component.id is null or new_component.asset_kind <> 'COMPONENT' then
    raise exception 'Replacement must be an active component'
      using errcode = '22023';
  end if;

  update public.asset_component_installations
  set
    removed_at = target_changed_at,
    removal_reason = 'THAY_THE',
    removal_note = left(coalesce(target_note, ''), 1000),
    removed_by = auth.uid()
  where id = installation.id;

  update public.assets
  set status = target_old_component_status, updated_by = auth.uid()
  where id = installation.component_asset_id;

  insert into public.asset_component_installations (
    host_asset_id,
    component_asset_id,
    installed_at,
    slot_name,
    install_note,
    installed_by
  )
  values (
    installation.host_asset_id,
    target_new_component_asset_id,
    target_changed_at,
    left(coalesce(nullif(target_slot_name, ''), installation.slot_name), 120),
    left(coalesce(target_note, ''), 1000),
    auth.uid()
  )
  returning id into new_installation_id;

  update public.assets
  set
    status = 'CON_SU_DUNG',
    department_id = host.department_id,
    department_legacy_name = host.department_legacy_name,
    assigned_to_name = host.assigned_to_name,
    location = host.location,
    updated_by = auth.uid()
  where id = target_new_component_asset_id;

  return new_installation_id;
exception
  when unique_violation then
    raise exception 'Replacement component is already installed in another device'
      using errcode = '23505';
end;
$$;

commit;
