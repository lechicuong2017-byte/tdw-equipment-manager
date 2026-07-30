# Nhắc kế hoạch bảo trì qua email

Supabase PostgreSQL là nguồn duy nhất cho kế hoạch bảo trì, thiết bị, người phụ
trách và lịch sử gửi. Next.js chọn các email đến hạn, claim từng thông báo trong
database rồi gửi payload đã ký HMAC sang Apps Script. Apps Script chỉ thực hiện
tác vụ Gmail và trả kết quả về Next.js.

## Mốc nhắc mặc định

- Còn 7 ngày, 3 ngày, 1 ngày và đúng ngày đến hạn.
- Khi quá hạn: nhắc lại mỗi 7 ngày.
- Một kế hoạch, mốc nhắc và địa chỉ email chỉ được claim một lần.
- Trạng thái được lưu trong `maintenance_notification_logs`:
  `PROCESSING`, `SENT`, `FAILED` hoặc `UNKNOWN`.
- Chỉ `FAILED` được phép thử lại tự động. `UNKNOWN` cần kiểm tra thủ công trước
  khi gửi lại để tránh gửi trùng khi mất kết nối sau lúc Gmail đã nhận.

## Phân công người nhận

1. Đăng nhập bằng tài khoản Admin đã bật MFA.
2. Mở thiết bị cần cập nhật và chọn `Sửa`.
3. Chọn một người phụ trách chính và các người phụ trách phụ nếu cần.
4. Chỉ tài khoản đang hoạt động và có email hợp lệ mới xuất hiện trong danh sách.

## Gửi thủ công

1. Đăng nhập bằng tài khoản Admin.
2. Mở `Bảo trì`.
3. Chọn `Gửi nhắc email`.
4. Hệ thống chỉ claim và gửi những mốc đến hạn trong ngày. Nếu không có kế hoạch
   hoặc người nhận phù hợp, không có email nào được gửi.

## Lịch tự động

- Vercel Cron gọi `GET /api/jobs/maintenance-reminders`.
- Lịch production là `0 1 * * *`, tức 01:00 UTC hay 08:00 tại Việt Nam.
- Vercel gửi `CRON_SECRET` trong header Authorization; route từ chối khi thiếu
  hoặc sai giá trị.
- Không cần cài trigger thời gian trong Apps Script.

## Nguyên tắc bảo mật

- Apps Script không giữ Supabase `service_role` key.
- Người dùng đăng nhập không có quyền gọi RPC claim/finish của job.
- Endpoint Gmail chỉ nhận request có chữ ký HMAC, timestamp và nonce hợp lệ.
- Không ghi email, secret hoặc nội dung nhạy cảm vào log ứng dụng.
