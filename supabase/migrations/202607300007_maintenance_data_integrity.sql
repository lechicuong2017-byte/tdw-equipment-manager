begin;

create or replace function public.validate_maintenance_log_plan()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if new.plan_id is not null
    and not exists (
      select 1
      from public.maintenance_plans mp
      where mp.id = new.plan_id
        and mp.asset_id = new.asset_id
    )
  then
    raise exception 'Maintenance plan does not belong to the selected asset'
      using errcode = '23514';
  end if;

  return new;
end;
$$;

drop trigger if exists maintenance_logs_validate_plan
  on public.maintenance_logs;
create trigger maintenance_logs_validate_plan
before insert or update of asset_id, plan_id on public.maintenance_logs
for each row execute function public.validate_maintenance_log_plan();

create or replace function public.refresh_asset_last_maintenance_date()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  previous_asset_id uuid;
  current_asset_id uuid;
begin
  previous_asset_id := case when tg_op <> 'INSERT' then old.asset_id end;
  current_asset_id := case when tg_op <> 'DELETE' then new.asset_id end;

  if previous_asset_id is not null
    and previous_asset_id is distinct from current_asset_id
  then
    update public.assets a
    set
      last_maintenance_date = (
        select max(ml.maintenance_date)
        from public.maintenance_logs ml
        where ml.asset_id = previous_asset_id
      ),
      updated_by = auth.uid()
    where a.id = previous_asset_id;
  end if;

  if current_asset_id is not null then
    update public.assets a
    set
      last_maintenance_date = (
        select max(ml.maintenance_date)
        from public.maintenance_logs ml
        where ml.asset_id = current_asset_id
      ),
      updated_by = auth.uid()
    where a.id = current_asset_id;
  end if;

  if tg_op = 'DELETE' then
    return old;
  end if;
  return new;
end;
$$;

revoke all on function public.refresh_asset_last_maintenance_date()
  from public, anon, authenticated;

drop trigger if exists maintenance_logs_refresh_asset_date
  on public.maintenance_logs;
create trigger maintenance_logs_refresh_asset_date
after insert or update or delete
on public.maintenance_logs
for each row execute function public.refresh_asset_last_maintenance_date();

commit;
