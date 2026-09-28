begin;

-- Tên file/sheet/dòng chỉ là vị trí tham chiếu và có thể được tái sử dụng
-- ở file gia hạn. Không được dùng vị trí này để ghi đè kỳ vé đã lưu.
alter table public.vehicle_toll_quarterly_passes
  drop constraint if exists vehicle_toll_quarterly_passes_source_file_source_sheet_source_row_key;

create index if not exists vehicle_toll_quarterly_source_position_idx
  on public.vehicle_toll_quarterly_passes (source_file, source_sheet, source_row);

comment on column public.vehicle_toll_quarterly_passes.source_row is
  'Vị trí tham chiếu trong file nguồn; không dùng làm khóa cập nhật kỳ vé đã lưu.';

create or replace function public.import_vehicle_tolls(
  target_kind text,
  target_source text,
  target_rows jsonb,
  target_month date default null,
  target_checksum text default null,
  target_pages integer default null
)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  r record;
  target_batch uuid;
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
    select id into target_batch
    from public.vehicle_toll_monthly_batches
    where period_month = target_month;
    if target_batch is not null and not public.can_access_toll_batch(target_batch, 'vehicles.import') then
      raise exception 'VETC_BATCH_FORBIDDEN';
    end if;
    insert into public.vehicle_toll_monthly_batches (
      period_month, source_file_name, source_checksum, source_page_count
    ) values (
      target_month, target_source, target_checksum, target_pages
    )
    on conflict (period_month) do update set
      source_file_name = excluded.source_file_name,
      source_checksum = excluded.source_checksum,
      source_page_count = excluded.source_page_count,
      updated_by = auth.uid()
    returning id into target_batch;

    for r in select * from jsonb_to_recordset(target_rows) as x(
      vehicle_id uuid,
      license_plate text,
      toll_station text,
      transaction_at timestamptz,
      invoice_number text,
      transaction_code text,
      amount_before_tax numeric,
      tax_amount numeric,
      amount_after_tax numeric,
      page integer,
      fingerprint text
    ) loop
      if date_trunc('month', r.transaction_at at time zone 'Asia/Ho_Chi_Minh')::date is distinct from target_month
        or abs(r.amount_before_tax + r.tax_amount - r.amount_after_tax) > 1
        or r.page > target_pages then
        raise exception 'VETC_INVALID_TRANSACTION';
      end if;
      insert into public.vehicle_toll_transactions (
        batch_id, vehicle_id, license_plate, toll_station, transaction_at,
        invoice_number, transaction_code, amount_before_tax, tax_amount,
        amount_after_tax, source_page, fingerprint
      ) values (
        target_batch, r.vehicle_id, r.license_plate, r.toll_station, r.transaction_at,
        r.invoice_number, r.transaction_code, r.amount_before_tax, r.tax_amount,
        r.amount_after_tax, r.page, r.fingerprint
      )
      on conflict (fingerprint) do nothing;
      get diagnostics affected = row_count;
      saved := saved + affected;
    end loop;

    update public.vehicle_toll_monthly_batches batch set
      transaction_count = summary.transactions,
      vehicle_count = summary.vehicles,
      station_count = summary.stations,
      amount_before_tax = summary.before_tax,
      tax_amount = summary.tax,
      amount_after_tax = summary.after_tax
    from (
      select
        count(*) as transactions,
        count(distinct vehicle_id) as vehicles,
        count(distinct toll_station) as stations,
        sum(amount_before_tax) as before_tax,
        sum(tax_amount) as tax,
        sum(amount_after_tax) as after_tax
      from public.vehicle_toll_transactions
      where batch_id = target_batch
    ) summary
    where batch.id = target_batch;
  else
    for r in select * from jsonb_to_recordset(target_rows) as x(
      vehicle_id uuid,
      vehicle_type text,
      vehicle_color text,
      license_plate text,
      starts_on date,
      expires_on date,
      toll_station text,
      amount numeric,
      sheet text,
      row integer,
      fingerprint text
    ) loop
      insert into public.vehicle_toll_quarterly_passes (
        vehicle_id, vehicle_type, vehicle_color, license_plate, starts_on,
        expires_on, toll_station, amount, source_file, source_sheet,
        source_row, fingerprint
      ) values (
        r.vehicle_id, r.vehicle_type, r.vehicle_color, r.license_plate, r.starts_on,
        r.expires_on, r.toll_station, r.amount, target_source, r.sheet,
        r.row, r.fingerprint
      )
      on conflict (fingerprint) do nothing;
      get diagnostics affected = row_count;
      saved := saved + affected;
    end loop;
  end if;
  return saved;
end;
$$;

revoke all on function public.import_vehicle_tolls(text, text, jsonb, date, text, integer) from public;
grant execute on function public.import_vehicle_tolls(text, text, jsonb, date, text, integer) to authenticated;

commit;
