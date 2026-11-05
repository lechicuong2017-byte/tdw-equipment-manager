import "server-only";
import { createHash } from "node:crypto";
import { clean, hasPermission, raise, tx, visible, type RpcContext, type RpcHandler, type Tx } from "@/lib/db/rpc/helpers";
import { getPool, query } from "@/lib/db/pool";

const opt = (v: unknown) => (v === null || v === undefined || v === "" ? null : String(v));
const lockName = (key: unknown) => `tdw_it_${createHash("sha1").update(String(key ?? "")).digest("hex").slice(0, 40)}`;

async function withLock<T>(t: Tx, name: string, fn: () => Promise<T>) {
  await t.one("SELECT GET_LOCK(?, 10) AS l", [name]);
  try {
    return await fn();
  } finally {
    await t.one("SELECT RELEASE_LOCK(?) AS l", [name]);
  }
}

async function linkDocument(t: Tx, documentId: string, column: "entry_id" | "service_id" | "period_id", id: string) {
  if (await t.one(`SELECT 1 AS x FROM it_document_links WHERE document_id = ? AND ${column} = ?`, [documentId, id])) return;
  await t.insert("it_document_links", { document_id: documentId, [column]: id });
}

async function filteredCosts(ctx: RpcContext, filter: Record<string, unknown> = {}) {
  if (!hasPermission(ctx, "it_costs.view")) return [];
  const f = (k: string) => String(filter?.[k] ?? "");
  const where: string[] = ["e.status = 'confirmed'"];
  const params: unknown[] = [];
  if (f("year")) { where.push("YEAR(e.recognized_on) = ?"); params.push(Number(f("year"))); }
  if (f("month")) { where.push("MONTH(e.recognized_on) = ?"); params.push(Number(f("month"))); }
  if (f("category")) { where.push("l.category_id = ?"); params.push(f("category")); }
  if (f("service")) { where.push("l.service_id = ?"); params.push(f("service")); }
  if (f("provider")) { where.push("e.provider LIKE ?"); params.push(`%${f("provider")}%`); }
  if (f("payment")) { where.push("e.payment_status = ?"); params.push(f("payment")); }
  if (f("q")) { where.push("CONCAT_WS(' ', e.description, l.description, s.name, s.identifier) LIKE ?"); params.push(`%${f("q")}%`); }
  const rows = await query<any>(
    getPool(),
    `SELECT l.id AS line_id, e.id AS entry_id, e.recognized_on, e.provider, e.payment_status, e.paid_on, l.category_id, c.name AS category_name,
       l.service_id, s.name AS service_name, l.description, l.amount_before_tax, l.tax_amount, l.amount_after_tax, e.version AS entry_version
     FROM ${visible(ctx, "it_cost_entry_lines")} l JOIN ${visible(ctx, "it_cost_entries")} e ON e.id = l.entry_id
     JOIN ${visible(ctx, "it_cost_categories")} c ON c.id = l.category_id LEFT JOIN ${visible(ctx, "it_services")} s ON s.id = l.service_id
     WHERE ${where.join(" AND ")}`,
    params,
  );
  return rows.map((r) => ({
    ...r,
    recognized_on: r.recognized_on ? String(r.recognized_on).slice(0, 10) : null,
    paid_on: r.paid_on ? String(r.paid_on).slice(0, 10) : null,
    amount_before_tax: Number(r.amount_before_tax),
    tax_amount: Number(r.tax_amount),
    amount_after_tax: Number(r.amount_after_tax),
    entry_version: Number(r.entry_version),
  }));
}

export const itCostRpcs: Record<string, RpcHandler> = {
  async it_filtered_costs({ target_filter }, ctx) {
    return filteredCosts(ctx, target_filter ?? {});
  },

  async it_cost_summary({ target_filter }, ctx) {
    const lines = await filteredCosts(ctx, target_filter ?? {});
    const groups = new Map<string, { category_id: string; category_name: string; month: number; amount: number }>();
    for (const l of lines) {
      const month = Number(String(l.recognized_on).slice(5, 7));
      const key = `${l.category_id}|${month}`;
      const g = groups.get(key) ?? { category_id: l.category_id, category_name: l.category_name, month, amount: 0 };
      g.amount += l.amount_after_tax;
      groups.set(key, g);
    }
    return {
      total: lines.reduce((s, l) => s + l.amount_after_tax, 0),
      count: lines.length,
      unpaid: lines.filter((l) => l.payment_status !== "paid").reduce((s, l) => s + l.amount_after_tax, 0),
      groups: [...groups.values()],
    };
  },

  async register_it_document({ target_data: d }, ctx) {
    if (!ctx.session.userId || !hasPermission(ctx, "it_costs.import")) raise("IT_FORBIDDEN");
    return tx(ctx, (t) => withLock(t, lockName(d.hash), async () => {
      const existing = await t.one<{ id: string }>("SELECT id FROM it_documents WHERE hash = ?", [d.hash]);
      if (existing) return existing.id;
      const id = String(d.id);
      const path = `${ctx.session.userId}/${id}${d.mime === "application/pdf" ? ".pdf" : ".docx"}`;
      if (!(await t.one("SELECT 1 AS x FROM storage_objects WHERE bucket_id = 'it-cost-documents' AND name = ?", [path]))) raise("IT_FILE_MISSING");
      await t.insert("it_documents", {
        id, kind: d.kind, provider: clean(d.provider), issuer_tax_code: clean(d.issuer_tax_code), number: clean(d.number),
        series: clean(d.series).toUpperCase(), issued_on: opt(d.issued_on), reference: clean(d.reference), total_amount: d.total_amount,
        hash: d.hash, storage_path: path, name: d.name, mime: d.mime, size: Number(d.size),
      });
      return id;
    }));
  },

  async link_it_document({ target_document, target_kind, target_id, target_remove = false }, ctx) {
    if (!ctx.session.userId || !hasPermission(ctx, "it_costs.import") || (target_remove && !hasPermission(ctx, "it_costs.delete"))) raise("IT_FORBIDDEN");
    const column = ({ entry: "entry_id", service: "service_id", period: "period_id" } as const)[target_kind as "entry"];
    if (!column) raise("IT_INVALID_KIND");
    return tx(ctx, async (t) => {
      if (target_remove) await t.delete("it_document_links", { document_id: target_document, [column]: target_id });
      else await linkDocument(t, target_document, column, target_id);
      return null;
    });
  },

  async save_it_entity({ target_kind, target_data: d }, ctx) {
    if (!ctx.session.userId || !hasPermission(ctx, "it_costs.manage")) raise("IT_FORBIDDEN");
    let id = opt(d.id);
    return tx(ctx, async (t) => {
      if (target_kind === "category") {
        if (!hasPermission(ctx, "it_costs.settings")) raise("IT_FORBIDDEN");
        if (!id) {
          id = (await t.insert("it_cost_categories", { code: clean(d.code), name: clean(d.name), sort_order: Number(d.sort_order ?? 0), active: d.active ?? true })).id;
        } else if (!(await t.update("it_cost_categories", { name: clean(d.name), sort_order: Number(d.sort_order), active: Boolean(d.active) }, { id }))) {
          raise("IT_NOT_FOUND");
        }
      } else if (target_kind === "service") {
        const values = {
          code: clean(d.code), name: clean(d.name), category_id: d.category_id, identifier: d.identifier, provider: d.provider,
          location: d.location, note: d.note, status: d.status,
        };
        if (id) {
          const cur = await t.one<{ version: number }>("SELECT version FROM it_services WHERE id = ? FOR UPDATE", [id]);
          if (!cur || Number(cur.version) !== Number(d.version)) raise("IT_STALE");
          await t.update("it_services", { ...values, version: Number(cur.version) + 1, updated_by: ctx.session.userId }, { id });
        } else {
          id = (await t.insert("it_services", values)).id;
        }
      } else if (target_kind === "period") {
        const s = String(d.service_id);
        if (!(await t.one("SELECT 1 AS x FROM it_services WHERE id = ? FOR UPDATE", [s]))) raise("IT_NOT_FOUND");
        if (opt(d.renewed_from_id)) {
          const prev = await t.one<{ service_id: string }>("SELECT service_id FROM it_service_periods WHERE id = ?", [d.renewed_from_id]);
          if (!prev || prev.service_id !== s) raise("IT_INVALID_PERIOD");
        }
        const overlap = await t.one(
          "SELECT 1 AS x FROM it_service_periods WHERE service_id = ? AND status = 'active' AND NOT (id <=> ?) AND starts_on <= ? AND expires_on >= ? LIMIT 1",
          [s, id, d.expires_on, d.starts_on],
        );
        if (overlap && !d.allow_overlap) raise("IT_OVERLAP");
        const values = { starts_on: d.starts_on, expires_on: d.expires_on, cycle: d.cycle, remind_days: Number(d.remind_days), status: d.status, note: d.note };
        if (id) {
          const cur = await t.one<{ version: number }>("SELECT version FROM it_service_periods WHERE id = ? FOR UPDATE", [id]);
          if (!cur || Number(cur.version) !== Number(d.version)) raise("IT_STALE");
          if (!(await t.update("it_service_periods", { ...values, version: Number(cur.version) + 1, updated_by: ctx.session.userId }, { id, service_id: s }))) raise("IT_INVALID_PERIOD");
        } else {
          id = (await t.insert("it_service_periods", { ...values, service_id: s, renewed_from_id: opt(d.renewed_from_id) })).id;
        }
      } else raise("IT_INVALID_KIND");
      return id;
    });
  },

  async save_it_cost_entry({ target_data: d }, ctx) {
    if (!ctx.session.userId || !hasPermission(ctx, "it_costs.manage")) raise("IT_FORBIDDEN");
    const lines = d?.lines;
    if (!Array.isArray(lines) || lines.length < 1 || lines.length > 200) raise("IT_INVALID_LINES");
    if (d.status === "cancelled" && !hasPermission(ctx, "it_costs.delete")) raise("IT_FORBIDDEN");
    const docId = opt(d.document_id);
    return tx(ctx, async (t) => {
      let sourceTotal: number | null = null;
      if (docId) {
        if (!hasPermission(ctx, "it_costs.import")) raise("IT_FORBIDDEN");
        const doc = await t.one<{ total_amount: string | null }>("SELECT total_amount FROM it_documents WHERE id = ? FOR UPDATE", [docId]);
        if (!doc) raise("IT_NOT_FOUND");
        sourceTotal = doc.total_amount === null ? null : Number(doc.total_amount);
      }
      return withLock(t, lockName(d.request_id), async () => {
        let id = opt(d.id);
        const paidOn = d.payment_status === "paid" ? opt(d.paid_on) : null;
        const header = {
          provider: clean(d.provider), recognized_on: d.recognized_on, description: d.description, status: d.status,
          payment_status: d.payment_status, paid_on: paidOn, discrepancy_reason: d.discrepancy_reason ?? "",
        };
        if (!id) {
          const existing = await t.one<{ id: string }>("SELECT id FROM it_cost_entries WHERE request_id = ?", [d.request_id]);
          if (existing) return existing.id;
          id = (await t.insert("it_cost_entries", { ...header, request_id: d.request_id })).id as string;
        } else {
          const old = await t.one<{ version: number; status: string }>("SELECT version, status FROM it_cost_entries WHERE id = ? FOR UPDATE", [id]);
          if (!old || Number(old.version) !== Number(d.version)) raise("IT_STALE");
          if ((old.status === "cancelled" || d.status === "cancelled") && !hasPermission(ctx, "it_costs.delete")) raise("IT_FORBIDDEN");
          await t.update("it_cost_entries", { ...header, version: Number(old.version) + 1, updated_by: ctx.session.userId }, { id });
          const keep = new Set((lines as Record<string, unknown>[]).map((l) => opt(l.id)).filter(Boolean));
          const current = await t.rows<{ id: string }>("SELECT id FROM it_cost_entry_lines WHERE entry_id = ?", [id]);
          for (const c of current) if (!keep.has(c.id)) await t.delete("it_cost_entry_lines", { id: c.id });
        }
        for (const item of lines as Record<string, any>[]) {
          const lineId = opt(item.id);
          const source = String(item.source_key ?? "");
          let s = opt(item.service_id);
          let p = opt(item.period_id);
          if (!lineId) {
            if (docId && (await t.one("SELECT 1 AS x FROM it_cost_entry_lines WHERE document_id = ? AND source_key = ?", [docId, source]))) raise("IT_DUPLICATE_LINE");
            if (!s && clean(item.new_service_name)) {
              s = crypto.randomUUID();
              await t.insert("it_services", {
                id: s, code: `IT-${s.slice(0, 18)}`, name: clean(item.new_service_name), category_id: item.category_id,
                identifier: item.new_identifier ?? "", provider: d.provider,
              });
            }
            if (opt(item.starts_on) || opt(item.expires_on)) {
              if (!s || p || !opt(item.starts_on) || !opt(item.expires_on)) raise("IT_INVALID_PERIOD");
              await t.one("SELECT 1 AS x FROM it_services WHERE id = ? FOR UPDATE", [s]);
              const overlap = await t.one(
                "SELECT 1 AS x FROM it_service_periods WHERE service_id = ? AND status = 'active' AND starts_on <= ? AND expires_on >= ? LIMIT 1",
                [s, item.expires_on, item.starts_on],
              );
              if (overlap && !item.allow_overlap) raise("IT_OVERLAP");
              const prior = await t.one<{ id: string }>(
                "SELECT id FROM it_service_periods WHERE service_id = ? AND expires_on < ? ORDER BY expires_on DESC, id LIMIT 1",
                [s, item.starts_on],
              );
              p = (await t.insert("it_service_periods", { service_id: s, starts_on: item.starts_on, expires_on: item.expires_on, cycle: "custom", renewed_from_id: prior?.id ?? null })).id as string;
              if (docId) await linkDocument(t, docId, "period_id", p);
            }
          }
          if (opt(item.period_id) && !(await t.one("SELECT 1 AS x FROM it_service_periods WHERE id = ? AND service_id <=> ?", [item.period_id, opt(item.service_id)]))) {
            raise("IT_INVALID_PERIOD");
          }
          if (docId && !source) raise("IT_INVALID_SOURCE");
          const values = {
            category_id: item.category_id, description: clean(item.description), unit: item.unit ?? "", quantity: item.quantity,
            unit_price: item.unit_price, amount_before_tax: item.amount_before_tax, tax_amount: item.tax_amount, amount_after_tax: item.amount_after_tax,
          };
          if (lineId) {
            const n = await t.update("it_cost_entry_lines", { ...values, service_id: opt(item.service_id), period_id: opt(item.period_id) }, { id: lineId, entry_id: id });
            if (!n) raise("IT_INVALID_LINE");
          } else {
            if (docId && (await t.one("SELECT 1 AS x FROM it_cost_entry_lines WHERE document_id = ? AND source_key = ?", [docId, source]))) raise("IT_DUPLICATE_LINE");
            await t.insert("it_cost_entry_lines", { ...values, entry_id: id, service_id: s, period_id: p, document_id: docId, source_key: source, source_ref: item.source_ref ?? "" });
          }
        }
        if (docId) {
          const sum = await t.one<{ total: string | null }>("SELECT SUM(amount_after_tax) AS total FROM it_cost_entry_lines WHERE document_id = ?", [docId]);
          if (sourceTotal !== null && Number(sum?.total ?? 0) > sourceTotal + 1 && !clean(d.discrepancy_reason)) raise("IT_TOTAL_MISMATCH");
          await linkDocument(t, docId, "entry_id", id);
        }
        return id;
      });
    });
  },
};

export const supplyRpcs: Record<string, RpcHandler> = {
  async get_supply_overview_stats(_a, ctx) {
    const now = new Date(Date.now() + 7 * 3600_000);
    const year = now.getUTCFullYear();
    const quarter = Math.floor(now.getUTCMonth() / 3) + 1;
    const requests = visible(ctx, "supply_requests");
    const lines = visible(ctx, "supply_request_lines");
    const quotes = visible(ctx, "supply_quotes");
    const quoteLines = visible(ctx, "supply_quote_lines");
    const [r] = await query<any>(
      getPool(),
      `WITH cy AS (SELECT id, period_type, period_quarter FROM ${requests} r WHERE deleted_at IS NULL AND period_year = ?),
            cyl AS (SELECT l.amount FROM ${lines} l JOIN cy ON cy.id = l.request_id)
       SELECT
         (SELECT COUNT(*) FROM cy WHERE period_type <> 'QUARTER' OR period_quarter = ?) AS current_request_count,
         (SELECT COUNT(*) FROM cyl) AS current_year_line_count,
         COALESCE((SELECT SUM(amount) FROM cyl), 0) AS current_year_spend,
         (SELECT COUNT(*) FROM ${quotes} q WHERE deleted_at IS NULL) AS quote_count,
         (SELECT COUNT(*) FROM ${quoteLines} ql JOIN ${quotes} q2 ON q2.id = ql.quote_id WHERE q2.deleted_at IS NULL) AS quote_line_count`,
      [year, quarter],
    );
    const out: Record<string, number> = {};
    for (const [k, v] of Object.entries(r ?? {})) out[k] = Number(v ?? 0);
    return out;
  },
};
