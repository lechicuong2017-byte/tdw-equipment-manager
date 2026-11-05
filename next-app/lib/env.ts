import { hasDatabaseEnv } from "@/lib/db/env";

/** Giữ tên cũ để các trang kiểm tra cấu hình không phải sửa */
export function hasSupabaseEnv() {
  return hasDatabaseEnv();
}

export { hasDatabaseEnv };
