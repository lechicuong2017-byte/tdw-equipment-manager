# TDW Equipment Manager

Ứng dụng quản lý máy tính, máy in, màn hình, ổ cứng và thiết bị nội bộ cho TDW.

Kiến trúc mục tiêu đang được triển khai:

- `next-app/`: frontend Next.js, SSR, kiểm tra đầu vào và cache theo request.
- `supabase/`: PostgreSQL, Auth, RLS và Storage private.
- `google-apps-script/`: chỉ giữ tích hợp Google Sheets/Docs/Drive/Gmail.
- `app/`, `api/`: hệ thống Google Sheets cũ, chỉ giữ trong giai đoạn cutover.

## Chuyển đổi Next.js + Supabase

Phiên bản mới đang được xây song song tại:

```text
next-app/                    Giao diện Next.js mới
supabase/migrations/         PostgreSQL schema, trigger và RLS
tools/migrate-to-supabase/   Nhập CSV và đối soát dữ liệu
docs/11-nextjs-supabase-migration-plan.md
```

Frontend hiện tại vẫn được giữ nguyên trong giai đoạn chuyển tiếp. Không thay
cấu hình production sang `next-app/` cho đến khi migration, Auth/RLS, ảnh và
đối soát dữ liệu hoàn tất.

Trạng thái rà soát và thứ tự triển khai production:

```text
docs/13-production-implementation-plan.md
```

## Tính năng chính

- Dashboard tổng quan thiết bị.
- Bộ lọc theo nhóm, năm, bộ phận, tình trạng.
- Danh sách thiết bị có phân trang.
- Thêm, sửa, xóa thiết bị.
- Trang Bảo trì.
- Trang Báo cáo có biểu đồ và xuất CSV/PDF.
- Trang Cấu hình quản lý dropdown: phòng ban, tình trạng, loại thiết bị, phần mềm.
- Đăng nhập trước khi vào app.
- Admin quản lý user: thêm, sửa, khóa, reset mật khẩu và phân quyền.

## Deploy lên Vercel

Xem hướng dẫn chi tiết tại:

```text
docs/06-github-vercel-deploy.md
```

Checklist truoc va sau deploy:

```text
docs/07-release-checklist.md
```

## Cấu trúc

```text
app/                  Giao diện web chạy trên Vercel
api/                  Vercel serverless proxy gọi Apps Script
data/                 Dữ liệu seed/import từ Excel
docs/                 Tài liệu triển khai
google-apps-script/   Backend Apps Script cho Google Sheet
tools/                Script import/convert dữ liệu
```
