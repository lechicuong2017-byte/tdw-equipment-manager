begin;
create table public.telecom_phones (
  id uuid primary key default gen_random_uuid(),
  phone text not null check(phone ~ '^\+?[0-9]{6,20}$'),
  location text not null default '' check(length(location)<=300),
  serial text not null default '' check(length(serial)<=100),
  replacement_phone text not null default '' check(replacement_phone='' or replacement_phone ~ '^\+?[0-9]{6,20}$'),
  status text not null check(status in ('active','inactive','cancelled','unknown')),
  note text not null default '' check(length(note)<=2000),
  created_by uuid references public.profiles(id) default auth.uid(),
  updated_by uuid references public.profiles(id) default auth.uid(),
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(), deleted_at timestamptz
);
create unique index telecom_phones_identity on public.telecom_phones(phone) where deleted_at is null;
create trigger telecom_phones_timestamp before update on public.telecom_phones for each row execute function public.set_updated_at();
create trigger telecom_phones_audit after insert or update or delete on public.telecom_phones for each row execute function public.write_audit_log();
alter table public.telecom_phones enable row level security;
revoke all on public.telecom_phones from anon, authenticated;
grant select on public.telecom_phones to authenticated;
create policy telecom_phones_read on public.telecom_phones for select to authenticated using(deleted_at is null and public.has_permission('telecom.view'));

create function public.save_telecom_phones(target_rows jsonb,target_id uuid default null,target_version timestamptz default null)
returns integer language plpgsql security definer set search_path='' as $$
declare item jsonb; saved integer:=0; affected integer;
begin
  if auth.uid() is null or not public.has_permission('telecom.manage') then raise exception 'TELECOM_FORBIDDEN'; end if;
  if jsonb_typeof(target_rows) is distinct from 'array' or jsonb_array_length(target_rows) not between 1 and 500 then raise exception 'INVALID_ROWS'; end if;
  if target_id is not null and jsonb_array_length(target_rows)<>1 then raise exception 'INVALID_ROWS'; end if;
  perform pg_advisory_xact_lock(726383);
  for item in select value from jsonb_array_elements(target_rows) loop
    if target_id is null then
      insert into public.telecom_phones(phone,location,serial,replacement_phone,status,note)
      values(item->>'phone',item->>'location',item->>'serial',item->>'replacement_phone',item->>'status',item->>'note')
      on conflict(phone) where deleted_at is null do nothing;
      get diagnostics affected = row_count;
      saved:=saved+affected;
    else
      update public.telecom_phones set phone=item->>'phone',location=item->>'location',serial=item->>'serial',replacement_phone=item->>'replacement_phone',status=item->>'status',note=item->>'note',updated_by=auth.uid()
      where id=target_id and deleted_at is null and updated_at=target_version;
      if not found then raise exception 'STALE_PHONE'; end if;
      saved:=saved+1;
    end if;
  end loop;
  return saved;
end $$;
create function public.delete_telecom_phone(target_id uuid,target_version timestamptz)
returns void language plpgsql security definer set search_path='' as $$
begin
  if auth.uid() is null or not public.has_permission('telecom.delete') then raise exception 'TELECOM_FORBIDDEN'; end if;
  perform pg_advisory_xact_lock(726383);
  update public.telecom_phones set deleted_at=now(),updated_by=auth.uid() where id=target_id and deleted_at is null and updated_at=target_version;
  if not found then raise exception 'STALE_PHONE'; end if;
end $$;
revoke all on function public.save_telecom_phones(jsonb,uuid,timestamptz) from public;
revoke all on function public.delete_telecom_phone(uuid,timestamptz) from public;
grant execute on function public.save_telecom_phones(jsonb,uuid,timestamptz) to authenticated;
grant execute on function public.delete_telecom_phone(uuid,timestamptz) to authenticated;
commit;
