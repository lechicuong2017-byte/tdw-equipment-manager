# Ma trận kiểm thử Supabase Auth và RLS

Chạy trên Supabase project sau khi áp dụng migration và trước khi nhập dữ liệu thật.

## Tài khoản kiểm thử

- `admin-test`: role `admin`, bắt buộc MFA.
- `manager-test`: role `manager`.
- `user-test`: role `user`.
- `viewer-test`: role `viewer`.
- Một request không có JWT.

Không dùng tài khoản production hoặc mật khẩu production cho bài kiểm thử.

## Kết quả bắt buộc

| Thao tác | Admin AAL1 | Admin AAL2 | Manager | User | Viewer | Anonymous |
|---|---:|---:|---:|---:|---:|---:|
| Xem dashboard | Chặn | Cho phép | Cho phép | Cho phép | Cho phép | Chặn |
| Xem thiết bị | Chặn | Cho phép | Cho phép | Cho phép | Cho phép | Chặn |
| Thêm/sửa thiết bị | Chặn | Cho phép | Cho phép | Chặn | Chặn | Chặn |
| Lưu trữ thiết bị | Chặn | Cho phép | Cho phép nếu có `assets.delete` | Chặn | Chặn | Chặn |
| Xóa vật lý thiết bị | Chặn | Chặn | Chặn | Chặn | Chặn | Chặn |
| Upload ảnh thiết bị | Chặn | Cho phép | Cho phép | Chặn | Chặn | Chặn |
| Đọc ảnh private | Chặn | Cho phép | Cho phép | Cho phép | Cho phép | Chặn |
| Quản lý role/user | Chặn | Chỉ qua API admin server | Chặn | Chặn | Chặn | Chặn |
| Xem audit log | Chặn | Cho phép | Chặn | Chặn | Chặn | Chặn |
| Xuất báo cáo thiết bị | Chặn | Cho phép | Theo permission | Chặn nếu thiếu quyền | Chặn nếu thiếu quyền | Chặn |

## Kiểm thử bổ sung

1. Tắt `active` của một profile và xác nhận session hiện có không đọc được dữ liệu.
2. Sửa JWT/cookie thủ công và xác nhận `getClaims()` từ chối.
3. Gọi trực tiếp REST API bằng publishable key nhưng không có JWT và xác nhận không có dòng nào bị lộ.
4. Thử upload file lớn hơn 5 MB, sai MIME type và đường dẫn không bắt đầu bằng `auth.uid()`.
5. Thử tạo `media_files` với `owner_id` không khớp thiết bị.
6. Thử thay đổi role của chính mình từ browser.
7. Thử replay request Apps Script export với cùng nonce.
8. Chạy Supabase Security Advisor và xử lý toàn bộ cảnh báo mức error trước cutover.
9. Thử restore database và Storage backup trên môi trường tách biệt.

## Bằng chứng cần lưu

- Thời điểm kiểm thử.
- Project/reference của môi trường kiểm thử, không ghi secret.
- Vai trò và AAL sử dụng.
- HTTP status hoặc PostgreSQL error code.
- Kết quả Security Advisor.
- Người thực hiện và người duyệt.
