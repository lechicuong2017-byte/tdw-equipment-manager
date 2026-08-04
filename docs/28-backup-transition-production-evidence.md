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

## Kết quả chuyển media sang Storage private

- Ngày 2026-08-04, sau khi người dùng phê duyệt thao tác trên production, đã chuyển đủ 11 ảnh nguồn từ snapshot Drive vào bucket Storage private `asset-media`.
- Đối soát production đạt 11/11 object Storage, 11/11 dòng `media_files`, 11/11 checksum SHA-256 và 11/11 liên kết metadata với object path.
- Phân bổ dữ liệu đã xác nhận: 2 ảnh thuộc thiết bị và 9 ảnh thuộc lịch sử bảo trì. Dữ liệu cha gồm 7 kế hoạch bảo trì và 11 nhật ký bảo trì.

## Giới hạn và bước kế tiếp

- Backup này bảo vệ Sheet/Drive trong giai đoạn chuyển tiếp, không thay thế backup độc lập của Supabase PostgreSQL và Supabase Storage.
- Chưa diễn tập restore trên Production để tránh thay đổi dữ liệu thật.
- Backup PostgreSQL và Storage độc lập, cùng diễn tập restore tách biệt, vẫn cần cấu hình native/staging của Supabase.

Môi trường hiện tại không có proxy, firewall hoặc network log được tổ chức phê duyệt. Vì vậy tài liệu này không khẳng định “không có upload/egress”; bằng chứng chỉ xác nhận thao tác/UI và các truy vấn SQL đã quan sát trong phiên Chrome được người dùng cho phép.
