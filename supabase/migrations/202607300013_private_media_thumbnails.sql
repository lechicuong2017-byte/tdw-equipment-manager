alter table public.media_files
  add column if not exists thumbnail_path text;

create unique index if not exists media_files_thumbnail_path_idx
  on public.media_files (thumbnail_path)
  where thumbnail_path is not null;

do $migration$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'media_files_thumbnail_path_distinct'
      and conrelid = 'public.media_files'::regclass
  ) then
    alter table public.media_files
      add constraint media_files_thumbnail_path_distinct
      check (thumbnail_path is null or thumbnail_path <> object_path);
  end if;
end;
$migration$;

create or replace function public.can_read_storage_object(target_name text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.media_files mf
    where mf.bucket_id = 'asset-media'
      and (
        mf.object_path = target_name
        or mf.thumbnail_path = target_name
      )
      and (
        (
          mf.owner_type = 'ASSET'
          and public.can_access_asset(mf.asset_id, 'assets', 'assets.view')
        )
        or (
          mf.owner_type = 'MAINTENANCE'
          and public.can_access_asset(
            mf.asset_id,
            'maintenance',
            'maintenance.view'
          )
        )
      )
  );
$$;

create or replace function public.can_manage_storage_object(target_name text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.media_files mf
    where mf.bucket_id = 'asset-media'
      and (
        mf.object_path = target_name
        or mf.thumbnail_path = target_name
      )
      and (
        (
          mf.owner_type = 'ASSET'
          and public.can_access_asset(mf.asset_id, 'assets', 'assets.manage')
        )
        or (
          mf.owner_type = 'MAINTENANCE'
          and public.can_access_asset(
            mf.asset_id,
            'maintenance',
            'maintenance.manage'
          )
        )
      )
  );
$$;
