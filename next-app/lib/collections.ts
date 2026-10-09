/**
 * Gom các dòng theo khóa trong một lượt O(n), giữ nguyên thứ tự đầu vào.
 * Dùng cho phiếu VPP, lịch bảo trì và phân quyền; không sửa mảng nguồn và
 * không cache dữ liệu giữa các request/người dùng.
 */
export function groupBy<T, K>(rows: readonly T[], keyOf: (row: T) => K): Map<K, T[]> {
  const groups = new Map<K, T[]>();
  for (const row of rows) {
    const key = keyOf(row);
    const group = groups.get(key);
    if (group) group.push(row);
    else groups.set(key, [row]);
  }
  return groups;
}
