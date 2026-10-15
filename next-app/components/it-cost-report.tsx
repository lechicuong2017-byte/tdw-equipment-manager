"use client";
import { useState } from "react";
import { formatMoney } from "@/lib/format";
import type { ItCategory, ItFilter } from "@/lib/it-costs";
export function ItReport({
  categories,
  summary,
  filter,
  canExport,
}: {
  categories: ItCategory[];
  summary: {
    total: number;
    groups: { category_id: string; month: number; amount: number }[];
  };
  filter: ItFilter;
  canExport: boolean;
}) {
  const [selected, setSelected] = useState(
      new Set(categories.map((c) => c.id)),
    ),
    [pending, setPending] = useState(""),
    [error, setError] = useState("");
  async function download(format: string) {
    setPending(format);
    setError("");
    try {
      const p = new URLSearchParams(
        Object.entries(filter)
          .filter(([k, v]) => k !== "page" && !!v)
          .map(([k, v]) => [k, String(v)]),
      );
      p.set("format", format);
      p.set("categories", [...selected].join(","));
      const r = await fetch(`/api/it-costs/reports?${p}`);
      if (!r.ok)
        throw new Error("Không xuất được báo cáo. Kiểm tra quyền và thử lại.");
      const blob = await r.blob(),
        u = URL.createObjectURL(blob),
        a = document.createElement("a");
      a.href = u;
      a.download = `TDW-Chi-phi-CNTT-${filter.year || "Tat-ca"}.${format}`;
      a.click();
      setTimeout(() => URL.revokeObjectURL(u), 1000);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Không xuất được file.");
    } finally {
      setPending("");
    }
  }
  return (
    <section className="panel">
      <h2>Báo cáo chi phí theo danh mục · {filter.year || "Tất cả năm"}</h2>
      <p className="muted">
        Năm theo ngày ghi nhận chi phí. Hợp đồng nhiều năm không tự chia tiền.
        Tổng theo đúng bộ lọc.
      </p>
      <div className="it-report-choices">
        {categories.map((c) => (
          <label className="it-checkbox" key={c.id}>
            <input
              type="checkbox"
              checked={selected.has(c.id)}
              onChange={(e) => {
                const n = new Set(selected);
                if (e.target.checked) n.add(c.id);
                else n.delete(c.id);
                setSelected(n);
              }}
            />
            {c.name}
          </label>
        ))}
      </div>
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Danh mục</th>
              {Array.from({ length: 12 }, (_, i) => (
                <th key={i}>T{i + 1}</th>
              ))}
              <th>Tổng</th>
            </tr>
          </thead>
          <tbody>
            {categories
              .filter((c) => selected.has(c.id))
              .map((c) => {
                const g = summary.groups.filter((g) => g.category_id === c.id);
                return (
                  <tr key={c.id}>
                    <td>{c.name}</td>
                    {Array.from({ length: 12 }, (_, i) => (
                      <td className="it-money" key={i}>
                        {formatMoney(
                          g
                            .filter((r) => r.month === i + 1)
                            .reduce((s, r) => s + Number(r.amount), 0),
                        )}
                      </td>
                    ))}
                    <td className="it-money">
                      <strong>
                        {formatMoney(
                          g.reduce((s, r) => s + Number(r.amount), 0),
                        )}
                      </strong>
                    </td>
                  </tr>
                );
              })}
          </tbody>
          <tfoot>
            <tr>
              <th colSpan={13}>Tổng chi phí các danh mục đã chọn</th>
              <td className="it-money">
                <strong>
                  {formatMoney(
                    summary.groups
                      .filter((g) => selected.has(g.category_id))
                      .reduce((s, g) => s + Number(g.amount), 0),
                  )}
                </strong>
              </td>
            </tr>
          </tfoot>
        </table>
      </div>
      {error ? (
        <p className="form-error" role="alert">
          {error}
        </p>
      ) : null}
      {canExport ? (
        <div className="it-form-footer">
          <p>XLSX gồm tổng hợp, chi tiết và các kỳ dịch vụ liên quan.</p>
          <div className="it-row-actions">
            <button
              className="primary-button"
              disabled={!!pending || !selected.size}
              onClick={() => void download("xlsx")}
            >
              {pending === "xlsx" ? "Đang xuất…" : "Xuất XLSX"}
            </button>
            <button
              className="secondary-button"
              disabled={!!pending || !selected.size}
              onClick={() => void download("pdf")}
            >
              {pending === "pdf" ? "Đang xuất…" : "Xuất PDF"}
            </button>
          </div>
        </div>
      ) : null}
    </section>
  );
}
