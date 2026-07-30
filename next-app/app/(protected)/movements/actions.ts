"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { can, requireAccess } from "@/lib/auth";

const movementSchema = z.object({
  asset_id: z.uuid("Thiết bị không hợp lệ"),
  movement_date: z.iso.date("Ngày luân chuyển không hợp lệ"),
  to_user_name: z.string().trim().max(200),
  to_location: z.string().trim().max(200),
  reason: z.string().trim().max(1000),
  approved_by_name: z.string().trim().max(200),
  note: z.string().trim().max(3000),
}).refine(
  (data) => data.to_user_name.length > 0 || data.to_location.length > 0,
  { message: "Cần nhập người nhận hoặc vị trí mới" },
);

export type MovementFormState = {
  error?: string;
  success?: string;
};

export async function recordMovement(
  _previousState: MovementFormState,
  formData: FormData,
): Promise<MovementFormState> {
  const parsed = movementSchema.safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Dữ liệu chưa hợp lệ" };
  }

  const { supabase, access } = await requireAccess();
  if (!can(access, "movement.manage")) {
    return { error: "Bạn không có quyền ghi nhận luân chuyển." };
  }

  const { error } = await supabase.rpc("record_inventory_movement", {
    target_asset_id: parsed.data.asset_id,
    target_movement_date: parsed.data.movement_date,
    target_to_user_name: parsed.data.to_user_name,
    target_to_location: parsed.data.to_location,
    target_reason: parsed.data.reason,
    target_approved_by_name: parsed.data.approved_by_name,
    target_note: parsed.data.note,
  });

  if (error) {
    return { error: "Không thể ghi nhận luân chuyển. Hãy kiểm tra quyền và dữ liệu." };
  }

  revalidatePath("/movements");
  revalidatePath("/assets");
  revalidatePath(`/assets/${parsed.data.asset_id}`);
  return { success: "Đã luân chuyển và cập nhật hồ sơ thiết bị." };
}
