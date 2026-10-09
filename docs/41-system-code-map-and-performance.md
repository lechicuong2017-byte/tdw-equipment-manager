# Bản đồ mã nguồn và tối ưu hệ thống TDW

Ngày rà soát: 09/10/2026. Đường dẫn trong tài liệu tính từ thư mục gốc repository.
Đây là bản đồ của mã nguồn hiện tại, không phải xác nhận tất cả luồng đã được
kiểm thử trực tiếp bằng dữ liệu production.

## 1. Tìm đúng nơi sửa

Ứng dụng chính nằm trong `next-app/`. Một chức năng thường có bốn lớp:

```text
app/(protected)/<phân hệ>/page.tsx   → đọc dữ liệu, lọc và dựng trang
components/<form hoặc danh sách>   → tương tác, xem trước, chọn và thông báo
app/(protected)/<phân hệ>/actions.ts → kiểm tra quyền/đầu vào, ghi dữ liệu
lib/ + supabase/migrations/         → hàm dùng chung, RPC, schema và RLS
```

API xuất file nằm trong `next-app/app/api/`. Khi sửa tổng chi phí hoặc bộ lọc,
đối chiếu cả trang hiển thị và route xuất file; không chỉ thay nhãn trên giao diện.

| Phân hệ | Nơi đọc và ghi nghiệp vụ | Hàm / thành phần cần đối chiếu | Dữ liệu chính |
| --- | --- | --- | --- |
| Thiết bị | `app/(protected)/assets/`, `assets/actions.ts` | `asset-form`, `asset-component-manager`, `lib/asset-code.ts`, `lib/media-ownership.ts` | `assets`, linh kiện, thanh lý, tài liệu và ảnh thiết bị |
| Bảo trì thiết bị | `app/(protected)/maintenance/`, `maintenance/actions.ts` | `maintenance-forms`, `maintenance-log-editor`, `maintenance-plan-editor`, `lib/maintenance-reminders.ts` | `maintenance_plans`, `maintenance_logs` |
| Luân chuyển | `app/(protected)/movements/`, `movements/actions.ts` | `movement-form`, kiểm tra thiết bị và nơi nhận | `inventory_movements` |
| Phần mềm | `app/(protected)/software/`, `software/actions.ts` | `lib/software-license-secret.ts`; thông tin bí mật chỉ xử lý server-side | `software_licenses`, `software_license_assets`, `software_license_secrets` |
| Xe ô tô | `app/(protected)/vehicles/page.tsx`, `vehicles/actions.ts` | `vehicle-forms`, `vehicle-history-tabs`, các hàm lịch sử/nhập liệu trong `lib/vehicle-*.ts` | `vehicles`, `vehicle_inspections`, `vehicle_insurances`, `vehicle_repairs`, `vehicle_fuel_logs`, `vehicle_documents` |
| VETC | `vehicles/vehicle-tolls-actions.ts`, `components/vehicle-toll-section.tsx` | Các hàm VETC trong `lib/vehicle-toll*.ts`; kiểm tra kỳ hiệu lực, chống trùng và lịch sử | Vé lẻ theo tháng, lượt qua trạm, vé quý và view trạng thái vé quý |
| VPP | `app/(protected)/supplies/`, `supplies/actions.ts` | `supply-forms`, `lib/supply-item-codes.ts`; nhóm dòng theo phiếu và báo giá | `supply_items`, phiếu/chi tiết yêu cầu, báo giá, nhập/xuất và tồn kho |
| Viễn thông | `app/(protected)/telecom/`, `telecom/actions.ts` | `lib/telecom-invoices.ts`, phần xem trước/nhập PDF | `telecom_invoices` |
| Số điện thoại/SIM | `telecom/phones/page.tsx`, `telecom/phones/actions.ts` | `lib/telecom-phones.ts`, `lib/telecom-phone-workbook.ts` | `telecom_phones` |
| Khảo sát | `app/(protected)/surveys/`, `surveys/actions.ts` | `lib/surveys.ts`, `lib/survey-xlsx.ts`; trang công khai `app/s/[token]/` | `company_surveys`, `survey_responses`; RPC đọc/gửi khảo sát công khai |
| Quản trị | `app/(protected)/admin/` | `lib/auth.ts`, `lib/system-modules.ts`, `lib/system-health.ts`, `lib/system-capacity.ts` | User/role, scope dữ liệu, quyền phân hệ, cấu hình và nhật ký |

Các đường dẫn `app/`, `components/`, `lib/` trong bảng, trừ khi ghi rõ khác,
đều nằm dưới `next-app/`. Migrations là nguồn schema và chính sách quyền; không
xoá migration đã chạy chỉ vì bảng không được gọi trực tiếp từ một trang.

## 2. Các hàm dùng chung đã được tái sử dụng

| Hàm / tệp | Vai trò và nơi sử dụng | Quy tắc khi sửa |
| --- | --- | --- |
| `lib/auth.ts` | Xác thực, MFA và quyền; dùng tại trang/action/API được bảo vệ | Cache chỉ trong request. Không đổi sang cache toàn cục hay TTL dùng chung giữa user. |
| `lib/format.ts` | Định dạng tiền/số/ngày; `vietnamToday` và `vietnamMonth` dùng cho thiết bị, xe, VPP, viễn thông, VETC và nhắc hạn | Dùng múi giờ Việt Nam. Tái sử dụng formatter, không lưu cố định ngày hiện tại. |
| `lib/collections.ts` | `groupBy` gom dòng theo khoá trong một lượt O(n): bảo trì, VPP, quyền người dùng | Không sửa dữ liệu đầu vào; Map chỉ tồn tại trong lần xử lý. |
| `lib/surveys.ts` | `summarizeAnswers` đếm câu trả lời và từng lựa chọn để xuất khảo sát | Lựa chọn lặp trong cùng câu trả lời chỉ đếm một lần, giữ cách tính cũ. |
| `lib/vehicle-report-brand.ts` | Header XLSX chung: logo TDW, tên công ty, địa chỉ, tiêu đề và bộ lọc | Giữ ảnh nguồn `public/tdw-report-logo.png`. Một workbook dùng chung một ảnh cho nhiều sheet. |
| `components/action-toast.tsx` và modal | Thông báo kết quả, đóng popup thành công rồi làm mới dữ liệu | Toast của form phải nằm trong boundary của popup; không phát thông báo thành công từ một form khác. |

Ghi chú trong mã tập trung vào mục đích, quyền truy cập, vòng đời và lý do tối ưu;
không lặp chú thích cho từng dòng cú pháp dễ đọc.

## 3. Các điểm tối ưu của đợt rà soát

- Ghi nhận bảo trì không có ảnh không còn truy vấn mã thiết bị để đặt tên ảnh.
- Trang xe chỉ tải metadata tài liệu cho các bản ghi đang xem, thay vì tải tối
  đa 1.500 tài liệu toàn phân hệ. Không có dòng thì không truy vấn tài liệu.
  Truy vấn này phụ thuộc danh sách ID, nên cần đo độ trễ thực tế để đánh giá
  đánh đổi giữa một lượt mạng phụ thuộc và lượng dữ liệu nhỏ hơn.
- Trang báo cáo thiết bị tải các nguồn độc lập song song sau kiểm tra quyền;
  bộ lọc cấu hình dùng đúng cột `active` của schema.
- VPP và quản trị user gom dữ liệu một lần, tránh lặp quét hoặc sao chép mảng
  mỗi khi thêm một dòng vào nhóm. Từ khoá tìm VPP được chuẩn hoá một lần.
- VETC tái sử dụng formatter tháng; các phân hệ tái sử dụng cách tính ngày Việt Nam.
- Xuất khảo sát đếm tất cả lựa chọn trong một lượt trên câu trả lời cho mỗi câu
  hỏi, không lọc lại toàn bộ phản hồi cho từng option.
- XLSX nhiều sheet nhúng logo một lần trong workbook; vị trí mỗi sheet vẫn riêng.

Các thay đổi trên có kiểm thử dữ liệu tổng hợp. Chưa có phép đo trước/sau bằng
phiên production, nên không khẳng định tỷ lệ tăng tốc hay đã hết mọi hiện tượng chậm.

## 4. Xuất báo cáo

| Loại báo cáo | Route cần tìm dưới `next-app/app/api/` |
| --- | --- |
| Thiết bị, thanh lý, bảo trì, luân chuyển, phần mềm; PDF xe | `reports/export/route.ts` |
| XLSX xe | `vehicles/reports/xlsx/route.ts` |
| So sánh chi phí hai năm | `vehicles/reports/comparison/route.ts` |
| VETC | `vehicles/tolls/report/route.ts` |
| VPP | `supplies/reports/route.ts` |
| Viễn thông | `telecom/report/route.ts` |
| Kết quả khảo sát | `surveys/[id]/export/route.ts` |

Các nút báo cáo hiện tại trả file trực tiếp, không yêu cầu Gmail. Quyền đăng
nhập/phân hệ của ứng dụng vẫn bắt buộc. Mẫu nhập câu hỏi khảo sát tại
`surveys/template/route.ts` giữ header máy đọc được, không chèn header trang trí
làm sai parser.

## 5. Code đã loại bỏ và phần phải giữ

Đã bỏ `components/module-placeholder.tsx` không còn nơi gọi, CSS
`.migration-panel` / `.migration-badge` chỉ phục vụ component này, một type và
một tham số callback không dùng. Các tệp xoá có thể khôi phục từ Git history.

Không tự động xoá:

- `google-apps-script/`, `lib/apps-script.ts` và route tích hợp cũ: hai luồng
  nhắc hạn vẫn gọi Apps Script; trạng thái hệ thống cũng kiểm tra nó. Route xuất
  cũ không được nút báo cáo hiện tại gọi nhưng chưa chứng minh không có bên ngoài
  sử dụng. Chuyển nhắc hạn sang Resend cần một đợt riêng có cấu hình gửi thật và
  kiểm thử lịch chạy, chống gửi trùng, lỗi gửi và nhật ký.
- `supabase/migrations/`, công cụ di chuyển dữ liệu và tài liệu triển khai cũ:
  không thể kết luận dư thừa bằng đồ thị import TypeScript.
- Code có import động, quy ước framework hoặc consumer bên ngoài: cần kiểm tra
  cách gọi thực tế trước khi xoá.

## 6. Kiểm tra khi sửa tiếp

Chạy từ thư mục gốc sau khi cài dependencies trong `next-app/`:

```bash
npm run next:typecheck
npm --prefix next-app run audit:code
node tools/test-code-optimization.mjs
node tools/test-equipment-maintenance-modal.mjs
node tools/test-report-brand.mjs
node tools/test-survey-export.mjs
npm run next:build
git diff --check
```

`tools/audit-code.mjs` dựng đồ thị import cục bộ từ các entrypoint Next.js và báo
module `lib/` / `components/` chưa thấy được sử dụng. Nó không kết nối dịch vụ,
không đọc `.env`, không xoá tệp và không chứng minh mọi export/CSS/route/migration
là còn dùng hay không. TypeScript đã bật `noUnusedLocals` / `noUnusedParameters`
để phát hiện khai báo dư trong các lần build sau.

`tools/test-code-optimization.mjs` kiểm tra nhóm dữ liệu không bị thay đổi, ranh
giới ngày/tháng Việt Nam, cách đếm khảo sát và các guard truy vấn bằng dữ liệu
tổng hợp. Các test nghiệp vụ khác trong `tools/test-*.mjs` có yêu cầu khác nhau:
đọc mã trước khi chạy; không chạy test dữ liệu thật/mutation một cách hàng loạt.

## 7. Điểm cần đo và xử lý tiếp

1. Đo riêng thời gian xác thực, truy vấn Supabase, tạo signed URL, render và tải
   route khi chuyển tab. Tách cold start khỏi lần tải lặp lại.
2. Rà giới hạn số dòng trong tổng hợp/báo cáo. Với dữ liệu lớn, chuyển tổng hợp
   sang RPC hoặc phân trang đầy đủ; không tăng hoặc xoá `limit` tuỳ tiện.
3. VPP vẫn có các phép tìm/lọc theo từng dòng và nguồn chi tiết tải theo giới
   hạn. Tối ưu tiếp cần đối chiếu tồn kho, tổng tiền và phân trang server-side.
4. Chuyển nhắc hạn khỏi Apps Script theo kế hoạch riêng, sau đó mới xoá tích hợp.

Giữ nguyên Auth/RLS và phạm vi người dùng trong mọi tối ưu. Network log của một
phiên Git/curl chỉ chứng minh kết nối của các lệnh đó, không bao phủ toàn bộ
runtime; không dùng nó để tuyên bố không có upload/egress hoặc đã bật ZDR.
