type VehicleImportPreviewRow = {
  comparison_status?: "new_vehicle" | "new_record" | "newer" | "changed" | "already_saved" | "older";
  date: string;
  row: number;
  sheet: string;
};

type TollQuarterlyPreviewRow = {
  comparison_status: "new" | "changed" | "already_saved";
  duplicate_in_file?: boolean;
  expires_on: string;
  row: number;
  starts_on: string;
  vehicle_id: string | null;
};

function compareTextDescending(left: string, right: string) {
  return right.localeCompare(left, "en");
}

export function sortVehicleImportPreviewRows<T extends VehicleImportPreviewRow>(rows: T[]) {
  const priority = (row: T) => row.comparison_status === "already_saved"
    ? 3
    : row.comparison_status === "older"
      ? 2
      : row.comparison_status
        ? 0
        : 1;
  return [...rows].sort((left, right) => (
    priority(left) - priority(right)
    || compareTextDescending(left.date, right.date)
    || left.sheet.localeCompare(right.sheet, "vi")
    || right.row - left.row
  ));
}

export function sortTollQuarterlyPreviewRows<T extends TollQuarterlyPreviewRow>(rows: T[]) {
  const priority = (row: T) => row.comparison_status === "already_saved" || row.duplicate_in_file
    ? 2
    : row.vehicle_id
      ? 0
      : 1;
  return [...rows].sort((left, right) => (
    priority(left) - priority(right)
    || compareTextDescending(left.starts_on, right.starts_on)
    || compareTextDescending(left.expires_on, right.expires_on)
    || right.row - left.row
  ));
}
