begin;

alter table public.maintenance_plans
  add column if not exists batch_id uuid,
  add column if not exists scope_type text not null default 'ASSET',
  add column if not exists scope_value text not null default '',
  add column if not exists repeat_enabled boolean not null default true;

update public.maintenance_plans
set
  batch_id = coalesce(batch_id, id),
  scope_type = 'ASSET',
  scope_value = case
    when scope_value = '' then asset_id::text
    else scope_value
  end
where batch_id is null or scope_value = '';

alter table public.maintenance_plans
  alter column batch_id set not null,
  alter column batch_id set default gen_random_uuid();

alter table public.maintenance_plans
  drop constraint if exists maintenance_plans_scope_type_check;
alter table public.maintenance_plans
  add constraint maintenance_plans_scope_type_check
  check (scope_type in ('ASSET', 'GROUP', 'TYPE'));

create index if not exists maintenance_plans_batch_idx
  on public.maintenance_plans (batch_id, active, next_due_date);

create or replace function public.fill_maintenance_plan_scope_defaults()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  new.batch_id := coalesce(new.batch_id, gen_random_uuid());
  new.scope_type := upper(trim(coalesce(new.scope_type, 'ASSET')));
  if new.scope_type = 'ASSET' and trim(coalesce(new.scope_value, '')) = '' then
    new.scope_value := new.asset_id::text;
  else
    new.scope_value := trim(coalesce(new.scope_value, ''));
  end if;
  return new;
end;
$$;

drop trigger if exists maintenance_plans_fill_scope_defaults
  on public.maintenance_plans;
create trigger maintenance_plans_fill_scope_defaults
before insert or update of asset_id, batch_id, scope_type, scope_value
on public.maintenance_plans
for each row execute function public.fill_maintenance_plan_scope_defaults();

create or replace function public.create_maintenance_plan_batch(
  target_scope_type text,
  target_scope_value text,
  target_title text,
  target_frequency text,
  target_next_due_date date,
  target_note text default '',
  target_active boolean default true,
  target_repeat_enabled boolean default true
)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  normalized_scope_type text := upper(trim(coalesce(target_scope_type, '')));
  normalized_scope_value text := trim(coalesce(target_scope_value, ''));
  normalized_title text := trim(coalesce(target_title, ''));
  normalized_frequency text := upper(trim(coalesce(target_frequency, '')));
  normalized_note text := trim(coalesce(target_note, ''));
  selected_asset_ids uuid[];
  created_batch_id uuid := gen_random_uuid();
  created_count integer := 0;
begin
  if auth.uid() is null then
    raise exception 'Authentication required' using errcode = '42501';
  end if;
  if normalized_scope_type not in ('ASSET', 'GROUP', 'TYPE') then
    raise exception 'Invalid maintenance scope' using errcode = '22023';
  end if;
  if normalized_scope_value = '' or length(normalized_scope_value) > 160 then
    raise exception 'Maintenance scope is required' using errcode = '22023';
  end if;
  if normalized_title = '' or length(normalized_title) > 200 then
    raise exception 'Invalid maintenance title' using errcode = '22023';
  end if;
  if normalized_frequency not in ('MONTHLY', 'QUARTERLY', 'YEARLY') then
    raise exception 'Invalid maintenance frequency' using errcode = '22023';
  end if;
  if target_next_due_date is null then
    raise exception 'Maintenance due date is required' using errcode = '22023';
  end if;
  if length(normalized_note) > 3000 then
    raise exception 'Maintenance note is too long' using errcode = '22023';
  end if;

  select array_agg(a.id order by a.asset_code, a.id)
  into selected_asset_ids
  from public.assets a
  where a.deleted_at is null
    and public.can_access_asset(
      a.id,
      'maintenance',
      'maintenance.manage'
    )
    and case normalized_scope_type
      when 'ASSET' then a.id::text = normalized_scope_value
      when 'GROUP' then a.asset_group = normalized_scope_value
      when 'TYPE' then a.asset_type = normalized_scope_value
      else false
    end;

  if coalesce(cardinality(selected_asset_ids), 0) = 0 then
    raise exception 'No assets match the selected maintenance scope'
      using errcode = 'P0002';
  end if;
  if cardinality(selected_asset_ids) > 200 then
    raise exception 'A maintenance batch can contain at most 200 assets'
      using errcode = '54000';
  end if;
  insert into public.maintenance_plans (
    batch_id,
    scope_type,
    scope_value,
    asset_id,
    title,
    frequency,
    next_due_date,
    note,
    active,
    repeat_enabled,
    created_by
  )
  select
    created_batch_id,
    normalized_scope_type,
    normalized_scope_value,
    selected.asset_id,
    normalized_title,
    normalized_frequency,
    target_next_due_date,
    normalized_note,
    coalesce(target_active, true),
    coalesce(target_repeat_enabled, true),
    auth.uid()
  from unnest(selected_asset_ids) as selected(asset_id);

  get diagnostics created_count = row_count;
  return created_count;
end;
$$;

create or replace function public.update_maintenance_plan_schedule(
  target_plan_id uuid,
  target_title text,
  target_frequency text,
  target_next_due_date date,
  target_note text,
  target_active boolean,
  target_repeat_enabled boolean,
  target_apply_to_batch boolean default false
)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  normalized_title text := trim(coalesce(target_title, ''));
  normalized_frequency text := upper(trim(coalesce(target_frequency, '')));
  normalized_note text := trim(coalesce(target_note, ''));
  selected_batch_id uuid;
  selected_asset_id uuid;
  updated_count integer := 0;
begin
  if auth.uid() is null then
    raise exception 'Authentication required' using errcode = '42501';
  end if;
  if normalized_title = '' or length(normalized_title) > 200 then
    raise exception 'Invalid maintenance title' using errcode = '22023';
  end if;
  if normalized_frequency not in ('MONTHLY', 'QUARTERLY', 'YEARLY') then
    raise exception 'Invalid maintenance frequency' using errcode = '22023';
  end if;
  if target_next_due_date is null or length(normalized_note) > 3000 then
    raise exception 'Invalid maintenance schedule' using errcode = '22023';
  end if;

  select mp.batch_id, mp.asset_id
  into selected_batch_id, selected_asset_id
  from public.maintenance_plans mp
  where mp.id = target_plan_id
  for update;

  if not found then
    raise exception 'Maintenance plan not found' using errcode = 'P0002';
  end if;
  if not public.can_access_asset(
    selected_asset_id,
    'maintenance',
    'maintenance.manage'
  ) then
    raise exception 'Maintenance access denied' using errcode = '42501';
  end if;

  if coalesce(target_apply_to_batch, false) then
    perform mp.id
    from public.maintenance_plans mp
    where mp.batch_id = selected_batch_id
    for update;

    if exists (
      select 1
      from public.maintenance_plans mp
      where mp.batch_id = selected_batch_id
        and not public.can_access_asset(
          mp.asset_id,
          'maintenance',
          'maintenance.manage'
        )
    ) then
      raise exception 'Maintenance access denied for one or more batch assets'
        using errcode = '42501';
    end if;

    update public.maintenance_plans
    set
      title = normalized_title,
      frequency = normalized_frequency,
      next_due_date = target_next_due_date,
      note = normalized_note,
      active = coalesce(target_active, true),
      repeat_enabled = coalesce(target_repeat_enabled, true)
    where batch_id = selected_batch_id;
  else
    update public.maintenance_plans
    set
      title = normalized_title,
      frequency = normalized_frequency,
      next_due_date = target_next_due_date,
      note = normalized_note,
      active = coalesce(target_active, true),
      repeat_enabled = coalesce(target_repeat_enabled, true)
    where id = target_plan_id;
  end if;

  get diagnostics updated_count = row_count;
  return updated_count;
end;
$$;

create or replace function public.maintenance_add_months(
  anchor_date date,
  target_months integer
)
returns date
language sql
immutable
strict
set search_path = ''
as $$
  with target as (
    select (
      date_trunc('month', anchor_date)::date
      + make_interval(months => target_months)
    )::date as month_start
  )
  select (
    month_start
    + least(
      extract(day from anchor_date)::integer,
      extract(day from (month_start + interval '1 month - 1 day'))::integer
    )
    - 1
  )::date
  from target;
$$;

create or replace function public.advance_maintenance_plan_after_log()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  plan_asset_id uuid;
  plan_frequency text;
  plan_due_date date;
  plan_active boolean;
  plan_repeat_enabled boolean;
  month_step integer;
  elapsed_months integer;
  candidate_date date;
begin
  if new.plan_id is null then
    return new;
  end if;

  select
    mp.asset_id,
    mp.frequency,
    mp.next_due_date,
    mp.active,
    mp.repeat_enabled
  into
    plan_asset_id,
    plan_frequency,
    plan_due_date,
    plan_active,
    plan_repeat_enabled
  from public.maintenance_plans mp
  where mp.id = new.plan_id
  for update;

  if not found or plan_asset_id <> new.asset_id then
    raise exception 'Maintenance plan does not belong to the selected asset'
      using errcode = '23514';
  end if;
  if not plan_active then
    raise exception 'Maintenance plan is inactive' using errcode = '23514';
  end if;

  if not plan_repeat_enabled then
    update public.maintenance_plans
    set active = false
    where id = new.plan_id;
    return new;
  end if;

  month_step := case plan_frequency
    when 'MONTHLY' then 1
    when 'QUARTERLY' then 3
    when 'YEARLY' then 12
    else null
  end;
  if month_step is null then
    raise exception 'Invalid maintenance frequency' using errcode = '23514';
  end if;

  elapsed_months := month_step;
  candidate_date := public.maintenance_add_months(
    plan_due_date,
    elapsed_months
  );
  while candidate_date <= new.maintenance_date loop
    elapsed_months := elapsed_months + month_step;
    candidate_date := public.maintenance_add_months(
      plan_due_date,
      elapsed_months
    );
  end loop;

  update public.maintenance_plans
  set next_due_date = candidate_date
  where id = new.plan_id;

  return new;
end;
$$;

drop trigger if exists maintenance_logs_advance_plan
  on public.maintenance_logs;
create trigger maintenance_logs_advance_plan
after insert on public.maintenance_logs
for each row execute function public.advance_maintenance_plan_after_log();

revoke all on function public.create_maintenance_plan_batch(
  text, text, text, text, date, text, boolean, boolean
) from public, anon;
grant execute on function public.create_maintenance_plan_batch(
  text, text, text, text, date, text, boolean, boolean
) to authenticated;

revoke all on function public.update_maintenance_plan_schedule(
  uuid, text, text, date, text, boolean, boolean, boolean
) from public, anon;
grant execute on function public.update_maintenance_plan_schedule(
  uuid, text, text, date, text, boolean, boolean, boolean
) to authenticated;

revoke all on function public.maintenance_add_months(date, integer)
  from public, anon, authenticated;
revoke all on function public.fill_maintenance_plan_scope_defaults()
  from public, anon, authenticated;
revoke all on function public.advance_maintenance_plan_after_log()
  from public, anon, authenticated;

commit;
