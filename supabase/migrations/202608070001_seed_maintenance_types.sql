begin;

-- The legacy Settings snapshot had no maintenance_type rows. These baseline
-- choices keep the new maintenance form usable while remaining editable by
-- an administrator from Cấu hình.
insert into public.settings (
  setting_type,
  setting_value,
  display_name,
  sort_order,
  active
)
values
  ('maintenance_type', 'KIEM_TRA_SUA_CHUA', 'Kiểm tra / sửa chữa', 10, true),
  ('maintenance_type', 'BAO_DUONG_DINH_KY', 'Bảo dưỡng định kỳ', 20, true),
  ('maintenance_type', 'VE_SINH_LAM_SACH', 'Vệ sinh / làm sạch', 30, true),
  ('maintenance_type', 'THAY_THE_LINH_KIEN', 'Thay thế linh kiện', 40, true),
  ('maintenance_type', 'CAI_DAT_CAU_HINH', 'Cài đặt / cấu hình', 50, true),
  ('maintenance_type', 'XU_LY_SU_CO', 'Xử lý sự cố', 60, true)
on conflict (setting_type, setting_value) do nothing;

commit;
