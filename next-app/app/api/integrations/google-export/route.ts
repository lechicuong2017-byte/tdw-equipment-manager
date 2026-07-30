import { NextResponse } from "next/server";
import { z } from "zod";
import { callAppsScript } from "@/lib/apps-script";
import { can } from "@/lib/auth";
import { labelStatus } from "@/lib/format";
import { createClient } from "@/lib/supabase/server";
import type { AccessProfile } from "@/lib/types";

export const runtime = "nodejs";

const reportTypes = ["assets", "maintenance", "movement", "software"] as const;
type ReportType = (typeof reportTypes)[number];

const requestSchema = z.object({
  report_type: z.enum(reportTypes),
});

const permissionByReport: Record<ReportType, string> = {
  assets: "reports.assets.export",
  maintenance: "reports.maintenance.export",
  movement: "reports.movement.export",
  software: "reports.software.export",
};

type ReportColumn = { key: string; label: string };
type ReportRow = Record<string, string | number | boolean | null>;
type ReportPayload = {
  report_type: ReportType;
  title: string;
  requested_by: string;
  columns: ReportColumn[];
  rows: ReportRow[];
};

type RelatedAsset =
  | { asset_code?: string; asset_name?: string }
  | { asset_code?: string; asset_name?: string }[]
  | null;

function relatedAsset(value: RelatedAsset) {
  return Array.isArray(value) ? value[0] : value;
}

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

  const parsed = requestSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "Yêu cầu xuất không hợp lệ" }, { status: 400 });
  }

  const reportType = parsed.data.report_type;
  if (!access || !can(access, permissionByReport[reportType])) {
    return NextResponse.json({ error: "Không có quyền xuất báo cáo" }, { status: 403 });
  }

  const { data: job, error: jobError } = await supabase
    .from("export_jobs")
    .insert({
      export_type: reportType,
      requested_by: access.user_id,
      status: "processing",
    })
    .select("id")
    .single();
  if (jobError || !job) {
    return NextResponse.json({ error: "Không thể tạo tác vụ xuất" }, { status: 500 });
  }

  try {
    const payload = await buildReportPayload(supabase, reportType, access.email);
    const result = await callAppsScript<{
      ok: true;
      spreadsheet_url: string;
      row_count: number;
    }>("exportSupabaseReport", payload);
    if (!result.spreadsheet_url) {
      throw new Error("Apps Script không trả về liên kết báo cáo");
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
  } catch (error) {
    const reason =
      error instanceof Error ? error.message.slice(0, 500) : "Unknown export error";
    console.error("google_export_failed", {
      job_id: job.id,
      report_type: reportType,
      reason,
    });
    await markFailed(supabase, job.id, "Không thể tạo báo cáo Google");
    return NextResponse.json(
      { error: "Không thể tạo Google Sheet. Vui lòng thử lại." },
      { status: 502 },
    );
  }
}

async function buildReportPayload(
  supabase: Awaited<ReturnType<typeof createClient>>,
  reportType: ReportType,
  requestedBy: string,
): Promise<ReportPayload> {
  const dateLabel = new Date().toLocaleDateString("vi-VN", {
    timeZone: "Asia/Ho_Chi_Minh",
  });

  if (reportType === "assets") {
    const { data, error } = await supabase
      .from("assets")
      .select(
        "asset_code, asset_name, asset_type, brand, model, serial_number, quantity, unit_price, total_price, assigned_to_name, department_legacy_name, location, status, purchase_date, warranty_end_date, note, departments(name)",
      )
      .is("deleted_at", null)
      .order("asset_code")
      .limit(5000);
    if (error) throw new Error("Không thể đọc dữ liệu thiết bị");

    return {
      report_type: reportType,
      title: `TDW - Danh sách thiết bị - ${dateLabel}`,
      requested_by: requestedBy,
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
      rows: (data ?? []).map((asset) => {
        const { departments, ...fields } = asset;
        const department = Array.isArray(asset.departments)
          ? asset.departments[0]?.name
          : (asset.departments as { name?: string } | null)?.name;
        return {
          ...fields,
          department: department || asset.department_legacy_name,
          status_label: labelStatus(asset.status),
        };
      }),
    };
  }

  if (reportType === "maintenance") {
    const [{ data: plans, error: plansError }, { data: logs, error: logsError }] =
      await Promise.all([
        supabase
          .from("maintenance_plans")
          .select(
            "asset_id, title, frequency, next_due_date, note, active, assets(asset_code, asset_name)",
          )
          .order("next_due_date")
          .limit(2500),
        supabase
          .from("maintenance_logs")
          .select(
            "asset_id, maintenance_date, action_type, description, cost, vendor, performed_by, note, assets(asset_code, asset_name)",
          )
          .order("maintenance_date", { ascending: false })
          .limit(2500),
      ]);
    if (plansError || logsError) throw new Error("Không thể đọc dữ liệu bảo trì");

    const planRows: ReportRow[] = (plans ?? []).map((plan) => {
      const asset = relatedAsset(plan.assets);
      return {
        record_type: "Kế hoạch",
        asset_code: asset?.asset_code ?? "",
        asset_name: asset?.asset_name ?? "",
        date: plan.next_due_date,
        title: plan.title,
        frequency: plan.frequency,
        status: plan.active ? "Đang theo dõi" : "Tạm dừng",
        description: "",
        cost: 0,
        vendor: "",
        performed_by: "",
        note: plan.note,
      };
    });
    const logRows: ReportRow[] = (logs ?? []).map((log) => {
      const asset = relatedAsset(log.assets);
      return {
        record_type: "Nhật ký",
        asset_code: asset?.asset_code ?? "",
        asset_name: asset?.asset_name ?? "",
        date: log.maintenance_date,
        title: log.action_type || "Bảo trì",
        frequency: "",
        status: "Đã thực hiện",
        description: log.description,
        cost: log.cost,
        vendor: log.vendor,
        performed_by: log.performed_by,
        note: log.note,
      };
    });

    return {
      report_type: reportType,
      title: `TDW - Báo cáo bảo trì - ${dateLabel}`,
      requested_by: requestedBy,
      columns: [
        { key: "record_type", label: "Loại bản ghi" },
        { key: "asset_code", label: "Mã thiết bị" },
        { key: "asset_name", label: "Tên thiết bị" },
        { key: "date", label: "Ngày" },
        { key: "title", label: "Nội dung" },
        { key: "frequency", label: "Chu kỳ" },
        { key: "status", label: "Trạng thái" },
        { key: "description", label: "Chi tiết" },
        { key: "cost", label: "Chi phí" },
        { key: "vendor", label: "Đơn vị thực hiện" },
        { key: "performed_by", label: "Người thực hiện" },
        { key: "note", label: "Ghi chú" },
      ],
      rows: [...planRows, ...logRows].slice(0, 5000),
    };
  }

  if (reportType === "movement") {
    const { data, error } = await supabase
      .from("inventory_movements")
      .select(
        "movement_date, from_user_name, to_user_name, from_location, to_location, reason, approved_by_name, note, assets(asset_code, asset_name)",
      )
      .order("movement_date", { ascending: false })
      .limit(5000);
    if (error) throw new Error("Không thể đọc dữ liệu luân chuyển");

    return {
      report_type: reportType,
      title: `TDW - Báo cáo luân chuyển - ${dateLabel}`,
      requested_by: requestedBy,
      columns: [
        { key: "movement_date", label: "Ngày luân chuyển" },
        { key: "asset_code", label: "Mã thiết bị" },
        { key: "asset_name", label: "Tên thiết bị" },
        { key: "from_user_name", label: "Người giao" },
        { key: "to_user_name", label: "Người nhận" },
        { key: "from_location", label: "Vị trí cũ" },
        { key: "to_location", label: "Vị trí mới" },
        { key: "reason", label: "Lý do" },
        { key: "approved_by_name", label: "Người phê duyệt" },
        { key: "note", label: "Ghi chú" },
      ],
      rows: (data ?? []).map((movement) => {
        const { assets, ...fields } = movement;
        const asset = relatedAsset(movement.assets);
        return {
          ...fields,
          asset_code: asset?.asset_code ?? "",
          asset_name: asset?.asset_name ?? "",
        };
      }),
    };
  }

  const { data, error } = await supabase
    .from("software_licenses")
    .select(
      "software_name, version, license_key_masked, assigned_user_name, expiry_date, status, note, assets(asset_code, asset_name)",
    )
    .order("expiry_date", { ascending: true, nullsFirst: false })
    .limit(5000);
  if (error) throw new Error("Không thể đọc dữ liệu phần mềm");

  return {
    report_type: reportType,
    title: `TDW - Báo cáo phần mềm - ${dateLabel}`,
    requested_by: requestedBy,
    columns: [
      { key: "software_name", label: "Phần mềm" },
      { key: "version", label: "Phiên bản" },
      { key: "license_key_masked", label: "Khóa đã che" },
      { key: "asset_code", label: "Mã thiết bị" },
      { key: "asset_name", label: "Tên thiết bị" },
      { key: "assigned_user_name", label: "Người được cấp" },
      { key: "expiry_date", label: "Ngày hết hạn" },
      { key: "status", label: "Trạng thái" },
      { key: "note", label: "Ghi chú" },
    ],
    rows: (data ?? []).map((license) => {
      const { assets, ...fields } = license;
      const asset = relatedAsset(license.assets);
      return {
        ...fields,
        asset_code: asset?.asset_code ?? "",
        asset_name: asset?.asset_name ?? "",
      };
    }),
  };
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
