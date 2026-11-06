"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireAccess } from "@/lib/auth";
import { toggleSetting } from "@/app/(protected)/admin/settings/actions";

type ToggleResult = { error?: string; success?: string };

export async function toggleEquipmentSetting(formData: FormData): Promise<ToggleResult> {
  const parsed = z.object({
    id: z.uuid(),
    active: z.enum(["true", "false"]),
  }).safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) return { error: "Mục cấu hình không hợp lệ." };

  const { access } = await requireAccess();
  if (!access.roles.includes("admin")) {
    return { error: "Chỉ quản trị viên được thay đổi cấu hình." };
  }

  await toggleSetting(formData);
  return {
    success: parsed.data.active === "true"
      ? "Đã bật lại mục cấu hình."
      : "Đã ngừng dùng mục cấu hình. Dữ liệu cũ vẫn được giữ nguyên.",
  };
}

/**
 * Registers a value already stored on assets (legacy import) as a catalog entry,
 * keeping the stored value as the internal code so existing assets match it.
 * Renaming it afterwards goes through admin_update_setting, which migrates the assets.
 */
export async function adoptOrphanValue(formData: FormData) {
  const parsed = z.object({
    setting_type: z.enum(["asset_group", "asset_type", "status"]),
    value: z.string().trim().min(1).max(160),
  }).safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) return;

  const { supabase, access } = await requireAccess();
  if (!access.roles.includes("admin")) return;

  const { data: existing } = await supabase
    .from("settings")
    .select("id")
    .eq("setting_type", parsed.data.setting_type)
    .eq("setting_value", parsed.data.value)
    .maybeSingle();
  if (!existing) {
    const { data: last } = await supabase
      .from("settings")
      .select("sort_order")
      .eq("setting_type", parsed.data.setting_type)
      .order("sort_order", { ascending: false })
      .limit(1)
      .maybeSingle();
    await supabase.from("settings").insert({
      setting_type: parsed.data.setting_type,
      setting_value: parsed.data.value,
      display_name: parsed.data.value,
      sort_order: Number(last?.sort_order || 0) + 10,
      active: true,
    });
  }
  revalidatePath("/assets/settings");
  revalidatePath("/admin/settings");
  revalidatePath("/assets");
  revalidatePath("/assets/new");
}
