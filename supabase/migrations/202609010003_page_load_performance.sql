begin;

create or replace function public.get_asset_list_context(target_scope text)
returns jsonb
language sql
stable
security invoker
set search_path = ''
as $$
  with category_counts as (
    select trim(asset_type) as category, count(*) as item_count
    from public.assets
    where deleted_at is null
      and trim(asset_type) <> ''
      and (
        (target_scope = 'liquidated' and status = 'DA_THANH_LY')
        or (target_scope <> 'liquidated' and status <> 'DA_THANH_LY')
      )
    group by trim(asset_type)
  )
  select jsonb_build_object(
    'settings', coalesce(
      (
        select jsonb_agg(
          jsonb_build_object(
            'setting_type', setting_type,
            'setting_value', setting_value,
            'display_name', display_name
          ) order by setting_type, sort_order, display_name
        )
        from public.settings
        where setting_type in ('status', 'asset_type') and active
      ),
      '[]'::jsonb
    ),
    'departments', coalesce(
      (
        select jsonb_agg(
          jsonb_build_object('id', id, 'name', name) order by name
        )
        from public.departments
      ),
      '[]'::jsonb
    ),
    'categories', coalesce(
      (
        select jsonb_agg(
          jsonb_build_object('category', category, 'item_count', item_count)
          order by lower(category)
        )
        from category_counts
      ),
      '[]'::jsonb
    ),
    'active_count', (
      select count(*) from public.assets
      where deleted_at is null and status <> 'DA_THANH_LY'
    ),
    'liquidated_count', (
      select count(*) from public.assets
      where deleted_at is null and status = 'DA_THANH_LY'
    )
  );
$$;

revoke all on function public.get_asset_list_context(text) from public;
grant execute on function public.get_asset_list_context(text) to authenticated;

create or replace function public.get_dashboard_stats()
returns jsonb
language sql
stable
security invoker
set search_path = ''
as $$
  with report_year as (
    select extract(year from timezone('Asia/Ho_Chi_Minh', now()))::integer as value
  ),
  visible_assets as (
    select id, asset_kind, status, total_price, purchase_year, purchase_date
    from public.assets
    where deleted_at is null
  ),
  managed_assets as (
    select * from visible_assets where status <> 'DA_THANH_LY'
  ),
  active_installations as (
    select installation.component_asset_id
    from public.asset_component_installations installation
    join managed_assets host on host.id = installation.host_asset_id
    join managed_assets component on component.id = installation.component_asset_id
    where installation.removed_at is null
  ),
  current_year_assets as (
    select asset.*
    from managed_assets asset
    cross join report_year
    where asset.purchase_year = report_year.value
      or (
        asset.purchase_year is null
        and asset.purchase_date >= make_date(report_year.value, 1, 1)
        and asset.purchase_date < make_date(report_year.value + 1, 1, 1)
      )
  )
  select jsonb_build_object(
    'total_assets', (select count(*) from managed_assets),
    'liquidated_assets', (select count(*) from visible_assets where status = 'DA_THANH_LY'),
    'device_assets', (select count(*) from managed_assets where asset_kind = 'DEVICE'),
    'component_assets', (select count(*) from managed_assets where asset_kind = 'COMPONENT'),
    'installed_components', (select count(*) from active_installations),
    'available_components', (
      select count(*)
      from managed_assets asset
      where asset.asset_kind = 'COMPONENT'
        and not exists (
          select 1 from active_installations installation
          where installation.component_asset_id = asset.id
        )
    ),
    'active_assets', (select count(*) from managed_assets where status = 'CON_SU_DUNG'),
    'needs_attention', (
      select count(*) from managed_assets
      where status in ('CAN_KIEM_TRA', 'KEM_PHAM_CHAT')
    ),
    'stored_assets', (
      select count(*) from managed_assets
      where status in ('LUU_KHO_THANH_LY', 'KHONG_SU_DUNG')
    ),
    'total_value', coalesce((select sum(total_price) from managed_assets), 0),
    'current_year_asset_count', (select count(*) from current_year_assets),
    'current_year_asset_value', coalesce((select sum(total_price) from current_year_assets), 0),
    'by_status', coalesce(
      (
        select jsonb_object_agg(status, item_count)
        from (
          select status, count(*) as item_count
          from managed_assets
          group by status
        ) status_counts
      ),
      '{}'::jsonb
    )
  );
$$;

create index if not exists audit_logs_action_created_idx
  on public.audit_logs (action, created_at desc);
create index if not exists audit_logs_table_created_idx
  on public.audit_logs (table_name, created_at desc);
create index if not exists vehicle_inspections_date_idx
  on public.vehicle_inspections (inspection_date desc);
create index if not exists vehicle_repairs_date_idx
  on public.vehicle_repairs (service_date desc);
create index if not exists vehicle_fuel_date_idx
  on public.vehicle_fuel_logs (payment_date desc);
create index if not exists vehicle_insurances_active_starts_idx
  on public.vehicle_insurances (starts_on desc)
  where archived_at is null;
create index if not exists vehicle_documents_record_created_idx
  on public.vehicle_documents (record_type, created_at desc);

commit;
