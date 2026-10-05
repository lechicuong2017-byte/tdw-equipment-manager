# TDW Equipment Manager — Next.js

Ứng dụng mới chạy song song với frontend hiện tại trong thời gian chuyển đổi.

## Phạm vi đã triển khai

- Next.js App Router và TypeScript.
- Supabase Auth SSR bằng cookie.
- Proxy bảo vệ route bằng `getClaims()`.
- Dashboard tổng hợp từ PostgreSQL.
- Danh sách thiết bị phân trang/lọc tại server.
- Thêm, sửa, lưu trữ và xem hồ sơ thiết bị.
- Ảnh thiết bị trong bucket private với signed URL.
- Xuất báo cáo XLSX/PDF trực tiếp từ Supabase, tải file không cần tài khoản Google.
- Phân quyền dữ liệu theo `all`, `department`, `assigned` hoặc `owned`.
- Admin mời user, gán role, khóa/mở tài khoản, bắt buộc MFA và cấp data scope.
- Auth/access được memoize trong phạm vi một server request, không cache chéo user.

Các module bảo trì, luân chuyển, phần mềm và quản trị đã có schema/RLS và trang định tuyến; giao diện nghiệp vụ tiếp tục được chuyển theo kế hoạch.

## Cấu hình local

1. Tạo Supabase project.
2. Chạy migration trong `../supabase/migrations`.
3. Tạo `next-app/.env.local` từ `.env.example`.
4. Điền URL và publishable key.
5. Đặt service role key trong secret manager server-only để dùng Supabase Auth Admin; không dùng biến `NEXT_PUBLIC_*`, không đưa xuống browser hoặc Git.
6. Mời admin đầu tiên trong Supabase Auth và gán role theo `../supabase/seed.sql`.
7. Tắt đăng ký công khai và bật MFA cho admin.

## Chạy

Từ thư mục gốc:

```bash
npm run next:dev
npm run next:typecheck
npm run next:build
```

## Tích hợp Apps Script

### Đường xuất báo cáo hiện tại

Các nút xuất thiết bị, thanh lý, bảo trì, luân chuyển, phần mềm và PDF xe dùng
`POST /api/reports/export`; XLSX xe dùng các route `/api/vehicles/reports/*`.
VPP, viễn thông, VETC và khảo sát giữ route xuất riêng, cùng gọi
`lib/vehicle-report-brand.ts` để căn giữa tên công ty, địa chỉ, tiêu đề và bộ lọc.
Logo nguồn giữ nguyên màu tại `public/tdw-report-logo.png`.
Mẫu Excel nhập câu hỏi khảo sát giữ dòng tiêu đề đầu tiên để parser đọc đúng.
Đường xuất cũ bên dưới không còn được các nút báo cáo gọi; các tích hợp nhắc hạn
cũ chưa thuộc thay đổi trình bày báo cáo này.

Đặt cùng một secret tại:

- secret manager của Next.js: `APPS_SCRIPT_INTEGRATION_SECRET`;
- Apps Script Property: `TDW_NEXT_INTEGRATION_SECRET`.

Đặt Web App URL vào `APPS_SCRIPT_EXPORT_URL`.

Request export có timestamp, nonce và HMAC SHA-256. Apps Script từ chối request hết hạn, chữ ký sai hoặc nonce đã dùng.
