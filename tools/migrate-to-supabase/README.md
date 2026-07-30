# Công cụ nhập và đối soát Supabase

Các công cụ này không ghi dữ liệu nếu không có `--apply` và cờ xác nhận.

## 1. Kiểm tra dữ liệu nguồn

```bash
npm run migration:dry-run
```

## 2. Nhập dữ liệu

Thiết lập secret trong file local đã ignore hoặc secret manager, sau đó chạy:

```bash
SUPABASE_URL=... \
SUPABASE_SERVICE_ROLE_KEY=... \
TDW_MIGRATION_CONFIRM=APPLY_TO_SUPABASE \
npm run migration:apply
```

Không truyền secret trong nội dung ticket, chat hoặc commit.

Biến `SUPABASE_SERVICE_ROLE_KEY` nên chứa secret API key mới dạng
`sb_secret_...`. Công cụ vẫn nhận JWT service-role legacy để phục vụ chuyển đổi,
nhưng không nên tạo hoặc bật lại legacy API keys.

## 3. Đối soát

```bash
SUPABASE_URL=... \
SUPABASE_SERVICE_ROLE_KEY=... \
npm run migration:reconcile
```

Đối soát hiện kiểm tra:

- số thiết bị;
- mã thiết bị thiếu/thừa;
- tổng giá trị theo `quantity * unit_price`;
- số dòng danh mục;
- số phòng ban, bao gồm phòng ban được suy ra từ dữ liệu thiết bị.
- số log bảo trì;
- số dòng luân chuyển;
- số bản quyền phần mềm.

Lệnh đối soát trả mã lỗi nếu số lượng bắt buộc, mã thiết bị hoặc tổng giá trị
không khớp.

Tài khoản Auth và ảnh Drive không được tự động nhập bởi công cụ nền này.

Giá trị license key cũ không được chép vào PostgreSQL. Công cụ chỉ tạo giá trị
masked và `license_secret_ref` để một quy trình riêng chuyển secret từ Apps
Script Properties sang secret manager được phê duyệt.
