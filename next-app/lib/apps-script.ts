import "server-only";

import { createHmac, randomUUID } from "node:crypto";

export async function callAppsScript<T>(
  action: string,
  payload: unknown,
  timeoutMs = 45000,
): Promise<T> {
  const exportUrl = String(process.env.APPS_SCRIPT_EXPORT_URL || "").trim();
  const integrationSecret = String(
    process.env.APPS_SCRIPT_INTEGRATION_SECRET || "",
  ).trim();
  if (!exportUrl || !integrationSecret) {
    throw new Error("Tích hợp Google chưa được cấu hình");
  }

  const parsedUrl = new URL(exportUrl);
  if (parsedUrl.protocol !== "https:") {
    throw new Error("URL tích hợp Google phải sử dụng HTTPS");
  }

  const payloadJson = JSON.stringify(payload);
  const timestamp = Date.now();
  const nonce = randomUUID().replaceAll("-", "");
  const signature = createHmac("sha256", integrationSecret)
    .update(`${timestamp}.${nonce}.${payloadJson}`)
    .digest("base64url");
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(exportUrl, {
      method: "POST",
      headers: { "Content-Type": "text/plain;charset=utf-8" },
      body: JSON.stringify({
        action,
        timestamp,
        nonce,
        payload_json: payloadJson,
        signature,
      }),
      signal: controller.signal,
      cache: "no-store",
    });
    const result = await response.json().catch(() => null);
    if (!response.ok || !result?.ok) {
      throw new Error(result?.error || "Apps Script không phản hồi hợp lệ");
    }
    return result as T;
  } finally {
    clearTimeout(timeout);
  }
}
