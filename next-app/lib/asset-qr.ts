export type AssetQrData = {
  id: string;
  asset_code: string;
  asset_name: string;
  asset_group: string;
  asset_group_label: string;
  purchase_year: number | null;
  last_maintenance_date: string | null;
  warranty_end_date: string | null;
};

export function assetQrPath(assetId: string) {
  return `/assets/${encodeURIComponent(assetId)}`;
}

export function assetQrUrl(origin: string, assetId: string) {
  return new URL(assetQrPath(assetId), origin).toString();
}

export function safeQrFileName(assetCode: string) {
  const safeName = assetCode
    .normalize("NFKD")
    .replace(/[^a-zA-Z0-9_-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
  return `${safeName || "TDW-THIET-BI"}-QR.png`;
}
