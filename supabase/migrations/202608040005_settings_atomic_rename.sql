begin;

create or replace function public.admin_update_setting(
  target_setting_id uuid,
  target_setting_type text,
  target_setting_value text,
  target_display_name text
)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_type text;
  current_value text;
  current_name text;
  normalized_type text := btrim(coalesce(target_setting_type, ''));
  normalized_value text := upper(btrim(coalesce(target_setting_value, '')));
  normalized_name text := btrim(coalesce(target_display_name, ''));
  linked_count integer := 0;
  affected_count integer := 0;
  next_sort_order integer;
begin
  if auth.uid() is null or not public.is_admin() then
    raise exception 'Admin access required';
  end if;
  if normalized_type not in ('asset_group', 'asset_type', 'status', 'maintenance_type', 'software_name') then
    raise exception 'Invalid setting type';
  end if;
  if normalized_name = '' or length(normalized_name) > 160 then
    raise exception 'Invalid display name';
  end if;
  if normalized_value = ''
    or length(normalized_value) > 160
    or normalized_value !~ '^[A-Z0-9]+(_[A-Z0-9]+)*$' then
    raise exception 'Invalid setting value';
  end if;

  select setting_type, setting_value, display_name
  into current_type, current_value, current_name
  from public.settings
  where id = target_setting_id
  for update;

  if current_type is null then
    raise exception 'Setting not found';
  end if;

  if exists (
    select 1
    from public.settings
    where setting_type = normalized_type
      and setting_value = normalized_value
      and id <> target_setting_id
  ) then
    raise exception 'SETTING_VALUE_EXISTS';
  end if;

  if normalized_type = current_type
    and normalized_value = current_value
    and normalized_name = current_name then
    return 0;
  end if;

  lock table public.assets in share row exclusive mode;
  lock table public.maintenance_plans in share row exclusive mode;
  lock table public.maintenance_logs in share row exclusive mode;
  lock table public.software_licenses in share row exclusive mode;

  if current_type = 'asset_group' then
    select
      (select count(*) from public.assets where asset_group = current_value)
      + (select count(*) from public.maintenance_plans where scope_type = 'GROUP' and scope_value = current_value)
    into linked_count;
  elsif current_type = 'asset_type' then
    select
      (select count(*) from public.assets where asset_type = current_value)
      + (select count(*) from public.maintenance_plans where scope_type = 'TYPE' and scope_value = current_value)
    into linked_count;
  elsif current_type = 'status' then
    select count(*) into linked_count
    from public.assets
    where status = current_value;
  elsif current_type = 'maintenance_type' then
    select count(*) into linked_count
    from public.maintenance_logs
    where action_type = current_value;
  elsif current_type = 'software_name' then
    select count(*) into linked_count
    from public.software_licenses
    where software_name = current_name;
  end if;

  if normalized_type <> current_type then
    if linked_count > 0 then
      raise exception 'SETTING_TYPE_IN_USE';
    end if;

    select coalesce(max(sort_order), 0) + 10
    into next_sort_order
    from public.settings
    where setting_type = normalized_type;

    update public.settings
    set
      setting_type = normalized_type,
      setting_value = normalized_value,
      display_name = normalized_name,
      sort_order = next_sort_order
    where id = target_setting_id;

    return 0;
  end if;

  if current_type = 'asset_group' then
    update public.assets
    set asset_group = normalized_value, asset_group_label = normalized_name
    where asset_group = current_value;
    get diagnostics affected_count = row_count;
    linked_count := affected_count;

    update public.maintenance_plans
    set scope_value = normalized_value
    where scope_type = 'GROUP' and scope_value = current_value;
    get diagnostics affected_count = row_count;
    linked_count := linked_count + affected_count;
  elsif current_type = 'asset_type' then
    update public.assets
    set asset_type = normalized_value
    where asset_type = current_value;
    get diagnostics affected_count = row_count;
    linked_count := affected_count;

    update public.maintenance_plans
    set scope_value = normalized_value
    where scope_type = 'TYPE' and scope_value = current_value;
    get diagnostics affected_count = row_count;
    linked_count := linked_count + affected_count;
  elsif current_type = 'status' then
    update public.assets
    set status = normalized_value
    where status = current_value;
    get diagnostics linked_count = row_count;
  elsif current_type = 'maintenance_type' then
    update public.maintenance_logs
    set action_type = normalized_value
    where action_type = current_value;
    get diagnostics linked_count = row_count;
  elsif current_type = 'software_name' then
    update public.software_licenses
    set software_name = normalized_name
    where software_name = current_name;
    get diagnostics linked_count = row_count;
  end if;

  update public.settings
  set setting_value = normalized_value, display_name = normalized_name
  where id = target_setting_id;

  return linked_count;
end;
$$;

revoke all on function public.admin_update_setting(uuid, text, text, text) from public;
grant execute on function public.admin_update_setting(uuid, text, text, text) to authenticated;

commit;
