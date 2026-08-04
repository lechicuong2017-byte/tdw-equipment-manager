# Popup thao tác dùng chung

Ngày triển khai: 04/08/2026.

## Thành phần dùng chung

- `AppModal`: khung popup có backdrop, tiêu đề, mô tả, nút đóng, hỗ trợ phím Escape và khóa cuộn nền.
- `ModalTrigger`: mở form thêm/sửa trong popup mà không thay đổi nghiệp vụ lưu dữ liệu.
- `ModalPage`: hiển thị các route thêm/sửa hiện có dưới dạng popup và giữ nguyên redirect sau khi lưu.
- `ConfirmAction`: xác nhận thao tác xóa/lưu trữ bằng giao diện cảnh báo thống nhất.

## Phạm vi đã áp dụng

- Thiết bị: thêm, sửa, lưu trữ, thêm/xóa ảnh.
- Linh kiện: thêm mới, gắn, thay và tháo linh kiện.
- Bảo trì: thêm kế hoạch, thêm nhật ký, sửa và xóa.
- Luân chuyển: thêm lần luân chuyển.
- Phần mềm: thêm, sửa và xóa bản quyền; phần key mã hóa nằm trong popup sửa.
- Hệ thống: thêm/sửa cấu hình, thêm/sửa phòng ban, mời người dùng và sửa quyền truy cập.

## Nguyên tắc giao diện

- Popup thêm/sửa dùng màu thương hiệu và nút hành động chính.
- Popup xóa/lưu trữ dùng vùng cảnh báo đỏ, có nút Hủy và không thực hiện ngay khi bấm lần đầu.
- Desktop hiển thị popup giữa màn hình; mobile hiển thị dạng sheet từ cạnh dưới và các nút hành động chiếm toàn chiều rộng.
- Tất cả server action, kiểm tra quyền, RLS và redirect hiện có được giữ nguyên.
