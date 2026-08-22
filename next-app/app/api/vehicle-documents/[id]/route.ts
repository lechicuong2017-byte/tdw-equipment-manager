import { NextResponse } from "next/server";
import { z } from "zod";
import { requireAccess } from "@/lib/auth";

const documentIdSchema = z.uuid();

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const parsedId = documentIdSchema.safeParse((await params).id);
  if (!parsedId.success) {
    return NextResponse.json({ error: "Mã tài liệu không hợp lệ." }, { status: 400 });
  }

  const { supabase } = await requireAccess();
  const { data: document, error: documentError } = await supabase
    .from("vehicle_documents")
    .select("object_path,file_name")
    .eq("id", parsedId.data)
    .maybeSingle();

  if (documentError || !document) {
    return NextResponse.json({ error: "Không tìm thấy tài liệu hoặc bạn không có quyền xem." }, { status: 404 });
  }

  const shouldDownload = new URL(request.url).searchParams.get("download") === "1";
  const { data: signedDocument, error: signedDocumentError } = await supabase.storage
    .from("vehicle-documents")
    .createSignedUrl(
      document.object_path,
      60,
      shouldDownload ? { download: document.file_name } : undefined,
    );

  if (signedDocumentError || !signedDocument?.signedUrl) {
    return NextResponse.json({ error: "Không thể tạo liên kết tài liệu." }, { status: 500 });
  }

  return NextResponse.redirect(signedDocument.signedUrl, {
    headers: { "Cache-Control": "private, no-store" },
  });
}
