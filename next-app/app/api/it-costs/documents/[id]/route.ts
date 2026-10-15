import { NextResponse, type NextRequest } from "next/server";
import { requireModuleAccess, can } from "@/lib/auth";
import { z } from "zod";
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { access, supabase } = await requireModuleAccess("it_costs");
  if (!can(access, "it_costs.view"))
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const { id } = await params;
  if (!z.uuid().safeParse(id).success)
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  const { data, error } = await supabase
    .from("it_documents")
    .select("storage_path,name,mime")
    .eq("id", id)
    .single();
  if (error || !data)
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  const url = await supabase.storage
    .from("it-cost-documents")
    .createSignedUrl(
      data.storage_path,
      60,
      request.nextUrl.searchParams.get("download") === "1"
        ? { download: data.name }
        : undefined,
    );
  if (url.error)
    return NextResponse.json({ error: "Không tải được tệp." }, { status: 503 });
  return NextResponse.redirect(url.data.signedUrl, {
    headers: {
      "Cache-Control": "private, no-store",
      "Referrer-Policy": "no-referrer",
    },
  });
}
