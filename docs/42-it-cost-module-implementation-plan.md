# Kế hoạch triển khai phân hệ Chi phí công nghệ thông tin

Ngày lập: 14/10/2026. Người thực hiện dự kiến: Sol 6.1.
Mã nguồn tham chiếu khi lập kế hoạch: commit `75a385f`. Đây là kế hoạch gốc trước triển khai; kết quả thực hiện và bản đồ vận hành được cập nhật tại [43-it-cost-module-operation.md](43-it-cost-module-operation.md). Chứng từ mẫu không được tự nhập vào production.

## 1. Mục tiêu và phạm vi

Tạo phân hệ độc lập **Chi phí công nghệ thông tin** trong màn hình Đổi phân hệ và quản trị quyền. Người dùng nhập thủ công hoặc đọc hóa đơn, hợp đồng, báo giá PDF/DOCX; kiểm tra dữ liệu trước khi lưu; quản lý dịch vụ và kỳ gia hạn; xuất báo cáo năm theo danh mục.

Giao diện theo cách tổ chức VETC hiện tại: thanh thao tác, bộ lọc, thẻ tổng hợp, bảng danh sách, tab hiện hành/lịch sử, popup xem và sửa. Tái sử dụng thành phần chung, nhưng nghiệp vụ tiền, hợp đồng và gia hạn có mô hình riêng.

Danh mục khởi tạo: Tên miền; Hosting website; Email hosting/server; SSL; Internet cáp quang; Metronet; Thuê máy chủ/VPS/Cloud; Khác. Admin có thể thêm, đổi tên, sắp xếp và ngừng sử dụng danh mục. Danh mục đã có dữ liệu không được xóa làm mất lịch sử.

Bản đầu phải có cả nhập thủ công, PDF có chữ, PDF scan và DOCX. Nhập XLSX, tự gửi email nhắc hạn, kết nối nhà cung cấp, ngoại tệ, thanh toán từng phần, điều chỉnh/hóa đơn thay thế phức tạp và tự động phân bổ kế toán là phạm vi mở rộng; không tự đưa vào lần triển khai này.

## 2. Những tình huống đã thấy trong mẫu

| Mẫu người dùng cung cấp | Đặc điểm cần hỗ trợ | Hành vi yêu cầu |
| --- | --- | --- |
| `HD CCDV Thue May Chu VH PM Online Office 2024.pdf` | 4 trang scan; giá theo tháng, số lượng 24 tháng, tổng hợp đồng và VAT; thời gian sử dụng qua nhiều năm | OCR; phân biệt đơn giá tháng, thành tiền và tổng sau thuế; lưu cả khoảng sử dụng; không lấy năm từ tên file |
| `Hop dong hosting Email PA 2026.pdf` | 2 trang scan; 4 dòng gồm email server, hai SSL và tên miền; ngày hết hạn khác nhau; phí duy trì/phí dịch vụ, thuế và thông tin giảm giá | Một chứng từ tạo nhiều dòng thuộc các danh mục khác nhau; thuế theo dòng/thành phần; không trừ giảm giá lần nữa nếu giá đã phản ánh giảm giá |
| `Hop dong gia han hosting TDW 2026-2027.pdf` | 3 trang scan; nội dung kỳ dịch vụ không trùng cách đặt tên file; giá theo năm, số lượng 2 năm | Lấy ngày từ nội dung, yêu cầu xác nhận; nhận diện một kỳ dịch vụ nhiều năm |
| `Hoa don hosting Van tay Media 2026.pdf` | 1 trang có lớp chữ; dẫn chiếu hợp đồng hosting ở dòng dịch vụ | Liên kết với chi phí từ hợp đồng đã lưu; không cộng lại khoản tiền khi bổ sung hóa đơn |

Các tệp gốc do người dùng đính kèm được dùng để đối chiếu cục bộ. Không đưa PDF/DOCX, ảnh scan, số tài khoản, chữ ký, mã tra cứu bí mật hoặc toàn bộ nội dung OCR vào Git, log hay fixture công khai. Test tự động dùng bản dữ liệu tổng hợp giữ cấu trúc tương đương. Chưa có mẫu DOCX thật; cần test DOCX tổng hợp có đoạn văn, bảng nhiều dòng, ô gộp và ảnh scan.

## 3. Màn hình và trải nghiệm

Đề xuất route `/it-costs` với các tab **Tổng quan**, **Dịch vụ và gia hạn**, **Chi phí**, **Chứng từ**, **Báo cáo**, **Danh mục**. Tab Danh mục chỉ hiện khi có quyền quản lý cấu hình.

### Tổng quan

- Mặc định năm hiện tại theo giờ Việt Nam. Thẻ tổng chi phí đã xác nhận, chi phí theo danh mục và số dịch vụ sắp hết hạn.
- Khối cần theo dõi sắp xếp ngày hết hạn tăng dần; đã quá hạn nhưng chưa có kỳ mới vẫn có cảnh báo rõ ràng và liên kết sang lịch sử để gia hạn.
- Chỉ tiêu tiền dùng cùng bộ lọc với báo cáo; cảnh báo hiệu lực theo ngày hiện tại, không bị ẩn chỉ vì hợp đồng bắt đầu ở năm trước. Ghi nhãn rõ phạm vi của từng khối.

### Dịch vụ và gia hạn

Một dịch vụ có mã ổn định, tên, danh mục, nhà cung cấp, định danh như tên miền/mã đường truyền, nơi lắp đặt hoặc mục đích sử dụng, ghi chú và trạng thái sử dụng. Không lưu mật khẩu quản trị hosting, API key hoặc private key SSL trong form này.

Mỗi lần đăng ký/gia hạn là một kỳ riêng: ngày bắt đầu, hết hạn, chu kỳ tháng/quý/năm/tùy chọn, nhắc trước bao nhiêu ngày, liên kết kỳ trước và chứng từ nguồn. Hai SSL của hai tên miền khác nhau là hai dịch vụ; không gộp chỉ vì cùng danh mục SSL hoặc cùng nhà cung cấp.

Tab **Hiện hành** hiển thị kỳ đang hiệu lực và kỳ tương lai, có nhãn phân biệt. Tab **Lịch sử** chứa kỳ đã hết hạn hoặc bị thay thế có chủ ý, vẫn có nút gia hạn. Ngày hết hạn còn hiệu lực đến hết ngày đó; chuyển lịch sử từ ngày kế tiếp theo giờ Việt Nam. Gia hạn trước hạn không làm kỳ đang sử dụng biến mất sớm. Khoảng hiệu lực chồng nhau phải cảnh báo và yêu cầu người dùng xác nhận/sửa, không tự chọn kỳ có ngày lớn nhất rồi bỏ các kỳ khác.

Nút **Gia hạn** điền sẵn thông tin dịch vụ, tạo kỳ mới và liên kết kỳ trước. Ngày gợi ý là ngày sau khi kỳ cũ kết thúc, người dùng sửa được. Bấm lưu không tự sinh vô hạn các kỳ tương lai hay phát sinh tiền chưa được xác nhận.

### Chi phí và form nhập

Form gồm phần đầu chứng từ và bảng dòng chi phí:

| Nhóm | Trường |
| --- | --- |
| Thông tin chung | Nhà cung cấp, loại nguồn (thủ công/hóa đơn/hợp đồng/báo giá), số/ký hiệu, ngày chứng từ, ngày ghi nhận chi phí, nội dung |
| Mỗi dòng | Dịch vụ, danh mục, mô tả, đơn vị, số lượng, đơn giá tham khảo, tiền trước thuế, giảm giá nếu có, tiền thuế, tiền sau thuế |
| Kỳ sử dụng | Ngày bắt đầu/kết thúc của từng dịch vụ, liên kết kỳ đã có hoặc tạo kỳ mới |
| Thanh toán | Chưa xác nhận / Chưa thanh toán / Đã thanh toán; ngày thanh toán bắt buộc khi chọn Đã thanh toán |
| Tài liệu | PDF/DOCX gốc, hợp đồng/báo giá/hóa đơn liên quan; xem, tải và gỡ liên kết có xác nhận |

Lưu thành công phải báo thành công, đóng popup, làm mới danh sách và trả lại khả năng cuộn. Lỗi giữ dữ liệu đang nhập, hiển thị ngay trong form; pending luôn kết thúc. Không trim/chuẩn hóa text sau từng phím gõ làm mất dấu cách hoặc ảnh hưởng bộ gõ tiếng Việt.

Bộ lọc kết hợp: năm + tháng + danh mục + nhà cung cấp + dịch vụ + trạng thái; nhập từ khóa. Đổi bộ lọc về trang 1; mặc định 20 dòng/trang, mới nhất trước, có thứ tự phụ bằng ID. Trạng thái lưu trong URL để quay lại và chia sẻ nội bộ.

Desktop căn đều chiều cao input/button, tiền căn phải, ngày không vỡ dòng. Mobile xếp bộ lọc dọc, footer nút có khoảng cách, popup có vùng cuộn riêng; bảng rộng cuộn ngang hoặc đổi sang thẻ, không cắt chữ/cột thao tác. Loading, empty/error, màu trạng thái dùng hệ thống hiện có. Màu kèm nhãn chữ; không chỉ dùng màu để biểu thị trạng thái.

## 4. Luồng nhập PDF và DOCX

1. Chọn tệp và loại chứng từ, hoặc để hệ thống gợi ý loại. Giới hạn đề xuất 20 MB/tệp và 50 trang PDF; hiển thị giới hạn trước khi chọn. Sol phải kiểm tra giới hạn hạ tầng trước khi chốt cơ chế upload.
2. Đọc PDF có chữ bằng PDF.js hiện có. Kiểm tra chất lượng từng trang/vùng, không chỉ kiểm tra file có chữ hay không. Trang scan hoặc bảng tiền chỉ là ảnh đi qua OCR tiếng Việt.
3. Ưu tiên OCR trong Web Worker của trình duyệt, phục vụ model/WASM từ cùng hệ thống. Thử sớm trên ba mẫu scan để quyết định độ chính xác/tốc độ. Có tiến độ theo trang, hủy và thử lại; không giữ request server dài trong lúc OCR. Nếu chưa đạt, nêu kết quả và phương án xử lý riêng; không gọi OCR cloud bằng dữ liệu hợp đồng khi chưa được phê duyệt theo quy tắc dự án.
4. DOCX đọc nội dung văn bản và bảng, giữ quan hệ hàng/cột, xử lý ô gộp; đọc phần header/footer liên quan. Nếu tiền/ngày nằm trong ảnh thì OCR ảnh. Không chạy macro, tải liên kết ngoài hay render HTML chưa làm sạch; `.doc` và `.docm` không thuộc định dạng được nhận.
5. Chuẩn hóa thành bản nháp chung: đơn vị bán/mua, số chứng từ, ngày, tham chiếu hợp đồng, dòng dịch vụ, đơn giá/số lượng, các khoản tiền và khoảng sử dụng. Cùng schema với form nhập tay.
6. Mở bước **Xem trước và kiểm tra**: chứng từ bên trái, các dòng bên phải; mobile chuyển hai tab. Mỗi trường nhận diện có trang/đoạn nguồn hoặc ô bảng để đối chiếu. Trường thiếu/không chắc chắn để trống và đánh dấu; tuyệt đối không điền 0 hoặc ngày hôm nay thay cho dữ liệu không đọc được.
7. Người dùng chọn dòng cần nhập, sửa thông tin, gán danh mục/dịch vụ và quyết định **tạo chi phí mới**, **bổ sung chứng từ cho chi phí đã lưu** hoặc **chỉ lưu hồ sơ/báo giá**. Đọc file chưa làm phát sinh chi phí.
8. Server xác thực lại toàn bộ dữ liệu đã chọn, quyền và chống trùng; ghi transaction rồi trả kết quả. Chỉ dòng đã chọn được ghi. Khi đổi tệp phải bỏ preview/selection cũ, hủy tác vụ cũ; kết quả OCR về muộn không được ghi vào preview mới.

OCR và parser chỉ đưa ra gợi ý. Không dùng nội dung hợp đồng như chỉ dẫn cho hệ thống, không tự thực hiện điều khoản hợp đồng. Với layout chưa nhận diện được, vẫn cho sửa form để hoàn tất, nhưng không báo nhận diện thành công khi chưa có đủ dữ liệu.

### Quy tắc tiền và ngày bắt buộc

- Phân biệt đơn giá, số lượng, thành tiền, tổng trước thuế, VAT và tổng thanh toán. Không lấy con số lớn nhất làm tổng mặc định.
- Một chứng từ có thể có nhiều thuế suất và phí không chịu thuế. Không áp một tỷ lệ VAT lên tất cả dòng. Lưu tiền thuế thực tế theo dòng; thuế suất có thể để không xác định nếu nguồn chưa đủ rõ.
- Giá đã giảm thì không trừ giảm giá lần hai. Không diễn giải mã giảm giá thành số tiền giảm nếu nhãn/nội dung chưa xác nhận ý nghĩa.
- Đối soát tổng dòng với tổng chứng từ, chấp nhận sai số làm tròn VND tối đa 1 đồng; sai lệch lớn phải sửa hoặc ghi rõ cơ sở trước khi xác nhận. Không chia đều phần chênh lệch còn thiếu một cách im lặng.
- Nếu chỉ chọn một số dòng, hiển thị cả tổng chứng từ và tổng các dòng được chọn. Không nhân tổng chứng từ lên mỗi dòng; không ép tổng phần chọn bằng tổng toàn file.
- Dùng nội dung chứng từ để lấy ngày. Tên file chỉ là gợi ý. Ngày ký, ngày hóa đơn, ngày thanh toán, ngày ghi nhận và kỳ hiệu lực là các trường khác nhau.
- Hợp đồng chỉ có ngày hết hạn không đủ để suy ra chính xác ngày bắt đầu kỳ gia hạn; yêu cầu người dùng bổ sung hoặc xác nhận gợi ý từ kỳ trước.

## 5. Chống trùng và bảo toàn lịch sử

Phải tách **tệp chứng từ**, **dịch vụ/kỳ sử dụng** và **khoản chi phí**. Một khoản chi phí có nhiều chứng từ; một chứng từ có nhiều dòng và danh mục.

Hash tệp giúp nhận diện tải lại cùng file nhưng không phải khóa nghiệp vụ duy nhất. Với hóa đơn, đối chiếu nhà cung cấp/MST + ký hiệu + số hóa đơn và dòng nguồn. Với hợp đồng/báo giá, dùng nhà cung cấp + số chứng từ + phiên bản/kỳ; chứng từ thiếu số chỉ cảnh báo ứng viên, không tự kết luận trùng. Số dòng/trang và tên file không được dùng để ghi đè bản ghi đã lưu.

Khi hợp đồng và hóa đơn cùng tham chiếu một dịch vụ/kỳ/giá trị, hiển thị ứng viên để người dùng liên kết. Chỉ tiền của `it_cost_entry_lines` đã xác nhận được cộng báo cáo; bảng chứng từ không cộng tiền riêng. Nếu hóa đơn khác giá trị hợp đồng, mở đối chiếu và chỉnh khoản chi phí một cách có chủ ý, lưu nhật ký; không âm thầm tạo thêm khoản tiền hoặc ghi đè.

Import hỗ trợ chọn từng dòng và nhập bổ sung phần còn lại sau đó. Lưu định danh dòng nguồn độc lập với vị trí hiển thị để chống trùng khi sắp xếp/xem lại. Retry hoặc bấm hai lần dùng idempotency key và transaction. Sửa dùng `updated_at`/version để phát hiện người khác đã thay đổi. Không hard-delete dịch vụ, kỳ hoặc chi phí đã có chứng từ; dùng hủy/lưu trữ và audit log.

## 6. Quy tắc báo cáo năm đề xuất

Mặc định **năm theo ngày ghi nhận chi phí**, tiền VND sau thuế. Ngày ghi nhận do người dùng xác nhận; gợi ý từ ngày hóa đơn khi có. Đối với hợp đồng/báo giá chỉ lưu hồ sơ, không cộng vào chi phí. Khi chọn tạo khoản chi phí từ hợp đồng, phải xác nhận ngày ghi nhận và số tiền một lần.

Hợp đồng trả trước nhiều năm được cộng vào năm ghi nhận của khoản chi đã xác nhận. Không tự chia đôi tiền vì hợp đồng hai năm, và không cộng lại cùng tổng hợp đồng ở mỗi năm còn hiệu lực. Báo cáo phân bổ theo thời gian sử dụng là một chế độ riêng nếu được yêu cầu sau; không trộn với tổng chi phí này. Đây là quy tắc quản lý của ứng dụng, không thay thế quy trình hạch toán của công ty.

Giao diện báo cáo có bảng danh mục x 12 tháng, tổng năm; bảng chi tiết theo dịch vụ/nhà cung cấp/kỳ. Có bộ lọc kết hợp và checkbox danh mục muốn xuất. Tổng cuối bảng và file xuất phải theo đúng bộ lọc, kể cả chi phí thuộc kỳ dịch vụ đã chuyển lịch sử. Trạng thái thanh toán tách riêng; có thể lọc Đã thanh toán, nhưng không tự đổi năm thống kê sang năm thanh toán.

XLSX gồm các sheet **Tổng hợp danh mục**, **Chi tiết chi phí**, **Dịch vụ và kỳ hạn**. PDF dùng bản tổng hợp và chi tiết phù hợp khổ trang. Cả hai dùng logo TDW, tên công ty, địa chỉ, tiêu đề căn giữa và tổng cuối bảng theo bộ lọc như hệ thống hiện tại. Tải trực tiếp từ ứng dụng có kiểm tra quyền, không phụ thuộc Gmail hoặc Apps Script.

## 7. Thiết kế dữ liệu dự kiến

Tên dưới đây là đề xuất để Sol thống nhất trước khi viết migration mới; không sửa migration đã triển khai.

| Bảng | Vai trò và các trường chính |
| --- | --- |
| `it_cost_categories` | `id`, `code` duy nhất, tên, thứ tự, active |
| `it_services` | `id`, mã dịch vụ, danh mục mặc định, tên, định danh dịch vụ, nhà cung cấp, vị trí/mục đích, trạng thái sử dụng, ghi chú |
| `it_service_periods` | `service_id`, ngày bắt đầu/hết hạn, chu kỳ, nhắc trước, `renewed_from_id`, thông tin thay thế/hủy có chủ ý |
| `it_cost_entries` | Hồ sơ khoản chi; nhà cung cấp, ngày ghi nhận, mô tả, trạng thái nháp/xác nhận/hủy, trạng thái/ngày thanh toán, version |
| `it_cost_entry_lines` | `entry_id`, `service_id`, `period_id` tùy chọn, danh mục của khoản chi, mô tả, số lượng/đơn giá, trước thuế, VAT, sau thuế, định danh nguồn |
| `it_documents` | Loại, số/ký hiệu, ngày, tham chiếu chứng từ, metadata tổng tiền nguồn, hash, đường dẫn Storage private, tên/MIME/kích thước và trạng thái xử lý |
| `it_document_links` | Liên kết tệp với khoản chi/kỳ/dịch vụ; FK rõ ràng và check đúng loại đích, không dùng UUID tùy ý không kiểm chứng |

Các bảng nghiệp vụ có `created_at`, `updated_at`, người tạo/cập nhật và trạng thái xóa mềm phù hợp; tiền dùng `numeric`, không dùng float. Danh mục lưu tại dòng chi phí để đổi danh mục mặc định của dịch vụ không tự chuyển báo cáo lịch sử. Sửa danh mục của khoản chi cần thao tác có nhật ký.

Index theo ngày ghi nhận, danh mục, dịch vụ/nhà cung cấp, ngày hết hạn và khóa chứng từ; unique index chỉ áp dụng cho định danh đã chắc chắn. Ràng buộc tiền không âm, quan hệ trước thuế + VAT = sau thuế, ngày hết hạn không trước ngày bắt đầu. Dùng transaction/RPC cho ghi nhiều dòng, liên kết chứng từ và gia hạn để không lưu nửa chừng.

Không lấy dữ liệu bị giới hạn một trang rồi tính tổng năm. Tính tổng tại PostgreSQL cùng điều kiện lọc; danh sách dùng phân trang server-side; export đọc đủ các trang với thứ tự ổn định, báo lỗi nếu thiếu dữ liệu.

## 8. Phân quyền và lưu tệp

Module đề xuất `it_costs`; quyền `it_costs.view`, `it_costs.manage`, `it_costs.import`, `it_costs.delete`, `it_costs.settings`, `reports.it_costs.export`. Admin quản lý toàn bộ. Vai trò khác chỉ truy cập khi được cấp module và quyền tương ứng; quyền xem mặc định cho phép xem dữ liệu trong phân hệ như mô hình viễn thông hiện tại. Nếu cần giới hạn theo phòng ban thì bổ sung trước khi cấp quyền rộng.

Phải cập nhật cả UI lẫn allowlist/module mapping trong PostgreSQL: `user_module_access`, `permission_system_module`, `has_system_module`, `get_my_access`, `admin_set_user_access` và các grant/RLS liên quan. Đọc định nghĩa mới nhất có cả `surveys`, giữ quyền các phân hệ khác và logic MFA/chống tự khóa admin. Không chỉ thêm một nút trong sidebar.

Storage private; API xem/tải kiểm tra module và quyền từng đối tượng, signed URL thời hạn ngắn. Tệp lớn upload trực tiếp bằng quyền có phạm vi; tránh đẩy nguyên tệp qua Server Action nếu vượt giới hạn request. Kiểm tra MIME/chữ ký file, kích thước, số trang, giới hạn giải nén DOCX; xử lý file lỗi/mã hóa và dọn file upload dang dở. Không log toàn văn OCR hay URL có token.

Xóa một liên kết tài liệu không xóa tệp đang được khoản chi/kỳ khác dùng. Gỡ chứng từ không tự xóa tiền của khoản chi; xóa/hủy khoản chi phải là thao tác riêng có xác nhận.

## 9. Tệp cần sửa và hàm nên dùng lại

Các đường dẫn sau nằm dưới `next-app/`, trừ migration và tài liệu.

| Khu vực | Tệp tham chiếu hoặc tệp dự kiến |
| --- | --- |
| Đăng ký module | `lib/system-modules.ts`, `app/(protected)/modules/page.tsx`, `components/sidebar.tsx`, màn hình quản trị user và quyền |
| Trang mới | `app/(protected)/it-costs/page.tsx`, `layout.tsx`, `loading.tsx`, `actions.ts`; thêm route chi tiết nếu cần |
| Giao diện | `components/it-cost-forms.tsx`, `it-cost-import.tsx`, `it-cost-report.tsx`; CSS có phạm vi phân hệ |
| Nghiệp vụ | `lib/it-costs.ts` cho schema/filter/tiền; `lib/it-cost-documents.ts` cho kết quả đọc và chống trùng; OCR worker riêng, load khi cần |
| Xuất/tệp | `app/api/it-costs/reports/route.ts`, route tài liệu có auth; mọi entrypoint đều kiểm tra quyền |
| Database | Migration mới trong `supabase/migrations/` cho schema, quyền, RPC, index, Storage policy và audit |
| Kiểm thử/tài liệu | Test parser/OCR, RPC/RLS, báo cáo, modal; bổ sung `docs/41-system-code-map-and-performance.md` khi hoàn thành |

Tái sử dụng `PageHeader`, `AppIcon`, `ModalTrigger`, `ConfirmAction`, `ActionStateToast`, `requireModuleAccess`, `can`, `formatMoney`, `formatDate`, `vietnamToday`, `groupBy`, header XLSX trong `lib/vehicle-report-brand.ts` và PDF helper trong `lib/local-report-file.ts` nếu phù hợp. `VehicleHistoryTabs` chứa route xe; chỉ dùng lại trực tiếp sau khi đã tách thành thành phần trung lập và kiểm tra hồi quy. Không copy nguyên truy vấn VETC hoặc gom các nghiệp vụ khác nhau vào một file lớn.

Mẫu VETC hiện có nằm ở `components/vehicle-toll-section.tsx` và `app/api/vehicles/tolls/report/route.ts`. Các parser viễn thông là ví dụ đọc/xem trước/chống trùng, không đủ cho hợp đồng scan nhiều dòng và thuế hỗn hợp. Không kéo parser/OCR/ExcelJS vào bundle của toàn bộ trang; chỉ tải lúc nhập hoặc xuất.

## 10. Thứ tự thực hiện cho Sol 6.1

1. **Khảo sát và thử đọc mẫu:** đối chiếu HEAD hiện tại, AGENTS và worktree; lập dữ liệu tổng hợp; thử OCR ba PDF scan và parser hóa đơn/DOCX, chốt schema kết quả xem trước. Kiểm tra dependency mới theo quy tắc dự án trước khi cài/nâng cấp. Đây là bước xác định rủi ro chính, phải làm sớm.
2. **Database và quyền:** thêm migration/RLS/RPC/index; test bằng dữ liệu tổng hợp, tài khoản có/không quyền, transaction và nhập trùng. Chưa nhập chứng từ thật tự động.
3. **Module và CRUD:** menu/module picker, danh mục, dịch vụ, kỳ gia hạn, nhập khoản chi thủ công, liên kết tệp; đóng modal đúng sau thành công; mobile và phân trang.
4. **Nhập tài liệu:** nối parser/OCR vào preview chỉnh sửa, checkbox từng dòng, phát hiện trùng, liên kết hợp đồng/hóa đơn, hủy/reset preview và retry idempotent.
5. **Báo cáo và cảnh báo:** tổng hợp SQL, bộ lọc nhất quán, báo cáo năm theo danh mục, XLSX/PDF có logo/tổng tiền; hiện hành/lịch sử không làm mất số liệu.
6. **Nghiệm thu và phát hành:** typecheck/build, test đúng phạm vi, kiểm tra desktop/mobile; cập nhật bản đồ kiến trúc. Chuẩn bị thay đổi có thể review rồi triển khai theo quyền đã có và quy trình dự án; xác minh migration trước app, trạng thái deploy và kiểm tra sau deploy. Ghi rõ phần chưa xác nhận được thay vì báo hoàn tất chung chung.

Đợt này thêm phân hệ, không cần di chuyển dữ liệu xe/viễn thông hoặc xóa migration/tích hợp cũ. Migration nên bổ sung tương thích để có thể rollback app mà vẫn giữ dữ liệu mới. Không rollback bằng cách drop các bảng đã chứa chi phí.

## 11. Tiêu chí nghiệm thu

- Nhập tay, PDF chữ, cả ba PDF scan và DOCX đều đi tới preview/form có thể kiểm tra và lưu. OCR không đọc được trường nào phải thể hiện thiếu trường đó, không bịa số tiền/ngày.
- Mẫu nhiều dòng tách đúng bốn dịch vụ; tổng sau thuế khớp tổng nguồn, giữ từng ngày hết hạn; không cộng/trừ sai phần giảm giá hoặc thuế hỗn hợp.
- Nhập hợp đồng hosting rồi hóa đơn liên quan chỉ có một khoản chi đã xác nhận; hai chứng từ truy cập được từ cùng hồ sơ. Tải lại/đổi tên file, nhập bổ sung dòng chưa chọn, retry và bấm lưu hai lần không nhân đôi chi phí.
- Chỉ các dòng được chọn được ghi; sắp xếp preview không đổi định danh dòng. Đổi tệp không thấy preview cũ hoặc kết quả OCR muộn của tệp trước.
- Hợp đồng hai năm không bị nhân tổng lên hai lần hoặc tự chia theo tên file. Báo giá chỉ lưu tham khảo không xuất hiện trong tổng chi phí.
- Báo cáo 2025/2026 và nhiều danh mục khớp dữ liệu tổng hợp; tổng đúng khi có trên 1.000 dòng và khi lọc 2–3 tiêu chí; XLSX/PDF khớp UI và không thiếu trang.
- Gia hạn tạo kỳ mới, giữ chứng từ/kỳ cũ; kỳ tương lai không thay thế sớm kỳ hiện tại; mốc nửa đêm Việt Nam và ngày hết hạn được xử lý đúng.
- Lưu/sửa/import thành công đóng popup, hiện thông báo, cập nhật danh sách; lỗi không treo form; đóng popup trả lại cuộn; gõ tiếng Việt và dấu cách bình thường.
- Người không được cấp module không đọc/ghi/xuất/tải tài liệu qua URL/API/RPC trực tiếp. Kiểm tra tệp dùng chung không bị mất khi gỡ một liên kết.
- Trên mobile không mất chữ hoặc che nút lưu. So sánh layout/interaction với VETC và kiểm tra các phân hệ cũ sau khi đổi thành phần chung.
- Kiểm tra tải trang với dữ liệu tổng hợp trước/sau, ghi điều kiện đo. Truy vấn tổng không phụ thuộc trang hiện tại, không truy vấn tệp cho tất cả bản ghi khi chỉ xem 20 dòng.

## 12. Lời giao việc có thể chuyển cho Sol 6.1

> Triển khai phân hệ Chi phí công nghệ thông tin theo `docs/42-it-cost-module-implementation-plan.md`. Đọc kế hoạch, AGENTS và mã hiện tại trước khi sửa; tiếp tục worktree phù hợp và bảo toàn thay đổi đang có. Giao diện theo VETC, phân hệ riêng có quyền quản trị, nhập tay và đọc PDF/DOCX gồm bản scan, preview chỉnh sửa/chọn dòng, liên kết nhiều chứng từ để không cộng trùng hợp đồng/hóa đơn, giữ lịch sử gia hạn, báo cáo năm theo danh mục và xuất XLSX/PDF chuẩn TDW. Ưu tiên thử OCR các mẫu trước, tái sử dụng hàm chung, dùng Supabase và không tạo phụ thuộc Apps Script. Các quy tắc báo cáo tại mục 6 là mặc định đề xuất; nêu rõ nếu cần thay đổi. Hoàn thành code, migration, kiểm thử, tài liệu và xác minh phát hành trong phạm vi được cấp quyền. Không nhập các chứng từ thật vào production chỉ để test.
