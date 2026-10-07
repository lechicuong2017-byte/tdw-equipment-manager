type InsuranceHistoryRecord = { archived_at: string | null; expires_on: string; reminder_days: number };

// Compare ISO dates supplied by the server in Asia/Ho_Chi_Minh. The expiry
// date itself remains current; history starts on the following day.
export function insuranceViewFilter(view: "current" | "history", today: string): string {
  return view === "history"
    ? `archived_at.not.is.null,expires_on.lt.${today}`
    : `and(archived_at.is.null,expires_on.gte.${today})`;
}

export function insuranceHistoryLabel(record: Pick<InsuranceHistoryRecord, "archived_at">): string {
  return record.archived_at ? "Đã gia hạn" : "Đã hết hạn";
}

export function canRenewInsurance(record: InsuranceHistoryRecord, today: string): boolean {
  if (record.archived_at) return false;
  const remainingDays = Math.round((Date.parse(`${record.expires_on}T00:00:00Z`) - Date.parse(`${today}T00:00:00Z`)) / 86400000);
  // An expired, not-yet-renewed contract lives in history but can still be
  // renewed by the existing transactional RPC. Do not archive it on read.
  return remainingDays <= record.reminder_days;
}
