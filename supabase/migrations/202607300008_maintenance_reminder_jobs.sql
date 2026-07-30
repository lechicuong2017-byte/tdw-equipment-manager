begin;

create or replace function public.admin_set_asset_responsibles(
  target_asset_id uuid,
  target_primary_user_id uuid default null,
  target_secondary_user_ids uuid[] default '{}'::uuid[]
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  selected_user_ids uuid[];
begin
  if not public.is_admin() then
    raise exception 'Administrator AAL2 is required' using errcode = '42501';
  end if;

  if not exists (
    select 1
    from public.assets a
    where a.id = target_asset_id
      and a.deleted_at is null
  ) then
    raise exception 'Asset not found' using errcode = 'P0002';
  end if;

  selected_user_ids := array_remove(
    array_append(coalesce(target_secondary_user_ids, '{}'::uuid[]), target_primary_user_id),
    null
  );

  if exists (
    select 1
    from unnest(selected_user_ids) selected(user_id)
    left join public.profiles p on p.id = selected.user_id
    where p.id is null
      or not p.active
      or position('@' in p.email) <= 1
  ) then
    raise exception 'Responsible users must be active and have valid email'
      using errcode = '23514';
  end if;

  delete from public.asset_responsibles
  where asset_id = target_asset_id;

  if target_primary_user_id is not null then
    insert into public.asset_responsibles (
      asset_id,
      user_id,
      responsibility_role,
      active
    )
    values (
      target_asset_id,
      target_primary_user_id,
      'primary',
      true
    );
  end if;

  insert into public.asset_responsibles (
    asset_id,
    user_id,
    responsibility_role,
    active
  )
  select
    target_asset_id,
    selected.user_id,
    'secondary',
    true
  from (
    select distinct user_id
    from unnest(coalesce(target_secondary_user_ids, '{}'::uuid[])) value(user_id)
    where user_id is not null
      and user_id is distinct from target_primary_user_id
  ) selected;
end;
$$;

revoke all on function public.admin_set_asset_responsibles(
  uuid, uuid, uuid[]
) from public, anon;
grant execute on function public.admin_set_asset_responsibles(
  uuid, uuid, uuid[]
) to authenticated;

create or replace function public.claim_maintenance_notifications(
  target_candidates jsonb
)
returns table (
  notification_id uuid,
  plan_id uuid,
  asset_id uuid,
  recipient_email text,
  notification_type text,
  due_date date
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  candidate record;
  claimed_id uuid;
  normalized_email text;
begin
  if jsonb_typeof(target_candidates) <> 'array'
    or jsonb_array_length(target_candidates) > 500
  then
    raise exception 'Candidates must be an array of at most 500 items'
      using errcode = '22023';
  end if;

  for candidate in
    select *
    from jsonb_to_recordset(target_candidates) as item(
      plan_id uuid,
      asset_id uuid,
      recipient_email text,
      notification_type text,
      due_date date
    )
  loop
    claimed_id := null;
    normalized_email := lower(trim(coalesce(candidate.recipient_email, '')));

    if normalized_email !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$'
      or length(normalized_email) > 320
      or coalesce(candidate.notification_type, '') !~ '^(DUE_(7|3|1|0)|OVERDUE_[0-9]+)$'
    then
      continue;
    end if;

    if not exists (
      select 1
      from public.maintenance_plans mp
      join public.assets a on a.id = mp.asset_id
      where mp.id = candidate.plan_id
        and mp.asset_id = candidate.asset_id
        and mp.next_due_date = candidate.due_date
        and mp.active
        and a.deleted_at is null
    ) then
      continue;
    end if;

    insert into public.maintenance_notification_logs (
      plan_id,
      asset_id,
      recipient_email,
      notification_type,
      due_date,
      status,
      error
    )
    values (
      candidate.plan_id,
      candidate.asset_id,
      normalized_email,
      candidate.notification_type,
      candidate.due_date,
      'PROCESSING',
      ''
    )
    on conflict (
      plan_id,
      recipient_email,
      notification_type,
      due_date
    ) do nothing
    returning id into claimed_id;

    if claimed_id is null then
      update public.maintenance_notification_logs nl
      set
        status = 'PROCESSING',
        error = '',
        sent_at = null
      where nl.plan_id = candidate.plan_id
        and nl.recipient_email = normalized_email
        and nl.notification_type = candidate.notification_type
        and nl.due_date = candidate.due_date
        and nl.status = 'FAILED'
      returning nl.id into claimed_id;
    end if;

    if claimed_id is not null then
      notification_id := claimed_id;
      plan_id := candidate.plan_id;
      asset_id := candidate.asset_id;
      recipient_email := normalized_email;
      notification_type := candidate.notification_type;
      due_date := candidate.due_date;
      return next;
    end if;
  end loop;
end;
$$;

create or replace function public.finish_maintenance_notifications(
  target_results jsonb
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  result_item record;
  normalized_status text;
begin
  if jsonb_typeof(target_results) <> 'array'
    or jsonb_array_length(target_results) > 500
  then
    raise exception 'Results must be an array of at most 500 items'
      using errcode = '22023';
  end if;

  for result_item in
    select *
    from jsonb_to_recordset(target_results) as item(
      notification_id uuid,
      status text,
      error text
    )
  loop
    normalized_status := upper(trim(coalesce(result_item.status, '')));
    if normalized_status not in ('SENT', 'FAILED', 'UNKNOWN') then
      continue;
    end if;

    update public.maintenance_notification_logs nl
    set
      status = normalized_status,
      sent_at = case when normalized_status = 'SENT' then now() else null end,
      error = left(coalesce(result_item.error, ''), 500)
    where nl.id = result_item.notification_id
      and nl.status = 'PROCESSING';
  end loop;
end;
$$;

revoke all on function public.claim_maintenance_notifications(jsonb)
  from public, anon, authenticated;
revoke all on function public.finish_maintenance_notifications(jsonb)
  from public, anon, authenticated;
grant execute on function public.claim_maintenance_notifications(jsonb)
  to service_role;
grant execute on function public.finish_maintenance_notifications(jsonb)
  to service_role;

commit;
