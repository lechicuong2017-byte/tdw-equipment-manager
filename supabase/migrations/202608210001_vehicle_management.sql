begin;

alter table public.data_access_scopes
  drop constraint if exists data_access_scopes_module_check;
alter table public.data_access_scopes
  add constraint data_access_scopes_module_check
  check (module in ('assets', 'maintenance', 'movement', 'software', 'vehicles'));

insert into public.permissions (code, module, description)
values
  ('vehicles.view', 'vehicles', 'Xem quản lý xe'),
  ('vehicles.manage', 'vehicles', 'Thêm và sửa dữ liệu xe'),
  ('vehicles.delete', 'vehicles', 'Xóa dữ liệu xe'),
  ('vehicles.import', 'vehicles', 'Nhập lịch sử xe từ XLSX'),
  ('reports.vehicles.export', 'reports', 'Xuất báo cáo quản lý xe')
on conflict (code) do update
set module = excluded.module, description = excluded.description;

insert into public.role_permissions (role_id, permission_code)
select r.id, p.code
from public.roles r
join public.permissions p on p.code = any (array[
  'vehicles.view', 'vehicles.manage', 'vehicles.delete', 'vehicles.import',
  'reports.vehicles.export'
])
where r.code = 'admin'
on conflict do nothing;

insert into public.role_permissions (role_id, permission_code)
select r.id, p.code
from public.roles r
join public.permissions p on p.code = any (array[
  'vehicles.view', 'vehicles.manage', 'vehicles.import',
  'reports.vehicles.export'
])
where r.code = 'manager'
on conflict do nothing;

insert into public.role_permissions (role_id, permission_code)
select r.id, p.code
from public.roles r
join public.permissions p on p.code = 'vehicles.view'
where r.code in ('user', 'viewer')
on conflict do nothing;

create table public.vehicles (
  id uuid primary key default gen_random_uuid(),
  vehicle_code text not null,
  vehicle_name text not null,
  license_plate text not null,
  brand text not null default '',
  model text not null default '',
  production_year smallint,
  chassis_number text not null default '',
  engine_number text not null default '',
  fuel_norm_l_per_100km numeric(8, 2),
  assigned_driver text not null default '',
  responsible_user_id uuid references public.profiles(id) on delete set null,
  department_id uuid references public.departments(id) on delete set null,
  status text not null default 'ACTIVE'
    check (status in ('ACTIVE', 'MAINTENANCE', 'INACTIVE', 'LIQUIDATED')),
  note text not null default '',
  created_by uuid references public.profiles(id) on delete set null default auth.uid(),
  updated_by uuid references public.profiles(id) on delete set null default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

create unique index vehicles_code_active_idx
  on public.vehicles (lower(vehicle_code)) where deleted_at is null;
create unique index vehicles_plate_active_idx
  on public.vehicles (regexp_replace(upper(license_plate), '[^A-Z0-9]', '', 'g'))
  where deleted_at is null;
create index vehicles_department_idx
  on public.vehicles (department_id) where deleted_at is null;
create index vehicles_updated_idx
  on public.vehicles (updated_at desc) where deleted_at is null;

create table public.vehicle_inspections (
  id uuid primary key default gen_random_uuid(),
  vehicle_id uuid not null references public.vehicles(id) on delete cascade,
  inspection_date date not null,
  expires_on date not null,
  cost numeric(18, 2) not null default 0 check (cost >= 0),
  reminder_days integer not null default 30 check (reminder_days between 1 and 180),
  certificate_number text not null default '',
  inspection_center text not null default '',
  odometer_km integer check (odometer_km is null or odometer_km >= 0),
  note text not null default '',
  created_by uuid references public.profiles(id) on delete set null default auth.uid(),
  updated_by uuid references public.profiles(id) on delete set null default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (expires_on >= inspection_date)
);

create index vehicle_inspections_due_idx
  on public.vehicle_inspections (expires_on, vehicle_id);

create table public.vehicle_repairs (
  id uuid primary key default gen_random_uuid(),
  vehicle_id uuid not null references public.vehicles(id) on delete cascade,
  service_date date not null,
  service_type text not null default 'BAO_DUONG',
  description text not null,
  odometer_km integer check (odometer_km is null or odometer_km >= 0),
  vat_amount numeric(18, 2) not null default 0 check (vat_amount >= 0),
  vendor text not null default '',
  invoice_number text not null default '',
  note text not null default '',
  source_file text not null default '',
  source_sheet text not null default '',
  source_row integer,
  import_fingerprint text,
  created_by uuid references public.profiles(id) on delete set null default auth.uid(),
  updated_by uuid references public.profiles(id) on delete set null default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index vehicle_repairs_import_fingerprint_idx
  on public.vehicle_repairs (import_fingerprint);
create index vehicle_repairs_vehicle_date_idx
  on public.vehicle_repairs (vehicle_id, service_date desc);

create table public.vehicle_fuel_logs (
  id uuid primary key default gen_random_uuid(),
  vehicle_id uuid not null references public.vehicles(id) on delete cascade,
  payment_date date not null,
  liters numeric(12, 3) not null check (liters > 0),
  odometer_from integer check (odometer_from is null or odometer_from >= 0),
  odometer_to integer check (odometer_to is null or odometer_to >= 0),
  amount numeric(18, 2) not null default 0 check (amount >= 0),
  purchaser text not null default '',
  note text not null default '',
  source_file text not null default '',
  source_sheet text not null default '',
  source_row integer,
  import_fingerprint text,
  created_by uuid references public.profiles(id) on delete set null default auth.uid(),
  updated_by uuid references public.profiles(id) on delete set null default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (odometer_from is null or odometer_to is null or odometer_to >= odometer_from)
);

create unique index vehicle_fuel_import_fingerprint_idx
  on public.vehicle_fuel_logs (import_fingerprint);
create index vehicle_fuel_vehicle_date_idx
  on public.vehicle_fuel_logs (vehicle_id, payment_date desc);

create table public.vehicle_inspection_notification_logs (
  id uuid primary key default gen_random_uuid(),
  inspection_id uuid not null references public.vehicle_inspections(id) on delete cascade,
  vehicle_id uuid not null references public.vehicles(id) on delete cascade,
  recipient_email text not null,
  notification_type text not null,
  due_date date not null,
  sent_at timestamptz,
  status text not null check (status in ('PROCESSING', 'SENT', 'FAILED', 'UNKNOWN')),
  error text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (inspection_id, recipient_email, notification_type, due_date)
);

create or replace function public.vehicle_scope_matches(target_vehicle_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select
    public.is_admin()
    or public.has_role_code('manager')
    or exists (
      select 1
      from public.vehicles v
      where v.id = target_vehicle_id
        and v.deleted_at is null
        and (
          v.responsible_user_id = auth.uid()
          or exists (
            select 1
            from public.data_access_scopes das
            where das.user_id = auth.uid()
              and das.module = 'vehicles'
              and (
                das.scope_type = 'all'
                or (das.scope_type = 'department' and das.department_id = v.department_id)
                or (das.scope_type = 'assigned' and v.responsible_user_id = auth.uid())
                or (das.scope_type = 'owned' and v.created_by = auth.uid())
              )
          )
        )
    );
$$;

create or replace function public.can_access_vehicle(
  target_vehicle_id uuid,
  required_permission text
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select public.has_permission(required_permission)
    and public.vehicle_scope_matches(target_vehicle_id);
$$;

create or replace function public.claim_vehicle_inspection_notifications(
  target_candidates jsonb
)
returns table (
  notification_id uuid,
  inspection_id uuid,
  vehicle_id uuid,
  recipient_email text,
  notification_type text,
  due_date date
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  candidate record;
  claimed_id uuid;
  normalized_email text;
begin
  if jsonb_typeof(target_candidates) <> 'array'
    or jsonb_array_length(target_candidates) > 500
  then
    raise exception 'Candidates must be an array of at most 500 items';
  end if;

  for candidate in
    select * from jsonb_to_recordset(target_candidates) as item(
      inspection_id uuid,
      vehicle_id uuid,
      recipient_email text,
      notification_type text,
      due_date date
    )
  loop
    claimed_id := null;
    normalized_email := lower(trim(coalesce(candidate.recipient_email, '')));
    if normalized_email !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$'
      or coalesce(candidate.notification_type, '') !~ '^(DUE_(30|7|0)|OVERDUE_[0-9]+)$'
    then
      continue;
    end if;

    if not exists (
      select 1
      from public.vehicle_inspections vi
      join public.vehicles v on v.id = vi.vehicle_id
      where vi.id = candidate.inspection_id
        and vi.vehicle_id = candidate.vehicle_id
        and vi.expires_on = candidate.due_date
        and v.deleted_at is null
    ) then
      continue;
    end if;

    insert into public.vehicle_inspection_notification_logs (
      inspection_id, vehicle_id, recipient_email, notification_type,
      due_date, status
    ) values (
      candidate.inspection_id, candidate.vehicle_id, normalized_email,
      candidate.notification_type, candidate.due_date, 'PROCESSING'
    )
    on conflict (inspection_id, recipient_email, notification_type, due_date)
    do nothing
    returning id into claimed_id;

    if claimed_id is null then
      update public.vehicle_inspection_notification_logs nl
      set status = 'PROCESSING', error = '', sent_at = null
      where nl.inspection_id = candidate.inspection_id
        and nl.recipient_email = normalized_email
        and nl.notification_type = candidate.notification_type
        and nl.due_date = candidate.due_date
        and nl.status = 'FAILED'
      returning nl.id into claimed_id;
    end if;

    if claimed_id is not null then
      notification_id := claimed_id;
      inspection_id := candidate.inspection_id;
      vehicle_id := candidate.vehicle_id;
      recipient_email := normalized_email;
      notification_type := candidate.notification_type;
      due_date := candidate.due_date;
      return next;
    end if;
  end loop;
end;
$$;

create or replace function public.finish_vehicle_inspection_notifications(
  target_results jsonb
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  result_item record;
  normalized_status text;
begin
  if jsonb_typeof(target_results) <> 'array'
    or jsonb_array_length(target_results) > 500
  then
    raise exception 'Results must be an array of at most 500 items';
  end if;

  for result_item in
    select * from jsonb_to_recordset(target_results) as item(
      notification_id uuid,
      status text,
      error text
    )
  loop
    normalized_status := upper(trim(coalesce(result_item.status, '')));
    if normalized_status in ('SENT', 'FAILED', 'UNKNOWN') then
      update public.vehicle_inspection_notification_logs
      set status = normalized_status,
          sent_at = case when normalized_status = 'SENT' then now() else null end,
          error = left(coalesce(result_item.error, ''), 500)
      where id = result_item.notification_id and status = 'PROCESSING';
    end if;
  end loop;
end;
$$;

create trigger vehicles_set_updated_at before update on public.vehicles
  for each row execute procedure public.set_updated_at();
create trigger vehicle_inspections_set_updated_at before update on public.vehicle_inspections
  for each row execute procedure public.set_updated_at();
create trigger vehicle_repairs_set_updated_at before update on public.vehicle_repairs
  for each row execute procedure public.set_updated_at();
create trigger vehicle_fuel_logs_set_updated_at before update on public.vehicle_fuel_logs
  for each row execute procedure public.set_updated_at();
create trigger vehicle_inspection_notifications_set_updated_at before update on public.vehicle_inspection_notification_logs
  for each row execute procedure public.set_updated_at();

create trigger vehicles_audit after insert or update or delete on public.vehicles
  for each row execute procedure public.write_audit_log();
create trigger vehicle_inspections_audit after insert or update or delete on public.vehicle_inspections
  for each row execute procedure public.write_audit_log();
create trigger vehicle_repairs_audit after insert or update or delete on public.vehicle_repairs
  for each row execute procedure public.write_audit_log();
create trigger vehicle_fuel_logs_audit after insert or update or delete on public.vehicle_fuel_logs
  for each row execute procedure public.write_audit_log();

alter table public.vehicles enable row level security;
alter table public.vehicle_inspections enable row level security;
alter table public.vehicle_repairs enable row level security;
alter table public.vehicle_fuel_logs enable row level security;
alter table public.vehicle_inspection_notification_logs enable row level security;

create policy vehicles_select on public.vehicles
  for select to authenticated
  using (deleted_at is null and public.can_access_vehicle(id, 'vehicles.view'));
create policy vehicles_insert on public.vehicles
  for insert to authenticated
  with check (
    public.has_permission('vehicles.manage')
    and (
      public.is_admin() or public.has_role_code('manager')
      or exists (
        select 1 from public.data_access_scopes das
        where das.user_id = auth.uid() and das.module = 'vehicles'
          and (
            das.scope_type = 'all'
            or (das.scope_type = 'department' and das.department_id = department_id)
          )
      )
    )
  );
create policy vehicles_update on public.vehicles
  for update to authenticated
  using (deleted_at is null and public.can_access_vehicle(id, 'vehicles.manage'))
  with check (public.can_access_vehicle(id, 'vehicles.manage'));

create policy vehicle_inspections_select on public.vehicle_inspections
  for select to authenticated
  using (public.can_access_vehicle(vehicle_id, 'vehicles.view'));
create policy vehicle_inspections_insert on public.vehicle_inspections
  for insert to authenticated
  with check (public.can_access_vehicle(vehicle_id, 'vehicles.manage'));
create policy vehicle_inspections_update on public.vehicle_inspections
  for update to authenticated
  using (public.can_access_vehicle(vehicle_id, 'vehicles.manage'))
  with check (public.can_access_vehicle(vehicle_id, 'vehicles.manage'));
create policy vehicle_inspections_delete on public.vehicle_inspections
  for delete to authenticated
  using (public.can_access_vehicle(vehicle_id, 'vehicles.delete'));

create policy vehicle_repairs_select on public.vehicle_repairs
  for select to authenticated using (public.can_access_vehicle(vehicle_id, 'vehicles.view'));
create policy vehicle_repairs_insert on public.vehicle_repairs
  for insert to authenticated with check (public.can_access_vehicle(vehicle_id, 'vehicles.manage'));
create policy vehicle_repairs_update on public.vehicle_repairs
  for update to authenticated
  using (public.can_access_vehicle(vehicle_id, 'vehicles.manage'))
  with check (public.can_access_vehicle(vehicle_id, 'vehicles.manage'));
create policy vehicle_repairs_delete on public.vehicle_repairs
  for delete to authenticated using (public.can_access_vehicle(vehicle_id, 'vehicles.delete'));

create policy vehicle_fuel_logs_select on public.vehicle_fuel_logs
  for select to authenticated using (public.can_access_vehicle(vehicle_id, 'vehicles.view'));
create policy vehicle_fuel_logs_insert on public.vehicle_fuel_logs
  for insert to authenticated with check (public.can_access_vehicle(vehicle_id, 'vehicles.manage'));
create policy vehicle_fuel_logs_update on public.vehicle_fuel_logs
  for update to authenticated
  using (public.can_access_vehicle(vehicle_id, 'vehicles.manage'))
  with check (public.can_access_vehicle(vehicle_id, 'vehicles.manage'));
create policy vehicle_fuel_logs_delete on public.vehicle_fuel_logs
  for delete to authenticated using (public.can_access_vehicle(vehicle_id, 'vehicles.delete'));

create policy vehicle_inspection_notifications_select
  on public.vehicle_inspection_notification_logs
  for select to authenticated
  using (public.can_access_vehicle(vehicle_id, 'vehicles.view'));

revoke all on function public.vehicle_scope_matches(uuid) from public, anon;
revoke all on function public.can_access_vehicle(uuid, text) from public, anon;
grant execute on function public.vehicle_scope_matches(uuid) to authenticated;
grant execute on function public.can_access_vehicle(uuid, text) to authenticated;
revoke all on function public.claim_vehicle_inspection_notifications(jsonb)
  from public, anon, authenticated;
revoke all on function public.finish_vehicle_inspection_notifications(jsonb)
  from public, anon, authenticated;
grant execute on function public.claim_vehicle_inspection_notifications(jsonb) to service_role;
grant execute on function public.finish_vehicle_inspection_notifications(jsonb) to service_role;

grant select, insert, update on public.vehicles to authenticated;
grant select, insert, update, delete on public.vehicle_inspections to authenticated;
grant select, insert, update, delete on public.vehicle_repairs to authenticated;
grant select, insert, update, delete on public.vehicle_fuel_logs to authenticated;
grant select on public.vehicle_inspection_notification_logs to authenticated;
grant all on public.vehicle_inspection_notification_logs to service_role;

commit;
