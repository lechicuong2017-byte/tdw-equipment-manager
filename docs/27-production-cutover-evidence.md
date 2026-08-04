# Bằng chứng production — Chốt cổng cutover

Ngày kiểm tra: 2026-08-04  
Phạm vi: Vercel Root Directory, Next.js Production, Supabase/RLS và Apps Script legacy.

## Kiểm tra trước khi ghi

- Repo tổng hợp tối thiểu không chứa dữ liệu thật đạt 4 kiểm tra về cờ Production, số migration, nguồn dữ liệu PostgreSQL và trạng thái ghi legacy.
- Không đưa secret, token, mật khẩu hoặc dữ liệu Script Properties vào Git hay tài liệu.
- Người dùng đã xác nhận triển khai trực tiếp trên bản chính và đã có backup trước các thao tác cutover.

## Xác minh Vercel

- Project `tdw-equipment-manager` dùng `Root Directory = next-app`.
- `next-app/vercel.json` giữ `npm ci`, lệnh build Next.js và cron nhắc bảo trì.
- Trang Production `/admin/health` xác nhận server đang chạy commit `2a34788`.
- Trang health sau cutover báo tổng thể `Hoạt động tốt`.

## Xác minh Apps Script production

- Đúng project Apps Script production được nhận diện bằng `TDW_INTEGRATION_VERSION = 2026.07.30.3`.
- Deployment đang hoạt động là version 11, mô tả `Admin audit and signed integration health check`.
- Script Property `TDW_LEGACY_MODE` đã chuyển từ `read-only` sang `disabled` ngày 2026-08-04.
- Endpoint HMAC `integrationHealthCheck` vẫn phản hồi bình thường sau khi đổi chế độ; phiên bản tích hợp hiển thị `2026.07.30.3`.

## Xác minh đường đi production sau cutover

- Next.js/Vercel: `Hoạt động tốt`, commit `2a34788`.
- Supabase PostgreSQL: `Hoạt động tốt`, truy vấn quản trị phản hồi qua RLS.
- Google Apps Script: `Hoạt động tốt`, HMAC timestamp/nonce/signature hợp lệ.
- Các endpoint CRUD legacy trên Google Sheets bị chặn bởi `TDW_LEGACY_MODE=disabled`; luồng xuất báo cáo Supabase ký HMAC vẫn độc lập.

## Phần còn chờ dữ liệu nguồn

- Import maintenance, movement, software, plans, responsibles, notification logs và media chỉ chạy khi nguồn được cung cấp; không tự tạo dữ liệu mẫu trên Production.
- Chuyển ảnh Drive sang Storage vẫn chờ danh sách ảnh nguồn và checksum được phê duyệt.

## Giới hạn bằng chứng

Môi trường hiện tại không có proxy, firewall hoặc network log được tổ chức phê duyệt. Vì vậy tài liệu này không khẳng định “không có upload/egress”; bằng chứng chỉ xác nhận cấu hình Vercel, trạng thái Apps Script, health Production, HMAC và các thay đổi cutover được người dùng cho phép.
