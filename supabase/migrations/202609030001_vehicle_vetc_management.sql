begin;

create table public.vehicle_toll_monthly_batches (
  id uuid primary key default gen_random_uuid(),
  period_month date not null unique,
  source_file_name text not null default '',
  source_checksum text not null check (source_checksum ~ '^[0-9a-f]{64}$'),
  source_page_count integer not null check (source_page_count between 1 and 500),
  transaction_count integer not null default 0 check (transaction_count >= 0),
  vehicle_count integer not null default 0 check (vehicle_count >= 0),
  station_count integer not null default 0 check (station_count >= 0),
  amount_before_tax numeric(18, 2) not null default 0 check (amount_before_tax >= 0),
  tax_amount numeric(18, 2) not null default 0 check (tax_amount >= 0),
  amount_after_tax numeric(18, 2) not null default 0 check (amount_after_tax >= 0),
  created_by uuid references public.profiles(id) on delete set null default auth.uid(),
  updated_by uuid references public.profiles(id) on delete set null default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (period_month = date_trunc('month', period_month)::date)
);

create table public.vehicle_toll_transactions (
  id uuid primary key default gen_random_uuid(),
  batch_id uuid not null references public.vehicle_toll_monthly_batches(id) on delete cascade,
  vehicle_id uuid references public.vehicles(id) on delete set null,
  license_plate text not null,
  toll_station text not null,
  transaction_at timestamptz not null,
  invoice_number text not null default '',
  transaction_code text not null default '',
  amount_before_tax numeric(18, 2) not null default 0 check (amount_before_tax >= 0),
  tax_amount numeric(18, 2) not null default 0 check (tax_amount >= 0),
  amount_after_tax numeric(18, 2) not null default 0 check (amount_after_tax >= 0),
  source_page integer not null check (source_page > 0),
  fingerprint text not null unique check (fingerprint ~ '^[0-9a-f]{64}$'),
  created_at timestamptz not null default now()
);

create table public.vehicle_toll_quarterly_passes (
  id uuid primary key default gen_random_uuid(),
  vehicle_id uuid references public.vehicles(id) on delete set null,
  vehicle_type text not null default '',
  vehicle_color text not null default '',
  license_plate text not null,
  starts_on date not null,
  expires_on date not null,
  toll_station text not null,
  amount numeric(18, 2) not null default 0 check (amount >= 0),
  source_file text not null,
  source_sheet text not null,
  source_row integer not null check (source_row > 0),
  fingerprint text not null unique check (fingerprint ~ '^[0-9a-f]{64}$'),
  created_by uuid references public.profiles(id) on delete set null default auth.uid(),
  updated_by uuid references public.profiles(id) on delete set null default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (source_file, source_sheet, source_row),
  check (expires_on >= starts_on)
);

create index vehicle_toll_batches_period_idx
  on public.vehicle_toll_monthly_batches (period_month desc);
create index vehicle_toll_transactions_batch_time_idx
  on public.vehicle_toll_transactions (batch_id, transaction_at desc);
create index vehicle_toll_transactions_vehicle_time_idx
  on public.vehicle_toll_transactions (vehicle_id, transaction_at desc);
create index vehicle_toll_quarterly_period_idx
  on public.vehicle_toll_quarterly_passes (starts_on desc, expires_on desc);
create index vehicle_toll_quarterly_vehicle_idx
  on public.vehicle_toll_quarterly_passes (vehicle_id, expires_on desc);

create trigger vehicle_toll_batches_set_updated_at
before update on public.vehicle_toll_monthly_batches
for each row execute procedure public.set_updated_at();

create trigger vehicle_toll_quarterly_set_updated_at
before update on public.vehicle_toll_quarterly_passes
for each row execute procedure public.set_updated_at();

create trigger vehicle_toll_batches_audit
after insert or update or delete on public.vehicle_toll_monthly_batches
for each row execute procedure public.write_audit_log();

create trigger vehicle_toll_transactions_audit
after insert or update or delete on public.vehicle_toll_transactions
for each row execute procedure public.write_audit_log();

create trigger vehicle_toll_quarterly_audit
after insert or update or delete on public.vehicle_toll_quarterly_passes
for each row execute procedure public.write_audit_log();

alter table public.vehicle_toll_monthly_batches enable row level security;
alter table public.vehicle_toll_transactions enable row level security;
alter table public.vehicle_toll_quarterly_passes enable row level security;

-- A monthly total must not disclose other departments' vehicle costs.
create function public.can_access_toll_batch(target_id uuid, required_permission text)
returns boolean language sql stable security definer set search_path = '' as $$
  select public.has_permission(required_permission)
    and not exists (
      select 1 from public.vehicle_toll_transactions t where t.batch_id = target_id
      and (t.vehicle_id is null or not public.can_access_vehicle(t.vehicle_id, required_permission))
    );
$$;
revoke all on function public.can_access_toll_batch(uuid, text) from public;
grant execute on function public.can_access_toll_batch(uuid, text) to authenticated;

create policy vehicle_toll_batches_select on public.vehicle_toll_monthly_batches
  for select to authenticated using (public.can_access_toll_batch(id, 'vehicles.view'));
create policy vehicle_toll_transactions_select on public.vehicle_toll_transactions
  for select to authenticated using (public.can_access_vehicle(vehicle_id, 'vehicles.view'));
create policy vehicle_toll_quarterly_select on public.vehicle_toll_quarterly_passes
  for select to authenticated using (public.can_access_vehicle(vehicle_id, 'vehicles.view'));

-- Imports, counters and replacement source rows commit together or roll back together.
create function public.import_vehicle_tolls(target_kind text, target_source text, target_rows jsonb,
  target_month date default null, target_checksum text default null, target_pages integer default null)
returns integer language plpgsql security definer set search_path = '' as $$
declare
  r record;
  target_batch uuid;
  existing_vehicle uuid;
  saved integer := 0;
  affected integer;
begin
  if auth.uid() is null or not public.has_permission('vehicles.import') then
    raise exception 'VETC_FORBIDDEN';
  end if;
  if target_kind not in ('monthly', 'quarterly') or target_kind is null
    or jsonb_typeof(target_rows) is distinct from 'array'
    or jsonb_array_length(target_rows) not between 1 and 1000
    or length(btrim(coalesce(target_source, ''))) not between 1 and 200 then
    raise exception 'VETC_INVALID_INPUT';
  end if;
  -- Serialise imports and deletes so concurrent confirmations cannot lose counters.
  perform pg_advisory_xact_lock(726381);
  for r in select * from jsonb_to_recordset(target_rows) as x(vehicle_id uuid) loop
    if r.vehicle_id is null or not public.can_access_vehicle(r.vehicle_id, 'vehicles.import') then
      raise exception 'VETC_VEHICLE_FORBIDDEN';
    end if;
  end loop;
  if target_kind = 'monthly' then
    if target_month is null or target_month <> date_trunc('month', target_month)::date
      or target_checksum is null or target_checksum !~ '^[0-9a-f]{64}$'
      or target_pages is null or target_pages not between 1 and 500 then
      raise exception 'VETC_INVALID_MONTH';
    end if;
    select id into target_batch from public.vehicle_toll_monthly_batches where period_month = target_month;
    if target_batch is not null and not public.can_access_toll_batch(target_batch, 'vehicles.import') then
      raise exception 'VETC_BATCH_FORBIDDEN';
    end if;
    insert into public.vehicle_toll_monthly_batches(period_month, source_file_name, source_checksum, source_page_count)
      values(target_month, target_source, target_checksum, target_pages)
      on conflict(period_month) do update set source_file_name = excluded.source_file_name,
        source_checksum = excluded.source_checksum, source_page_count = excluded.source_page_count,
        updated_by = auth.uid()
      returning id into target_batch;
    for r in select * from jsonb_to_recordset(target_rows) as x(
      vehicle_id uuid, license_plate text, toll_station text, transaction_at timestamptz,
      invoice_number text, transaction_code text, amount_before_tax numeric, tax_amount numeric,
      amount_after_tax numeric, page integer, fingerprint text
    ) loop
      if date_trunc('month', r.transaction_at at time zone 'Asia/Ho_Chi_Minh')::date is distinct from target_month
        or abs(r.amount_before_tax + r.tax_amount - r.amount_after_tax) > 1
        or r.page > target_pages then raise exception 'VETC_INVALID_TRANSACTION'; end if;
      insert into public.vehicle_toll_transactions(batch_id, vehicle_id, license_plate, toll_station,
        transaction_at, invoice_number, transaction_code, amount_before_tax, tax_amount, amount_after_tax, source_page, fingerprint)
      values(target_batch, r.vehicle_id, r.license_plate, r.toll_station, r.transaction_at,
        r.invoice_number, r.transaction_code, r.amount_before_tax, r.tax_amount, r.amount_after_tax, r.page, r.fingerprint)
      on conflict(fingerprint) do nothing;
      get diagnostics affected = row_count;
      saved := saved + affected;
    end loop;
    update public.vehicle_toll_monthly_batches b set
      transaction_count = s.transactions, vehicle_count = s.vehicles, station_count = s.stations,
      amount_before_tax = s.before_tax, tax_amount = s.tax, amount_after_tax = s.after_tax
    from (select count(*) as transactions, count(distinct vehicle_id) as vehicles,
      count(distinct toll_station) as stations, sum(amount_before_tax) as before_tax,
      sum(tax_amount) as tax, sum(amount_after_tax) as after_tax
      from public.vehicle_toll_transactions where batch_id = target_batch) s where b.id = target_batch;
  else
    for r in select * from jsonb_to_recordset(target_rows) as x(
      vehicle_id uuid, vehicle_type text, vehicle_color text, license_plate text,
      starts_on date, expires_on date, toll_station text, amount numeric,
      sheet text, row integer, fingerprint text
    ) loop
      if exists(select 1 from public.vehicle_toll_quarterly_passes where fingerprint = r.fingerprint) then continue; end if;
      select vehicle_id into existing_vehicle from public.vehicle_toll_quarterly_passes
        where source_file = target_source and source_sheet = r.sheet and source_row = r.row;
      if found and (existing_vehicle is null or not public.can_access_vehicle(existing_vehicle, 'vehicles.import')) then
        raise exception 'VETC_VEHICLE_FORBIDDEN';
      end if;
      insert into public.vehicle_toll_quarterly_passes(vehicle_id, vehicle_type, vehicle_color,
        license_plate, starts_on, expires_on, toll_station, amount, source_file, source_sheet, source_row, fingerprint)
      values(r.vehicle_id, r.vehicle_type, r.vehicle_color, r.license_plate, r.starts_on,
        r.expires_on, r.toll_station, r.amount, target_source, r.sheet, r.row, r.fingerprint)
      on conflict(source_file, source_sheet, source_row) do update set
        vehicle_id = excluded.vehicle_id, vehicle_type = excluded.vehicle_type, vehicle_color = excluded.vehicle_color,
        license_plate = excluded.license_plate, starts_on = excluded.starts_on, expires_on = excluded.expires_on,
        toll_station = excluded.toll_station, amount = excluded.amount, fingerprint = excluded.fingerprint,
        updated_by = auth.uid();
      saved := saved + 1;
    end loop;
  end if;
  return saved;
end;
$$;
revoke all on function public.import_vehicle_tolls(text, text, jsonb, date, text, integer) from public;
grant execute on function public.import_vehicle_tolls(text, text, jsonb, date, text, integer) to authenticated;

create function public.delete_vehicle_toll(target_kind text, target_id uuid)
returns boolean language plpgsql security definer set search_path = '' as $$
declare allowed boolean; affected integer;
begin
  if auth.uid() is null or not public.has_permission('vehicles.delete') then raise exception 'VETC_FORBIDDEN'; end if;
  perform pg_advisory_xact_lock(726381);
  if target_kind = 'monthly' then
    if not public.can_access_toll_batch(target_id, 'vehicles.delete') then raise exception 'VETC_FORBIDDEN'; end if;
    delete from public.vehicle_toll_monthly_batches where id = target_id;
  elsif target_kind = 'quarterly' then
    select public.can_access_vehicle(vehicle_id, 'vehicles.delete') into allowed
      from public.vehicle_toll_quarterly_passes where id = target_id;
    if allowed is distinct from true then raise exception 'VETC_FORBIDDEN'; end if;
    delete from public.vehicle_toll_quarterly_passes where id = target_id;
  else raise exception 'VETC_INVALID_INPUT'; end if;
  get diagnostics affected = row_count;
  return affected > 0;
end;
$$;
revoke all on function public.delete_vehicle_toll(text, uuid) from public;
grant execute on function public.delete_vehicle_toll(text, uuid) to authenticated;

revoke all on public.vehicle_toll_monthly_batches, public.vehicle_toll_transactions,
  public.vehicle_toll_quarterly_passes from anon, authenticated;
grant select on public.vehicle_toll_monthly_batches, public.vehicle_toll_transactions,
  public.vehicle_toll_quarterly_passes to authenticated;

create function public.vehicle_toll_year_totals(target_year integer)
returns jsonb language sql stable security invoker set search_path = '' as $$
  select jsonb_build_object(
    'monthly', (select coalesce(sum(amount_after_tax), 0) from public.vehicle_toll_transactions
      where transaction_at >= (make_date(target_year, 1, 1)::timestamp at time zone 'Asia/Ho_Chi_Minh')
        and transaction_at < (make_date(target_year + 1, 1, 1)::timestamp at time zone 'Asia/Ho_Chi_Minh')),
    'quarterly', (select coalesce(sum(amount), 0) from public.vehicle_toll_quarterly_passes
      where starts_on >= make_date(target_year, 1, 1) and starts_on < make_date(target_year + 1, 1, 1))
  );
$$;
revoke all on function public.vehicle_toll_year_totals(integer) from public;
grant execute on function public.vehicle_toll_year_totals(integer) to authenticated;

commit;
