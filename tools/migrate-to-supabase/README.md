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

Tài khoản Auth và ảnh Drive không được tự động nhập bởi công cụ nền này.
