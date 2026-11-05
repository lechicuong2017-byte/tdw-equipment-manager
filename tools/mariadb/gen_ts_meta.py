#!/usr/bin/env python3
"""Sinh next-app/lib/db/generated/meta.ts từ schema PostgreSQL (đã áp migration Supabase):
- Kiểu cột (để trả dữ liệu đúng định dạng như PostgREST: số, boolean, JSON, ngày)
- Khoá ngoại (để hỗ trợ select nhúng kiểu `departments(name)`)
- Chính sách RLS dịch sang mẫu SQL MariaDB; quyền được tính trong lib/db/policy-fragments.ts
"""
import json
import re
import subprocess
import sys

PG = "psql -h /tmp/pg -U postgres"


def q(sql):
    out = subprocess.run(PG.split() + ["-At", "-c", sql], capture_output=True, text=True, check=True).stdout.strip()
    return json.loads(out) if out else []


def kind(c):
    t = c["data_type"]
    if t == "uuid":
        return "uuid"
    if t in ("jsonb", "json", "ARRAY"):
        return "json"
    if t == "boolean":
        return "bool"
    if t in ("integer", "smallint"):
        return "int"
    if t == "bigint":
        return "bigint"
    if t == "numeric":
        return "num"
    if t == "date":
        return "date"
    if t.startswith("timestamp"):
        return "ts"
    return "text"


FN_CALL = re.compile(r"\b(auth\.uid|is_admin|is_active_user|has_permission|has_role_code|can_access_asset|asset_scope_matches|"
                     r"can_access_vehicle|vehicle_scope_matches|can_access_software_license|supply_request_scope_matches|"
                     r"can_create_for_department|can_access_toll_batch)\(")


def find_call_end(s, start):
    depth = 0
    for i in range(start, len(s)):
        if s[i] == "(":
            depth += 1
        elif s[i] == ")":
            depth -= 1
            if depth == 0:
                return i
    raise ValueError(s)


def split_args(s):
    args, depth, cur, quote = [], 0, "", False
    for ch in s:
        if ch == "'":
            quote = not quote
        if not quote:
            if ch == "(":
                depth += 1
            elif ch == ")":
                depth -= 1
            elif ch == "," and depth == 0:
                args.append(cur.strip())
                cur = ""
                continue
        cur += ch
    if cur.strip():
        args.append(cur.strip())
    return args


def ts_arg(arg, table):
    arg = re.sub(r"::text$", "", arg.strip())
    m = re.fullmatch(r"'(.*)'", arg)
    if m:
        return json.dumps(m.group(1))
    if re.fullmatch(r"\w+", arg):
        return json.dumps(f"`{table}`.`{arg}`")
    if re.fullmatch(r"\w+\.\w+", arg):
        a, b = arg.split(".")
        return json.dumps(f"`{a}`.`{b}`")
    raise ValueError(f"Đối số chưa hỗ trợ: {arg}")


CAMEL = {
    "auth.uid": "uid", "is_admin": "isAdmin", "is_active_user": "isActiveUser", "has_permission": "hasPermission",
    "has_role_code": "hasRoleCode", "can_access_asset": "canAccessAsset", "asset_scope_matches": "assetScopeMatches",
    "can_access_vehicle": "canAccessVehicle", "vehicle_scope_matches": "vehicleScopeMatches",
    "can_access_software_license": "canAccessSoftwareLicense", "supply_request_scope_matches": "supplyRequestScopeMatches",
    "can_create_for_department": "canCreateForDepartment", "can_access_toll_batch": "canAccessTollBatch",
}


def translate(expr, table):
    """Biểu thức PG -> template literal TS (chuỗi SQL MariaDB với ${f.xxx(...)})."""
    out, i = "", 0
    while True:
        m = FN_CALL.search(expr, i)
        if not m:
            out += plain(expr[i:])
            break
        out += plain(expr[i:m.start()])
        open_idx = m.end() - 1
        end = find_call_end(expr, open_idx)
        args = split_args(expr[open_idx + 1:end])
        name = CAMEL[m.group(1)]
        if name == "uid":
            out += "${f.uid()}"
        else:
            out += "${f." + name + "(" + ", ".join(ts_arg(a, table) for a in args) + ")}"
        i = end + 1
    return out


def plain(s):
    s = re.sub(r"\('(-?\d+)'::bigint\)::numeric", r"\1", s)
    s = re.sub(r"\((\d+)\)::numeric", r"\1", s)
    s = re.sub(r"::(text|numeric|bigint|integer|date|uuid)(\[\])?", "", s)
    s = re.sub(r"(\w+(?:\.\w+)?) = ANY \(ARRAY\[([^\]]*)\]\)", r"\1 IN (\2)", s)
    s = s.replace("`", "\\`").replace("${", "\\${")
    if re.search(r"::|ARRAY|jsonb|->>", s):
        raise ValueError(f"Chưa dịch được: {s}")
    return s


def main():
    cols = q("""select coalesce(json_agg(c order by table_name, ordinal_position),'[]') from (
      select table_name, column_name, data_type, ordinal_position from information_schema.columns where table_schema='public') c""")
    fks = q("""select coalesce(json_agg(x),'[]') from (
      select cl.relname as t, rf.relname as rt,
        (select json_agg(a.attname order by k.o) from unnest(co.conkey) with ordinality k(n,o) join pg_attribute a on a.attrelid=co.conrelid and a.attnum=k.n) as c,
        (select json_agg(a.attname order by k.o) from unnest(co.confkey) with ordinality k(n,o) join pg_attribute a on a.attrelid=co.confrelid and a.attnum=k.n) as rc
      from pg_constraint co join pg_class cl on cl.oid=co.conrelid join pg_class rf on rf.oid=co.confrelid
      join pg_namespace n on n.oid=cl.relnamespace join pg_namespace rn on rn.oid=rf.relnamespace
      where co.contype='f' and n.nspname='public' and rn.nspname='public') x""")
    pols = q("""select coalesce(json_agg(p order by tablename, cmd, policyname),'[]') from (
      select tablename, cmd, policyname, qual, with_check from pg_policies where schemaname='public') p""")
    rls = [r["relname"] for r in q("""select coalesce(json_agg(json_build_object('relname', c.relname)),'[]') from pg_class c
      join pg_namespace n on n.oid=c.relnamespace where nspname='public' and relkind='r' and relrowsecurity""")]
    pks = q("""select coalesce(json_agg(x),'[]') from (select cl.relname as t,
        (select json_agg(a.attname order by k.o) from unnest(co.conkey) with ordinality k(n,o) join pg_attribute a on a.attrelid=co.conrelid and a.attnum=k.n) as c
      from pg_constraint co join pg_class cl on cl.oid=co.conrelid join pg_namespace n on n.oid=cl.relnamespace
      where co.contype='p' and n.nspname='public') x""")

    uid_defaults = q("""select coalesce(json_agg(json_build_object('t', table_name, 'c', column_name)),'[]')
      from information_schema.columns where table_schema='public' and column_default='auth.uid()'""")
    tables = {}
    for c in cols:
        tables.setdefault(c["table_name"], {})[c["column_name"]] = kind(c)

    lines = ["// Sinh tự động bởi tools/mariadb/gen_ts_meta.py — KHÔNG sửa tay.",
             "/* eslint-disable */",
             'import type { PolicyFragments } from "@/lib/db/policy-fragments";',
             "",
             "export type ColumnKind = \"uuid\" | \"json\" | \"bool\" | \"int\" | \"bigint\" | \"num\" | \"date\" | \"ts\" | \"text\";",
             "",
             "export const TABLE_COLUMNS: Record<string, Record<string, ColumnKind>> = " + json.dumps(tables, indent=2, ensure_ascii=False) + ";",
             "",
             "export const PRIMARY_KEYS: Record<string, string[]> = " + json.dumps({p["t"]: p["c"] for p in pks}, indent=2) + ";",
             "",
             "export type ForeignKey = { table: string; columns: string[]; refTable: string; refColumns: string[] };",
             "export const FOREIGN_KEYS: ForeignKey[] = " + json.dumps([{"table": f["t"], "columns": f["c"], "refTable": f["rt"], "refColumns": f["rc"]} for f in fks], indent=2) + ";",
             "",
             "/** Cột có DEFAULT auth.uid() trong PostgreSQL: builder tự gán người dùng hiện tại */",
             "export const CURRENT_USER_DEFAULTS: Record<string, string[]> = " + json.dumps({k: [u["c"] for u in uid_defaults if u["t"] == k] for k in sorted({u["t"] for u in uid_defaults})}, indent=2) + ";",
             "",
             "export const RLS_TABLES = new Set<string>(" + json.dumps(sorted(rls)) + ");",
             "",
             "type Rule = (f: PolicyFragments) => string;",
             "export type TablePolicies = { select: Rule[]; insert: Rule[]; update: { using: Rule; check: Rule }[]; delete: Rule[] };",
             "export const POLICIES: Record<string, TablePolicies> = {"]
    by_table = {}
    for p in pols:
        by_table.setdefault(p["tablename"], {"select": [], "insert": [], "update": [], "delete": []})
        t = p["tablename"]
        cmd = p["cmd"].lower()
        using = translate(p["qual"], t) if p["qual"] else "1"
        check = translate(p["with_check"], t) if p["with_check"] else using
        targets = ["select", "insert", "update", "delete"] if cmd == "all" else [cmd]
        for target in targets:
            if target == "select" or target == "delete":
                by_table[t][target].append(f"(f) => `{using}`")
            elif target == "insert":
                by_table[t][target].append(f"(f) => `{check}`")
            else:
                by_table[t][target].append(f"{{ using: (f) => `{using}`, check: (f) => `{check}` }}")
    for t in sorted(by_table):
        v = by_table[t]
        lines.append(f"  {json.dumps(t)}: {{")
        for k in ("select", "insert", "delete"):
            lines.append(f"    {k}: [" + ", ".join(v[k]) + "],")
        lines.append("    update: [" + ", ".join(v["update"]) + "],")
        lines.append("  },")
    lines.append("};")
    print("\n".join(lines))


if __name__ == "__main__":
    sys.exit(main())
