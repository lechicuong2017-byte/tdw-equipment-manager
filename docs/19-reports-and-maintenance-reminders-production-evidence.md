# Gate 5 — Báo cáo và nhắc bảo trì production

Ngày triển khai: 2026-07-30

## Phạm vi

- Xuất Google Sheets cho thiết bị, bảo trì, luân chuyển và phần mềm.
- Phân công người phụ trách chính/phụ theo từng thiết bị.
- Job nhắc bảo trì chạy thủ công hoặc tự động lúc 08:00 Việt Nam.
- Apps Script gửi Gmail bằng payload do Next.js ký HMAC.

## Supabase production

- Đã áp migration `202607300008_maintenance_reminder_jobs.sql`.
- Đã xác nhận `admin_set_asset_responsibles`, `claim_maintenance_notifications`
  và `finish_maintenance_notifications` tồn tại.
- Kết quả kiểm tra quyền:
  - `service_role` có quyền claim và finish;
  - role `authenticated` không có quyền claim hoặc finish;
  - role `authenticated` có thể gọi RPC phân công, nhưng hàm tự kiểm tra Admin
    AAL2 trước khi thay đổi dữ liệu.
- Claim sử dụng unique key sẵn có trên kế hoạch, loại thông báo, ngày đến hạn và
  email người nhận để chống gửi trùng.

## Apps Script production

- Web App hiện tại đã được cập nhật, giữ nguyên deployment ID và URL.
- Phiên bản production: version 4.
- Action mới: `sendSupabaseMaintenanceReminders`.
- Request vẫn dùng timestamp, nonce và chữ ký HMAC; Apps Script không nhận
  Supabase key.
- Kết quả gửi được trả theo từng notification để Next.js hoàn tất trạng thái.

## Vercel production

- Đã thêm `CRON_SECRET` dạng Sensitive, chỉ cho môi trường Production.
- Đã thay giá trị `SUPABASE_SERVICE_ROLE_KEY` cũ không còn hợp lệ bằng Secret
  API key hiện hành của đúng Supabase project; không ghi giá trị vào source,
  log hoặc tài liệu.
- `vercel.json` khai báo lịch `0 1 * * *`.
- Route cron dùng so sánh cố định thời gian và từ chối khi không có secret.
- Đã redeploy production với cấu hình mới; deployment ở trạng thái `Ready`.

## Kiểm thử trước deployment

- Synthetic workflow: 4 kiểm tra đạt, gồm HMAC tamper, lọc mốc đến hạn và
  idempotency key.
- `npm run next:typecheck`: đạt.
- `npm test`: đạt.
- `npm run next:build`: đạt.
- `git diff --check`: đạt.
- Smoke test Apps Script sử dụng MailApp giả lập, không gửi email thật.

## Kiểm tra production bằng Chrome

- Route `/api/jobs/maintenance-reminders` không có Authorization trả `401`
  trong Vercel Runtime Logs.
- Trang Báo cáo hiển thị đủ 4 loại.
- Đã tạo thành công Google Sheets cho báo cáo bảo trì, luân chuyển và phần mềm.
  Mỗi báo cáo có 0 dòng, phù hợp dữ liệu nguồn hiện tại.
- Nút `Gửi nhắc bảo trì` trả kết quả:
  `Không có email mới cần gửi. Đã kiểm tra 0 kế hoạch.`
- Form sửa thiết bị của Admin hiển thị người phụ trách chính và người phối hợp;
  chỉ profile đang hoạt động có email xuất hiện.
- Không gửi email Gmail thật trong lần kiểm tra vì production chưa có kế hoạch
  bảo trì hay người phụ trách được gán.

## Giới hạn bằng chứng

- Snapshot socket trước/sau synthetic test không ghi nhận kết nối của tiến trình
  Node trong khoảng quan sát, nhưng đây không phải proxy/firewall log được phê
  duyệt và không đủ để kết luận không có egress.
- Việc triển khai qua Chrome tạo network traffic đến Supabase, Vercel và Google
  theo đúng thao tác production đã được người dùng yêu cầu.
- Tại thời điểm triển khai, dữ liệu production chưa có kế hoạch/người phụ trách;
  kiểm tra nút nhắc email vì vậy phải trả kết quả không gửi email.
