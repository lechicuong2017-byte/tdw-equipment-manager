begin;

-- Extend deployed access definitions, preserving all existing modules and MFA.
alter table public.user_module_access drop constraint user_module_access_module_check;
alter table public.user_module_access add constraint user_module_access_module_check
  check(module in ('equipment','vehicles','supplies','telecom','surveys','it_costs'));
create or replace function public.permission_system_module(required_permission text)
returns text language sql immutable set search_path='' as $$
  select case
    when required_permission like 'it_costs.%' or required_permission like 'reports.it_costs.%' then 'it_costs'
    when required_permission like 'surveys.%' or required_permission like 'reports.surveys.%' then 'surveys'
    when required_permission like 'telecom.%' or required_permission like 'reports.telecom.%' then 'telecom'
    when required_permission like 'vehicles.%' or required_permission like 'reports.vehicles.%' then 'vehicles'
    when required_permission like 'supplies.%' or required_permission like 'reports.supplies.%' then 'supplies'
    else 'equipment' end;
$$;
do $$ declare signature text; definition text; extended text; begin
  foreach signature in array array['public.has_system_module(text)','public.get_my_access()', 'public.admin_set_user_access(uuid,text,boolean,boolean,jsonb,jsonb)'] loop
    definition:=pg_get_functiondef(signature::regprocedure);
    extended:=replace(replace(definition,
      '''equipment'', ''vehicles'', ''supplies'', ''telecom'', ''surveys''', '''equipment'', ''vehicles'', ''supplies'', ''telecom'', ''surveys'', ''it_costs'''),
      '["equipment", "vehicles", "supplies", "telecom", "surveys"]','["equipment", "vehicles", "supplies", "telecom", "surveys", "it_costs"]');
    if extended=definition then raise exception 'Cannot extend module allowlist: %',signature; end if;
    execute extended;
  end loop;
end $$;
insert into public.permissions(code,module,description) values
 ('it_costs.view','it_costs','Xem dịch vụ và chi phí CNTT'),('it_costs.manage','it_costs','Quản lý dịch vụ, gia hạn và chi phí CNTT'),
 ('it_costs.import','it_costs','Nhập chứng từ CNTT'),('it_costs.delete','it_costs','Hủy chi phí hoặc gỡ liên kết chứng từ CNTT'),
 ('it_costs.settings','it_costs','Cấu hình danh mục chi phí CNTT'),('reports.it_costs.export','reports','Xuất báo cáo chi phí CNTT') on conflict do nothing;
insert into public.role_permissions(role_id,permission_code)
select r.id,p.code from public.roles r cross join public.permissions p where p.code in
 ('it_costs.view','it_costs.manage','it_costs.import','it_costs.delete','it_costs.settings','reports.it_costs.export')
 and (r.code='admin' or (r.code='manager' and p.code not in ('it_costs.delete','it_costs.settings')) or (r.code in ('user','viewer') and p.code='it_costs.view')) on conflict do nothing;

create table public.it_cost_categories (
 id uuid primary key default gen_random_uuid(), code text unique not null check(length(code) between 1 and 60),
 name text not null check(length(trim(name)) between 1 and 150), sort_order integer not null default 0, active boolean not null default true,
 created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
insert into public.it_cost_categories(code,name,sort_order) values ('domain','Tên miền',1),('hosting','Hosting website',2),
 ('email','Email hosting/server',3),('ssl','SSL',4),('fiber','Internet cáp quang',5),('metronet','Metronet',6),('server','Máy chủ / VPS / Cloud',7),('other','Khác',8);
create table public.it_services (
 id uuid primary key default gen_random_uuid(), code text unique not null check(length(trim(code)) between 1 and 60),
 name text not null check(length(trim(name)) between 1 and 200), category_id uuid not null references public.it_cost_categories(id),
 identifier text not null default '' check(length(identifier)<=200), provider text not null default '' check(length(provider)<=200),
 location text not null default '' check(length(location)<=300), note text not null default '' check(length(note)<=2000),
 status text not null default 'active' check(status in ('active','paused','archived')), version integer not null default 1,
 created_by uuid default auth.uid() references public.profiles(id), updated_by uuid default auth.uid() references public.profiles(id),
 created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create table public.it_service_periods (
 id uuid primary key default gen_random_uuid(), service_id uuid not null references public.it_services(id),
 starts_on date not null, expires_on date not null, cycle text not null check(cycle in ('month','quarter','year','custom')),
 remind_days integer not null default 30 check(remind_days between 0 and 365), renewed_from_id uuid references public.it_service_periods(id),
 status text not null default 'active' check(status in ('active','superseded','cancelled')), note text not null default '' check(length(note)<=2000),
 version integer not null default 1, created_by uuid default auth.uid() references public.profiles(id), updated_by uuid default auth.uid() references public.profiles(id),
 created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
 check(expires_on>=starts_on and starts_on>='2000-01-01' and expires_on<='2100-12-31'), check(renewed_from_id is distinct from id)
);
create table public.it_cost_entries (
 id uuid primary key default gen_random_uuid(), request_id uuid unique not null, provider text not null check(length(trim(provider)) between 1 and 200),
 recognized_on date not null check(recognized_on between '2000-01-01' and '2100-12-31'), description text not null default '' check(length(description)<=2000),
 status text not null check(status in ('draft','confirmed','cancelled')), payment_status text not null check(payment_status in ('unconfirmed','unpaid','paid')),
 paid_on date, discrepancy_reason text not null default '' check(length(discrepancy_reason)<=1000), version integer not null default 1,
 created_by uuid default auth.uid() references public.profiles(id), updated_by uuid default auth.uid() references public.profiles(id),
 created_at timestamptz not null default now(), updated_at timestamptz not null default now(), check(payment_status<>'paid' or paid_on is not null)
);
create table public.it_documents (
 id uuid primary key, kind text not null check(kind in ('invoice','contract','quote','other')),
 provider text not null default '' check(length(provider)<=200), issuer_tax_code text not null default '' check(length(issuer_tax_code)<=20),
 number text not null default '' check(length(number)<=150), series text not null default '' check(length(series)<=50),
 issued_on date, reference text not null default '' check(length(reference)<=200), total_amount numeric(18,2) check(total_amount between 0 and 100000000000),
 hash text unique not null check(hash ~ '^[a-f0-9]{64}$'), storage_path text unique not null,
 name text not null check(length(name) between 1 and 200), mime text not null check(mime in ('application/pdf','application/vnd.openxmlformats-officedocument.wordprocessingml.document')),
 size integer not null check(size between 1 and 20971520), created_by uuid not null default auth.uid() references public.profiles(id), created_at timestamptz not null default now()
);
create unique index it_document_invoice_identity on public.it_documents(issuer_tax_code,upper(series),number)
 where kind='invoice' and issuer_tax_code<>'' and number<>'' and series<>'';
create table public.it_cost_entry_lines (
 id uuid primary key default gen_random_uuid(), entry_id uuid not null references public.it_cost_entries(id), category_id uuid not null references public.it_cost_categories(id),
 service_id uuid references public.it_services(id), period_id uuid references public.it_service_periods(id),
 description text not null check(length(trim(description)) between 1 and 2000), unit text not null default '' check(length(unit)<=50),
 quantity numeric not null default 1 check(quantity>0 and quantity<=100000), unit_price numeric(18,2) check(unit_price between 0 and 100000000000),
 amount_before_tax numeric(18,2) not null check(amount_before_tax between 0 and 100000000000),
 tax_amount numeric(18,2) not null check(tax_amount between 0 and 100000000000), amount_after_tax numeric(18,2) not null check(amount_after_tax between 0 and 100000000000),
 document_id uuid references public.it_documents(id), source_key text not null default '' check(length(source_key)<=150), source_ref text not null default '' check(length(source_ref)<=200),
 check(abs(amount_before_tax+tax_amount-amount_after_tax)<=1), check(document_id is null or source_key<>'')
);
create unique index it_cost_line_source on public.it_cost_entry_lines(document_id,source_key) where document_id is not null;
create table public.it_document_links (
 id uuid primary key default gen_random_uuid(), document_id uuid not null references public.it_documents(id),
 entry_id uuid references public.it_cost_entries(id), service_id uuid references public.it_services(id), period_id uuid references public.it_service_periods(id),
 created_by uuid default auth.uid() references public.profiles(id), created_at timestamptz not null default now(),
 check(num_nonnulls(entry_id,service_id,period_id)=1)
);
create unique index it_link_entry on public.it_document_links(document_id,entry_id) where entry_id is not null;
create unique index it_link_service on public.it_document_links(document_id,service_id) where service_id is not null;
create unique index it_link_period on public.it_document_links(document_id,period_id) where period_id is not null;
create index it_cost_dates on public.it_cost_entries(recognized_on desc,id);
create index it_cost_category on public.it_cost_entry_lines(category_id,entry_id);
create index it_cost_service on public.it_cost_entry_lines(service_id,entry_id);
create index it_period_dates on public.it_service_periods(expires_on,service_id,id);

do $$ declare t text; begin
 foreach t in array array['it_cost_categories','it_services','it_service_periods','it_cost_entries','it_cost_entry_lines','it_documents','it_document_links'] loop
  execute format('alter table public.%I enable row level security',t);
  execute format('revoke all on public.%I from anon,authenticated',t);
  execute format('grant select on public.%I to authenticated',t);
  execute format('create policy it_read on public.%I for select to authenticated using(public.has_permission(''it_costs.view''))',t);
  execute format('create trigger it_audit after insert or update or delete on public.%I for each row execute function public.write_audit_log()',t);
 end loop;
end $$;

-- A single RPC transaction covers each business save. No raw table writes granted.
create function public.save_it_entity(target_kind text,target_data jsonb) returns uuid
language plpgsql security definer set search_path='' as $$
declare result uuid; existing_version integer; s uuid; previous public.it_service_periods;
begin
 if auth.uid() is null or not public.has_permission('it_costs.manage') then raise exception 'IT_FORBIDDEN'; end if;
 result:=nullif(target_data->>'id','')::uuid;
 if target_kind='category' then
  if not public.has_permission('it_costs.settings') then raise exception 'IT_FORBIDDEN'; end if;
  if result is null then insert into public.it_cost_categories(code,name,sort_order,active) values(trim(target_data->>'code'),trim(target_data->>'name'),coalesce((target_data->>'sort_order')::int,0),coalesce((target_data->>'active')::boolean,true)) returning id into result;
  else update public.it_cost_categories set name=trim(target_data->>'name'),sort_order=(target_data->>'sort_order')::int,active=(target_data->>'active')::boolean,updated_at=now() where id=result; if not found then raise exception 'IT_NOT_FOUND'; end if; end if;
 elsif target_kind='service' then
  if result is not null then
   select version into existing_version from public.it_services where id=result for update;
   if not found or existing_version is distinct from (target_data->>'version')::int then raise exception 'IT_STALE'; end if;
   update public.it_services set code=trim(target_data->>'code'),name=trim(target_data->>'name'),category_id=(target_data->>'category_id')::uuid,
    identifier=target_data->>'identifier',provider=target_data->>'provider',location=target_data->>'location',note=target_data->>'note',status=target_data->>'status',version=version+1,updated_at=now(),updated_by=auth.uid() where id=result;
  else
   insert into public.it_services(code,name,category_id,identifier,provider,location,note,status) values(trim(target_data->>'code'),trim(target_data->>'name'),(target_data->>'category_id')::uuid,target_data->>'identifier',target_data->>'provider',target_data->>'location',target_data->>'note',target_data->>'status') returning id into result;
  end if;
 elsif target_kind='period' then
  s:=(target_data->>'service_id')::uuid;
  perform 1 from public.it_services where id=s for update;
  if not found then raise exception 'IT_NOT_FOUND'; end if;
  if nullif(target_data->>'renewed_from_id','') is not null then
   select * into previous from public.it_service_periods where id=(target_data->>'renewed_from_id')::uuid;
   if not found or previous.service_id<>s then raise exception 'IT_INVALID_PERIOD'; end if;
  end if;
  if exists(select 1 from public.it_service_periods where service_id=s and status='active' and id is distinct from result
   and starts_on<=(target_data->>'expires_on')::date and expires_on>=(target_data->>'starts_on')::date)
   and not coalesce((target_data->>'allow_overlap')::boolean,false) then raise exception 'IT_OVERLAP'; end if;
  if result is not null then
   select version into existing_version from public.it_service_periods where id=result for update;
   if not found or existing_version is distinct from (target_data->>'version')::int then raise exception 'IT_STALE'; end if;
   update public.it_service_periods set starts_on=(target_data->>'starts_on')::date,expires_on=(target_data->>'expires_on')::date,cycle=target_data->>'cycle',remind_days=(target_data->>'remind_days')::int,status=target_data->>'status',note=target_data->>'note',version=version+1,updated_at=now(),updated_by=auth.uid() where id=result and service_id=s;
   if not found then raise exception 'IT_INVALID_PERIOD'; end if;
  else
   insert into public.it_service_periods(service_id,starts_on,expires_on,cycle,remind_days,renewed_from_id,status,note)
    values(s,(target_data->>'starts_on')::date,(target_data->>'expires_on')::date,target_data->>'cycle',(target_data->>'remind_days')::int,nullif(target_data->>'renewed_from_id','')::uuid,target_data->>'status',target_data->>'note') returning id into result;
  end if;
 else raise exception 'IT_INVALID_KIND'; end if;
 return result;
end $$;

create function public.save_it_cost_entry(target_data jsonb) returns uuid
language plpgsql security definer set search_path='' as $$
declare result uuid; old public.it_cost_entries; item jsonb; d uuid; source text; line_id uuid; total numeric; source_total numeric; s uuid; p uuid; prior uuid;
begin
 if auth.uid() is null or not public.has_permission('it_costs.manage') then raise exception 'IT_FORBIDDEN'; end if;
 if jsonb_typeof(target_data->'lines') is distinct from 'array' or jsonb_array_length(target_data->'lines') not between 1 and 200 then raise exception 'IT_INVALID_LINES'; end if;
 if target_data->>'status'='cancelled' and not public.has_permission('it_costs.delete') then raise exception 'IT_FORBIDDEN'; end if;
 result:=nullif(target_data->>'id','')::uuid; d:=nullif(target_data->>'document_id','')::uuid;
 if d is not null then
  if not public.has_permission('it_costs.import') then raise exception 'IT_FORBIDDEN'; end if;
  select total_amount into source_total from public.it_documents where id=d for update;
  if not found then raise exception 'IT_NOT_FOUND'; end if;
 end if;
 perform pg_advisory_xact_lock(hashtextextended(target_data->>'request_id',0));
 if result is null then
  select id into result from public.it_cost_entries where request_id=(target_data->>'request_id')::uuid;
  if found then return result; end if;
  insert into public.it_cost_entries(request_id,provider,recognized_on,description,status,payment_status,paid_on,discrepancy_reason)
   values((target_data->>'request_id')::uuid,trim(target_data->>'provider'),(target_data->>'recognized_on')::date,target_data->>'description',target_data->>'status',target_data->>'payment_status',case when target_data->>'payment_status'='paid' then nullif(target_data->>'paid_on','')::date end,coalesce(target_data->>'discrepancy_reason','')) returning id into result;
 else
  select * into old from public.it_cost_entries where id=result for update;
  if not found or old.version is distinct from (target_data->>'version')::int then raise exception 'IT_STALE'; end if;
  if (old.status='cancelled' or target_data->>'status'='cancelled') and not public.has_permission('it_costs.delete') then raise exception 'IT_FORBIDDEN'; end if;
  update public.it_cost_entries set provider=trim(target_data->>'provider'),recognized_on=(target_data->>'recognized_on')::date,description=target_data->>'description',status=target_data->>'status',payment_status=target_data->>'payment_status',paid_on=case when target_data->>'payment_status'='paid' then nullif(target_data->>'paid_on','')::date end,
   discrepancy_reason=coalesce(target_data->>'discrepancy_reason',''),version=version+1,updated_at=now(),updated_by=auth.uid() where id=result;
  -- Existing rows are edited explicitly; imports never upsert by page/row number.
  delete from public.it_cost_entry_lines where entry_id=result and id not in (select nullif(value->>'id','')::uuid from jsonb_array_elements(target_data->'lines') where nullif(value->>'id','') is not null);
 end if;
 for item in select value from jsonb_array_elements(target_data->'lines') loop
  line_id:=nullif(item->>'id','')::uuid; source:=coalesce(item->>'source_key','');
  s:=nullif(item->>'service_id','')::uuid;p:=nullif(item->>'period_id','')::uuid;
  if line_id is null then
   if d is not null and exists(select 1 from public.it_cost_entry_lines where document_id=d and source_key=source) then raise exception 'IT_DUPLICATE_LINE'; end if;
   if s is null and length(trim(coalesce(item->>'new_service_name','')))>0 then
    s:=gen_random_uuid();insert into public.it_services(id,code,name,category_id,identifier,provider)values(s,'IT-'||substr(s::text,1,18),trim(item->>'new_service_name'),(item->>'category_id')::uuid,coalesce(item->>'new_identifier',''),target_data->>'provider');
   end if;
   if nullif(item->>'starts_on','') is not null or nullif(item->>'expires_on','') is not null then
    if s is null or p is not null or nullif(item->>'starts_on','') is null or nullif(item->>'expires_on','') is null then raise exception 'IT_INVALID_PERIOD'; end if;
    perform 1 from public.it_services where id=s for update;
    if exists(select 1 from public.it_service_periods where service_id=s and status='active' and starts_on<=(item->>'expires_on')::date and expires_on>=(item->>'starts_on')::date)
     and not coalesce((item->>'allow_overlap')::boolean,false) then raise exception 'IT_OVERLAP'; end if;
    select id into prior from public.it_service_periods where service_id=s and expires_on<(item->>'starts_on')::date order by expires_on desc,id limit 1;
    insert into public.it_service_periods(service_id,starts_on,expires_on,cycle,renewed_from_id)
     values(s,(item->>'starts_on')::date,(item->>'expires_on')::date,'custom',prior) returning id into p;
    if d is not null then insert into public.it_document_links(document_id,period_id)values(d,p) on conflict do nothing;end if;
   end if;
  end if;
  if nullif(item->>'period_id','') is not null and not exists(select 1 from public.it_service_periods where id=(item->>'period_id')::uuid and service_id=nullif(item->>'service_id','')::uuid) then raise exception 'IT_INVALID_PERIOD'; end if;
  if d is not null and source='' then raise exception 'IT_INVALID_SOURCE'; end if;
  if line_id is not null then
   update public.it_cost_entry_lines set category_id=(item->>'category_id')::uuid,service_id=nullif(item->>'service_id','')::uuid,period_id=nullif(item->>'period_id','')::uuid,
    description=trim(item->>'description'),unit=coalesce(item->>'unit',''),quantity=(item->>'quantity')::numeric,unit_price=(item->>'unit_price')::numeric,
    amount_before_tax=(item->>'amount_before_tax')::numeric,tax_amount=(item->>'tax_amount')::numeric,amount_after_tax=(item->>'amount_after_tax')::numeric where id=line_id and entry_id=result;
   if not found then raise exception 'IT_INVALID_LINE'; end if;
  else
   if d is not null and exists(select 1 from public.it_cost_entry_lines where document_id=d and source_key=source) then raise exception 'IT_DUPLICATE_LINE'; end if;
   insert into public.it_cost_entry_lines(entry_id,category_id,service_id,period_id,description,unit,quantity,unit_price,amount_before_tax,tax_amount,amount_after_tax,document_id,source_key,source_ref)
    values(result,(item->>'category_id')::uuid,s,p,trim(item->>'description'),coalesce(item->>'unit',''),(item->>'quantity')::numeric,(item->>'unit_price')::numeric,(item->>'amount_before_tax')::numeric,(item->>'tax_amount')::numeric,(item->>'amount_after_tax')::numeric,d,source,coalesce(item->>'source_ref',''));
  end if;
 end loop;
 if d is not null then
  select sum(amount_after_tax) into total from public.it_cost_entry_lines where document_id=d;
  if source_total is not null and total>source_total+1 and length(trim(coalesce(target_data->>'discrepancy_reason','')))=0 then raise exception 'IT_TOTAL_MISMATCH'; end if;
  insert into public.it_document_links(document_id,entry_id) values(d,result) on conflict do nothing;
 end if;
 return result;
end $$;

create function public.register_it_document(target_data jsonb) returns uuid
language plpgsql security definer set search_path='' as $$
declare result uuid; expected_path text;
begin
 if auth.uid() is null or not public.has_permission('it_costs.import') then raise exception 'IT_FORBIDDEN'; end if;
 perform pg_advisory_xact_lock(hashtextextended(target_data->>'hash',0));
 select id into result from public.it_documents where hash=target_data->>'hash'; if found then return result; end if;
 result:=(target_data->>'id')::uuid;
 expected_path:=auth.uid()::text||'/'||result::text||case when target_data->>'mime'='application/pdf' then '.pdf' else '.docx' end;
 if not exists(select 1 from storage.objects where bucket_id='it-cost-documents' and name=expected_path) then raise exception 'IT_FILE_MISSING'; end if;
 insert into public.it_documents(id,kind,provider,issuer_tax_code,number,series,issued_on,reference,total_amount,hash,storage_path,name,mime,size)
 values(result,target_data->>'kind',trim(target_data->>'provider'),trim(target_data->>'issuer_tax_code'),trim(target_data->>'number'),upper(trim(target_data->>'series')),nullif(target_data->>'issued_on','')::date,trim(target_data->>'reference'),(target_data->>'total_amount')::numeric,target_data->>'hash',expected_path,target_data->>'name',target_data->>'mime',(target_data->>'size')::int);
 return result;
end $$;
create function public.link_it_document(target_document uuid,target_kind text,target_id uuid,target_remove boolean default false) returns void
language plpgsql security definer set search_path='' as $$
begin
 if auth.uid() is null or not public.has_permission('it_costs.import') or (target_remove and not public.has_permission('it_costs.delete')) then raise exception 'IT_FORBIDDEN'; end if;
 if target_kind='entry' then
  if target_remove then delete from public.it_document_links where document_id=target_document and entry_id=target_id;
  else insert into public.it_document_links(document_id,entry_id) values(target_document,target_id) on conflict do nothing; end if;
 elsif target_kind='service' then
  if target_remove then delete from public.it_document_links where document_id=target_document and service_id=target_id;
  else insert into public.it_document_links(document_id,service_id) values(target_document,target_id) on conflict do nothing; end if;
 elsif target_kind='period' then
  if target_remove then delete from public.it_document_links where document_id=target_document and period_id=target_id;
  else insert into public.it_document_links(document_id,period_id) values(target_document,target_id) on conflict do nothing; end if;
 else raise exception 'IT_INVALID_KIND'; end if;
end $$;

-- One filtered relation is shared by paging, SQL aggregates and full exports.
create function public.it_filtered_costs(target_filter jsonb) returns table
 (line_id uuid,entry_id uuid,recognized_on date,provider text,payment_status text,paid_on date,category_id uuid,category_name text,service_id uuid,service_name text,
 description text,amount_before_tax numeric,tax_amount numeric,amount_after_tax numeric,entry_version integer)
language sql stable security invoker set search_path='' as $$
 select l.id,e.id,e.recognized_on,e.provider,e.payment_status,e.paid_on,l.category_id,c.name,l.service_id,s.name,l.description,l.amount_before_tax,l.tax_amount,l.amount_after_tax,e.version
 from public.it_cost_entry_lines l join public.it_cost_entries e on e.id=l.entry_id join public.it_cost_categories c on c.id=l.category_id left join public.it_services s on s.id=l.service_id
 where public.has_permission('it_costs.view') and e.status='confirmed'
 and (coalesce(target_filter->>'year','')='' or extract(year from e.recognized_on)::text=target_filter->>'year')
 and (coalesce(target_filter->>'month','')='' or extract(month from e.recognized_on)::text=target_filter->>'month')
 and (coalesce(target_filter->>'category','')='' or l.category_id=nullif(target_filter->>'category','')::uuid)
 and (coalesce(target_filter->>'service','')='' or l.service_id=nullif(target_filter->>'service','')::uuid)
 and (coalesce(target_filter->>'provider','')='' or e.provider ilike '%'||(target_filter->>'provider')||'%')
 and (coalesce(target_filter->>'payment','')='' or e.payment_status=target_filter->>'payment')
 and (coalesce(target_filter->>'q','')='' or concat_ws(' ',e.description,l.description,s.name,s.identifier) ilike '%'||(target_filter->>'q')||'%');
$$;
create function public.it_cost_summary(target_filter jsonb) returns jsonb
language sql stable security invoker set search_path='' as $$
 with lines as (select * from public.it_filtered_costs(target_filter)), groups as
 (select category_id,category_name,extract(month from recognized_on)::int as month,sum(amount_after_tax) as amount from lines group by 1,2,3)
 select jsonb_build_object('total',coalesce((select sum(amount_after_tax) from lines),0),'count',(select count(*) from lines),
 'unpaid',coalesce((select sum(amount_after_tax) from lines where payment_status<>'paid'),0),'groups',coalesce((select jsonb_agg(to_jsonb(g)) from groups g),'[]'::jsonb));
$$;
revoke all on function public.save_it_entity(text,jsonb),public.save_it_cost_entry(jsonb),public.register_it_document(jsonb),public.link_it_document(uuid,text,uuid,boolean),public.it_filtered_costs(jsonb),public.it_cost_summary(jsonb) from public,anon,authenticated;
grant execute on function public.save_it_entity(text,jsonb),public.save_it_cost_entry(jsonb),public.register_it_document(jsonb),public.link_it_document(uuid,text,uuid,boolean),public.it_filtered_costs(jsonb),public.it_cost_summary(jsonb) to authenticated;

insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types) values('it-cost-documents','it-cost-documents',false,20971520,array['application/pdf','application/vnd.openxmlformats-officedocument.wordprocessingml.document']) on conflict(id) do nothing;
create policy it_storage_upload on storage.objects for insert to authenticated with check(bucket_id='it-cost-documents' and public.has_permission('it_costs.import') and (storage.foldername(name))[1]=auth.uid()::text);
create policy it_storage_read on storage.objects for select to authenticated using(bucket_id='it-cost-documents' and
 ((public.has_permission('it_costs.view') and exists(select 1 from public.it_documents where storage_path=name))
 or (public.has_permission('it_costs.import') and (storage.foldername(name))[1]=auth.uid()::text)));
-- Only unregistered staging uploads can be deleted directly; linked files stay safe.
create policy it_storage_staging_delete on storage.objects for delete to authenticated using(bucket_id='it-cost-documents' and public.has_permission('it_costs.import') and (storage.foldername(name))[1]=auth.uid()::text and not exists(select 1 from public.it_documents where storage_path=name));
commit;
