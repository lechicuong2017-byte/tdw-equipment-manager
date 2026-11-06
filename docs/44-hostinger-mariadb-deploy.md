# Triển khai lên Hostinger (Next.js + MariaDB) — quanly.tdw.com.vn

Từ phiên bản này ứng dụng **không còn dùng Supabase/Vercel**. Mọi thứ chạy trên gói
Hostinger Business (Web App Node.js) với cơ sở dữ liệu MariaDB của Hostinger.

## Kiến trúc mới

| Supabase cũ | Thay bằng | Mã nguồn |
| --- | --- | --- |
| PostgreSQL + 62 migration | MariaDB, schema sinh tự động | `next-app/db/*.sql`, `tools/mariadb/pg_to_mariadb.py` |
| RLS (117 chính sách) | Chính sách dịch sang SQL MariaDB, áp tại tầng truy vấn | `lib/db/generated/meta.ts`, `lib/db/policy-fragments.ts` |
| supabase-js `from().select()...` | Bộ truy vấn cùng API trên mysql2 | `lib/db/builder.ts` |
| 47 RPC PL/pgSQL | Hàm TypeScript cùng tên, cùng lỗi trả về | `lib/db/rpc/*.ts` |
| 80 trigger | Hook trong cùng giao dịch (nhật ký, nhãn nhóm, bảo trì, kho...) | `lib/db/hooks.ts` |
| Supabase Auth + MFA | Phiên cookie, mật khẩu scrypt (nhận cả bcrypt cũ), TOTP | `lib/db/auth-core.ts`, `app/mfa/actions.ts` |
| Supabase Storage | Thư mục `STORAGE_DIR` + URL ký HMAC | `lib/db/storage.ts`, `app/api/storage/*` |
| pg_cron | Cron của hPanel gọi `/api/jobs/*` | `app/api/jobs/*` |

`import { createClient } from "@/lib/supabase/server"` vẫn giữ nguyên tên để không phải sửa
77 trang/hành động; bên trong đã trỏ sang MariaDB.

## 1. Tạo cơ sở dữ liệu

hPanel → Websites → *quanly.tdw.com.vn* → Databases → MySQL Databases → tạo
`u590050594_quanly` / user `u590050594_quanly` (mật khẩu mạnh, tự lưu).

## 2. Tạo Web App Node.js

hPanel → Websites → **Create site → Web app** (Node.js), tên miền `quanly.tdw.com.vn`.

- Nguồn: GitHub `lechicuong2017-byte/tdw-equipment-manager`, nhánh `hostinger-mariadb`
  (hoặc tải file zip mã nguồn).
- Thư mục gốc (root directory): `next-app`
- Node.js: **22.x**
- Build command: `npm ci && npm run build`
- Start command / entry: `npm run start` (hoặc `node .next/standalone/server.js`)

Biến môi trường: xem `next-app/.env.example`. Bắt buộc: `DB_HOST=localhost`, `DB_NAME`,
`DB_USER`, `DB_PASSWORD`, `NEXT_PUBLIC_APP_URL=https://quanly.tdw.com.vn`,
`AUTH_ENCRYPTION_KEY`, `STORAGE_SIGNING_KEY`, `SOFTWARE_LICENSE_ENCRYPTION_KEY`
(giữ giá trị cũ trên Vercel), `STORAGE_DIR`, `SETUP_TOKEN`, `CRON_SECRET`.

## 3. Khởi tạo

Mở `https://quanly.tdw.com.vn/setup`, nhập `SETUP_TOKEN`, email + mật khẩu quản trị viên.
Trang tạo toàn bộ bảng, dữ liệu danh mục (vai trò, quyền, cài đặt) và tài khoản quản trị.
Sau đó **xoá biến `SETUP_TOKEN`**.

> Nếu chuyển dữ liệu cũ (bước 4) thì KHÔNG cần tạo quản trị viên mới: chạy bước 4 ngay
> sau khi tạo bảng; tài khoản cũ đăng nhập bằng mật khẩu cũ.

## 4. Chuyển dữ liệu cũ từ PostgreSQL

Chạy trên máy có truy cập cả PostgreSQL nguồn (Supabase hoặc bản Docker) và MariaDB
(bật Remote MySQL trong hPanel cho IP máy chạy, tắt lại sau khi xong):

```bash
cd tools/mariadb && npm ci
PG_URL="postgres://postgres:MAT_KHAU@localhost:5432/postgres" \
MYSQL_URL="mysql://u590050594_quanly:MAT_KHAU@<máy chủ MySQL Hostinger>:3306/u590050594_quanly" \
node migrate-data.mjs
```

Script chép tất cả bảng, tài khoản (giữ hash mật khẩu), MFA đã xác minh, metadata file,
rồi đối soát số dòng từng bảng. File thật trong Supabase Storage được chuyển bằng trang
**Quản trị → Chuyển file** (`/admin/storage-import`): thêm tạm `SUPABASE_URL` và
`SUPABASE_SERVICE_ROLE_KEY` trên hPanel, bấm "Chuyển file từ Supabase" (bấm lại nếu còn file),
xong thì xóa khóa. File được ghi vào `STORAGE_DIR/<bucket>/<đường dẫn cũ>`.

## 5. Cron (thay Vercel Cron / pg_cron)

hPanel → Advanced → Cron Jobs:

```
0 1 * * *   curl -fsS -H "Authorization: Bearer $CRON_SECRET" https://quanly.tdw.com.vn/api/jobs/maintenance-reminders
15 1 * * *  curl -fsS -H "Authorization: Bearer $CRON_SECRET" https://quanly.tdw.com.vn/api/jobs/vehicle-inspection-reminders
```

(giờ UTC; 01:00 UTC = 08:00 Việt Nam). Job đầu cũng chuyển trạng thái tài sản mua quá 1 năm.

## Kiểm thử

```bash
cd next-app
npm run typecheck
DATABASE_URL=mysql://... npm run test:db   # 29 kịch bản: RLS, RPC, trigger, khảo sát, kho...
```

Sinh lại schema/metadata khi có migration PostgreSQL mới: áp migration vào một PostgreSQL
tạm rồi chạy `tools/mariadb/pg_to_mariadb.py` và `tools/mariadb/gen_ts_meta.py`.
