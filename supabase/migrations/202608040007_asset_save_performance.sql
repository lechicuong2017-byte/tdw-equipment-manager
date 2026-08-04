create or replace function public.sync_asset_group_label()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  resolved_label text;
begin
  if coalesce(new.asset_group, '') = '' then
    new.asset_group_label := '';
    return new;
  end if;

  select setting.display_name
    into resolved_label
  from public.settings setting
  where setting.setting_type = 'asset_group'
    and setting.setting_value = new.asset_group
  limit 1;

  new.asset_group_label := coalesce(resolved_label, new.asset_group);
  return new;
end;
$$;

drop trigger if exists assets_sync_group_label on public.assets;
create trigger assets_sync_group_label
before insert or update of asset_group on public.assets
for each row execute function public.sync_asset_group_label();
