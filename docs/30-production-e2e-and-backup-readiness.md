# Bằng chứng E2E production và trạng thái backup Supabase

Ngày kiểm tra: 2026-08-04

## Backup database production

- Supabase Dashboard xác nhận organization đang ở Free Plan.
- Màn hình Database Backups ghi rõ Free Plan không bao gồm project backup; nâng lên Pro mới có scheduled backup.
- Không bật Pro hoặc PITR vì đây là thao tác phát sinh chi phí và cần quyết định riêng của người dùng.
- Backup database của Supabase không chứa byte của Storage object, nên dù chọn backup native vẫn phải có quy trình backup Storage độc lập.
- Tài liệu chính thức được đối chiếu: [Database Backups](https://supabase.com/docs/guides/platform/backups) và [Download Objects](https://supabase.com/docs/guides/storage/management/download-objects).

## Nền E2E đã triển khai

- Thêm Playwright Test và cấu hình chạy một worker để tránh tác động đồng thời lên dữ liệu production.
- Project `anonymous` luôn chạy với context rỗng, không dùng cookie người thật.
- Xác minh route bảo vệ chuyển về trang đăng nhập và Content Security Policy có `object-src 'none'`, `frame-ancestors 'none'`.
- Xác minh endpoint cron trả HTTP 401 khi thiếu secret.
- Kết quả trên production: 2/2 bài kiểm tra anonymous đạt.

## Ma trận vai trò

Cấu hình đã hỗ trợ `admin`, `manager`, `user` và `viewer`. Mỗi project chỉ được bật khi biến môi trường chỉ tới một file Playwright storage state local tương ứng. Các file này có thể chứa cookie đăng nhập nên `.gitignore` loại bỏ toàn bộ `playwright/.auth`; không ghi nội dung phiên hoặc secret vào tài liệu.

Các bài kiểm tra theo vai trò hiện xác minh:

1. người đã đăng nhập truy cập được danh sách thiết bị theo RLS;
2. chỉ admin truy cập được trang quản trị người dùng;
3. vai trò khác bị chuyển về Dashboard.

Chưa chạy đủ bốn vai trò trong lượt này vì chưa tạo storage state riêng cho tài khoản test. Không sử dụng phiên người dùng production làm fixture tự động.

## Bước còn lại

1. Chọn Pro backup/PITR hoặc backup runner độc lập.
2. Chuẩn bị project staging và diễn tập restore database + một mẫu Storage object.
3. Tạo bốn phiên test chuyên dụng rồi chạy đủ ma trận E2E theo vai trò.

## Giới hạn bằng chứng

Môi trường hiện tại không có proxy, firewall hoặc network log được tổ chức phê duyệt. Bằng chứng xác nhận kết quả Dashboard và các request E2E đã quan sát, không khẳng định mọi egress ngoài các kênh đó.
