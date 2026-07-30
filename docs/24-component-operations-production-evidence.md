# Bằng chứng production — Vận hành danh mục linh kiện

Ngày kiểm tra: 2026-07-30  
Phạm vi: tạo linh kiện, lọc danh mục, thống kê Dashboard, Supabase RLS và Vercel Production.

## Thay đổi đã triển khai

- Dashboard và danh sách tài sản có hai hành động riêng: `Thêm thiết bị` và `Thêm linh kiện`.
- Danh sách tài sản lọc được theo `Thiết bị hoàn chỉnh` hoặc `Linh kiện bên trong`; điều kiện lọc được giữ khi chuyển trang.
- Dashboard hiển thị riêng số thiết bị hoàn chỉnh, tổng linh kiện, linh kiện đang lắp và linh kiện đang rời.
- Biểu mẫu mở từ `Thêm linh kiện` chọn sẵn `Linh kiện bên trong`, hiển thị tiêu đề `Thêm linh kiện` và nút `Tạo linh kiện`.

## Kiểm tra trước production

- Repo tổng hợp tối thiểu, không chứa dữ liệu thật, đạt 7 kiểm tra về lọc và thống kê linh kiện.
- `npm run next:typecheck`: đạt.
- `npm test`: đạt.
- `npm run next:build`: đạt.
- `git diff --check`: đạt.

## Xác minh Supabase production

- Migration `202607300012_component_dashboard_stats.sql` chạy thành công.
- Hàm `get_dashboard_stats()` vẫn là `security invoker`, do đó truy vấn chạy theo quyền và RLS của người gọi.
- Role `authenticated` tiếp tục có quyền gọi hàm thống kê.
- Kết quả tại thời điểm kiểm tra: 72 tài sản, gồm 72 thiết bị hoàn chỉnh và 0 linh kiện; 0 linh kiện đang lắp và 0 linh kiện đang rời.
- Thống kê trạng thái và tổng giá trị cũ vẫn được trả về cùng các chỉ số mới.

## Xác minh Vercel và Chrome

- Vercel production commit `fcc01d1` báo `success`.
- Dashboard trang thật hiển thị 72 thiết bị hoàn chỉnh, 0 tổng linh kiện, 0 đang lắp và 0 đang rời.
- Trang `/assets?kind=COMPONENT` chọn đúng bộ lọc `Linh kiện bên trong` và hiển thị `0 linh kiện`.
- Hai nút thêm thiết bị/linh kiện xuất hiện đúng theo quyền quản trị hiện tại.
- Liên kết `Thêm linh kiện` mở đúng `/assets/new?kind=component`; phân loại được chọn sẵn và câu chữ biểu mẫu khớp với nghiệp vụ linh kiện.

Không tạo linh kiện mẫu trong production để tránh làm bẩn dữ liệu thật. Khi người dùng khai báo linh kiện đầu tiên, các chỉ số Dashboard sẽ cập nhật trực tiếp từ PostgreSQL trong phạm vi RLS của tài khoản đang xem.

## Giới hạn bằng chứng mạng

Môi trường hiện tại không có proxy, firewall hoặc network log được tổ chức phê duyệt. Vì vậy tài liệu này không khẳng định “không có upload/egress”; bằng chứng chỉ xác nhận mã nguồn, trạng thái database, quyền, build/deploy và hành vi giao diện trong phiên được người dùng cho phép.
