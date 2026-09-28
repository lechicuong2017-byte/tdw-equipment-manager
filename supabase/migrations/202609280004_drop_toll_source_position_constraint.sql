begin;

-- PostgreSQL tự rút gọn tên constraint dài. Tìm theo chính xác bộ cột thay vì
-- phụ thuộc vào tên để bảo đảm khóa vị trí nguồn được gỡ trên mọi môi trường.
do $$
declare
  source_constraint text;
begin
  for source_constraint in
    select constraint_row.conname
    from pg_catalog.pg_constraint constraint_row
    join pg_catalog.pg_class table_row on table_row.oid = constraint_row.conrelid
    join pg_catalog.pg_namespace schema_row on schema_row.oid = table_row.relnamespace
    where schema_row.nspname = 'public'
      and table_row.relname = 'vehicle_toll_quarterly_passes'
      and constraint_row.contype = 'u'
      and (
        select array_agg(attribute_row.attname order by key_column.ordinality)
        from unnest(constraint_row.conkey) with ordinality as key_column(attnum, ordinality)
        join pg_catalog.pg_attribute attribute_row
          on attribute_row.attrelid = constraint_row.conrelid
         and attribute_row.attnum = key_column.attnum
      ) = array['source_file', 'source_sheet', 'source_row']::name[]
  loop
    execute format(
      'alter table public.vehicle_toll_quarterly_passes drop constraint %I',
      source_constraint
    );
  end loop;

  if exists (
    select 1
    from pg_catalog.pg_constraint constraint_row
    join pg_catalog.pg_class table_row on table_row.oid = constraint_row.conrelid
    join pg_catalog.pg_namespace schema_row on schema_row.oid = table_row.relnamespace
    where schema_row.nspname = 'public'
      and table_row.relname = 'vehicle_toll_quarterly_passes'
      and constraint_row.contype = 'u'
      and (
        select array_agg(attribute_row.attname order by key_column.ordinality)
        from unnest(constraint_row.conkey) with ordinality as key_column(attnum, ordinality)
        join pg_catalog.pg_attribute attribute_row
          on attribute_row.attrelid = constraint_row.conrelid
         and attribute_row.attnum = key_column.attnum
      ) = array['source_file', 'source_sheet', 'source_row']::name[]
  ) then
    raise exception 'VETC_SOURCE_POSITION_CONSTRAINT_STILL_EXISTS';
  end if;
end;
$$;

commit;
