"use client";

import { useState } from "react";

export function ExportAssetsButton() {
  const [state, setState] = useState<
    { status: "idle" | "loading" | "error" | "success"; message?: string }
  >({ status: "idle" });

  async function exportAssets() {
    setState({ status: "loading" });
    try {
      const response = await fetch("/api/integrations/google-export", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ report_type: "assets" }),
      });
      const result = await response.json();
      if (!response.ok || !result.url) {
        throw new Error(result.error || "Không thể xuất báo cáo");
      }
      setState({
        status: "success",
        message: `Đã xuất ${result.row_count ?? 0} dòng.`,
      });
      window.open(result.url, "_blank", "noopener,noreferrer");
    } catch (error) {
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
        onClick={exportAssets}
        type="button"
      >
        {state.status === "loading" ? "Đang tạo Google Sheet…" : "Xuất Google Sheet"}
      </button>
      {state.message ? (
        <small data-status={state.status} role="status">{state.message}</small>
      ) : null}
    </div>
  );
}
