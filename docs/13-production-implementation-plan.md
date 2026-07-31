# Kế hoạch triển khai kiến trúc Next.js + Supabase trên production

Ngày cập nhật: 2026-07-30
Quyết định vận hành: triển khai trực tiếp trên bản chính; người dùng xác nhận đã có backup.

## 1. Trạng thái sau rà soát

| Hạng mục | Trạng thái | Ghi chú |
|---|---|---|
| Next.js App Router, SSR, Zod | Đã có nền | Build và typecheck đạt |
| Supabase PostgreSQL | Đã áp production | Migration `001` đến `013` đã chạy trên project production |
| Supabase Auth SSR | Đã có | Login, callback, MFA và bảo vệ route |
| RLS theo permission | Đã có | Migration `001` |
| RLS theo từng bản ghi | Đã bổ sung | Migration `002`: all/department/assigned/owned |
| Supabase Storage private | Đã bổ sung | Quyền object gắn với metadata và asset tương ứng |
| Quản trị user | Đã bổ sung nền | Invite Auth, role, active, MFA và data scope |
| Thiết bị và dashboard | Đã có luồng chính | Query/phân trang server, CRUD, soft delete, media |
| Linh kiện bên trong thiết bị | Đã triển khai | Migration `011`–`012`, lịch sử gắn/tháo/thay, RLS, UI hồ sơ, bộ lọc, Dashboard và báo cáo phân cấp |
| Cache | Đã có mức an toàn ban đầu | Auth/access được memoize trong cùng request; không cache chéo user |
| Apps Script export | Đã có | Báo cáo thiết bị, bảo trì, luân chuyển và phần mềm; request HMAC, timestamp, nonce, chống formula injection |
| Apps Script legacy | Đã có công tắc cutover | `read-write`, `read-only`, `disabled` |
| Bảo trì, luân chuyển, phần mềm | Đã có luồng chính | CRUD có kiểm tra đầu vào, RLS; luân chuyển dùng RPC giao dịch bất biến |
| Gmail theo kiến trúc mới | Đã có | Job Next.js đọc Supabase, claim idempotency rồi gửi payload ký số sang Apps Script |
| XLSX/PDF theo kiến trúc mới | Đã có | Cả bốn báo cáo dùng job HMAC + idempotency; logo, tên báo cáo và định dạng TDW được tạo trên Google Sheets rồi tải trực tiếp |
| Migration dữ liệu | Đã nhập nền production | 20 phòng ban, 24 settings và 72 assets đã đối soát; nguồn maintenance/movement/software đang rỗng, chưa có plans/responsibles/media |
| Migration ảnh Drive | Chưa có dữ liệu nguồn | Thumbnail riêng tư đã sẵn sàng; khi có ảnh Drive cần job riêng, checksum và đối soát object |
| Test RLS live | Đã đạt | JWT thật cho admin AAL1, manager, user, viewer và anonymous; xem `docs/15-supabase-production-security-evidence.md` |
| Deployment | Đã chuyển sang Next.js | Frontend production hiện chạy Next.js trên Vercel |

## 2. Kiến trúc vận hành bắt buộc

```text
Browser
  -> Next.js
      -> Supabase Auth
      -> Supabase PostgreSQL + RLS
      -> Supabase Storage private
      -> API server-only có kiểm tra quyền
          -> Apps Script có HMAC
              -> Google Sheets / XLSX / PDF / Drive / Gmail
```

Nguyên tắc:

- PostgreSQL là nguồn dữ liệu nghiệp vụ duy nhất.
- Google Sheets chỉ nhận dữ liệu xuất; không ghi ngược vào PostgreSQL.
- Apps Script không giữ Supabase service role key.
- Service role chỉ dùng trong mã server-only của Next.js cho Supabase Auth Admin.
- Không cache kết quả có RLS giữa nhiều người dùng. Chỉ memoize trong request hoặc cache dữ liệu công khai/không phụ thuộc user.
- Không dual-write giữa Sheets và Supabase.

## 3. Thứ tự triển khai trực tiếp production

### Cổng 0 — Trước khi ghi

1. Ghi nhận thời điểm và vị trí backup đã được người dùng xác nhận.
2. Đảm bảo dữ liệu CSV và `.env*` vẫn bị loại khỏi Git.
3. Tạo secret production bằng secret manager:
   - `NEXT_PUBLIC_SUPABASE_URL`
   - `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`
   - `NEXT_PUBLIC_APP_URL`
   - `SUPABASE_SERVICE_ROLE_KEY`
   - `APPS_SCRIPT_EXPORT_URL`
   - `APPS_SCRIPT_INTEGRATION_SECRET`
4. Không đặt secret trong lệnh được lưu history, ticket hoặc tài liệu.

### Cổng 1 — Database/Auth

1. [x] Áp migration `001` đến `010`.
2. [x] Tắt public sign-up; chỉ cho phép invite.
3. [x] Tạo/gán admin đầu tiên và hoàn tất MFA AAL2.
4. [x] Chạy phần Auth/RLS/Storage của ma trận `docs/12-supabase-security-test-matrix.md` bằng tài khoản test không chứa dữ liệu thật.
5. [x] Xác nhận viewer không có scope không thấy bản ghi; user chỉ thấy asset được gán; manager có quyền theo role/scope; admin AAL1 bị chặn.
6. [x] Security Advisor không có lỗi; 24 cảnh báo `SECURITY DEFINER` đã được ghi nhận để rà soát tiếp.

### Cổng 2 — Dữ liệu

1. [ ] Đặt hệ thống Sheets cũ ở cửa sổ bảo trì ngắn và lấy delta cuối trước cutover.
2. [x] Chạy `migration:dry-run` với validation mã trùng, ngày, số lượng, giá, orphan và khóa tham chiếu.
3. [x] Chạy `migration:apply` với cờ xác nhận cho snapshot hiện có.
4. [ ] Mở rộng/chạy import cho maintenance, movement, software, plans, responsibles và media khi có dữ liệu nguồn.
5. [x] Chạy `migration:reconcile`; 72 assets, 24 settings, 20 phòng ban và tổng giá trị đều khớp.
6. [x] Không xóa dữ liệu nguồn.

### Cổng 3 — Apps Script

1. Deploy `Code.gs` mới và đặt `TDW_NEXT_INTEGRATION_SECRET`.
2. Kiểm tra export HMAC từ một tài khoản có quyền.
3. Đặt `TDW_LEGACY_MODE=read-only` trước khi chuyển frontend.
4. Sau khi Next.js ổn định và không còn request legacy, đặt `TDW_LEGACY_MODE=disabled`.

### Cổng 4 — Next.js

1. Cấu hình Vercel Root Directory thành `next-app` hoặc chuyển Next.js thành app gốc.
2. Build production.
3. Kiểm tra login, MFA, dashboard, asset list/detail, CRUD, private media, export và admin user.
4. Chỉ mở user nghiệp vụ sau khi RLS live test đạt.

### Cổng 5 — Báo cáo và nhắc bảo trì

1. [x] Bổ sung báo cáo Sheets cho thiết bị, bảo trì, luân chuyển và phần mềm.
2. [x] Bổ sung phân công người phụ trách chính/phụ tại màn hình sửa thiết bị.
3. [x] Bổ sung job nhắc bảo trì đọc Supabase và claim từng email bằng khóa idempotency.
4. [x] Gửi Gmail qua Apps Script bằng request HMAC; không cấp Supabase key cho Apps Script.
5. [x] Cấu hình Vercel Cron chạy lúc `01:00 UTC`, tương đương `08:00 Asia/Ho_Chi_Minh`.
6. [x] Giữ nút chạy thủ công cho Admin và bảo vệ endpoint cron bằng `CRON_SECRET`.

### Cổng 6 — XLSX/PDF và nhận diện TDW

1. [x] Giới hạn định dạng mới còn `xlsx` và `pdf`; giữ phân quyền theo từng loại báo cáo.
2. [x] Xuất đủ thiết bị, bảo trì, luân chuyển và phần mềm từ dữ liệu Supabase.
3. [x] Thêm logo TDW, tên báo cáo, ngày xuất, số dòng, STT, dải tiêu đề, dòng xen kẽ và hàng tổng theo mẫu hệ cũ.
4. [x] Triển khai Apps Script version 10; giữ nguyên Web App deployment ID/URL.
5. [x] Cập nhật logo dashboard và favicon; Vercel production commit `b60dffb` đạt Ready.
6. [x] Kiểm tra production: XLSX và PDF thiết bị đều tạo thành công với 72 dòng; Google Sheets nguồn hiển thị đúng logo và tiêu đề.

### Cổng 7 — Linh kiện và cấu hình phần cứng

1. [x] Thêm `asset_kind` để phân biệt thiết bị hoàn chỉnh và linh kiện.
2. [x] Áp migration `011` lên Supabase production; 72 thiết bị cũ giữ nguyên loại thiết bị hoàn chỉnh.
3. [x] Bật RLS cho lịch sử lắp đặt; chỉ cho ghi qua RPC kiểm tra quyền và ràng buộc nghiệp vụ.
4. [x] Bổ sung gắn, tháo và thay linh kiện; một linh kiện không thể đồng thời thuộc hai máy.
5. [x] Bổ sung cấu hình hiện tại và lịch sử thay thế trong hồ sơ thiết bị/linh kiện.
6. [x] Đưa linh kiện vào báo cáo thiết bị ngay sau thiết bị chính, kèm ngày lắp và vị trí/khe.
7. [x] Vercel production commit `a0be283` đạt Success; Chrome xác nhận UI và tạo XLSX 72 dòng thành công.

### Cổng 8 — Vận hành danh mục linh kiện

1. [x] Bổ sung hành động `Thêm linh kiện` riêng tại Dashboard và danh sách tài sản.
2. [x] Bổ sung bộ lọc `Thiết bị hoàn chỉnh` / `Linh kiện bên trong`, giữ điều kiện lọc khi chuyển trang.
3. [x] Bổ sung Dashboard tách số thiết bị, tổng linh kiện, linh kiện đang lắp và linh kiện đang rời.
4. [x] Giữ hàm thống kê ở chế độ `security invoker` để số liệu tiếp tục tuân thủ RLS của người đăng nhập.
5. [x] Áp migration `012` lên Supabase production; xác minh 72 thiết bị, 0 linh kiện, 0 đang lắp và 0 đang rời tại thời điểm kiểm tra.
6. [x] Biểu mẫu mở từ `Thêm linh kiện` chọn sẵn đúng phân loại, tiêu đề và nút tạo đều dùng từ `linh kiện`.
7. [x] Vercel production commit `fcc01d1` đạt Success; Chrome xác nhận Dashboard, bộ lọc và biểu mẫu trên trang thật.

### Cổng 9 — Thumbnail ảnh thiết bị riêng tư

1. [x] Bổ sung `thumbnail_path` và chỉ mục duy nhất cho metadata ảnh.
2. [x] Cập nhật hàm kiểm tra Storage để cả ảnh gốc và thumbnail tiếp tục dùng cùng quyền RLS theo bản ghi thiết bị.
3. [x] Kiểm tra nội dung ảnh thực tế, giới hạn 40 triệu pixel, từ chối ảnh động và định dạng không khớp MIME khai báo.
4. [x] Sinh WebP tối đa 480 × 360 bằng Sharp; ghi metadata trước để rollback file tuân thủ RLS khi upload lỗi.
5. [x] Hiển thị ảnh xem nhanh tại danh sách; ảnh cũ chưa có thumbnail tự động dùng ảnh gốc.
6. [x] Không dùng Next Image Optimizer cho URL riêng tư có thời hạn, tránh tạo cache công khai ngoài kiểm soát RLS.
7. [x] Áp migration `013` lên Supabase production; bucket vẫn riêng tư và hiện có 0 media/object nên không tạo dữ liệu mẫu.
8. [x] Vercel production commit `47e9156` đạt Success; Chrome xác nhận danh sách, trạng thái rỗng và biểu mẫu upload trên trang thật.

## 4. Backlog theo thứ tự ưu tiên

### P0 — Chặn cutover

- Hoàn tất import/reconcile cho maintenance, movement, software, plans, responsibles, notification logs và media khi nguồn có dữ liệu.
- Viết job chuyển ảnh Drive sang Storage kèm checksum.
- ~~Chạy test RLS/Auth/Storage bằng JWT thật.~~ Hoàn tất ngày 2026-07-30.
- ~~Hoàn tất UI bảo trì, luân chuyển và phần mềm nếu các module này phải dùng ngay ngày cutover.~~ Hoàn tất luồng chính ngày 2026-07-30.
- Thay deployment root từ frontend cũ sang Next.js.

### P1 — Hoàn thiện kiến trúc mục tiêu

- ~~Tạo job maintenance trên server đọc Supabase, sau đó gửi payload ký số sang Apps Script/Gmail.~~ Hoàn tất ngày 2026-07-30.
- ~~Thêm XLSX/PDF report qua cùng cơ chế job + HMAC + idempotency.~~ Hoàn tất ngày 2026-07-30.
- ~~Bổ sung báo cáo maintenance/software/movement.~~ Hoàn tất ngày 2026-07-30.
- ~~Thêm audit UI và health check Next.js/Supabase/Apps Script.~~ Hoàn tất ngày 2026-07-30.
- ~~Quản lý linh kiện bên trong và lịch sử thay thế, đồng thời nhóm linh kiện theo thiết bị trong báo cáo.~~ Hoàn tất ngày 2026-07-30.
- Tạo thumbnail khi upload; hiện tại danh sách chưa hiển thị ảnh nên chưa phát sinh tải ảnh gốc.

### P2 — Vận hành

- Theo dõi lỗi Auth, RLS denial, Storage, query chậm và Apps Script.
- Backup PostgreSQL và Storage độc lập.
- Diễn tập restore định kỳ.
- Thêm E2E cho admin, manager, user, viewer và anonymous.

## 5. Điều kiện hoàn thành

- Next.js là frontend production duy nhất.
- Supabase là nguồn dữ liệu chính duy nhất.
- Không còn request CRUD nghiệp vụ tới Apps Script.
- `TDW_LEGACY_MODE=disabled`.
- RLS live test đạt cho bảng và Storage.
- Đối soát dữ liệu đạt và không có orphan.
- Không có secret hoặc dữ liệu import trong Git/history.

## 6. Giới hạn bằng chứng hiện tại

- Build, TypeScript, smoke test và cú pháp các migration liên quan đã được kiểm tra local.
- Migration `001` đến `010`, test JWT live và import nền đã được xác minh trên production; bằng chứng trong Git không chứa token hoặc mật khẩu.
- Security Advisor có 0 lỗi và 24 cảnh báo. Phần lớn liên quan các hàm `SECURITY DEFINER`; chưa được diễn giải thành “không có rủi ro” và vẫn cần rà soát quyền `EXECUTE`.
- Socket snapshot của hệ điều hành không đủ để chứng minh không có upload/egress; cần proxy, firewall hoặc network log được tổ chức phê duyệt để đưa ra kết luận đó.
- Việc “đã có backup” chưa đồng nghĩa backup đã restore thành công; trạng thái restore cần được xác nhận riêng trước thao tác không thể đảo ngược.
