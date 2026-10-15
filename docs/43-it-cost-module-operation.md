# Vận hành phân hệ Chi phí công nghệ thông tin

Kế hoạch gốc: [42-it-cost-module-implementation-plan.md](42-it-cost-module-implementation-plan.md).

## Người dùng thao tác ở đâu

Trong **Đổi phân hệ**, khối **Chi phí công nghệ thông tin** nằm sau Chi phí viễn thông, dùng icon máy chủ và màu hồng tím. Route chính `/it-costs` có sáu mục: Tổng quan, Dịch vụ & gia hạn, Chi phí, Chứng từ, Báo cáo, Danh mục. Các danh sách kỳ hạn, dòng chi phí và chứng từ phân trang 20 dòng.

1. Thêm dịch vụ và kỳ sử dụng để theo dõi gia hạn; hoặc tạo dịch vụ/kỳ ngay trong dòng chi phí. Mã dịch vụ tạo từ chứng từ được tự sinh.
2. Nhập tay bằng **+ Chi phí**, hoặc **Nhập PDF / DOCX** để đọc chứng từ. Với PDF có chữ nhưng bảng là ảnh, chọn OCR toàn bộ PDF. Nếu không nhận diện được trường, nhập bổ sung từ bản gốc.
3. Ở bước xem trước, chọn từng dòng và gán danh mục. Sửa tiền trước thuế, VAT, sau thuế riêng từng dòng; không áp một thuế suất chung. Đơn giá/số lượng chỉ tham khảo, không tự nhân tổng hợp đồng lên mỗi dòng.
4. Chọn tạo chi phí, bổ sung chứng từ cho khoản chi cũ hoặc chỉ lưu hồ sơ. Có bộ tìm khoản chi theo nhà cung cấp để liên kết hợp đồng/hóa đơn; bảng Chứng từ có nút xem/tải. Trong sửa khoản chi có nút gỡ liên kết, chỉ dành cho quyền xóa.
5. Đối chiếu và xác nhận chứng từ, rồi xác nhận ngày ghi nhận chi phí. Đã thanh toán cần có ngày thanh toán. Tải file lên không tự xác nhận đã thanh toán.

Sửa/lưu thành công đóng popup và làm mới danh sách. Lỗi giữ dữ liệu để thử lại. Đổi tệp hoặc đóng popup hủy tác vụ đọc và xóa preview cũ. Không chuẩn hóa text mỗi lần gõ, để giữ dấu cách và bộ gõ tiếng Việt.

## Quy tắc số liệu và lịch sử

- Báo cáo theo **ngày ghi nhận chi phí**, tiền VND sau thuế; chỉ khoản chi đã xác nhận. Nháp/hủy và chứng từ chỉ lưu hồ sơ không cộng vào tổng. Hợp đồng hai năm chỉ được cộng một lần vào năm ghi nhận; không tự phân bổ kế toán.
- Tổng PostgreSQL dùng cùng bộ lọc với chi tiết và xuất file, không lấy tổng từ 20 dòng đang xem. Lọc kết hợp năm, tháng, danh mục, dịch vụ, nhà cung cấp, thanh toán, từ khóa.
- Mỗi kỳ gia hạn là một bản ghi. Kỳ tương lai không làm kỳ đang sử dụng biến mất. Ngày hết hạn còn hiệu lực đến hết ngày đó theo giờ Việt Nam; từ ngày tiếp theo vào Lịch sử. Kỳ chồng ngày yêu cầu xác nhận.
- Nguồn nhập là `document_id + source_key`, độc lập với vị trí người dùng sắp xếp/xem trước. Import không upsert theo số dòng hay tên file. Request ID chống bấm lưu lặp; version chống sửa trên dữ liệu cũ.
- Hash nhận diện tải lại cùng tệp. Hóa đơn còn có khóa MST/ký hiệu/số để chặn bản sao khác tệp. Hợp đồng và hóa đơn liên quan cần liên kết hồ sơ đã có; parser gợi ý theo số tham chiếu, người dùng xác nhận.
- Gỡ liên kết không xóa tệp hay tiền. Hủy khoản chi là thao tác riêng; dữ liệu và audit vẫn được giữ. Dịch vụ/danh mục dùng lưu trữ/ngừng sử dụng thay vì xóa lịch sử.

## Bản đồ mã nguồn

Các đường dẫn dưới đây tính từ thư mục gốc repository.

| Nơi sửa | Chức năng |
| --- | --- |
| `next-app/lib/system-modules.ts`, `components/sidebar.tsx`, `app/(protected)/modules/page.tsx` | Đăng ký module, khối chọn phân hệ, điều hướng và cấu hình cấp module cho người dùng |
| `next-app/app/(protected)/it-costs/page.tsx` | Tải các tab, bộ lọc URL, truy vấn có phân trang và hiển thị tổng quan/cảnh báo |
| `next-app/app/(protected)/it-costs/actions.ts` | Kiểm tra quyền và Zod; gọi RPC; đọc hồ sơ khi mở sửa; chuẩn bị upload, xác minh hash/chữ ký tệp, đối chiếu chứng từ |
| `next-app/components/it-cost-forms.tsx` | Form dịch vụ, kỳ hạn, danh mục, dòng chi phí và popup sửa tải theo yêu cầu |
| `next-app/components/it-cost-import.tsx` | Chọn tệp, tiến độ/hủy, preview sửa/chọn dòng, tìm hồ sơ liên kết, upload trực tiếp Storage |
| `next-app/lib/it-document-reader.ts` | PDF.js, OCR Worker, DOCX XML/bảng/header/footer và OCR ảnh; không thực thi macro hoặc liên kết ngoài |
| `next-app/lib/it-cost-documents.ts` | Gợi ý trường theo nhãn, tiền/ngày, nguồn trang/dòng, kiểm tra dung lượng giải nén DOCX |
| `next-app/lib/it-costs.ts` | Schema dùng chung, dữ liệu form, bộ lọc, trạng thái kỳ hạn và tổng dòng |
| `next-app/components/it-cost-report.tsx` | Bảng danh mục × 12 tháng, checkbox danh mục và tải XLSX/PDF |
| `next-app/app/api/it-costs/reports/route.ts` | Đọc đầy đủ chi phí theo trang; xuất ba sheet XLSX hoặc PDF, tổng theo bộ lọc và chống công thức từ chuỗi nhập |
| `next-app/app/api/it-costs/documents/[id]/route.ts` | Kiểm tra quyền rồi tạo signed URL xem/tải thời hạn 60 giây, không cache công khai |
| `next-app/app/it-costs.css` | Màu phân hệ, bố cục responsive, form/preview/bộ lọc/nút và vùng bảng cuộn riêng |
| `next-app/scripts/prepare-it-ocr-assets.mjs`, `next-app/public/ocr/` | Chuẩn bị runtime OCR từ dependency khóa phiên bản; mô hình tiếng Việt phục vụ cùng origin |

Các helper dùng lại: Auth/MFA, ModalTrigger/AppModal, ActionSuccessContext/toast, formatMoney/formatDate/vietnamToday, periodDueTone, addVehicleReportHeader và renderReportPdf. Việc chọn module vẫn áp dụng Auth/RLS của hệ thống, không tạo cơ chế đăng nhập riêng.

## Database và quyền

Migration bổ sung: `supabase/migrations/202610140001_it_cost_management.sql`. Không sửa migration đã có. Bảy bảng:

| Bảng | Dữ liệu |
| --- | --- |
| `it_cost_categories` | 8 danh mục khởi tạo và danh mục admin bổ sung |
| `it_services` | Dịch vụ, định danh, nhà cung cấp và trạng thái |
| `it_service_periods` | Các kỳ sử dụng/gia hạn và liên kết kỳ trước |
| `it_cost_entries` | Ngày ghi nhận, thanh toán, trạng thái và version khoản chi |
| `it_cost_entry_lines` | Tiền theo dòng, danh mục tại thời điểm ghi nhận, dịch vụ/kỳ và định danh nguồn |
| `it_documents` | Metadata chứng từ, hash và đường dẫn tệp riêng tư; không lưu toàn văn OCR |
| `it_document_links` | Liên kết chứng từ với khoản chi, dịch vụ hoặc kỳ bằng FK |

RPC ghi transaction: `save_it_entity`, `save_it_cost_entry`, `register_it_document`, `link_it_document`. RPC đọc cùng bộ lọc: `it_filtered_costs`, `it_cost_summary`. Không cấp quyền ghi trực tiếp bảng cho client. Các bảng có RLS và audit trigger.

Module `it_costs`. Admin toàn quyền; manager được xem/quản lý/import/xuất khi được cấp module; viewer/user chỉ xem khi được cấp module. Quyền xóa/cấu hình dành admin theo role mặc định. Migration cập nhật allowlist và mapping quyền bằng định nghĩa đang triển khai, giữ các phân hệ và kiểm tra MFA/chống tự khóa admin.

Bucket `it-cost-documents` private, tối đa 20 MB/tệp; chính sách theo module/quyền. Upload thẳng qua signed upload token; server kiểm tra lại byte size, hash, chữ ký PDF/DOCX và giới hạn ZIP trước khi ghi metadata. Xóa trực tiếp chỉ cho staging chưa được đăng ký, không xóa tệp đang dùng chung.

## Giới hạn và điểm mở rộng

- PDF tối đa 50 trang; DOCX tối đa 50 ảnh OCR, 1.000 thành phần ZIP và 60 MB giải nén. Bản mã hóa/hỏng/macro bị từ chối. Đọc scan cần thời gian theo số trang và máy người dùng; có hủy tác vụ.
- Parser gợi ý theo nhãn và bảng, không bảo đảm đọc đủ mọi bố cục. Thuế/phí hỗn hợp, OCR sai số hoặc chỉ có ngày hết hạn cần người dùng đối chiếu; không tự suy ngày bắt đầu hoặc điền 0 cho ô chưa đọc được. Những mẫu scan thật đã được thử đọc cục bộ, không được nhập vào production để test.
- Bộ chọn tham chiếu hiện hỗ trợ tối đa 1.000 danh mục, 1.000 dịch vụ và 2.000 kỳ; vượt ngưỡng báo lỗi rõ, không âm thầm cắt danh sách. Cần thay bằng bộ chọn tìm kiếm từ server khi dữ liệu đạt ngưỡng này.
- XLSX tối đa dưới 50.000 dòng (đọc 500 dòng/lượt); quá giới hạn yêu cầu lọc bớt. PDF dùng helper chung với ngưỡng 1.000 dòng. XLSX có Tổng hợp danh mục, Chi tiết chi phí, Dịch vụ và kỳ hạn liên quan, logo TDW và tổng cuối bảng.
- Email nhắc hạn, nhập XLSX, ngoại tệ, trả từng phần và phân bổ kế toán không thuộc bản này. Nhắc hạn ở đây là cảnh báo trong ứng dụng.

## Kiểm chứng và phát hành

- `tools/test-it-costs-db.mjs`: PostgreSQL tổng hợp, chạy migration thật và transaction ghi migration history; kiểm tra module/MFA/RLS, chồng kỳ/gia hạn tương lai, rollback, chống trùng, version, gỡ liên kết và tổng 1.003 dòng.
- `tools/test-it-costs-domain.mjs`: định dạng tiền, bốn dòng dịch vụ, thuế hỗn hợp không suy đoán, nguồn dòng, ngày/thanh toán và ZIP.
- `tools/test-it-costs-report.mjs`: 1.003 dòng xuất đủ, checkbox danh mục/tổng, ba sheet có logo/header căn giữa, chống công thức, rỗng/lỗi/quyền.
- `tools/it-ui/run.mjs`: trình duyệt thật với dữ liệu tổng hợp và server actions giả lập; retry, đóng popup/cuộn, dấu cách, chọn đúng dòng DOCX/reset, desktop/mobile và OCR PDF scan. Log của lượt đã kiểm tra ghi nhận 25 request, không có request HTTP ra ngoài origin local; ghi nhận worker/core/mô hình Việt từ `/ocr/`. Đây là bằng chứng cho lượt test đó, không là khẳng định toàn hệ thống không có egress hay đã bật ZDR.
- TypeScript/build và hồi quy xuất báo cáo xe/viễn thông đã qua. Bản vá dependency dùng Next.js 16.3.8, Sharp 0.35.5, brace-expansion và source-map-js; npm audit production báo 0 lỗ hổng tại thời điểm kiểm tra. Tham khảo [Next.js release](https://github.com/vercel/next.js/releases/tag/v16.3.8), [Sharp release](https://github.com/lovell/sharp/releases/tag/v0.35.5).

`tools/it-cost-release.mjs` dùng token Supabase đang có trong file local ngoài Git, chỉ ghi network evidence gồm host/path/method/status/byte count. `tools/sql-migration-record.mjs` gói schema và migration history vào một transaction, đã kiểm tra trên PostgreSQL tổng hợp. Không log Authorization, nội dung OCR hoặc chứng từ.

Supabase đã xác minh 7 bảng, 8 danh mục, bucket private và migration history đúng; chưa nhập khoản chi hay chứng từ thật. Commit tính năng `57a70a1` đã được Vercel xác nhận triển khai thành công: [deployment](https://vercel.com/tonyle2017/tdw-equipment-manager/4DAsbZf7UW4CAnWEv8tmPHpuxVyU). Production đã hiển thị khối mới đúng vị trí, icon/màu riêng và trang Tổng quan tải được 8 danh mục. Mở tại https://tdw-equipment-manager-one.vercel.app/it-costs. Không dùng rollback drop bảng đã có dữ liệu; rollback ứng dụng vẫn giữ schema và hồ sơ đã tạo.

Đã tải file thực tế từ production bằng phiên ứng dụng đang đăng nhập: XLSX có đủ ba sheet, mỗi sheet một logo và tên công ty căn giữa; PDF hai trang có đúng tiêu đề và tên công ty. Đây là báo cáo rỗng vì chưa nhập khoản chi, không phải kiểm thử ghi dữ liệu trên production. Không cần tài khoản Gmail cho thao tác tải file.
