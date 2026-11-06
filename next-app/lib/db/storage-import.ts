import "server-only";
// Chuyển file cũ từ Supabase Storage về thư mục STORAGE_DIR trên Hostinger.
// Danh sách file lấy từ bảng storage_objects (đã nhập cùng dữ liệu). Cần 2 biến môi trường
// do quản trị viên tự nhập trên hPanel: SUPABASE_URL và SUPABASE_SERVICE_ROLE_KEY (khóa secret).
// Chạy nhiều lần được: file đã có trên đĩa thì bỏ qua.

import { mkdir, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { getPool, query } from "@/lib/db/pool";
import { BUCKETS, safePath } from "@/lib/db/storage";

type StoredObject = { bucket_id: string; name: string; size: number | null };

export type StorageImportStatus = {
  total: number;
  present: number;
  missing: number;
  missingBytes: number;
  byBucket: { bucket: string; total: number; present: number }[];
  configured: boolean;
};

export type StorageImportRun = {
  copied: number;
  failed: { name: string; error: string }[];
  remaining: number;
  stoppedForTime: boolean;
};

function supabaseConfig() {
  const url = String(process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || "").trim().replace(/\/$/, "");
  const key = String(process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SECRET_KEY || "").trim();
  return url && key && /^https:\/\/[a-z0-9-]+\.supabase\.co$/i.test(url) ? { url, key } : null;
}

async function exists(full: string) {
  try {
    return (await stat(full)).isFile();
  } catch {
    return false;
  }
}

async function listObjects() {
  const rows = await query<StoredObject>(
    getPool(),
    `SELECT bucket_id, name, size FROM storage_objects WHERE bucket_id IN (${BUCKETS.map(() => "?").join(",")}) ORDER BY bucket_id, name`,
    [...BUCKETS],
  );
  return Promise.all(rows.map(async (row) => {
    let present = false;
    try {
      present = await exists(safePath(row.bucket_id, row.name));
    } catch {
      present = false;
    }
    return { ...row, present };
  }));
}

export async function storageImportStatus(): Promise<StorageImportStatus> {
  const objects = await listObjects();
  const byBucket = BUCKETS.map((bucket) => {
    const items = objects.filter((item) => item.bucket_id === bucket);
    return { bucket, total: items.length, present: items.filter((item) => item.present).length };
  }).filter((item) => item.total > 0);
  const missing = objects.filter((item) => !item.present);
  return {
    total: objects.length,
    present: objects.length - missing.length,
    missing: missing.length,
    missingBytes: missing.reduce((sum, item) => sum + Number(item.size || 0), 0),
    byBucket,
    configured: Boolean(supabaseConfig()),
  };
}

export async function importStorageFromSupabase(timeBudgetMs = 45000): Promise<StorageImportRun> {
  const config = supabaseConfig();
  if (!config) throw new Error("Chưa cấu hình SUPABASE_URL và SUPABASE_SERVICE_ROLE_KEY.");
  const started = Date.now();
  const missing = (await listObjects()).filter((item) => !item.present);
  const headers: Record<string, string> = { apikey: config.key };
  // Khóa kiểu cũ (JWT) cần thêm Authorization; khóa sb_secret_ chỉ dùng apikey.
  if (config.key.startsWith("eyJ")) headers.Authorization = `Bearer ${config.key}`;

  const run: StorageImportRun = { copied: 0, failed: [], remaining: 0, stoppedForTime: false };
  let index = 0;
  for (; index < missing.length; index += 1) {
    if (Date.now() - started > timeBudgetMs) {
      run.stoppedForTime = true;
      break;
    }
    const item = missing[index];
    const encoded = item.name.split("/").map(encodeURIComponent).join("/");
    try {
      const response = await fetch(`${config.url}/storage/v1/object/${item.bucket_id}/${encoded}`, {
        headers,
        cache: "no-store",
        signal: AbortSignal.timeout(30000),
      });
      if (!response.ok) throw new Error(`Supabase trả về HTTP ${response.status}`);
      const bytes = Buffer.from(await response.arrayBuffer());
      const full = safePath(item.bucket_id, item.name);
      await mkdir(path.dirname(full), { recursive: true });
      await writeFile(full, bytes);
      run.copied += 1;
    } catch (error) {
      run.failed.push({
        name: `${item.bucket_id}/${item.name}`,
        error: error instanceof Error ? error.message.slice(0, 200) : "Không tải được",
      });
    }
  }
  run.remaining = missing.length - run.copied - run.failed.length;
  return run;
}
