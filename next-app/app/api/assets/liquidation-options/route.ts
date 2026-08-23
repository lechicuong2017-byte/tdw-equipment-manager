import { NextResponse } from "next/server";
import { can, requireAccess } from "@/lib/auth";

export async function GET() {
  const { supabase, access } = await requireAccess();
  if (!can(access, "assets.delete")) {
    return NextResponse.json({ error: "Không có quyền truy cập." }, { status: 403 });
  }

  const { data, error } = await supabase
    .from("assets")
    .select("id,asset_code,asset_name")
    .is("deleted_at", null)
    .neq("status", "DA_THANH_LY")
    .order("asset_code")
    .limit(5000);

  if (error) {
    return NextResponse.json({ error: "Không thể tải danh sách thiết bị." }, { status: 500 });
  }
  return NextResponse.json(
    { assets: data ?? [] },
    { headers: { "Cache-Control": "private, max-age=60" } },
  );
}
