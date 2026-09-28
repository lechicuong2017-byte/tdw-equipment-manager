export type VehicleDueStatus = { className: string; label: string };

export function dueTone(days: number): VehicleDueStatus {
  if (days < 0) return { className: "status-pill--retiring", label: `Quá hạn ${Math.abs(days)} ngày` };
  if (days <= 7) return { className: "status-pill--attention", label: `Còn ${days} ngày` };
  if (days <= 30) return { className: "status-pill--new", label: `Còn ${days} ngày` };
  return { className: "status-pill--active", label: "Còn hiệu lực" };
}

export function periodDueTone(startsOn: string, expiresOn: string, today: string): VehicleDueStatus {
  if (today < startsOn) return { className: "status-pill--new", label: "Chưa đến kỳ" };
  const days = Math.round((Date.parse(`${expiresOn}T00:00:00Z`) - Date.parse(`${today}T00:00:00Z`)) / 86400000);
  return dueTone(days);
}
