# Anh thiet bi, anh bao tri va QR

## Luu tru

- Frontend chuyen JPEG, PNG va WebP sang WebP, canh dai toi da 1600 px, chat luong 82%.
- Moi thiet bi va moi lan bao tri co toi da 4 anh; moi file WebP phai nho hon 2 MB.
- Apps Script luu file trong thu muc Drive rieng `TDW Equipment Manager Media`.
- ID thu muc duoc luu trong Apps Script > Project Settings > Script Properties voi key `TDW_MEDIA_FOLDER_ID`.
- Co the tao truoc mot thu muc Drive va nhap ID hoac URL thu muc day du vao property nay. He thong se tu chuan hoa va luu lai ID. Neu property chua co, lan upload dau tien se tu tao thu muc va luu ID.
- Chay ham `checkMediaFolderConfiguration` trong Apps Script Editor de kiem tra ten, ID va URL thu muc ma tai khoan Apps Script dang truy cap.
- Neu ID khong hop le hoac tai khoan Apps Script khong co quyen truy cap, upload se bao loi ro rang va khong tu tao them thu muc khac.
- Tab `MediaFiles` chi luu metadata. File Drive khong duoc chia se cong khai.
- Anh duoc doc qua API sau khi xac thuc token va kiem tra quyen module.

## QR va deep-link

QR chỉ chứa URL hồ sơ theo mẫu `/assets/<asset_id>`. URL được tạo từ origin hiện tại nên cùng mã nguồn có thể dùng đúng trên production, preview hoặc môi trường nội bộ mà không phải ghi cứng domain.

- QR được tạo ngay trong trình duyệt bằng thư viện `qrcode`; ứng dụng không gọi dịch vụ tạo QR bên ngoài.
- QR không chứa serial, giá, bảo hành, người sử dụng hoặc dữ liệu nghiệp vụ khác.
- Khi chưa đăng nhập, middleware chuyển người dùng đến trang đăng nhập và giữ tham số `next` để quay lại đúng hồ sơ sau khi xác thực.
- Trang chi tiết thiết bị cho phép tải PNG và in một tem có logo TDW.
- Trang Báo cáo cho phép lọc theo nhóm, chọn từng thiết bị hoặc toàn bộ nhóm rồi in hàng loạt.
- Hai bố cục in được hỗ trợ: A4 dàn nhiều tem và tem 100 × 70 mm, hai tem mỗi trang.
- Dữ liệu danh sách QR được đọc bằng phiên Supabase hiện tại và chịu RLS; không dùng service-role key ở giao diện.

## Deploy

1. Cap nhat `google-apps-script/Code.gs` trong Apps Script.
2. Deploy mot Web App version moi, chon chay voi quyen cua chu so huu script.
3. Chap nhan quyen Google Drive neu Google yeu cau.
4. Push frontend va proxy len Vercel.
5. Dang nhap admin, them mot anh thu, mo lightbox va quet QR.
6. Kiem tra tab `MediaFiles`, thu muc Drive va `AuditLogs`.

Khong doi thu muc Drive sang che do cong khai hoac `Anyone with the link`.
