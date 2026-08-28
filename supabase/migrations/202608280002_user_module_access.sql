begin;

create table public.user_module_access (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  module text not null check (module in ('equipment', 'vehicles', 'supplies')),
  created_by uuid references public.profiles(id) on delete set null default auth.uid(),
  created_at timestamptz not null default now(),
  unique (user_id, module)
);

comment on table public.user_module_access is
  'Top-level application modules explicitly granted to each user. Record-level scopes remain in data_access_scopes.';

create or replace function public.permission_system_module(required_permission text)
returns text
language sql
immutable
set search_path = ''
as $$
  select case
    when required_permission like 'vehicles.%'
      or required_permission like 'reports.vehicles.%'
      then 'vehicles'
    when required_permission like 'supplies.%'
      or required_permission like 'reports.supplies.%'
      then 'supplies'
    else 'equipment'
  end;
$$;

insert into public.user_module_access (user_id, module, created_by)
select distinct
  ur.user_id,
  public.permission_system_module(rp.permission_code),
  null::uuid
from public.user_roles ur
join public.role_permissions rp on rp.role_id = ur.role_id
on conflict (user_id, module) do nothing;

create or replace function public.has_system_module(required_module text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select
    public.is_admin()
    or (
      required_module in ('equipment', 'vehicles', 'supplies')
      and exists (
        select 1
        from public.user_module_access uma
        join public.profiles p on p.id = uma.user_id
        where uma.user_id = auth.uid()
          and uma.module = required_module
          and p.active
      )
    );
$$;

create or replace function public.has_permission(required_permission text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select public.is_admin() or exists (
    select 1
    from public.user_roles ur
    join public.role_permissions rp on rp.role_id = ur.role_id
    join public.roles r on r.id = ur.role_id
    join public.profiles p on p.id = ur.user_id
    join public.user_module_access uma
      on uma.user_id = ur.user_id
      and uma.module = public.permission_system_module(required_permission)
    where ur.user_id = auth.uid()
      and rp.permission_code = required_permission
      and p.active
      and (r.code <> 'admin' or auth.jwt() ->> 'aal' = 'aal2')
  );
$$;

create or replace function public.get_my_access()
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'user_id', p.id,
    'email', p.email,
    'full_name', p.full_name,
    'active', p.active,
    'must_enroll_mfa', p.must_enroll_mfa,
    'roles', coalesce(
      (
        select jsonb_agg(distinct r.code)
        from public.user_roles ur
        join public.roles r on r.id = ur.role_id
        where ur.user_id = p.id
      ),
      '[]'::jsonb
    ),
    'modules', case
      when exists (
        select 1
        from public.user_roles ur
        join public.roles r on r.id = ur.role_id
        where ur.user_id = p.id and r.code = 'admin'
      ) then '["equipment", "vehicles", "supplies"]'::jsonb
      else coalesce(
        (
          select jsonb_agg(uma.module order by uma.module)
          from public.user_module_access uma
          where uma.user_id = p.id
        ),
        '[]'::jsonb
      )
    end,
    'permissions', coalesce(
      (
        select jsonb_agg(distinct rp.permission_code)
        from public.user_roles ur
        join public.role_permissions rp on rp.role_id = ur.role_id
        join public.roles r on r.id = ur.role_id
        where ur.user_id = p.id
          and (
            r.code = 'admin'
            or exists (
              select 1
              from public.user_module_access uma
              where uma.user_id = p.id
                and uma.module = public.permission_system_module(rp.permission_code)
            )
          )
      ),
      '[]'::jsonb
    )
  )
  from public.profiles p
  where p.id = auth.uid() and p.active;
$$;

create or replace function public.admin_set_user_access(
  target_user_id uuid,
  target_role_code text,
  target_active boolean,
  target_must_enroll_mfa boolean,
  target_scopes jsonb,
  target_modules jsonb
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  target_role_id uuid;
  normalized_modules jsonb;
begin
  if not public.is_admin() then
    raise exception 'Administrator AAL2 is required';
  end if;
  if jsonb_typeof(target_scopes) <> 'array' then
    raise exception 'Scopes must be a JSON array';
  end if;
  if jsonb_typeof(target_modules) <> 'array' then
    raise exception 'Modules must be a JSON array';
  end if;
  if exists (
    select 1
    from jsonb_array_elements(target_modules) as item(value)
    where jsonb_typeof(item.value) <> 'string'
      or item.value #>> '{}' not in ('equipment', 'vehicles', 'supplies')
  ) then
    raise exception 'Unknown system module';
  end if;
  if target_user_id = auth.uid()
    and (not target_active or target_role_code <> 'admin')
  then
    raise exception 'An administrator cannot remove their own access';
  end if;

  select id into target_role_id
  from public.roles
  where code = target_role_code;
  if target_role_id is null then
    raise exception 'Unknown role';
  end if;

  normalized_modules := case
    when target_role_code = 'admin'
      then '["equipment", "vehicles", "supplies"]'::jsonb
    else target_modules
  end;

  update public.profiles
  set
    active = target_active,
    must_enroll_mfa = target_must_enroll_mfa,
    updated_at = now()
  where id = target_user_id;
  if not found then
    raise exception 'User profile not found';
  end if;

  delete from public.user_roles where user_id = target_user_id;
  insert into public.user_roles (user_id, role_id)
  values (target_user_id, target_role_id);

  delete from public.user_module_access where user_id = target_user_id;
  insert into public.user_module_access (user_id, module, created_by)
  select distinct
    target_user_id,
    item.module,
    auth.uid()
  from jsonb_array_elements_text(normalized_modules) as item(module);

  delete from public.data_access_scopes where user_id = target_user_id;
  insert into public.data_access_scopes (
    user_id,
    module,
    scope_type,
    department_id,
    created_by
  )
  select
    target_user_id,
    item.module,
    item.scope_type,
    item.department_id,
    auth.uid()
  from jsonb_to_recordset(target_scopes) as item(
    module text,
    scope_type text,
    department_id uuid
  );

  insert into public.audit_logs (
    actor_user_id,
    action,
    table_name,
    record_id,
    metadata
  )
  values (
    auth.uid(),
    'ACCESS_UPDATED',
    'profiles',
    target_user_id,
    jsonb_build_object(
      'role', target_role_code,
      'active', target_active,
      'must_enroll_mfa', target_must_enroll_mfa,
      'modules', normalized_modules,
      'scopes', target_scopes
    )
  );
end;
$$;

-- Backward-compatible wrapper for a rolling deployment. It preserves the
-- current module grants when an older application version updates scopes.
create or replace function public.admin_set_user_access(
  target_user_id uuid,
  target_role_code text,
  target_active boolean,
  target_must_enroll_mfa boolean,
  target_scopes jsonb default '[]'::jsonb
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  existing_modules jsonb;
begin
  select coalesce(jsonb_agg(uma.module order by uma.module), '[]'::jsonb)
  into existing_modules
  from public.user_module_access uma
  where uma.user_id = target_user_id;

  perform public.admin_set_user_access(
    target_user_id,
    target_role_code,
    target_active,
    target_must_enroll_mfa,
    target_scopes,
    existing_modules
  );
end;
$$;

alter table public.user_module_access enable row level security;

create policy user_module_access_select on public.user_module_access
  for select to authenticated
  using (user_id = auth.uid() or public.is_admin());

create trigger user_module_access_audit
after insert or update or delete on public.user_module_access
for each row execute function public.write_audit_log();

revoke all on function public.permission_system_module(text) from public;
revoke all on function public.has_system_module(text) from public;
revoke all on function public.admin_set_user_access(
  uuid,
  text,
  boolean,
  boolean,
  jsonb,
  jsonb
) from public;

grant execute on function public.permission_system_module(text) to authenticated;
grant execute on function public.has_system_module(text) to authenticated;
grant execute on function public.admin_set_user_access(
  uuid,
  text,
  boolean,
  boolean,
  jsonb,
  jsonb
) to authenticated;
grant select on public.user_module_access to authenticated;

commit;
