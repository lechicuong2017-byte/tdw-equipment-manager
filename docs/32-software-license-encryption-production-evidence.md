# Bằng chứng mã hóa key bản quyền production

Ngày kiểm tra: 2026-08-04 (Asia/Ho_Chi_Minh)

## Phạm vi

- Tên phần mềm trên danh sách dẫn trực tiếp tới màn hình sửa khi người dùng có
  quyền `software.manage`.
- Key đầy đủ chỉ nhập tại panel Admin bằng input `password`.
- Next.js mã hóa AES-256-GCM trước khi gửi ciphertext sang PostgreSQL.
- Danh sách và báo cáo chỉ đọc `license_key_masked`.
- Admin phải hoàn tất MFA; mỗi lần lưu/xem key ghi audit không chứa key.

## Cổng local

- Synthetic gate: 6/6 kiểm tra đạt, gồm round-trip AES-GCM, role gate và phát
  hiện ciphertext bị sửa.
- `npm test`: đạt.
- `npm --prefix next-app run typecheck`: đạt.
- `npm --prefix next-app run build`: đạt; route `/software/[id]/edit` được build
  dạng server-rendered động.

## Supabase production

Migration `202608040002_software_license_secrets.sql` chạy thành công. Câu lệnh
đối soát chỉ đọc trả về:

| Hạng mục | Kết quả |
| --- | ---: |
| Bảng `software_license_secrets` tồn tại | `true` |
| Policy RLS | 4 |
| RPC admin | 2 |
| Key mã hóa tại thời điểm triển khai | 0 |

Không nhập key giả vào production để tránh tạo dữ liệu nghiệp vụ không thuộc
người dùng.

## Vercel production

`SOFTWARE_LICENSE_ENCRYPTION_KEY` được tạo ngẫu nhiên 32 byte và lưu dưới dạng
Sensitive cho Production và Preview. Giá trị không được ghi vào file, Git,
output công cụ hoặc tài liệu này. Deployment mới là bắt buộc để server nhận biến.

## Giới hạn

AES-256-GCM ở đây là lớp mã hóa ứng dụng với khóa nằm trong Vercel Secret, chưa
phải KMS có rotation tự động. Chưa có proxy/firewall log được tổ chức phê duyệt,
vì vậy bằng chứng này không đưa ra kết luận về egress.
