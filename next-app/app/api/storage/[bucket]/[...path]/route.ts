import { NextResponse, type NextRequest } from "next/server";
import { readStoredFile, verifyStorageSignature } from "@/lib/db/storage";

export const dynamic = "force-dynamic";

// Phục vụ file riêng tư qua URL ký có hạn dùng (thay signed URL của Supabase Storage).
export async function GET(request: NextRequest, { params }: { params: Promise<{ bucket: string; path: string[] }> }) {
  const { bucket, path } = await params;
  const name = path.map((p) => decodeURIComponent(p)).join("/");
  const exp = Number(request.nextUrl.searchParams.get("exp"));
  const sig = request.nextUrl.searchParams.get("sig") ?? "";
  const download = request.nextUrl.searchParams.has("download") ? request.nextUrl.searchParams.get("download") ?? "" : null;
  if (!verifyStorageSignature(bucket, name, exp, download, sig)) {
    return new NextResponse("Liên kết đã hết hạn hoặc không hợp lệ.", { status: 403 });
  }
  try {
    const { bytes, contentType } = await readStoredFile(bucket, name);
    const headers = new Headers({
      "Content-Type": contentType,
      "Content-Length": String(bytes.length),
      "Cache-Control": "private, max-age=300",
      "X-Content-Type-Options": "nosniff",
    });
    if (download !== null) {
      const fileName = download || name.split("/").pop() || "file";
      headers.set("Content-Disposition", `attachment; filename*=UTF-8''${encodeURIComponent(fileName)}`);
    } else {
      headers.set("Content-Disposition", "inline");
    }
    return new NextResponse(new Uint8Array(bytes), { status: 200, headers });
  } catch {
    return new NextResponse("Không tìm thấy file.", { status: 404 });
  }
}
