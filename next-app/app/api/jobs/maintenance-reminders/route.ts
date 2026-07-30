import { timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { runMaintenanceReminders } from "@/lib/maintenance-reminders";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function safeSecretEqual(provided: string, expected: string) {
  const providedBytes = Buffer.from(provided);
  const expectedBytes = Buffer.from(expected);
  return (
    providedBytes.length === expectedBytes.length &&
    timingSafeEqual(providedBytes, expectedBytes)
  );
}

export async function GET(request: Request) {
  const cronSecret = String(process.env.CRON_SECRET || "").trim();
  const authorization = request.headers.get("authorization") || "";
  if (
    !cronSecret ||
    !safeSecretEqual(authorization, `Bearer ${cronSecret}`)
  ) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const result = await runMaintenanceReminders();
    return NextResponse.json({ ok: true, ...result });
  } catch (error) {
    console.error("maintenance_reminder_job_failed", {
      reason:
        error instanceof Error ? error.message.slice(0, 500) : "Unknown error",
    });
    return NextResponse.json(
      { error: "Không thể hoàn tất tác vụ nhắc bảo trì" },
      { status: 500 },
    );
  }
}
