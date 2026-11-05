// Tiện ích SQL an toàn cho MariaDB.

const IDENT = /^[a-z_][a-z0-9_]*$/;

/** Tên bảng/cột: chỉ chấp nhận chữ thường, số, gạch dưới (chặn SQL injection qua tên cột). */
export function ident(name: string) {
  if (!IDENT.test(name)) throw new DbError(`Tên cột/bảng không hợp lệ: ${name}`, "42703");
  return `\`${name}\``;
}

export function escapeLiteral(value: string) {
  return `'${String(value).replace(/\\/g, "\\\\").replace(/'/g, "''").replace(/\0/g, "\\0")}'`;
}

/** Lỗi theo định dạng PostgREST để code cũ (error.code, error.message) vẫn chạy. */
export class DbError extends Error {
  code: string;
  details: string | null;
  hint: string | null;
  constructor(message: string, code = "XX000", details: string | null = null) {
    super(message);
    this.name = "DbError";
    this.code = code;
    this.details = details;
    this.hint = null;
  }
  toJSON() {
    return { message: this.message, code: this.code, details: this.details, hint: this.hint };
  }
}

/** Đổi lỗi MariaDB sang mã lỗi PostgreSQL mà code đang kiểm tra (23505, 23503, ...). */
export function mapMysqlError(error: unknown): DbError {
  if (error instanceof DbError) return error;
  const e = error as { errno?: number; code?: string; sqlMessage?: string; message?: string };
  const message = e.sqlMessage || e.message || "Lỗi cơ sở dữ liệu";
  switch (e.errno) {
    case 1062:
      return new DbError(`duplicate key value violates unique constraint: ${message}`, "23505");
    case 1451:
    case 1452:
      return new DbError(`violates foreign key constraint: ${message}`, "23503");
    case 4025:
    case 3819:
      return new DbError(`violates check constraint: ${message}`, "23514");
    case 1048:
    case 1364:
      return new DbError(`null value violates not-null constraint: ${message}`, "23502");
    case 1406:
      return new DbError(`value too long: ${message}`, "22001");
    case 1644: // SIGNAL
      return new DbError(message, "P0001");
    case 1213:
      return new DbError(message, "40P01");
    default:
      return new DbError(message, e.code || "XX000");
  }
}
