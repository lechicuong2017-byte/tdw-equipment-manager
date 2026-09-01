begin;

create or replace function public.get_system_capacity_usage()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  database_bytes bigint;
  storage_bytes bigint;
  storage_objects bigint;
begin
  if not public.is_admin() then
    raise exception 'Admin access required' using errcode = '42501';
  end if;

  select pg_database_size(current_database()) into database_bytes;

  select
    coalesce(
      sum(
        case
          when coalesce(objects.metadata ->> 'size', '') ~ '^[0-9]+$'
            then (objects.metadata ->> 'size')::bigint
          else 0
        end
      ),
      0
    )::bigint,
    count(*)::bigint
  into storage_bytes, storage_objects
  from storage.objects as objects;

  return jsonb_build_object(
    'database_bytes', database_bytes,
    'storage_bytes', storage_bytes,
    'storage_objects', storage_objects,
    'checked_at', now()
  );
end;
$$;

revoke all on function public.get_system_capacity_usage() from public;
revoke all on function public.get_system_capacity_usage() from anon;
grant execute on function public.get_system_capacity_usage() to authenticated;

commit;
