const moneyFormatter = new Intl.NumberFormat("vi-VN", {
  style: "currency",
  currency: "VND",
  maximumFractionDigits: 0,
});

const numberFormatter = new Intl.NumberFormat("vi-VN");

const dateFormatter = new Intl.DateTimeFormat("vi-VN", {
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
});

// Chỉ tái sử dụng formatter, không lưu ngày hiện tại: các trang và job nhắc
// hạn phải đổi ngày/năm đúng theo giờ Việt Nam kể cả server chạy theo UTC.
const vietnamDateFormatter = new Intl.DateTimeFormat("en-CA", {
  timeZone: "Asia/Ho_Chi_Minh",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

/** Ngày nghiệp vụ YYYY-MM-DD cho thiết bị, xe, VPP và viễn thông. */
export function vietnamToday(date = new Date()) {
  return vietnamDateFormatter.format(date);
}

/** Kỳ YYYY-MM để gom giao dịch VETC theo tháng tại Việt Nam. */
export function vietnamMonth(date: Date) {
  return vietnamToday(date).slice(0, 7);
}

export function formatMoney(value: number | string | null | undefined) {
  const numericValue = Number(value ?? 0);
  return moneyFormatter.format(Number.isFinite(numericValue) ? numericValue : 0);
}

export function formatNumber(value: number | string | null | undefined) {
  const numericValue = Number(value ?? 0);
  return numberFormatter.format(Number.isFinite(numericValue) ? numericValue : 0);
}

export function formatDate(value: string | null | undefined) {
  if (!value) return "—";
  const normalized = /^\d{4}-\d{2}-\d{2}$/.test(value)
    ? `${value}T00:00:00`
    : value;
  const date = new Date(normalized);
  return Number.isNaN(date.getTime()) ? "—" : dateFormatter.format(date);
}

export const statusLabels: Record<string, string> = {
  CON_SU_DUNG: "Còn sử dụng",
  MOI_100: "Mới 100%",
  KEM_PHAM_CHAT: "Kém phẩm chất",
  CAN_KIEM_TRA: "Cần kiểm tra",
  KHONG_SU_DUNG: "Không sử dụng",
  LUU_KHO_THANH_LY: "Lưu kho chờ thanh lý",
  DA_THANH_LY: "Đã thanh lý",
};

const statusLabelAliases: Record<string, string> = {
  LUU_KHO_CHO_THANH_LY: "Lưu kho chờ thanh lý",
};

export function labelStatus(status: string) {
  return statusLabels[status]
    ?? statusLabelAliases[status]
    ?? (status || "Chưa xác định");
}

export type StatusTone =
  | "active"
  | "new"
  | "attention"
  | "poor"
  | "inactive"
  | "retiring"
  | "liquidated"
  | "neutral";

/** Maps stored status codes to the shared visual tone used across the app. */
export function statusTone(status: string | null | undefined): StatusTone {
  switch (String(status ?? "").trim().toUpperCase()) {
    case "CON_SU_DUNG":
      return "active";
    case "MOI_100":
      return "new";
    case "CAN_KIEM_TRA":
      return "attention";
    case "KEM_PHAM_CHAT":
      return "poor";
    case "KHONG_SU_DUNG":
      return "inactive";
    case "LUU_KHO_THANH_LY":
    case "LUU_KHO_CHO_THANH_LY":
      return "retiring";
    case "DA_THANH_LY":
      return "liquidated";
    default:
      return "neutral";
  }
}
