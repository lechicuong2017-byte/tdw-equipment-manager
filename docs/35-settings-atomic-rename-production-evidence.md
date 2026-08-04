# Đổi tên cấu hình và cập nhật liên kết

Ngày triển khai: 04/08/2026.

## Phạm vi

- Khi đổi tên cấu hình, mã nội bộ mới được sinh từ tên hiển thị.
- Mã mới được cập nhật nguyên khối cho dữ liệu đang liên kết:
  - nhóm thiết bị, loại thiết bị và tình trạng trên thiết bị;
  - phạm vi nhóm/loại của kế hoạch bảo trì;
  - hình thức trong nhật ký bảo trì;
  - tên phần mềm trong bản quyền phần mềm.
- Chỉ cho đổi loại cấu hình khi cấu hình chưa được sử dụng.
- Chặn mã trùng trong loại cấu hình đích.

## Kiểm chứng production

- Migration `202608040005_settings_atomic_rename.sql` đã áp dụng thành công trên Supabase production.
- Bản migration được chạy thử trong giao dịch `rollback` trước khi áp dụng.
- Bản ghi cấu hình và thiết bị giả được tạo trong một giao dịch hoàn tác để kiểm tra:
  - đổi tên làm thay đổi mã nội bộ;
  - thiết bị liên kết được chuyển sang mã mới;
  - đổi loại khi đang được sử dụng trả lỗi `SETTING_TYPE_IN_USE`.
- Truy vấn sau kiểm tra xác nhận `temporary_settings = 0`, `temporary_assets = 0` và hàm production tồn tại đúng một bản.
