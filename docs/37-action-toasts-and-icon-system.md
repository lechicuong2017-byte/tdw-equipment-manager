# Popup thông báo và bộ icon giao diện

## Phạm vi

- Thông báo thành công của các thao tác thêm, sửa, xóa được hiển thị bằng toast ở góc trên màn hình.
- Toast tự đóng sau 4,5 giây, có nút đóng thủ công, chống hiển thị trùng và giữ tối đa ba thông báo.
- Hộp thao tác tự đóng sau khi máy chủ xác nhận thành công; lỗi nhập liệu vẫn hiển thị gần biểu mẫu.
- Các thao tác xóa ảnh, phần mềm và dữ liệu bảo trì trả kết quả rõ ràng để tránh báo thành công sai.
- Thao tác chuyển trang như thêm/sửa thiết bị, mời người dùng và gắn/tháo/thay linh kiện truyền thông báo qua tham số `ok`, sau đó tham số được tự xóa khỏi URL.

## Bộ icon

- Icon là SVG nội bộ, dùng chung cho thông báo, điều hướng và thẻ thống kê; không tải font hoặc thư viện icon bên ngoài.
- Hệ thông báo hỗ trợ bốn trạng thái: thành công, thông tin, cảnh báo và lỗi.
- Menu dùng màu nhận diện riêng theo từng phân hệ.
- Dashboard dùng nhiều màu có kiểm soát cho tám thẻ chỉ số và biểu đồ phân bổ trạng thái.

## Kiểm tra an toàn

- Kiểm tra toast trên dữ liệu tổng hợp trước khi tích hợp.
- Kiểm tra giao diện triển khai bằng tham số thông báo, không thêm/sửa/xóa dữ liệu sản xuất.
