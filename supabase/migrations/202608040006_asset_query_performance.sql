create extension if not exists pg_trgm with schema extensions;

create index if not exists assets_code_search_active_idx
  on public.assets using gin (asset_code extensions.gin_trgm_ops)
  where deleted_at is null;

create index if not exists assets_name_search_active_idx
  on public.assets using gin (asset_name extensions.gin_trgm_ops)
  where deleted_at is null;

create index if not exists assets_serial_search_active_idx
  on public.assets using gin (serial_number extensions.gin_trgm_ops)
  where deleted_at is null;

create index if not exists assets_status_updated_active_idx
  on public.assets (status, updated_at desc)
  where deleted_at is null;

create index if not exists assets_kind_updated_active_idx
  on public.assets (asset_kind, updated_at desc)
  where deleted_at is null;

create index if not exists media_files_asset_owner_order_idx
  on public.media_files (asset_id, owner_type, sort_order, created_at);
