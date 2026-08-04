# Bảo mật và vận hành

## Ranh giới hệ thống

Luồng đích được hỗ trợ:

`Next.js -> Supabase Auth/PostgreSQL/Storage -> API server-only -> Apps Script -> Sheets/Docs/Drive/Gmail`

PostgreSQL là nguồn dữ liệu nghiệp vụ duy nhất. Apps Script không phục vụ HTML,
không nhận Supabase service role key và không còn xử lý CRUD chính sau cutover.
Các request tích hợp mới phải có timestamp, nonce và HMAC.

## Phiên và mật khẩu

- Reset/đổi mật khẩu tăng `session_version`, làm mọi phiên cũ mất hiệu lực.
- Đổi mật khẩu của chính user phát hành lại cookie phiên mới.
- Supabase Auth xác thực mật khẩu và `@supabase/ssr` quản lý session bằng cookie.
- RLS là lớp thực thi quyền cuối cùng; kiểm tra trong Next.js chỉ phục vụ điều hướng và trải nghiệm.
- User legacy được chuyển đổi khi đăng nhập thành công. Hash cũ không bị xóa trước khi Supabase tạo user và xác minh lại cùng mật khẩu.
- Sau khi `auth_provider=SUPABASE`, Apps Script từ chối đăng nhập bằng hash cũ để tránh hạ cấp xác thực.
- Reset/đổi mật khẩu của user đã chuyển đổi cập nhật Supabase trước, sau đó mới cập nhật trạng thái phiên Apps Script.
- `SUPABASE_SERVICE_ROLE_KEY` chỉ tồn tại trong secret manager server-only để gọi Auth Admin; không được đưa vào client bundle, biến `NEXT_PUBLIC_*` hoặc Git.

## License key

License mới không lưu trong Google Sheet. Sheet chỉ giữ marker `SCRIPT_PROPERTY_V1`, giá trị thật nằm trong Script Properties theo `license_id`. Dữ liệu `ENC:` cũ được chuyển khi admin đọc khóa hoặc chạy `migrateSchema()`.

Đây là tách bí mật khỏi Sheet, chưa phải AES-GCM bằng KMS. Muốn mã hóa xác thực đầy đủ cần Google Cloud KMS/Secret Manager hoặc backend có dịch vụ khóa; không tự triển khai AES trong Apps Script.

Delta migration ngày 2026-08-04 chỉ nhập thông tin danh mục của 5 bản quyền
phần mềm. Cột key nguồn không được chọn khi đọc Sheet, không được ghi vào file
import và không được gửi tới Supabase; quản trị viên sẽ cập nhật key sau.

## Backup và phục hồi

1. Tạo thư mục Drive riêng, hạn chế Editor, đặt ID vào `TDW_BACKUP_FOLDER_ID`.
2. Chạy `backupSystemData()` thủ công. Hàm sao chép spreadsheet và toàn bộ thư mục media sang snapshot có timestamp.
3. Mở bản sao Sheet và một số ảnh để xác nhận đọc được.
4. Chạy `installDailyBackupTrigger()` sau khi kiểm tra thành công.
5. Mỗi quý thực hiện diễn tập phục hồi sang Sheet staging và ghi thời gian/kết quả.

Trong giai đoạn chuyển tiếp, backup Sheet/Drive ở trên đã được cấu hình production
và chạy hằng ngày lúc 02:00 Asia/Ho_Chi_Minh. Đây không phải backup độc lập của
Supabase PostgreSQL hoặc Supabase Storage; hai loại backup nguồn dữ liệu chính vẫn
phải cấu hình bằng cơ chế native/đích staging của Supabase trước khi coi là hoàn tất.

Ngày 2026-08-04, Dashboard production xác nhận organization đang ở Free Plan và
hiển thị rõ project backup không được bao gồm. Không tự nâng cấp lên Pro/PITR vì
đây là quyết định phát sinh chi phí. Hạng mục này cần chọn một trong hai hướng:
backup native của Supabase trên gói trả phí, hoặc một backup runner độc lập dùng
secret manager và khôi phục thử vào project staging tách biệt.

Backup media lớn có thể vượt quota/thời gian Apps Script. Khi số ảnh tăng đáng kể, chuyển backup sang Cloud Storage/Drive API job có retry và cảnh báo.

## Theo dõi và staging

- Vercel log ghi `request_id`, tên hàm, status và thời gian; không ghi args, token, mật khẩu hay license.
- Cảnh báo nên dựa trên tỷ lệ 5xx/504, latency và lỗi trigger Apps Script/email.
- Production chỉ chuyển frontend sau khi `npm test`, `next:typecheck`,
  `next:build`, migration, đối soát và kiểm tra đăng nhập/RLS đều đạt.
- E2E Playwright không lưu cookie trong Git. File storage state của admin,
  manager, user và viewer phải nằm ở đường dẫn local đã ignore và được truyền qua
  biến môi trường khi chạy test.
- Khi triển khai trực tiếp production theo quyết định hiện tại, lưu đầy đủ bằng
  chứng từng cổng và dừng ngay khi migration/reconcile/RLS test không đạt.

## Giới hạn xác minh

Smoke test là kiểm tra tĩnh/local với upstream giả lập, không chứng minh môi trường production không có egress ngoài dự kiến. Muốn kết luận về egress cần log Vercel/Google Cloud, proxy hoặc firewall được tổ chức phê duyệt.
