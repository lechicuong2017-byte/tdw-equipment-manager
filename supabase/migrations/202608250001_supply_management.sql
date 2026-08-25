begin;

alter table public.data_access_scopes
  drop constraint if exists data_access_scopes_module_check;
alter table public.data_access_scopes
  add constraint data_access_scopes_module_check
  check (module in ('assets', 'maintenance', 'movement', 'software', 'vehicles', 'supplies'));

insert into public.permissions (code, module, description)
values
  ('supplies.view', 'supplies', 'Xem văn phòng phẩm và dụng cụ vệ sinh'),
  ('supplies.manage', 'supplies', 'Thêm và sửa danh mục, phiếu yêu cầu'),
  ('supplies.delete', 'supplies', 'Xóa dữ liệu mua sắm'),
  ('supplies.import', 'supplies', 'Nhập phiếu yêu cầu từ XLSX'),
  ('reports.supplies.export', 'reports', 'Xuất báo cáo mua sắm hành chính')
on conflict (code) do update
set module = excluded.module, description = excluded.description;

insert into public.role_permissions (role_id, permission_code)
select r.id, p.code from public.roles r
join public.permissions p on p.code = any (array[
  'supplies.view', 'supplies.manage', 'supplies.delete', 'supplies.import',
  'reports.supplies.export'
]) where r.code = 'admin'
on conflict do nothing;

insert into public.role_permissions (role_id, permission_code)
select r.id, p.code from public.roles r
join public.permissions p on p.code = any (array[
  'supplies.view', 'supplies.manage', 'supplies.import', 'reports.supplies.export'
]) where r.code = 'manager'
on conflict do nothing;

insert into public.role_permissions (role_id, permission_code)
select r.id, p.code from public.roles r
join public.permissions p on p.code = 'supplies.view'
where r.code in ('user', 'viewer')
on conflict do nothing;

create table public.supply_items (
  id uuid primary key default gen_random_uuid(),
  category text not null check (category in ('OFFICE_SUPPLY', 'CLEANING_SUPPLY')),
  item_code text not null default '',
  item_name text not null,
  unit text not null,
  description text not null default '',
  default_unit_price numeric(18, 2) not null default 0 check (default_unit_price >= 0),
  active boolean not null default true,
  created_by uuid references public.profiles(id) on delete set null default auth.uid(),
  updated_by uuid references public.profiles(id) on delete set null default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

create unique index supply_items_name_category_active_idx
  on public.supply_items (category, lower(regexp_replace(trim(item_name), '\s+', ' ', 'g')))
  where deleted_at is null;
create index supply_items_category_idx on public.supply_items (category, active, item_name)
  where deleted_at is null;

create table public.supply_requests (
  id uuid primary key default gen_random_uuid(),
  request_no text not null,
  category text not null check (category in ('OFFICE_SUPPLY', 'CLEANING_SUPPLY')),
  period_type text not null default 'QUARTER' check (period_type in ('MONTH', 'QUARTER', 'YEAR')),
  period_year smallint not null check (period_year between 2000 and 2200),
  period_month smallint check (period_month is null or period_month between 1 and 12),
  period_quarter smallint check (period_quarter is null or period_quarter between 1 and 4),
  requested_on date not null default current_date,
  required_on date,
  department_id uuid references public.departments(id) on delete set null,
  requesting_department text not null default '',
  requester_name text not null default '',
  checker_name text not null default '',
  approver_name text not null default '',
  status text not null default 'DRAFT'
    check (status in ('DRAFT', 'SUBMITTED', 'APPROVED', 'ORDERED', 'CLOSED', 'REJECTED')),
  note text not null default '',
  source_file text not null default '',
  source_sheet text not null default '',
  import_fingerprint text,
  created_by uuid references public.profiles(id) on delete set null default auth.uid(),
  updated_by uuid references public.profiles(id) on delete set null default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  check (
    (period_type = 'MONTH' and period_month is not null and period_quarter is null)
    or (period_type = 'QUARTER' and period_quarter is not null and period_month is null)
    or (period_type = 'YEAR' and period_month is null and period_quarter is null)
  )
);

create unique index supply_requests_fingerprint_idx on public.supply_requests (import_fingerprint)
  where import_fingerprint is not null and deleted_at is null;
create index supply_requests_period_idx
  on public.supply_requests (period_year desc, period_quarter, period_month, category)
  where deleted_at is null;
create index supply_requests_department_idx on public.supply_requests (department_id)
  where deleted_at is null;

create table public.supply_request_lines (
  id uuid primary key default gen_random_uuid(),
  request_id uuid not null references public.supply_requests(id) on delete cascade,
  item_id uuid references public.supply_items(id) on delete set null,
  item_name text not null,
  unit text not null,
  proposed_quantity numeric(14, 3) not null default 0 check (proposed_quantity >= 0),
  stock_quantity numeric(14, 3) not null default 0 check (stock_quantity >= 0),
  ordered_quantity numeric(14, 3) not null default 0 check (ordered_quantity >= 0),
  requested_departments text not null default '',
  approval_note text not null default '',
  proposed_unit_price numeric(18, 2) check (proposed_unit_price is null or proposed_unit_price >= 0),
  approved_unit_price numeric(18, 2) not null default 0 check (approved_unit_price >= 0),
  amount numeric(18, 2) generated always as (ordered_quantity * approved_unit_price) stored,
  note text not null default '',
  sort_order integer not null default 0,
  created_by uuid references public.profiles(id) on delete set null default auth.uid(),
  updated_by uuid references public.profiles(id) on delete set null default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index supply_request_lines_request_idx on public.supply_request_lines (request_id, sort_order);
create index supply_request_lines_item_idx on public.supply_request_lines (item_id);

create or replace function public.supply_request_scope_matches(target_request_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select
    public.is_admin()
    or public.has_role_code('manager')
    or not exists (
      select 1 from public.data_access_scopes das
      where das.user_id = auth.uid() and das.module = 'supplies'
    )
    or exists (
      select 1
      from public.data_access_scopes das
      join public.supply_requests sr on sr.id = target_request_id
      where das.user_id = auth.uid() and das.module = 'supplies'
        and (
          das.scope_type = 'all'
          or (das.scope_type = 'department' and das.department_id = sr.department_id)
          or (das.scope_type = 'owned' and sr.created_by = auth.uid())
        )
    );
$$;

create trigger supply_items_set_updated_at before update on public.supply_items
  for each row execute procedure public.set_updated_at();
create trigger supply_requests_set_updated_at before update on public.supply_requests
  for each row execute procedure public.set_updated_at();
create trigger supply_request_lines_set_updated_at before update on public.supply_request_lines
  for each row execute procedure public.set_updated_at();

create trigger supply_items_audit after insert or update or delete on public.supply_items
  for each row execute procedure public.write_audit_log();
create trigger supply_requests_audit after insert or update or delete on public.supply_requests
  for each row execute procedure public.write_audit_log();
create trigger supply_request_lines_audit after insert or update or delete on public.supply_request_lines
  for each row execute procedure public.write_audit_log();

alter table public.supply_items enable row level security;
alter table public.supply_requests enable row level security;
alter table public.supply_request_lines enable row level security;

create policy supply_items_select on public.supply_items for select to authenticated
  using (deleted_at is null and public.has_permission('supplies.view'));
create policy supply_items_insert on public.supply_items for insert to authenticated
  with check (public.has_permission('supplies.manage'));
create policy supply_items_update on public.supply_items for update to authenticated
  using (deleted_at is null and public.has_permission('supplies.manage'))
  with check (public.has_permission('supplies.manage'));

create policy supply_requests_select on public.supply_requests for select to authenticated
  using (deleted_at is null and public.has_permission('supplies.view') and public.supply_request_scope_matches(id));
create policy supply_requests_insert on public.supply_requests for insert to authenticated
  with check (public.has_permission('supplies.manage'));
create policy supply_requests_update on public.supply_requests for update to authenticated
  using (deleted_at is null and public.has_permission('supplies.manage') and public.supply_request_scope_matches(id))
  with check (public.has_permission('supplies.manage') and public.supply_request_scope_matches(id));

create policy supply_request_lines_select on public.supply_request_lines for select to authenticated
  using (public.has_permission('supplies.view') and public.supply_request_scope_matches(request_id));
create policy supply_request_lines_insert on public.supply_request_lines for insert to authenticated
  with check (public.has_permission('supplies.manage') and public.supply_request_scope_matches(request_id));
create policy supply_request_lines_update on public.supply_request_lines for update to authenticated
  using (public.has_permission('supplies.manage') and public.supply_request_scope_matches(request_id))
  with check (public.has_permission('supplies.manage') and public.supply_request_scope_matches(request_id));
create policy supply_request_lines_delete on public.supply_request_lines for delete to authenticated
  using (public.has_permission('supplies.delete') and public.supply_request_scope_matches(request_id));

revoke all on function public.supply_request_scope_matches(uuid) from public, anon;
grant execute on function public.supply_request_scope_matches(uuid) to authenticated;
grant select, insert, update on public.supply_items to authenticated;
grant select, insert, update on public.supply_requests to authenticated;
grant select, insert, update, delete on public.supply_request_lines to authenticated;

commit;
