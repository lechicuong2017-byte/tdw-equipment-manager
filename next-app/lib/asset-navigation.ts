const assetsOrigin = "https://tdw-equipment-manager.local";

export function safeAssetsReturnTo(value: unknown): string | null {
  if (typeof value !== "string" || !value.trim()) return null;

  try {
    const url = new URL(value.trim(), assetsOrigin);
    if (url.origin !== assetsOrigin || url.pathname !== "/assets") return null;
    return `${url.pathname}${url.search}`;
  } catch {
    return null;
  }
}
