// Keep every source row visible while allowing only the first identical record
// to be selected. The database independently enforces the same identity.
export function markTollPreviewDuplicates<T extends { fingerprint: string }>(rows: T[]) {
  const seen = new Set<string>();
  return rows.map((row) => {
    const duplicate_in_file = seen.has(row.fingerprint);
    seen.add(row.fingerprint);
    return { ...row, duplicate_in_file };
  });
}
