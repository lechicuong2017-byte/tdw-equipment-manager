-- Automatically move assets out of "Mới 100%" after they are more than one year old.
-- Exact purchase dates take precedence. Legacy rows that only have a purchase year
-- use 31 December of that year so they are never downgraded prematurely.

create or replace function public.asset_effective_purchase_date(
  target_purchase_date date,
  target_purchase_year smallint
)
returns date
language sql
immutable
set search_path = ''
as $$
  select coalesce(
    target_purchase_date,
    case
      when target_purchase_year between 1900 and 2100
        then make_date(target_purchase_year::integer, 12, 31)
      else null
    end
  );
$$;

create or replace function public.vietnam_current_date()
returns date
language sql
stable
set search_path = ''
as $$
  select (now() at time zone 'Asia/Ho_Chi_Minh')::date;
$$;

create or replace function public.apply_asset_age_status()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.deleted_at is null
    and new.status = 'MOI_100'
    and public.asset_effective_purchase_date(
      new.purchase_date,
      new.purchase_year
    ) < (public.vietnam_current_date() - interval '1 year')::date
  then
    new.status := 'CON_SU_DUNG';
  end if;

  return new;
end;
$$;

drop trigger if exists assets_apply_age_status on public.assets;
create trigger assets_apply_age_status
before insert or update of status, purchase_date, purchase_year, deleted_at
on public.assets
for each row execute function public.apply_asset_age_status();

create or replace function public.refresh_asset_age_statuses(
  reference_date date default public.vietnam_current_date()
)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  updated_count integer;
begin
  if reference_date is null then
    raise exception 'reference_date must not be null';
  end if;

  update public.assets
  set status = 'CON_SU_DUNG'
  where deleted_at is null
    and status = 'MOI_100'
    and public.asset_effective_purchase_date(
      purchase_date,
      purchase_year
    ) < (reference_date - interval '1 year')::date;

  get diagnostics updated_count = row_count;
  return updated_count;
end;
$$;

revoke all on function public.refresh_asset_age_statuses(date) from public;
revoke all on function public.refresh_asset_age_statuses(date) from anon;
revoke all on function public.refresh_asset_age_statuses(date) from authenticated;
grant execute on function public.refresh_asset_age_statuses(date) to service_role;

-- Preserve the last human editor when a trusted background job performs an update.
create or replace function public.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = now();
  if to_jsonb(new) ? 'updated_by' and auth.uid() is not null then
    new.updated_by = auth.uid();
  end if;
  return new;
end;
$$;

create extension if not exists pg_cron;

do $$
declare
  existing_job_id bigint;
begin
  select jobid
    into existing_job_id
  from cron.job
  where jobname = 'tdw-refresh-asset-age-statuses'
  limit 1;

  if existing_job_id is not null then
    perform cron.unschedule(existing_job_id);
  end if;

  perform cron.schedule(
    'tdw-refresh-asset-age-statuses',
    '5 17 * * *',
    'select public.refresh_asset_age_statuses();'
  );
end;
$$;

-- Normalize existing data immediately; the scheduled job handles future anniversaries.
select public.refresh_asset_age_statuses();
