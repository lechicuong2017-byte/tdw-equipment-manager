import Image from "next/image";
import { z } from "zod";
import { createAnonymousClient } from "@/lib/supabase/anonymous";
import { PublicSurvey } from "@/components/public-survey";
import type { SurveyInput } from "@/lib/surveys";
export const dynamic = "force-dynamic";
export const metadata = { title: "Khảo sát nhân viên | TDW", robots: { index: false, follow: false } };

export default async function PublicSurveyPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const result = z.uuid().safeParse(token).success ? await createAnonymousClient().rpc("get_public_survey", { target_token: token }) : { data: null, error: null };
  return <main className="survey-public"><div className="survey-public-shell"><div className="survey-public-brand"><Image src="/tdw-logo.webp" width={126} height={46} alt="TDW — Better Service For Life"/><span>LẮNG NGHE & KẾT NỐI</span></div>{result.error ? <section className="survey-public-card survey-thanks"><h1>Chưa tải được khảo sát</h1><p>Vui lòng tải lại trang sau ít phút. Thông tin này không có nghĩa khảo sát đã đóng.</p></section> : result.data ? <PublicSurvey survey={result.data as SurveyInput} token={token}/> : <section className="survey-public-card survey-thanks"><h1>Khảo sát chưa mở hoặc đã kết thúc</h1><p>Vui lòng liên hệ người gửi để kiểm tra đường link và thời gian khảo sát.</p></section>}<footer className="survey-public-footer">TDW · Khảo sát nội bộ công ty</footer></div></main>;
}
