import { redirect } from "next/navigation";

// Luồng cũ (token trong URL hash của Supabase) không còn dùng:
// liên kết email giờ đi qua /auth/confirm rồi tới /set-password.
export default function AuthSetPasswordPage() {
  redirect("/set-password");
}
