"use client";

import { useMemo, useState } from "react";
import QRCode from "qrcode";
import { assetQrUrl, type AssetQrData } from "@/lib/asset-qr";
import { formatDate } from "@/lib/format";

type PaperSize = "a4" | "label";

const qrOptions = {
  color: { dark: "#0d4f7c", light: "#ffffff" },
  errorCorrectionLevel: "M" as const,
  margin: 2,
  width: 280,
};

function escapeHtml(value: string) {
  return value.replace(/[&<>'"]/g, (character) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    "'": "&#39;",
    '"': "&quot;",
  })[character] ?? character);
}

function labelHtml(asset: AssetQrData, qrDataUrl: string, logoUrl: string) {
  const year = asset.purchase_year ? String(asset.purchase_year) : "Chưa có";
  const maintenance = asset.last_maintenance_date ? formatDate(asset.last_maintenance_date) : "Chưa có";
  const warranty = asset.warranty_end_date ? formatDate(asset.warranty_end_date) : "Chưa có";
  return `<article class="label"><img class="qr" src="${qrDataUrl}" alt="Mã QR"><div class="content"><img class="logo" src="${escapeHtml(logoUrl)}" alt="TDW"><strong>${escapeHtml(asset.asset_code || "THIẾT BỊ TDW")}</strong><span>${escapeHtml(asset.asset_name || "Thiết bị chưa đặt tên")}</span><small>Năm: ${year} · Bảo trì: ${escapeHtml(maintenance)}</small><small>Hết bảo hành: ${escapeHtml(warranty)}</small><small class="note">Quét QR để xem hồ sơ thiết bị</small></div></article>`;
}

function labelsDocument(labels: string[], paperSize: PaperSize) {
  const isLabel = paperSize === "label";
  return `<!doctype html><html lang="vi"><head><meta charset="utf-8"><title>Tem QR thiết bị TDW</title><style>
    @page { size: ${isLabel ? "100mm 140mm" : "A4 portrait"}; margin: ${isLabel ? "5mm" : "10mm"}; }
    * { box-sizing: border-box; }
    body { margin: 0; color: #102235; font-family: Arial, sans-serif; }
    .sheet { align-content: start; display: grid; gap: 5mm; grid-template-columns: ${isLabel ? "90mm" : "repeat(2, 90mm)"}; justify-content: center; }
    .label { align-items: center; background: #fff; border: .4mm solid #176da5; border-radius: 3mm; break-inside: avoid; display: grid; gap: 4mm; grid-template-columns: 28mm 1fr; min-height: 52mm; padding: 5mm; page-break-inside: avoid; width: 90mm; }
    ${isLabel ? ".label:nth-child(2n) { break-after: page; page-break-after: always; } .label:last-child { break-after: auto; page-break-after: auto; }" : ""}
    .qr { height: 28mm; image-rendering: pixelated; width: 28mm; }
    .content { display: grid; gap: 1.3mm; min-width: 0; }
    .logo { height: auto; margin-bottom: 1mm; width: 22mm; }
    strong { color: #176da5; font-size: 11pt; overflow-wrap: anywhere; }
    span { color: #111; font-size: 8.5pt; font-weight: 700; overflow-wrap: anywhere; }
    small { color: #555; font-size: 7pt; }
    .note { color: #176da5; font-weight: 700; }
  </style></head><body><main class="sheet">${labels.join("")}</main></body></html>`;
}

async function waitForPrintImages(printWindow: Window) {
  await Promise.all([...printWindow.document.images].map((image) => {
    if (image.complete) return Promise.resolve();
    return new Promise<void>((resolve, reject) => {
      image.addEventListener("load", () => resolve(), { once: true });
      image.addEventListener("error", () => reject(new Error("Không thể tải ảnh tem QR")), { once: true });
    });
  }));
}

export function AssetQrLabels({ assets }: { assets: AssetQrData[] }) {
  const [group, setGroup] = useState("");
  const [paperSize, setPaperSize] = useState<PaperSize>("a4");
  const [selectedIds, setSelectedIds] = useState<Set<string>>(() => new Set());
  const [status, setStatus] = useState<"idle" | "loading" | "error">("idle");
  const [message, setMessage] = useState("");

  const groups = useMemo(() => {
    const values = new Map<string, string>();
    assets.forEach((asset) => {
      if (asset.asset_group) values.set(asset.asset_group, asset.asset_group_label || asset.asset_group);
    });
    return [...values.entries()].sort((a, b) => a[1].localeCompare(b[1], "vi"));
  }, [assets]);

  const filteredAssets = useMemo(
    () => group ? assets.filter((asset) => asset.asset_group === group) : assets,
    [assets, group],
  );
  const filteredSelected = filteredAssets.filter((asset) => selectedIds.has(asset.id));
  const allFilteredSelected = filteredAssets.length > 0 && filteredSelected.length === filteredAssets.length;

  function toggleAsset(assetId: string, checked: boolean) {
    setSelectedIds((current) => {
      const next = new Set(current);
      if (checked) next.add(assetId);
      else next.delete(assetId);
      return next;
    });
  }

  function toggleFiltered(checked: boolean) {
    setSelectedIds((current) => {
      const next = new Set(current);
      filteredAssets.forEach((asset) => {
        if (checked) next.add(asset.id);
        else next.delete(asset.id);
      });
      return next;
    });
  }

  async function printSelected() {
    const selectedAssets = assets.filter((asset) => selectedIds.has(asset.id));
    if (!selectedAssets.length) {
      setStatus("error");
      setMessage("Hãy chọn ít nhất một thiết bị để in tem QR.");
      return;
    }
    const printWindow = window.open("about:blank", "_blank");
    if (!printWindow) {
      setStatus("error");
      setMessage("Trình duyệt đang chặn cửa sổ in. Hãy cho phép popup rồi thử lại.");
      return;
    }
    printWindow.opener = null;
    setStatus("loading");
    setMessage(`Đang tạo ${selectedAssets.length} tem QR…`);
    printWindow.document.write("<!doctype html><title>Đang tạo tem QR…</title><p>Đang chuẩn bị tem QR thiết bị TDW…</p>");
    try {
      const origin = window.location.origin;
      const logoUrl = new URL("/tdw-logo.webp", origin).toString();
      const qrImages = await Promise.all(selectedAssets.map((asset) => (
        QRCode.toDataURL(assetQrUrl(origin, asset.id), qrOptions)
      )));
      const labels = selectedAssets.map((asset, index) => labelHtml(asset, qrImages[index], logoUrl));
      printWindow.document.open();
      printWindow.document.write(labelsDocument(labels, paperSize));
      printWindow.document.close();
      await waitForPrintImages(printWindow);
      setStatus("idle");
      setMessage(`Đã chuẩn bị ${selectedAssets.length} tem QR.`);
      printWindow.focus();
      printWindow.print();
    } catch {
      printWindow.close();
      setStatus("error");
      setMessage("Không thể tạo tem QR. Vui lòng thử lại.");
    }
  }

  return (
    <section className="panel qr-label-panel">
      <div className="panel-heading qr-label-heading">
        <div>
          <p className="eyebrow">TEM &amp; QR</p>
          <h2>In tem QR thiết bị hàng loạt</h2>
          <p className="muted">Chọn theo nhóm hoặc từng thiết bị; QR chỉ chứa đường dẫn hồ sơ.</p>
        </div>
        <strong>{selectedIds.size} đã chọn</strong>
      </div>

      <div className="qr-label-options">
        <label>
          <span>Nhóm thiết bị</span>
          <select onChange={(event) => setGroup(event.target.value)} value={group}>
            <option value="">Tất cả nhóm</option>
            {groups.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
          </select>
        </label>
        <label>
          <span>Khổ giấy</span>
          <select onChange={(event) => setPaperSize(event.target.value as PaperSize)} value={paperSize}>
            <option value="a4">A4 · Dàn nhiều tem</option>
            <option value="label">Tem 100 × 70 mm · 2 tem mỗi trang</option>
          </select>
        </label>
      </div>

      <label className="qr-select-all">
        <input
          checked={allFilteredSelected}
          onChange={(event) => toggleFiltered(event.target.checked)}
          type="checkbox"
        />
        <span>Chọn tất cả {filteredAssets.length} thiết bị trong nhóm</span>
      </label>

      <div className="qr-device-list">
        {filteredAssets.map((asset) => (
          <label key={asset.id}>
            <input
              checked={selectedIds.has(asset.id)}
              onChange={(event) => toggleAsset(asset.id, event.target.checked)}
              type="checkbox"
            />
            <span><strong>{asset.asset_code}</strong><small>{asset.asset_name}</small></span>
          </label>
        ))}
        {!filteredAssets.length ? <p className="empty-state">Nhóm này chưa có thiết bị.</p> : null}
      </div>

      <div className="qr-label-footer">
        <small data-status={status} role="status">{message}</small>
        <button className="primary-button" disabled={status === "loading"} onClick={printSelected} type="button">
          {status === "loading" ? "Đang tạo tem…" : `In ${selectedIds.size || ""} tem QR`.replace("  ", " ")}
        </button>
      </div>
    </section>
  );
}
