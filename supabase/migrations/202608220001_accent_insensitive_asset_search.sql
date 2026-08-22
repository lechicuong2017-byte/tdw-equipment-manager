create extension if not exists unaccent with schema extensions;

create or replace function public.immutable_unaccent(input text)
returns text
language sql
immutable
parallel safe
strict
set search_path = ''
as $$
  select extensions.unaccent('extensions.unaccent'::regdictionary, input);
$$;

revoke all on function public.immutable_unaccent(text) from public;
grant execute on function public.immutable_unaccent(text) to authenticated;
grant execute on function public.immutable_unaccent(text) to service_role;

alter table public.assets
  add column search_text text generated always as (
    lower(public.immutable_unaccent(
      coalesce(asset_code, '') || ' ' ||
      coalesce(asset_name, '') || ' ' ||
      coalesce(serial_number, '') || ' ' ||
      coalesce(asset_type, '') || ' ' ||
      coalesce(asset_group_label, '') || ' ' ||
      coalesce(brand, '') || ' ' ||
      coalesce(model, '') || ' ' ||
      coalesce(assigned_to_name, '') || ' ' ||
      coalesce(department_legacy_name, '') || ' ' ||
      coalesce(location, '')
    ))
  ) stored;

create index assets_search_text_active_idx
  on public.assets using gin (search_text extensions.gin_trgm_ops)
  where deleted_at is null;

notify pgrst, 'reload schema';
