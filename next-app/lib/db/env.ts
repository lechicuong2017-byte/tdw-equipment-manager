// Không import "server-only" để proxy.ts dùng được.
export function hasDatabaseEnv() {
  return Boolean(process.env.DATABASE_URL?.trim() || (process.env.DB_HOST?.trim() && process.env.DB_NAME?.trim()));
}
