begin;

create or replace function public.get_supply_overview_stats()
returns jsonb
language sql
stable
security invoker
set search_path = ''
as $$
  with reporting_period as (
    select
      extract(year from timezone('Asia/Ho_Chi_Minh', now()))::integer as report_year,
      extract(quarter from timezone('Asia/Ho_Chi_Minh', now()))::integer as report_quarter
  ),
  visible_requests as (
    select request.id, request.period_type, request.period_year, request.period_quarter
    from public.supply_requests request
    where request.deleted_at is null
  ),
  current_year_requests as (
    select request.*
    from visible_requests request
    cross join reporting_period period
    where request.period_year = period.report_year
  ),
  current_year_lines as (
    select line.amount
    from public.supply_request_lines line
    join current_year_requests request on request.id = line.request_id
  )
  select jsonb_build_object(
    'current_request_count', (
      select count(*)
      from current_year_requests request
      cross join reporting_period period
      where request.period_type <> 'QUARTER'
        or request.period_quarter = period.report_quarter
    ),
    'current_year_line_count', (select count(*) from current_year_lines),
    'current_year_spend', coalesce((select sum(amount) from current_year_lines), 0),
    'quote_count', (
      select count(*) from public.supply_quotes quote where quote.deleted_at is null
    ),
    'quote_line_count', (
      select count(*)
      from public.supply_quote_lines line
      join public.supply_quotes quote on quote.id = line.quote_id
      where quote.deleted_at is null
    )
  );
$$;

revoke all on function public.get_supply_overview_stats() from public;
grant execute on function public.get_supply_overview_stats() to authenticated;

create index if not exists supply_requests_requested_idx
  on public.supply_requests (requested_on desc)
  where deleted_at is null;

create index if not exists supply_quotes_date_idx
  on public.supply_quotes (quote_date desc nulls last)
  where deleted_at is null;

commit;
