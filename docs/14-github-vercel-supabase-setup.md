# Kết nối GitHub, Vercel và Supabase

Ngày cập nhật: 2026-07-29

## 1. GitHub

Repository đích:

```text
https://github.com/lechicuong2017-byte/tdw-equipment-manager
```

Lịch sử `main` đã được lọc để không chứa:

- `node_modules`;
- `.next`;
- `tsconfig.tsbuildinfo`;
- dữ liệu CSV/JSON dùng để migration;
- `.DS_Store`.

Nhánh `backup/pre-history-cleanup-20260729` chỉ tồn tại local và không được
push vì còn chứa lịch sử cũ cùng blob SWC lớn.

Trước khi push, đăng nhập Git cho máy này bằng một trong hai cách:

```text
GitHub CLI: gh auth login
SSH key: thêm public key của máy vào GitHub rồi đổi remote sang SSH
```

Không gửi Personal Access Token trong chat hoặc lưu token trong repository.

## 2. Vercel

Khi import repository:

1. Chọn framework `Next.js`.
2. Đặt **Root Directory** thành `next-app`.
3. Production Branch là `main`.
4. Install Command là `npm ci`.
5. Build Command là `npm run build`.

Các biến môi trường cần đặt trong Vercel Project Settings:

| Biến | Production | Preview | Ghi chú |
|---|---:|---:|---|
| `NEXT_PUBLIC_SUPABASE_URL` | Có | Project test riêng nếu dùng | Không phải secret |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | Có | Project test riêng nếu dùng | Không dùng service role |
| `NEXT_PUBLIC_APP_URL` | Có | URL preview tương ứng | Dùng cho Auth callback |
| `SUPABASE_SERVICE_ROLE_KEY` | Có | Không hoặc key project test | Server-only |
| `APPS_SCRIPT_EXPORT_URL` | Có | URL Apps Script test nếu dùng | Server-only |
| `APPS_SCRIPT_INTEGRATION_SECRET` | Có | Secret riêng | Server-only |
| `NEXT_TELEMETRY_DISABLED` | `1` | `1` | Tắt telemetry build |

Không đặt `SUPABASE_SERVICE_ROLE_KEY` trong biến có tiền tố `NEXT_PUBLIC_`.
Thay đổi environment variable chỉ có hiệu lực ở deployment mới.

File `vercel.legacy.json` chỉ phục vụ tham khảo/rollback frontend cũ và không
được dùng cho project Next.js mới.

## 3. Supabase

Sau khi tạo project production:

1. Lấy Project Reference, Project URL và publishable key trong Dashboard.
2. Cài Supabase CLI và đăng nhập bằng Personal Access Token từ secret manager.
3. Link repository local tới project.
4. Kiểm tra migration list.
5. Push `config.toml`, sau đó push database migrations.

```text
supabase login
supabase link --project-ref <PROJECT_REF>
supabase migration list
supabase config push
supabase db push
```

Không dùng SQL Editor/Table Editor để thay đổi schema sau khi đã áp dụng
migration-as-code.

Trong Auth URL Configuration:

- Site URL: domain production thật của Vercel.
- Redirect URL: `<NEXT_PUBLIC_APP_URL>/auth/callback`.
- Tắt public sign-up.
- Bắt buộc MFA cho admin theo quy trình dự án.

Áp migration theo thứ tự:

```text
202607290001_initial_schema.sql
202607290002_record_scopes_and_storage_rls.sql
```

Sau khi migration thành công:

1. Mời admin đầu tiên bằng Supabase Auth.
2. Gán role admin và hoàn tất AAL2/MFA.
3. Chạy ma trận `docs/12-supabase-security-test-matrix.md`.
4. Chỉ sau khi RLS đạt mới chạy import dữ liệu production.

## 4. Cutover

1. Deploy Apps Script mới và cấu hình HMAC secret.
2. Đặt `TDW_LEGACY_MODE=read-only`.
3. Chạy import và reconcile.
4. Deploy Vercel từ `main`.
5. Kiểm tra Auth, RLS, Storage và export.
6. Đặt `TDW_LEGACY_MODE=disabled` khi không còn request legacy.

Không push secret, dữ liệu migration hoặc nhánh backup history cũ lên GitHub.
