import "server-only";
// Thay service_role: client bỏ qua RLS, chỉ dùng phía server cho tác vụ quản trị/hệ thống.
export { createServiceDb as createAdminClient } from "@/lib/db/client";
