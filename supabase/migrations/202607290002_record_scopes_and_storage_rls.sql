begin;

-- A permission answers "what may this user do?". A data scope answers
-- "to which records may they do it?". Keeping both dimensions separate makes
-- it possible to grant a viewer one department without broadening the role.
create table public.data_access_scopes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  module text not null
    check (module in ('assets', 'maintenance', 'movement', 'software')),
  scope_type text not null
    check (scope_type in ('all', 'department', 'assigned', 'owned')),
  department_id uuid references public.departments(id) on delete cascade,
  created_by uuid references public.profiles(id) on delete set null default auth.uid(),
  created_at timestamptz not null default now(),
  check (
    (scope_type = 'department' and department_id is not null)
    or (scope_type <> 'department' and department_id is null)
  ),
  unique nulls not distinct (user_id, module, scope_type, department_id)
);

create index data_access_scopes_user_module_idx
  on public.data_access_scopes (user_id, module);

alter table public.data_access_scopes enable row level security;

create or replace function public.has_role_code(required_role text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.user_roles ur
    join public.roles r on r.id = ur.role_id
    join public.profiles p on p.id = ur.user_id
    where ur.user_id = auth.uid()
      and r.code = required_role
      and p.active
  );
$$;

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
          or (
            das.scope_type = 'department'
            and das.department_id = a.department_id
          )
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
          or (
            das.scope_type = 'owned'
            and a.created_by = auth.uid()
          )
        )
    );
$$;

create or replace function public.can_access_asset(
  target_asset_id uuid,
  target_module text,
  required_permission text
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select
    public.has_permission(required_permission)
    and public.asset_scope_matches(target_asset_id, target_module);
$$;

create or replace function public.can_create_for_department(
  target_department_id uuid,
  target_module text,
  required_permission text
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select
    public.has_permission(required_permission)
    and (
      public.is_admin()
      or public.has_role_code('manager')
      or exists (
        select 1
        from public.data_access_scopes das
        where das.user_id = auth.uid()
          and das.module = target_module
          and (
            das.scope_type = 'all'
            or (
              das.scope_type = 'department'
              and das.department_id = target_department_id
            )
          )
      )
    );
$$;

create or replace function public.enforce_asset_department_scope()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if old.department_id is distinct from new.department_id
    and not public.can_create_for_department(
      new.department_id,
      'assets',
      'assets.manage'
    )
  then
    raise exception 'Not allowed to move asset to this department';
  end if;
  return new;
end;
$$;

create or replace function public.can_access_software_license(
  target_license_id uuid,
  required_permission text
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select
    public.has_permission(required_permission)
    and exists (
      select 1
      from public.software_licenses sl
      where sl.id = target_license_id
        and (
          public.is_admin()
          or public.has_role_code('manager')
          or (
            public.has_role_code('user')
            and (
              sl.assigned_user_id = auth.uid()
              or (
                sl.assigned_asset_id is not null
                and public.asset_scope_matches(sl.assigned_asset_id, 'software')
              )
            )
          )
          or exists (
            select 1
            from public.data_access_scopes das
            left join public.assets a on a.id = sl.assigned_asset_id
            where das.user_id = auth.uid()
              and das.module = 'software'
              and (
                das.scope_type = 'all'
                or (
                  das.scope_type = 'department'
                  and das.department_id = a.department_id
                )
                or (
                  das.scope_type = 'assigned'
                  and (
                    sl.assigned_user_id = auth.uid()
                    or exists (
                      select 1
                      from public.asset_responsibles ar
                      where ar.asset_id = sl.assigned_asset_id
                        and ar.user_id = auth.uid()
                        and ar.active
                    )
                  )
                )
                or (
                  das.scope_type = 'owned'
                  and sl.created_by = auth.uid()
                )
              )
          )
        )
    );
$$;

create or replace function public.can_read_storage_object(target_name text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.media_files mf
    where mf.bucket_id = 'asset-media'
      and mf.object_path = target_name
      and (
        (
          mf.owner_type = 'ASSET'
          and public.can_access_asset(mf.asset_id, 'assets', 'assets.view')
        )
        or (
          mf.owner_type = 'MAINTENANCE'
          and public.can_access_asset(
            mf.asset_id,
            'maintenance',
            'maintenance.view'
          )
        )
      )
  );
$$;

create or replace function public.can_manage_storage_object(target_name text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.media_files mf
    where mf.bucket_id = 'asset-media'
      and mf.object_path = target_name
      and (
        (
          mf.owner_type = 'ASSET'
          and public.can_access_asset(mf.asset_id, 'assets', 'assets.manage')
        )
        or (
          mf.owner_type = 'MAINTENANCE'
          and public.can_access_asset(
            mf.asset_id,
            'maintenance',
            'maintenance.manage'
          )
        )
      )
  );
$$;

create or replace function public.can_upload_storage_object(target_name text)
returns boolean
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  path_parts text[];
  target_asset_id uuid;
begin
  path_parts := storage.foldername(target_name);
  if coalesce(array_length(path_parts, 1), 0) < 2 then
    return false;
  end if;
  if path_parts[1] <> auth.uid()::text then
    return false;
  end if;

  begin
    target_asset_id := path_parts[2]::uuid;
  exception when invalid_text_representation then
    return false;
  end;

  return
    public.can_access_asset(target_asset_id, 'assets', 'assets.manage')
    or public.can_access_asset(
      target_asset_id,
      'maintenance',
      'maintenance.manage'
    );
end;
$$;

create policy data_access_scopes_select on public.data_access_scopes
  for select to authenticated
  using (user_id = auth.uid() or public.is_admin());
create policy data_access_scopes_insert on public.data_access_scopes
  for insert to authenticated
  with check (public.is_admin());
create policy data_access_scopes_update on public.data_access_scopes
  for update to authenticated
  using (public.is_admin())
  with check (public.is_admin());
create policy data_access_scopes_delete on public.data_access_scopes
  for delete to authenticated
  using (public.is_admin());

create policy user_roles_insert_admin on public.user_roles
  for insert to authenticated
  with check (public.is_admin());
create policy user_roles_delete_admin on public.user_roles
  for delete to authenticated
  using (public.is_admin());
create policy profiles_update_admin on public.profiles
  for update to authenticated
  using (public.is_admin())
  with check (public.is_admin());

drop policy if exists assets_select on public.assets;
drop policy if exists assets_insert on public.assets;
drop policy if exists assets_update on public.assets;

create policy assets_select on public.assets
  for select to authenticated
  using (
    deleted_at is null
    and public.can_access_asset(id, 'assets', 'assets.view')
  );
create policy assets_insert on public.assets
  for insert to authenticated
  with check (
    public.can_create_for_department(
      department_id,
      'assets',
      'assets.manage'
    )
  );
create policy assets_update on public.assets
  for update to authenticated
  using (
    deleted_at is null
    and public.can_access_asset(id, 'assets', 'assets.manage')
  )
  with check (
    public.can_access_asset(id, 'assets', 'assets.manage')
    and (
      deleted_at is null
      or public.has_permission('assets.delete')
    )
  );

create trigger assets_enforce_department_scope
before update on public.assets
for each row execute function public.enforce_asset_department_scope();

drop policy if exists asset_responsibles_select on public.asset_responsibles;
drop policy if exists asset_responsibles_insert on public.asset_responsibles;
drop policy if exists asset_responsibles_update on public.asset_responsibles;
drop policy if exists asset_responsibles_delete on public.asset_responsibles;

create policy asset_responsibles_select on public.asset_responsibles
  for select to authenticated
  using (public.can_access_asset(asset_id, 'assets', 'assets.view'));
create policy asset_responsibles_insert on public.asset_responsibles
  for insert to authenticated
  with check (public.can_access_asset(asset_id, 'assets', 'assets.manage'));
create policy asset_responsibles_update on public.asset_responsibles
  for update to authenticated
  using (public.can_access_asset(asset_id, 'assets', 'assets.manage'))
  with check (public.can_access_asset(asset_id, 'assets', 'assets.manage'));
create policy asset_responsibles_delete on public.asset_responsibles
  for delete to authenticated
  using (public.can_access_asset(asset_id, 'assets', 'assets.manage'));

drop policy if exists inventory_movements_select on public.inventory_movements;
drop policy if exists inventory_movements_insert on public.inventory_movements;
drop policy if exists inventory_movements_update on public.inventory_movements;

create policy inventory_movements_select on public.inventory_movements
  for select to authenticated
  using (
    public.can_access_asset(asset_id, 'movement', 'movement.view')
  );
create policy inventory_movements_insert on public.inventory_movements
  for insert to authenticated
  with check (
    public.can_access_asset(asset_id, 'movement', 'movement.manage')
  );
create policy inventory_movements_update on public.inventory_movements
  for update to authenticated
  using (
    public.can_access_asset(asset_id, 'movement', 'movement.manage')
  )
  with check (
    public.can_access_asset(asset_id, 'movement', 'movement.manage')
  );

drop policy if exists maintenance_plans_select on public.maintenance_plans;
drop policy if exists maintenance_plans_insert on public.maintenance_plans;
drop policy if exists maintenance_plans_update on public.maintenance_plans;
drop policy if exists maintenance_plans_delete on public.maintenance_plans;
drop policy if exists maintenance_logs_select on public.maintenance_logs;
drop policy if exists maintenance_logs_insert on public.maintenance_logs;
drop policy if exists maintenance_logs_update on public.maintenance_logs;
drop policy if exists maintenance_logs_delete on public.maintenance_logs;
drop policy if exists maintenance_notifications_select
  on public.maintenance_notification_logs;

create policy maintenance_plans_select on public.maintenance_plans
  for select to authenticated
  using (
    public.can_access_asset(asset_id, 'maintenance', 'maintenance.view')
  );
create policy maintenance_plans_insert on public.maintenance_plans
  for insert to authenticated
  with check (
    public.can_access_asset(asset_id, 'maintenance', 'maintenance.manage')
  );
create policy maintenance_plans_update on public.maintenance_plans
  for update to authenticated
  using (
    public.can_access_asset(asset_id, 'maintenance', 'maintenance.manage')
  )
  with check (
    public.can_access_asset(asset_id, 'maintenance', 'maintenance.manage')
  );
create policy maintenance_plans_delete on public.maintenance_plans
  for delete to authenticated
  using (
    public.can_access_asset(asset_id, 'maintenance', 'maintenance.delete')
  );

create policy maintenance_logs_select on public.maintenance_logs
  for select to authenticated
  using (
    public.can_access_asset(asset_id, 'maintenance', 'maintenance.view')
  );
create policy maintenance_logs_insert on public.maintenance_logs
  for insert to authenticated
  with check (
    public.can_access_asset(asset_id, 'maintenance', 'maintenance.manage')
  );
create policy maintenance_logs_update on public.maintenance_logs
  for update to authenticated
  using (
    public.can_access_asset(asset_id, 'maintenance', 'maintenance.manage')
  )
  with check (
    public.can_access_asset(asset_id, 'maintenance', 'maintenance.manage')
  );
create policy maintenance_logs_delete on public.maintenance_logs
  for delete to authenticated
  using (
    public.can_access_asset(asset_id, 'maintenance', 'maintenance.delete')
  );

create policy maintenance_notifications_select
  on public.maintenance_notification_logs
  for select to authenticated
  using (
    public.can_access_asset(asset_id, 'maintenance', 'maintenance.view')
  );

drop policy if exists software_licenses_select on public.software_licenses;
drop policy if exists software_licenses_insert on public.software_licenses;
drop policy if exists software_licenses_update on public.software_licenses;
drop policy if exists software_licenses_delete on public.software_licenses;

create policy software_licenses_select on public.software_licenses
  for select to authenticated
  using (
    public.can_access_software_license(id, 'software.view')
  );
create policy software_licenses_insert on public.software_licenses
  for insert to authenticated
  with check (
    public.has_permission('software.manage')
    and (
      public.is_admin()
      or public.has_role_code('manager')
      or (
        assigned_asset_id is not null
        and public.asset_scope_matches(assigned_asset_id, 'software')
      )
      or assigned_user_id = auth.uid()
    )
  );
create policy software_licenses_update on public.software_licenses
  for update to authenticated
  using (
    public.can_access_software_license(id, 'software.manage')
  )
  with check (
    public.has_permission('software.manage')
    and (
      public.is_admin()
      or public.has_role_code('manager')
      or (
        assigned_asset_id is not null
        and public.asset_scope_matches(assigned_asset_id, 'software')
      )
      or assigned_user_id = auth.uid()
    )
  );
create policy software_licenses_delete on public.software_licenses
  for delete to authenticated
  using (
    public.can_access_software_license(id, 'software.delete')
  );

drop policy if exists media_files_select on public.media_files;
drop policy if exists media_files_insert on public.media_files;
drop policy if exists media_files_update on public.media_files;
drop policy if exists media_files_delete on public.media_files;

create policy media_files_select on public.media_files
  for select to authenticated
  using (
    (owner_type = 'ASSET'
      and public.can_access_asset(asset_id, 'assets', 'assets.view'))
    or
    (owner_type = 'MAINTENANCE'
      and public.can_access_asset(
        asset_id,
        'maintenance',
        'maintenance.view'
      ))
  );
create policy media_files_insert on public.media_files
  for insert to authenticated
  with check (
    bucket_id = 'asset-media'
    and created_by = auth.uid()
    and (
      (owner_type = 'ASSET'
        and public.can_access_asset(asset_id, 'assets', 'assets.manage'))
      or
      (owner_type = 'MAINTENANCE'
        and public.can_access_asset(
          asset_id,
          'maintenance',
          'maintenance.manage'
        ))
    )
  );
create policy media_files_delete on public.media_files
  for delete to authenticated
  using (
    (owner_type = 'ASSET'
      and public.can_access_asset(asset_id, 'assets', 'assets.manage'))
    or
    (owner_type = 'MAINTENANCE'
      and public.can_access_asset(
        asset_id,
        'maintenance',
        'maintenance.manage'
      ))
  );

drop policy if exists asset_media_select on storage.objects;
drop policy if exists asset_media_insert on storage.objects;
drop policy if exists asset_media_update on storage.objects;
drop policy if exists asset_media_delete on storage.objects;

create policy asset_media_select on storage.objects
  for select to authenticated
  using (
    bucket_id = 'asset-media'
    and public.can_read_storage_object(name)
  );
create policy asset_media_insert on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'asset-media'
    and public.can_upload_storage_object(name)
  );
create policy asset_media_delete on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'asset-media'
    and public.can_manage_storage_object(name)
  );

create trigger data_access_scopes_audit
after insert or update or delete on public.data_access_scopes
for each row execute function public.write_audit_log();

revoke all on function public.has_role_code(text) from public;
revoke all on function public.asset_scope_matches(uuid, text) from public;
revoke all on function public.can_access_asset(uuid, text, text) from public;
revoke all on function public.can_create_for_department(uuid, text, text)
  from public;
revoke all on function public.enforce_asset_department_scope() from public;
revoke all on function public.can_access_software_license(uuid, text)
  from public;
revoke all on function public.can_read_storage_object(text) from public;
revoke all on function public.can_manage_storage_object(text) from public;
revoke all on function public.can_upload_storage_object(text) from public;

grant execute on function public.has_role_code(text) to authenticated;
grant execute on function public.asset_scope_matches(uuid, text)
  to authenticated;
grant execute on function public.can_access_asset(uuid, text, text)
  to authenticated;
grant execute on function public.can_create_for_department(uuid, text, text)
  to authenticated;
grant execute on function public.can_access_software_license(uuid, text)
  to authenticated;
grant execute on function public.can_read_storage_object(text)
  to authenticated;
grant execute on function public.can_manage_storage_object(text)
  to authenticated;
grant execute on function public.can_upload_storage_object(text)
  to authenticated;

grant select, insert, update, delete on public.data_access_scopes
  to authenticated;
grant insert, delete on public.user_roles to authenticated;
grant update (full_name, active, must_enroll_mfa) on public.profiles
  to authenticated;

commit;
