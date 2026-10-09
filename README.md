# TDW Equipment Manager

Hệ thống quản lý nội bộ TDW: thiết bị, bảo trì, luân chuyển, phần mềm, xe ô tô,
VPP, dịch vụ viễn thông, khảo sát và quản trị người dùng.

Kiến trúc hiện tại:

- `next-app/`: ứng dụng chính Next.js App Router, kiểm tra đầu vào và cache theo request.
- `supabase/`: PostgreSQL, Auth, RLS và Storage private.
- `google-apps-script/`: tích hợp Google cũ, còn phụ thuộc trong luồng nhắc hạn.
- `app/`, `api/`: mã frontend/proxy Google Sheets đời cũ, không phải ứng dụng chính.

## Bắt đầu tìm hiểu hệ thống

- [Bản đồ mã nguồn và tối ưu theo từng phân hệ](docs/41-system-code-map-and-performance.md): tìm đúng trang, hàm xử lý, dữ liệu và nơi xuất báo cáo khi cần sửa.
- [Bảo mật và vận hành](docs/10-security-and-operations.md): quy trình và các yêu cầu vận hành cần đối chiếu với kiến trúc hiện tại.

## Chuyển đổi Next.js + Supabase

Mã nguồn ứng dụng và schema nằm tại:

```text
next-app/                    Giao diện Next.js mới
supabase/migrations/         PostgreSQL schema, trigger và RLS
tools/migrate-to-supabase/   Nhập CSV và đối soát dữ liệu
docs/11-nextjs-supabase-migration-plan.md
```

Ứng dụng chính nằm trong `next-app/`, dùng Supabase Auth, PostgreSQL và Storage
private. Các nút xuất báo cáo hiện tại tạo XLSX/PDF trực tiếp từ dữ liệu Supabase;
người dùng vẫn cần quyền trong ứng dụng, nhưng không cần Gmail để tải file.
Không xoá tích hợp Apps Script hoặc migration chỉ vì không được import trong
giao diện: nhắc hạn vẫn có phụ thuộc, còn migration cần để tái tạo schema.

Kế hoạch chuyển đổi trước đây (tài liệu lịch sử):

```text
docs/13-production-implementation-plan.md
```

## Tính năng chính

- Dashboard tổng quan thiết bị.
- Bộ lọc theo nhóm, năm, bộ phận, tình trạng.
- Danh sách thiết bị có phân trang.
- Thêm, sửa, xóa thiết bị.
- Trang Bảo trì.
- Trang Báo cáo có biểu đồ và xuất XLSX/PDF.
- Quản lý xe và VETC, VPP, chi phí viễn thông/SIM và khảo sát công ty.
- Trang Cấu hình quản lý dropdown: phòng ban, tình trạng, loại thiết bị, phần mềm.
- Đăng nhập trước khi vào app.
- Admin quản lý user: thêm, sửa, khóa, reset mật khẩu và phân quyền.

## Deploy lên Vercel

Chạy và kiểm tra từ thư mục gốc sau khi cấu hình local theo
[README ứng dụng](next-app/README.md):

```bash
npm run next:dev
npm run next:typecheck
npm run next:build
npm --prefix next-app run audit:code
node tools/test-code-optimization.mjs
```

Không đưa `.env`, key, token hoặc dữ liệu nhạy cảm vào Git. Các công cụ nhập dữ
liệu thật/cập nhật production cần được kiểm tra phạm vi và phê duyệt trước khi chạy.

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
next-app/             Ứng dụng Next.js chính trên Vercel
supabase/migrations/  Schema, RPC, trigger và RLS
app/, api/            Frontend và proxy Google Sheets đời cũ
data/                 Tệp seed/import đời cũ
docs/                 Tài liệu vận hành và bằng chứng triển khai
google-apps-script/   Tích hợp Google đời cũ
tools/                Kiểm thử, kiểm tra mã nguồn và công cụ vận hành
```
