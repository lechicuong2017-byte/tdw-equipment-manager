# Quản lý chi phí VETC

## Sử dụng

- Mở **Quản lý xe → Chi phí VETC** ở menu trái hoặc tab **VETC**.
- **Nhập vé lẻ PDF**: chọn PDF có lớp văn bản theo mẫu hóa đơn VETC, tối đa 4 MB. Xem xe, trạm, thời gian Việt Nam và số tiền sau VAT trước khi chọn các giao dịch cần nhập.
- Mỗi tháng có một dòng tổng hợp. Nhập thêm PDF cùng tháng sẽ cộng các giao dịch mới; giao dịch trùng được bỏ qua. PDF nhiều tháng hoặc trang không đọc được sẽ báo lỗi để kiểm tra lại.
- **Nhập vé quý XLSX**: tìm cột theo tiêu đề trên mọi sheet. Giữ nguyên ngày bắt đầu/kết thúc trong file, không mặc định ngày đầu quý. Dòng mới được chọn sẵn, dòng trùng bị bỏ qua; dòng cùng file/sheet/vị trí đã thay đổi được cập nhật.
- Xe phải tồn tại và nằm trong quyền truy cập. Hậu tố T của biển số được đối chiếu với biển số hồ sơ khi có kết quả khớp. Không tự tạo hồ sơ xe từ nội dung hóa đơn.
- Lưu thành công sẽ hiện thông báo, đóng popup và làm mới danh sách. Đổi file hoặc mở lại popup sẽ bỏ phần xem trước cũ.
- Thống kê mặc định năm hiện tại. Vé quý tính vào năm bắt đầu hiệu lực. Trong **Báo cáo xe**, xuất Excel VETC theo năm/tháng/xe; file gồm chi tiết vé lẻ, vé quý và tổng hợp.
- PDF chỉ dùng để trích xuất; tính năng này chưa lưu bản PDF gốc để tải lại. Người dùng giữ hóa đơn gốc để đối chiếu bằng số hóa đơn/mã giao dịch.

## Quyền và tính toàn vẹn

Migration `202609030001_vehicle_vetc_management.sql` tạo ba bảng riêng cùng các RPC nhập, xóa và thống kê. Giao dịch nhập và tổng tháng được commit cùng nhau; lỗi sẽ rollback toàn bộ. Ghi trực tiếp bằng vai trò authenticated bị chặn.

Đọc dữ liệu áp dụng `vehicles.view` và phạm vi từng xe. Dòng tổng tháng chỉ hiển thị khi người dùng có quyền trên mọi xe thuộc tháng đó; báo cáo và thống kê năm chỉ tính các giao dịch trong phạm vi của họ. Nhập/xóa kiểm tra `vehicles.import`/`vehicles.delete` và từng xe. Xuất báo cáo còn yêu cầu `reports.vehicles.export`.

## Kiểm chứng ngày 06/09/2026

- Parser: PDF mẫu có 22 lượt, 4 trạm, tổng 331.272 đồng; XLSX mẫu có 24 dòng trên 8 sheet, tổng thô 52.488.000 đồng. Trong đó 3 dòng sheet 10.2026 lặp lại xe/trạm/kỳ/chi phí của sheet 08.2026: xem trước chọn 21 đăng ký khác nhau, tổng 45.927.000 đồng và cảnh báo các dòng trùng. File mẫu không được đưa vào Git.
- Đã kiểm tra xem trước PDF và XLSX trên Vercel, khớp toàn bộ xe trong mẫu; bỏ chọn cập nhật tổng và đóng/mở lại PDF xóa dữ liệu xem trước. Chỉ xem trước, chưa lưu các bản ghi mẫu vào production.
- `node tools/test-vehicle-vetc.mjs`: ngày không hợp lệ, VAT sai, nhận diện biển số, vị trí cột và khóa chống trùng. Có thể truyền đường dẫn PDF và XLSX mẫu làm hai tham số để kiểm tra mẫu đầy đủ.
- `VETC_PGLITE_MODULE=/path/to/pglite/dist/index.js node tools/test-vehicle-vetc-db.mjs`: chạy PostgreSQL cô lập với dữ liệu synthetic, kiểm tra migration, rollback, nhập trùng, bổ sung tháng, cập nhật quý, RLS, ghi trực tiếp bị chặn và thống kê theo phạm vi. Đã chạy với PGlite 0.3.14 cài trong thư mục tạm, không thêm dependency production.
- TypeScript và production build đã qua. Build giữ PDF reader trên Node và bundle worker trình duyệt riêng để không ảnh hưởng chức năng nén hóa đơn hiện có.
- `npm test` của dự án còn lỗi kiểm tra tĩnh `maintenanceMediaByLog` tại `tools/smoke-test.js:282`. File bảo trì liên quan không thay đổi trong tính năng này; đây là hạn chế của bộ kiểm thử hiện tại.
