begin;

create or replace function public.archive_vehicle(target_vehicle_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not public.can_access_vehicle(target_vehicle_id, 'vehicles.delete') then
    raise insufficient_privilege
      using message = 'Vehicle archive permission is required';
  end if;

  update public.vehicles
  set
    deleted_at = now(),
    updated_at = now(),
    updated_by = auth.uid()
  where id = target_vehicle_id
    and deleted_at is null;

  if not found then
    raise no_data_found
      using message = 'Active vehicle not found';
  end if;
end;
$$;

revoke all on function public.archive_vehicle(uuid) from public, anon;
grant execute on function public.archive_vehicle(uuid) to authenticated;

commit;
