import { notFound } from "next/navigation";
import { z } from "zod";
import { SurveyBuilder } from "@/components/survey-builder";
import { can, requireModuleAccess } from "@/lib/auth";
import type { Survey } from "@/lib/surveys";
export const metadata = { title: "Chỉnh sửa khảo sát" };
export default async function EditSurveyPage({ params }: { params: Promise<{ id: string }> }) {
  const { access, supabase } = await requireModuleAccess("surveys");
  if (!can(access, "surveys.manage")) return <p>Bạn chưa có quyền sửa khảo sát.</p>;
  const { id } = await params; if (!z.uuid().safeParse(id).success) notFound();
  const { data, error } = await supabase.from("company_surveys").select("*").eq("id", id).maybeSingle();
  if (error) throw new Error("Chưa tải được khảo sát. Hãy thử lại.");
  if (!data) notFound();
  return <SurveyBuilder key={`${data.id}-${data.revision}`} survey={data as Survey}/>;
}
