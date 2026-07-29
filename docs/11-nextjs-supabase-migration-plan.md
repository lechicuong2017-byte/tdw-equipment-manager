# Kế hoạch chuyển TDW Equipment Manager sang Next.js + Supabase

Ngày lập: 2026-07-29  
Phạm vi: repo `tdw-equipment-manager`  
Mục tiêu người dùng: dưới 10 tài khoản nội bộ

## 1. Mục tiêu

1. Chuyển nguồn dữ liệu chính từ Google Sheets sang Supabase PostgreSQL.
2. Chuyển giao diện từ HTML/CSS/JavaScript thuần sang Next.js App Router.
3. Dùng Supabase Auth và PostgreSQL Row Level Security (RLS) để xác thực và phân quyền.
4. Chuyển ảnh thiết bị/bảo trì từ Google Drive sang Supabase Storage để giảm thời gian tải.
5. Giữ Google Apps Script cho các tác vụ gắn với Google Workspace:
   - xuất dữ liệu sang Google Sheets;
   - tạo tài liệu/báo cáo trên Google Drive;
   - gửi email nhắc bảo trì;
   - chạy trigger định kỳ.
6. Giữ hệ thống hiện tại hoạt động trong thời gian chuyển tiếp và chỉ chuyển sang chế độ đọc sau khi đối soát dữ liệu đạt yêu cầu.

## 2. Hiện trạng đã xác định

Luồng hiện tại:

```text
Static frontend trên Vercel
  -> /api/google-script
  -> Google Apps Script
  -> Google Sheets + Google Drive
```

Các module đang có:

- Dashboard.
- Thiết bị và hồ sơ thiết bị.
- Hình ảnh thiết bị và hình ảnh bảo trì.
- Lịch sử/kế hoạch bảo trì.
- Luân chuyển thiết bị.
- Phần mềm và license.
- Phòng ban.
- Cấu hình danh mục.
- Báo cáo.
- Người dùng và phân quyền.
- Audit log, backup và nhắc bảo trì.

Các điểm nghẽn chính:

- `getAppData` tải nhiều tập dữ liệu từ Sheets trong một lần.
- Phần lớn lọc, phân trang và tổng hợp đang thực hiện tại trình duyệt.
- Ảnh được đọc từ Drive, chuyển thành base64 qua Apps Script rồi mới trả về giao diện.
- Apps Script đang đồng thời gánh xác thực, nghiệp vụ, lưu trữ và tích hợp Google.

## 3. Kiến trúc đích

```text
Người dùng
  -> Next.js
      -> Supabase Auth
      -> Supabase PostgreSQL
      -> Supabase Storage
      -> API tích hợp Google có giới hạn quyền
          -> Google Apps Script
              -> Sheets / Drive / Gmail
```

Nguyên tắc:

- Supabase là nguồn dữ liệu chuẩn duy nhất.
- Google Sheets chỉ nhận dữ liệu xuất ra, không ghi ngược trực tiếp vào dữ liệu nghiệp vụ.
- Next.js chỉ giữ logic phục vụ giao diện; toàn vẹn dữ liệu nằm ở PostgreSQL.
- RLS là lớp phân quyền bắt buộc, không phụ thuộc vào việc ẩn/hiện nút trên giao diện.
- Apps Script không được giữ Supabase `service_role` key.

## 4. Mô hình dữ liệu đích

### Nhóm tài khoản và phân quyền

- `profiles`
- `roles`
- `user_roles`
- `role_permissions`
- `audit_logs`

Vai trò mặc định:

- `admin`
- `manager`
- `user`
- `viewer`

Giữ tương thích các mã quyền hiện tại:

- `assets.view`, `assets.manage`, `assets.delete`
- `maintenance.view`, `maintenance.manage`, `maintenance.delete`
- `movement.view`, `movement.manage`
- `software.view`, `software.manage`, `software.delete`
- `reports.view`
- `reports.assets.export`
- `reports.maintenance.export`
- `reports.software.export`
- `reports.movement.export`

### Nhóm nghiệp vụ

- `departments`
- `settings`
- `assets`
- `asset_responsibles`
- `inventory_movements`
- `maintenance_logs`
- `maintenance_plans`
- `maintenance_notification_logs`
- `software_licenses`
- `media_files`
- `export_jobs`

### Quy tắc dữ liệu quan trọng

- Dùng UUID làm khóa chính nội bộ.
- Giữ `legacy_id` để đối soát với mã đang có trong Sheets.
- `asset_code` là duy nhất đối với thiết bị chưa xóa.
- Mỗi thiết bị chỉ có tối đa một người phụ trách chính.
- Dùng soft delete cho thiết bị và dữ liệu cần audit.
- License key không nằm trong bảng dữ liệu công khai cho client.
- Mọi bảng nghiệp vụ có `created_at`, `updated_at`; bảng cần audit có `created_by`, `updated_by`.

## 5. Auth và RLS

### Auth

- Tắt đăng ký công khai.
- Tài khoản được admin mời bằng email.
- Bật MFA tối thiểu cho `admin`; mục tiêu là áp dụng cho tất cả tài khoản.
- Session được Supabase quản lý bằng cookie SSR.
- `service_role` chỉ tồn tại ở server/CI secret store, không ở trình duyệt hoặc Git.

### RLS

- Bật RLS cho mọi bảng thuộc schema được expose.
- `admin`: toàn quyền.
- `manager`: quyền nghiệp vụ theo permission đã gán.
- `user`: chỉ xem/sửa các module được cấp; dữ liệu cá nhân giới hạn theo `auth.uid()`.
- `viewer`: chỉ đọc các module được cấp.
- Storage dùng bucket riêng tư; quyền đọc/ghi dựa trên quyền module và chủ sở hữu bản ghi.
- Các thao tác đổi vai trò, xóa dữ liệu và xem license key phải ghi audit log.

## 6. Chiến lược hình ảnh

1. Lưu file trong bucket riêng tư `asset-media`.
2. `media_files` chỉ lưu metadata và object path.
3. Tạo thumbnail khi tải lên; không dùng ảnh gốc cho danh sách.
4. Dùng signed URL ngắn hạn cho ảnh riêng tư.
5. Dùng `next/image`, lazy loading và kích thước ảnh phù hợp.
6. Di chuyển ảnh Drive theo lô; ghi lại `drive_file_id` trong `legacy_source` để đối soát.
7. Sao lưu Storage độc lập vì backup PostgreSQL không chứa byte của file.

## 7. Lộ trình triển khai

### Phase A - Nền tảng, chưa ảnh hưởng production

- Tạo ứng dụng Next.js song song với frontend hiện tại.
- Thêm cấu hình môi trường mẫu, không chứa secret.
- Tạo Supabase migrations, seed role/permission và RLS.
- Tạo Auth invite-only, login, logout và middleware bảo vệ route.
- Tạo layout, menu và dashboard khung.

Điều kiện hoàn thành:

- Build Next.js thành công.
- Không có secret trong Git.
- User chưa đăng nhập không truy cập được route nội bộ.
- Kiểm thử RLS phủ bốn vai trò.

### Phase B - Thiết bị, dashboard và hình ảnh

- Chuyển danh sách thiết bị sang query phân trang phía server.
- Chuyển bộ lọc/tìm kiếm sang PostgreSQL.
- Chuyển hồ sơ thiết bị và người phụ trách.
- Chuyển upload/xem/xóa ảnh sang Supabase Storage.
- Tạo dashboard từ truy vấn tổng hợp thay vì tải toàn bộ dữ liệu.

Điều kiện hoàn thành:

- Danh sách phổ biến phản hồi dưới 1 giây trong điều kiện vận hành bình thường.
- Không tải ảnh gốc tại màn hình danh sách.
- Viewer không tạo/sửa/xóa được thiết bị hoặc file.

### Phase C - Bảo trì, luân chuyển, phần mềm

- Chuyển lịch sử và kế hoạch bảo trì.
- Chuyển luân chuyển thiết bị.
- Chuyển phần mềm/license; tách API xem key và audit.
- Giữ Apps Script gửi nhắc bảo trì thông qua API tích hợp có chữ ký.

### Phase D - Quản trị và báo cáo

- Chuyển phòng ban, danh mục và quản lý người dùng.
- Chuyển báo cáo sang query server.
- Apps Script nhận payload báo cáo đã được server xác thực để tạo Sheets/Docs/PDF.
- Hoàn thiện audit log và màn hình kiểm tra hệ thống.

### Phase E - Nhập dữ liệu và đối soát

1. Nhập thử vào Supabase staging/local từ các file CSV.
2. So sánh số lượng dòng theo bảng.
3. So sánh tổng số thiết bị, tổng giá trị, trạng thái, phòng ban và dữ liệu liên kết.
4. Lấy mẫu tối thiểu 10 bản ghi hoặc toàn bộ nếu bảng có dưới 10 dòng.
5. Di chuyển ảnh và kiểm tra hash/kích thước.
6. Chạy thử với một admin và một viewer.
7. Chốt thời gian đóng ghi hệ thống cũ.
8. Nhập phần dữ liệu cuối.
9. Chuyển frontend sang Next.js.
10. Giữ hệ thống cũ chỉ đọc trong 14 ngày.

Không thực hiện dual-write hai chiều giữa Sheets và Supabase.

### Phase F - Cutover và theo dõi

- Chỉ cutover khi backup đã được kiểm tra khôi phục.
- Theo dõi lỗi Auth, RLS, query chậm, Storage và tích hợp Apps Script.
- Duy trì phương án quay lại frontend cũ trong 14 ngày.
- Sau thời gian ổn định, tắt toàn bộ API ghi dữ liệu cũ.

## 8. Chỉ tiêu nghiệm thu

### Bảo mật

- Không có `.env`, token, API key, private key hoặc mật khẩu trong Git/history.
- Tất cả bảng expose đều bật RLS.
- Có test phủ quyền đọc/ghi/xóa theo vai trò.
- Tài khoản bị khóa mất quyền truy cập.
- Admin dùng MFA.
- Signed URL ảnh có thời hạn.
- Mọi thao tác nhạy cảm có audit log.

### Hiệu năng

- LCP trang chính mục tiêu dưới 2,5 giây.
- Query danh sách phổ biến p95 mục tiêu dưới 800 ms end-to-end.
- Phân trang ở server, không tải toàn bộ bảng.
- Ảnh danh sách dùng thumbnail và lazy loading.
- Không truyền ảnh dưới dạng base64 qua Apps Script.

### Dữ liệu

- Số dòng nguồn/đích khớp theo quy tắc loại trừ đã ghi nhận.
- Không có orphan foreign key.
- Tổng giá trị thiết bị và phân nhóm khớp báo cáo đối soát.
- Tất cả ảnh di chuyển có metadata và object tồn tại.

## 9. Backup và phục hồi

- Database: backup tự động của Supabase và bản dump định kỳ ngoài dự án.
- Storage: sao lưu object độc lập.
- Google: giữ bản backup Sheet/Drive hiện có trong thời gian chuyển tiếp.
- Thử restore database và một mẫu ảnh trước cutover.
- Không xóa dữ liệu cũ trong 14 ngày sau cutover.

## 10. Thứ tự triển khai trong repo

1. `next-app/`: ứng dụng Next.js mới, chạy song song.
2. `supabase/migrations/`: schema, function, trigger và RLS.
3. `supabase/seed.sql`: role/permission mặc định, không chứa dữ liệu thật.
4. `tools/migrate-to-supabase/`: import và đối soát.
5. `google-apps-script/`: bổ sung endpoint export/integration; không còn CRUD chính.
6. Sau nghiệm thu mới thay cấu hình deployment hiện tại.

## 11. Cổng kiểm soát an toàn

- Đã chạy kiểm tra synthetic tối thiểu trước khi truy cập repo thật.
- Môi trường hiện tại có kết nối mạng ra ngoài; không có cơ sở để khẳng định dữ liệu không rời máy.
- Không đọc/in nội dung secret ra log.
- Không tự động đưa dữ liệu thật lên Supabase khi chưa có project, secret và xác nhận phạm vi.
- Không thay cấu hình production hoặc push/deploy trước khi build và kiểm thử đạt.

