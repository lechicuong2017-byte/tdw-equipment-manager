import { createHmac, randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { z } from "zod";
import { can } from "@/lib/auth";
import { labelStatus } from "@/lib/format";
import { createClient } from "@/lib/supabase/server";
import type { AccessProfile } from "@/lib/types";

export const runtime = "nodejs";

const requestSchema = z.object({
  report_type: z.literal("assets"),
});

export async function POST(request: Request) {
  const supabase = await createClient();
  const { data: claimsData } = await supabase.auth.getClaims();
  if (!claimsData?.claims?.sub) {
    return NextResponse.json({ error: "Chưa đăng nhập" }, { status: 401 });
  }

  const { data: accessData } = await supabase.rpc("get_my_access");
  const access = accessData as AccessProfile | null;
  const aal = String(claimsData.claims.aal || "aal1");
  if (access?.roles.includes("admin") && aal !== "aal2") {
    return NextResponse.json(
      { error: "Tài khoản quản trị phải hoàn tất MFA" },
      { status: 403 },
    );
  }
  if (!access || !can(access, "reports.assets.export")) {
    return NextResponse.json({ error: "Không có quyền xuất báo cáo" }, { status: 403 });
  }

  const parsed = requestSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "Yêu cầu xuất không hợp lệ" }, { status: 400 });
  }

  const exportUrl = String(process.env.APPS_SCRIPT_EXPORT_URL || "").trim();
  const integrationSecret = String(
    process.env.APPS_SCRIPT_INTEGRATION_SECRET || "",
  ).trim();
  if (!exportUrl || !integrationSecret) {
    return NextResponse.json(
      { error: "Tích hợp Google chưa được cấu hình" },
      { status: 503 },
    );
  }

  const { data: job, error: jobError } = await supabase
    .from("export_jobs")
    .insert({
      export_type: parsed.data.report_type,
      requested_by: access.user_id,
      status: "processing",
    })
    .select("id")
    .single();
  if (jobError || !job) {
    return NextResponse.json({ error: "Không thể tạo tác vụ xuất" }, { status: 500 });
  }

  const { data: assets, error: assetsError } = await supabase
    .from("assets")
    .select(
      "asset_code, asset_name, asset_type, brand, model, serial_number, quantity, unit_price, total_price, assigned_to_name, department_legacy_name, location, status, purchase_date, warranty_end_date, note",
    )
    .is("deleted_at", null)
    .order("asset_code")
    .limit(5000);

  if (assetsError) {
    await markFailed(supabase, job.id, "Không thể đọc dữ liệu thiết bị");
    return NextResponse.json({ error: "Không thể đọc dữ liệu thiết bị" }, { status: 500 });
  }

  const payload = {
    report_type: "assets",
    title: `TDW - Danh sách thiết bị - ${new Date().toLocaleDateString("vi-VN")}`,
    requested_by: access.email,
    columns: [
      { key: "asset_code", label: "Mã thiết bị" },
      { key: "asset_name", label: "Tên thiết bị" },
      { key: "asset_type", label: "Loại thiết bị" },
      { key: "brand", label: "Thương hiệu" },
      { key: "model", label: "Model" },
      { key: "serial_number", label: "Serial" },
      { key: "quantity", label: "Số lượng" },
      { key: "unit_price", label: "Đơn giá" },
      { key: "total_price", label: "Thành tiền" },
      { key: "assigned_to_name", label: "Người sử dụng" },
      { key: "department", label: "Phòng ban" },
      { key: "location", label: "Vị trí" },
      { key: "status_label", label: "Trạng thái" },
      { key: "purchase_date", label: "Ngày mua" },
      { key: "warranty_end_date", label: "Hết bảo hành" },
      { key: "note", label: "Ghi chú" },
    ],
    rows: (assets ?? []).map((asset) => ({
      ...asset,
      department: asset.department_legacy_name,
      status_label: labelStatus(asset.status),
    })),
  };

  const payloadJson = JSON.stringify(payload);
  const timestamp = Date.now();
  const nonce = randomUUID().replaceAll("-", "");
  const signature = createHmac("sha256", integrationSecret)
    .update(`${timestamp}.${nonce}.${payloadJson}`)
    .digest("base64url");
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 45000);

  try {
    const response = await fetch(exportUrl, {
      method: "POST",
      headers: { "Content-Type": "text/plain;charset=utf-8" },
      body: JSON.stringify({
        action: "exportSupabaseReport",
        timestamp,
        nonce,
        payload_json: payloadJson,
        signature,
      }),
      signal: controller.signal,
    });
    const result = await response.json();
    if (!response.ok || !result.ok || !result.spreadsheet_url) {
      throw new Error(result.error || "Apps Script không tạo được báo cáo");
    }

    await supabase.rpc("finish_export_job", {
      target_job_id: job.id,
      target_status: "completed",
      target_result_url: result.spreadsheet_url,
      target_error: null,
    });

    return NextResponse.json({
      ok: true,
      url: result.spreadsheet_url,
      row_count: result.row_count,
    });
  } catch {
    await markFailed(supabase, job.id, "Tích hợp Google không phản hồi hợp lệ");
    return NextResponse.json(
      { error: "Không thể tạo Google Sheet. Vui lòng thử lại." },
      { status: 502 },
    );
  } finally {
    clearTimeout(timeout);
  }
}

async function markFailed(
  supabase: Awaited<ReturnType<typeof createClient>>,
  jobId: string,
  error: string,
) {
  await supabase.rpc("finish_export_job", {
    target_job_id: jobId,
    target_status: "failed",
    target_result_url: null,
    target_error: error,
  });
}
