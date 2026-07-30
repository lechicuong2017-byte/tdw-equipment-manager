begin;

alter table public.assets
  add column if not exists asset_kind text not null default 'DEVICE';

alter table public.assets
  drop constraint if exists assets_asset_kind_check;
alter table public.assets
  add constraint assets_asset_kind_check
  check (asset_kind in ('DEVICE', 'COMPONENT'));

create index if not exists assets_kind_active_idx
  on public.assets (asset_kind, asset_code)
  where deleted_at is null;

create table public.asset_component_installations (
  id uuid primary key default gen_random_uuid(),
  host_asset_id uuid not null references public.assets(id) on delete restrict,
  component_asset_id uuid not null references public.assets(id) on delete restrict,
  installed_at date not null,
  removed_at date,
  slot_name text not null default '',
  install_note text not null default '',
  removal_reason text not null default '',
  removal_note text not null default '',
  installed_by uuid references public.profiles(id) on delete set null default auth.uid(),
  removed_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (host_asset_id <> component_asset_id),
  check (removed_at is null or removed_at >= installed_at)
);

create unique index asset_component_one_active_host_idx
  on public.asset_component_installations (component_asset_id)
  where removed_at is null;
create index asset_component_host_active_idx
  on public.asset_component_installations (host_asset_id, installed_at desc)
  where removed_at is null;
create index asset_component_history_idx
  on public.asset_component_installations (component_asset_id, installed_at desc);

create trigger asset_component_installations_set_updated_at
before update on public.asset_component_installations
for each row execute procedure public.set_updated_at();

create trigger asset_component_installations_audit
after insert or update or delete on public.asset_component_installations
for each row execute procedure public.write_audit_log();

alter table public.asset_component_installations enable row level security;

create or replace function public.asset_scope_matches(
  target_asset_id uuid,
  target_module text
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select
    public.is_admin()
    or public.has_role_code('manager')
    or (
      public.has_role_code('user')
      and exists (
        select 1
        from public.asset_responsibles ar
        where ar.asset_id = target_asset_id
          and ar.user_id = auth.uid()
          and ar.active
      )
    )
    or exists (
      select 1
      from public.data_access_scopes das
      join public.assets a on a.id = target_asset_id
      where das.user_id = auth.uid()
        and das.module = target_module
        and (
          das.scope_type = 'all'
          or (das.scope_type = 'department' and das.department_id = a.department_id)
          or (
            das.scope_type = 'assigned'
            and exists (
              select 1
              from public.asset_responsibles ar
              where ar.asset_id = a.id
                and ar.user_id = auth.uid()
                and ar.active
            )
          )
          or (das.scope_type = 'owned' and a.created_by = auth.uid())
        )
    )
    or exists (
      select 1
      from public.asset_component_installations aci
      join public.assets host on host.id = aci.host_asset_id
      where aci.component_asset_id = target_asset_id
        and aci.removed_at is null
        and (
          (
            public.has_role_code('user')
            and exists (
              select 1
              from public.asset_responsibles ar
              where ar.asset_id = host.id
                and ar.user_id = auth.uid()
                and ar.active
            )
          )
          or exists (
            select 1
            from public.data_access_scopes das
            where das.user_id = auth.uid()
              and das.module = target_module
              and (
                das.scope_type = 'all'
                or (
                  das.scope_type = 'department'
                  and das.department_id = host.department_id
                )
                or (
                  das.scope_type = 'assigned'
                  and exists (
                    select 1
                    from public.asset_responsibles ar
                    where ar.asset_id = host.id
                      and ar.user_id = auth.uid()
                      and ar.active
                  )
                )
                or (das.scope_type = 'owned' and host.created_by = auth.uid())
              )
          )
        )
    );
$$;

create policy asset_component_installations_select
on public.asset_component_installations
for select to authenticated
using (
  public.can_access_asset(host_asset_id, 'assets', 'assets.view')
  and public.can_access_asset(component_asset_id, 'assets', 'assets.view')
);

create or replace function public.install_asset_component(
  target_host_asset_id uuid,
  target_component_asset_id uuid,
  target_installed_at date,
  target_slot_name text,
  target_note text
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  host public.assets%rowtype;
  component public.assets%rowtype;
  installation_id uuid;
begin
  if target_installed_at is null then
    raise exception 'Installation date is required' using errcode = '22023';
  end if;
  if target_host_asset_id = target_component_asset_id then
    raise exception 'An asset cannot contain itself' using errcode = '22023';
  end if;
  if not public.can_access_asset(target_host_asset_id, 'assets', 'assets.manage')
    or not public.can_access_asset(target_component_asset_id, 'assets', 'assets.manage')
  then
    raise insufficient_privilege using message = 'Asset management permission is required';
  end if;

  select * into host
  from public.assets
  where id = target_host_asset_id and deleted_at is null
  for update;
  select * into component
  from public.assets
  where id = target_component_asset_id and deleted_at is null
  for update;

  if host.id is null or host.asset_kind <> 'DEVICE' then
    raise exception 'Host must be an active device' using errcode = '22023';
  end if;
  if component.id is null or component.asset_kind <> 'COMPONENT' then
    raise exception 'Installed asset must be an active component' using errcode = '22023';
  end if;
  if component.quantity <> 1 then
    raise exception 'A tracked component must have quantity 1' using errcode = '22023';
  end if;

  insert into public.asset_component_installations (
    host_asset_id,
    component_asset_id,
    installed_at,
    slot_name,
    install_note,
    installed_by
  )
  values (
    target_host_asset_id,
    target_component_asset_id,
    target_installed_at,
    left(coalesce(target_slot_name, ''), 120),
    left(coalesce(target_note, ''), 1000),
    auth.uid()
  )
  returning id into installation_id;

  update public.assets
  set
    status = 'CON_SU_DUNG',
    department_id = host.department_id,
    department_legacy_name = host.department_legacy_name,
    assigned_to_name = host.assigned_to_name,
    location = host.location,
    updated_by = auth.uid()
  where id = target_component_asset_id;

  return installation_id;
exception
  when unique_violation then
    raise exception 'Component is already installed in another device'
      using errcode = '23505';
end;
$$;

create or replace function public.remove_asset_component(
  target_installation_id uuid,
  target_removed_at date,
  target_removal_reason text,
  target_removal_note text,
  target_component_status text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  installation public.asset_component_installations%rowtype;
begin
  if target_component_status not in (
    'CON_SU_DUNG', 'MOI_100', 'KEM_PHAM_CHAT', 'CAN_KIEM_TRA',
    'KHONG_SU_DUNG', 'LUU_KHO_THANH_LY'
  ) then
    raise exception 'Invalid component status' using errcode = '22023';
  end if;

  select * into installation
  from public.asset_component_installations
  where id = target_installation_id and removed_at is null
  for update;
  if installation.id is null then
    raise no_data_found using message = 'Active component installation not found';
  end if;
  if target_removed_at is null or target_removed_at < installation.installed_at then
    raise exception 'Removal date must not precede installation date'
      using errcode = '22023';
  end if;
  if not public.can_access_asset(installation.host_asset_id, 'assets', 'assets.manage')
    or not public.can_access_asset(installation.component_asset_id, 'assets', 'assets.manage')
  then
    raise insufficient_privilege using message = 'Asset management permission is required';
  end if;

  update public.asset_component_installations
  set
    removed_at = target_removed_at,
    removal_reason = left(coalesce(target_removal_reason, ''), 300),
    removal_note = left(coalesce(target_removal_note, ''), 1000),
    removed_by = auth.uid()
  where id = installation.id;

  update public.assets
  set status = target_component_status, updated_by = auth.uid()
  where id = installation.component_asset_id;
end;
$$;

create or replace function public.replace_asset_component(
  target_installation_id uuid,
  target_new_component_asset_id uuid,
  target_changed_at date,
  target_slot_name text,
  target_note text,
  target_old_component_status text
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  installation public.asset_component_installations%rowtype;
  host public.assets%rowtype;
  new_component public.assets%rowtype;
  new_installation_id uuid;
begin
  if target_old_component_status not in (
    'CON_SU_DUNG', 'MOI_100', 'KEM_PHAM_CHAT', 'CAN_KIEM_TRA',
    'KHONG_SU_DUNG', 'LUU_KHO_THANH_LY'
  ) then
    raise exception 'Invalid component status' using errcode = '22023';
  end if;

  select * into installation
  from public.asset_component_installations
  where id = target_installation_id and removed_at is null
  for update;
  if installation.id is null then
    raise no_data_found using message = 'Active component installation not found';
  end if;
  if target_changed_at is null or target_changed_at < installation.installed_at then
    raise exception 'Replacement date must not precede installation date'
      using errcode = '22023';
  end if;
  if target_new_component_asset_id = installation.component_asset_id then
    raise exception 'Select a different replacement component' using errcode = '22023';
  end if;
  if not public.can_access_asset(installation.host_asset_id, 'assets', 'assets.manage')
    or not public.can_access_asset(installation.component_asset_id, 'assets', 'assets.manage')
    or not public.can_access_asset(target_new_component_asset_id, 'assets', 'assets.manage')
  then
    raise insufficient_privilege using message = 'Asset management permission is required';
  end if;

  select * into host
  from public.assets
  where id = installation.host_asset_id and deleted_at is null
  for update;
  select * into new_component
  from public.assets
  where id = target_new_component_asset_id and deleted_at is null
  for update;
  if new_component.id is null or new_component.asset_kind <> 'COMPONENT'
    or new_component.quantity <> 1
  then
    raise exception 'Replacement must be an active component with quantity 1'
      using errcode = '22023';
  end if;

  update public.asset_component_installations
  set
    removed_at = target_changed_at,
    removal_reason = 'THAY_THE',
    removal_note = left(coalesce(target_note, ''), 1000),
    removed_by = auth.uid()
  where id = installation.id;

  update public.assets
  set status = target_old_component_status, updated_by = auth.uid()
  where id = installation.component_asset_id;

  insert into public.asset_component_installations (
    host_asset_id,
    component_asset_id,
    installed_at,
    slot_name,
    install_note,
    installed_by
  )
  values (
    installation.host_asset_id,
    target_new_component_asset_id,
    target_changed_at,
    left(coalesce(nullif(target_slot_name, ''), installation.slot_name), 120),
    left(coalesce(target_note, ''), 1000),
    auth.uid()
  )
  returning id into new_installation_id;

  update public.assets
  set
    status = 'CON_SU_DUNG',
    department_id = host.department_id,
    department_legacy_name = host.department_legacy_name,
    assigned_to_name = host.assigned_to_name,
    location = host.location,
    updated_by = auth.uid()
  where id = target_new_component_asset_id;

  return new_installation_id;
exception
  when unique_violation then
    raise exception 'Replacement component is already installed in another device'
      using errcode = '23505';
end;
$$;

create or replace function public.sync_installed_component_assignment()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.asset_kind = 'DEVICE'
    and (
      old.department_id is distinct from new.department_id
      or old.department_legacy_name is distinct from new.department_legacy_name
      or old.assigned_to_name is distinct from new.assigned_to_name
      or old.location is distinct from new.location
    )
  then
    update public.assets component
    set
      department_id = new.department_id,
      department_legacy_name = new.department_legacy_name,
      assigned_to_name = new.assigned_to_name,
      location = new.location,
      updated_by = auth.uid()
    from public.asset_component_installations installation
    where installation.host_asset_id = new.id
      and installation.component_asset_id = component.id
      and installation.removed_at is null;
  end if;
  return new;
end;
$$;

create trigger assets_sync_installed_components
after update of department_id, department_legacy_name, assigned_to_name, location
on public.assets
for each row execute function public.sync_installed_component_assignment();

create or replace function public.archive_asset(target_asset_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not public.can_access_asset(target_asset_id, 'assets', 'assets.manage')
    or not public.has_permission('assets.delete')
  then
    raise insufficient_privilege
      using message = 'Asset archive permission is required';
  end if;
  if exists (
    select 1
    from public.asset_component_installations
    where removed_at is null
      and (host_asset_id = target_asset_id or component_asset_id = target_asset_id)
  ) then
    raise exception 'Remove active component links before archiving the asset'
      using errcode = '23503';
  end if;

  update public.assets
  set
    deleted_at = now(),
    deleted_by = auth.uid(),
    updated_at = now(),
    updated_by = auth.uid()
  where id = target_asset_id and deleted_at is null;
  if not found then
    raise no_data_found using message = 'Active asset not found';
  end if;
end;
$$;

revoke all on public.asset_component_installations from authenticated;
grant select on public.asset_component_installations to authenticated;

revoke all on function public.install_asset_component(uuid, uuid, date, text, text) from public;
revoke all on function public.remove_asset_component(uuid, date, text, text, text) from public;
revoke all on function public.replace_asset_component(uuid, uuid, date, text, text, text) from public;
grant execute on function public.install_asset_component(uuid, uuid, date, text, text) to authenticated;
grant execute on function public.remove_asset_component(uuid, date, text, text, text) to authenticated;
grant execute on function public.replace_asset_component(uuid, uuid, date, text, text, text) to authenticated;

commit;
