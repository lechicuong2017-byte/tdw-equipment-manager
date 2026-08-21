import { timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { runVehicleInspectionReminders } from "@/lib/vehicle-inspection-reminders";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function safeEqual(provided: string, expected: string) {
  const a = Buffer.from(provided); const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

export async function GET(request: Request) {
  const secret = String(process.env.CRON_SECRET || "").trim();
  if (!secret || !safeEqual(request.headers.get("authorization") || "", `Bearer ${secret}`)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  try { return NextResponse.json({ ok: true, ...(await runVehicleInspectionReminders()) }); }
  catch (error) {
    console.error("vehicle_inspection_reminder_failed", { reason: error instanceof Error ? error.message.slice(0, 500) : "Unknown error" });
    return NextResponse.json({ error: "Không thể hoàn tất tác vụ nhắc đăng kiểm" }, { status: 500 });
  }
}
