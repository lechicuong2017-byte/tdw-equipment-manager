const BYTES_PER_MB = 1_000_000;
const BYTES_PER_GB = 1_000_000_000;

export type CapacityUsage = {
  databaseBytes: number;
  storageBytes: number;
  storageObjects: number;
};

export type CapacityLimit = {
  bytes: number;
  label: string;
};

function readPositiveInteger(value: string | undefined) {
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : null;
}

export function getSupabaseCapacityLimits(): {
  database: CapacityLimit;
  storage: CapacityLimit;
} {
  const databaseOverride = readPositiveInteger(
    process.env.SUPABASE_DATABASE_LIMIT_BYTES,
  );
  const storageOverride = readPositiveInteger(
    process.env.SUPABASE_STORAGE_LIMIT_BYTES,
  );
  const planLabel = process.env.SUPABASE_CAPACITY_PLAN_LABEL?.trim() || "Free";

  return {
    database: {
      bytes: databaseOverride ?? 500 * BYTES_PER_MB,
      label: databaseOverride ? "Hạn mức cấu hình" : `Gói ${planLabel}`,
    },
    storage: {
      bytes: storageOverride ?? BYTES_PER_GB,
      label: storageOverride ? "Hạn mức cấu hình" : `Gói ${planLabel}`,
    },
  };
}

export function parseCapacityUsage(data: unknown): CapacityUsage | null {
  if (!data || typeof data !== "object" || Array.isArray(data)) {
    return null;
  }

  const raw = data as Record<string, unknown>;
  const databaseBytes = Number(raw.database_bytes);
  const storageBytes = Number(raw.storage_bytes);
  const storageObjects = Number(raw.storage_objects);
  if (
    !Number.isFinite(databaseBytes) ||
    !Number.isFinite(storageBytes) ||
    !Number.isFinite(storageObjects)
  ) {
    return null;
  }

  return {
    databaseBytes: Math.max(0, databaseBytes),
    storageBytes: Math.max(0, storageBytes),
    storageObjects: Math.max(0, storageObjects),
  };
}

export function formatCapacityBytes(bytes: number) {
  const formatter = new Intl.NumberFormat("vi-VN", {
    maximumFractionDigits: bytes >= BYTES_PER_GB ? 2 : 1,
  });

  if (bytes >= BYTES_PER_GB) {
    return `${formatter.format(bytes / BYTES_PER_GB)} GB`;
  }
  if (bytes >= BYTES_PER_MB) {
    return `${formatter.format(bytes / BYTES_PER_MB)} MB`;
  }
  return `${formatter.format(bytes / 1_000)} KB`;
}

export function getCapacityProgress(usedBytes: number, limitBytes: number) {
  const percentage = Math.max(0, (usedBytes / limitBytes) * 100);
  return {
    percentage,
    displayPercentage: Math.min(100, percentage),
    remainingBytes: Math.max(0, limitBytes - usedBytes),
    tone: percentage >= 90 ? "danger" : percentage >= 75 ? "warning" : "healthy",
  } as const;
}
