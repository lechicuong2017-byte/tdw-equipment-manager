#!/usr/bin/env python3
"""Sinh schema MariaDB từ schema PostgreSQL (đã áp đủ migration Supabase).

Cách dùng:
  python3 tools/mariadb/pg_to_mariadb.py --pg "psql -h /tmp/pg -U postgres" > tools/mariadb/schema.sql

Quy tắc chuyển đổi:
- uuid -> CHAR(36) (ascii), mặc định (UUID())
- text -> VARCHAR(255) nếu cột nằm trong khoá/chỉ mục, ngược lại TEXT
- jsonb / mảng -> JSON
- timestamptz -> DATETIME(6) (lưu giờ UTC), now() -> CURRENT_TIMESTAMP(6)
- numeric(p,s) -> DECIMAL(p,s); numeric không khai báo -> DECIMAL(20,4)
- Chỉ mục duy nhất có điều kiện (WHERE deleted_at IS NULL ...) -> cột sinh ảo + UNIQUE
- Chỉ mục thường có điều kiện / GIN trigram -> chỉ mục B-tree thường (bỏ điều kiện)
- CHECK được dịch các mẫu đơn giản; mẫu không dịch được ghi chú lại để kiểm tra trong code.
- RLS, trigger, hàm PL/pgSQL KHÔNG chuyển ở đây: được viết lại trong tầng ứng dụng.
"""
import argparse
import json
import re
import subprocess
import sys

TEXT_INDEXED_LEN = 255


def q(pg, sql):
    out = subprocess.run(pg.split() + ["-At", "-c", sql], capture_output=True, text=True, check=True).stdout.strip()
    return json.loads(out) if out else []


def ident(name):
    return f"`{name}`"


def split_top(s, sep=","):
    parts, depth, cur, quote = [], 0, "", False
    for ch in s:
        if ch == "'":
            quote = not quote
        if not quote:
            if ch == "(":
                depth += 1
            elif ch == ")":
                depth -= 1
            elif ch == sep and depth == 0:
                parts.append(cur.strip())
                cur = ""
                continue
        cur += ch
    if cur.strip():
        parts.append(cur.strip())
    return parts


def pg_expr_to_maria(expr):
    """Dịch biểu thức PG đơn giản sang MariaDB. Trả None nếu không chắc chắn."""
    e = expr
    e = re.sub(r"\(\('?(-?\d+)'?\)::(numeric|bigint|integer)\)", r"\1", e)
    e = re.sub(r"\('(-?\d+)'::bigint\)::numeric", r"\1", e)
    e = re.sub(r"\((\d+)\)::numeric", r"\1", e)
    e = re.sub(r"::(text|numeric|bigint|integer|character varying|date|uuid)(\[\])?", "", e)

    def any_array(m):
        return f"{m.group(1)} IN ({m.group(2)})"

    e = re.sub(r"(\w+) = ANY \(ARRAY\[([^\]]*)\]\)", any_array, e)
    e = re.sub(r"(\w+) ~ ('(?:[^']|'')*')", r"\1 REGEXP \2", e)
    e = re.sub(r"\blength\(", "CHAR_LENGTH(", e)
    e = re.sub(r"\bbtrim\(", "TRIM(", e)
    e = re.sub(r"TRIM\(BOTH FROM ([^)]*)\)", r"TRIM(\1)", e)
    e = re.sub(r"(\w+) IS DISTINCT FROM (\w+)", r"NOT (\1 <=> \2)", e)
    e = re.sub(r"num_nonnulls\(([^)]*)\)",
               lambda m: "(" + " + ".join(f"({x.strip()} IS NOT NULL)" for x in m.group(1).split(",")) + ")", e)
    # MariaDB coi dấu \ trong chuỗi là ký tự thoát: nhân đôi để giữ nguyên regex.
    e = re.sub(r"'(?:[^']|'')*'", lambda m: m.group(0).replace("\\", "\\\\"), e)
    if re.search(r"date_trunc|::|ARRAY|\bjsonb|immutable_|~\*|regexp_replace\(.*'g'", e):
        return None
    return e


def map_type(col, indexed):
    t, udt = col["data_type"], col["udt_name"]
    if t == "uuid":
        return "VARCHAR(36)"
    if t == "text" or t == "character varying":
        return f"VARCHAR({TEXT_INDEXED_LEN})" if indexed else "TEXT"
    if t in ("jsonb", "json", "ARRAY"):
        return "JSON"
    if t == "timestamp with time zone" or t == "timestamp without time zone":
        return "DATETIME(6)"
    if t == "date":
        return "DATE"
    if t == "boolean":
        return "BOOLEAN"
    if t == "integer":
        return "INT"
    if t == "smallint":
        return "SMALLINT"
    if t == "bigint":
        return "BIGINT"
    if t == "numeric":
        if col["numeric_precision"]:
            return f"DECIMAL({col['numeric_precision']},{col['numeric_scale'] or 0})"
        return "DECIMAL(20,4)"
    raise ValueError(f"Chưa hỗ trợ kiểu {t}/{udt} ({col['table_name']}.{col['column_name']})")


def map_default(col, mtype):
    d = col["column_default"]
    if d is None:
        return None
    if d == "gen_random_uuid()":
        return "(UUID())"
    if d in ("now()", "CURRENT_TIMESTAMP"):
        return "CURRENT_TIMESTAMP(6)"
    if d == "CURRENT_DATE":
        return "(CURRENT_DATE)"
    if "Asia/Ho_Chi_Minh" in d:
        # Máy chủ lưu UTC: ngày theo giờ VN = UTC + 7h
        return "(CAST(UTC_TIMESTAMP() + INTERVAL 7 HOUR AS DATE))"
    if d == "auth.uid()":
        return None  # ứng dụng tự gán user hiện tại
    if d in ("true", "false"):
        return "TRUE" if d == "true" else "FALSE"
    m = re.fullmatch(r"'(.*)'::jsonb", d)
    if m:
        return f"('{m.group(1)}')"
    m = re.fullmatch(r"'(.*)'::text", d)
    if m:
        return f"('{m.group(1)}')" if mtype == "TEXT" else f"'{m.group(1)}'"
    if re.fullmatch(r"-?\d+(\.\d+)?", d):
        return d
    if d.startswith("nextval("):
        return None
    raise ValueError(f"Chưa hỗ trợ default {d} ({col['table_name']}.{col['column_name']})")


def generated_expr(table, column, expr):
    if table == "assets" and column == "total_price":
        return "(`quantity` * `unit_price`)"
    if table == "supply_request_lines" and column == "amount":
        return "(`ordered_quantity` * `approved_unit_price`)"
    if table == "assets" and column == "search_text":
        cols = ["asset_code", "asset_name", "serial_number", "asset_type", "asset_group_label", "brand",
                "model", "assigned_to_name", "department_legacy_name", "location"]
        # Đối chiếu không dấu do collation utf8mb4_unicode_ci; đ/Đ thay thủ công.
        inner = "CONCAT_WS(' ', " + ", ".join(f"COALESCE(`{c}`, '')" for c in cols) + ")"
        return f"(REPLACE(REPLACE(LOWER({inner}), 'đ', 'd'), 'Đ', 'd'))"
    raise ValueError(f"Chưa hỗ trợ cột sinh {table}.{column}: {expr}")


def index_expr_to_column(expr):
    """Biểu thức trong chỉ mục -> biểu thức MariaDB dùng cho cột sinh."""
    e = expr.strip()
    m = re.fullmatch(r"(lower|upper)\((\w+)\)", e)
    if m:
        return f"{m.group(1).upper()}(`{m.group(2)}`)"
    if re.fullmatch(r"\w+", e):
        return f"`{e}`"
    m = re.fullmatch(r"regexp_replace\(upper\((\w+)\), '\[\^A-Z0-9\]'::text, ''::text, 'g'::text\)", e)
    if m:
        return f"REGEXP_REPLACE(UPPER(`{m.group(1)}`), '[^A-Z0-9]', '')"
    m = re.fullmatch(r"lower\(regexp_replace\((?:TRIM\(BOTH FROM |btrim\()(\w+)\), '\\\\s\+'::text, ' '::text, 'g'::text\)\)", e)
    if m:
        return f"LOWER(REGEXP_REPLACE(TRIM(`{m.group(1)}`), '\\\\s+', ' '))"
    m = re.fullmatch(r"lower\(regexp_replace\(TRIM\(BOTH FROM (\w+)\), '\\\\s\+'::text, ' '::text, 'g'::text\)\)", e)
    if m:
        return f"LOWER(REGEXP_REPLACE(TRIM(`{m.group(1)}`), '\\\\s+', ' '))"
    return None


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--pg", default="psql -h /tmp/pg -U postgres")
    args = ap.parse_args()
    pg = args.pg

    tables = [r["t"] for r in q(pg, """select coalesce(json_agg(json_build_object('t', table_name) order by table_name),'[]')
        from information_schema.tables where table_schema='public' and table_type='BASE TABLE'""")]
    cols = q(pg, """select coalesce(json_agg(c order by table_name, ordinal_position),'[]') from (
        select table_name, column_name, data_type, udt_name, is_nullable, column_default, numeric_precision,
               numeric_scale, is_generated, generation_expression, is_identity, ordinal_position
        from information_schema.columns where table_schema='public') c""")
    cons = q(pg, """select coalesce(json_agg(x),'[]') from (
        select cl.relname as table_name, co.conname, co.contype, pg_get_constraintdef(co.oid) as def,
          (select json_agg(a.attname order by k.ord) from unnest(co.conkey) with ordinality k(n, ord)
             join pg_attribute a on a.attrelid=co.conrelid and a.attnum=k.n) as cols
        from pg_constraint co join pg_class cl on cl.oid=co.conrelid join pg_namespace n on n.oid=cl.relnamespace
        where n.nspname='public' and cl.relkind='r') x""")
    idxs = q(pg, """select coalesce(json_agg(x),'[]') from (
        select c.relname as table_name, i.relname as index_name, ix.indisunique as uniq,
               pg_get_indexdef(ix.indexrelid) as def, pg_get_expr(ix.indpred, ix.indrelid) as pred
        from pg_index ix join pg_class i on i.oid=ix.indexrelid join pg_class c on c.oid=ix.indrelid
        join pg_namespace n on n.oid=c.relnamespace
        where n.nspname='public' and not ix.indisprimary
          and not exists (select 1 from pg_constraint co where co.conindid=ix.indexrelid)) x""")

    by_table = {t: [] for t in tables}
    for c in cols:
        if c["table_name"] in by_table:
            by_table[c["table_name"]].append(c)

    # Cột cần VARCHAR vì nằm trong khoá / chỉ mục / FK
    indexed = set()
    for co in cons:
        if co["contype"] in ("p", "u", "f") and co["cols"]:
            for c in co["cols"]:
                indexed.add((co["table_name"], c))
        if co["contype"] == "f":
            m = re.search(r"REFERENCES (?:(\w+)\.)?(\w+)\(([^)]*)\)", co["def"])
            for c in m.group(3).split(","):
                indexed.add((m.group(2), c.strip()))
    for ix in idxs:
        body = re.search(r"USING \w+ \((.*)\)$", ix["def"].split(" WHERE ")[0]).group(1)
        for w in re.findall(r"[a-z_]+", body):
            indexed.add((ix["table_name"], w))
    # Cột text ngắn hay được lọc/sắp xếp: giữ VARCHAR cho chỉ mục hoạt động.
    text_cols = {(c["table_name"], c["column_name"]) for c in cols if c["data_type"] == "text"}

    out = ["-- Schema MariaDB sinh tự động từ migration Supabase. KHÔNG sửa tay: chạy lại pg_to_mariadb.py.",
           "SET NAMES utf8mb4;", "SET FOREIGN_KEY_CHECKS = 0;", ""]
    notes = []
    fks = []

    for t in tables:
        lines = []
        for c in by_table[t]:
            key = (t, c["column_name"])
            mtype = map_type(c, key in indexed)
            if c["is_generated"] == "ALWAYS":
                g = generated_expr(t, c["column_name"], c["generation_expression"])
                if c["column_name"] == "search_text":
                    mtype = "VARCHAR(2000)"
                lines.append(f"  {ident(c['column_name'])} {mtype} AS {g} STORED")
                continue
            parts = [ident(c["column_name"]), mtype]
            if c["is_identity"] == "YES" or (c["column_default"] or "").startswith("nextval("):
                parts.append("NOT NULL AUTO_INCREMENT")
            else:
                parts.append("NULL" if c["is_nullable"] == "YES" else "NOT NULL")
                d = map_default(c, mtype)
                if d is not None:
                    parts.append(f"DEFAULT {d}")
            lines.append("  " + " ".join(parts))

        for co in [x for x in cons if x["table_name"] == t]:
            name = co["conname"][:64]
            if co["contype"] == "p":
                lines.append(f"  PRIMARY KEY ({', '.join(ident(c) for c in co['cols'])})")
            elif co["contype"] == "u":
                lines.append(f"  UNIQUE KEY {ident(name)} ({', '.join(ident(c) for c in co['cols'])})")
            elif co["contype"] == "c":
                body = re.fullmatch(r"CHECK \((.*)\)( NOT VALID)?", co["def"]).group(1)
                m = pg_expr_to_maria(body)
                if m is None:
                    notes.append(f"-- [CHECK chưa chuyển] {t}.{co['conname']}: {co['def']}")
                else:
                    lines.append(f"  CONSTRAINT {ident(name)} CHECK ({m})")
            elif co["contype"] == "f":
                m = re.search(r"FOREIGN KEY \(([^)]*)\) REFERENCES ((?:auth\.)?\w+)\(([^)]*)\)(.*)", co["def"].replace("public.", ""))
                if not m:
                    notes.append(f"-- [FK chưa chuyển] {t}.{co['conname']}: {co['def']}")
                    continue
                tail = m.group(4)
                ref = "auth_users" if m.group(2) == "auth.users" else m.group(2)
                actions = " ".join(re.findall(r"ON (?:DELETE|UPDATE) (?:CASCADE|SET NULL|RESTRICT|NO ACTION)", tail))
                fks.append(f"ALTER TABLE {ident(t)} ADD CONSTRAINT {ident(name)} FOREIGN KEY ({', '.join(ident(x.strip()) for x in m.group(1).split(','))}) "
                           f"REFERENCES {ident(ref)} ({', '.join(ident(x.strip()) for x in m.group(3).split(','))}) {actions};")

        gen_n = 0
        for ix in [x for x in idxs if x["table_name"] == t]:
            body = re.search(r"USING (\w+) \((.*)\)$", ix["def"].split(" WHERE ")[0])
            method, colspec = body.group(1), body.group(2)
            items = split_top(colspec)
            pred = ix["pred"]
            name = ix["index_name"][:64]
            if method == "gin":
                # tìm kiếm trigram -> MariaDB dùng LIKE trên search_text; bỏ chỉ mục GIN
                notes.append(f"-- [GIN bỏ qua] {t}.{ix['index_name']}: dùng LIKE/collation không dấu")
                continue
            if not ix["uniq"]:
                simple = []
                for it in items:
                    w = re.sub(r"\s+(DESC|ASC)(\s+NULLS (FIRST|LAST))?$", "", it)
                    if re.fullmatch(r"\w+", w):
                        simple.append(ident(w) + (" DESC" if " DESC" in it else ""))
                if simple:
                    lines.append(f"  KEY {ident(name)} ({', '.join(simple)})")
                continue
            # UNIQUE: điều kiện "x IS NOT NULL" tự đúng vì MariaDB cho nhiều NULL.
            exprs = []
            ok = True
            for it in items:
                ex = index_expr_to_column(it)
                if ex is None:
                    ok = False
                    break
                exprs.append(ex)
            if not ok:
                notes.append(f"-- [UNIQUE cần kiểm tra trong code] {ix['def']}")
                continue
            cond = None
            if pred:
                p = pred.strip()
                while p.startswith("(") and p.endswith(")") and len(split_top(p[1:-1], " ")) >= 1 and p.count("(") == p.count(")"):
                    inner = p[1:-1]
                    depth = 0; ok_outer = True
                    for ch in inner:
                        depth += ch == "("; depth -= ch == ")"
                        if depth < 0: ok_outer = False; break
                    if not ok_outer: break
                    p = inner
                conds = []
                for part in re.split(r"\) AND \(", p):
                    part = part.strip()
                    while part.startswith("(") and part.endswith(")") and part.count("(") == part.count(")"):
                        part = part[1:-1]
                    part = part.lstrip("(") if part.count("(") < part.count(")") + 0 and False else part
                    conds.append(part.strip("()") if part.count("(") != part.count(")") else part)
                kept = []
                for cnd in conds:
                    if re.fullmatch(r"\w+ IS NOT NULL", cnd) and any(cnd.split()[0] in e for e in exprs):
                        continue
                    m = pg_expr_to_maria(cnd)
                    if m is None:
                        ok = False
                    kept.append(m)
                if not ok:
                    notes.append(f"-- [UNIQUE cần kiểm tra trong code] {ix['def']}")
                    continue
                cond = " AND ".join(kept) if kept else None
            if cond is None and all(re.fullmatch(r"`\w+`", e) for e in exprs):
                lines.append(f"  UNIQUE KEY {ident(name)} ({', '.join(exprs)})")
                continue
            gcols = []
            for e in exprs:
                gen_n += 1
                gname = f"_u_{name}_{gen_n}"[:64]
                gexpr = f"IF({cond}, {e}, NULL)" if cond else e
                lines.append(f"  {ident(gname)} VARCHAR({TEXT_INDEXED_LEN}) AS ({gexpr}) VIRTUAL")
                gcols.append(ident(gname))
            lines.append(f"  UNIQUE KEY {ident(name)} ({', '.join(gcols)})")

        out.append(f"CREATE TABLE IF NOT EXISTS {ident(t)} (")
        out.append(",\n".join(lines))
        out.append(") ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;\n")

    out.append("-- Khoá ngoại")
    out.extend(fks)
    out.append("\nSET FOREIGN_KEY_CHECKS = 1;\n")
    out.append("-- Ghi chú chuyển đổi (cần xử lý ở tầng ứng dụng):")
    out.extend(notes)
    print("\n".join(out))


if __name__ == "__main__":
    sys.exit(main())
