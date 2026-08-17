export type MediaIdentitySource = {
  byte_size: number;
  checksum?: string | null;
  file_name: string;
};

export function mediaIdentity(item: MediaIdentitySource) {
  const checksum = String(item.checksum ?? "").trim().toLowerCase();
  if (checksum) return `sha256:${checksum}`;
  return `file:${item.file_name.trim().toLowerCase()}:${item.byte_size}`;
}

export function excludeMaintenanceDuplicates<T extends MediaIdentitySource>(
  assetMedia: T[],
  maintenanceMedia: MediaIdentitySource[],
) {
  const maintenanceIdentities = new Set(maintenanceMedia.map(mediaIdentity));
  return assetMedia.filter((item) => !maintenanceIdentities.has(mediaIdentity(item)));
}
