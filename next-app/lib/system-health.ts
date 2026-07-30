export type ServiceHealthStatus = "operational" | "degraded" | "down";

export type ServiceHealthCheck = {
  key: "nextjs" | "supabase" | "apps_script";
  name: string;
  status: ServiceHealthStatus;
  latencyMs: number | null;
  detail: string;
};

export function summarizeSystemHealth(checks: ServiceHealthCheck[]) {
  if (checks.every((check) => check.status === "operational")) {
    return "operational" as const;
  }
  if (checks.some((check) => check.status === "down")) {
    return "down" as const;
  }
  return "degraded" as const;
}

export const healthStatusLabels: Record<ServiceHealthStatus, string> = {
  operational: "Hoạt động tốt",
  degraded: "Cần theo dõi",
  down: "Gián đoạn",
};

export function formatHealthLatency(latencyMs: number | null) {
  return latencyMs === null ? "Chưa đo được" : `${latencyMs.toLocaleString("vi-VN")} ms`;
}
