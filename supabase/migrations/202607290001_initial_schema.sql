begin;

create extension if not exists pgcrypto;

create table public.roles (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  name text not null unique,
  created_at timestamptz not null default now()
);

create table public.permissions (
  code text primary key,
  module text not null,
  description text not null,
  created_at timestamptz not null default now()
);

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text not null,
  full_name text not null default '',
  active boolean not null default true,
  must_enroll_mfa boolean not null default false,
  last_login_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index profiles_email_lower_idx on public.profiles (lower(email));

create table public.user_roles (
  user_id uuid not null references public.profiles(id) on delete cascade,
  role_id uuid not null references public.roles(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, role_id)
);

create table public.role_permissions (
  role_id uuid not null references public.roles(id) on delete cascade,
  permission_code text not null references public.permissions(code) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (role_id, permission_code)
);

create table public.departments (
  id uuid primary key default gen_random_uuid(),
  legacy_id text unique,
  name text not null,
  manager_name text not null default '',
  location text not null default '',
  note text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index departments_name_lower_idx on public.departments (lower(name));

create table public.settings (
  id uuid primary key default gen_random_uuid(),
  legacy_id text unique,
  setting_type text not null,
  setting_value text not null,
  display_name text not null,
  sort_order integer not null default 0,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (setting_type, setting_value)
);

create index settings_type_active_idx
  on public.settings (setting_type, active, sort_order);

create table public.assets (
  id uuid primary key default gen_random_uuid(),
  legacy_id text unique,
  asset_code text not null,
  asset_name text not null,
  asset_group text not null default '',
  asset_group_label text not null default '',
  asset_type text not null default '',
  brand text not null default '',
  model text not null default '',
  serial_number text not null default '',
  purchase_year smallint,
  purchase_date date,
  quantity integer not null default 1 check (quantity > 0),
  unit_price numeric(18, 2) not null default 0 check (unit_price >= 0),
  total_price numeric(18, 2) generated always as (quantity * unit_price) stored,
  assigned_to_name text not null default '',
  department_id uuid references public.departments(id) on delete set null,
  department_legacy_name text not null default '',
  location text not null default '',
  software_license_note text not null default '',
  status text not null default 'CON_SU_DUNG',
  quality_level text not null default '',
  warranty_end_date date,
  last_maintenance_date date,
  next_check_date date,
  note text not null default '',
  source_row integer,
  created_by uuid references public.profiles(id) on delete set null default auth.uid(),
  updated_by uuid references public.profiles(id) on delete set null default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  deleted_by uuid references public.profiles(id) on delete set null
);

create unique index assets_code_active_idx
  on public.assets (lower(asset_code))
  where deleted_at is null;
create index assets_status_idx on public.assets (status) where deleted_at is null;
create index assets_group_idx on public.assets (asset_group) where deleted_at is null;
create index assets_department_idx on public.assets (department_id) where deleted_at is null;
create index assets_updated_idx on public.assets (updated_at desc) where deleted_at is null;

create table public.asset_responsibles (
  id uuid primary key default gen_random_uuid(),
  legacy_id text unique,
  asset_id uuid not null references public.assets(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete restrict,
  responsibility_role text not null check (responsibility_role in ('primary', 'secondary')),
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (asset_id, user_id, responsibility_role)
);

create unique index asset_one_primary_idx
  on public.asset_responsibles (asset_id)
  where responsibility_role = 'primary' and active;

create table public.inventory_movements (
  id uuid primary key default gen_random_uuid(),
  legacy_id text unique,
  asset_id uuid not null references public.assets(id) on delete restrict,
  movement_date date not null,
  from_user_id uuid references public.profiles(id) on delete set null,
  to_user_id uuid references public.profiles(id) on delete set null,
  from_user_name text not null default '',
  to_user_name text not null default '',
  from_location text not null default '',
  to_location text not null default '',
  reason text not null default '',
  approved_by_name text not null default '',
  note text not null default '',
  created_by uuid references public.profiles(id) on delete set null default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index inventory_movements_asset_date_idx
  on public.inventory_movements (asset_id, movement_date desc);

create table public.maintenance_plans (
  id uuid primary key default gen_random_uuid(),
  legacy_id text unique,
  asset_id uuid not null references public.assets(id) on delete restrict,
  title text not null,
  frequency text not null check (frequency in ('MONTHLY', 'QUARTERLY', 'YEARLY')),
  next_due_date date not null,
  note text not null default '',
  active boolean not null default true,
  created_by uuid references public.profiles(id) on delete set null default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index maintenance_plans_due_idx
  on public.maintenance_plans (active, next_due_date);

create table public.maintenance_logs (
  id uuid primary key default gen_random_uuid(),
  legacy_id text unique,
  asset_id uuid not null references public.assets(id) on delete restrict,
  plan_id uuid references public.maintenance_plans(id) on delete set null,
  maintenance_date date not null,
  action_type text not null default '',
  description text not null,
  cost numeric(18, 2) not null default 0 check (cost >= 0),
  vendor text not null default '',
  warranty_months integer not null default 0 check (warranty_months >= 0),
  performed_by text not null default '',
  note text not null default '',
  created_by uuid references public.profiles(id) on delete set null default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index maintenance_logs_asset_date_idx
  on public.maintenance_logs (asset_id, maintenance_date desc);

create table public.maintenance_notification_logs (
  id uuid primary key default gen_random_uuid(),
  legacy_id text unique,
  plan_id uuid not null references public.maintenance_plans(id) on delete cascade,
  asset_id uuid not null references public.assets(id) on delete cascade,
  recipient_email text not null,
  notification_type text not null,
  due_date date not null,
  sent_at timestamptz,
  status text not null,
  error text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (plan_id, recipient_email, notification_type, due_date)
);

create table public.software_licenses (
  id uuid primary key default gen_random_uuid(),
  legacy_id text unique,
  software_name text not null,
  version text not null default '',
  license_key_masked text not null default '',
  license_secret_ref text not null default '',
  assigned_asset_id uuid references public.assets(id) on delete set null,
  assigned_user_id uuid references public.profiles(id) on delete set null,
  assigned_user_name text not null default '',
  expiry_date date,
  status text not null default '',
  note text not null default '',
  created_by uuid references public.profiles(id) on delete set null default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index software_licenses_expiry_idx
  on public.software_licenses (expiry_date)
  where expiry_date is not null;

create table public.media_files (
  id uuid primary key default gen_random_uuid(),
  legacy_id text unique,
  owner_type text not null check (owner_type in ('ASSET', 'MAINTENANCE')),
  owner_id uuid not null,
  asset_id uuid not null references public.assets(id) on delete cascade,
  bucket_id text not null default 'asset-media',
  object_path text not null unique,
  file_name text not null,
  mime_type text not null check (mime_type in ('image/jpeg', 'image/png', 'image/webp')),
  byte_size bigint not null default 0 check (byte_size >= 0),
  width integer,
  height integer,
  sort_order integer not null default 0,
  legacy_drive_file_id text,
  created_by uuid references public.profiles(id) on delete set null default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index media_files_owner_idx
  on public.media_files (owner_type, owner_id, sort_order);
create index media_files_asset_idx
  on public.media_files (asset_id, sort_order);

create table public.export_jobs (
  id uuid primary key default gen_random_uuid(),
  export_type text not null,
  filters jsonb not null default '{}'::jsonb,
  status text not null default 'pending'
    check (status in ('pending', 'processing', 'completed', 'failed')),
  result_url text,
  error text,
  requested_by uuid references public.profiles(id) on delete set null default auth.uid(),
  created_at timestamptz not null default now(),
  completed_at timestamptz
);

create table public.audit_logs (
  id bigint generated always as identity primary key,
  actor_user_id uuid references public.profiles(id) on delete set null,
  action text not null,
  table_name text not null,
  record_id uuid,
  old_data jsonb,
  new_data jsonb,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index audit_logs_created_idx on public.audit_logs (created_at desc);
create index audit_logs_actor_idx on public.audit_logs (actor_user_id, created_at desc);
create index audit_logs_record_idx on public.audit_logs (table_name, record_id, created_at desc);

create or replace function public.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = now();
  if to_jsonb(new) ? 'updated_by' then
    new.updated_by = auth.uid();
  end if;
  return new;
end;
$$;

create or replace function public.is_active_user()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.profiles
    where id = auth.uid() and active
  );
$$;

create or replace function public.is_admin()
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
      and r.code = 'admin'
      and p.active
      and auth.jwt() ->> 'aal' = 'aal2'
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
    where ur.user_id = auth.uid()
      and rp.permission_code = required_permission
      and p.active
      and (r.code <> 'admin' or auth.jwt() ->> 'aal' = 'aal2')
  );
$$;

create or replace function public.write_audit_log()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  target_id uuid;
begin
  target_id := coalesce(
    case when tg_op <> 'DELETE' then new.id else null end,
    case when tg_op <> 'INSERT' then old.id else null end
  );

  insert into public.audit_logs (
    actor_user_id,
    action,
    table_name,
    record_id,
    old_data,
    new_data
  )
  values (
    auth.uid(),
    tg_op,
    tg_table_name,
    target_id,
    case when tg_op in ('UPDATE', 'DELETE') then to_jsonb(old) else null end,
    case when tg_op in ('INSERT', 'UPDATE') then to_jsonb(new) else null end
  );

  if tg_op = 'DELETE' then
    return old;
  end if;
  return new;
end;
$$;

create or replace function public.validate_media_owner()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.owner_type = 'ASSET' and new.owner_id <> new.asset_id then
    raise exception 'Asset media owner must match asset_id';
  end if;

  if new.owner_type = 'MAINTENANCE' and not exists (
    select 1
    from public.maintenance_logs ml
    where ml.id = new.owner_id
      and ml.asset_id = new.asset_id
  ) then
    raise exception 'Maintenance media owner is invalid';
  end if;

  return new;
end;
$$;

create or replace function public.handle_new_auth_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  viewer_role_id uuid;
begin
  insert into public.profiles (id, email, full_name)
  values (
    new.id,
    coalesce(new.email, ''),
    coalesce(new.raw_user_meta_data ->> 'full_name', '')
  );

  select id into viewer_role_id
  from public.roles
  where code = 'viewer';

  if viewer_role_id is not null then
    insert into public.user_roles (user_id, role_id)
    values (new.id, viewer_role_id)
    on conflict do nothing;
  end if;

  return new;
end;
$$;

create or replace function public.get_dashboard_stats()
returns jsonb
language sql
stable
security invoker
set search_path = ''
as $$
  select jsonb_build_object(
    'total_assets', count(*),
    'active_assets', count(*) filter (where status = 'CON_SU_DUNG'),
    'needs_attention', count(*) filter (where status in ('CAN_KIEM_TRA', 'KEM_PHAM_CHAT')),
    'stored_assets', count(*) filter (where status in ('LUU_KHO_THANH_LY', 'KHONG_SU_DUNG')),
    'total_value', coalesce(sum(total_price), 0),
    'by_status', coalesce(
      (
        select jsonb_object_agg(status, item_count)
        from (
          select status, count(*) as item_count
          from public.assets
          where deleted_at is null
          group by status
        ) status_counts
      ),
      '{}'::jsonb
    )
  )
  from public.assets
  where deleted_at is null;
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
    'permissions', coalesce(
      (
        select jsonb_agg(distinct rp.permission_code)
        from public.user_roles ur
        join public.role_permissions rp on rp.role_id = ur.role_id
        where ur.user_id = p.id
      ),
      '[]'::jsonb
    )
  )
  from public.profiles p
  where p.id = auth.uid() and p.active;
$$;

create or replace function public.finish_export_job(
  target_job_id uuid,
  target_status text,
  target_result_url text default null,
  target_error text default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if target_status not in ('completed', 'failed') then
    raise exception 'Invalid export status';
  end if;

  update public.export_jobs
  set
    status = target_status,
    result_url = case when target_status = 'completed' then target_result_url else null end,
    error = case when target_status = 'failed' then left(coalesce(target_error, ''), 1000) else null end,
    completed_at = now()
  where id = target_job_id
    and requested_by = auth.uid()
    and status in ('pending', 'processing');

  if not found then
    raise exception 'Export job not found';
  end if;
end;
$$;

insert into public.roles (id, code, name)
values
  ('00000000-0000-4000-8000-000000000001', 'admin', 'Quản trị viên'),
  ('00000000-0000-4000-8000-000000000002', 'manager', 'Quản lý'),
  ('00000000-0000-4000-8000-000000000003', 'user', 'Người dùng'),
  ('00000000-0000-4000-8000-000000000004', 'viewer', 'Chỉ xem')
on conflict (code) do update set name = excluded.name;

insert into public.permissions (code, module, description)
values
  ('overview.view', 'overview', 'Xem dashboard'),
  ('assets.view', 'assets', 'Xem thiết bị'),
  ('assets.manage', 'assets', 'Thêm và sửa thiết bị'),
  ('assets.delete', 'assets', 'Xóa thiết bị'),
  ('maintenance.view', 'maintenance', 'Xem bảo trì'),
  ('maintenance.manage', 'maintenance', 'Thêm và sửa bảo trì'),
  ('maintenance.delete', 'maintenance', 'Xóa bảo trì'),
  ('movement.view', 'movement', 'Xem luân chuyển'),
  ('movement.manage', 'movement', 'Ghi nhận luân chuyển'),
  ('software.view', 'software', 'Xem phần mềm'),
  ('software.manage', 'software', 'Thêm và sửa phần mềm'),
  ('software.delete', 'software', 'Xóa phần mềm'),
  ('reports.view', 'reports', 'Xem báo cáo'),
  ('reports.assets.export', 'reports', 'Xuất báo cáo thiết bị'),
  ('reports.maintenance.export', 'reports', 'Xuất báo cáo bảo trì'),
  ('reports.software.export', 'reports', 'Xuất báo cáo phần mềm'),
  ('reports.movement.export', 'reports', 'Xuất báo cáo luân chuyển'),
  ('settings.view', 'settings', 'Xem danh mục'),
  ('settings.manage', 'settings', 'Quản lý danh mục'),
  ('departments.manage', 'departments', 'Quản lý phòng ban'),
  ('users.manage', 'users', 'Quản lý người dùng'),
  ('audit.view', 'audit', 'Xem audit log'),
  ('backups.manage', 'backups', 'Quản lý backup')
on conflict (code) do update
set module = excluded.module, description = excluded.description;

insert into public.role_permissions (role_id, permission_code)
select r.id, p.code
from public.roles r
cross join public.permissions p
where r.code = 'admin'
on conflict do nothing;

insert into public.role_permissions (role_id, permission_code)
select r.id, p.code
from public.roles r
join public.permissions p on p.code = any (array[
  'overview.view',
  'assets.view', 'assets.manage', 'assets.delete',
  'maintenance.view', 'maintenance.manage',
  'movement.view', 'movement.manage',
  'software.view', 'software.manage',
  'reports.view',
  'reports.assets.export', 'reports.maintenance.export',
  'reports.software.export', 'reports.movement.export',
  'settings.view'
])
where r.code = 'manager'
on conflict do nothing;

insert into public.role_permissions (role_id, permission_code)
select r.id, p.code
from public.roles r
join public.permissions p on p.code = any (array[
  'overview.view', 'assets.view',
  'maintenance.view', 'movement.view',
  'software.view', 'reports.view'
])
where r.code = 'user'
on conflict do nothing;

insert into public.role_permissions (role_id, permission_code)
select r.id, p.code
from public.roles r
join public.permissions p on p.code = any (array[
  'overview.view', 'assets.view',
  'maintenance.view', 'movement.view',
  'software.view', 'reports.view'
])
where r.code = 'viewer'
on conflict do nothing;

insert into public.profiles (id, email, full_name, created_at, updated_at)
select
  u.id,
  coalesce(u.email, ''),
  coalesce(u.raw_user_meta_data ->> 'full_name', ''),
  coalesce(u.created_at, now()),
  now()
from auth.users u
on conflict (id) do nothing;

insert into public.user_roles (user_id, role_id)
select p.id, r.id
from public.profiles p
cross join public.roles r
where r.code = 'viewer'
  and not exists (
    select 1
    from public.user_roles ur
    where ur.user_id = p.id
  )
on conflict do nothing;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_auth_user();

create trigger profiles_set_updated_at before update on public.profiles
  for each row execute procedure public.set_updated_at();
create trigger departments_set_updated_at before update on public.departments
  for each row execute procedure public.set_updated_at();
create trigger settings_set_updated_at before update on public.settings
  for each row execute procedure public.set_updated_at();
create trigger assets_set_updated_at before update on public.assets
  for each row execute procedure public.set_updated_at();
create trigger asset_responsibles_set_updated_at before update on public.asset_responsibles
  for each row execute procedure public.set_updated_at();
create trigger inventory_movements_set_updated_at before update on public.inventory_movements
  for each row execute procedure public.set_updated_at();
create trigger maintenance_plans_set_updated_at before update on public.maintenance_plans
  for each row execute procedure public.set_updated_at();
create trigger maintenance_logs_set_updated_at before update on public.maintenance_logs
  for each row execute procedure public.set_updated_at();
create trigger maintenance_notification_logs_set_updated_at before update on public.maintenance_notification_logs
  for each row execute procedure public.set_updated_at();
create trigger software_licenses_set_updated_at before update on public.software_licenses
  for each row execute procedure public.set_updated_at();
create trigger media_files_set_updated_at before update on public.media_files
  for each row execute procedure public.set_updated_at();
create trigger media_files_validate_owner before insert or update on public.media_files
  for each row execute procedure public.validate_media_owner();

create trigger assets_audit after insert or update or delete on public.assets
  for each row execute procedure public.write_audit_log();
create trigger departments_audit after insert or update or delete on public.departments
  for each row execute procedure public.write_audit_log();
create trigger settings_audit after insert or update or delete on public.settings
  for each row execute procedure public.write_audit_log();
create trigger asset_responsibles_audit after insert or update or delete on public.asset_responsibles
  for each row execute procedure public.write_audit_log();
create trigger inventory_movements_audit after insert or update or delete on public.inventory_movements
  for each row execute procedure public.write_audit_log();
create trigger maintenance_plans_audit after insert or update or delete on public.maintenance_plans
  for each row execute procedure public.write_audit_log();
create trigger maintenance_logs_audit after insert or update or delete on public.maintenance_logs
  for each row execute procedure public.write_audit_log();
create trigger software_licenses_audit after insert or update or delete on public.software_licenses
  for each row execute procedure public.write_audit_log();
create trigger media_files_audit after insert or update or delete on public.media_files
  for each row execute procedure public.write_audit_log();

alter table public.roles enable row level security;
alter table public.permissions enable row level security;
alter table public.profiles enable row level security;
alter table public.user_roles enable row level security;
alter table public.role_permissions enable row level security;
alter table public.departments enable row level security;
alter table public.settings enable row level security;
alter table public.assets enable row level security;
alter table public.asset_responsibles enable row level security;
alter table public.inventory_movements enable row level security;
alter table public.maintenance_plans enable row level security;
alter table public.maintenance_logs enable row level security;
alter table public.maintenance_notification_logs enable row level security;
alter table public.software_licenses enable row level security;
alter table public.media_files enable row level security;
alter table public.export_jobs enable row level security;
alter table public.audit_logs enable row level security;

create policy roles_select on public.roles
  for select to authenticated using (public.is_active_user());
create policy permissions_select on public.permissions
  for select to authenticated using (public.is_active_user());
create policy role_permissions_select on public.role_permissions
  for select to authenticated using (public.is_active_user());
create policy user_roles_select on public.user_roles
  for select to authenticated
  using (user_id = auth.uid() or public.is_admin());

create policy profiles_select on public.profiles
  for select to authenticated
  using (id = auth.uid() or public.is_admin());
create policy profiles_update_own on public.profiles
  for update to authenticated
  using (id = auth.uid() and active)
  with check (id = auth.uid() and active);

create policy departments_select on public.departments
  for select to authenticated using (public.is_active_user());
create policy departments_insert on public.departments
  for insert to authenticated with check (public.has_permission('departments.manage'));
create policy departments_update on public.departments
  for update to authenticated
  using (public.has_permission('departments.manage'))
  with check (public.has_permission('departments.manage'));
create policy departments_delete on public.departments
  for delete to authenticated using (public.has_permission('departments.manage'));

create policy settings_select on public.settings
  for select to authenticated using (public.is_active_user());
create policy settings_insert on public.settings
  for insert to authenticated with check (public.has_permission('settings.manage'));
create policy settings_update on public.settings
  for update to authenticated
  using (public.has_permission('settings.manage'))
  with check (public.has_permission('settings.manage'));
create policy settings_delete on public.settings
  for delete to authenticated using (public.has_permission('settings.manage'));

create policy assets_select on public.assets
  for select to authenticated
  using (deleted_at is null and public.has_permission('assets.view'));
create policy assets_insert on public.assets
  for insert to authenticated
  with check (public.has_permission('assets.manage'));
create policy assets_update on public.assets
  for update to authenticated
  using (deleted_at is null and public.has_permission('assets.manage'))
  with check (
    public.has_permission('assets.manage')
    and (
      deleted_at is null
      or public.has_permission('assets.delete')
    )
  );
create policy asset_responsibles_select on public.asset_responsibles
  for select to authenticated using (public.has_permission('assets.view'));
create policy asset_responsibles_insert on public.asset_responsibles
  for insert to authenticated with check (public.has_permission('assets.manage'));
create policy asset_responsibles_update on public.asset_responsibles
  for update to authenticated
  using (public.has_permission('assets.manage'))
  with check (public.has_permission('assets.manage'));
create policy asset_responsibles_delete on public.asset_responsibles
  for delete to authenticated using (public.has_permission('assets.manage'));

create policy inventory_movements_select on public.inventory_movements
  for select to authenticated using (public.has_permission('movement.view'));
create policy inventory_movements_insert on public.inventory_movements
  for insert to authenticated with check (public.has_permission('movement.manage'));
create policy inventory_movements_update on public.inventory_movements
  for update to authenticated
  using (public.has_permission('movement.manage'))
  with check (public.has_permission('movement.manage'));

create policy maintenance_plans_select on public.maintenance_plans
  for select to authenticated using (public.has_permission('maintenance.view'));
create policy maintenance_plans_insert on public.maintenance_plans
  for insert to authenticated with check (public.has_permission('maintenance.manage'));
create policy maintenance_plans_update on public.maintenance_plans
  for update to authenticated
  using (public.has_permission('maintenance.manage'))
  with check (public.has_permission('maintenance.manage'));
create policy maintenance_plans_delete on public.maintenance_plans
  for delete to authenticated using (public.has_permission('maintenance.delete'));

create policy maintenance_logs_select on public.maintenance_logs
  for select to authenticated using (public.has_permission('maintenance.view'));
create policy maintenance_logs_insert on public.maintenance_logs
  for insert to authenticated with check (public.has_permission('maintenance.manage'));
create policy maintenance_logs_update on public.maintenance_logs
  for update to authenticated
  using (public.has_permission('maintenance.manage'))
  with check (public.has_permission('maintenance.manage'));
create policy maintenance_logs_delete on public.maintenance_logs
  for delete to authenticated using (public.has_permission('maintenance.delete'));

create policy maintenance_notifications_select on public.maintenance_notification_logs
  for select to authenticated using (public.has_permission('maintenance.view'));

create policy software_licenses_select on public.software_licenses
  for select to authenticated using (public.has_permission('software.view'));
create policy software_licenses_insert on public.software_licenses
  for insert to authenticated with check (public.has_permission('software.manage'));
create policy software_licenses_update on public.software_licenses
  for update to authenticated
  using (public.has_permission('software.manage'))
  with check (public.has_permission('software.manage'));
create policy software_licenses_delete on public.software_licenses
  for delete to authenticated using (public.has_permission('software.delete'));

create policy media_files_select on public.media_files
  for select to authenticated
  using (
    (owner_type = 'ASSET' and public.has_permission('assets.view'))
    or (owner_type = 'MAINTENANCE' and public.has_permission('maintenance.view'))
  );
create policy media_files_insert on public.media_files
  for insert to authenticated
  with check (
    (owner_type = 'ASSET' and public.has_permission('assets.manage'))
    or (owner_type = 'MAINTENANCE' and public.has_permission('maintenance.manage'))
  );
create policy media_files_update on public.media_files
  for update to authenticated
  using (
    (owner_type = 'ASSET' and public.has_permission('assets.manage'))
    or (owner_type = 'MAINTENANCE' and public.has_permission('maintenance.manage'))
  )
  with check (
    (owner_type = 'ASSET' and public.has_permission('assets.manage'))
    or (owner_type = 'MAINTENANCE' and public.has_permission('maintenance.manage'))
  );
create policy media_files_delete on public.media_files
  for delete to authenticated
  using (
    (owner_type = 'ASSET' and public.has_permission('assets.manage'))
    or (owner_type = 'MAINTENANCE' and public.has_permission('maintenance.manage'))
  );

create policy export_jobs_select on public.export_jobs
  for select to authenticated
  using (requested_by = auth.uid() or public.is_admin());
create policy export_jobs_insert on public.export_jobs
  for insert to authenticated
  with check (public.has_permission('reports.view') and requested_by = auth.uid());

create policy audit_logs_select on public.audit_logs
  for select to authenticated using (public.has_permission('audit.view'));

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'asset-media',
  'asset-media',
  false,
  5242880,
  array['image/jpeg', 'image/png', 'image/webp']
)
on conflict (id) do update set
  public = false,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

create policy asset_media_select on storage.objects
  for select to authenticated
  using (
    bucket_id = 'asset-media'
    and (
      public.has_permission('assets.view')
      or public.has_permission('maintenance.view')
    )
  );

create policy asset_media_insert on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'asset-media'
    and (storage.foldername(name))[1] = auth.uid()::text
    and (
      public.has_permission('assets.manage')
      or public.has_permission('maintenance.manage')
    )
  );

create policy asset_media_update on storage.objects
  for update to authenticated
  using (
    bucket_id = 'asset-media'
    and (
      public.has_permission('assets.manage')
      or public.has_permission('maintenance.manage')
    )
  )
  with check (
    bucket_id = 'asset-media'
    and (
      public.has_permission('assets.manage')
      or public.has_permission('maintenance.manage')
    )
  );

create policy asset_media_delete on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'asset-media'
    and (
      public.has_permission('assets.manage')
      or public.has_permission('maintenance.manage')
    )
  );

revoke all on function public.is_active_user() from public;
revoke all on function public.is_admin() from public;
revoke all on function public.has_permission(text) from public;
revoke all on function public.get_dashboard_stats() from public;
revoke all on function public.get_my_access() from public;
revoke all on function public.finish_export_job(uuid, text, text, text) from public;
grant execute on function public.is_active_user() to authenticated;
grant execute on function public.is_admin() to authenticated;
grant execute on function public.has_permission(text) to authenticated;
grant execute on function public.get_dashboard_stats() to authenticated;
grant execute on function public.get_my_access() to authenticated;
grant execute on function public.finish_export_job(uuid, text, text, text) to authenticated;

grant usage on schema public to authenticated;
grant select on public.roles, public.permissions, public.role_permissions to authenticated;
grant select on public.user_roles to authenticated;
grant select on public.profiles to authenticated;
grant update (full_name) on public.profiles to authenticated;
grant select, insert, update, delete on
  public.departments,
  public.settings,
  public.assets,
  public.asset_responsibles,
  public.inventory_movements,
  public.maintenance_plans,
  public.maintenance_logs,
  public.software_licenses,
  public.media_files
to authenticated;
grant select on public.maintenance_notification_logs, public.audit_logs to authenticated;
grant select, insert on public.export_jobs to authenticated;

commit;
