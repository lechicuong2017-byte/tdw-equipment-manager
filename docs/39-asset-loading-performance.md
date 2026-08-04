# Tối ưu tốc độ thiết bị

## Điểm nghẽn trước khi tối ưu

- Danh sách chờ lần lượt cấu hình, dữ liệu thiết bị, dữ liệu ảnh và URL ảnh riêng tư.
- Trang chi tiết ký từng ảnh trước khi tải dữ liệu linh kiện.
- Tìm kiếm chứa từ khóa chưa có chỉ mục trigram.

## Thay đổi

- Cấu hình, danh sách thiết bị và tùy chọn danh mục được đọc song song.
- Danh sách thiết bị hiển thị trước; ảnh thu nhỏ tải nền qua API cùng nguồn, có xác thực và RLS.
- API ảnh giới hạn tối đa 20 thiết bị, lấy ảnh đại diện và ký URL theo một lô.
- Trang chi tiết ký toàn bộ ảnh theo một lô, song song với truy vấn linh kiện.
- Bổ sung chỉ mục tìm kiếm mã, tên, serial; chỉ mục trạng thái, phân loại và ảnh đại diện.

## An toàn

- Bucket ảnh vẫn riêng tư.
- API ảnh dùng phiên đăng nhập hiện tại và Supabase RLS.
- Không dùng service-role key ở trình duyệt.
- Không thay đổi nội dung bản ghi thiết bị.
