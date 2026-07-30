# Bằng chứng production — Linh kiện và cấu hình phần cứng

Ngày kiểm tra: 2026-07-30
Phạm vi: Supabase schema/RLS, hồ sơ thiết bị, khai báo linh kiện, lịch sử thay thế và báo cáo XLSX/PDF.

## Mô hình đã triển khai

- Mỗi bản ghi tài sản có phân loại `DEVICE` hoặc `COMPONENT`.
- Linh kiện được quản lý như một tài sản độc lập, có mã, serial, giá trị, bảo hành, QR và lịch sử riêng.
- Bảng `asset_component_installations` lưu thiết bị chính, linh kiện, ngày lắp/tháo, vị trí/khe, lý do và ghi chú.
- Chỉ một quan hệ đang hoạt động được phép tồn tại cho mỗi linh kiện.
- RPC `install_asset_component`, `remove_asset_component` và `replace_asset_component` kiểm tra quyền trên cả thiết bị chính lẫn linh kiện.
- Thay linh kiện đóng quan hệ cũ và tạo quan hệ mới trong cùng giao dịch PostgreSQL.
- Tài sản còn quan hệ lắp đặt hoạt động không thể được đưa vào lưu trữ.
- Khi thông tin phòng ban, người sử dụng hoặc vị trí của thiết bị chính thay đổi, linh kiện đang lắp được đồng bộ theo.

## Kiểm tra an toàn trước production

- Repo tổng hợp tối thiểu không chứa dữ liệu thật đạt 6 kiểm tra: chống tự gắn, chống gắn trùng, giữ lịch sử khi thay và nhóm báo cáo đúng.
- `npm run next:typecheck`: đạt.
- `npm test`: đạt.
- `npm run next:build`: đạt.
- `git diff --check`: đạt.

## Xác minh Supabase production

- Migration `202607300011_asset_components.sql` chạy thành công trong một transaction.
- Sau migration: 72 thiết bị hoàn chỉnh, 0 linh kiện và 0 lịch sử lắp đặt; không tạo dữ liệu mẫu trong production.
- RLS của `asset_component_installations` đang bật.
- Role `authenticated` có quyền đọc qua RLS nhưng không có quyền `INSERT` trực tiếp.
- Role `authenticated` được gọi RPC lắp linh kiện; role `anon` không được gọi RPC này.
- Ba RPC lắp, tháo và thay đều tồn tại đúng chữ ký đã triển khai.

## Xác minh Vercel và Chrome

- Vercel production commit `a0be283` báo `success`.
- Hồ sơ `TDW-LAP-2022-001` hiển thị phân loại `Thiết bị hoàn chỉnh` và khu vực `Linh kiện đang lắp`.
- Khi chưa có linh kiện, giao diện hiển thị trạng thái rỗng và liên kết tạo linh kiện mới.
- Liên kết này mở biểu mẫu với `Linh kiện bên trong` được chọn sẵn, số lượng mặc định 1 và hướng dẫn dùng mã riêng.
- Trang Báo cáo mô tả rõ báo cáo thiết bị bao gồm các linh kiện đang lắp.
- Báo cáo thiết bị XLSX được tạo thành công với 72 dòng hiện có; Google Sheets nguồn mở được và báo trạng thái đã lưu vào Drive.

Báo cáo sẽ xếp mỗi linh kiện đang lắp ngay sau thiết bị chính với nhãn `↳ Linh kiện đang lắp`, đồng thời thêm các cột `Thuộc thiết bị`, `Ngày lắp` và `Vị trí / khe`. Vì production chưa có linh kiện thật ở thời điểm kiểm tra, chưa thực hiện thao tác tạo/gắn/thay bằng dữ liệu mẫu; luồng nghiệp vụ được kiểm tra bằng repo tổng hợp và các ràng buộc/RPC production nêu trên.

## Giới hạn bằng chứng mạng

Môi trường hiện tại không có proxy, firewall hoặc network log được tổ chức phê duyệt. Do đó tài liệu này không khẳng định “không có upload/egress”; bằng chứng chỉ xác nhận mã nguồn, trạng thái database, quyền, build/deploy và hành vi giao diện trong phiên được người dùng cho phép.
