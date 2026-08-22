begin;

create or replace function public.update_asset_component_installation(
  target_installation_id uuid,
  target_installed_at date,
  target_slot_name text,
  target_note text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  installation public.asset_component_installations%rowtype;
begin
  if target_installed_at is null then
    raise exception 'Installation date is required' using errcode = '22023';
  end if;

  select * into installation
  from public.asset_component_installations
  where id = target_installation_id and removed_at is null
  for update;

  if installation.id is null then
    raise no_data_found using message = 'Active component installation not found';
  end if;
  if not public.can_access_asset(installation.host_asset_id, 'assets', 'assets.manage')
    or not public.can_access_asset(installation.component_asset_id, 'assets', 'assets.manage')
  then
    raise insufficient_privilege using message = 'Asset management permission is required';
  end if;

  update public.asset_component_installations
  set
    installed_at = target_installed_at,
    slot_name = left(coalesce(target_slot_name, ''), 120),
    install_note = left(coalesce(target_note, ''), 1000)
  where id = installation.id;
end;
$$;

commit;
