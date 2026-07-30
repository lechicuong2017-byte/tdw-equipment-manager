# Bằng chứng Auth, RLS và Storage trên Supabase production

Ngày kiểm tra: 2026-07-30  
Project ref: `krrmcftzbtbfggrewala`  
Frontend: `https://tdw-equipment-manager-one.vercel.app`  
Phạm vi: Auth, JWT/AAL, PostgreSQL RLS theo bản ghi, Storage private và lưu trữ mềm thiết bị.

## Cấu hình và tài khoản kiểm thử

- Dùng bốn tài khoản tổng hợp riêng cho bài kiểm thử: `admin`, `manager`, `user`, `viewer`.
- Không dùng mật khẩu production và không ghi token, mật khẩu hoặc key vào tài liệu/Git.
- Admin kiểm thử có `must_enroll_mfa=true` nhưng chưa có factor, nên JWT ở AAL1 để xác minh nhánh bị chặn.
- Admin vận hành thực tế đã đăng nhập AAL2 và truy cập được trang quản trị.
- File cấu hình tạm nằm ngoài repository, quyền file `0600`, và được xóa sau kiểm thử.

## Kết quả tự động

Vòng cuối chạy lúc `2026-07-30T04:16:09.229Z`, run tag `20260730-iaqe24-d`.

Tổng cộng 40 kiểm tra Auth/RLS/Storage và 2 kiểm tra khóa profile đều đạt:

- Bốn tài khoản đăng nhập thành công; JWT bị sửa bị từ chối với HTTP 401.
- Anonymous không đọc hoặc tạo được thiết bị.
- Admin AAL1 không đọc, tạo hoặc đọc ảnh private.
- Manager tạo, xem, sửa và lưu trữ mềm thiết bị khi có permission/scope.
- User không được gán không thấy thiết bị; sau khi được gán chỉ thấy đúng thiết bị đó.
- Viewer không có scope không thấy thiết bị và không đọc được ảnh.
- User được gán và manager đọc được đúng ảnh private.
- Sai thư mục `auth.uid()`, sai MIME type, file lớn hơn 5 MB và metadata media sai owner đều bị từ chối.
- Xóa vật lý thiết bị không làm mất bản ghi.
- PATCH trực tiếp sang trạng thái đã xóa bị RLS chặn với PostgreSQL `42501`.
- RPC `archive_asset` từ viewer bị từ chối; manager hợp lệ nhận HTTP 204 và bản ghi đã lưu trữ không còn xuất hiện trong truy vấn active.
- Sau khi khóa profile, phiên JWT viewer đang mở trả `is_active_user=false` và không còn thấy danh mục role.

## Thay đổi phát sinh từ kiểm thử

RLS không cho một bản ghi tự chuyển từ trạng thái nhìn thấy sang trạng thái bị ẩn trong cùng `UPDATE`. Giải pháp production là RPC `archive_asset` dạng `SECURITY DEFINER`, có kiểm tra đồng thời:

1. `can_access_asset(..., 'assets.manage')`;
2. permission `assets.delete`;
3. asset còn active.

Ứng dụng Next.js gọi RPC này thay cho PATCH trực tiếp. Quyền SELECT không bị nới rộng và xóa vật lý vẫn bị chặn.

## Security Advisor

Kiểm tra sau migration:

- Errors: `0`.
- Warnings: `24`.
- Info: `0`.

Các warning quan sát được chủ yếu là các hàm `SECURITY DEFINER` được gọi bởi authenticated role hoặc trigger nội bộ. Những warning này không được xem là đã tự động an toàn; cần tiếp tục rà soát từng quyền `EXECUTE`, đặc biệt các hàm chỉ dành cho trigger/nội bộ.

## Dọn dữ liệu kiểm thử

Sau kiểm thử đã xóa chính xác các bản ghi/tài khoản tổng hợp theo run tag và UUID đã ghi nhận. Truy vấn đối soát trả:

| Nhóm | Còn lại |
|---|---:|
| Assets tổng hợp | 0 |
| Auth users tổng hợp | 0 |
| Storage objects tổng hợp | 0 |
| Audit logs liên quan | 0 |

Không xóa dữ liệu nghiệp vụ hoặc tài khoản admin thực tế.

## Giới hạn bằng chứng

- Bằng chứng này xác nhận hành vi HTTP/PostgreSQL quan sát được trong chính môi trường production; không thay thế pentest hoặc kiểm toán tổ chức.
- Chưa kiểm tra replay Apps Script, khôi phục backup tách biệt hoặc toàn bộ 24 warning của Security Advisor.
- Không có proxy/firewall log được tổ chức phê duyệt trong phiên này, nên không đưa ra kết luận rằng môi trường “không có upload/egress”.
