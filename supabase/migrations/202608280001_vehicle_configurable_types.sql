begin;

insert into public.settings (
  setting_type,
  setting_value,
  display_name,
  sort_order,
  active
)
values
  ('vehicle_maintenance_type', 'BAO_DUONG', 'Bảo dưỡng', 10, true),
  ('vehicle_maintenance_type', 'SUA_CHUA', 'Sửa chữa', 20, true),
  ('vehicle_maintenance_type', 'THAY_THE', 'Thay thế phụ tùng', 30, true),
  ('vehicle_maintenance_type', 'BAO_DUONG_SUA_CHUA', 'Bảo dưỡng / sửa chữa', 40, true),
  ('vehicle_insurance_type', 'TNDS_BAT_BUOC', 'Trách nhiệm dân sự bắt buộc', 10, true),
  ('vehicle_insurance_type', 'VAT_CHAT_XE', 'Bảo hiểm vật chất xe', 20, true),
  ('vehicle_insurance_type', 'TAI_NAN_NGUOI_NGOI', 'Tai nạn người ngồi trên xe', 30, true)
on conflict (setting_type, setting_value) do update
set display_name = excluded.display_name;

with existing_types as (
  select distinct
    case
      when length(service_type) <= 160
        and service_type ~ '^[A-Z0-9]+(_[A-Z0-9]+)*$'
        then service_type
      else 'LEGACY_' || upper(substr(md5(service_type), 1, 16))
    end as setting_value,
    case
      when service_type ~ '^[A-Z0-9]+(_[A-Z0-9]+)*$'
        then initcap(replace(lower(service_type), '_', ' '))
      else service_type
    end as display_name
  from public.vehicle_repairs
  where btrim(service_type) <> ''
), missing_types as (
  select
    existing_types.*,
    row_number() over (order by display_name, setting_value) as row_number
  from existing_types
  where not exists (
    select 1
    from public.settings
    where setting_type = 'vehicle_maintenance_type'
      and (
        settings.setting_value = existing_types.setting_value
        or settings.display_name = existing_types.display_name
      )
  )
)
insert into public.settings (
  setting_type,
  setting_value,
  display_name,
  sort_order,
  active
)
select
  'vehicle_maintenance_type',
  setting_value,
  display_name,
  100 + row_number * 10,
  true
from missing_types
on conflict (setting_type, setting_value) do nothing;

update public.vehicle_repairs repair
set service_type = (
  select setting.setting_value
  from public.settings setting
  where setting.setting_type = 'vehicle_maintenance_type'
    and (
      setting.display_name = repair.service_type
      or setting.setting_value = repair.service_type
    )
  order by case when setting.display_name = repair.service_type then 0 else 1 end
  limit 1
)
where exists (
  select 1
  from public.settings setting
  where setting.setting_type = 'vehicle_maintenance_type'
    and (
      setting.display_name = repair.service_type
      or setting.setting_value = repair.service_type
    )
)
and repair.service_type <> (
  select setting.setting_value
  from public.settings setting
  where setting.setting_type = 'vehicle_maintenance_type'
    and (
      setting.display_name = repair.service_type
      or setting.setting_value = repair.service_type
    )
  order by case when setting.display_name = repair.service_type then 0 else 1 end
  limit 1
);

with existing_types as (
  select distinct
    case
      when length(insurance_type) <= 160
        and insurance_type ~ '^[A-Z0-9]+(_[A-Z0-9]+)*$'
        then insurance_type
      else 'LEGACY_' || upper(substr(md5(insurance_type), 1, 16))
    end as setting_value,
    insurance_type as display_name
  from public.vehicle_insurances
  where btrim(insurance_type) <> ''
), missing_types as (
  select
    existing_types.*,
    row_number() over (order by display_name, setting_value) as row_number
  from existing_types
  where not exists (
    select 1
    from public.settings
    where setting_type = 'vehicle_insurance_type'
      and (
        settings.setting_value = existing_types.setting_value
        or settings.display_name = existing_types.display_name
      )
  )
)
insert into public.settings (
  setting_type,
  setting_value,
  display_name,
  sort_order,
  active
)
select
  'vehicle_insurance_type',
  setting_value,
  display_name,
  100 + row_number * 10,
  true
from missing_types
on conflict (setting_type, setting_value) do nothing;

update public.vehicle_insurances insurance
set insurance_type = (
  select setting.setting_value
  from public.settings setting
  where setting.setting_type = 'vehicle_insurance_type'
    and (
      setting.display_name = insurance.insurance_type
      or setting.setting_value = insurance.insurance_type
    )
  order by case when setting.display_name = insurance.insurance_type then 0 else 1 end
  limit 1
)
where exists (
  select 1
  from public.settings setting
  where setting.setting_type = 'vehicle_insurance_type'
    and (
      setting.display_name = insurance.insurance_type
      or setting.setting_value = insurance.insurance_type
    )
)
and insurance.insurance_type <> (
  select setting.setting_value
  from public.settings setting
  where setting.setting_type = 'vehicle_insurance_type'
    and (
      setting.display_name = insurance.insurance_type
      or setting.setting_value = insurance.insurance_type
    )
  order by case when setting.display_name = insurance.insurance_type then 0 else 1 end
  limit 1
);

create or replace function public.save_vehicle_setting(
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
  normalized_type text := btrim(coalesce(target_setting_type, ''));
  normalized_value text := upper(btrim(coalesce(target_setting_value, '')));
  normalized_name text := btrim(coalesce(target_display_name, ''));
  linked_count integer := 0;
  next_sort_order integer;
begin
  if auth.uid() is null or not public.has_permission('vehicles.manage') then
    raise exception 'Vehicle management access required';
  end if;
  if normalized_type not in ('vehicle_maintenance_type', 'vehicle_insurance_type') then
    raise exception 'Invalid vehicle setting type';
  end if;
  if normalized_name = '' or length(normalized_name) > 160 then
    raise exception 'Invalid display name';
  end if;
  if normalized_value = ''
    or length(normalized_value) > 160
    or normalized_value !~ '^[A-Z0-9]+(_[A-Z0-9]+)*$' then
    raise exception 'Invalid setting value';
  end if;

  if target_setting_id is null then
    if exists (
      select 1
      from public.settings
      where setting_type = normalized_type and setting_value = normalized_value
    ) then
      raise exception 'VEHICLE_SETTING_VALUE_EXISTS';
    end if;
    select coalesce(max(sort_order), 0) + 10
    into next_sort_order
    from public.settings
    where setting_type = normalized_type;

    insert into public.settings (
      setting_type,
      setting_value,
      display_name,
      sort_order,
      active
    ) values (
      normalized_type,
      normalized_value,
      normalized_name,
      next_sort_order,
      true
    );
    return 0;
  end if;

  select setting_type, setting_value
  into current_type, current_value
  from public.settings
  where id = target_setting_id
    and setting_type in ('vehicle_maintenance_type', 'vehicle_insurance_type')
  for update;

  if current_type is null then
    raise exception 'Vehicle setting not found';
  end if;
  if exists (
    select 1
    from public.settings
    where setting_type = normalized_type
      and setting_value = normalized_value
      and id <> target_setting_id
  ) then
    raise exception 'VEHICLE_SETTING_VALUE_EXISTS';
  end if;

  lock table public.vehicle_repairs in share row exclusive mode;
  lock table public.vehicle_insurances in share row exclusive mode;

  if current_type = 'vehicle_maintenance_type' then
    select count(*) into linked_count
    from public.vehicle_repairs
    where service_type = current_value;
  else
    select count(*) into linked_count
    from public.vehicle_insurances
    where insurance_type = current_value;
  end if;

  if normalized_type <> current_type then
    if linked_count > 0 then
      raise exception 'VEHICLE_SETTING_TYPE_IN_USE';
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

  if current_value <> normalized_value then
    if current_type = 'vehicle_maintenance_type' then
      update public.vehicle_repairs
      set service_type = normalized_value
      where service_type = current_value;
    else
      update public.vehicle_insurances
      set insurance_type = normalized_value
      where insurance_type = current_value;
    end if;
  end if;

  update public.settings
  set setting_value = normalized_value, display_name = normalized_name
  where id = target_setting_id;

  return linked_count;
end;
$$;

create or replace function public.toggle_vehicle_setting(
  target_setting_id uuid,
  target_active boolean
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null or not public.has_permission('vehicles.manage') then
    raise exception 'Vehicle management access required';
  end if;

  update public.settings
  set active = target_active
  where id = target_setting_id
    and setting_type in ('vehicle_maintenance_type', 'vehicle_insurance_type');

  if not found then
    raise exception 'Vehicle setting not found';
  end if;
end;
$$;

create or replace function public.reorder_vehicle_setting(
  target_setting_id uuid,
  move_direction text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  target_type text;
  ordered_ids uuid[];
  current_position integer;
  swap_position integer;
  temporary_id uuid;
  item_id uuid;
  item_position integer;
begin
  if auth.uid() is null or not public.has_permission('vehicles.manage') then
    raise exception 'Vehicle management access required';
  end if;
  if move_direction not in ('up', 'down') then
    raise exception 'Invalid direction';
  end if;

  select setting_type into target_type
  from public.settings
  where id = target_setting_id
    and active
    and setting_type in ('vehicle_maintenance_type', 'vehicle_insurance_type')
  for update;

  if target_type is null then
    raise exception 'Active vehicle setting not found';
  end if;

  perform id
  from public.settings
  where setting_type = target_type and active
  for update;

  select array_agg(id order by sort_order, display_name, id)
  into ordered_ids
  from public.settings
  where setting_type = target_type and active;

  current_position := array_position(ordered_ids, target_setting_id);
  swap_position := case
    when move_direction = 'up' then current_position - 1
    else current_position + 1
  end;

  if current_position is null
    or swap_position < 1
    or swap_position > coalesce(array_length(ordered_ids, 1), 0) then
    return;
  end if;

  temporary_id := ordered_ids[current_position];
  ordered_ids[current_position] := ordered_ids[swap_position];
  ordered_ids[swap_position] := temporary_id;

  item_position := 0;
  foreach item_id in array ordered_ids loop
    item_position := item_position + 1;
    update public.settings
    set sort_order = item_position * 10
    where id = item_id;
  end loop;
end;
$$;

revoke all on function public.save_vehicle_setting(uuid, text, text, text) from public;
revoke all on function public.toggle_vehicle_setting(uuid, boolean) from public;
revoke all on function public.reorder_vehicle_setting(uuid, text) from public;
grant execute on function public.save_vehicle_setting(uuid, text, text, text) to authenticated;
grant execute on function public.toggle_vehicle_setting(uuid, boolean) to authenticated;
grant execute on function public.reorder_vehicle_setting(uuid, text) to authenticated;

commit;
