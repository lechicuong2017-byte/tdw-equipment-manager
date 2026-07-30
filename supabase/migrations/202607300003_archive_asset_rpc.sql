begin;

create or replace function public.archive_asset(target_asset_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not public.can_access_asset(
    target_asset_id,
    'assets',
    'assets.manage'
  ) or not public.has_permission('assets.delete') then
    raise insufficient_privilege
      using message = 'Asset archive permission is required';
  end if;

  update public.assets
  set
    deleted_at = now(),
    deleted_by = auth.uid(),
    updated_at = now(),
    updated_by = auth.uid()
  where id = target_asset_id
    and deleted_at is null;

  if not found then
    raise no_data_found
      using message = 'Active asset not found';
  end if;
end;
$$;

revoke all on function public.archive_asset(uuid) from public;
grant execute on function public.archive_asset(uuid) to authenticated;

commit;
