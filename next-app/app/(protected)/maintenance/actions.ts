"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { can, requireAccess } from "@/lib/auth";

const emptyToNull = (value: unknown) =>
  typeof value === "string" && value.trim() === "" ? null : value;

const planSchema = z.object({
  asset_id: z.uuid("Thiết bị không hợp lệ"),
  title: z.string().trim().min(1, "Tên kế hoạch là bắt buộc").max(200),
  frequency: z.enum(["MONTHLY", "QUARTERLY", "YEARLY"]),
  next_due_date: z.iso.date("Ngày đến hạn không hợp lệ"),
  note: z.string().trim().max(3000),
});

const logSchema = z.object({
  asset_id: z.uuid("Thiết bị không hợp lệ"),
  plan_id: z.preprocess(emptyToNull, z.uuid().nullable()),
  maintenance_date: z.iso.date("Ngày bảo trì không hợp lệ"),
  action_type: z.string().trim().max(120),
  description: z.string().trim().min(1, "Nội dung bảo trì là bắt buộc").max(3000),
  cost: z.coerce.number().min(0, "Chi phí không được âm").max(1000000000000),
  vendor: z.string().trim().max(200),
  warranty_months: z.coerce.number().int().min(0).max(600),
  performed_by: z.string().trim().max(200),
  note: z.string().trim().max(3000),
});

export type MaintenanceFormState = {
  error?: string;
  success?: string;
};

export async function createMaintenancePlan(
  _previousState: MaintenanceFormState,
  formData: FormData,
): Promise<MaintenanceFormState> {
  const parsed = planSchema.safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Dữ liệu chưa hợp lệ" };
  }

  const { supabase, access } = await requireAccess();
  if (!can(access, "maintenance.manage")) {
    return { error: "Bạn không có quyền tạo kế hoạch bảo trì." };
  }

  const { error } = await supabase.from("maintenance_plans").insert(parsed.data);
  if (error) {
    return { error: "Không thể tạo kế hoạch. Hãy kiểm tra quyền và thiết bị." };
  }

  revalidatePath("/maintenance");
  return { success: "Đã tạo kế hoạch bảo trì." };
}

export async function createMaintenanceLog(
  _previousState: MaintenanceFormState,
  formData: FormData,
): Promise<MaintenanceFormState> {
  const parsed = logSchema.safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Dữ liệu chưa hợp lệ" };
  }

  const { supabase, access } = await requireAccess();
  if (!can(access, "maintenance.manage")) {
    return { error: "Bạn không có quyền ghi nhận bảo trì." };
  }

  if (parsed.data.plan_id) {
    const { data: matchingPlan } = await supabase
      .from("maintenance_plans")
      .select("id")
      .eq("id", parsed.data.plan_id)
      .eq("asset_id", parsed.data.asset_id)
      .maybeSingle();
    if (!matchingPlan) {
      return { error: "Kế hoạch đã chọn không thuộc thiết bị này." };
    }
  }

  const { error } = await supabase.from("maintenance_logs").insert(parsed.data);
  if (error) {
    return { error: "Không thể lưu nhật ký. Hãy kiểm tra quyền và dữ liệu." };
  }

  revalidatePath("/maintenance");
  revalidatePath(`/assets/${parsed.data.asset_id}`);
  return { success: "Đã ghi nhận lần bảo trì." };
}

export async function toggleMaintenancePlan(formData: FormData) {
  const parsed = z.object({
    id: z.uuid(),
    active: z.enum(["true", "false"]),
  }).safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) return;

  const { supabase, access } = await requireAccess();
  if (!can(access, "maintenance.manage")) return;

  await supabase
    .from("maintenance_plans")
    .update({ active: parsed.data.active === "true" })
    .eq("id", parsed.data.id);
  revalidatePath("/maintenance");
}

export async function deleteMaintenanceRecord(formData: FormData) {
  const parsed = z.object({
    id: z.uuid(),
    kind: z.enum(["plan", "log"]),
  }).safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) return;

  const { supabase, access } = await requireAccess();
  if (!can(access, "maintenance.delete")) return;

  const table =
    parsed.data.kind === "plan" ? "maintenance_plans" : "maintenance_logs";
  await supabase.from(table).delete().eq("id", parsed.data.id);
  revalidatePath("/maintenance");
}
