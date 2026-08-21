import "server-only";

import { callAppsScript } from "@/lib/apps-script";
import { createAdminClient } from "@/lib/supabase/admin";

const reminderDays = new Set([30, 7, 0]);

type InspectionNotification = {
  inspection_id: string;
  vehicle_id: string;
  recipient_email: string;
  notification_type: string;
  due_date: string;
  recipient_name: string;
  vehicle_code: string;
  vehicle_name: string;
  license_plate: string;
};

type ClaimedInspectionNotification = InspectionNotification & { notification_id: string };

function vietnamDate() {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Ho_Chi_Minh" }).format(new Date());
}

function daysBetween(from: string, to: string) {
  return Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86400000);
}

function notificationType(dueDate: string, today: string) {
  const days = daysBetween(today, dueDate);
  if (reminderDays.has(days)) return `DUE_${days}`;
  if (days < 0 && Math.abs(days) % 7 === 0) return `OVERDUE_${Math.abs(days)}`;
  return "";
}

export async function runVehicleInspectionReminders() {
  const supabase = createAdminClient();
  const today = vietnamDate();
  const { data: inspections, error } = await supabase
    .from("vehicle_inspections")
    .select("id,vehicle_id,expires_on,vehicles(vehicle_code,vehicle_name,license_plate,responsible_user_id,deleted_at)")
    .order("expires_on")
    .limit(5000);
  if (error) throw new Error("Không thể đọc lịch đăng kiểm");
  const candidates = (inspections ?? []).flatMap((inspection) => {
    const vehicle = Array.isArray(inspection.vehicles) ? inspection.vehicles[0] : inspection.vehicles;
    const type = notificationType(inspection.expires_on, today);
    return vehicle && !vehicle.deleted_at && type ? [{ inspection, vehicle, type }] : [];
  });
  const responsibleIds = [...new Set(candidates.map((item) => item.vehicle.responsible_user_id).filter(Boolean))] as string[];
  const { data: profiles, error: profileError } = responsibleIds.length
    ? await supabase.from("profiles").select("id,email,full_name,active").in("id", responsibleIds).eq("active", true)
    : { data: [], error: null };
  if (profileError) throw new Error("Không thể đọc người phụ trách xe");
  const typedProfiles = (profiles ?? []) as Array<{ id: string; email: string; full_name: string; active: boolean }>;
  const profileById = new Map(typedProfiles.map((profile) => [profile.id, profile]));
  const notifications: InspectionNotification[] = candidates.flatMap(({ inspection, vehicle, type }) => {
    const profile = vehicle.responsible_user_id ? profileById.get(vehicle.responsible_user_id) : null;
    return profile?.email ? [{ inspection_id: inspection.id, vehicle_id: inspection.vehicle_id, recipient_email: profile.email.trim().toLowerCase(), notification_type: type, due_date: inspection.expires_on, recipient_name: profile.full_name || profile.email, vehicle_code: vehicle.vehicle_code, vehicle_name: vehicle.vehicle_name, license_plate: vehicle.license_plate }] : [];
  }).slice(0, 200);
  if (!notifications.length) return { checked: inspections?.length ?? 0, candidates: candidates.length, sent: 0, failed: 0, skipped: candidates.length };
  const { data: claimed, error: claimError } = await supabase.rpc("claim_vehicle_inspection_notifications", { target_candidates: notifications.map(({ inspection_id, vehicle_id, recipient_email, notification_type, due_date }) => ({ inspection_id, vehicle_id, recipient_email, notification_type, due_date })) });
  if (claimError) throw new Error("Không thể khóa email nhắc đăng kiểm");
  const sourceByKey = new Map(notifications.map((item) => [`${item.inspection_id}|${item.recipient_email}|${item.notification_type}`, item]));
  const claimedNotifications: ClaimedInspectionNotification[] = (claimed ?? []).flatMap((item: { notification_id: string; inspection_id: string; recipient_email: string; notification_type: string }) => {
    const source = sourceByKey.get(`${item.inspection_id}|${item.recipient_email}|${item.notification_type}`);
    return source ? [{ ...source, notification_id: item.notification_id }] : [];
  });
  if (!claimedNotifications.length) return { checked: inspections?.length ?? 0, candidates: notifications.length, sent: 0, failed: 0, skipped: notifications.length };
  try {
    const response = await callAppsScript<{ results: Array<{ notification_id: string; status: "SENT" | "FAILED"; error?: string }> }>("sendSupabaseVehicleInspectionReminders", { notifications: claimedNotifications }, 50000);
    const resultById = new Map((response.results ?? []).map((item) => [item.notification_id, item]));
    const results = claimedNotifications.map((item) => { const result = resultById.get(item.notification_id); return { notification_id: item.notification_id, status: result?.status ?? "UNKNOWN", error: result?.error ?? (result ? "" : "Apps Script không trả kết quả") }; });
    await supabase.rpc("finish_vehicle_inspection_notifications", { target_results: results });
    return { checked: inspections?.length ?? 0, candidates: notifications.length, sent: results.filter((item) => item.status === "SENT").length, failed: results.filter((item) => item.status === "FAILED").length, skipped: notifications.length - claimedNotifications.length };
  } catch (sendError) {
    await supabase.rpc("finish_vehicle_inspection_notifications", { target_results: claimedNotifications.map((item) => ({ notification_id: item.notification_id, status: "UNKNOWN", error: "Không xác nhận được kết quả từ Apps Script" })) });
    throw sendError;
  }
}
