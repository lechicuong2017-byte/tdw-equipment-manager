import { SurveyBuilder } from "@/components/survey-builder";
import { can, requireModuleAccess } from "@/lib/auth";
export const metadata = { title: "Tạo khảo sát" };
export default async function NewSurveyPage() {
  const { access } = await requireModuleAccess("surveys");
  if (!can(access, "surveys.manage")) return <p>Bạn chưa được cấp quyền tạo khảo sát.</p>;
  return <SurveyBuilder/>;
}
