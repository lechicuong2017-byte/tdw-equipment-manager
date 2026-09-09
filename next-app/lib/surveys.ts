import { z } from "zod";

export const questionTypes = { short: "Trả lời ngắn", long: "Đoạn văn", single: "Chọn một đáp án", multiple: "Chọn nhiều đáp án" } as const;
export const questionSchema = z.object({
  id: z.uuid(), title: z.string().trim().min(1, "Nhập nội dung câu hỏi.").max(1000),
  type: z.enum(["short", "long", "single", "multiple"]), required: z.boolean(),
  options: z.array(z.string().trim().min(1).max(300)).max(20),
}).superRefine((q, ctx) => {
  if (["single", "multiple"].includes(q.type)) {
    if (q.options.length < 2 || new Set(q.options).size !== q.options.length) ctx.addIssue({ code: "custom", message: "Câu lựa chọn cần 2–20 đáp án không trùng nhau." });
  } else if (q.options.length) ctx.addIssue({ code: "custom", message: "Loại câu hỏi này không có danh sách đáp án." });
});
export const surveySchema = z.object({ title: z.string().trim().min(1, "Nhập tên khảo sát.").max(200), description: z.string().max(3000), questions: z.array(questionSchema).max(100) })
  .refine((v) => new Set(v.questions.map((q) => q.id)).size === v.questions.length, "Mã câu hỏi bị trùng.");
export const identitySchema = z.object({
  full_name: z.string().trim().min(2, "Vui lòng nhập họ tên.").max(120),
  phone: z.string().trim().regex(/^(\+?\d{8,15})?$/, "Số điện thoại cần 8–15 chữ số."),
  email: z.union([z.literal(""), z.email("Email chưa hợp lệ.").max(254)]),
}).refine((v) => v.phone || v.email, "Vui lòng nhập số điện thoại hoặc email.");
export type Question = z.infer<typeof questionSchema>;
export type SurveyInput = z.infer<typeof surveySchema>;
export type Identity = z.infer<typeof identitySchema>;
export type Answers = Record<string, string | string[] | number>;
export type Survey = SurveyInput & { id: string; public_token: string; status: "draft" | "open" | "closed"; revision: number; published_at: string | null; response_count: number; created_at: string };
export type SurveyResponse = Identity & { id: string; answers: Answers; submitted_at: string };
export const surveyStatuses = { draft: "Bản nháp", open: "Đang nhận phản hồi", closed: "Đã đóng" };
export const answerText = (value: Answers[string] | undefined) => Array.isArray(value) ? value.join("; ") : value === undefined ? "" : String(value);
export function surveyError(message: string) {
  if (message.includes("SURVEY_STALE")) return "Khảo sát đã được thay đổi. Hãy tải lại trang trước khi sửa tiếp.";
  if (message.includes("SURVEY_QUESTIONS_LOCKED")) return "Khảo sát đã được mở, không thể thay đổi câu hỏi.";
  if (message.includes("SURVEY_NO_QUESTIONS")) return "Cần ít nhất một câu hỏi trước khi mở khảo sát.";
  if (message.includes("SURVEY_UNAVAILABLE")) return "Khảo sát đã đóng hoặc không còn khả dụng.";
  if (message.includes("SURVEY_BUSY")) return "Khảo sát đang nhận nhiều phản hồi hoặc đã đạt giới hạn. Vui lòng thử lại sau hoặc liên hệ người quản lý.";
  if (/SURVEY_(INVALID|REQUIRED)/.test(message)) return "Vui lòng kiểm tra thông tin và trả lời đủ các câu bắt buộc.";
  return "Chưa thực hiện được thao tác. Vui lòng thử lại; dữ liệu đang nhập vẫn được giữ lại.";
}
