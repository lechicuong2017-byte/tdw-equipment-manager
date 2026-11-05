// Giữ đường dẫn import cũ: createClient() giờ trả về client MariaDB theo phiên đăng nhập.
export { createUserDb as createClient } from "@/lib/db/client";
