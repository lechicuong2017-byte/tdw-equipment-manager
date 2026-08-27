import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireAccess } from "@/lib/auth";

export const dynamic = "force-dynamic";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const parsed = z.uuid().safeParse((await params).id);
  if (!parsed.success) return new NextResponse("Hồ sơ không hợp lệ.", { status: 400 });

  const { supabase } = await requireAccess();
  const { data: document, error } = await supabase
    .from("asset_documents")
    .select("bucket_id,object_path,file_name,mime_type")
    .eq("id", parsed.data)
    .eq("document_kind", "PURCHASE_INVOICE")
    .single();
  if (error || !document) return new NextResponse("Không tìm thấy hóa đơn.", { status: 404 });

  const download = request.nextUrl.searchParams.get("download") === "1";
  const { data, error: signedError } = await supabase.storage
    .from(document.bucket_id)
    .createSignedUrl(document.object_path, 60, download ? { download: document.file_name } : undefined);
  if (signedError || !data?.signedUrl) {
    return new NextResponse("Không thể mở hóa đơn.", { status: 500 });
  }

  return NextResponse.redirect(data.signedUrl, {
    headers: {
      "Cache-Control": "private, no-store, max-age=0",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
