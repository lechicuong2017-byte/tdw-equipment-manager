import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { writeSignedUpload } from "@/lib/db/storage";

export const dynamic = "force-dynamic";
const MAX_BYTES = 30 * 1024 * 1024;

export async function PUT(request: NextRequest) {
  const db = await createClient();
  const userId = db.session.userId;
  if (!userId) return NextResponse.json({ error: "Chưa đăng nhập" }, { status: 401 });
  const q = request.nextUrl.searchParams;
  const length = Number(request.headers.get("content-length") || 0);
  if (length > MAX_BYTES) return NextResponse.json({ error: "Tệp quá lớn" }, { status: 413 });
  const bytes = Buffer.from(await request.arrayBuffer());
  if (bytes.length === 0 || bytes.length > MAX_BYTES) return NextResponse.json({ error: "Tệp không hợp lệ" }, { status: 400 });
  try {
    await writeSignedUpload(q.get("bucket") ?? "", q.get("path") ?? "", Number(q.get("exp")), q.get("sig") ?? "", userId, bytes, request.headers.get("content-type") ?? "");
    return NextResponse.json({ path: q.get("path") });
  } catch (error) {
    return NextResponse.json({ error: (error as Error).message }, { status: 400 });
  }
}
