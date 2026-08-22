const maxStoredFileNameLength = 200;

function normalizedSegment(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[Đđ]/g, "D")
    .replace(/[^A-Za-z0-9_]+/g, "-")
    .replace(/_+/g, "_")
    .replace(/^[-_]+|[-_]+$/g, "")
    .toUpperCase();
}

function fileExtension(fileName: string, fallbackExtension: string) {
  const match = fileName.toLowerCase().match(/\.([a-z0-9]{2,8})$/);
  return match?.[1] ?? fallbackExtension.replace(/^\./, "").toLowerCase();
}

export function normalizeUploadedFileName({
  fallbackExtension,
  originalFileName,
  preferredBaseName,
}: {
  fallbackExtension: string;
  originalFileName: string;
  preferredBaseName?: string;
}) {
  const extension = fileExtension(originalFileName, fallbackExtension);
  const originalBaseName = originalFileName.replace(/\.[^.]+$/, "");
  const baseName = normalizedSegment(preferredBaseName || originalBaseName) || "TEP-DINH-KEM";
  return `${baseName.slice(0, maxStoredFileNameLength - extension.length - 1)}.${extension}`;
}

export function compactDateForFileName(value?: string | null) {
  if (!value) return new Date().toISOString().slice(0, 10).replaceAll("-", "");
  const isoDate = value.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  return isoDate ? `${isoDate[3]}-${isoDate[2]}-${isoDate[1]}` : normalizedSegment(value);
}
