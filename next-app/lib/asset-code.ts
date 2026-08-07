const preferredPrefixes: Record<string, string> = {
  LAPTOP: "LAP",
  "DESKTOP PC": "PC",
  "MAY TINH DE BAN": "PC",
  "DIEN THOAI": "PHN",
  "MAN HINH": "MON",
  "MAY CHIEU": "PRJ",
  "MAY IN": "PRN",
  "O CUNG": "HDD",
  "HARD DISK": "HDD",
  "SERVER/SCADA": "SCA",
  SERVER: "SCA",
  SCADA: "SCA",
  "THIET BI": "DEV",
  TV: "TV",
  UPS: "UPS",
  RAM: "RAM",
  SSD: "SSD",
};

function normalizedType(value: string) {
  return value
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .replace(/[đĐ]/g, "D")
    .toUpperCase()
    .replace(/[^A-Z0-9/]+/g, " ")
    .trim()
    .replace(/\s+/g, " ");
}

export function assetCodePrefix(
  assetType: string,
  assetKind: "DEVICE" | "COMPONENT" = "DEVICE",
) {
  const normalized = normalizedType(assetType);
  if (preferredPrefixes[normalized]) return preferredPrefixes[normalized];
  if (!normalized) return assetKind === "COMPONENT" ? "CMP" : "DEV";

  const tokens = normalized.split(/[ /]+/).filter(Boolean);
  if (tokens.length === 1) return tokens[0].slice(0, 5).padEnd(2, "X");
  const initials = tokens.map((token) => token[0]).join("").slice(0, 5);
  return initials.length >= 2 ? initials : normalized.slice(0, 3).padEnd(2, "X");
}

export function currentAssetCodeYear(date = new Date()) {
  return Number(new Intl.DateTimeFormat("en", {
    timeZone: "Asia/Ho_Chi_Minh",
    year: "numeric",
  }).format(date));
}

export function suggestedAssetCode(
  prefix: string,
  year: number,
  existingAssetCodes: string[],
) {
  const normalizedPrefix = prefix.toUpperCase().replace(/[^A-Z0-9]/g, "");
  const pattern = new RegExp(
    `^TDW-${normalizedPrefix}-${year}-([0-9]+)$`,
    "i",
  );
  const latestSequence = existingAssetCodes.reduce((latest, code) => {
    const match = code.match(pattern);
    return match ? Math.max(latest, Number(match[1])) : latest;
  }, 0);
  return `TDW-${normalizedPrefix}-${year}-${String(latestSequence + 1).padStart(3, "0")}`;
}
