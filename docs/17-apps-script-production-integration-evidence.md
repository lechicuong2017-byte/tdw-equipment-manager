# Gate 3 — Apps Script production integration evidence

Date: 2026-08-04
Environment: production

## Configuration

- Apps Script Web App deployed as version 3.
- Web App executes as the project owner and is accessible to `Anyone`; requests are authenticated by HMAC before any report is created.
- Apps Script properties in use:
  - `TDW_NEXT_INTEGRATION_SECRET`
  - `TDW_LEGACY_MODE=disabled` (trước khi cutover, hệ thống đã chạy qua `read-only`)
- Vercel production and preview environments contain:
  - `APPS_SCRIPT_EXPORT_URL`
  - `APPS_SCRIPT_INTEGRATION_SECRET`
- Secret values are stored only in the two platform secret stores and are not present in Git.
- Diagnostic Script Properties used during verification were removed.

## Security checks

The smoke test covers:

- a valid HMAC SHA-256 request;
- an invalid signature;
- an expired timestamp;
- replay of a previously accepted nonce;
- spreadsheet formula-injection neutralization.

Replay protection uses a script lock plus a bounded nonce ledger in Script Properties. The legacy Google Sheets API is now disabled, so it cannot accept business-data writes; the signed `exportSupabaseReport` path remains available independently.

## Verification results

- `npm test`: passed.
- `npm run next:typecheck`: passed.
- `npm run next:build`: passed.
- Vercel production deployment: Ready.
- Chrome production check at `/reports`: `Đã xuất 72 dòng`.
- Apps Script execution log recorded the production `doPost` Web App request.
- On 2026-08-04, the production Script Properties were verified in Chrome and `TDW_LEGACY_MODE` was changed to `disabled`.
- The post-cutover `/admin/health` check remained operational for Next.js/Vercel, Supabase PostgreSQL/RLS and Apps Script HMAC.
- The production path exercised was:
  - authenticated Next.js report request;
  - RLS-scoped asset read from Supabase;
  - server-side HMAC request to Apps Script;
  - Google Sheets report creation.

The browser/network evidence above confirms the expected export request was executed from the production environment. It does not by itself prove the absence of all other egress from the hosting platforms.

## Operational note

The report page now opens a placeholder tab synchronously and redirects it when the export is ready. A persistent `Mở báo cáo` link is also rendered so the result remains reachable when a browser blocks popups.
