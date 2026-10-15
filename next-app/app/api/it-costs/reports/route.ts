import ExcelJS from "exceljs";
import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { requireModuleAccess, can } from "@/lib/auth";
import { parseItFilter } from "@/lib/it-costs";
import { addVehicleReportHeader } from "@/lib/vehicle-report-brand";
import { renderReportPdf, type LocalReport } from "@/lib/local-report-file";
import { formatDate, vietnamToday } from "@/lib/format";
export const maxDuration = 60;
type CostRow = {
  line_id: string;
  entry_id: string;
  recognized_on: string;
  provider: string;
  payment_status: string;
  paid_on: string | null;
  category_id: string;
  category_name: string;
  service_id: string | null;
  service_name: string | null;
  description: string;
  amount_before_tax: number;
  tax_amount: number;
  amount_after_tax: number;
};
const safe = (s: unknown) =>
  typeof s === "string" && /^[\s\u0000-\u001f]*[=+@-]/.test(s) ? `'${s}` : s;
export async function GET(request: NextRequest) {
  const { access, supabase } = await requireModuleAccess("it_costs");
  if (!can(access, "it_costs.view") || !can(access, "reports.it_costs.export"))
    return NextResponse.json(
      { error: "Không có quyền xuất báo cáo." },
      { status: 403 },
    );
  const input = Object.fromEntries(request.nextUrl.searchParams),
    filter = parseItFilter(input),
    format = input.format || "xlsx";
  const selected = (input.categories || "").split(",").filter(Boolean);
  if (
    !["xlsx", "pdf"].includes(format) ||
    !selected.length ||
    selected.length > 1000 ||
    selected.some((id) => !z.uuid().safeParse(id).success) ||
    (input.month && !input.year)
  )
    return NextResponse.json(
      { error: "Kiểm tra bộ lọc và danh mục xuất." },
      { status: 400 },
    );
  for (const k of ["year", "month", "category", "service", "payment"] as const)
    if (input[k] && input[k] !== filter[k])
      return NextResponse.json(
        { error: "Bộ lọc không hợp lệ." },
        { status: 400 },
      );
  const rows: CostRow[] = [];
  let complete = false;
  for (let offset = 0; offset < 50000; offset += 500) {
    const r = await supabase
      .rpc("it_filtered_costs", { target_filter: filter })
      .in("category_id", selected)
      .order("recognized_on")
      .order("line_id")
      .range(offset, offset + 499);
    if (r.error)
      return NextResponse.json(
        { error: "Không đọc được toàn bộ chi phí." },
        { status: 500 },
      );
    rows.push(...(r.data as CostRow[]));
    if (r.data.length < 500) {
      complete = true;
      break;
    }
  }
  if (!complete)
    return NextResponse.json(
      { error: "Báo cáo quá lớn, hãy lọc theo năm/tháng." },
      { status: 422 },
    );
  const subtitle = `${filter.year ? `Năm ${filter.year}` : "Tất cả năm"}${filter.month ? ` · Tháng ${filter.month}` : ""} · Ngày ghi nhận chi phí · Ngày xuất ${formatDate(vietnamToday())}`;
  const report: LocalReport = {
    report_name: "BÁO CÁO CHI PHÍ CÔNG NGHỆ THÔNG TIN",
    summary: subtitle,
    columns: [
      { key: "date", label: "Ngày ghi nhận" },
      { key: "category", label: "Danh mục" },
      { key: "provider", label: "Nhà cung cấp" },
      { key: "service", label: "Dịch vụ" },
      { key: "description", label: "Nội dung" },
      { key: "amount_before_tax", label: "Trước thuế" },
      { key: "tax_amount", label: "VAT" },
      { key: "amount_after_tax", label: "Sau thuế" },
      { key: "payment", label: "Thanh toán" },
    ],
    rows: rows.map((r) => ({
      date: formatDate(r.recognized_on),
      category: r.category_name,
      provider: r.provider,
      service: r.service_name || "",
      description: r.description,
      amount_before_tax: Number(r.amount_before_tax),
      tax_amount: Number(r.tax_amount),
      amount_after_tax: Number(r.amount_after_tax),
      payment:
        r.payment_status === "paid"
          ? `Đã thanh toán ${formatDate(r.paid_on)}`
          : r.payment_status === "unpaid"
            ? "Chưa thanh toán"
            : "Chưa xác nhận",
    })),
  };
  if (format === "pdf") {
    try {
      const b = await renderReportPdf(report);
      return new NextResponse(new Uint8Array(b), {
        headers: {
          "Content-Type": "application/pdf",
          "Content-Disposition": `attachment; filename="TDW-Chi-phi-CNTT-${filter.year || "all"}.pdf"`,
          "Cache-Control": "private, no-store",
        },
      });
    } catch {
      return NextResponse.json(
        {
          error:
            "Không tạo được PDF. Nếu quá 1.000 dòng, hãy lọc bớt hoặc xuất XLSX.",
        },
        { status: 422 },
      );
    }
  }
  const book = new ExcelJS.Workbook();
  book.creator = "TDW Management";
  async function sheet(
    name: string,
    title: string,
    headers: string[],
    values: unknown[][],
    moneyColumns: number[],
  ) {
    const s = book.addWorksheet(name, {
      views: [{ state: "frozen", ySplit: 5 }],
      pageSetup: {
        orientation: "landscape",
        fitToPage: true,
        fitToWidth: 1,
        fitToHeight: 0,
      },
    });
    await addVehicleReportHeader(book, s, headers.length, title, subtitle);
    s.getRow(5).values = headers;
    for (const v of values) s.addRow(v.map(safe));
    const totals = s.addRow(["TỔNG CỘNG"]);
    for (const c of moneyColumns) {
      totals.getCell(c).value = values.reduce(
        (n, r) => n + (Number(r[c - 1]) || 0),
        0,
      );
      totals.getCell(c).numFmt = '#,##0 "₫"';
    }
    s.columns.forEach(
      (c, i) =>
        (c.width = i === 0 ? 18 : moneyColumns.includes(i + 1) ? 20 : 28),
    );
    s.eachRow((r, n) => {
      if (n < 5) return;
      r.height = n === 5 ? 36 : 42;
      r.eachCell((c) => {
        c.alignment = { vertical: "middle", wrapText: true };
        c.border = { bottom: { style: "thin", color: { argb: "FFD2E2EA" } } };
        if (n === 5 || n === totals.number) {
          c.fill = {
            type: "pattern",
            pattern: "solid",
            fgColor: { argb: "FF08769A" },
          };
          c.font = { bold: true, color: { argb: "FFFFFFFF" } };
        } else
          c.fill = {
            type: "pattern",
            pattern: "solid",
            fgColor: { argb: n % 2 ? "FFF2F7FA" : "FFFFFFFF" },
          };
      });
      for (const col of moneyColumns) {
        r.getCell(col).numFmt = '#,##0 "₫"';
        r.getCell(col).alignment = { horizontal: "right", vertical: "middle" };
      }
    });
    s.autoFilter = {
      from: { row: 5, column: 1 },
      to: { row: Math.max(5, totals.number - 1), column: headers.length },
    };
    s.pageSetup.printArea = `A1:${s.getColumn(headers.length).letter}${totals.number}`;
    return s;
  }
  const groups = new Map<string, { name: string; months: number[] }>();
  for (const r of rows) {
    const g = groups.get(r.category_id) || {
      name: r.category_name,
      months: Array(12).fill(0),
    };
    g.months[Number(r.recognized_on.slice(5, 7)) - 1] += Number(
      r.amount_after_tax,
    );
    groups.set(r.category_id, g);
  }
  await sheet(
    "Tong hop danh muc",
    "TỔNG HỢP CHI PHÍ CNTT THEO DANH MỤC",
    [
      "Danh mục",
      ...Array.from({ length: 12 }, (_, i) => `Tháng ${i + 1}`),
      "Tổng năm",
    ],
    [...groups.values()].map((g) => [
      g.name,
      ...g.months,
      g.months.reduce((s, n) => s + n, 0),
    ]),
    Array.from({ length: 13 }, (_, i) => i + 2),
  );
  await sheet(
    "Chi tiet chi phi",
    report.report_name,
    report.columns.map((c) => c.label),
    report.rows.map((r) => report.columns.map((c) => r[c.key])),
    [6, 7, 8],
  );
  const ids = [
    ...new Set(
      rows.map((r) => r.service_id).filter((id): id is string => !!id),
    ),
  ];
  const periods: unknown[][] = [];
  for (let batch = 0; batch < ids.length; batch += 100) {
    let done = false;
    for (let offset = 0; offset < 50000; offset += 500) {
      const r = await supabase
        .from("it_service_periods")
        .select(
          "id,service_id,starts_on,expires_on,cycle,status,it_services(name,provider)",
        )
        .in("service_id", ids.slice(batch, batch + 100))
        .order("id")
        .range(offset, offset + 499);
      if (r.error)
        return NextResponse.json(
          { error: "Không đọc đủ các kỳ dịch vụ." },
          { status: 500 },
        );
      for (const p of r.data) {
        const s = p.it_services as unknown as {
          name: string;
          provider: string;
        } | null;
        periods.push([
          s?.name || "",
          s?.provider || "",
          formatDate(p.starts_on),
          formatDate(p.expires_on),
          p.cycle,
          p.status,
        ]);
      }
      if (r.data.length < 500) {
        done = true;
        break;
      }
    }
    if (!done)
      return NextResponse.json(
        { error: "Quá nhiều kỳ dịch vụ, cần lọc bớt." },
        { status: 422 },
      );
  }
  await sheet(
    "Dich vu va ky han",
    "DỊCH VỤ VÀ KỲ HẠN LIÊN QUAN",
    ["Dịch vụ", "Nhà cung cấp", "Bắt đầu", "Hết hạn", "Chu kỳ", "Trạng thái"],
    periods,
    [],
  );
  const bytes = await book.xlsx.writeBuffer();
  return new NextResponse(new Uint8Array(bytes), {
    headers: {
      "Content-Type":
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="TDW-Chi-phi-CNTT-${filter.year || "all"}.xlsx"`,
      "Cache-Control": "private, no-store",
      "X-Report-Row-Count": String(rows.length),
    },
  });
}
