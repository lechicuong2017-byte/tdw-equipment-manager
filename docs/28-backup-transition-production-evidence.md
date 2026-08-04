# Bằng chứng production — Backup chuyển tiếp và lịch hằng ngày

Ngày kiểm tra: 2026-08-04  
Phạm vi: Google Drive backup/media, Apps Script production và kế hoạch backup Supabase.

## Kiểm tra an toàn trước khi ghi

- Repo tổng hợp tối thiểu không chứa dữ liệu thật đạt 3 kiểm tra về trạng thái vận hành, độ trễ health và ngưỡng cảnh báo.
- Không ghi ID thư mục Drive, token, mật khẩu hoặc Script Property value vào Git.
- Không thực hiện restore trên Production; thao tác chỉ tạo một snapshot backup mới và bật lịch backup.

## Xác minh nguồn Drive

- Thư mục `TDW Equipment Manager Backup` tồn tại trong Drive.
- Trước lần kiểm tra có 18 snapshot `TDW-backup-*`.
- Thư mục `TDW Equipment Manager Media` có ảnh nguồn thực tế; snapshot mới đã sao chép 11 ảnh.

## Xác minh Apps Script production

- Đã cấu hình `TDW_BACKUP_FOLDER_ID` và `TDW_MEDIA_FOLDER_ID` trong Script Properties production; giá trị không xuất hiện trong Git.
- Chạy `backupSystemData()` thành công.
- Snapshot mới: `TDW-backup-20260804-102601`.
- Snapshot chứa file dữ liệu `TDW-data-20260804-102601` và thư mục `media`.
- Chạy `installDailyBackupTrigger()` thành công.
- Trang Triggers hiển thị đúng 1 trigger time-based cho `backupSystemData`; hàm được cấu hình chạy mỗi ngày lúc 02:00 theo múi giờ Hồ Chí Minh.

## Giới hạn và bước kế tiếp

- Backup này bảo vệ Sheet/Drive trong giai đoạn chuyển tiếp, không thay thế backup độc lập của Supabase PostgreSQL và Supabase Storage.
- Chưa diễn tập restore trên Production để tránh thay đổi dữ liệu thật.
- Drive hiện có 11 ảnh nguồn chưa chuyển sang Supabase Storage private. Cần job checksum, đối soát `media_files` và phê duyệt cửa sổ chuyển dữ liệu trước khi chạy upload thật.

Môi trường hiện tại không có proxy, firewall hoặc network log được tổ chức phê duyệt. Vì vậy tài liệu này không khẳng định “không có upload/egress”; bằng chứng chỉ xác nhận cấu hình, kết quả backup, trigger và nội dung snapshot trong phiên Chrome được người dùng cho phép.
