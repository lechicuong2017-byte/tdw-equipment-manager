-- Vị trí dòng trong XLSX không phải định danh ổn định: người dùng có thể chèn,
-- xóa hoặc sắp xếp lại file. Chỉ import_fingerprint mới được dùng chống trùng.

alter table public.vehicle_fuel_logs
  drop constraint if exists vehicle_fuel_logs_source_row_key;

alter table public.vehicle_repairs
  drop constraint if exists vehicle_repairs_source_row_key;

create index if not exists vehicle_fuel_logs_source_position_idx
  on public.vehicle_fuel_logs (source_file, source_sheet, source_row)
  where source_row is not null;

create index if not exists vehicle_repairs_source_position_idx
  on public.vehicle_repairs (source_file, source_sheet, source_row)
  where source_row is not null;

comment on column public.vehicle_fuel_logs.source_row is
  'Vị trí tham chiếu trong file nguồn; không dùng làm khóa cập nhật bản ghi.';

comment on column public.vehicle_repairs.source_row is
  'Vị trí tham chiếu trong file nguồn; không dùng làm khóa cập nhật bản ghi.';
