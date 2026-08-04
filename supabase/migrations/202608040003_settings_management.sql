begin;

create or replace function public.admin_update_setting_label(
  target_setting_id uuid,
  target_display_name text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  target_type text;
  target_value text;
  normalized_name text := btrim(coalesce(target_display_name, ''));
begin
  if auth.uid() is null or not public.is_admin() then
    raise exception 'Admin access required';
  end if;
  if normalized_name = '' or length(normalized_name) > 160 then
    raise exception 'Invalid display name';
  end if;

  select setting_type, setting_value
  into target_type, target_value
  from public.settings
  where id = target_setting_id
  for update;

  if target_type is null then
    raise exception 'Setting not found';
  end if;

  update public.settings
  set display_name = normalized_name
  where id = target_setting_id;

  if target_type = 'asset_group' then
    update public.assets
    set asset_group_label = normalized_name
    where asset_group = target_value and deleted_at is null;
  end if;
end;
$$;

create or replace function public.admin_reorder_setting(
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
  if auth.uid() is null or not public.is_admin() then
    raise exception 'Admin access required';
  end if;
  if move_direction not in ('up', 'down') then
    raise exception 'Invalid direction';
  end if;

  select setting_type into target_type
  from public.settings
  where id = target_setting_id and active
  for update;

  if target_type is null then
    raise exception 'Active setting not found';
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

revoke all on function public.admin_reorder_setting(uuid, text) from public;
grant execute on function public.admin_reorder_setting(uuid, text) to authenticated;
revoke all on function public.admin_update_setting_label(uuid, text) from public;
grant execute on function public.admin_update_setting_label(uuid, text) to authenticated;

commit;
