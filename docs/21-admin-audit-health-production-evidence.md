# Bằng chứng production — Audit UI và trạng thái hệ thống

Ngày kiểm tra: 2026-07-30  
Phạm vi: quản trị viên MFA, Supabase audit log, Next.js/Vercel và Apps Script HMAC.

## Thay đổi đã triển khai

- Thay trang Nhật ký dạng minh họa bằng bảng audit thật từ `public.audit_logs`.
- Chỉ truy vấn các trường an toàn cho danh sách: người thực hiện, hành động, bảng, mã bản ghi, tên khóa metadata và thời gian.
- Không truy vấn hoặc render `old_data`/`new_data`; tên metadata có chứa `secret`, `token`, `password` hoặc `license` cũng bị loại khỏi tóm tắt.
- Có bộ lọc hành động/bảng dữ liệu và phân trang 40 sự kiện mỗi trang.
- Thêm `/admin/health` dưới `AdminLayout`, vì vậy chỉ admin đã qua yêu cầu MFA mới truy cập được.
- Health check Supabase dùng phiên người dùng hiện tại để xác nhận RLS, không dùng service-role key.
- Health check Apps Script dùng action `integrationHealthCheck`, bắt buộc timestamp, nonce và chữ ký HMAC; phản hồi không chứa URL hoặc secret.
- Apps Script production version 11; Web App deployment ID/URL không đổi.
- Vercel production commit `69d75a9`, trạng thái `Ready`.

## Kiểm tra trước production

- Repo tổng hợp tối thiểu không chứa dữ liệu thật: 9 kiểm tra health contract đạt.
- `npm run next:typecheck`: đạt.
- `npm test`: đạt.
- `npm run next:build`: đạt; route `/admin/audit` và `/admin/health` đều được build động.
- `git diff --check`: đạt.

## Kiểm tra production bằng Chrome

- Tài khoản admin hiện tại truy cập được mục `Trạng thái` và `Nhật ký`.
- Tổng thể: `Hoạt động tốt`.
- Next.js/Vercel: commit `69d75a9`, phản hồi trang thành công.
- Supabase PostgreSQL/RLS: `327 ms`, truy vấn admin hợp lệ.
- Google Apps Script/HMAC: `2.210 ms`, integration version `2026.07.30.3`.
- Audit log: `248` sự kiện, `7` trang; bảng hiển thị thời gian, actor đã rút gọn, hành động, bảng và tiền tố mã bản ghi.
- Giao diện không hiển thị `old_data`, `new_data`, URL tích hợp, token hoặc secret.

Các số latency là ảnh chụp tại một thời điểm, dùng để xác nhận đường kết nối hoạt động chứ chưa phải chỉ số SLO dài hạn.

## Giới hạn bằng chứng mạng

Môi trường hiện tại không có proxy, firewall hoặc network log được tổ chức phê duyệt. Do đó bằng chứng này không được dùng để khẳng định “không có upload/egress”; nó chỉ xác nhận hành vi ứng dụng và kết nối đã yêu cầu trong phiên kiểm tra production.
