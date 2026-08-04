alter table public.media_files
  add column if not exists checksum text;

do $migration$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'media_files_checksum_sha256'
      and conrelid = 'public.media_files'::regclass
  ) then
    alter table public.media_files
      add constraint media_files_checksum_sha256
      check (checksum is null or checksum ~ '^[0-9a-f]{64}$');
  end if;
end;
$migration$;

create index if not exists media_files_checksum_idx
  on public.media_files (checksum)
  where checksum is not null;
