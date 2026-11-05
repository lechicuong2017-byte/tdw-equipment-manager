import "server-only";
// Thay Supabase Storage: file lưu trên ổ đĩa (STORAGE_DIR, nên đặt NGOÀI public_html),
// đường dẫn tải về là URL ký HMAC có hạn dùng, phục vụ bởi app/api/storage/[...path]/route.ts.
// Quyền đọc/ghi/xoá giống chính sách storage.objects cũ.

import { createHmac, timingSafeEqual } from "node:crypto";
import { mkdir, readFile, rm, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { execute, getPool, query } from "@/lib/db/pool";
import { DbError, escapeLiteral } from "@/lib/db/sql";
import type { Session } from "@/lib/db/builder";

export const BUCKETS = ["asset-media", "asset-documents", "vehicle-documents", "it-cost-documents"] as const;
type Bucket = (typeof BUCKETS)[number];

export function storageRoot() {
  return path.resolve(process.env.STORAGE_DIR || path.join(process.cwd(), "..", "tdw-storage"));
}

function safePath(bucket: string, name: string) {
  if (!BUCKETS.includes(bucket as Bucket)) throw new DbError(`Bucket không tồn tại: ${bucket}`, "404");
  if (!name || name.includes("..") || name.startsWith("/") || name.includes("\\") || name.includes("\0")) {
    throw new DbError("Đường dẫn file không hợp lệ", "400");
  }
  const root = path.join(storageRoot(), bucket);
  const full = path.resolve(root, name);
  if (!full.startsWith(root + path.sep)) throw new DbError("Đường dẫn file không hợp lệ", "400");
  return full;
}

function signingKey() {
  const key = process.env.STORAGE_SIGNING_KEY || process.env.AUTH_ENCRYPTION_KEY || "";
  if (key.length < 32) throw new Error("STORAGE_SIGNING_KEY chưa được cấu hình (tối thiểu 32 ký tự).");
  return key;
}

export function signStoragePath(bucket: string, name: string, expiresAt: number, download: string | null) {
  return createHmac("sha256", signingKey()).update(`${bucket}\n${name}\n${expiresAt}\n${download ?? ""}`).digest("base64url");
}

export function verifyStorageSignature(bucket: string, name: string, expiresAt: number, download: string | null, sig: string) {
  if (!Number.isFinite(expiresAt) || expiresAt < Date.now() / 1000) return false;
  const expected = Buffer.from(signStoragePath(bucket, name, expiresAt, download));
  const actual = Buffer.from(sig || "");
  return expected.length === actual.length && timingSafeEqual(expected, actual);
}

export function buildSignedUrl(bucket: string, name: string, seconds: number, download: string | null) {
  const exp = Math.floor(Date.now() / 1000) + Math.max(1, Math.floor(seconds));
  const params = new URLSearchParams({ exp: String(exp), sig: signStoragePath(bucket, name, exp, download) });
  if (download !== null) params.set("download", download);
  const encoded = name.split("/").map(encodeURIComponent).join("/");
  return `/api/storage/${bucket}/${encoded}?${params.toString()}`;
}

export async function readStoredFile(bucket: string, name: string) {
  const full = safePath(bucket, name);
  const [bytes, meta] = await Promise.all([
    readFile(full),
    query<{ mime_type: string | null }>(getPool(), "SELECT mime_type FROM storage_objects WHERE bucket_id = ? AND name = ?", [bucket, name]),
  ]);
  return { bytes, contentType: meta[0]?.mime_type || "application/octet-stream" };
}

// ------------------------------- quyền -------------------------------

async function allowed(session: Session, sql: string) {
  if (sql === "1") return true;
  if (sql === "0") return false;
  const rows = await query<{ ok: number }>(session.conn ?? getPool(), `SELECT (${sql}) AS ok`);
  return Boolean(Number(rows[0]?.ok));
}

function isUuid(v: string | undefined) {
  return Boolean(v && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v));
}

async function canRead(session: Session, bucket: Bucket, name: string) {
  if (session.mode === "service") return true;
  const f = session.fragments;
  if (!f) return false;
  const n = escapeLiteral(name);
  switch (bucket) {
    case "asset-media":
      return allowed(session, `EXISTS (SELECT 1 FROM media_files mf WHERE mf.bucket_id = 'asset-media' AND (mf.object_path = ${n} OR mf.thumbnail_path = ${n}) AND ((mf.owner_type = 'ASSET' AND ${f.canAccessAsset("mf.asset_id", "assets", "assets.view")}) OR (mf.owner_type = 'MAINTENANCE' AND ${f.canAccessAsset("mf.asset_id", "maintenance", "maintenance.view")})))`);
    case "asset-documents":
      return allowed(session, `EXISTS (SELECT 1 FROM asset_documents d WHERE d.object_path = ${n} AND ${f.canAccessAsset("d.asset_id", "assets", "assets.view")})`);
    case "vehicle-documents":
      return allowed(session, `EXISTS (SELECT 1 FROM vehicle_documents d WHERE d.object_path = ${n} AND ${f.canAccessVehicle("d.vehicle_id", "vehicles.view")})`);
    case "it-cost-documents": {
      const own = name.split("/")[0] === session.userId && f.hasPermissionBool("it_costs.import");
      if (own) return true;
      return f.hasPermissionBool("it_costs.view") && allowed(session, `EXISTS (SELECT 1 FROM it_documents d WHERE d.storage_path = ${n})`);
    }
  }
}

async function canUpload(session: Session, bucket: Bucket, name: string) {
  if (session.mode === "service") return true;
  const f = session.fragments;
  if (!f) return false;
  const parts = name.split("/");
  if (parts[0] !== session.userId) return false;
  switch (bucket) {
    case "asset-media":
      if (parts.length < 3 || !isUuid(parts[1])) return false;
      return allowed(session, `(${f.canAccessAsset(escapeLiteral(parts[1]), "assets", "assets.manage")} OR ${f.canAccessAsset(escapeLiteral(parts[1]), "maintenance", "maintenance.manage")})`);
    case "asset-documents":
      if (parts.length !== 4 || parts[2] !== "PURCHASE_INVOICE" || !/^[0-9a-f-]{36}[.]pdf$/.test(parts[3]) || !isUuid(parts[1])) return false;
      return allowed(session, f.canAccessAsset(escapeLiteral(parts[1]), "assets", "assets.manage"));
    case "vehicle-documents":
      if (parts.length < 5 || !["INSPECTION", "REPAIR", "FUEL", "INSURANCE"].includes(parts[2]) || !isUuid(parts[1])) return false;
      return allowed(session, f.canAccessVehicle(escapeLiteral(parts[1]), "vehicles.manage"));
    case "it-cost-documents":
      return f.hasPermissionBool("it_costs.import");
  }
}

async function canDelete(session: Session, bucket: Bucket, name: string) {
  if (session.mode === "service") return true;
  const f = session.fragments;
  if (!f) return false;
  const n = escapeLiteral(name);
  switch (bucket) {
    case "asset-media":
      return allowed(session, `EXISTS (SELECT 1 FROM media_files mf WHERE mf.bucket_id = 'asset-media' AND (mf.object_path = ${n} OR mf.thumbnail_path = ${n}) AND ((mf.owner_type = 'ASSET' AND ${f.canAccessAsset("mf.asset_id", "assets", "assets.manage")}) OR (mf.owner_type = 'MAINTENANCE' AND ${f.canAccessAsset("mf.asset_id", "maintenance", "maintenance.manage")})))`)
        // file vừa tải lên nhưng chưa ghi media_files (dọn khi lỗi)
        || ((name.split("/")[0] === session.userId) && canUpload(session, bucket, name));
    case "asset-documents": {
      const linked = await query<{ asset_id: string }>(getPool(), "SELECT asset_id FROM asset_documents WHERE object_path = ? LIMIT 1", [name]);
      const parts = name.split("/");
      const assetId = linked[0]?.asset_id ?? (parts.length === 4 && parts[2] === "PURCHASE_INVOICE" && isUuid(parts[1]) ? parts[1] : null);
      if (!assetId) return false;
      return allowed(session, f.canAccessAsset(escapeLiteral(assetId), "assets", "assets.manage"));
    }
    case "vehicle-documents": {
      const linked = await allowed(session, `EXISTS (SELECT 1 FROM vehicle_documents d WHERE d.object_path = ${n} AND ${f.canAccessVehicle("d.vehicle_id", "vehicles.manage")})`);
      return linked || canUpload(session, bucket, name);
    }
    case "it-cost-documents": {
      if (!f.hasPermissionBool("it_costs.import") || name.split("/")[0] !== session.userId) return false;
      const used = await query(getPool(), "SELECT 1 FROM it_documents WHERE storage_path = ? LIMIT 1", [name]);
      return used.length === 0;
    }
  }
}

// ------------------------------- API tương thích supabase.storage -------------------------------

type StorageResult<T> = { data: T; error: null } | { data: null; error: DbError };

function asBuffer(body: unknown): Promise<Buffer> | Buffer {
  if (Buffer.isBuffer(body)) return body;
  if (body instanceof Uint8Array) return Buffer.from(body);
  if (body instanceof ArrayBuffer) return Buffer.from(body);
  if (typeof Blob !== "undefined" && body instanceof Blob) return body.arrayBuffer().then((b) => Buffer.from(b));
  if (typeof body === "string") return Buffer.from(body);
  throw new DbError("Kiểu dữ liệu tải lên không hỗ trợ", "400");
}

export function storageClient(session: Session) {
  return {
    from(bucket: string) {
      const b = bucket as Bucket;
      const wrap = async <T>(fn: () => Promise<T>): Promise<StorageResult<T>> => {
        try {
          return { data: await fn(), error: null } as StorageResult<T>;
        } catch (error) {
          return { data: null, error: error instanceof DbError ? error : new DbError(String((error as Error)?.message ?? error), "500") };
        }
      };
      return {
        upload: (name: string, body: unknown, options: { contentType?: string; upsert?: boolean; cacheControl?: string } = {}) =>
          wrap(async () => {
            const full = safePath(b, name);
            if (!(await canUpload(session, b, name))) throw new DbError("new row violates row-level security policy", "403");
            const exists = await stat(full).then(() => true, () => false);
            if (exists && !options.upsert) throw new DbError("The resource already exists", "409");
            const bytes = await asBuffer(body);
            await mkdir(path.dirname(full), { recursive: true });
            await writeFile(full, bytes, { mode: 0o640 });
            await execute(
              getPool(),
              `INSERT INTO storage_objects (bucket_id, name, owner, mime_type, size) VALUES (?, ?, ?, ?, ?)
               ON DUPLICATE KEY UPDATE owner = VALUES(owner), mime_type = VALUES(mime_type), size = VALUES(size), updated_at = CURRENT_TIMESTAMP(6)`,
              [b, name, session.userId, options.contentType ?? "application/octet-stream", bytes.length],
            );
            return { path: name, id: name, fullPath: `${b}/${name}` };
          }),
        remove: (names: string[]) =>
          wrap(async () => {
            const removed: { name: string }[] = [];
            for (const name of names) {
              const full = safePath(b, name);
              if (!(await canDelete(session, b, name))) continue; // giống RLS: bỏ qua im lặng
              await rm(full, { force: true });
              await execute(getPool(), "DELETE FROM storage_objects WHERE bucket_id = ? AND name = ?", [b, name]);
              removed.push({ name });
            }
            return removed;
          }),
        download: (name: string) =>
          wrap(async () => {
            if (!(await canRead(session, b, name))) throw new DbError("Object not found", "404");
            const { bytes, contentType } = await readStoredFile(b, name);
            return new Blob([new Uint8Array(bytes)], { type: contentType });
          }),
        createSignedUrl: (name: string, seconds: number, options: { download?: string | boolean } = {}) =>
          wrap(async () => {
            safePath(b, name);
            if (!(await canRead(session, b, name))) throw new DbError("Object not found", "404");
            const download = options.download === undefined || options.download === false ? null : options.download === true ? "" : options.download;
            return { signedUrl: buildSignedUrl(b, name, seconds, download) };
          }),
        /** Cho phép trình duyệt tải file thẳng lên trong 10 phút (thay uploadToSignedUrl) */
        createSignedUploadUrl: (name: string) =>
          wrap(async () => {
            safePath(b, name);
            if (!(await canUpload(session, b, name))) throw new DbError("new row violates row-level security policy", "403");
            const exp = Math.floor(Date.now() / 1000) + 600;
            const sig = signStoragePath(b, name, exp, `upload:${session.userId}`);
            const params = new URLSearchParams({ bucket: b, path: name, exp: String(exp), sig });
            const signedUrl = `/api/storage-upload?${params.toString()}`;
            return { path: name, token: signedUrl, signedUrl };
          }),
        createSignedUrls: (names: string[], seconds: number) =>
          wrap(async () => {
            const out: { path: string; signedUrl: string | null; error: string | null }[] = [];
            for (const name of names) {
              const ok = await canRead(session, b, name).catch(() => false);
              out.push(ok
                ? { path: name, signedUrl: buildSignedUrl(b, name, seconds, null), error: null }
                : { path: name, signedUrl: null, error: "Object not found" });
            }
            return out;
          }),
      };
    },
  };
}

/** Ghi file từ URL tải lên đã ký (route /api/storage-upload) */
export async function writeSignedUpload(bucket: string, name: string, exp: number, sig: string, userId: string, bytes: Buffer, contentType: string) {
  if (!verifyStorageSignature(bucket, name, exp, `upload:${userId}`, sig)) throw new DbError("Liên kết tải lên không hợp lệ", "403");
  const full = safePath(bucket, name);
  if (await stat(full).then(() => true, () => false)) throw new DbError("The resource already exists", "409");
  await mkdir(path.dirname(full), { recursive: true });
  await writeFile(full, bytes, { mode: 0o640 });
  await execute(
    getPool(),
    "INSERT INTO storage_objects (bucket_id, name, owner, mime_type, size) VALUES (?, ?, ?, ?, ?)",
    [bucket, name, userId, contentType || "application/octet-stream", bytes.length],
  );
}
