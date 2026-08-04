# Bằng chứng chuyển media Drive sang Supabase Storage production

Ngày kiểm tra: 2026-08-04
Phạm vi: chuyển ảnh thiết bị và ảnh lịch sử bảo trì từ snapshot Drive đã được backup sang Storage private.

## Phê duyệt và phạm vi

- Người dùng đã xác nhận backup và phê duyệt triển khai trực tiếp trên production.
- Thao tác chuyển được thực hiện trong phiên Chrome đã đăng nhập vào Google Drive và Supabase Dashboard.
- Không ghi ID thư mục, tên file nguồn, token, mật khẩu hoặc khóa tích hợp vào repository.

## Kết quả chuyển

- Đã chuyển đủ 11 ảnh nguồn vào bucket private `asset-media`.
- 2 ảnh gắn với thiết bị; 9 ảnh gắn với lịch sử bảo trì.
- Metadata `media_files` được ghi cho đủ 11 ảnh, gồm checksum SHA-256, loại MIME, kích thước và object path.
- Dữ liệu cha đã có 7 kế hoạch bảo trì và 11 nhật ký bảo trì.

## Đối soát production

| Kiểm tra | Kết quả |
|---|---:|
| Object trong Storage private | 11/11 |
| Dòng metadata `media_files` | 11/11 |
| Dòng có checksum hợp lệ | 11/11 |
| Metadata khớp object path | 11/11 |
| Phân bổ ảnh thiết bị / bảo trì | 2 / 9 |

Các số liệu trên được đọc từ SQL Editor production sau khi upload và metadata đã hoàn tất. Không có dữ liệu mẫu hoặc bản ghi thử được tạo thêm.

## Giới hạn bằng chứng

Môi trường hiện tại không có proxy, firewall hoặc network log được tổ chức phê duyệt. Vì vậy tài liệu này chỉ xác nhận thao tác/UI và kết quả SQL đã quan sát; không khẳng định mọi egress ngoài các kênh đó.

Backup PostgreSQL và Storage độc lập, cùng diễn tập restore trên staging, vẫn là hạng mục vận hành tiếp theo.
