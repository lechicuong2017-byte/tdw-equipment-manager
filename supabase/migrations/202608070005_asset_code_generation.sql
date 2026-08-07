begin;

create table if not exists public.asset_code_counters (
  prefix text not null,
  code_year smallint not null check (code_year between 1990 and 2100),
  last_sequence integer not null default 0 check (last_sequence >= 0),
  updated_at timestamptz not null default now(),
  primary key (prefix, code_year),
  check (prefix ~ '^[A-Z0-9]{2,8}$')
);

alter table public.asset_code_counters enable row level security;
revoke all on public.asset_code_counters from anon, authenticated;

create or replace function public.next_asset_code(
  target_prefix text,
  target_year integer
)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  normalized_prefix text := upper(btrim(coalesce(target_prefix, '')));
  code_pattern text;
  existing_max integer;
  next_sequence integer;
begin
  if auth.uid() is null or not public.has_permission('assets.manage') then
    raise insufficient_privilege using message = 'Asset management permission is required';
  end if;

  if normalized_prefix !~ '^[A-Z0-9]{2,8}$'
    or target_year is null
    or target_year not between 1990 and 2100
  then
    raise exception 'Invalid asset code prefix or year' using errcode = '22023';
  end if;

  code_pattern := '^TDW-' || normalized_prefix || '-' || target_year::text || '-([0-9]+)$';

  select coalesce(
    max(substring(upper(asset.asset_code) from code_pattern)::integer),
    0
  )
  into existing_max
  from public.assets asset
  where upper(asset.asset_code) ~ code_pattern;

  insert into public.asset_code_counters (
    prefix,
    code_year,
    last_sequence,
    updated_at
  )
  values (
    normalized_prefix,
    target_year,
    existing_max,
    now()
  )
  on conflict (prefix, code_year) do update
  set
    last_sequence = greatest(
      public.asset_code_counters.last_sequence,
      excluded.last_sequence
    ),
    updated_at = now();

  update public.asset_code_counters counter
  set
    last_sequence = counter.last_sequence + 1,
    updated_at = now()
  where counter.prefix = normalized_prefix
    and counter.code_year = target_year
  returning counter.last_sequence into next_sequence;

  return format(
    'TDW-%s-%s-%s',
    normalized_prefix,
    target_year,
    lpad(next_sequence::text, 3, '0')
  );
end;
$$;

revoke all on function public.next_asset_code(text, integer) from public;
grant execute on function public.next_asset_code(text, integer) to authenticated;

commit;
