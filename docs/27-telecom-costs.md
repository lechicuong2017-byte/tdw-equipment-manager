# Chi phí dịch vụ viễn thông

## Sử dụng

Mở phân hệ **Chi phí viễn thông**, chọn một trong ba hạng mục:

- Tuyến ống & ICCPs.
- Điện thoại bàn.
- Điện thoại TGĐ.

Chọn **Nhập hóa đơn PDF**, chọn hạng mục và nhóm/mục đích sử dụng (không bắt buộc), sau đó **Đọc và xem trước**. Chỉ các hóa đơn mới được chọn mặc định; có thể bỏ chọn từng hóa đơn. Nhập thành công sẽ thông báo, đóng popup và tải lại danh sách. Mở lại popup hoặc đổi file sẽ bỏ bản xem trước cũ.

Năm hiện tại theo giờ Việt Nam là bộ lọc mặc định. Có thể lọc tháng, năm và hạng mục. Thẻ từng hạng mục hiển thị tổng chi phí của kỳ đang chọn; thống kê tổng và danh sách tuân theo hạng mục đang lọc. Xuất Excel có ba sheet: tổng hợp theo tháng/hạng mục, tổng hợp thuê bao/hạng mục và chi tiết hóa đơn. Tiền là ô số; thuê bao và số hóa đơn là chuỗi để giữ định dạng.

Hóa đơn nhập mới mặc định **Đã thanh toán** (xanh), ngày thanh toán là ngày nhập theo giờ Việt Nam. Các hóa đơn đã nhập trước đây cũng được backfill sang đã thanh toán theo ngày tạo bản ghi; ngày đã có sẵn được giữ nguyên. Trong **Xem / Sửa**, chỉnh ngày đã thanh toán, ghi chú hoặc hạng mục/nhóm. Để ngày trống tức **Chưa thanh toán** (đỏ). Xóa có xác nhận và là xóa mềm; nhật ký vẫn giữ dữ liệu cũ. Hóa đơn không bị chỉnh âm thầm số tiền khi nhập lại: nếu cùng danh tính nhưng khác tiền, kỳ cước hoặc thuê bao thì chặn để đối chiếu.

## Phạm vi và an toàn

- Hạng mục là phân loại nghiệp vụ người nhập chọn, không suy luận từ tên nhà mạng hoặc dòng “Dịch vụ Di động”.
- Kỳ cước được đọc trong nội dung hóa đơn, không lấy ngày lập hoặc tên file.
- PDF có lớp văn bản, tối đa 20 MB / 200 trang; hỗ trợ các mẫu Viettel và MobiFone đã kiểm thử. PDF scan, mẫu không nhận diện hoặc kỳ MobiFone trải qua nhiều tháng sẽ báo lỗi, không âm thầm bỏ trang.
- Đọc PDF trong trình duyệt; chỉ gửi các trường hóa đơn đã trích xuất đến server. Bản PDF gốc chưa được lưu đính kèm; hệ thống lưu tên file và trang nguồn. Người dùng cần giữ bản gốc tại nơi lưu chứng từ hiện có.
- Không suy đoán chuyển đổi số thuê bao cũ. Giữ nguyên định danh in trên hóa đơn.
- Chống trùng theo mã số thuế bên bán + ký hiệu + số hóa đơn, kể cả nhập sang hạng mục khác hoặc đổi tên file. RPC ghi nguyên tử và đối chiếu lại trước khi lưu.
- Admin có quyền toàn bộ và phải qua MFA như hệ thống hiện tại. Tài khoản khác cần được cấp phân hệ Viễn thông: manager xem/nhập/cập nhật/xuất, user/viewer chỉ xem. Đây là quyền toàn phân hệ (không giới hạn từng SIM/hạng mục). Không tự cấp phân hệ mới cho người dùng cũ.
- Bảng chỉ cấp SELECT qua RLS. Ghi dữ liệu qua RPC kiểm tra quyền; có audit và soft delete.

## Kiểm thử

`node tools/test-telecom-invoices.mjs` kiểm tra mẫu tổng hợp, kỳ cước, VAT, dữ liệu lỗi và danh tính hóa đơn. Có thể truyền đường dẫn PDF mẫu làm các tham số; lệnh chỉ đọc và in tổng hợp, không lưu hoặc nhập mẫu vào database.

Kết quả mẫu thực tế (cả ba đều kỳ 08/2026 dù lập trong 09/2026):

| Hạng mục | Hóa đơn | Trước thuế | VAT | Thanh toán |
| --- | ---: | ---: | ---: | ---: |
| Tuyến ống & ICCPs | 48 | 1.317.830 | 131.770 | 1.449.600 |
| Điện thoại bàn | 2 | 272.728 | 27.272 | 300.000 |
| Điện thoại TGĐ | 1 | 54.109 | 5.411 | 59.520 |
| Tổng | 51 | 1.644.667 | 164.453 | 1.809.120 |

`TELECOM_PGLITE_MODULE=/path/to/pglite/index.js node tools/test-telecom-db.mjs` chạy database PostgreSQL synthetic riêng biệt: mở rộng module grants, MFA, role/RLS, chống trùng xuyên hạng mục, rollback nguyên tử, tổng tháng/năm, thanh toán, xóa mềm và audit. Không kết nối production.

`node tools/test-telecom-report.mjs` kiểm tra route xuất Excel với hơn 500 bản ghi giả lập, bộ lọc tháng/năm/hạng mục, tổng tiền, ô số và định danh có số 0 đầu, lỗi và quyền truy cập.

Migrations: `202609070001_telecom_cost_management.sql`, `202609070002_telecom_paid_on_import.sql`, `202609070003_mark_existing_telecom_paid.sql`. Không thay đổi dữ liệu xe, VPP hay thiết bị.
