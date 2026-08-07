begin;

create table if not exists public.asset_liquidations (
  id uuid primary key default gen_random_uuid(),
  asset_id uuid not null references public.assets(id) on delete restrict,
  liquidation_date date not null,
  recovery_value numeric(18, 2) check (recovery_value is null or recovery_value >= 0),
  reason text not null default '',
  note text not null default '',
  recorded_by uuid references public.profiles(id) on delete set null default auth.uid(),
  created_at timestamptz not null default now(),
  voided_at timestamptz,
  voided_by uuid references public.profiles(id) on delete set null,
  void_reason text not null default ''
);

create unique index if not exists asset_liquidations_active_asset_idx
  on public.asset_liquidations (asset_id)
  where voided_at is null;

create index if not exists asset_liquidations_date_idx
  on public.asset_liquidations (liquidation_date desc, asset_id)
  where voided_at is null;

create or replace function public.prevent_liquidated_asset_installation()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.removed_at is null and exists (
    select 1
    from public.assets
    where id in (new.host_asset_id, new.component_asset_id)
      and status = 'DA_THANH_LY'
  ) then
    raise exception 'Liquidated assets cannot have active component links'
      using errcode = '23514';
  end if;
  return new;
end;
$$;

drop trigger if exists asset_installations_prevent_liquidated on public.asset_component_installations;
create trigger asset_installations_prevent_liquidated
before insert or update of host_asset_id, component_asset_id, removed_at
on public.asset_component_installations
for each row execute function public.prevent_liquidated_asset_installation();

alter table public.asset_liquidations enable row level security;

drop policy if exists asset_liquidations_select on public.asset_liquidations;
create policy asset_liquidations_select on public.asset_liquidations
  for select to authenticated
  using (public.can_access_asset(asset_id, 'assets', 'assets.view'));

revoke all on public.asset_liquidations from anon, authenticated;
grant select on public.asset_liquidations to authenticated;

drop trigger if exists asset_liquidations_audit on public.asset_liquidations;
create trigger asset_liquidations_audit
after insert or update or delete on public.asset_liquidations
for each row execute function public.write_audit_log();

create or replace function public.liquidate_asset(
  target_asset_id uuid,
  target_liquidation_date date,
  target_recovery_value numeric,
  target_reason text,
  target_note text
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  target_asset public.assets%rowtype;
  liquidation_id uuid;
  normalized_reason text := btrim(coalesce(target_reason, ''));
begin
  if auth.uid() is null
    or not public.can_access_asset(target_asset_id, 'assets', 'assets.manage')
    or not public.has_permission('assets.delete')
  then
    raise insufficient_privilege using message = 'Asset liquidation permission is required';
  end if;

  if target_liquidation_date is null
    or target_liquidation_date > public.vietnam_current_date()
  then
    raise exception 'Invalid liquidation date' using errcode = '22023';
  end if;
  if target_recovery_value is not null and target_recovery_value < 0 then
    raise exception 'Invalid recovery value' using errcode = '22023';
  end if;
  if normalized_reason = '' or length(normalized_reason) > 500 then
    raise exception 'Invalid liquidation reason' using errcode = '22023';
  end if;
  if length(coalesce(target_note, '')) > 2000 then
    raise exception 'Invalid liquidation note' using errcode = '22023';
  end if;

  select * into target_asset
  from public.assets
  where id = target_asset_id and deleted_at is null
  for update;

  if target_asset.id is null then
    raise no_data_found using message = 'Active asset not found';
  end if;
  if target_asset.status = 'DA_THANH_LY' then
    raise exception 'Asset is already liquidated' using errcode = '23505';
  end if;
  if exists (
    select 1
    from public.asset_component_installations
    where removed_at is null
      and (host_asset_id = target_asset_id or component_asset_id = target_asset_id)
  ) then
    raise exception 'Remove active component links before liquidating the asset'
      using errcode = '23503';
  end if;

  insert into public.asset_liquidations (
    asset_id,
    liquidation_date,
    recovery_value,
    reason,
    note,
    recorded_by
  )
  values (
    target_asset_id,
    target_liquidation_date,
    target_recovery_value,
    normalized_reason,
    btrim(coalesce(target_note, '')),
    auth.uid()
  )
  returning id into liquidation_id;

  update public.assets
  set status = 'DA_THANH_LY', updated_by = auth.uid()
  where id = target_asset_id;

  return liquidation_id;
end;
$$;

create or replace function public.restore_liquidated_asset(
  target_asset_id uuid,
  target_void_reason text default 'Khôi phục do ghi nhận nhầm'
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null
    or not public.can_access_asset(target_asset_id, 'assets', 'assets.manage')
    or not public.has_permission('assets.delete')
  then
    raise insufficient_privilege using message = 'Asset liquidation permission is required';
  end if;

  update public.asset_liquidations
  set
    voided_at = now(),
    voided_by = auth.uid(),
    void_reason = left(btrim(coalesce(target_void_reason, '')), 500)
  where asset_id = target_asset_id and voided_at is null;

  if not found then
    raise no_data_found using message = 'Active liquidation record not found';
  end if;

  update public.assets
  set status = 'LUU_KHO_THANH_LY', updated_by = auth.uid()
  where id = target_asset_id
    and deleted_at is null
    and status = 'DA_THANH_LY';

  if not found then
    raise no_data_found using message = 'Liquidated asset not found';
  end if;
end;
$$;

revoke all on function public.liquidate_asset(uuid, date, numeric, text, text) from public;
revoke all on function public.restore_liquidated_asset(uuid, text) from public;
grant execute on function public.liquidate_asset(uuid, date, numeric, text, text) to authenticated;
grant execute on function public.restore_liquidated_asset(uuid, text) to authenticated;

insert into public.settings (
  setting_type,
  setting_value,
  display_name,
  sort_order,
  active
)
values ('status', 'DA_THANH_LY', 'Đã thanh lý', 70, true)
on conflict (setting_type, setting_value) do update
set active = true;

create or replace function public.get_asset_filter_options_for_scope(target_scope text)
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
    and (
      (target_scope = 'liquidated' and status = 'DA_THANH_LY')
      or (target_scope <> 'liquidated' and status <> 'DA_THANH_LY')
    )
  group by trim(asset_type)
  order by lower(trim(asset_type));
$$;

revoke all on function public.get_asset_filter_options_for_scope(text) from public;
grant execute on function public.get_asset_filter_options_for_scope(text) to authenticated;

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
  managed_assets as (
    select * from visible_assets where status <> 'DA_THANH_LY'
  ),
  active_installations as (
    select installation.component_asset_id
    from public.asset_component_installations installation
    join managed_assets host on host.id = installation.host_asset_id
    join managed_assets component on component.id = installation.component_asset_id
    where installation.removed_at is null
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

commit;
