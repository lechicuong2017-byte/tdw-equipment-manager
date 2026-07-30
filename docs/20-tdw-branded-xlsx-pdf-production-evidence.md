# Gate 6 — Bằng chứng XLSX/PDF có nhận diện TDW trên production

Ngày kiểm tra: 2026-07-30  
Phạm vi: bốn báo cáo Supabase, định dạng XLSX/PDF, logo dashboard và favicon.

## Thay đổi đã triển khai

- Apps Script version 10, cùng Web App deployment ID/URL đang dùng trước đó.
- Vercel production commit `b60dffb`, trạng thái `Ready`.
- Mỗi báo cáo nhận `report_name` riêng:
  - Báo cáo danh sách thiết bị.
  - Báo cáo kế hoạch và lịch sử bảo trì.
  - Báo cáo lịch sử bàn giao.
  - Báo cáo bản quyền phần mềm.
- Mẫu XLSX/PDF có logo TDW, tên công ty, tên báo cáo, ngày xuất, tổng số dòng, cột STT, tiêu đề xanh, dòng xen kẽ và hàng tổng xanh đậm.
- Dashboard dùng logo TDW thật thay ký tự tạm; favicon và biểu tượng Apple dùng bộ nhận diện cũ.

## Kiểm tra trước production

- Repo tổng hợp tối thiểu không chứa dữ liệu thật đã được tạo và commit riêng trong thư mục tạm.
- Mẫu XLSX tổng hợp được tạo bằng runtime bảng tính được phê duyệt, kiểm tra ô và quét lỗi công thức: không có lỗi.
- XLSX được render trực quan; do renderer không hiển thị drawing, workbook tiếp tục được chuyển sang PDF bằng LibreOffice và raster bằng Poppler để kiểm tra ảnh nhúng.
- Kết quả trực quan: logo đúng tỷ lệ, tiêu đề không bị cắt, bảng rõ ràng, một trang A4 với dữ liệu mẫu.
- `npm run next:typecheck`, `npm test`, `npm run next:build` và `git diff --check` đều đạt.

## Kiểm tra production

- Dashboard production hiển thị ảnh `TDW — Better Service For Life` trong sidebar.
- Trang báo cáo production hiển thị đủ bốn nhóm và tám nút XLSX/PDF.
- Báo cáo thiết bị XLSX tạo thành công với 72 dòng.
- Báo cáo thiết bị PDF tạo thành công với 72 dòng, A4 ngang, fit-to-width, lặp hàng tiêu đề và có lề in.
- Google Sheets nguồn của lần xuất mới được mở bằng phiên Chrome đăng nhập và kiểm tra trực quan: logo, tên `BÁO CÁO DANH SÁCH THIẾT BỊ`, ngày xuất, tiêu đề cột, màu xen kẽ và dữ liệu đều hiển thị đúng.
- Người dùng đã xác nhận file tải xuống hoạt động ở lần kiểm tra trước; trang nội bộ `chrome://downloads` vẫn không thể đọc bằng công cụ trình duyệt do chính sách bảo mật của Chrome.

## Giới hạn bằng chứng mạng

Không có proxy, firewall hoặc network log đã được tổ chức phê duyệt trong môi trường này. Vì vậy tài liệu này không khẳng định “không có upload/egress”. Bằng chứng chỉ bao gồm hành vi ứng dụng, trạng thái triển khai, kết quả build/test và trạng thái hiển thị trong các phiên đăng nhập được người dùng cho phép.
