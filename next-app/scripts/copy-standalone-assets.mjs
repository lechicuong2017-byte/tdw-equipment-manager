// Next.js "standalone" không tự chép public/ và .next/static — chép để "npm start" chạy đủ.
import { cpSync, existsSync } from "node:fs";
if (existsSync(".next/standalone")) {
  cpSync("public", ".next/standalone/public", { recursive: true });
  cpSync(".next/static", ".next/standalone/.next/static", { recursive: true });
  cpSync("db", ".next/standalone/db", { recursive: true });
  console.log("Standalone assets copied.");
}
