import { createRoot } from "react-dom/client";
import { SurveyBuilder } from "@/components/survey-builder";
import { PublicSurvey } from "@/components/public-survey";
import { ActionToastProvider } from "@/components/action-toast";
const survey = {
  title: "Cùng xây dựng nơi làm việc tốt hơn", description: "Chúng tôi mong được lắng nghe trải nghiệm và ý kiến của bạn. Các phản hồi sẽ giúp công ty cải thiện môi trường làm việc.",
  questions: [
    { id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", title: "Bạn đang làm việc tại phòng ban nào?", type: "short" as const, required: true, options: [] },
    { id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb", title: "Bạn hài lòng với môi trường làm việc không?", type: "single" as const, required: true, options: ["Rất hài lòng", "Hài lòng", "Cần cải thiện"] },
    { id: "cccccccc-cccc-4ccc-8ccc-cccccccccccc", title: "Bạn muốn công ty cải thiện những nội dung nào?", type: "multiple" as const, required: true, options: ["Không gian làm việc", "Đào tạo", "Hoạt động nội bộ"] },
    { id: "dddddddd-dddd-4ddd-8ddd-dddddddddddd", title: "Chia sẻ đề xuất của bạn", type: "long" as const, required: false, options: [] },
  ],
};
createRoot(document.getElementById("root")!).render(window.location.search.includes("builder")
  ? <ActionToastProvider><main style={{ maxWidth: 1100, margin: "auto", padding: 24 }}><SurveyBuilder/></main></ActionToastProvider>
  : <main className="survey-public"><div className="survey-public-shell"><div className="survey-public-brand"><strong>TDW</strong><span>LẮNG NGHE & KẾT NỐI</span></div><PublicSurvey survey={survey} token="11111111-1111-4111-8111-111111111111"/></div></main>);
