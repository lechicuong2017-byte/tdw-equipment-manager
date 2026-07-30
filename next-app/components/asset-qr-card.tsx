"use client";

import { useEffect, useState } from "react";
import QRCode from "qrcode";
import { assetQrUrl, safeQrFileName, type AssetQrData } from "@/lib/asset-qr";
import { formatDate } from "@/lib/format";

const qrOptions = {
  color: { dark: "#0d4f7c", light: "#ffffff" },
  errorCorrectionLevel: "M" as const,
  margin: 2,
  width: 320,
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

async function waitForPrintImages(printWindow: Window) {
  await Promise.all([...printWindow.document.images].map((image) => {
    if (image.complete) return Promise.resolve();
    return new Promise<void>((resolve, reject) => {
      image.addEventListener("load", () => resolve(), { once: true });
      image.addEventListener("error", () => reject(new Error("Không thể tải ảnh tem QR")), { once: true });
    });
  }));
}

function singleLabelDocument(asset: AssetQrData, qrDataUrl: string, logoUrl: string) {
  const year = asset.purchase_year ? String(asset.purchase_year) : "Chưa có";
  const maintenance = asset.last_maintenance_date ? formatDate(asset.last_maintenance_date) : "Chưa có";
  const warranty = asset.warranty_end_date ? formatDate(asset.warranty_end_date) : "Chưa có";
  return `<!doctype html><html lang="vi"><head><meta charset="utf-8"><title>Tem QR ${escapeHtml(asset.asset_code)}</title><style>
    @page { size: A4 portrait; margin: 12mm; }
    * { box-sizing: border-box; }
    body { margin: 0; color: #102235; font-family: Arial, sans-serif; }
    .sheet { display: grid; justify-content: center; padding-top: 8mm; }
    .label { align-items: center; background: #fff; border: .45mm solid #176da5; border-radius: 3mm; display: grid; gap: 4mm; grid-template-columns: 32mm 1fr; min-height: 58mm; padding: 5mm; width: 100mm; }
    .qr { height: 32mm; image-rendering: pixelated; width: 32mm; }
    .content { display: grid; gap: 1.5mm; min-width: 0; }
    .logo { height: auto; margin-bottom: 1mm; width: 25mm; }
    strong { color: #176da5; font-size: 13pt; overflow-wrap: anywhere; }
    span { color: #111; font-size: 9.5pt; font-weight: 700; overflow-wrap: anywhere; }
    small { color: #555; font-size: 7.5pt; }
    .note { color: #176da5; font-weight: 700; }
  </style></head><body><main class="sheet"><article class="label"><img class="qr" src="${qrDataUrl}" alt="Mã QR"><div class="content"><img class="logo" src="${escapeHtml(logoUrl)}" alt="TDW"><strong>${escapeHtml(asset.asset_code || "THIẾT BỊ TDW")}</strong><span>${escapeHtml(asset.asset_name || "Thiết bị chưa đặt tên")}</span><small>Năm: ${year} · Bảo trì: ${escapeHtml(maintenance)}</small><small>Hết bảo hành: ${escapeHtml(warranty)}</small><small class="note">Quét QR để xem hồ sơ thiết bị</small></div></article></main></body></html>`;
}

export function AssetQrCard({ asset }: { asset: AssetQrData }) {
  const [qrDataUrl, setQrDataUrl] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;
    QRCode.toDataURL(assetQrUrl(window.location.origin, asset.id), qrOptions)
      .then((result) => {
        if (active) setQrDataUrl(result);
      })
      .catch(() => {
        if (active) setError("Không thể tạo mã QR. Vui lòng tải lại trang.");
      });
    return () => {
      active = false;
    };
  }, [asset.id]);

  function downloadQr() {
    if (!qrDataUrl) return;
    const link = document.createElement("a");
    link.href = qrDataUrl;
    link.download = safeQrFileName(asset.asset_code);
    link.click();
  }

  async function printQr() {
    if (!qrDataUrl) return;
    const printWindow = window.open("about:blank", "_blank");
    if (!printWindow) {
      setError("Trình duyệt đang chặn cửa sổ in. Hãy cho phép popup rồi thử lại.");
      return;
    }
    printWindow.opener = null;
    try {
      const logoUrl = new URL("/tdw-logo.webp", window.location.origin).toString();
      printWindow.document.open();
      printWindow.document.write(singleLabelDocument(asset, qrDataUrl, logoUrl));
      printWindow.document.close();
      await waitForPrintImages(printWindow);
      printWindow.focus();
      printWindow.print();
    } catch {
      printWindow.close();
      setError("Không thể chuẩn bị tem QR để in.");
    }
  }

  return (
    <section className="asset-qr-card" aria-labelledby="asset-qr-title">
      {qrDataUrl ? (
        <img alt={`Mã QR thiết bị ${asset.asset_code}`} height="180" src={qrDataUrl} width="180" />
      ) : (
        <div className="asset-qr-placeholder" aria-hidden="true">QR</div>
      )}
      <div>
        <p className="eyebrow" id="asset-qr-title">MÃ QR THIẾT BỊ</p>
        <h2>Quét để mở hồ sơ</h2>
        <p>QR chỉ chứa đường dẫn bảo mật đến hồ sơ thiết bị này.</p>
        <div className="asset-qr-actions">
          <button className="secondary-button" disabled={!qrDataUrl} onClick={downloadQr} type="button">Tải mã QR</button>
          <button className="primary-button" disabled={!qrDataUrl} onClick={printQr} type="button">In tem QR</button>
        </div>
        {error ? <small className="asset-qr-error" role="alert">{error}</small> : null}
      </div>
    </section>
  );
}
