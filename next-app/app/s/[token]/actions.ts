"use server";
import { z } from "zod";
import { createAnonymousClient } from "@/lib/supabase/anonymous";
import { identitySchema, surveyError } from "@/lib/surveys";

export async function submitSurvey(token: string, submission: string, identity: unknown, answers: unknown, website: string) {
  if (website || !z.uuid().safeParse(token).success || !z.uuid().safeParse(submission).success) return { error: "Yêu cầu không hợp lệ." };
  const parsed = identitySchema.safeParse(identity);
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  if (!answers || typeof answers !== "object" || Array.isArray(answers) || JSON.stringify(answers).length > 100000) return { error: "Câu trả lời quá dài hoặc không hợp lệ." };
  const { error } = await createAnonymousClient().rpc("submit_company_survey", { target_token: token, target_submission: submission, target_name: parsed.data.full_name, target_phone: parsed.data.phone, target_email: parsed.data.email, target_answers: answers });
  if (error) return { error: surveyError(error.message) };
  return { success: true };
}
