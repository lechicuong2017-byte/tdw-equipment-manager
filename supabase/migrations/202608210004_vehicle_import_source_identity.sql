-- Cho phép nhập lại cùng workbook để cập nhật dữ liệu đã đọc thiếu mà không tạo bản ghi trùng.

alter table public.vehicle_fuel_logs
  add constraint vehicle_fuel_logs_source_row_key
  unique (source_file, source_sheet, source_row);

alter table public.vehicle_repairs
  add constraint vehicle_repairs_source_row_key
  unique (source_file, source_sheet, source_row);
