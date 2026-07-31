# Bằng chứng production — Thumbnail ảnh thiết bị riêng tư

Ngày kiểm tra: 2026-07-30  
Phạm vi: xử lý ảnh, Supabase Storage/RLS, ảnh xem nhanh trong danh sách và Vercel Production.

## Thay đổi đã triển khai

- Mỗi ảnh tải lên có ảnh gốc và thumbnail WebP tối đa 480 × 360.
- Thumbnail được lưu trong bucket `asset-media` riêng tư và liên kết bằng `media_files.thumbnail_path`.
- Danh sách tài sản chỉ ký URL xem ảnh trong 5 phút; ưu tiên thumbnail và fallback về ảnh gốc cho dữ liệu cũ.
- Trang hồ sơ dùng URL riêng tư trực tiếp, không đưa nội dung ảnh qua cache công khai của Next Image Optimizer.
- Khi xóa ảnh, hệ thống xóa cả ảnh gốc, thumbnail và metadata.

## Kiểm tra an toàn trước production

- Repo tổng hợp tối thiểu không chứa dữ liệu thật đạt 8 kiểm tra về đường dẫn, loại ảnh, kích thước và fallback.
- Phép biến đổi ảnh thật bằng Sharp đạt: PNG 1200 × 900 được tạo thành WebP 480 × 360, giảm từ 16.032 xuống 400 byte trong mẫu màu đơn.
- Nội dung ảnh được giải mã để đối chiếu MIME; từ chối định dạng giả mạo, ảnh động, ảnh trên 40 triệu pixel và file trên 5 MB.
- Metadata được ghi trước object để RLS cho phép rollback file nếu một bước upload thất bại.
- `npm run next:typecheck`: đạt.
- `npm test`: đạt.
- `npm run next:build`: đạt.
- `git diff --check`: đạt.

## Xác minh Supabase production

- Migration `202607300013_private_media_thumbnails.sql` chạy thành công.
- Cột `thumbnail_path`, chỉ mục duy nhất và ràng buộc không trùng đường dẫn ảnh gốc đều tồn tại.
- Hai helper đọc/xóa Storage đều nhận biết `thumbnail_path`; chính sách bucket hiện tại tiếp tục gọi các helper này.
- Bucket `asset-media` vẫn là bucket riêng tư.
- Tại thời điểm kiểm tra có 0 dòng `media_files` và 0 object trong bucket, phù hợp với dữ liệu migration trước đó.

## Xác minh Vercel và Chrome

- Vercel production commit `47e9156` báo `success`.
- Danh sách Production hiển thị 72 tài sản, phân trang bình thường và có vị trí ảnh xem nhanh cho từng dòng.
- Vì chưa có ảnh thật, vị trí xem nhanh hiển thị placeholder thay vì ảnh hỏng.
- Hồ sơ `TDW-LAP-2022-001` hiển thị `0 ảnh`, trạng thái rỗng và biểu mẫu upload JPEG/PNG/WebP tối đa 5 MB.
- Không tải ảnh mẫu lên Production để tránh làm thay đổi dữ liệu thật của người dùng.

## Giới hạn bằng chứng

Do Production hiện chưa có media, luồng tạo thumbnail đã được xác minh bằng xử lý ảnh thật cục bộ, build Production và cấu trúc/quyền Supabase; chưa thực hiện upload end-to-end bằng dữ liệu mẫu trên Production.

Môi trường hiện tại không có proxy, firewall hoặc network log được tổ chức phê duyệt. Vì vậy tài liệu này không khẳng định “không có upload/egress”; bằng chứng chỉ xác nhận mã nguồn, kết quả xử lý ảnh, trạng thái database, quyền, build/deploy và hành vi giao diện trong phiên được người dùng cho phép.
