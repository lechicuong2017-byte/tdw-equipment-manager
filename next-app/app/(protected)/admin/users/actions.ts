"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { requireAccess } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";

const modules = ["assets", "maintenance", "movement", "software"] as const;
const scopeTypes = ["none", "all", "department", "assigned", "owned"] as const;

function requireAdmin(roles: string[]) {
  if (!roles.includes("admin")) {
    redirect("/dashboard");
  }
}

export async function inviteUser(formData: FormData) {
  const { access } = await requireAccess();
  requireAdmin(access.roles);

  const parsed = z.object({
    email: z.email().transform((value) => value.trim().toLowerCase()),
    full_name: z.string().trim().min(1).max(160),
  }).safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) {
    redirect("/admin/users?error=Thông tin mời chưa hợp lệ");
  }

  const appUrl = String(process.env.NEXT_PUBLIC_APP_URL || "").replace(/\/$/, "");
  if (!appUrl) {
    redirect("/admin/users?error=NEXT_PUBLIC_APP_URL chưa được cấu hình");
  }

  let adminClient;
  try {
    adminClient = createAdminClient();
  } catch {
    redirect("/admin/users?error=Server chưa có service role key");
  }

  const { error } = await adminClient.auth.admin.inviteUserByEmail(
    parsed.data.email,
    {
      data: { full_name: parsed.data.full_name },
      redirectTo: `${appUrl}/set-password`,
    },
  );
  if (error) {
    redirect(`/admin/users?error=${encodeURIComponent("Không thể gửi lời mời: " + error.message)}`);
  }

  revalidatePath("/admin/users");
  redirect("/admin/users?ok=Đã gửi lời mời");
}

export async function updateUserAccess(formData: FormData) {
  const { supabase, access } = await requireAccess();
  requireAdmin(access.roles);

  const base = z.object({
    user_id: z.uuid(),
    role_code: z.enum(["admin", "manager", "user", "viewer"]),
    active: z.string().optional(),
    must_enroll_mfa: z.string().optional(),
  }).safeParse(Object.fromEntries(formData.entries()));
  if (!base.success) {
    redirect("/admin/users?error=Cấu hình quyền chưa hợp lệ");
  }

  const scopes: Array<{
    module: (typeof modules)[number];
    scope_type: Exclude<(typeof scopeTypes)[number], "none">;
    department_id: string | null;
  }> = [];

  for (const module of modules) {
    const scope = z.enum(scopeTypes).safeParse(formData.get(`scope_${module}`));
    if (!scope.success || scope.data === "none") continue;

    const rawDepartment = String(
      formData.get(`department_${module}`) || "",
    ).trim();
    const departmentId =
      scope.data === "department" && z.uuid().safeParse(rawDepartment).success
        ? rawDepartment
        : null;
    if (scope.data === "department" && !departmentId) {
      redirect(`/admin/users?error=${encodeURIComponent(`Hãy chọn phòng ban cho ${module}`)}`);
    }
    scopes.push({
      module,
      scope_type: scope.data,
      department_id: departmentId,
    });
  }

  const { error } = await supabase.rpc("admin_set_user_access", {
    target_user_id: base.data.user_id,
    target_role_code: base.data.role_code,
    target_active: base.data.active === "on",
    target_must_enroll_mfa:
      base.data.role_code === "admin" || base.data.must_enroll_mfa === "on",
    target_scopes: scopes,
  });
  if (error) {
    redirect(`/admin/users?error=${encodeURIComponent("Không thể cập nhật quyền: " + error.message)}`);
  }

  revalidatePath("/admin/users");
  revalidatePath("/dashboard");
  redirect("/admin/users?ok=Đã cập nhật quyền");
}
