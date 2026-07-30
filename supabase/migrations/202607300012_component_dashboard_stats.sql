create or replace function public.get_dashboard_stats()
returns jsonb
language sql
stable
security invoker
set search_path = ''
as $$
  with visible_assets as (
    select id, asset_kind, status, total_price
    from public.assets
    where deleted_at is null
  ),
  active_installations as (
    select component_asset_id
    from public.asset_component_installations
    where removed_at is null
  )
  select jsonb_build_object(
    'total_assets', count(*),
    'device_assets', count(*) filter (where asset_kind = 'DEVICE'),
    'component_assets', count(*) filter (where asset_kind = 'COMPONENT'),
    'installed_components', (
      select count(*) from active_installations
    ),
    'available_components', count(*) filter (
      where asset_kind = 'COMPONENT'
        and not exists (
          select 1
          from active_installations installation
          where installation.component_asset_id = visible_assets.id
        )
    ),
    'active_assets', count(*) filter (where status = 'CON_SU_DUNG'),
    'needs_attention', count(*) filter (
      where status in ('CAN_KIEM_TRA', 'KEM_PHAM_CHAT')
    ),
    'stored_assets', count(*) filter (
      where status in ('LUU_KHO_THANH_LY', 'KHONG_SU_DUNG')
    ),
    'total_value', coalesce(sum(total_price), 0),
    'by_status', coalesce(
      (
        select jsonb_object_agg(status, item_count)
        from (
          select status, count(*) as item_count
          from visible_assets
          group by status
        ) status_counts
      ),
      '{}'::jsonb
    )
  )
  from visible_assets;
$$;

