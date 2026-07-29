# Google Apps Script API

Thư mục này chỉ chứa backend `Code.gs` liên kết Google Sheet/Drive. Frontend duy nhất được triển khai trên Vercel.

## Cấu hình bắt buộc

Trong `Project Settings > Script Properties`:

```text
TDW_API_PROXY_SECRET=<chuoi-ngau-nhien-toi-thieu-32-ky-tu>
TDW_BOOTSTRAP_ADMIN_PASSWORD=<chi-can-khi-tao-admin-dau-tien>
TDW_MEDIA_FOLDER_ID=<id-thu-muc-anh>
TDW_BACKUP_FOLDER_ID=<id-thu-muc-backup>
TDW_NEXT_INTEGRATION_SECRET=<secret-hmac-dung-chung-voi-nextjs>
TDW_EXPORT_FOLDER_ID=<id-thu-muc-nhan-bao-cao-xuat>
TDW_LEGACY_MODE=read-write
```

`TDW_API_PROXY_SECRET` phải trùng với biến `APPS_SCRIPT_PROXY_SECRET` trên Vercel. Không lưu các giá trị này trong Git.

Sau khi cập nhật và deploy Web App phiên bản mới, chạy thủ công `migrateSchema()`, rồi kiểm tra `backupSystemData()` trước khi cài lịch bằng `installDailyBackupTrigger()`.

## Chuyển quyền nguồn dữ liệu sang Supabase

`TDW_LEGACY_MODE` là công tắc chuyển đổi có kiểm soát:

- `read-write`: hệ thống cũ vẫn hoạt động đầy đủ trong thời gian chuyển dữ liệu.
- `read-only`: chặn CRUD nghiệp vụ trên Google Sheets nhưng vẫn cho phép đọc, đăng nhập cũ và kiểm tra backup.
- `disabled`: chặn toàn bộ API nghiệp vụ cũ; endpoint HMAC `exportSupabaseReport` vẫn hoạt động độc lập.

Sau cutover, đặt `TDW_LEGACY_MODE=disabled`. Không xóa Sheet/Drive cũ cho đến khi đã qua thời hạn giữ bản backup được phê duyệt.
