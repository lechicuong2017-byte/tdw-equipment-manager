# Bằng chứng production — kế hoạch bảo trì theo nhóm

Ngày kiểm tra: 2026-08-04
Phạm vi: Next.js, Supabase PostgreSQL/RLS và giao diện bảo trì production.

## Chức năng đã triển khai

- Tạo kế hoạch cho một thiết bị, một nhóm thiết bị hoặc một loại thiết bị.
- Phạm vi nhóm/loại được giải thành các thiết bị đang hoạt động mà người dùng có quyền truy cập; mỗi thiết bị nhận một kế hoạch riêng và các kế hoạch cùng đợt dùng chung `batch_id`.
- Giao diện hiển thị tức thời số thiết bị sẽ nhận kế hoạch, không cần nút lọc riêng.
- Hỗ trợ kế hoạch lặp định kỳ hoặc thực hiện một lần.
- Khi ghi nhật ký hoàn tất, kế hoạch lặp được dịch hạn tới kỳ kế tiếp; kế hoạch một lần tự chuyển về không hoạt động.
- Cho phép sửa riêng một thiết bị hoặc sửa toàn bộ đợt khi đợt có nhiều thiết bị.
- Giới hạn 200 thiết bị mỗi đợt; RPC kiểm tra quyền đến từng thiết bị trước khi ghi.

## Migration production

Migration: `supabase/migrations/202608040004_maintenance_plan_scopes.sql`

Truy vấn xác minh chỉ đọc trên Supabase SQL Editor trả về:

| Kiểm tra | Kết quả |
|---|---:|
| Kế hoạch hiện có | 7 |
| Kế hoạch thiếu `batch_id` | 0 |
| Phạm vi ngoài `ASSET/GROUP/TYPE` | 0 |
| Cột phạm vi mới | 4 |
| Hàm/RPC mới | 4 |
| Trigger tự cập nhật kế hoạch | 1 |
| `2026-01-31 + 1 tháng` | `2026-02-28` |
| `2024-02-29 + 12 tháng` | `2025-02-28` |

Không tạo dữ liệu bảo trì giả trên production trong quá trình xác minh.

## Kiểm tra mã nguồn

- Next.js typecheck: đạt.
- Next.js production build: đạt.
- Legacy smoke tests: đạt.
- `git diff --check`: đạt.
- Synthetic gate tối thiểu đã xác minh quy tắc phạm vi và lặp lịch trước khi thao tác repo thật.

## Giới hạn bằng chứng mạng

Phiên triển khai dùng Chrome đã đăng nhập để truy cập Supabase/Vercel và dùng Git để đẩy GitHub. Không có proxy, firewall hoặc network log được phê duyệt trong phiên này, vì vậy tài liệu này không khẳng định không có egress ngoài các dịch vụ đã thao tác.
