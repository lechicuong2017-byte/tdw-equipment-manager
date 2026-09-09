# Phân hệ khảo sát công ty

## Sử dụng

1. Chọn **Khảo sát công ty** tại `/modules`, hoặc mở `/surveys`.
2. Tạo khảo sát, đặt tiêu đề và lời giới thiệu. Thêm câu hỏi điền thông tin (ngắn/đoạn văn) hoặc trắc nghiệm (một/nhiều đáp án). Mỗi câu có tùy chọn bắt buộc.
3. Có thể tải mẫu XLSX, nhập tối đa 100 câu từ sheet đầu tiên, xem trước và chọn dòng. Nhập Excel chỉ thêm vào bản nháp; cần bấm **Lưu khảo sát**.
4. Mở nhận phản hồi rồi sao chép link. Câu hỏi bị khóa sau khi phát hành để giữ nguyên ý nghĩa kết quả. Tên/lời giới thiệu vẫn sửa được. Có thể đóng/mở lại khảo sát.
5. Nhân viên mở `/s/[token]`, nhập họ tên và điện thoại hoặc email, bắt đầu rồi gửi câu trả lời. Không cần đăng nhập.
6. Người quản lý xem từng phản hồi (20 dòng/trang), xuất XLSX gồm tổng hợp theo lựa chọn và chi tiết tất cả câu trả lời.

## Phân quyền và dữ liệu

- Module `surveys` được cấp tại quản trị người dùng. Admin có toàn quyền; manager được quản lý/xuất khi có module; user/viewer được xem khi có module. Quyền xem bao gồm thông tin liên hệ, không giới hạn theo phòng ban.
- `company_surveys` và `survey_responses` bật RLS, không cấp quyền đọc trực tiếp cho anon; authenticated chỉ được đọc với `surveys.view`. Việc ghi đi qua RPC có kiểm tra quyền và revision.
- Chỉ RPC `get_public_survey` và `submit_company_survey` dành cho anon. RPC đọc chỉ trả tên, mô tả và câu hỏi của khảo sát đang mở. Không trả thông tin người trả lời, kết quả hoặc danh sách khảo sát.
- Link UUID ngẫu nhiên không xác minh danh tính nhân viên. Người có link có thể trả lời, kể cả khi nhận link chuyển tiếp. Không coi tên/điện thoại/email là danh tính đã xác thực. Form nêu rõ đây không phải khảo sát ẩn danh.
- Submission UUID chống tạo trùng khi thử lại cùng yêu cầu; không cấm một người gửi lại từ thiết bị/lượt truy cập khác. Khóa hàng đảm bảo atomicity khi đóng khảo sát, tăng số phản hồi và kiểm tra giới hạn.
- Giới hạn 100 câu, 20 lựa chọn/câu, 10.000 phản hồi/khảo sát và 120 phản hồi/phút/khảo sát. Honeypot chỉ là bổ trợ, không thay thế xác thực hay chống spam chuyên dụng. Không dùng service-role key ở trang công khai.
- Chưa có xóa khảo sát/phản hồi; đóng khảo sát giữ nguyên dữ liệu. Việc giữ/xóa dữ liệu cá nhân cần theo quy định của công ty.
- XLSX không thực thi công thức đầu vào. Xuất ô văn bản thuần để tránh diễn giải câu trả lời thành công thức, giữ số 0 đầu số điện thoại. Nếu một trang truy vấn thất bại thì dừng xuất, không trả file thiếu dữ liệu.

## Kiểm thử

```
npm --prefix next-app run typecheck
npm --prefix next-app run build
node tools/test-survey-xlsx.mjs
node tools/test-survey-export.mjs
SURVEY_PGLITE_MODULE=/path/to/@electric-sql/pglite/dist/index.js node tools/test-surveys-db.mjs
node tools/survey-ui/run.mjs
```

PGlite chỉ dùng PostgreSQL giả lập local. UI harness dùng component thật, server action giả, hồ sơ Chrome tạm; chặn các request của trang không đến server loopback. Đây không phải bằng chứng egress toàn bộ môi trường. UI harness kiểm tra desktop/mobile, nhập Excel, đóng/mở popup và scroll lock, radio/checkbox, khoảng trắng, gửi lỗi rồi thử lại.
