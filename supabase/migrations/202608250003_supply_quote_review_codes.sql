-- Two-step supplier quote import, mixed categories and stable item codes.

alter table public.supply_quotes drop constraint if exists supply_quotes_category_check;
alter table public.supply_quotes
  add constraint supply_quotes_category_check
  check (category in ('OFFICE_SUPPLY', 'CLEANING_SUPPLY', 'MIXED'));

alter table public.supply_quote_lines add column if not exists category text;
alter table public.supply_quote_lines add column if not exists item_code text not null default '';
alter table public.supply_request_lines add column if not exists item_code text not null default '';

update public.supply_quote_lines line
set category = quote.category
from public.supply_quotes quote
where quote.id = line.quote_id
  and line.category is null
  and quote.category in ('OFFICE_SUPPLY', 'CLEANING_SUPPLY');

update public.supply_quote_lines
set category = 'OFFICE_SUPPLY'
where category is null;

alter table public.supply_quote_lines alter column category set not null;
alter table public.supply_quote_lines drop constraint if exists supply_quote_lines_category_check;
alter table public.supply_quote_lines
  add constraint supply_quote_lines_category_check
  check (category in ('OFFICE_SUPPLY', 'CLEANING_SUPPLY'));

-- Clear legacy duplicate codes before enforcing uniqueness.
with ranked as (
  select id, row_number() over (
    partition by upper(trim(item_code))
    order by created_at, id
  ) as duplicate_rank
  from public.supply_items
  where trim(coalesce(item_code, '')) <> '' and deleted_at is null
)
update public.supply_items item
set item_code = '', updated_at = now()
from ranked
where item.id = ranked.id and ranked.duplicate_rank > 1;

-- Backfill codes for every legacy catalog item that does not have one.
with existing_max as (
  select
    category,
    extract(year from created_at)::integer as code_year,
    coalesce(max(
      case
        when item_code ~ '^TDW-(VPP|DVS)-[0-9]{4}-[0-9]+$'
          then (regexp_match(item_code, '([0-9]+)$'))[1]::integer
        else 0
      end
    ), 0) as max_sequence
  from public.supply_items
  group by category, extract(year from created_at)::integer
), missing as (
  select
    item.id,
    item.category,
    extract(year from item.created_at)::integer as code_year,
    row_number() over (
      partition by item.category, extract(year from item.created_at)::integer
      order by item.created_at, item.id
    ) as row_sequence
  from public.supply_items item
  where trim(coalesce(item.item_code, '')) = ''
), assigned as (
  select
    missing.id,
    'TDW-' || case when missing.category = 'OFFICE_SUPPLY' then 'VPP' else 'DVS' end || '-' ||
    missing.code_year || '-' ||
    lpad((coalesce(existing_max.max_sequence, 0) + missing.row_sequence)::text, 3, '0') as generated_code
  from missing
  left join existing_max
    on existing_max.category = missing.category
   and existing_max.code_year = missing.code_year
)
update public.supply_items item
set item_code = assigned.generated_code, updated_at = now()
from assigned
where item.id = assigned.id;

create unique index if not exists supply_items_item_code_active_idx
  on public.supply_items (upper(item_code))
  where trim(item_code) <> '' and deleted_at is null;

-- Link legacy quote lines to existing catalog items when category and name match.
with candidates as (
  select
    line.id as line_id,
    min(item.id::text)::uuid as item_id,
    count(*) as match_count
  from public.supply_quote_lines line
  join public.supply_items item
    on item.category = line.category
   and upper(regexp_replace(trim(item.item_name), '\s+', ' ', 'g')) =
       upper(regexp_replace(trim(line.item_name), '\s+', ' ', 'g'))
   and item.deleted_at is null
  where line.item_id is null
  group by line.id
)
update public.supply_quote_lines line
set item_id = candidates.item_id, updated_at = now()
from candidates
where line.id = candidates.line_id and candidates.match_count = 1;

update public.supply_quote_lines line
set item_code = item.item_code, updated_at = now()
from public.supply_items item
where item.id = line.item_id and trim(line.item_code) = '';

-- Keep a stable code snapshot on historical request/order lines as well.
update public.supply_request_lines line
set item_code = item.item_code, updated_at = now()
from public.supply_items item
where item.id = line.item_id and trim(line.item_code) = '';

-- Repair supplier names copied repeatedly by merged Excel cells, then repair item descriptions.
do $$
declare
  current_quote record;
  words text[];
  word_count integer;
  phrase_size integer;
  word_index integer;
  is_repeated boolean;
  cleaned text;
begin
  for current_quote in
    select id, vendor_name from public.supply_quotes where deleted_at is null
  loop
    words := regexp_split_to_array(regexp_replace(trim(current_quote.vendor_name), '\s+', ' ', 'g'), ' ');
    word_count := coalesce(array_length(words, 1), 0);
    cleaned := current_quote.vendor_name;
    if word_count >= 2 then
      for phrase_size in 1..floor(word_count / 2.0)::integer loop
        if mod(word_count, phrase_size) <> 0 then continue; end if;
        is_repeated := true;
        for word_index in 1..word_count loop
          if upper(words[word_index]) <> upper(words[((word_index - 1) % phrase_size) + 1]) then
            is_repeated := false;
            exit;
          end if;
        end loop;
        if is_repeated then
          cleaned := array_to_string(words[1:phrase_size], ' ');
          exit;
        end if;
      end loop;
    end if;
    if cleaned <> current_quote.vendor_name then
      update public.supply_quotes set vendor_name = cleaned, updated_at = now() where id = current_quote.id;
    end if;
  end loop;
end $$;

with source_vendor as (
  select distinct on (line.item_id)
    line.item_id,
    quote.vendor_name
  from public.supply_quote_lines line
  join public.supply_quotes quote on quote.id = line.quote_id
  where line.item_id is not null and quote.deleted_at is null
  order by line.item_id, quote.created_at
)
update public.supply_items item
set description = 'Tạo từ báo giá ' || source_vendor.vendor_name,
    updated_at = now()
from source_vendor
where item.id = source_vendor.item_id
  and item.description ~* '^Tạo từ báo giá\s+';
