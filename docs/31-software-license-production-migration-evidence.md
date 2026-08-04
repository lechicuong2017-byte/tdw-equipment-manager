# Bằng chứng chuyển dữ liệu phần mềm production

Ngày thực hiện: 2026-08-04

## Phạm vi được phê duyệt

- Chuyển dữ liệu từ sheet `SoftwareLicenses` sang Supabase PostgreSQL.
- Chỉ lấy ID nguồn, tên phần mềm, phiên bản, phân bổ, ngày hết hạn, trạng thái và ghi chú.
- Không đọc vào dữ liệu nhập, không lưu và không chuyển cột license key.
- Quản trị viên sẽ cập nhật key sau bằng luồng quản lý secret phù hợp.

## Kết quả

| Kiểm tra | Kết quả |
|---|---:|
| Dòng nguồn không gồm header | 5 |
| Dòng upsert vào `software_licenses` | 5 |
| Dòng production sau chuyển | 5 |
| Dòng có key và secret reference để trống | 5/5 |

Màn hình Phần mềm production hiển thị đủ 5 bản ghi; cột key hiển thị `Không lưu`.

## Bảo vệ lần chạy sau

Importer không gửi `license_key_masked` hoặc `license_secret_ref`. Bản ghi mới dùng giá trị mặc định rỗng; nếu quản trị viên cập nhật key sau, lần import lại không ghi đè hai trường này.

File CSV làm việc nằm trong thư mục dữ liệu migration đã bị `.gitignore`; không có license key, dữ liệu import hoặc secret được đưa vào Git.

## Giới hạn bằng chứng

Môi trường hiện tại không có proxy, firewall hoặc network log được tổ chức phê duyệt. Bằng chứng xác nhận kết quả Google Sheets, Supabase SQL và giao diện production đã quan sát, không khẳng định mọi egress ngoài các kênh đó.
