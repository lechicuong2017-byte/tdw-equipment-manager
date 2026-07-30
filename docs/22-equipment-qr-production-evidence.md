# Bằng chứng production — Mã QR và tem thiết bị

Ngày kiểm tra: 2026-07-30
Phạm vi: hồ sơ thiết bị, tải PNG, in một tem và in tem hàng loạt.

## Thay đổi đã triển khai

- Vercel production commit `341d9df`, trạng thái `Ready`, `Latest` và `Current`.
- Hồ sơ thiết bị có thẻ QR với logo TDW, nút `Tải mã QR` và `In tem QR`.
- Trang Báo cáo có khu vực `In tem QR thiết bị hàng loạt` cho phép lọc nhóm, chọn từng thiết bị hoặc chọn toàn bộ nhóm.
- Hỗ trợ A4 dàn nhiều tem và khổ 100 × 70 mm với hai tem mỗi trang.
- QR chỉ mã hóa URL `/assets/<asset_id>` trên origin hiện tại. Serial, giá trị, thông tin người dùng và dữ liệu nghiệp vụ không được đưa vào QR.
- QR được tạo phía trình duyệt bằng `qrcode`; không sử dụng API tạo QR bên ngoài.
- Truy vấn danh sách thiết bị dùng phiên Supabase của người dùng hiện tại và tiếp tục chịu RLS; không dùng service-role key.

## Kiểm tra trước production

- Repo tổng hợp tối thiểu đã loại dữ liệu thật: 6 kiểm tra hợp đồng QR đạt.
- `npm run next:typecheck`: đạt.
- `npm test`: đạt.
- `npm run next:build`: đạt; `/assets/[id]` và `/reports` được build động.
- `git diff --check`: đạt.
- Kiểm tra phụ thuộc sau cài đặt: không có lỗ hổng được npm báo cáo.

## Kiểm tra production bằng Chrome

- Hồ sơ `TDW-LAP-2022-001` hiển thị ảnh QR, mô tả an toàn, nút tải PNG và nút in một tem.
- Nút tải PNG nhận thao tác thành công và trang không phát sinh cảnh báo.
- Trang Báo cáo đọc đúng 72 thiết bị mà tài khoản admin hiện tại được phép xem.
- Bộ chọn hiển thị đủ 5 nhóm thiết bị và 2 lựa chọn khổ giấy.
- Chọn riêng `TDW-DEV-2006-010` cập nhật bộ đếm từ `0 đã chọn` thành `1 đã chọn`.
- Đổi sang `Tem 100 × 70 mm · 2 tem mỗi trang` thành công.
- Lệnh `In 1 tem QR` tạo cửa sổ in có tiêu đề `Tem QR thiết bị TDW`.

Chrome không cho công cụ kiểm tra đọc trang tải xuống nội bộ hoặc nội dung hộp thoại in hệ thống. Vì vậy bằng chứng tải/in ở đây gồm thao tác nút, trạng thái giao diện và cửa sổ bản in được tạo; việc lưu tệp hoặc gửi lệnh đến máy in vẫn do người dùng xác nhận trong giao diện hệ điều hành.

## Giới hạn bằng chứng mạng

Môi trường hiện tại không có proxy, firewall hoặc network log được tổ chức phê duyệt. Vì vậy tài liệu này không khẳng định “không có upload/egress”. Từ mã nguồn có thể xác nhận luồng tạo QR không gọi dịch vụ QR bên ngoài, nhưng đây không phải bằng chứng mạng cho toàn bộ runtime.
