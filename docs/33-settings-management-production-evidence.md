# Bằng chứng production — Quản lý cấu hình

Ngày kiểm tra: 2026-08-04 (Asia/Ho_Chi_Minh)

## Phạm vi

- Thay trang `/admin/settings` dạng giữ chỗ bằng màn hình quản lý thật, chỉ dành
  cho Admin đã qua lớp xác thực của khu vực quản trị.
- Quản lý năm danh mục: nhóm thiết bị, loại thiết bị, tình trạng, loại bảo trì
  và tên phần mềm.
- Quản lý thêm/sửa thông tin phòng ban trong bảng `departments`; không xóa phòng
  ban đã dùng để tránh mất phân bổ và phạm vi dữ liệu.
- Danh mục được nối vào form thiết bị, bộ lọc thiết bị, nhật ký bảo trì và gợi ý
  tên phần mềm.
- Ngừng dùng một lựa chọn bằng cờ `active`, không xóa bản ghi hoặc sửa mã nội bộ.

## Cổng local

- Repo tổng hợp tối thiểu: 6/6 kiểm tra đạt cho quyền Admin, allowlist loại cấu
  hình, chuẩn hóa dữ liệu và trường bắt buộc.
- `npm --prefix next-app run typecheck`: đạt.
- `npm --prefix next-app run build`: đạt; `/admin/settings` và các trang sử dụng
  danh mục được build thành công.
- `git diff --check`: đạt.

## Supabase production

Migration `202608040003_settings_management.sql` chạy thành công trong SQL
Editor production. Câu lệnh đối soát chỉ đọc trả về:

| Hạng mục | Kết quả |
| --- | ---: |
| Dòng `settings` | 24 |
| Dòng `departments` | 20 |
| RPC Admin cho sửa tên/đổi thứ tự | 2 |

RPC đổi thứ tự khóa các bản ghi cùng danh mục trong giao dịch. RPC sửa tên giữ
nguyên `setting_value`; với nhóm thiết bị, nhãn đã lưu trên thiết bị được đồng
bộ trong cùng giao dịch. Các trigger audit hiện có tiếp tục ghi nhận thay đổi.

## Giới hạn

Không tạo cấu hình hoặc phòng ban giả trong production. Môi trường hiện tại
không có proxy, firewall hoặc network log được tổ chức phê duyệt, vì vậy bằng
chứng này xác nhận các kết nối và kết quả được quan sát nhưng không kết luận
không có egress khác.
