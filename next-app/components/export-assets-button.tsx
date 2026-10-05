"use client";

import { useEffect, useRef, useState } from "react";

type OutputFormat = "xlsx" | "pdf";

export type ReportExportFilters = {
  year?: number;
  month?: number;
  vehicle_id?: string;
  asset_groups?: string[];
  asset_statuses?: string[];
  asset_fields?: string[];
  asset_types?: string[];
  departments?: string[];
  maintenance_record_types?: string[];
  maintenance_types?: string[];
  software_names?: string[];
  software_statuses?: string[];
};

const loadingLabel: Record<OutputFormat, string> = {
  xlsx: "Đang tạo XLSX…",
  pdf: "Đang tạo PDF…",
};

export function ExportReportButton({
  reportType,
  outputFormat = "xlsx",
  buttonLabel = "Xuất XLSX",
  filters,
  disabled = false,
}: {
  reportType: "assets" | "liquidations" | "maintenance" | "movement" | "software" | "vehicles" | "vehicle_inspections" | "vehicle_insurance" | "vehicle_repairs" | "vehicle_fuel";
  outputFormat?: OutputFormat;
  buttonLabel?: string;
  filters?: ReportExportFilters;
  disabled?: boolean;
}) {
  const idempotencyToken = useRef<string | null>(null);
  const [state, setState] = useState<
    {
      status: "idle" | "loading" | "error" | "success";
      message?: string;
      url?: string;
    }
  >({ status: "idle" });
  const fileUrl = useRef<string | null>(null);

  useEffect(() => () => { if (fileUrl.current) URL.revokeObjectURL(fileUrl.current); }, []);

  async function exportReport() {
    setState({ status: "loading" });
    const requestToken = idempotencyToken.current || crypto.randomUUID();
    idempotencyToken.current = requestToken;
    const reportWindow = outputFormat === "pdf" ? window.open("about:blank", "_blank") : null;
    if (reportWindow) {
      reportWindow.opener = null;
      reportWindow.document.title = "Đang tạo báo cáo…";
    }
    try {
      const response = await fetch("/api/reports/export", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          report_type: reportType,
          output_format: outputFormat,
          idempotency_token: requestToken,
          filters: filters ?? {},
        }),
      });
      if (!response.ok) {
        const result = await response.json().catch(() => ({}));
        idempotencyToken.current = null;
        throw new Error(result.error || "Không thể xuất báo cáo");
      }
      const blob = await response.blob();
      if (fileUrl.current) URL.revokeObjectURL(fileUrl.current);
      const url = URL.createObjectURL(blob);
      fileUrl.current = url;
      idempotencyToken.current = null;
      setState({
        status: "success",
        message:
          outputFormat === "xlsx"
            ? `Đã tạo tệp XLSX với ${response.headers.get("X-Report-Row-Count") ?? 0} dòng.`
            : `Đã tạo tệp PDF với ${response.headers.get("X-Report-Row-Count") ?? 0} dòng.`,
        url,
      });
      if (outputFormat === "pdf") {
        if (reportWindow) reportWindow.location.replace(url);
      } else {
        const disposition = response.headers.get("Content-Disposition") || "";
        const filename = disposition.match(/filename="([^"]+)"/)?.[1] || "TDW_bao_cao.xlsx";
        const download = document.createElement("a");
        download.href = url;
        download.download = filename;
        document.body.appendChild(download);
        download.click();
        download.remove();
      }
    } catch (error) {
      reportWindow?.close();
      setState({
        status: "error",
        message: error instanceof Error ? error.message : "Không thể xuất báo cáo",
      });
    }
  }

  return (
    <div className="export-action">
      <button
        className="primary-button"
        disabled={disabled || state.status === "loading"}
        onClick={exportReport}
        type="button"
      >
        {state.status === "loading" ? loadingLabel[outputFormat] : buttonLabel}
      </button>
      {state.message ? (
        <small data-status={state.status} role="status">{state.message}</small>
      ) : null}
      {state.url ? (
        <a download={outputFormat === "xlsx" ? "TDW_bao_cao.xlsx" : undefined} href={state.url} rel="noreferrer" target={outputFormat === "pdf" ? "_blank" : undefined}>
          {outputFormat === "pdf" ? "Mở PDF" : "Tải lại XLSX"}
        </a>
      ) : null}
    </div>
  );
}
