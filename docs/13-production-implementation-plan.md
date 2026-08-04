# Kế hoạch triển khai kiến trúc Next.js + Supabase trên production

Ngày cập nhật: 2026-08-04
Quyết định vận hành: triển khai trực tiếp trên bản chính; người dùng xác nhận đã có backup.

## 1. Trạng thái sau rà soát

| Hạng mục | Trạng thái | Ghi chú |
|---|---|---|
| Next.js App Router, SSR, Zod | Đã có nền | Build và typecheck đạt |
| Supabase PostgreSQL | Đã áp production | Migration `001` đến `014` đã chạy trên project production |
| Supabase Auth SSR | Đã có | Login, callback, MFA và bảo vệ route |
| RLS theo permission | Đã có | Migration `001` |
| RLS theo từng bản ghi | Đã bổ sung | Migration `002`: all/department/assigned/owned |
| Supabase Storage private | Đã bổ sung | Quyền object gắn với metadata và asset tương ứng |
| Quản trị user | Đã bổ sung nền | Invite Auth, role, active, MFA và data scope |
| Thiết bị và dashboard | Đã có luồng chính | Query/phân trang server, CRUD, soft delete, media |
| Linh kiện bên trong thiết bị | Đã triển khai | Migration `011`–`012`, lịch sử gắn/tháo/thay, RLS, UI hồ sơ, bộ lọc, Dashboard và báo cáo phân cấp |
| Lọc theo danh mục | Đã triển khai | Chọn danh mục tự lọc, không có nút lọc hiển thị; query dùng chỉ mục PostgreSQL và tiếp tục tuân thủ RLS |
| Cache | Đã có mức an toàn ban đầu | Auth/access được memoize trong cùng request; không cache chéo user |
| Apps Script export | Đã có | Báo cáo thiết bị, bảo trì, luân chuyển và phần mềm; request HMAC, timestamp, nonce, chống formula injection |
| Apps Script legacy | Đã cutover production | `TDW_LEGACY_MODE=disabled`; endpoint HMAC xuất báo cáo vẫn hoạt động độc lập |
| Bảo trì, luân chuyển, phần mềm | Đã có luồng chính | CRUD có kiểm tra đầu vào, RLS; luân chuyển dùng RPC giao dịch bất biến |
| Gmail theo kiến trúc mới | Đã có | Job Next.js đọc Supabase, claim idempotency rồi gửi payload ký số sang Apps Script |
| XLSX/PDF theo kiến trúc mới | Đã có | Cả bốn báo cáo dùng job HMAC + idempotency; logo, tên báo cáo và định dạng TDW được tạo trên Google Sheets rồi tải trực tiếp |
| Migration dữ liệu | Đã nhập nền production | 20 phòng ban, 24 settings, 72 assets, 7 maintenance plans, 11 maintenance logs và 5 software licenses đã đối soát; movement/responsibles/notification logs chưa có dữ liệu nguồn |
| Migration ảnh Drive | Đã chuyển production | 11 ảnh đã vào Storage private `asset-media`; checksum và liên kết metadata/object path đều đạt 11/11 (2 ảnh thiết bị, 9 ảnh bảo trì) |
| Test RLS live | Đã đạt | JWT thật cho admin AAL1, manager, user, viewer và anonymous; xem `docs/15-supabase-production-security-evidence.md` |
| Deployment | Đã chuyển sang Next.js | Vercel `Root Directory=next-app`; bản production mới sẽ được kích hoạt từ commit chuyển media này |

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
4. [x] Mở rộng/chạy import cho maintenance plans, maintenance logs, software licenses và media khi có dữ liệu nguồn; movement, responsibles và notification logs vẫn chờ dữ liệu nguồn.
5. [x] Chạy `migration:reconcile`; 72 assets, 24 settings, 20 phòng ban và tổng giá trị đều khớp.
6. [x] Không xóa dữ liệu nguồn.

### Cổng 3 — Apps Script

1. [x] Deploy `Code.gs` mới và đặt `TDW_NEXT_INTEGRATION_SECRET`.
2. [x] Kiểm tra export HMAC từ một tài khoản có quyền.
3. [x] Đặt `TDW_LEGACY_MODE=read-only` trước khi chuyển frontend.
4. [x] Sau khi Next.js ổn định và không còn request legacy, đặt `TDW_LEGACY_MODE=disabled` ngày 2026-08-04; health Production vẫn xác nhận HMAC export.

### Cổng 4 — Next.js

1. [x] Cấu hình Vercel Root Directory thành `next-app`.
2. [x] Build production; Vercel đang chạy commit `2a34788`.
3. [x] Kiểm tra login, MFA, dashboard, asset list/detail, CRUD, private media, export và admin user qua các bằng chứng production đã ghi nhận.
4. [x] Chỉ mở user nghiệp vụ sau khi RLS live test đạt.

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
7. [x] Áp migration `013` lên Supabase production; bucket vẫn riêng tư và đã đối soát 11 media/object sau khi chuyển dữ liệu thật.
8. [x] Vercel production commit `47e9156` đạt Success; Chrome xác nhận danh sách, trạng thái rỗng và biểu mẫu upload trên trang thật.

### Cổng 10 — Bộ lọc danh mục tức thời

1. [x] Bổ sung danh sách danh mục và số lượng bằng RPC `security invoker`, tiếp tục chỉ trả dữ liệu người đăng nhập được phép xem theo RLS.
2. [x] Bổ sung chỉ mục một phần theo `asset_type, updated_at` cho các tài sản chưa xóa.
3. [x] Chọn trạng thái, phân loại hoặc danh mục sẽ tự lọc ngay; không còn nút lọc hiển thị và điều kiện vẫn được giữ khi chuyển trang.
4. [x] Dùng điều hướng phía client của Next.js để tránh tải lại toàn bộ trang.
5. [x] Áp migration `014` lên Supabase production; xác minh 10 danh mục, trong đó Laptop có 21 và Desktop PC có 8 tài sản.
6. [x] `EXPLAIN ANALYZE` cho Laptop dùng `assets_type_updated_active_idx`, trả 20 dòng của trang đầu trong `0,194 ms`.
7. [x] Vercel production commit `de443b8` đạt Success; Chrome xác nhận chọn Laptop và Desktop PC tự cập nhật URL, tổng số và danh sách.

### Cổng 11 — Backup chuyển tiếp và lịch vận hành

1. [x] Xác nhận thư mục `TDW Equipment Manager Backup` có 18 bản backup trước lần kiểm tra và bản mới nhất trước khi cấu hình là ngày 2026-08-04.
2. [x] Cấu hình Script Properties cho thư mục backup và thư mục media production; không ghi ID thư mục vào Git.
3. [x] Chạy `backupSystemData()` thành công; bản `TDW-backup-20260804-102601` có file dữ liệu `TDW-data-20260804-102601` và thư mục `media` chứa 11 ảnh.
4. [x] Chạy `installDailyBackupTrigger()` thành công; Apps Script hiện có 1 trigger time-based cho `backupSystemData`, chạy hằng ngày lúc 02:00 Asia/Ho_Chi_Minh.
5. [x] Chuyển media Drive sang Storage private; đã đối soát 11/11 object, metadata, checksum và liên kết object path.
6. [ ] Backup PostgreSQL và Storage độc lập, cùng diễn tập restore tách biệt, vẫn chờ cấu hình backup native/đích staging của Supabase.
7. [x] Kiểm tra Dashboard ngày 2026-08-04: project đang ở Free Plan, không có project backup; không tự nâng cấp vì sẽ phát sinh chi phí.

## 4. Backlog theo thứ tự ưu tiên

### P0 — Chặn cutover

- Hoàn tất import/reconcile cho maintenance plans, maintenance logs, software licenses và media; movement, responsibles và notification logs sẽ nhập khi nguồn có dữ liệu.
- ~~Chuyển 11 ảnh Drive sang Storage private kèm checksum và đối soát metadata.~~ Hoàn tất ngày 2026-08-04 sau khi người dùng phê duyệt cửa sổ chuyển production.
- ~~Chạy test RLS/Auth/Storage bằng JWT thật.~~ Hoàn tất ngày 2026-07-30.
- ~~Hoàn tất UI bảo trì, luân chuyển và phần mềm nếu các module này phải dùng ngay ngày cutover.~~ Hoàn tất luồng chính ngày 2026-07-30.
- ~~Thay deployment root từ frontend cũ sang Next.js.~~ Hoàn tất ngày 2026-08-04; Vercel xác nhận `Root Directory=next-app`.

### P1 — Hoàn thiện kiến trúc mục tiêu

- ~~Tạo job maintenance trên server đọc Supabase, sau đó gửi payload ký số sang Apps Script/Gmail.~~ Hoàn tất ngày 2026-07-30.
- ~~Thêm XLSX/PDF report qua cùng cơ chế job + HMAC + idempotency.~~ Hoàn tất ngày 2026-07-30.
- ~~Bổ sung báo cáo maintenance/software/movement.~~ Hoàn tất ngày 2026-07-30.
- ~~Thêm audit UI và health check Next.js/Supabase/Apps Script.~~ Hoàn tất ngày 2026-07-30.
- ~~Quản lý linh kiện bên trong và lịch sử thay thế, đồng thời nhóm linh kiện theo thiết bị trong báo cáo.~~ Hoàn tất ngày 2026-07-30.
- ~~Tạo thumbnail khi upload và hiển thị ảnh xem nhanh riêng tư trong danh sách.~~ Hoàn tất ngày 2026-07-30.
- ~~Bổ sung màn hình sửa bản quyền phần mềm và điều hướng trực tiếp từ tên phần mềm.~~ Hoàn tất ngày 2026-08-04.
- ~~Mã hóa key bản quyền bằng AES-256-GCM, tách ciphertext khỏi bảng nghiệp vụ, chỉ Admin + MFA được lưu/xem và ghi audit mỗi lần truy cập.~~ Hoàn tất production ngày 2026-08-04: migration `202608040002` có 4 policy RLS và 2 RPC admin; khóa mã hóa đã được cấu hình dạng Sensitive trên Vercel.

### P2 — Vận hành

- Theo dõi lỗi Auth, RLS denial, Storage, query chậm và Apps Script.
- ~~Backup chuyển tiếp Sheet/Drive và lịch hằng ngày.~~ Hoàn tất ngày 2026-08-04; backup PostgreSQL/Storage độc lập vẫn chờ cấu hình native/staging.
- Diễn tập restore định kỳ.
- Đã bổ sung nền E2E Playwright: anonymous production đạt 2/2 bài kiểm tra; các project admin, manager, user và viewer tự bật khi truyền đường dẫn storage state local đã ignore, còn chờ chuẩn bị phiên test riêng để chạy đủ ma trận.

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
- Migration `001` đến `014`, test JWT live, import nền và cutover Apps Script đã được xác minh trên production; bằng chứng trong Git không chứa token hoặc mật khẩu.
- Security Advisor có 0 lỗi và 24 cảnh báo. Phần lớn liên quan các hàm `SECURITY DEFINER`; chưa được diễn giải thành “không có rủi ro” và vẫn cần rà soát quyền `EXECUTE`.
- Socket snapshot của hệ điều hành không đủ để chứng minh không có upload/egress; cần proxy, firewall hoặc network log được tổ chức phê duyệt để đưa ra kết luận đó.
- Việc “đã có backup” chưa đồng nghĩa backup đã restore thành công; trạng thái restore cần được xác nhận riêng trước thao tác không thể đảo ngược.
