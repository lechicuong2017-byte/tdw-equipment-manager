import { createHash } from "node:crypto";
import { NextResponse } from "next/server";
import { z } from "zod";
import { callAppsScript } from "@/lib/apps-script";
import { can } from "@/lib/auth";
import { labelStatus } from "@/lib/format";
import { createClient } from "@/lib/supabase/server";
import type { AccessProfile } from "@/lib/types";

export const runtime = "nodejs";

const reportTypes = ["assets", "liquidations", "maintenance", "movement", "software", "vehicles", "vehicle_inspections", "vehicle_insurance", "vehicle_repairs", "vehicle_fuel"] as const;
type ReportType = (typeof reportTypes)[number];
const outputFormats = ["xlsx", "pdf"] as const;
type OutputFormat = (typeof outputFormats)[number];

const assetReportFields = [
  "relation",
  "parent_asset",
  "asset_code",
  "asset_name",
  "asset_type",
  "brand",
  "model",
  "serial_number",
  "purchase_year",
  "purchase_date",
  "quantity",
  "unit_price",
  "total_price",
  "assigned_to_name",
  "department",
  "location",
  "software_license_note",
  "status_label",
  "warranty_end_date",
  "note",
] as const;

const assetReportColumnCatalog: Record<(typeof assetReportFields)[number], ReportColumn> = {
  relation: { key: "relation", label: "Cấu trúc" },
  parent_asset: { key: "parent_asset", label: "Thuộc thiết bị" },
  asset_code: { key: "asset_code", label: "Mã thiết bị" },
  asset_name: { key: "asset_name", label: "Tên thiết bị" },
  asset_type: { key: "asset_type", label: "Loại thiết bị" },
  brand: { key: "brand", label: "Thương hiệu" },
  model: { key: "model", label: "Model" },
  serial_number: { key: "serial_number", label: "Serial" },
  purchase_year: { key: "purchase_year", label: "Năm đề xuất mua" },
  purchase_date: { key: "purchase_date", label: "Ngày mua" },
  quantity: { key: "quantity", label: "Số lượng" },
  unit_price: { key: "unit_price", label: "Đơn giá" },
  total_price: { key: "total_price", label: "Thành tiền (VNĐ)" },
  assigned_to_name: { key: "assigned_to_name", label: "Người sử dụng" },
  department: { key: "department", label: "Phòng ban" },
  location: { key: "location", label: "Vị trí" },
  software_license_note: { key: "software_license_note", label: "Phần mềm bản quyền" },
  status_label: { key: "status_label", label: "Tình trạng thiết bị" },
  warranty_end_date: { key: "warranty_end_date", label: "Hết bảo hành" },
  note: { key: "note", label: "Ghi chú" },
};

const defaultAssetReportFields: (typeof assetReportFields)[number][] = [
  "asset_name",
  "purchase_year",
  "quantity",
  "assigned_to_name",
  "total_price",
  "software_license_note",
  "status_label",
  "note",
];

const assetReportGroupOrder = [
  "MAY_TINH_LAPTOP",
  "SCADA_LOGGER_DATA",
  "O_CUNG_THIET_BI_DIEN_TU",
  "MAY_IN_PHOTOCOPY_MAY_CHIEU_TV_DIEN_THOAI",
  "LUU_KHO_KEM_PHAM_CHAT",
];

// Show active assets first and keep poor/storage assets at the bottom of each
// equipment category. Installed components are still rendered below their host.
const assetReportStatusOrder = [
  "MOI_100",
  "CON_SU_DUNG",
  "CAN_KIEM_TRA",
  "KHONG_SU_DUNG",
  "KEM_PHAM_CHAT",
  "LUU_KHO_THANH_LY",
  "LUU_KHO_CHO_THANH_LY",
];

function assetReportGroupRank(group: string) {
  // This operational bucket must always be the final report section, including
  // when administrators add new equipment categories later.
  if (group === "LUU_KHO_KEM_PHAM_CHAT") return 10_000;
  const configuredOrder = assetReportGroupOrder.indexOf(group);
  return configuredOrder === -1 ? 999 : configuredOrder;
}

const reportFiltersSchema = z.object({
  year: z.number().int().min(2000).max(2100).optional(),
  month: z.number().int().min(1).max(12).optional(),
  vehicle_id: z.uuid().optional(),
  asset_groups: z.array(z.string().trim().min(1).max(120)).max(20).optional(),
  asset_statuses: z.array(z.string().trim().min(1).max(120)).max(30).optional(),
  asset_fields: z.array(z.enum(assetReportFields)).min(1).max(assetReportFields.length).optional(),
}).default({}).refine((filters) => !filters.month || Boolean(filters.year), {
  message: "Phải chọn năm trước khi chọn tháng",
});
type ReportFilters = z.infer<typeof reportFiltersSchema>;

const requestSchema = z.object({
  report_type: z.enum(reportTypes),
  output_format: z.enum(outputFormats).default("xlsx"),
  idempotency_token: z.uuid(),
  filters: reportFiltersSchema,
});

const permissionByReport: Record<ReportType, string> = {
  assets: "reports.assets.export",
  liquidations: "reports.assets.export",
  maintenance: "reports.maintenance.export",
  movement: "reports.movement.export",
  software: "reports.software.export",
  vehicles: "reports.vehicles.export",
  vehicle_inspections: "reports.vehicles.export",
  vehicle_insurance: "reports.vehicles.export",
  vehicle_repairs: "reports.vehicles.export",
  vehicle_fuel: "reports.vehicles.export",
};

type ReportColumn = { key: string; label: string };
type ReportRow = Record<string, string | number | boolean | null>;
type ReportPayload = {
  report_type: ReportType;
  title: string;
  report_name: string;
  requested_by: string;
  columns: ReportColumn[];
  rows: ReportRow[];
  summary?: string;
  group_key?: string;
};

type ExportJobClaim = {
  job_id: string;
  job_status: "pending" | "processing" | "completed" | "failed";
  result_url: string | null;
  is_new: boolean;
};

type RelatedAsset =
  | {
      asset_code?: string;
      asset_name?: string;
      asset_group_label?: string;
      asset_type?: string;
    }
  | {
      asset_code?: string;
      asset_name?: string;
      asset_group_label?: string;
      asset_type?: string;
    }[]
  | null;

function relatedAsset(value: RelatedAsset) {
  return Array.isArray(value) ? value[0] : value;
}

type RelatedVehicle =
  | {
      vehicle_code?: string;
      vehicle_name?: string;
      license_plate?: string;
      fuel_norm_l_per_100km?: number | null;
    }
  | {
      vehicle_code?: string;
      vehicle_name?: string;
      license_plate?: string;
      fuel_norm_l_per_100km?: number | null;
    }[]
  | null;

function relatedVehicle(value: RelatedVehicle) {
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
  const outputFormat = parsed.data.output_format;
  const filters = parsed.data.filters;
  if (!access || !can(access, permissionByReport[reportType])) {
    return NextResponse.json({ error: "Không có quyền xuất báo cáo" }, { status: 403 });
  }
  const idempotencyKey = createHash("sha256")
    .update(
      `${access.user_id}:${reportType}:${outputFormat}:${JSON.stringify(filters)}:${parsed.data.idempotency_token}`,
    )
    .digest("hex");
  const { data: claimData, error: jobError } = await supabase.rpc(
    "claim_export_job",
    {
      target_export_type: reportType,
      target_output_format: outputFormat,
      target_idempotency_key: idempotencyKey,
      target_filters: filters,
    },
  );
  const job = (claimData?.[0] ?? null) as ExportJobClaim | null;
  if (jobError || !job) {
    return NextResponse.json({ error: "Không thể tạo tác vụ xuất" }, { status: 500 });
  }
  if (!job.is_new) {
    if (job.job_status === "completed" && job.result_url) {
      return NextResponse.json({
        ok: true,
        url: job.result_url,
        row_count: 0,
        output_format: outputFormat,
        reused: true,
      });
    }
    return NextResponse.json(
      {
        error:
          job.job_status === "failed"
            ? "Lần xuất trước không thành công. Hãy thử lại."
            : "Báo cáo đang được tạo. Vui lòng chờ trong giây lát.",
      },
      { status: 409 },
    );
  }

  try {
    const payload = await buildReportPayload(supabase, reportType, access.email, filters);
    const result = await callAppsScript<{
      ok: true;
      result_url?: string;
      file_id?: string;
      row_count: number;
    }>(
      "exportSupabaseReportFile",
      {
        ...payload,
        job_id: job.job_id,
        output_format: outputFormat,
      },
      90000,
    );
    const resultUrl =
      result.result_url || buildGoogleReportDownloadUrl(result.file_id, outputFormat);
    if (!resultUrl) {
      throw new Error(
        `Apps Script không trả về mã file; fields=${Object.keys(result).sort().join(",")}`,
      );
    }

    await supabase.rpc("finish_export_job", {
      target_job_id: job.job_id,
      target_status: "completed",
      target_result_url: resultUrl,
      target_error: null,
    });

    return NextResponse.json({
      ok: true,
      url: resultUrl,
      row_count: result.row_count,
      output_format: outputFormat,
    });
  } catch (error) {
    const reason =
      error instanceof Error ? error.message.slice(0, 500) : "Unknown export error";
    console.error("google_export_failed", {
      job_id: job.job_id,
      report_type: reportType,
      output_format: outputFormat,
      reason,
    });
    await markFailed(supabase, job.job_id, "Không thể tạo báo cáo Google");
    return NextResponse.json(
      { error: "Không thể tạo báo cáo Google. Vui lòng thử lại." },
      { status: 502 },
    );
  }
}

function buildGoogleReportDownloadUrl(
  fileId: string | undefined,
  outputFormat: OutputFormat,
) {
  if (!fileId || !/^[a-zA-Z0-9_-]{10,200}$/.test(fileId)) return "";
  const baseUrl = `https://docs.google.com/spreadsheets/d/${encodeURIComponent(fileId)}/export`;
  if (outputFormat === "xlsx") return `${baseUrl}?format=xlsx`;
  return `${baseUrl}?format=pdf&size=A4&portrait=false&fitw=true&sheetnames=false&printtitle=false&pagenumbers=true&gridlines=false&fzr=true`;
}

function vehicleReportDateRange(filters: ReportFilters) {
  if (!filters.year) return null;
  const startMonth = filters.month ?? 1;
  const endMonth = filters.month ?? 12;
  const endDay = new Date(Date.UTC(filters.year, endMonth, 0)).getUTCDate();
  return {
    start: `${filters.year}-${String(startMonth).padStart(2, "0")}-01`,
    end: `${filters.year}-${String(endMonth).padStart(2, "0")}-${String(endDay).padStart(2, "0")}`,
  };
}

function formatVndSummary(value: number) {
  return `${new Intl.NumberFormat("vi-VN", { maximumFractionDigits: 0 }).format(value)} VNĐ`;
}

function formatViNumber(value: number, maximumFractionDigits = 3) {
  return new Intl.NumberFormat("vi-VN", { maximumFractionDigits }).format(value);
}

async function buildReportPayload(
  supabase: Awaited<ReturnType<typeof createClient>>,
  reportType: ReportType,
  requestedBy: string,
  filters: ReportFilters,
): Promise<ReportPayload> {
  const dateLabel = new Date().toLocaleDateString("vi-VN", {
    timeZone: "Asia/Ho_Chi_Minh",
  });
  const reportScope = filters.month && filters.year
    ? `Tháng ${filters.month}/${filters.year}`
    : filters.year ? `Năm ${filters.year}` : "Tất cả thời gian";

  if (reportType === "assets") {
    const selectedFields = filters.asset_fields?.length
      ? filters.asset_fields
      : defaultAssetReportFields;
    const selectedGroups = new Set(filters.asset_groups ?? []);
    const selectedStatuses = new Set(filters.asset_statuses ?? []);
    const { data, error } = await supabase
      .from("assets")
      .select(
        "id, asset_kind, asset_code, asset_name, asset_group, asset_group_label, asset_type, brand, model, serial_number, purchase_year, purchase_date, quantity, unit_price, total_price, assigned_to_name, department_legacy_name, location, software_license_note, status, warranty_end_date, note, departments(name)",
      )
      .is("deleted_at", null)
      .neq("status", "DA_THANH_LY")
      .order("asset_code")
      .limit(5000);
    if (error) throw new Error("Không thể đọc dữ liệu thiết bị");

    const { data: installations, error: installationError } = await supabase
      .from("asset_component_installations")
      .select("host_asset_id,component_asset_id,installed_at,slot_name")
      .is("removed_at", null)
      .order("installed_at");
    if (installationError) throw new Error("Không thể đọc cấu hình linh kiện");

    const allNormalizedAssets = (data ?? []).map((asset) => {
      const { departments, ...fields } = asset;
      const department = Array.isArray(asset.departments)
        ? asset.departments[0]?.name
        : (asset.departments as { name?: string } | null)?.name;
      return {
        ...fields,
        department: department || asset.department_legacy_name,
        status_label: labelStatus(asset.status),
        report_group: asset.asset_group_label || asset.asset_group || "CHƯA PHÂN NHÓM",
      };
    });
    const normalizedAssets = allNormalizedAssets.filter((asset) => {
      if (filters.year && asset.purchase_year && asset.purchase_year > filters.year) return false;
      if (selectedGroups.size && !selectedGroups.has(asset.asset_group)) return false;
      if (selectedStatuses.size && !selectedStatuses.has(asset.status)) return false;
      return true;
    }).sort((left, right) => {
      const groupDifference = assetReportGroupRank(left.asset_group)
        - assetReportGroupRank(right.asset_group);
      if (groupDifference) return groupDifference;
      const labelDifference = left.report_group.localeCompare(right.report_group, "vi");
      if (labelDifference) return labelDifference;
      const leftStatusOrder = assetReportStatusOrder.indexOf(left.status);
      const rightStatusOrder = assetReportStatusOrder.indexOf(right.status);
      const statusDifference = (leftStatusOrder === -1 ? 999 : leftStatusOrder)
        - (rightStatusOrder === -1 ? 999 : rightStatusOrder);
      return statusDifference || left.asset_code.localeCompare(right.asset_code, "vi");
    });
    const assetById = new Map(allNormalizedAssets.map((asset) => [asset.id, asset]));
    const activeComponentIds = new Set(
      (installations ?? []).map((item) => item.component_asset_id),
    );
    const installationsByHost = new Map<string, typeof installations>();
    for (const installation of installations ?? []) {
      const current = installationsByHost.get(installation.host_asset_id) ?? [];
      current.push(installation);
      installationsByHost.set(installation.host_asset_id, current);
    }
    const rows: ReportRow[] = [];
    for (const asset of normalizedAssets) {
      if (activeComponentIds.has(asset.id)) continue;
      rows.push({
        ...asset,
        relation: asset.asset_kind === "COMPONENT" ? "Linh kiện rời" : "Thiết bị chính",
        parent_asset: "",
        installed_at: "",
        slot_name: "",
      });
      const childInstallations = installationsByHost.get(asset.id) ?? [];
      childInstallations
        .map((installation) => ({
          installation,
          component: assetById.get(installation.component_asset_id),
        }))
        .filter((item) => {
          if (!item.component) return false;
          if (filters.year && item.component.purchase_year && item.component.purchase_year > filters.year) return false;
          if (selectedStatuses.size && !selectedStatuses.has(item.component.status)) return false;
          return true;
        })
        .sort((left, right) =>
          String(left.component?.asset_code).localeCompare(
            String(right.component?.asset_code),
            "vi",
          ),
        )
        .forEach(({ installation, component }) => {
          if (!component) return;
          rows.push({
            ...component,
            asset_name: `↳ ${component.asset_name}`,
            report_group: asset.report_group,
            relation: "↳ Linh kiện đang lắp",
            parent_asset: `${asset.asset_code} — ${asset.asset_name}`,
            installed_at: installation.installed_at,
            slot_name: installation.slot_name,
          });
        });
    }

    const reportYear = filters.year ?? new Date().getFullYear();

    return {
      report_type: reportType,
      title: `TDW - Tổng hợp thiết bị đến năm ${reportYear}`,
      report_name: `BÁO CÁO THIẾT BỊ ĐẾN NĂM ${reportYear}`,
      requested_by: requestedBy,
      columns: selectedFields.map((field) => assetReportColumnCatalog[field]),
      rows,
      summary: `${rows.length} thiết bị · đến năm ${reportYear}`,
      group_key: "report_group",
    };
  }

  if (reportType === "liquidations") {
    const { data, error } = await supabase
      .from("asset_liquidations")
      .select(
        "liquidation_date, recovery_value, reason, note, created_at, assets(asset_code, asset_name, asset_type, brand, model, serial_number, purchase_date, total_price, department_legacy_name, departments(name))",
      )
      .is("voided_at", null)
      .order("liquidation_date", { ascending: false })
      .limit(5000);
    if (error) throw new Error("Không thể đọc dữ liệu thanh lý thiết bị");

    const rows: ReportRow[] = (data ?? []).map((item) => {
      const assetValue = Array.isArray(item.assets) ? item.assets[0] : item.assets;
      const asset = assetValue as {
        asset_code?: string;
        asset_name?: string;
        asset_type?: string;
        brand?: string;
        model?: string;
        serial_number?: string;
        purchase_date?: string | null;
        total_price?: number | null;
        department_legacy_name?: string;
        departments?: { name?: string } | { name?: string }[] | null;
      } | null;
      const department = Array.isArray(asset?.departments)
        ? asset?.departments[0]?.name
        : asset?.departments?.name;
      const originalValue = Number(asset?.total_price ?? 0);
      const recoveryValue = Number(item.recovery_value ?? 0);
      return {
        asset_code: asset?.asset_code ?? "",
        asset_name: asset?.asset_name ?? "",
        asset_type: asset?.asset_type ?? "",
        brand: asset?.brand ?? "",
        model: asset?.model ?? "",
        serial_number: asset?.serial_number ?? "",
        department: department || asset?.department_legacy_name || "",
        purchase_date: asset?.purchase_date ?? "",
        original_value: originalValue,
        liquidation_date: item.liquidation_date,
        recovery_value: item.recovery_value,
        value_difference: Math.max(0, originalValue - recoveryValue),
        reason: item.reason,
        note: item.note,
      };
    });

    return {
      report_type: reportType,
      title: `TDW - Thiết bị đã thanh lý - ${dateLabel}`,
      report_name: "BÁO CÁO THIẾT BỊ ĐÃ THANH LÝ",
      requested_by: requestedBy,
      columns: [
        { key: "asset_code", label: "Mã thiết bị" },
        { key: "asset_name", label: "Tên thiết bị" },
        { key: "asset_type", label: "Loại thiết bị" },
        { key: "brand", label: "Thương hiệu" },
        { key: "model", label: "Model" },
        { key: "serial_number", label: "Serial" },
        { key: "department", label: "Phòng ban trước thanh lý" },
        { key: "purchase_date", label: "Ngày mua" },
        { key: "original_value", label: "Giá trị ghi nhận" },
        { key: "liquidation_date", label: "Ngày thanh lý" },
        { key: "recovery_value", label: "Giá trị thu hồi" },
        { key: "value_difference", label: "Chênh lệch giá trị" },
        { key: "reason", label: "Lý do thanh lý" },
        { key: "note", label: "Ghi chú" },
      ],
      rows,
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
      report_name: "BÁO CÁO KẾ HOẠCH VÀ LỊCH SỬ BẢO TRÌ",
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
      report_name: "BÁO CÁO LỊCH SỬ BÀN GIAO",
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

  if (reportType === "vehicles") {
    let query = supabase.from("vehicles")
      .select("vehicle_code,vehicle_name,license_plate,brand,model,production_year,seat_count,fuel_norm_l_per_100km,assigned_driver,status,note,departments(name)")
      .is("deleted_at", null);
    if (filters.vehicle_id) query = query.eq("id", filters.vehicle_id);
    const { data, error } = await query.order("vehicle_code").limit(5000);
    if (error) throw new Error("Không thể đọc dữ liệu xe");
    return {
      report_type: reportType,
      title: `TDW - Danh sách xe - ${dateLabel}`,
      report_name: "BÁO CÁO DANH SÁCH XE",
      requested_by: requestedBy,
      columns: [
        { key: "vehicle_code", label: "Mã xe" }, { key: "vehicle_name", label: "Tên xe" },
        { key: "license_plate", label: "Biển số" }, { key: "brand", label: "Thương hiệu" },
        { key: "model", label: "Model" }, { key: "production_year", label: "Năm sản xuất" },
        { key: "seat_count", label: "Số chỗ ngồi" },
        { key: "fuel_norm_l_per_100km", label: "Định mức lít/100 km" },
        { key: "assigned_driver", label: "Tài xế / người sử dụng" },
        { key: "department", label: "Phòng ban" }, { key: "status", label: "Trạng thái" },
        { key: "note", label: "Ghi chú" },
      ],
      rows: (data ?? []).map((item) => { const { departments, ...row } = item; return { ...row, department: departments?.[0]?.name ?? "" }; }),
    };
  }

  if (reportType === "vehicle_inspections") {
    let query = supabase.from("vehicle_inspections")
      .select("inspection_date,expires_on,cost,reminder_days,certificate_number,inspection_center,seat_count,odometer_km,note,vehicles(vehicle_code,vehicle_name,license_plate)");
    if (filters.vehicle_id) query = query.eq("vehicle_id", filters.vehicle_id);
    const dateRange = vehicleReportDateRange(filters);
    if (dateRange) query = query.gte("inspection_date", dateRange.start).lte("inspection_date", dateRange.end);
    const { data, error } = await query.order("inspection_date", { ascending: false }).limit(5000);
    if (error) throw new Error("Không thể đọc dữ liệu đăng kiểm");
    const rows = (data ?? []).map((item) => { const { vehicles, ...row } = item; const vehicle = relatedVehicle(vehicles); return { ...row, vehicle_code: vehicle?.vehicle_code ?? "", vehicle_name: vehicle?.vehicle_name ?? "", license_plate: vehicle?.license_plate ?? "" }; });
    const totalCost = rows.reduce((sum, item) => sum + Number(item.cost || 0), 0);
    return {
      report_type: reportType, title: `TDW - Đăng kiểm xe - ${reportScope} - ${dateLabel}`,
      report_name: "BÁO CÁO ĐĂNG KIỂM XE", requested_by: requestedBy,
      summary: `Tổng chi phí: ${formatVndSummary(totalCost)}`,
      columns: [
        { key: "vehicle_code", label: "Mã xe" }, { key: "vehicle_name", label: "Tên xe" },
        { key: "license_plate", label: "Biển số" }, { key: "inspection_date", label: "Ngày đăng kiểm" },
        { key: "expires_on", label: "Ngày hết hạn" }, { key: "seat_count", label: "Số chỗ ngồi" },
        { key: "cost", label: "Chi phí" },
        { key: "certificate_number", label: "Số giấy chứng nhận" }, { key: "inspection_center", label: "Trung tâm đăng kiểm" },
        { key: "odometer_km", label: "Số km" }, { key: "reminder_days", label: "Nhắc trước (ngày)" }, { key: "note", label: "Ghi chú" },
      ],
      rows,
    };
  }

  if (reportType === "vehicle_insurance") {
    let query = supabase.from("vehicle_insurances")
      .select("insurance_name,insurance_type,insurance_company,certificate_number,starts_on,expires_on,cost,reminder_days,note,vehicles(vehicle_code,vehicle_name,license_plate)");
    if (filters.vehicle_id) query = query.eq("vehicle_id", filters.vehicle_id);
    const dateRange = vehicleReportDateRange(filters);
    if (dateRange) query = query.gte("starts_on", dateRange.start).lte("starts_on", dateRange.end);
    const { data, error } = await query.order("starts_on", { ascending: false }).limit(5000);
    if (error) throw new Error("Không thể đọc dữ liệu bảo hiểm xe");
    const rows = (data ?? []).map((item) => {
      const { vehicles, ...row } = item;
      const vehicle = relatedVehicle(vehicles);
      return {
        ...row,
        vehicle_code: vehicle?.vehicle_code ?? "",
        vehicle_name: vehicle?.vehicle_name ?? "",
        license_plate: vehicle?.license_plate ?? "",
      };
    });
    const totalCost = rows.reduce((sum, item) => sum + Number(item.cost || 0), 0);
    return {
      report_type: reportType,
      title: `TDW - Bảo hiểm xe - ${reportScope} - ${dateLabel}`,
      report_name: "BÁO CÁO BẢO HIỂM XE",
      requested_by: requestedBy,
      summary: `Tổng chi phí: ${formatVndSummary(totalCost)}`,
      columns: [
        { key: "vehicle_code", label: "Mã xe" }, { key: "vehicle_name", label: "Tên xe" },
        { key: "license_plate", label: "Biển số" }, { key: "insurance_name", label: "Tên bảo hiểm" },
        { key: "insurance_type", label: "Loại bảo hiểm" }, { key: "insurance_company", label: "Hãng bảo hiểm" },
        { key: "certificate_number", label: "Số giấy chứng nhận" }, { key: "starts_on", label: "Ngày bắt đầu" },
        { key: "expires_on", label: "Ngày kết thúc" }, { key: "cost", label: "Chi phí" },
        { key: "reminder_days", label: "Nhắc trước (ngày)" }, { key: "note", label: "Ghi chú" },
      ],
      rows,
    };
  }

  if (reportType === "vehicle_repairs") {
    let query = supabase.from("vehicle_repairs")
      .select("service_date,service_type,description,odometer_km,vat_amount,vendor,invoice_number,note,vehicles(vehicle_code,vehicle_name,license_plate)");
    if (filters.vehicle_id) query = query.eq("vehicle_id", filters.vehicle_id);
    const dateRange = vehicleReportDateRange(filters);
    if (dateRange) query = query.gte("service_date", dateRange.start).lte("service_date", dateRange.end);
    const { data, error } = await query.order("service_date", { ascending: false }).limit(5000);
    if (error) throw new Error("Không thể đọc dữ liệu bảo dưỡng xe");
    const rows = (data ?? []).map((item) => { const { vehicles, ...row } = item; const vehicle = relatedVehicle(vehicles); return { ...row, vehicle_code: vehicle?.vehicle_code ?? "", vehicle_name: vehicle?.vehicle_name ?? "", license_plate: vehicle?.license_plate ?? "" }; });
    const totalCost = rows.reduce((sum, item) => sum + Number(item.vat_amount || 0), 0);
    return {
      report_type: reportType, title: `TDW - Bảo dưỡng xe - ${reportScope} - ${dateLabel}`,
      report_name: "NHẬT KÝ BẢO TRÌ BẢO DƯỠNG SỬA CHỮA XE Ô TÔ", requested_by: requestedBy,
      summary: `Tổng chi phí: ${formatVndSummary(totalCost)}`,
      columns: [
        { key: "vehicle_code", label: "Mã xe" }, { key: "vehicle_name", label: "Tên xe" }, { key: "license_plate", label: "Biển số" },
        { key: "service_date", label: "Ngày sửa chữa / bảo dưỡng" }, { key: "service_type", label: "Hình thức" },
        { key: "description", label: "Nội dung sửa chữa" }, { key: "odometer_km", label: "Số km" },
        { key: "vat_amount", label: "Số tiền VAT" }, { key: "vendor", label: "Đơn vị thực hiện" },
        { key: "invoice_number", label: "Số hóa đơn" }, { key: "note", label: "Ghi chú" },
      ],
      rows,
    };
  }

  if (reportType === "vehicle_fuel") {
    let query = supabase.from("vehicle_fuel_logs")
      .select("payment_date,liters,odometer_from,odometer_to,amount,purchaser,note,vehicles(vehicle_code,vehicle_name,license_plate,fuel_norm_l_per_100km)");
    if (filters.vehicle_id) query = query.eq("vehicle_id", filters.vehicle_id);
    const dateRange = vehicleReportDateRange(filters);
    if (dateRange) query = query.gte("payment_date", dateRange.start).lte("payment_date", dateRange.end);
    const { data, error } = await query.order("payment_date", { ascending: false }).limit(5000);
    if (error) throw new Error("Không thể đọc dữ liệu nhiên liệu xe");
    const rows = (data ?? []).map((item) => { const { vehicles, ...row } = item; const vehicle = relatedVehicle(vehicles); return { ...row, vehicle_code: vehicle?.vehicle_code ?? "", vehicle_name: vehicle?.vehicle_name ?? "", license_plate: vehicle?.license_plate ?? "", fuel_norm_l_per_100km: vehicle?.fuel_norm_l_per_100km ?? "" }; });
    const totalLiters = rows.reduce((sum, item) => sum + Number(item.liters || 0), 0);
    const totalAmount = rows.reduce((sum, item) => sum + Number(item.amount || 0), 0);
    return {
      report_type: reportType, title: `TDW - Nhiên liệu xe - ${reportScope} - ${dateLabel}`,
      report_name: "SỔ THEO DÕI MUA NHIÊN LIỆU XE Ô TÔ", requested_by: requestedBy,
      summary: `Tổng số lít: ${formatViNumber(totalLiters)} lít · Tổng số tiền: ${formatVndSummary(totalAmount)}`,
      columns: [
        { key: "vehicle_code", label: "Mã xe" }, { key: "vehicle_name", label: "Tên xe" }, { key: "license_plate", label: "Biển số" },
        { key: "fuel_norm_l_per_100km", label: "Định mức (lít/100 km)" }, { key: "liters", label: "Số lít nhiên liệu" },
        { key: "odometer_from", label: "Số km từ" }, { key: "odometer_to", label: "Số km đến" },
        { key: "payment_date", label: "Ngày thanh toán" }, { key: "amount", label: "Số tiền" },
        { key: "purchaser", label: "Người mua / tài xế" }, { key: "note", label: "Ghi chú" },
      ],
      rows,
    };
  }

  const { data, error } = await supabase
    .from("software_licenses")
    .select(
      "software_name, version, license_key_masked, assigned_user_name, expiry_date, status, note, assets(asset_code, asset_name), software_license_assets(asset_id, assets(asset_code, asset_name, asset_group_label, asset_type))",
    )
    .order("expiry_date", { ascending: true, nullsFirst: false })
    .limit(5000);
  if (error) throw new Error("Không thể đọc dữ liệu phần mềm");

  return {
    report_type: reportType,
    title: `TDW - Báo cáo phần mềm - ${dateLabel}`,
    report_name: "BÁO CÁO BẢN QUYỀN PHẦN MỀM",
    requested_by: requestedBy,
    columns: [
      { key: "software_name", label: "Phần mềm" },
      { key: "version", label: "Phiên bản" },
      { key: "license_key_masked", label: "Khóa đã che" },
      { key: "asset_code", label: "Mã thiết bị" },
      { key: "asset_name", label: "Tên thiết bị" },
      { key: "asset_group", label: "Nhóm thiết bị" },
      { key: "asset_type", label: "Loại thiết bị" },
      { key: "assigned_user_name", label: "Người được cấp" },
      { key: "expiry_date", label: "Ngày hết hạn" },
      { key: "status", label: "Trạng thái" },
      { key: "note", label: "Ghi chú" },
    ],
    rows: (data ?? []).flatMap((license) => {
      const { assets, software_license_assets: assignments, ...fields } = license;
      const assignedAssets = (assignments ?? []).map((assignment) => ({
        asset_id: assignment.asset_id,
        asset: Array.isArray(assignment.assets) ? assignment.assets[0] : assignment.assets,
      }));
      const fallbackAsset = relatedAsset(assets);
      const rows = assignedAssets.length
        ? assignedAssets
        : [{ asset_id: "", asset: fallbackAsset }];

      return rows.map(({ asset }) => ({
        ...fields,
        asset_code: asset?.asset_code ?? "",
        asset_name: asset?.asset_name ?? "",
        asset_group: asset?.asset_group_label ?? "",
        asset_type: asset?.asset_type ?? "",
      }));
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
