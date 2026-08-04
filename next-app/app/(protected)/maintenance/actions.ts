"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { can, requireAccess } from "@/lib/auth";
import { runMaintenanceReminders } from "@/lib/maintenance-reminders";

const emptyToNull = (value: unknown) =>
  typeof value === "string" && value.trim() === "" ? null : value;

const formBoolean = z.preprocess(
  (value) => value === true || value === "true" || value === "on",
  z.boolean(),
);

const planSchema = z.object({
  scope_type: z.enum(["ASSET", "GROUP", "TYPE"]),
  asset_id: z.string().trim().max(160).default(""),
  asset_group: z.string().trim().max(160).default(""),
  asset_type: z.string().trim().max(160).default(""),
  title: z.string().trim().min(1, "Tên kế hoạch là bắt buộc").max(200),
  frequency: z.enum(["MONTHLY", "QUARTERLY", "YEARLY"]),
  next_due_date: z.iso.date("Ngày đến hạn không hợp lệ"),
  note: z.string().trim().max(3000),
  active: formBoolean,
  repeat_enabled: formBoolean,
});

const planUpdateSchema = z.object({
  id: z.uuid("Kế hoạch không hợp lệ"),
  title: z.string().trim().min(1, "Tên kế hoạch là bắt buộc").max(200),
  frequency: z.enum(["MONTHLY", "QUARTERLY", "YEARLY"]),
  next_due_date: z.iso.date("Ngày đến hạn không hợp lệ"),
  note: z.string().trim().max(3000),
  active: formBoolean,
  repeat_enabled: formBoolean,
  apply_to_batch: formBoolean,
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

export type ReminderFormState = {
  error?: string;
  success?: string;
};

function selectedScopeValue(data: z.infer<typeof planSchema>) {
  if (data.scope_type === "GROUP") return data.asset_group;
  if (data.scope_type === "TYPE") return data.asset_type;
  return z.uuid().safeParse(data.asset_id).success ? data.asset_id : "";
}

function maintenanceRpcError(message: string) {
  if (message.includes("at most 200")) {
    return "Phạm vi có hơn 200 thiết bị. Hãy chọn nhóm hoặc loại nhỏ hơn.";
  }
  if (message.includes("No assets match")) {
    return "Không có thiết bị nào phù hợp với phạm vi đã chọn.";
  }
  if (message.includes("access denied") || message.includes("Access denied")) {
    return "Bạn không có quyền quản lý một hoặc nhiều thiết bị trong phạm vi này.";
  }
  return "Không thể lưu kế hoạch. Hãy kiểm tra quyền và dữ liệu.";
}

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

  const scopeValue = selectedScopeValue(parsed.data);
  if (!scopeValue) {
    return { error: "Hãy chọn phạm vi áp dụng cho kế hoạch." };
  }

  const { data: createdCount, error } = await supabase.rpc(
    "create_maintenance_plan_batch",
    {
      target_scope_type: parsed.data.scope_type,
      target_scope_value: scopeValue,
      target_title: parsed.data.title,
      target_frequency: parsed.data.frequency,
      target_next_due_date: parsed.data.next_due_date,
      target_note: parsed.data.note,
      target_active: parsed.data.active,
      target_repeat_enabled: parsed.data.repeat_enabled,
    },
  );
  if (error) {
    return { error: maintenanceRpcError(error.message) };
  }

  revalidatePath("/maintenance");
  const count = typeof createdCount === "number" ? createdCount : 0;
  return { success: `Đã tạo kế hoạch cho ${count} thiết bị.` };
}

export async function updateMaintenancePlan(
  _previousState: MaintenanceFormState,
  formData: FormData,
): Promise<MaintenanceFormState> {
  const parsed = planUpdateSchema.safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Dữ liệu chưa hợp lệ" };
  }

  const { supabase, access } = await requireAccess();
  if (!can(access, "maintenance.manage")) {
    return { error: "Bạn không có quyền sửa kế hoạch bảo trì." };
  }

  const { data: updatedCount, error } = await supabase.rpc(
    "update_maintenance_plan_schedule",
    {
      target_plan_id: parsed.data.id,
      target_title: parsed.data.title,
      target_frequency: parsed.data.frequency,
      target_next_due_date: parsed.data.next_due_date,
      target_note: parsed.data.note,
      target_active: parsed.data.active,
      target_repeat_enabled: parsed.data.repeat_enabled,
      target_apply_to_batch: parsed.data.apply_to_batch,
    },
  );
  if (error) {
    return { error: maintenanceRpcError(error.message) };
  }

  revalidatePath("/maintenance");
  const count = typeof updatedCount === "number" ? updatedCount : 0;
  return { success: `Đã cập nhật ${count} kế hoạch.` };
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
      .eq("active", true)
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
  if (!parsed.success) return { error: "Thông tin cần xóa không hợp lệ." };

  const { supabase, access } = await requireAccess();
  if (!can(access, "maintenance.delete")) return { error: "Bạn không có quyền xóa dữ liệu bảo trì." };

  const table =
    parsed.data.kind === "plan" ? "maintenance_plans" : "maintenance_logs";
  const { error } = await supabase.from(table).delete().eq("id", parsed.data.id);
  if (error) return { error: "Không thể xóa dữ liệu bảo trì." };
  revalidatePath("/maintenance");
  return {
    success: parsed.data.kind === "plan"
      ? "Đã xóa kế hoạch bảo trì."
      : "Đã xóa nhật ký bảo trì.",
  };
}

export async function sendMaintenanceReminders(
  _previousState: ReminderFormState,
): Promise<ReminderFormState> {
  const { access } = await requireAccess();
  if (!access.roles.includes("admin")) {
    return { error: "Chỉ quản trị viên được gửi email nhắc bảo trì." };
  }

  try {
    const result = await runMaintenanceReminders();
    revalidatePath("/maintenance");
    return {
      success: result.claimed
        ? `Đã gửi ${result.sent}; lỗi ${result.failed}; chưa xác nhận ${result.unknown}.`
        : `Không có email mới cần gửi. Đã kiểm tra ${result.checked} kế hoạch.`,
    };
  } catch (error) {
    console.error("manual_maintenance_reminder_failed", {
      reason:
        error instanceof Error ? error.message.slice(0, 500) : "Unknown error",
    });
    return {
      error: "Không thể hoàn tất gửi email. Hãy xem nhật ký hệ thống.",
    };
  }
}
