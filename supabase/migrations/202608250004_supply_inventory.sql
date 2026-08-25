begin;

create table public.supply_inventory_movements (
  id uuid primary key default gen_random_uuid(),
  item_id uuid not null references public.supply_items(id) on delete restrict,
  movement_type text not null check (movement_type in (
    'RECEIPT', 'ISSUE', 'ADJUSTMENT_IN', 'ADJUSTMENT_OUT', 'RETURN_IN', 'RECEIPT_REVERSAL'
  )),
  quantity numeric(14, 3) not null check (quantity > 0),
  unit_price numeric(18, 2) not null default 0 check (unit_price >= 0),
  movement_date date not null default current_date,
  source_type text not null default 'MANUAL' check (source_type in ('SUPPLIER_QUOTE', 'SUPPLY_REQUEST', 'MANUAL')),
  source_id uuid,
  source_line_id uuid,
  reference_no text not null default '',
  note text not null default '',
  created_by uuid references public.profiles(id) on delete set null default auth.uid(),
  created_at timestamptz not null default now()
);

create index supply_inventory_movements_item_date_idx
  on public.supply_inventory_movements (item_id, movement_date desc, created_at desc);
create index supply_inventory_movements_source_idx
  on public.supply_inventory_movements (source_type, source_line_id)
  where source_line_id is not null;

create or replace function public.supply_inventory_signed_quantity(kind text, amount numeric)
returns numeric
language sql
immutable
set search_path = ''
as $$
  select case
    when kind in ('RECEIPT', 'ADJUSTMENT_IN', 'RETURN_IN') then amount
    else -amount
  end;
$$;

create or replace function public.supply_inventory_validate_movement()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  current_balance numeric(14, 3);
  delta numeric(14, 3);
  target_name text;
begin
  perform 1 from public.supply_items where id = new.item_id for update;
  if not found then
    raise exception 'Không tìm thấy hàng hóa trong kho.';
  end if;

  delta := public.supply_inventory_signed_quantity(new.movement_type, new.quantity);
  if delta < 0 then
    select coalesce(sum(public.supply_inventory_signed_quantity(movement_type, quantity)), 0)
      into current_balance
    from public.supply_inventory_movements
    where item_id = new.item_id;

    if current_balance + delta < 0 then
      select item_name into target_name from public.supply_items where id = new.item_id;
      raise exception 'Kho không đủ %: còn %, cần %.', target_name, current_balance, abs(delta);
    end if;
  end if;
  return new;
end;
$$;

create trigger supply_inventory_validate_before_insert
  before insert on public.supply_inventory_movements
  for each row execute procedure public.supply_inventory_validate_movement();

create or replace function public.sync_supply_quote_line_inventory()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  desired numeric(14, 3) := 0;
  current_net numeric(14, 3) := 0;
  delta numeric(14, 3);
  quote_active boolean := false;
  quote_reference text := '';
begin
  if new.item_id is null then return new; end if;

  select sq.deleted_at is null, coalesce(nullif(sq.quote_no, ''), sq.vendor_name)
    into quote_active, quote_reference
  from public.supply_quotes sq where sq.id = new.quote_id;

  if quote_active then desired := new.quantity; end if;

  select coalesce(sum(public.supply_inventory_signed_quantity(movement_type, quantity)), 0)
    into current_net
  from public.supply_inventory_movements
  where source_type = 'SUPPLIER_QUOTE' and source_line_id = new.id;

  delta := desired - current_net;
  if delta > 0 then
    insert into public.supply_inventory_movements (
      item_id, movement_type, quantity, unit_price, movement_date,
      source_type, source_id, source_line_id, reference_no, note, created_by
    ) values (
      new.item_id, 'RECEIPT', delta, new.unit_price, current_date,
      'SUPPLIER_QUOTE', new.quote_id, new.id, quote_reference,
      'Nhập kho tự động từ báo giá nhà cung cấp', coalesce(new.created_by, auth.uid())
    );
  elsif delta < 0 then
    insert into public.supply_inventory_movements (
      item_id, movement_type, quantity, unit_price, movement_date,
      source_type, source_id, source_line_id, reference_no, note, created_by
    ) values (
      new.item_id, 'RECEIPT_REVERSAL', abs(delta), new.unit_price, current_date,
      'SUPPLIER_QUOTE', new.quote_id, new.id, quote_reference,
      'Điều chỉnh giảm do báo giá thay đổi hoặc bị xóa', auth.uid()
    );
  end if;
  return new;
end;
$$;

create or replace function public.sync_supply_quote_line_inventory_for_id(target_line_id uuid)
returns void
language plpgsql
set search_path = ''
as $$
declare
  target public.supply_quote_lines%rowtype;
  desired numeric(14, 3) := 0;
  current_net numeric(14, 3) := 0;
  delta numeric(14, 3);
  quote_active boolean := false;
  quote_reference text := '';
begin
  select * into target from public.supply_quote_lines where id = target_line_id;
  if not found or target.item_id is null then return; end if;
  select sq.deleted_at is null, coalesce(nullif(sq.quote_no, ''), sq.vendor_name)
    into quote_active, quote_reference from public.supply_quotes sq where sq.id = target.quote_id;
  if quote_active then desired := target.quantity; end if;
  select coalesce(sum(public.supply_inventory_signed_quantity(movement_type, quantity)), 0)
    into current_net from public.supply_inventory_movements
    where source_type = 'SUPPLIER_QUOTE' and source_line_id = target.id;
  delta := desired - current_net;
  if delta > 0 then
    insert into public.supply_inventory_movements (
      item_id, movement_type, quantity, unit_price, movement_date, source_type,
      source_id, source_line_id, reference_no, note, created_by
    ) values (
      target.item_id, 'RECEIPT', delta, target.unit_price, current_date, 'SUPPLIER_QUOTE',
      target.quote_id, target.id, quote_reference, 'Nhập kho tự động từ báo giá nhà cung cấp', coalesce(target.created_by, auth.uid())
    );
  elsif delta < 0 then
    insert into public.supply_inventory_movements (
      item_id, movement_type, quantity, unit_price, movement_date, source_type,
      source_id, source_line_id, reference_no, note, created_by
    ) values (
      target.item_id, 'RECEIPT_REVERSAL', abs(delta), target.unit_price, current_date, 'SUPPLIER_QUOTE',
      target.quote_id, target.id, quote_reference, 'Điều chỉnh giảm do báo giá thay đổi hoặc bị xóa', auth.uid()
    );
  end if;
end;
$$;

create or replace function public.sync_supply_quote_inventory_on_archive()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  quote_line record;
begin
  if old.deleted_at is null and new.deleted_at is not null then
    for quote_line in
      select id from public.supply_quote_lines where quote_id = new.id
    loop
      perform public.sync_supply_quote_line_inventory_for_id(quote_line.id);
    end loop;
  end if;
  return new;
end;
$$;

create trigger supply_quote_lines_inventory_after_insert_or_update
  after insert or update of item_id, quantity, unit_price on public.supply_quote_lines
  for each row execute procedure public.sync_supply_quote_line_inventory();

create trigger supply_quotes_inventory_after_archive
  after update of deleted_at on public.supply_quotes
  for each row execute procedure public.sync_supply_quote_inventory_on_archive();

create or replace function public.sync_supply_request_line_inventory_for_id(target_line_id uuid)
returns void
language plpgsql
set search_path = ''
as $$
declare
  target public.supply_request_lines%rowtype;
  request_row public.supply_requests%rowtype;
  desired numeric(14, 3) := 0;
  current_net numeric(14, 3) := 0;
  delta numeric(14, 3);
begin
  select * into target from public.supply_request_lines where id = target_line_id;
  if not found or target.item_id is null then return; end if;
  select * into request_row from public.supply_requests where id = target.request_id;
  if request_row.deleted_at is null and request_row.status in ('APPROVED', 'ORDERED', 'CLOSED') then
    desired := -target.proposed_quantity;
  end if;
  select coalesce(sum(public.supply_inventory_signed_quantity(movement_type, quantity)), 0)
    into current_net from public.supply_inventory_movements
    where source_type = 'SUPPLY_REQUEST' and source_line_id = target.id;
  delta := desired - current_net;
  if delta < 0 then
    insert into public.supply_inventory_movements (
      item_id, movement_type, quantity, unit_price, movement_date, source_type,
      source_id, source_line_id, reference_no, note, created_by
    ) values (
      target.item_id, 'ISSUE', abs(delta), target.approved_unit_price, request_row.requested_on,
      'SUPPLY_REQUEST', target.request_id, target.id, request_row.request_no,
      'Xuất kho tự động theo phiếu yêu cầu đã duyệt', coalesce(target.created_by, auth.uid())
    );
  elsif delta > 0 then
    insert into public.supply_inventory_movements (
      item_id, movement_type, quantity, unit_price, movement_date, source_type,
      source_id, source_line_id, reference_no, note, created_by
    ) values (
      target.item_id, 'RETURN_IN', delta, target.approved_unit_price, current_date,
      'SUPPLY_REQUEST', target.request_id, target.id, request_row.request_no,
      'Hoàn kho do phiếu yêu cầu thay đổi hoặc bị hủy', auth.uid()
    );
  end if;
end;
$$;

create or replace function public.sync_supply_request_line_inventory()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  perform public.sync_supply_request_line_inventory_for_id(new.id);
  return new;
end;
$$;

create or replace function public.sync_supply_request_inventory_on_change()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  request_line record;
begin
  if old.status is distinct from new.status or old.deleted_at is distinct from new.deleted_at then
    for request_line in select id from public.supply_request_lines where request_id = new.id loop
      perform public.sync_supply_request_line_inventory_for_id(request_line.id);
    end loop;
  end if;
  return new;
end;
$$;

create trigger supply_request_lines_inventory_after_insert_or_update
  after insert or update of item_id, proposed_quantity on public.supply_request_lines
  for each row execute procedure public.sync_supply_request_line_inventory();

create trigger supply_requests_inventory_after_status_change
  after update of status, deleted_at on public.supply_requests
  for each row execute procedure public.sync_supply_request_inventory_on_change();

create view public.supply_inventory_balances
with (security_invoker = true)
as
select
  si.id as item_id,
  si.category,
  si.item_code,
  si.item_name,
  si.unit,
  si.active,
  coalesce(sum(public.supply_inventory_signed_quantity(sim.movement_type, sim.quantity)), 0)::numeric(14, 3) as on_hand_quantity,
  coalesce(sum(case when public.supply_inventory_signed_quantity(sim.movement_type, sim.quantity) > 0
    then sim.quantity * sim.unit_price else 0 end), 0)::numeric(18, 2) as total_receipt_value,
  max(sim.created_at) as last_movement_at
from public.supply_items si
left join public.supply_inventory_movements sim on sim.item_id = si.id
where si.deleted_at is null
group by si.id, si.category, si.item_code, si.item_name, si.unit, si.active;

create trigger supply_inventory_movements_audit
  after insert or update or delete on public.supply_inventory_movements
  for each row execute procedure public.write_audit_log();

alter table public.supply_inventory_movements enable row level security;
create policy supply_inventory_movements_select on public.supply_inventory_movements
  for select to authenticated using (public.has_permission('supplies.view'));
create policy supply_inventory_movements_insert on public.supply_inventory_movements
  for insert to authenticated with check (
    public.has_permission('supplies.manage')
    or public.has_permission('supplies.import')
  );

grant select, insert on public.supply_inventory_movements to authenticated;
grant select on public.supply_inventory_balances to authenticated;
grant execute on function public.supply_inventory_signed_quantity(text, numeric) to authenticated;

-- Báo giá đã nhập trước migration được xem là tồn đầu kỳ. Phiếu yêu cầu lịch sử
-- không tự trừ kho để tránh làm âm dữ liệu khi chưa có số dư ban đầu đáng tin cậy.
insert into public.supply_inventory_movements (
  item_id, movement_type, quantity, unit_price, movement_date, source_type,
  source_id, source_line_id, reference_no, note, created_by
)
select
  sql.item_id, 'RECEIPT', sql.quantity, sql.unit_price, coalesce(sq.quote_date, current_date),
  'SUPPLIER_QUOTE', sq.id, sql.id, coalesce(nullif(sq.quote_no, ''), sq.vendor_name),
  'Tồn đầu kỳ từ báo giá đã nhập', coalesce(sql.created_by, sq.created_by)
from public.supply_quote_lines sql
join public.supply_quotes sq on sq.id = sql.quote_id and sq.deleted_at is null
where sql.item_id is not null and sql.quantity > 0;

commit;
