import { z } from "zod";

export const phoneStatuses = { active: "Đang sử dụng", inactive: "Ngừng sử dụng", cancelled: "Đã hủy", unknown: "Chưa xác định" } as const;
export const cleanPhone = (s: string) => s.trim().replace(/[\s().-]/g, "");
const phone = z.string().transform(cleanPhone).pipe(z.string().regex(/^\+?\d{6,20}$/));
export const phoneSchema = z.object({
  phone, location: z.string().trim().max(300), serial: z.string().trim().max(100),
  replacement_phone: z.union([phone, z.literal("")]),
  status: z.enum(["active", "inactive", "cancelled", "unknown"]),
  note: z.string().max(2000),
});
export type PhoneInput = z.infer<typeof phoneSchema>;
export type PhoneRecord = PhoneInput & { id: string; updated_at: string };
export type PhonePreview = PhoneInput & { row: number; warning: string; error: string; saved?: boolean; duplicate?: boolean };
