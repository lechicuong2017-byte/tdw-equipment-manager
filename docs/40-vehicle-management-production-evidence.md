# Phân hệ quản lý xe — production evidence

Ngày triển khai: 21/08/2026.

## Phạm vi

- Trang chọn phân hệ sau đăng nhập: quản lý thiết bị hoặc quản lý xe.
- Hồ sơ xe có mã, biển số, người sử dụng, phòng ban, định mức nhiên liệu và trạng thái.
- Đăng kiểm có ngày thực hiện, ngày hết hạn, chi phí, số giấy, trung tâm và mốc nhắc mặc định 30 ngày.
- Bảo dưỡng/sửa chữa và nhiên liệu có nhập thủ công, lịch sử nhiều năm và import XLSX.
- Import XLSX có bước xem trước, cảnh báo dữ liệu bất thường và fingerprint chống nhập trùng.
- Báo cáo danh sách xe, đăng kiểm, bảo dưỡng và nhiên liệu hỗ trợ XLSX/PDF có logo TDW.
- Vercel cron gọi tác vụ nhắc đăng kiểm hằng ngày; Apps Script gửi Gmail cho người phụ trách xe.

## Dữ liệu mẫu đã kiểm tra

- `BM02.HC - So theo doi mua nhien lieu xe o to.xlsx`:
  - 24 dòng năm 2025;
  - 55 dòng năm 2026.
- `BM03.HC - Nhat ky bao tri bao duong sua chua xe o to 2026.xlsx`:
  - 6 dòng bảo dưỡng/sửa chữa năm 2026.

## Kiểm thử

- Synthetic vehicle domain isolation: pass.
- Kiểm tra workbook thật: pass.
- `npm run typecheck`: pass.
- `npm run build`: pass.
- `npm audit --omit=dev`: 0 vulnerability.
- Apps Script syntax check: pass.
- Supabase production xác nhận bảng `vehicles`, `vehicle_inspections` và 5 permission mới.
- Apps Script production cập nhật version 12, giữ nguyên deployment ID/URL.

## Giới hạn kiểm chứng egress

Log cài dependency xác nhận request chỉ đến `registry.npmjs.org` trong thao tác cài đặt. Môi trường không có proxy/firewall capture độc lập cho toàn bộ tiến trình, nên không thể khẳng định tuyệt đối không có egress khác chỉ dựa trên log ứng dụng.
