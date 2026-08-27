"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireAccess } from "@/lib/auth";
import {
  settingTypes,
  settingValueFromDisplayName,
} from "@/lib/settings";

const settingTypeSchema = z.enum(settingTypes);
const settingNameSchema = z
  .string()
  .trim()
  .min(1, "Tên hiển thị là bắt buộc")
  .max(160, "Tên hiển thị tối đa 160 ký tự");

const departmentSchema = z.object({
  name: z.string().trim().min(1, "Tên phòng ban là bắt buộc").max(160),
  manager_name: z.string().trim().max(160),
  location: z.string().trim().max(200),
  note: z.string().trim().max(1000),
});

export type SettingsFormState = {
  error?: string;
  success?: string;
};

async function requireAdmin() {
  const context = await requireAccess();
  if (!context.access.roles.includes("admin")) {
    throw new Error("FORBIDDEN");
  }
  return context;
}

function revalidateSettingsConsumers() {
  revalidatePath("/admin/settings");
  revalidatePath("/assets/new");
  revalidatePath("/assets");
  revalidatePath("/maintenance");
  revalidatePath("/software");
}

export async function saveSetting(
  _previousState: SettingsFormState,
  formData: FormData,
): Promise<SettingsFormState> {
  const id = z.preprocess(
    (value) => String(value || "").trim() || null,
    z.uuid().nullable(),
  ).safeParse(formData.get("id"));
  const displayName = settingNameSchema.safeParse(formData.get("display_name"));
  const settingType = settingTypeSchema.safeParse(formData.get("setting_type"));
  if (!id.success || !displayName.success || !settingType.success) {
    return {
      error: displayName.error?.issues[0]?.message
        ?? (settingType.success ? "Cấu hình không hợp lệ." : "Loại cấu hình không hợp lệ."),
    };
  }

  const { supabase } = await requireAdmin();

  if (id.data) {
    const { data: existing } = await supabase
      .from("settings")
      .select("id,setting_type,setting_value,display_name")
      .eq("id", id.data)
      .maybeSingle();
    if (!existing || !settingTypeSchema.safeParse(existing.setting_type).success) {
      return { error: "Không tìm thấy cấu hình cần sửa." };
    }

    const settingValue = displayName.data === existing.display_name
      ? existing.setting_value
      : settingValueFromDisplayName(displayName.data);
    if (!settingValue) return { error: "Tên hiển thị chưa tạo được mã nội bộ." };

    const { data: updatedCount, error } = await supabase.rpc("admin_update_setting", {
      target_setting_id: id.data,
      target_display_name: displayName.data,
      target_setting_type: settingType.data,
      target_setting_value: settingValue,
    });
    if (error?.message.includes("SETTING_TYPE_IN_USE")) {
      return { error: "Cấu hình đã được sử dụng nên không thể đổi loại. Bạn vẫn có thể đổi tên để hệ thống cập nhật các liên kết." };
    }
    if (error?.message.includes("SETTING_VALUE_EXISTS") || error?.code === "23505") {
      return { error: "Tên mới tạo ra mã nội bộ đã tồn tại trong loại cấu hình được chọn." };
    }
    if (error) return { error: "Không thể cập nhật cấu hình." };

    const { data: persisted, error: verificationError } = await supabase
      .from("settings")
      .select("setting_type,setting_value,display_name")
      .eq("id", id.data)
      .maybeSingle();
    if (
      verificationError
      || !persisted
      || persisted.setting_type !== settingType.data
      || persisted.setting_value !== settingValue
      || persisted.display_name !== displayName.data
    ) {
      return { error: "Cấu hình chưa được lưu đầy đủ. Vui lòng thử lại." };
    }

    revalidateSettingsConsumers();
    const migratedRecords = Number(updatedCount || 0);
    return {
      success: migratedRecords
        ? `Đã cập nhật cấu hình và ${migratedRecords} dữ liệu liên kết.`
        : "Đã cập nhật cấu hình.",
    };
  }

  const settingValue = settingValueFromDisplayName(displayName.data);
  if (!settingValue) return { error: "Tên hiển thị chưa tạo được mã nội bộ." };

  const { data: lastSetting } = await supabase
    .from("settings")
    .select("sort_order")
    .eq("setting_type", settingType.data)
    .order("sort_order", { ascending: false })
    .limit(1)
    .maybeSingle();

  const { error } = await supabase.from("settings").insert({
    setting_type: settingType.data,
    setting_value: settingValue,
    display_name: displayName.data,
    sort_order: Number(lastSetting?.sort_order || 0) + 10,
    active: true,
  });
  if (error?.code === "23505") {
    return { error: "Tên này tạo ra mã nội bộ đã tồn tại trong cùng danh mục." };
  }
  if (error) return { error: "Không thể thêm cấu hình." };

  revalidateSettingsConsumers();
  return { success: `Đã thêm cấu hình ${displayName.data}.` };
}

export async function toggleSetting(formData: FormData) {
  const parsed = z.object({
    id: z.uuid(),
    active: z.enum(["true", "false"]),
  }).safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) return;

  const { supabase } = await requireAdmin();
  await supabase
    .from("settings")
    .update({ active: parsed.data.active === "true" })
    .eq("id", parsed.data.id);
  revalidateSettingsConsumers();
}

export async function moveSetting(formData: FormData) {
  const parsed = z.object({
    id: z.uuid(),
    direction: z.enum(["up", "down"]),
  }).safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) return;

  const { supabase } = await requireAdmin();
  await supabase.rpc("admin_reorder_setting", {
    target_setting_id: parsed.data.id,
    move_direction: parsed.data.direction,
  });
  revalidateSettingsConsumers();
}

export async function saveDepartment(
  _previousState: SettingsFormState,
  formData: FormData,
): Promise<SettingsFormState> {
  const id = z.preprocess(
    (value) => String(value || "").trim() || null,
    z.uuid().nullable(),
  ).safeParse(formData.get("id"));
  const parsed = departmentSchema.safeParse(Object.fromEntries(formData.entries()));
  if (!id.success || !parsed.success) {
    return {
      error: parsed.error?.issues[0]?.message ?? "Thông tin phòng ban không hợp lệ.",
    };
  }

  const { supabase } = await requireAdmin();
  const query = id.data
    ? supabase.from("departments").update(parsed.data).eq("id", id.data)
    : supabase.from("departments").insert(parsed.data);
  const { error } = await query;
  if (error?.code === "23505") return { error: "Tên phòng ban đã tồn tại." };
  if (error) return { error: "Không thể lưu phòng ban." };

  revalidatePath("/admin/settings");
  revalidatePath("/admin/users");
  revalidatePath("/assets/new");
  revalidatePath("/assets");
  return {
    success: id.data ? "Đã cập nhật phòng ban." : "Đã thêm phòng ban.",
  };
}

export async function deleteDepartment(formData: FormData) {
  const parsed = z.object({ id: z.uuid("Phòng ban không hợp lệ") })
    .safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) return { error: "Thông tin phòng ban không hợp lệ." };

  const { supabase } = await requireAdmin();
  const [{ count: assetCount, error: assetCountError }, { count: scopeCount, error: scopeCountError }] = await Promise.all([
    supabase
      .from("assets")
      .select("id", { count: "exact", head: true })
      .eq("department_id", parsed.data.id),
    supabase
      .from("data_access_scopes")
      .select("id", { count: "exact", head: true })
      .eq("department_id", parsed.data.id),
  ]);
  if (assetCountError || scopeCountError) {
    return { error: "Không thể kiểm tra dữ liệu đang liên kết với phòng ban." };
  }
  if ((assetCount ?? 0) > 0 || (scopeCount ?? 0) > 0) {
    const details = [
      assetCount ? `${assetCount} thiết bị` : "",
      scopeCount ? `${scopeCount} phạm vi người dùng` : "",
    ].filter(Boolean).join(" và ");
    return {
      error: `Không thể xóa phòng ban vì đang được sử dụng bởi ${details}. Hãy chuyển dữ liệu trước.`,
    };
  }

  const { error } = await supabase
    .from("departments")
    .delete()
    .eq("id", parsed.data.id);
  if (error?.code === "23503") {
    return { error: "Phòng ban vẫn còn dữ liệu liên kết nên chưa thể xóa." };
  }
  if (error) return { error: "Không thể xóa phòng ban." };

  revalidateSettingsConsumers();
  return { success: "Đã xóa phòng ban." };
}
