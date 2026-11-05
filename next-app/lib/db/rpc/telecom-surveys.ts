import "server-only";
import { clean, hasPermission, raise, tx, visible, type RpcHandler, type Tx } from "@/lib/db/rpc/helpers";
import { getPool, query } from "@/lib/db/pool";

const UUID_RE = /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/;

async function withLock<T>(t: Tx, name: string, fn: () => Promise<T>) {
  await t.one("SELECT GET_LOCK(?, 10) AS l", [name]);
  try {
    return await fn();
  } finally {
    await t.one("SELECT RELEASE_LOCK(?) AS l", [name]);
  }
}

function sameTs(a: unknown, b: unknown) {
  if (!a || !b) return false;
  return new Date(String(a)).getTime() === new Date(String(b)).getTime();
}

function validateSurveyQuestions(questions: unknown) {
  if (!Array.isArray(questions) || questions.length > 100) raise("SURVEY_INVALID_QUESTIONS");
  const ids = questions.map((q) => (q as { id?: unknown })?.id);
  if (new Set(ids.map(String)).size !== ids.length) raise("SURVEY_INVALID_QUESTIONS");
  for (const q of questions as Record<string, unknown>[]) {
    if (!q || typeof q !== "object" || Array.isArray(q)
      || !UUID_RE.test(String(q.id ?? ""))
      || typeof q.title !== "string" || q.title.trim().length < 1 || q.title.trim().length > 1000
      || !["short", "long", "single", "multiple"].includes(String(q.type ?? ""))
      || typeof q.required !== "boolean"
      || !Array.isArray(q.options)) raise("SURVEY_INVALID_QUESTIONS");
    const options = q.options as unknown[];
    if (q.type === "single" || q.type === "multiple") {
      if (options.length < 2 || options.length > 20 || new Set(options.map((o) => JSON.stringify(o))).size !== options.length) raise("SURVEY_INVALID_OPTIONS");
      for (const o of options) if (typeof o !== "string" || o.trim().length < 1 || o.trim().length > 300) raise("SURVEY_INVALID_OPTIONS");
    } else if (options.length !== 0) raise("SURVEY_INVALID_OPTIONS");
  }
}

export const telecomSurveyRpcs: Record<string, RpcHandler> = {
  async save_telecom_phones({ target_rows, target_id = null, target_version = null }, ctx) {
    if (!ctx.session.userId || !hasPermission(ctx, "telecom.manage")) raise("TELECOM_FORBIDDEN");
    if (!Array.isArray(target_rows) || target_rows.length < 1 || target_rows.length > 500) raise("INVALID_ROWS");
    if (target_id && target_rows.length !== 1) raise("INVALID_ROWS");
    return tx(ctx, (t) => withLock(t, "tdw_telecom_phones", async () => {
      let saved = 0;
      for (const item of target_rows as Record<string, unknown>[]) {
        const values = { phone: item.phone, location: item.location, serial: item.serial, replacement_phone: item.replacement_phone, status: item.status, note: item.note };
        if (!target_id) {
          if (await t.one("SELECT 1 AS x FROM telecom_phones WHERE phone = ? AND deleted_at IS NULL", [item.phone])) continue;
          await t.insert("telecom_phones", values);
          saved++;
        } else {
          const cur = await t.one<{ updated_at: string }>("SELECT updated_at FROM telecom_phones WHERE id = ? AND deleted_at IS NULL FOR UPDATE", [target_id], "telecom_phones");
          if (!cur || !sameTs(cur.updated_at, target_version)) raise("STALE_PHONE");
          await t.update("telecom_phones", { ...values, updated_by: ctx.session.userId }, { id: target_id });
          saved++;
        }
      }
      return saved;
    }));
  },

  async delete_telecom_phone({ target_id, target_version }, ctx) {
    if (!ctx.session.userId || !hasPermission(ctx, "telecom.delete")) raise("TELECOM_FORBIDDEN");
    return tx(ctx, (t) => withLock(t, "tdw_telecom_phones", async () => {
      const cur = await t.one<{ updated_at: string }>("SELECT updated_at FROM telecom_phones WHERE id = ? AND deleted_at IS NULL FOR UPDATE", [target_id], "telecom_phones");
      if (!cur || !sameTs(cur.updated_at, target_version)) raise("STALE_PHONE");
      await t.update("telecom_phones", { deleted_at: new Date().toISOString(), updated_by: ctx.session.userId }, { id: target_id });
      return null;
    }));
  },

  async import_telecom_invoices({ target_rows, target_source, target_group, target_category }, ctx) {
    if (!ctx.session.userId || !hasPermission(ctx, "telecom.import")) raise("TELECOM_FORBIDDEN");
    if (!["pipeline", "landline", "director"].includes(target_category)) raise("TELECOM_INVALID_CATEGORY");
    if (!Array.isArray(target_rows) || target_rows.length < 1 || target_rows.length > 200) raise("TELECOM_INVALID_ROWS");
    return tx(ctx, (t) => withLock(t, "tdw_telecom_invoices", async () => {
      let saved = 0;
      for (const item of target_rows as Record<string, any>[]) {
        const series = clean(item.invoice_series).toUpperCase();
        const number = String(item.invoice_number ?? "").replace(/^0+/, "") || "0";
        const existing = await t.one<any>(
          "SELECT * FROM telecom_invoices WHERE issuer_tax_code = ? AND invoice_series = ? AND invoice_number = ? AND deleted_at IS NULL",
          [item.issuer_tax_code, series, number], "telecom_invoices",
        );
        if (existing) {
          if (existing.subscriber !== item.subscriber || existing.period_month !== String(item.period_month).slice(0, 10)
            || existing.issued_on !== String(item.issued_on).slice(0, 10)
            || Number(existing.amount_before_tax) !== Number(item.amount_before_tax)
            || Number(existing.tax_amount) !== Number(item.tax_amount)
            || Number(existing.amount_after_tax) !== Number(item.amount_after_tax)) raise("TELECOM_INVOICE_CONFLICT");
          continue;
        }
        await t.insert("telecom_invoices", {
          category: target_category, provider: item.provider, issuer_tax_code: item.issuer_tax_code, invoice_series: series,
          invoice_number: number, issued_on: item.issued_on, period_month: item.period_month, subscriber: item.subscriber,
          contract_number: item.contract_number ?? "", service: item.service, group_name: target_group,
          amount_before_tax: item.amount_before_tax, tax_amount: item.tax_amount, amount_after_tax: item.amount_after_tax,
          source_file: target_source, source_page: item.page === undefined || item.page === null ? null : Number(item.page),
        });
        saved++;
      }
      return saved;
    }));
  },

  async update_telecom_invoice({ target_id, target_paid_on, target_note, target_group, target_category }, ctx) {
    if (!ctx.session.userId || !hasPermission(ctx, "telecom.manage")) raise("TELECOM_FORBIDDEN");
    return tx(ctx, async (t) => {
      const n = await t.update("telecom_invoices", {
        paid_on: target_paid_on || null, note: target_note, group_name: target_group, category: target_category, updated_by: ctx.session.userId,
      }, { id: target_id }, (q) => q.is("deleted_at", null));
      if (!n) raise("TELECOM_NOT_FOUND");
      return null;
    });
  },

  async delete_telecom_invoice({ target_id }, ctx) {
    if (!ctx.session.userId || !hasPermission(ctx, "telecom.delete")) raise("TELECOM_FORBIDDEN");
    return tx(ctx, (t) => withLock(t, "tdw_telecom_invoices", async () => {
      const n = await t.update("telecom_invoices", { deleted_at: new Date().toISOString(), updated_by: ctx.session.userId }, { id: target_id }, (q) => q.is("deleted_at", null));
      if (!n) raise("TELECOM_NOT_FOUND");
      return null;
    }));
  },

  async telecom_cost_summary({ target_year }, ctx) {
    const y = Number(target_year);
    const rows = await query<any>(
      getPool(),
      `SELECT period_month, category, COUNT(*) AS invoice_count, COUNT(DISTINCT subscriber) AS sim_count,
         SUM(amount_before_tax) AS before_tax, SUM(tax_amount) AS vat, SUM(amount_after_tax) AS total,
         SUM(CASE WHEN paid_on IS NULL THEN amount_after_tax ELSE 0 END) AS unpaid
       FROM ${visible(ctx, "telecom_invoices")} ti WHERE deleted_at IS NULL AND period_month >= ? AND period_month < ?
       GROUP BY period_month, category ORDER BY period_month`,
      [`${y}-01-01`, `${y + 1}-01-01`],
    );
    return rows.map((r) => ({
      period_month: String(r.period_month).slice(0, 10), category: r.category,
      invoice_count: Number(r.invoice_count), sim_count: Number(r.sim_count),
      before_tax: Number(r.before_tax), vat: Number(r.vat), total: Number(r.total), unpaid: Number(r.unpaid),
    }));
  },

  async save_company_survey({ target_id, target_revision, target_title, target_description, target_questions }, ctx) {
    if (!ctx.session.userId || !hasPermission(ctx, "surveys.manage")) raise("SURVEY_FORBIDDEN");
    validateSurveyQuestions(target_questions);
    return tx(ctx, async (t) => {
      let id = target_id as string | null;
      if (!id) {
        id = (await t.insert("company_surveys", { title: clean(target_title), description: target_description, questions: target_questions })).id;
      } else {
        const cur = await t.one<any>("SELECT * FROM company_surveys WHERE id = ? FOR UPDATE", [id], "company_surveys");
        if (!cur || Number(cur.revision) !== Number(target_revision)) raise("SURVEY_STALE");
        if (cur.published_at && JSON.stringify(cur.questions) !== JSON.stringify(target_questions)) raise("SURVEY_QUESTIONS_LOCKED");
        await t.update("company_surveys", {
          title: clean(target_title), description: target_description, questions: target_questions, revision: Number(cur.revision) + 1,
        }, { id });
      }
      await t.exec("INSERT INTO audit_logs (actor_user_id, action, table_name, record_id, metadata) VALUES (?, 'SURVEY_SAVED', 'company_surveys', ?, ?)", [
        ctx.session.userId, id, JSON.stringify({ question_count: (target_questions as unknown[]).length }),
      ]);
      return id;
    });
  },

  async set_company_survey_status({ target_id, target_revision, target_status }, ctx) {
    if (!ctx.session.userId || !hasPermission(ctx, "surveys.manage")) raise("SURVEY_FORBIDDEN");
    if (!["open", "closed"].includes(target_status)) raise("SURVEY_INVALID_STATUS");
    return tx(ctx, async (t) => {
      const cur = await t.one<any>("SELECT * FROM company_surveys WHERE id = ? FOR UPDATE", [target_id], "company_surveys");
      if (!cur || Number(cur.revision) !== Number(target_revision)) raise("SURVEY_STALE");
      if (target_status === "open" && !(cur.questions ?? []).length) raise("SURVEY_NO_QUESTIONS");
      await t.update("company_surveys", {
        status: target_status, revision: Number(cur.revision) + 1,
        published_at: target_status === "open" ? cur.published_at ?? new Date().toISOString() : cur.published_at,
      }, { id: target_id });
      await t.exec("INSERT INTO audit_logs (actor_user_id, action, table_name, record_id, metadata) VALUES (?, 'SURVEY_STATUS', 'company_surveys', ?, ?)", [
        ctx.session.userId, target_id, JSON.stringify({ status: target_status }),
      ]);
      return null;
    });
  },

  async get_public_survey({ target_token }) {
    if (!UUID_RE.test(String(target_token ?? ""))) return null;
    const [s] = await query<any>(getPool(), "SELECT title, description, questions FROM company_surveys WHERE public_token = ? AND status = 'open'", [target_token]);
    if (!s) return null;
    return { title: s.title, description: s.description, questions: typeof s.questions === "string" ? JSON.parse(s.questions) : s.questions };
  },

  async submit_company_survey({ target_token, target_submission, target_name, target_phone, target_email, target_answers }, ctx) {
    // Khảo sát công khai: chạy với quyền hệ thống, chỉ kiểm tra dữ liệu
    const svc = { session: { mode: "service" as const, userId: null, fragments: null } };
    void ctx;
    if (!UUID_RE.test(String(target_token ?? "")) || !UUID_RE.test(String(target_submission ?? ""))) raise("SURVEY_UNAVAILABLE");
    return tx(svc, async (t) => {
      const survey = await t.one<any>("SELECT * FROM company_surveys WHERE public_token = ? FOR UPDATE", [target_token], "company_surveys");
      if (!survey) raise("SURVEY_UNAVAILABLE");
      if (await t.one("SELECT 1 AS x FROM survey_responses WHERE survey_id = ? AND submission_id = ?", [survey.id, target_submission])) return null;
      if (survey.status !== "open") raise("SURVEY_UNAVAILABLE");
      const recent = await t.one<{ n: number }>("SELECT COUNT(*) AS n FROM survey_responses WHERE survey_id = ? AND submitted_at > UTC_TIMESTAMP(6) - INTERVAL 1 MINUTE", [survey.id]);
      if (Number(survey.response_count) >= 10000 || Number(recent?.n ?? 0) >= 120) raise("SURVEY_BUSY");
      const answers = target_answers;
      if (!answers || typeof answers !== "object" || Array.isArray(answers) || Buffer.byteLength(JSON.stringify(answers)) > 524288) raise("SURVEY_INVALID_ANSWERS");
      const questions = (survey.questions ?? []) as Record<string, any>[];
      const ids = new Set(questions.map((q) => String(q.id)));
      if (Object.keys(answers).some((k) => !ids.has(k))) raise("SURVEY_INVALID_ANSWERS");
      for (const q of questions) {
        const answer = (answers as Record<string, unknown>)[q.id];
        if (answer === undefined || answer === null || answer === "" || (Array.isArray(answer) && answer.length === 0)) {
          if (q.required) raise("SURVEY_REQUIRED_ANSWER");
          continue;
        }
        if (q.type === "short" || q.type === "long") {
          if (typeof answer !== "string" || answer.length > (q.type === "short" ? 500 : 5000) || (q.required && !answer.trim())) raise("SURVEY_INVALID_ANSWERS");
        } else if (q.type === "single") {
          if (typeof answer !== "string" || !q.options.includes(answer)) raise("SURVEY_INVALID_ANSWERS");
        } else if (q.type === "multiple") {
          if (!Array.isArray(answer) || answer.length > 20 || new Set(answer).size !== answer.length) raise("SURVEY_INVALID_ANSWERS");
          for (const c of answer) if (typeof c !== "string" || !q.options.includes(c)) raise("SURVEY_INVALID_ANSWERS");
        }
      }
      await t.insert("survey_responses", {
        survey_id: survey.id, submission_id: target_submission, full_name: clean(target_name), phone: target_phone ?? "",
        email: clean(target_email).toLowerCase(), answers,
      });
      await t.exec("UPDATE company_surveys SET response_count = response_count + 1 WHERE id = ?", [survey.id]);
      return null;
    });
  },
};
