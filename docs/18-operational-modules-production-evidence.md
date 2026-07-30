# Bằng chứng production — Bảo trì, Luân chuyển và Phần mềm

Ngày kiểm tra: 2026-07-30
Phạm vi: Next.js production, Supabase PostgreSQL/RLS và giao dịch nghiệp vụ.

## 1. Thay đổi đã triển khai

- Bảo trì:
  - tạo kế hoạch định kỳ;
  - ghi nhật ký bảo trì;
  - tạm dừng/bật lại kế hoạch;
  - danh sách kế hoạch và lịch sử theo quyền RLS của từng thiết bị;
  - chặn gắn kế hoạch của thiết bị A vào nhật ký của thiết bị B;
  - tự đồng bộ `assets.last_maintenance_date` từ nhật ký.
- Luân chuyển:
  - lịch sử chỉ được thêm mới, không cho sửa hoặc xóa trực tiếp;
  - giá trị người/vị trí cũ được lấy từ bản ghi thiết bị đang khóa, không nhận từ trình duyệt;
  - ghi lịch sử và cập nhật người/vị trí hiện tại trong cùng một giao dịch PostgreSQL;
  - audit trigger hiện có tiếp tục ghi lại thay đổi.
- Phần mềm:
  - tạo và liệt kê bản quyền theo RLS;
  - chỉ nhận khóa đã che hoặc mã tham chiếu;
  - không đọc hoặc hiển thị `license_secret_ref` trong danh sách;
  - khóa thật tiếp tục nằm ngoài bảng nghiệp vụ/trình duyệt.

## 2. Migration production

Đã áp dụng trực tiếp qua Supabase SQL Editor:

- `202607300006_operational_module_workflows.sql`
- `202607300007_maintenance_data_integrity.sql`

Kết quả SQL Editor cho cả hai migration: `Success. No rows returned`.

## 3. Kiểm tra quyền và tính toàn vẹn

Kết quả kiểm tra migration 006:

| Kiểm tra | Kết quả |
|---|---|
| Hàm `record_inventory_movement` tồn tại | Đạt |
| Role `authenticated` được gọi RPC | Đạt |
| Role `authenticated` bị chặn insert trực tiếp | Đạt |
| Role `authenticated` bị chặn sửa lịch sử | Đạt |
| Policy insert/update trực tiếp đã được gỡ | Đạt |

RPC đã được thực thi trong một transaction có `ROLLBACK`; truy vấn sau đó xác nhận
không còn bản ghi kiểm thử trong `inventory_movements`.

Kết quả kiểm tra migration 007:

| Kiểm tra | Kết quả |
|---|---|
| Trigger kiểm tra plan/asset tồn tại | Đạt |
| Trigger đồng bộ ngày bảo trì tồn tại | Đạt |
| Role `authenticated` không được gọi trực tiếp hàm đồng bộ đặc quyền | Đạt |

## 4. Kiểm tra mã nguồn

- `npm run next:typecheck`: đạt.
- `npm test`: đạt.
- `npm run next:build`: đạt.
- Không cài thêm package và không thêm secret vào mã nguồn.

## 5. Giới hạn bằng chứng

- Kiểm tra giao dịch production dùng `ROLLBACK`, không tạo lịch sử luân chuyển thật.
- Kiểm tra Chrome sau deployment chỉ xác nhận SSR, điều hướng, biểu mẫu và dữ liệu
  rỗng hiện tại; chưa tạo bản ghi nghiệp vụ thật thay người dùng.
- Ảnh chụp socket mức tiến trình cho thấy các lệnh Node/npm cục bộ không mở kết nối
  TCP mới, nhưng không thay thế proxy/firewall hoặc network log toàn hệ thống.
