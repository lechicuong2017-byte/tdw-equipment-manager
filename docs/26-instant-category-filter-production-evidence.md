# Bằng chứng production — Bộ lọc danh mục tức thời

Ngày kiểm tra: 2026-07-31  
Phạm vi: danh sách thiết bị, Supabase PostgreSQL/RLS, Next.js và Vercel Production.

## Thay đổi đã triển khai

- Danh sách thiết bị có bộ lọc danh mục như Laptop, Desktop PC, Máy in, Ổ cứng và các danh mục đang tồn tại trong dữ liệu.
- Khi chọn danh mục, hệ thống tự lọc ngay; người dùng không cần bấm nút.
- URL giữ điều kiện `category`, vì vậy có thể tải lại trang, chia sẻ liên kết và chuyển trang mà không mất bộ lọc.
- Điều hướng dùng Next.js Router phía client để không tải lại toàn bộ tài liệu.
- Danh sách danh mục và số lượng được lấy bằng RPC `security invoker`; kết quả tiếp tục chịu RLS của người đăng nhập.
- Query danh sách lọc chính xác theo `asset_type` và phân trang trực tiếp tại PostgreSQL.

## Kiểm tra an toàn trước production

- Repo tổng hợp tối thiểu không chứa dữ liệu thật đạt 7 kiểm tra về chuẩn hóa danh mục, lọc chính xác và giữ query khi phân trang.
- Không đưa `.env`, token, mật khẩu hoặc dữ liệu nhập vào Git.
- `npm run next:typecheck`: đạt.
- `npm test`: đạt.
- `npm run next:build`: đạt.
- `git diff --check`: đạt.

## Xác minh Supabase production

- Migration `202607310014_asset_category_filters.sql` chạy thành công.
- Chỉ mục một phần `assets_type_updated_active_idx` tồn tại cho `asset_type, updated_at desc` với điều kiện `deleted_at is null`.
- RPC `get_asset_filter_options()` có `security_invoker = true`.
- Role `authenticated` được gọi RPC; `anon` và `public` không được gọi.
- Production trả 10 danh mục:
  - Desktop PC: 8
  - Điện thoại: 2
  - Laptop: 21
  - Màn hình: 1
  - Máy chiếu: 5
  - Máy in: 12
  - Ổ cứng: 6
  - Server/SCADA: 7
  - Thiết bị: 5
  - TV: 5
- `EXPLAIN ANALYZE` cho danh mục Laptop dùng `Index Scan using assets_type_updated_active_idx`; 20 dòng của trang đầu được trả trong `0,194 ms`.

## Xác minh Vercel và Chrome

- Vercel production commit `de443b8` báo `success`.
- Bộ chọn hiển thị đúng 10 danh mục và số lượng; không có nút lọc hiển thị.
- Chọn Laptop tự đổi URL thành `/assets?category=Laptop`, hiển thị 21 tài sản và trang 1/2.
- Chọn Desktop PC tự đổi URL thành `/assets?category=Desktop+PC`, hiển thị 8 tài sản và trang 1/1.
- Trong một lần đo liên tục trên Production, từ lúc chọn Laptop đến khi URL, lựa chọn và tổng số 21 tài sản cùng cập nhật hoàn chỉnh mất `2.804 ms` (khoảng 2,8 giây).
- Số đo trình duyệt là một mẫu vận hành, không phải benchmark nhiều vòng. Phần query PostgreSQL chỉ mất `0,194 ms`; phần còn lại gồm đường truyền, Vercel SSR/React Server Components và render trình duyệt.

## Kết luận hiệu năng

Lọc theo danh mục không làm query chậm hơn theo quy mô hiện tại. Chỉ mục mới giúp PostgreSQL tránh quét toàn bộ bảng theo danh mục, còn điều hướng phía client tránh tải lại toàn bộ trang. Cảm nhận thực tế vẫn phụ thuộc mạng và thời gian render phía server; cần số liệu nhiều vòng hoặc telemetry Production nếu muốn công bố SLA.

## Giới hạn bằng chứng

Môi trường hiện tại không có proxy, firewall hoặc network log được tổ chức phê duyệt. Vì vậy tài liệu này không khẳng định “không có upload/egress”; bằng chứng chỉ xác nhận mã nguồn, migration, quyền PostgreSQL/RLS, kế hoạch thực thi query, build/deploy và hành vi giao diện trong phiên Chrome được người dùng cho phép.
