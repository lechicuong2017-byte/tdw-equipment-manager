"use client";

import { useState } from "react";

export function ExportReportButton({
  reportType,
  buttonLabel = "Xuất Google Sheet",
}: {
  reportType: "assets" | "maintenance" | "movement" | "software";
  buttonLabel?: string;
}) {
  const [state, setState] = useState<
    {
      status: "idle" | "loading" | "error" | "success";
      message?: string;
      url?: string;
    }
  >({ status: "idle" });

  async function exportReport() {
    setState({ status: "loading" });
    const reportWindow = window.open("about:blank", "_blank");
    if (reportWindow) {
      reportWindow.opener = null;
      reportWindow.document.title = "Đang tạo báo cáo…";
    }
    try {
      const response = await fetch("/api/integrations/google-export", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ report_type: reportType }),
      });
      const result = await response.json();
      if (!response.ok || !result.url) {
        throw new Error(result.error || "Không thể xuất báo cáo");
      }
      setState({
        status: "success",
        message: `Đã xuất ${result.row_count ?? 0} dòng.`,
        url: result.url,
      });
      if (reportWindow) reportWindow.location.replace(result.url);
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
        disabled={state.status === "loading"}
        onClick={exportReport}
        type="button"
      >
        {state.status === "loading" ? "Đang tạo Google Sheet…" : buttonLabel}
      </button>
      {state.message ? (
        <small data-status={state.status} role="status">{state.message}</small>
      ) : null}
      {state.url ? (
        <a href={state.url} rel="noreferrer" target="_blank">
          Mở báo cáo
        </a>
      ) : null}
    </div>
  );
}
