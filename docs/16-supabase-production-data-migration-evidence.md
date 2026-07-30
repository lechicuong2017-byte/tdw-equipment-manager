# Bằng chứng nhập và đối soát dữ liệu production

Ngày thực hiện: 2026-07-30
Project ref: `krrmcftzbtbfggrewala`
Nguồn: `data/google_sheet_import/` local, đã bị loại khỏi Git.

## Dry-run và validation

Dry-run được mở rộng để chặn:

- asset thiếu mã/tên, mã hoặc legacy ID trùng;
- ngày, số lượng hoặc đơn giá không hợp lệ;
- phòng ban và settings thiếu/trùng khóa;
- maintenance, movement hoặc software tham chiếu asset không tồn tại.

Kết quả đầu vào:

| Bảng | Số dòng |
|---|---:|
| Departments, gồm dữ liệu suy ra từ assets | 20 |
| Settings | 24 |
| Assets | 72 |
| Maintenance logs | 0 |
| Inventory movements | 0 |
| Software licenses | 0 |

Validation đạt, không có lỗi chặn. Có 17 dòng chỉ có `total_price` mà thiếu
`unit_price`; importer suy ra `unit_price = total_price / quantity` trước khi
PostgreSQL tính lại cột tổng.

## Migration schema phát sinh

- `004`: cấp quyền bảng, sequence và function cần thiết cho role `service_role`;
  đồng thời thiết lập default privileges cho object mới.
- `005`: thêm unique constraint `departments(name)` để PostgREST upsert theo
  khóa `name`; unique index `lower(name)` vẫn giữ kiểm tra không phân biệt hoa
  thường.

## Apply và reconcile

Apply production chạy bằng secret API key mới dạng `sb_secret`, không dùng key
legacy. Upsert hoàn tất:

- 20 phòng ban;
- 24 settings;
- 72 assets;
- 0 maintenance logs, movements và software licenses vì file nguồn rỗng.

Reconcile cuối lúc `2026-07-30T06:51:39.067Z`:

| Kiểm tra | Nguồn | Production |
|---|---:|---:|
| Assets | 72 | 72 |
| Settings | 24 | 24 |
| Departments kể cả suy ra | 20 | 20 |
| Maintenance logs | 0 | 0 |
| Inventory movements | 0 | 0 |
| Software licenses | 0 | 0 |
| Tổng giá trị | 282.729.000 | 282.729.000 |

Không có mã thiết bị thiếu hoặc thừa; kết quả `passed=true`.

## Xoay vòng credential

Trong lúc kiểm tra dashboard, JWT service-role legacy xuất hiện trong DOM và
được coi là đã lộ. Biện pháp xử lý đã hoàn tất ngay:

1. thay biến Vercel `SUPABASE_SERVICE_ROLE_KEY` bằng secret API key mới;
2. redeploy production với Project Settings mới;
3. xác minh Supabase Auth Admin trả HTTP 200 bằng secret mới;
4. tắt legacy anon/service-role API keys;
5. thu hồi previous signing key loại `Legacy HS256 (Shared Secret)`;
6. xác nhận chỉ còn current signing key `ECC (P-256)`.

Không ghi secret vào repository, tài liệu hoặc file nguồn. File môi trường tạm
quyền `0600` đã được xóa sau đối soát.

## Kiểm tra ứng dụng

- Dashboard production hiển thị 72 thiết bị.
- Danh sách thiết bị tải bình thường và không còn bản ghi kiểm thử.
- Form tạo thiết bị có 20 phòng ban cộng một lựa chọn mặc định.
- Phiên admin AAL2 hiện tại vẫn hoạt động sau khi thu hồi signing key legacy.

## Phần chưa có dữ liệu nguồn

- Maintenance logs, inventory movements và software licenses đang có file chỉ
  gồm header.
- Chưa có file maintenance plans, asset responsibles, notification logs hoặc
  media.
- `Users.csv` không được tự động biến thành Auth users; tài khoản vẫn phải đi
  qua luồng invite.
- Ảnh Google Drive chưa chuyển sang Storage.
- Cần lấy delta cuối và đặt Sheets ở read-only trước cutover hoàn toàn.

## Giới hạn bằng chứng

Không có proxy/firewall log được tổ chức phê duyệt trong phiên này, nên kết quả
không chứng minh rằng môi trường không có upload/egress ngoài các request
Supabase và Vercel quan sát được.
