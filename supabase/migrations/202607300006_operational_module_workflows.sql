begin;

-- Inventory movements are append-only. The RPC derives the "from" values from
-- the locked asset row, writes the history record and updates the current asset
-- assignment in one transaction.
create or replace function public.record_inventory_movement(
  target_asset_id uuid,
  target_movement_date date,
  target_to_user_name text,
  target_to_location text,
  target_reason text default '',
  target_approved_by_name text default '',
  target_note text default ''
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_user_name text;
  current_location text;
  movement_id uuid;
begin
  if auth.uid() is null then
    raise exception 'Authentication required' using errcode = '42501';
  end if;

  if target_movement_date is null then
    raise exception 'Movement date is required' using errcode = '22023';
  end if;

  if length(trim(coalesce(target_to_user_name, ''))) > 200
    or length(trim(coalesce(target_to_location, ''))) > 200
    or length(trim(coalesce(target_reason, ''))) > 1000
    or length(trim(coalesce(target_approved_by_name, ''))) > 200
    or length(trim(coalesce(target_note, ''))) > 3000
  then
    raise exception 'Movement data is too long' using errcode = '22023';
  end if;

  if trim(coalesce(target_to_user_name, '')) = ''
    and trim(coalesce(target_to_location, '')) = ''
  then
    raise exception 'A recipient or destination is required'
      using errcode = '22023';
  end if;

  if not public.can_access_asset(
    target_asset_id,
    'movement',
    'movement.manage'
  ) then
    raise exception 'Movement access denied' using errcode = '42501';
  end if;

  select a.assigned_to_name, a.location
  into current_user_name, current_location
  from public.assets a
  where a.id = target_asset_id
    and a.deleted_at is null
  for update;

  if not found then
    raise exception 'Asset not found' using errcode = 'P0002';
  end if;

  insert into public.inventory_movements (
    asset_id,
    movement_date,
    from_user_name,
    to_user_name,
    from_location,
    to_location,
    reason,
    approved_by_name,
    note,
    created_by
  )
  values (
    target_asset_id,
    target_movement_date,
    coalesce(current_user_name, ''),
    trim(coalesce(target_to_user_name, '')),
    coalesce(current_location, ''),
    trim(coalesce(target_to_location, '')),
    trim(coalesce(target_reason, '')),
    trim(coalesce(target_approved_by_name, '')),
    trim(coalesce(target_note, '')),
    auth.uid()
  )
  returning id into movement_id;

  update public.assets
  set
    assigned_to_name = trim(coalesce(target_to_user_name, '')),
    location = trim(coalesce(target_to_location, '')),
    updated_by = auth.uid()
  where id = target_asset_id;

  return movement_id;
end;
$$;

revoke all on function public.record_inventory_movement(
  uuid, date, text, text, text, text, text
) from public, anon;
grant execute on function public.record_inventory_movement(
  uuid, date, text, text, text, text, text
) to authenticated;

-- Prevent direct inserts from spoofing the derived "from" values and keep
-- history immutable. Imports using service_role remain possible.
revoke insert, update, delete on public.inventory_movements from authenticated;
drop policy if exists inventory_movements_insert on public.inventory_movements;
drop policy if exists inventory_movements_update on public.inventory_movements;

commit;
