create index if not exists assets_type_updated_active_idx
  on public.assets (asset_type, updated_at desc)
  where deleted_at is null;

create or replace function public.get_asset_filter_options()
returns table(category text, item_count bigint)
language sql
stable
security invoker
set search_path = ''
as $$
  select trim(asset_type) as category, count(*) as item_count
  from public.assets
  where deleted_at is null
    and trim(asset_type) <> ''
  group by trim(asset_type)
  order by lower(trim(asset_type));
$$;

revoke all on function public.get_asset_filter_options() from public;
grant execute on function public.get_asset_filter_options() to authenticated;

