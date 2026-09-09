"use server";

import { revalidatePath } from "next/cache";
import { can, requireModuleAccess } from "@/lib/auth";
import { surveyError, surveySchema } from "@/lib/surveys";
import { z } from "zod";

export async function saveSurvey(input: unknown, id?: string, revision?: number) {
  const { access, supabase } = await requireModuleAccess("surveys");
  if (!can(access, "surveys.manage")) return { error: "Bạn chưa có quyền quản lý khảo sát." };
  const parsed = surveySchema.safeParse(input);
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  if (id && !z.uuid().safeParse(id).success) return { error: "Khảo sát không hợp lệ." };
  const { data, error } = await supabase.rpc("save_company_survey", { target_id: id || null, target_revision: revision || null, target_title: parsed.data.title, target_description: parsed.data.description, target_questions: parsed.data.questions });
  if (error) return { error: surveyError(error.message) };
  revalidatePath("/surveys");
  revalidatePath(`/surveys/${data}`);
  return { id: data as string };
}
export async function changeSurveyStatus(id: string, revision: number, status: "open" | "closed") {
  const { access, supabase } = await requireModuleAccess("surveys");
  if (!can(access, "surveys.manage")) return { error: "Bạn chưa có quyền quản lý khảo sát." };
  const { error } = await supabase.rpc("set_company_survey_status", { target_id: id, target_revision: revision, target_status: status });
  if (error) return { error: surveyError(error.message) };
  revalidatePath("/surveys"); revalidatePath(`/surveys/${id}`);
  return { success: status === "open" ? "Đã mở khảo sát. Bạn có thể chia sẻ link với nhân viên." : "Đã đóng nhận phản hồi." };
}
