begin;

alter table public.user_module_access drop constraint user_module_access_module_check;
alter table public.user_module_access add constraint user_module_access_module_check
  check (module in ('equipment', 'vehicles', 'supplies', 'telecom'));

create or replace function public.permission_system_module(required_permission text)
returns text language sql immutable set search_path = '' as $$
  select case
    when required_permission like 'telecom.%' or required_permission like 'reports.telecom.%' then 'telecom'
    when required_permission like 'vehicles.%' or required_permission like 'reports.vehicles.%' then 'vehicles'
    when required_permission like 'supplies.%' or required_permission like 'reports.supplies.%' then 'supplies'
    else 'equipment' end;
$$;

-- Extend only the module allowlists in the existing access functions, retaining
-- the self-lockout, role, MFA and audit logic from the deployed definitions.
do $$
declare signature text; definition text; extended text;
begin
  foreach signature in array array[
    'public.has_system_module(text)', 'public.get_my_access()',
    'public.admin_set_user_access(uuid,text,boolean,boolean,jsonb,jsonb)'
  ] loop
    definition := pg_get_functiondef(signature::regprocedure);
    extended := replace(replace(definition,
      '''equipment'', ''vehicles'', ''supplies''', '''equipment'', ''vehicles'', ''supplies'', ''telecom'''),
      '["equipment", "vehicles", "supplies"]', '["equipment", "vehicles", "supplies", "telecom"]');
    if definition = extended then raise exception 'Cannot extend module allowlist: %', signature; end if;
    execute extended;
  end loop;
end $$;

insert into public.permissions(code,module,description) values
  ('telecom.view','telecom','Xem chi phí viễn thông'),
  ('telecom.import','telecom','Nhập hóa đơn viễn thông PDF'),
  ('telecom.manage','telecom','Ghi nhận thanh toán và ghi chú viễn thông'),
  ('telecom.delete','telecom','Xóa hóa đơn viễn thông'),
  ('reports.telecom.export','reports','Xuất báo cáo viễn thông tháng/năm')
on conflict(code) do nothing;
insert into public.role_permissions(role_id,permission_code)
select r.id,p.code from public.roles r cross join public.permissions p
where p.code in ('telecom.view','telecom.import','telecom.manage','telecom.delete','reports.telecom.export')
  and (r.code='admin' or (r.code='manager' and p.code<>'telecom.delete')
    or (r.code in ('user','viewer') and p.code='telecom.view'))
on conflict do nothing;

create table public.telecom_invoices (
  id uuid primary key default gen_random_uuid(),
  category text not null check(category in ('pipeline','landline','director')),
  provider text not null check(length(provider) between 1 and 200),
  issuer_tax_code text not null check(issuer_tax_code ~ '^\d{10}(-?\d{3})?$'),
  invoice_series text not null check(length(invoice_series) between 1 and 30),
  invoice_number text not null check(invoice_number ~ '^\d{1,20}$'),
  issued_on date not null,
  period_month date not null check(extract(day from period_month)=1 and period_month between '2000-01-01' and '2100-12-01'),
  subscriber text not null check(subscriber ~ '^\+?\d{6,20}$'),
  contract_number text not null default '' check(length(contract_number)<=150),
  service text not null check(length(service) between 1 and 200),
  group_name text not null default '' check(length(group_name)<=120),
  amount_before_tax numeric(18,2) not null check(amount_before_tax between 0 and 100000000000),
  tax_amount numeric(18,2) not null check(tax_amount between 0 and 100000000000),
  amount_after_tax numeric(18,2) not null check(amount_after_tax between 0 and 100000000000),
  source_file text not null check(length(source_file) between 1 and 200),
  source_page int not null check(source_page between 1 and 200),
  paid_on date,
  note text not null default '' check(length(note)<=2000),
  created_by uuid references public.profiles(id) on delete set null default auth.uid(),
  updated_by uuid references public.profiles(id) on delete set null default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  check(abs(amount_before_tax+tax_amount-amount_after_tax)<=1)
);
create unique index telecom_invoice_identity on public.telecom_invoices(issuer_tax_code,invoice_series,invoice_number) where deleted_at is null;
create index telecom_invoice_period on public.telecom_invoices(period_month,subscriber,id) where deleted_at is null;
create trigger telecom_invoices_timestamp before update on public.telecom_invoices for each row execute function public.set_updated_at();
create trigger telecom_invoices_audit after insert or update or delete on public.telecom_invoices for each row execute function public.write_audit_log();
alter table public.telecom_invoices enable row level security;
revoke all on public.telecom_invoices from anon, authenticated;
grant select on public.telecom_invoices to authenticated;
create policy telecom_invoices_read on public.telecom_invoices for select to authenticated
using (deleted_at is null and public.has_permission('telecom.view'));

create function public.import_telecom_invoices(target_rows jsonb,target_source text,target_group text,target_category text)
returns integer language plpgsql security definer set search_path = '' as $$
declare item jsonb; existing public.telecom_invoices; saved integer:=0; series text; number text;
begin
  if auth.uid() is null or not public.has_permission('telecom.import') then raise exception 'TELECOM_FORBIDDEN'; end if;
  if target_category is null or target_category not in ('pipeline','landline','director') then raise exception 'TELECOM_INVALID_CATEGORY'; end if;
  if jsonb_typeof(target_rows) is distinct from 'array' or jsonb_array_length(target_rows) not between 1 and 200 then raise exception 'TELECOM_INVALID_ROWS'; end if;
  perform pg_advisory_xact_lock(726382);
  for item in select value from jsonb_array_elements(target_rows) loop
    series:=upper(trim(item->>'invoice_series'));
    number:=coalesce(nullif(ltrim(item->>'invoice_number','0'),''),'0');
    select * into existing from public.telecom_invoices
      where issuer_tax_code=item->>'issuer_tax_code' and invoice_series=series and invoice_number=number and deleted_at is null;
    if found then
      if existing.subscriber is distinct from item->>'subscriber'
        or existing.period_month is distinct from (item->>'period_month')::date
        or existing.issued_on is distinct from (item->>'issued_on')::date
        or existing.amount_before_tax is distinct from (item->>'amount_before_tax')::numeric
        or existing.tax_amount is distinct from (item->>'tax_amount')::numeric
        or existing.amount_after_tax is distinct from (item->>'amount_after_tax')::numeric then
        raise exception 'TELECOM_INVOICE_CONFLICT';
      end if;
      continue;
    end if;
    insert into public.telecom_invoices(category,provider,issuer_tax_code,invoice_series,invoice_number,issued_on,period_month,subscriber,contract_number,service,group_name,amount_before_tax,tax_amount,amount_after_tax,source_file,source_page)
    values(target_category,item->>'provider',item->>'issuer_tax_code',series,number,(item->>'issued_on')::date,(item->>'period_month')::date,item->>'subscriber',coalesce(item->>'contract_number',''),item->>'service',target_group,(item->>'amount_before_tax')::numeric,(item->>'tax_amount')::numeric,(item->>'amount_after_tax')::numeric,target_source,(item->>'page')::int);
    saved:=saved+1;
  end loop;
  return saved;
end $$;

create function public.update_telecom_invoice(target_id uuid,target_paid_on date,target_note text,target_group text,target_category text)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if auth.uid() is null or not public.has_permission('telecom.manage') then raise exception 'TELECOM_FORBIDDEN'; end if;
  update public.telecom_invoices set paid_on=target_paid_on,note=target_note,group_name=target_group,category=target_category,updated_by=auth.uid()
    where id=target_id and deleted_at is null;
  if not found then raise exception 'TELECOM_NOT_FOUND'; end if;
end $$;

create function public.delete_telecom_invoice(target_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if auth.uid() is null or not public.has_permission('telecom.delete') then raise exception 'TELECOM_FORBIDDEN'; end if;
  perform pg_advisory_xact_lock(726382);
  update public.telecom_invoices set deleted_at=now(),updated_by=auth.uid() where id=target_id and deleted_at is null;
  if not found then raise exception 'TELECOM_NOT_FOUND'; end if;
end $$;

create function public.telecom_cost_summary(target_year int)
returns jsonb language sql stable security invoker set search_path = '' as $$
  select coalesce(jsonb_agg(to_jsonb(t) order by t.period_month),'[]'::jsonb) from (
    select period_month,category,count(*) invoice_count,count(distinct subscriber) sim_count,
      sum(amount_before_tax) before_tax,sum(tax_amount) vat,sum(amount_after_tax) total,
      sum(case when paid_on is null then amount_after_tax else 0 end) unpaid
    from public.telecom_invoices where deleted_at is null
      and period_month>=make_date(target_year,1,1) and period_month<make_date(target_year+1,1,1)
    group by period_month,category
  ) t;
$$;
revoke all on function public.import_telecom_invoices(jsonb,text,text,text) from public;
revoke all on function public.update_telecom_invoice(uuid,date,text,text,text) from public;
revoke all on function public.delete_telecom_invoice(uuid) from public;
revoke all on function public.telecom_cost_summary(int) from public;
grant execute on function public.import_telecom_invoices(jsonb,text,text,text) to authenticated;
grant execute on function public.update_telecom_invoice(uuid,date,text,text,text) to authenticated;
grant execute on function public.delete_telecom_invoice(uuid) to authenticated;
grant execute on function public.telecom_cost_summary(int) to authenticated;
commit;
