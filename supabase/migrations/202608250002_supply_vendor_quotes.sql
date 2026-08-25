begin;

create table public.supply_quotes (
  id uuid primary key default gen_random_uuid(),
  quote_no text not null default '',
  vendor_name text not null,
  vendor_address text not null default '',
  vendor_contact text not null default '',
  category text not null check (category in ('OFFICE_SUPPLY', 'CLEANING_SUPPLY')),
  quote_date date,
  valid_until date,
  status text not null default 'RECEIVED'
    check (status in ('RECEIVED', 'REVIEWING', 'SELECTED', 'REJECTED', 'EXPIRED')),
  subtotal numeric(18, 2) not null default 0 check (subtotal >= 0),
  tax_rate numeric(8, 4) not null default 0 check (tax_rate >= 0),
  tax_amount numeric(18, 2) not null default 0 check (tax_amount >= 0),
  total_amount numeric(18, 2) not null default 0 check (total_amount >= 0),
  note text not null default '',
  source_file text not null default '',
  source_sheet text not null default '',
  import_fingerprint text,
  created_by uuid references public.profiles(id) on delete set null default auth.uid(),
  updated_by uuid references public.profiles(id) on delete set null default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

create unique index supply_quotes_fingerprint_idx on public.supply_quotes (import_fingerprint)
  where import_fingerprint is not null and deleted_at is null;
create index supply_quotes_vendor_date_idx on public.supply_quotes (vendor_name, quote_date desc)
  where deleted_at is null;

create table public.supply_quote_lines (
  id uuid primary key default gen_random_uuid(),
  quote_id uuid not null references public.supply_quotes(id) on delete cascade,
  item_id uuid references public.supply_items(id) on delete set null,
  item_name text not null,
  unit text not null default '',
  quantity numeric(14, 3) not null default 0 check (quantity >= 0),
  unit_price numeric(18, 2) not null default 0 check (unit_price >= 0),
  old_unit_price numeric(18, 2) check (old_unit_price is null or old_unit_price >= 0),
  amount numeric(18, 2) not null default 0 check (amount >= 0),
  note text not null default '',
  sort_order integer not null default 0,
  created_by uuid references public.profiles(id) on delete set null default auth.uid(),
  updated_by uuid references public.profiles(id) on delete set null default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index supply_quote_lines_quote_idx on public.supply_quote_lines (quote_id, sort_order);
create index supply_quote_lines_item_idx on public.supply_quote_lines (item_id);

create trigger supply_quotes_set_updated_at before update on public.supply_quotes
  for each row execute procedure public.set_updated_at();
create trigger supply_quote_lines_set_updated_at before update on public.supply_quote_lines
  for each row execute procedure public.set_updated_at();
create trigger supply_quotes_audit after insert or update or delete on public.supply_quotes
  for each row execute procedure public.write_audit_log();
create trigger supply_quote_lines_audit after insert or update or delete on public.supply_quote_lines
  for each row execute procedure public.write_audit_log();

alter table public.supply_quotes enable row level security;
alter table public.supply_quote_lines enable row level security;

create policy supply_quotes_select on public.supply_quotes for select to authenticated
  using (deleted_at is null and public.has_permission('supplies.view'));
create policy supply_quotes_insert on public.supply_quotes for insert to authenticated
  with check (public.has_permission('supplies.manage'));
create policy supply_quotes_update on public.supply_quotes for update to authenticated
  using (deleted_at is null and public.has_permission('supplies.manage'))
  with check (public.has_permission('supplies.manage'));

create policy supply_quote_lines_select on public.supply_quote_lines for select to authenticated
  using (
    public.has_permission('supplies.view')
    and exists (
      select 1 from public.supply_quotes sq
      where sq.id = quote_id and sq.deleted_at is null
    )
  );
create policy supply_quote_lines_insert on public.supply_quote_lines for insert to authenticated
  with check (public.has_permission('supplies.manage'));
create policy supply_quote_lines_update on public.supply_quote_lines for update to authenticated
  using (public.has_permission('supplies.manage'))
  with check (public.has_permission('supplies.manage'));
create policy supply_quote_lines_delete on public.supply_quote_lines for delete to authenticated
  using (public.has_permission('supplies.delete'));

grant select, insert, update on public.supply_quotes to authenticated;
grant select, insert, update, delete on public.supply_quote_lines to authenticated;

commit;
