import Link from "next/link";
import { can, requireModuleAccess } from "@/lib/auth";
import { PageHeader } from "@/components/page-header";
import { AppIcon } from "@/components/app-icon";
import { ModalTrigger } from "@/components/app-modal";
import {
  ItServiceForm,
  ItPeriodForm,
  ItCategoryForm,
  ItManualEntry,
  ItEntryEdit,
} from "@/components/it-cost-forms";
import { ItCostImport } from "@/components/it-cost-import";
import { ItReport } from "@/components/it-cost-report";
import {
  parseItFilter,
  type ItCategory,
  type ItService,
  type ItPeriod,
} from "@/lib/it-costs";
import { formatDate, formatMoney, vietnamToday } from "@/lib/format";
import { periodDueTone } from "@/lib/vehicle-due-status";

export const metadata = { title: "Chi phí công nghệ thông tin" };
const tabs = [
  ["overview", "Tổng quan"],
  ["services", "Dịch vụ & gia hạn"],
  ["costs", "Chi phí"],
  ["documents", "Chứng từ"],
  ["reports", "Báo cáo"],
  ["categories", "Danh mục"],
] as const;
type CostRow = {
  line_id: string;
  entry_id: string;
  recognized_on: string;
  provider: string;
  payment_status: string;
  paid_on: string | null;
  category_name: string;
  service_name: string | null;
  description: string;
  amount_after_tax: number;
};
type Summary = {
  total: number;
  unpaid: number;
  count: number;
  groups: {
    category_id: string;
    category_name: string;
    month: number;
    amount: number;
  }[];
};
export default async function ItCostsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { access, supabase } = await requireModuleAccess("it_costs");
  const params = await searchParams;
  const today = vietnamToday(),
    tab = tabs.some((t) => t[0] === params.tab)
      ? String(params.tab)
      : "overview";
  const filter = parseItFilter({
      ...params,
      year:
        params.year ??
        (["services", "documents"].includes(tab) ? "" : today.slice(0, 4)),
    }),
    history = params.history === "1";
  const manage = can(access, "it_costs.manage"),
    importable = can(access, "it_costs.import"),
    settings = can(access, "it_costs.settings"),
    exportable = can(access, "reports.it_costs.export");
  if (tab === "categories" && !settings)
    return <p className="form-error">Bạn chưa có quyền cấu hình danh mục.</p>;
  const [cats, svcs, periodRefs] = await Promise.all([
    supabase
      .from("it_cost_categories")
      .select("*", { count: "exact" })
      .order("sort_order")
      .order("id")
      .limit(1000),
    supabase
      .from("it_services")
      .select("*", { count: "exact" })
      .order("name")
      .order("id")
      .limit(1000),
    supabase
      .from("it_service_periods")
      .select("*", { count: "exact" })
      .order("expires_on", { ascending: false })
      .order("id")
      .range(0, 499),
  ]);
  if (cats.error || svcs.error || periodRefs.error)
    return (
      <section className="panel">
        <h2>Chưa tải được phân hệ CNTT</h2>
        <p className="muted">
          Kiểm tra kết nối và migration cho phân hệ mới, rồi tải lại trang.
        </p>
      </section>
    );
  if (
    (cats.count || 0) > 1000 ||
    (svcs.count || 0) > 1000 ||
    (periodRefs.count || 0) > 2000
  )
    return (
      <p className="form-error">
        Dữ liệu tham chiếu vượt giới hạn hiện tại. Cần mở rộng bộ chọn dịch vụ
        trước khi tiếp tục để tránh thiếu dữ liệu.
      </p>
    );
  for (let offset = 500; offset < (periodRefs.count || 0); offset += 500) {
    const r = await supabase
      .from("it_service_periods")
      .select("*")
      .order("expires_on", { ascending: false })
      .order("id")
      .range(offset, offset + 499);
    if (r.error)
      return (
        <p className="form-error">Không đọc đủ các kỳ dịch vụ. Hãy tải lại.</p>
      );
    periodRefs.data.push(...r.data);
  }
  const categories = cats.data as ItCategory[],
    services = svcs.data as ItService[],
    periods = periodRefs.data as ItPeriod[];
  const label = (id: string) => services.find((s) => s.id === id)?.name || "—";
  const href = (patch: Record<string, string>) => {
    const q = new URLSearchParams();
    for (const [k, v] of Object.entries({
      ...filter,
      tab,
      history: history ? "1" : "",
      ...patch,
    }))
      if (v) q.set(k, String(v));
    return `/it-costs?${q}`;
  };
  const pageStart = (filter.page - 1) * 20;
  let summary: Summary = { total: 0, unpaid: 0, count: 0, groups: [] },
    costRows: CostRow[] = [];
  let docs: {
    id: string;
    name: string;
    kind: string;
    provider: string;
    number: string;
    issued_on: string;
    created_at: string;
  }[] = [];
  let count = 0;
  let pageError = "";
  let periodRows: ItPeriod[] = [];
  let drafts: {
    id: string;
    provider: string;
    recognized_on: string;
    status: string;
  }[] = [];
  if (["overview", "costs", "reports"].includes(tab)) {
    const r = await supabase.rpc("it_cost_summary", { target_filter: filter });
    if (r.error) pageError = "Không tải được tổng chi phí.";
    else summary = r.data as Summary;
    if (tab === "costs") {
      const [r, d] = await Promise.all([
        supabase
          .rpc("it_filtered_costs", { target_filter: filter })
          .order("recognized_on", { ascending: false })
          .order("line_id")
          .range(pageStart, pageStart + 19),
        supabase
          .from("it_cost_entries")
          .select("id,provider,recognized_on,status")
          .in("status", ["draft", "cancelled"])
          .order("created_at", { ascending: false })
          .limit(20),
      ]);
      if (r.error || d.error) pageError = "Không tải được danh sách chi phí.";
      else {
        costRows = r.data as CostRow[];
        drafts = d.data;
      }
      count = summary.count;
    }
  }
  if (tab === "services") {
    let q = supabase.from("it_service_periods").select("*", { count: "exact" });
    q = history
      ? q.or(`expires_on.lt.${today},status.neq.active`)
      : q.gte("expires_on", today).eq("status", "active");
    if (filter.service) q = q.eq("service_id", filter.service);
    if (filter.year)
      q = q
        .gte("starts_on", `${filter.year}-01-01`)
        .lt("starts_on", `${Number(filter.year) + 1}-01-01`);
    const r = await q
      .order("expires_on", { ascending: !history })
      .order("id")
      .range(pageStart, pageStart + 19);
    if (r.error) pageError = "Không tải được các kỳ sử dụng.";
    else {
      periodRows = r.data as ItPeriod[];
      count = r.count || 0;
    }
  }
  if (tab === "documents") {
    let q = supabase
      .from("it_documents")
      .select("id,name,kind,provider,number,issued_on,created_at", {
        count: "exact",
      });
    if (filter.provider) q = q.ilike("provider", `%${filter.provider}%`);
    if (filter.year)
      q = q
        .gte("issued_on", `${filter.year}-01-01`)
        .lt("issued_on", `${Number(filter.year) + 1}-01-01`);
    const r = await q
      .order("created_at", { ascending: false })
      .order("id")
      .range(pageStart, pageStart + 19);
    if (r.error) pageError = "Không tải được chứng từ.";
    else {
      docs = r.data;
      count = r.count || 0;
    }
  }
  const last = Math.max(1, Math.ceil(count / 20));
  const due = periods
    .filter(
      (p) =>
        p.status === "active" &&
        p.starts_on <= today &&
        Math.round((Date.parse(p.expires_on) - Date.parse(today)) / 86400000) <=
          p.remind_days &&
        !periods.some(
          (n) =>
            n.service_id === p.service_id &&
            n.status === "active" &&
            n.starts_on <= today &&
            n.expires_on >= today &&
            n.expires_on > p.expires_on,
        ),
    )
    .sort((a, b) => a.expires_on.localeCompare(b.expires_on));
  return (
    <div className="it-cost-page">
      <PageHeader
        eyebrow="CÔNG NGHỆ THÔNG TIN"
        title="Chi phí công nghệ thông tin"
        description="Quản lý dịch vụ, chứng từ, kỳ gia hạn và chi phí theo năm."
        actions={
          <>
            {importable ? (
              <ItCostImport
                categories={categories}
                services={services}
                periods={periods}
              />
            ) : null}
            {manage ? (
              <ItManualEntry
                categories={categories}
                services={services}
                periods={periods}
              />
            ) : null}
          </>
        }
      />
      <nav className="it-tabs" aria-label="Các mục chi phí CNTT">
        {tabs
          .filter((t) => t[0] !== "categories" || settings)
          .map(([key, title]) => (
            <Link
              key={key}
              href={href({
                tab: key,
                page: "1",
                ...(key === "services" ? { year: "" } : {}),
              })}
              aria-current={tab === key ? "page" : undefined}
            >
              <AppIcon
                name={
                  key === "overview"
                    ? "server"
                    : key === "reports"
                      ? "reports"
                      : key === "categories"
                        ? "settings"
                        : key === "services"
                          ? "timeline"
                          : "assets"
                }
              />
              {title}
            </Link>
          ))}
      </nav>
      {["overview", "costs", "reports", "services", "documents"].includes(
        tab,
      ) ? (
        <form className="panel it-filter" method="get">
          <input type="hidden" name="tab" value={tab} />
          {history ? <input type="hidden" name="history" value="1" /> : null}
          <label>
            Năm{tab === "services" ? " bắt đầu kỳ" : ""}
            <select name="year" defaultValue={filter.year}>
              <option value="">Tất cả năm</option>
              {Array.from({ length: 31 }, (_, i) =>
                String(Number(today.slice(0, 4)) + 3 - i),
              ).map((y) => (
                <option key={y}>{y}</option>
              ))}
            </select>
          </label>
          {tab !== "services" && tab !== "documents" ? (
            <>
              <label>
                Tháng
                <select name="month" defaultValue={filter.month}>
                  <option value="">Tất cả tháng</option>
                  {Array.from({ length: 12 }, (_, i) => (
                    <option key={i + 1} value={i + 1}>
                      {i + 1}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Danh mục
                <select name="category" defaultValue={filter.category}>
                  <option value="">Tất cả danh mục</option>
                  {categories.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </select>
              </label>
            </>
          ) : null}
          {tab !== "documents" ? (
            <label>
              Dịch vụ
              <select name="service" defaultValue={filter.service}>
                <option value="">Tất cả dịch vụ</option>
                {services.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </select>
            </label>
          ) : null}
          {tab !== "services" ? (
            <label>
              Nhà cung cấp
              <input
                name="provider"
                defaultValue={filter.provider}
                maxLength={200}
              />
            </label>
          ) : null}
          {tab !== "services" && tab !== "documents" ? (
            <>
              <label>
                Thanh toán
                <select name="payment" defaultValue={filter.payment}>
                  <option value="">Tất cả trạng thái</option>
                  <option value="paid">Đã thanh toán</option>
                  <option value="unpaid">Chưa thanh toán</option>
                  <option value="unconfirmed">Chưa xác nhận</option>
                </select>
              </label>
              <label>
                Từ khóa
                <input name="q" defaultValue={filter.q} maxLength={200} />
              </label>
            </>
          ) : null}
          <div className="it-filter-actions">
            <button className="primary-button">Lọc</button>
            <Link className="secondary-button" href={`/it-costs?tab=${tab}`}>
              Đặt lại
            </Link>
          </div>
        </form>
      ) : null}
      {pageError ? (
        <p className="form-error" role="alert">
          {pageError}
        </p>
      ) : null}
      {tab === "overview" ? (
        <>
          <div className="it-metrics">
            <section className="panel">
              <AppIcon name="value" />
              <p>Chi phí {filter.year || "tất cả năm"}</p>
              <strong>{formatMoney(summary.total)}</strong>
              <small>Khoản chi đã xác nhận · theo bộ lọc</small>
            </section>
            <section className="panel">
              <AppIcon name="reports" />
              <p>Chưa xác nhận thanh toán</p>
              <strong>{formatMoney(summary.unpaid)}</strong>
              <small>Gồm chưa thanh toán và chưa xác nhận</small>
            </section>
            <section className="panel">
              <AppIcon name="timeline" />
              <p>Cần theo dõi</p>
              <strong>{due.length}</strong>
              <small>Kỳ hạn đến hạn nhắc · theo ngày hiện tại</small>
            </section>
          </div>
          <section className="panel">
            <div className="section-heading">
              <h2>Dịch vụ cần theo dõi</h2>
              <Link href="/it-costs?tab=services&year=">Xem kỳ hạn →</Link>
            </div>
            <div className="it-due-grid">
              {due.slice(0, 20).map((p) => {
                const t = periodDueTone(p.starts_on, p.expires_on, today);
                return (
                  <div className="it-due-card" key={p.id}>
                    <AppIcon name="server" />
                    <div>
                      <strong>{label(p.service_id)}</strong>
                      <small>Hết hạn {formatDate(p.expires_on)}</small>
                    </div>
                    <span className={`status-pill ${t.className}`}>
                      {t.label}
                    </span>
                    {manage ? (
                      <ModalTrigger
                        title="Gia hạn dịch vụ"
                        triggerLabel="Gia hạn"
                        triggerClassName="text-button"
                      >
                        <ItPeriodForm services={services} renew={p} />
                      </ModalTrigger>
                    ) : null}
                  </div>
                );
              })}
              {!due.length ? (
                <p className="muted">Chưa có dịch vụ đến hạn nhắc.</p>
              ) : null}
            </div>
          </section>
          <section className="panel">
            <h2>Chi phí theo danh mục</h2>
            <div className="it-category-totals">
              {categories.map((c) => {
                const total = summary.groups
                  .filter((g) => g.category_id === c.id)
                  .reduce((s, g) => s + Number(g.amount), 0);
                return (
                  <Link
                    href={href({ tab: "costs", category: c.id, page: "1" })}
                    key={c.id}
                  >
                    <span>{c.name}</span>
                    <strong>{formatMoney(total)}</strong>
                  </Link>
                );
              })}
            </div>
          </section>
        </>
      ) : null}
      {tab === "services" ? (
        <>
          <section className="panel">
            <div className="section-heading">
              <h2>Dịch vụ đang quản lý</h2>
              {manage ? (
                <ModalTrigger
                  title="Thêm dịch vụ CNTT"
                  triggerLabel="+ Dịch vụ"
                >
                  <ItServiceForm categories={categories} />
                </ModalTrigger>
              ) : null}
            </div>
            <div className="it-service-grid">
              {services
                .slice(
                  (Number(params.servicePage) || 1) * 20 - 20,
                  (Number(params.servicePage) || 1) * 20,
                )
                .map((s) => (
                  <section className="it-service-card" key={s.id}>
                    <strong>{s.name}</strong>
                    <small>
                      {s.identifier || s.code} ·{" "}
                      {s.provider || "Chưa có nhà cung cấp"}
                    </small>
                    <span
                      className={`status-pill ${s.status === "active" ? "status-pill--active" : "status-pill--inactive"}`}
                    >
                      {s.status === "active"
                        ? "Đang sử dụng"
                        : s.status === "paused"
                          ? "Tạm ngừng"
                          : "Lưu trữ"}
                    </span>
                    {manage ? (
                      <ModalTrigger
                        title="Sửa dịch vụ CNTT"
                        triggerLabel="Sửa dịch vụ"
                        triggerClassName="text-button"
                      >
                        <ItServiceForm categories={categories} initial={s} />
                      </ModalTrigger>
                    ) : null}
                  </section>
                ))}
            </div>
            {services.length > 20 ? (
              <div className="it-toolbar">
                {Array.from(
                  { length: Math.ceil(services.length / 20) },
                  (_, i) => (
                    <Link
                      className="secondary-button"
                      href={href({ servicePage: String(i + 1) })}
                      key={i}
                    >
                      {i + 1}
                    </Link>
                  ),
                )}
              </div>
            ) : null}
          </section>
          <section className="panel">
            <div className="section-heading">
              <h2>
                {history ? "Lịch sử kỳ sử dụng" : "Kỳ hiện hành và sắp tới"}
              </h2>
              {manage ? (
                <ModalTrigger
                  title="Ghi nhận kỳ dịch vụ"
                  triggerLabel="+ Kỳ sử dụng"
                >
                  <ItPeriodForm services={services} />
                </ModalTrigger>
              ) : null}
            </div>
            <div className="it-toolbar">
              <Link
                className={!history ? "primary-button" : "secondary-button"}
                href={href({ history: "", page: "1" })}
              >
                Hiện hành
              </Link>
              <Link
                className={history ? "primary-button" : "secondary-button"}
                href={href({ history: "1", page: "1" })}
              >
                Lịch sử
              </Link>
            </div>
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Dịch vụ</th>
                    <th>Bắt đầu</th>
                    <th>Hết hạn</th>
                    <th>Tình trạng</th>
                    <th>Thao tác</th>
                  </tr>
                </thead>
                <tbody>
                  {periodRows.map((p) => {
                    const t = periodDueTone(p.starts_on, p.expires_on, today);
                    return (
                      <tr key={p.id}>
                        <td>
                          <strong>{label(p.service_id)}</strong>
                          <small>{p.note}</small>
                        </td>
                        <td>{formatDate(p.starts_on)}</td>
                        <td>{formatDate(p.expires_on)}</td>
                        <td>
                          <span
                            className={`status-pill ${p.status === "active" ? t.className : "status-pill--inactive"}`}
                          >
                            {p.status === "active"
                              ? t.label
                              : p.status === "superseded"
                                ? "Đã thay thế"
                                : "Đã hủy"}
                          </span>
                        </td>
                        <td>
                          <div className="it-row-actions">
                            {manage ? (
                              <>
                                <ModalTrigger
                                  title="Gia hạn dịch vụ"
                                  triggerLabel="Gia hạn"
                                  triggerClassName="text-button"
                                >
                                  <ItPeriodForm services={services} renew={p} />
                                </ModalTrigger>
                                <ModalTrigger
                                  title="Sửa kỳ sử dụng"
                                  triggerLabel="Sửa"
                                  triggerClassName="text-button"
                                >
                                  <ItPeriodForm
                                    services={services}
                                    initial={p}
                                  />
                                </ModalTrigger>
                              </>
                            ) : null}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            {!periodRows.length ? (
              <p className="muted">Chưa có kỳ sử dụng phù hợp.</p>
            ) : null}
          </section>
        </>
      ) : null}
      {tab === "costs" ? (
        <section className="panel">
          <div className="section-heading">
            <h2>Chi phí đã xác nhận</h2>
            <strong>{formatMoney(summary.total)}</strong>
          </div>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Ngày / Nhà cung cấp</th>
                  <th>Danh mục / Dịch vụ</th>
                  <th>Nội dung</th>
                  <th>Sau thuế</th>
                  <th>Thanh toán</th>
                  <th>Thao tác</th>
                </tr>
              </thead>
              <tbody>
                {costRows.map((l) => (
                  <tr key={l.line_id}>
                    <td>
                      {formatDate(l.recognized_on)}
                      <small>{l.provider}</small>
                    </td>
                    <td>
                      <strong>{l.category_name}</strong>
                      <small>{l.service_name || "Chưa liên kết dịch vụ"}</small>
                    </td>
                    <td className="it-description">{l.description}</td>
                    <td className="it-money">
                      {formatMoney(l.amount_after_tax)}
                    </td>
                    <td>
                      <span
                        className={`status-pill ${l.payment_status === "paid" ? "status-pill--active" : l.payment_status === "unpaid" ? "status-pill--retiring" : "status-pill--attention"}`}
                      >
                        {l.payment_status === "paid"
                          ? "Đã thanh toán"
                          : l.payment_status === "unpaid"
                            ? "Chưa thanh toán"
                            : "Chưa xác nhận"}
                      </span>
                    </td>
                    <td>
                      {manage ? (
                        <ItEntryEdit
                          id={l.entry_id}
                          categories={categories}
                          services={services}
                          periods={periods}
                          canRemove={can(access, "it_costs.delete")}
                        />
                      ) : null}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {!costRows.length ? (
            <p className="muted">Chưa có khoản chi phù hợp.</p>
          ) : null}
          {drafts.length ? (
            <details>
              <summary>Bản nháp / đã hủy gần đây ({drafts.length})</summary>
              {drafts.map((d) => (
                <div className="it-toolbar" key={d.id}>
                  <span>
                    {formatDate(d.recognized_on)} · {d.provider} ·{" "}
                    {d.status === "draft" ? "Bản nháp" : "Đã hủy"}
                  </span>
                  {manage ? (
                    <ItEntryEdit
                      id={d.id}
                      categories={categories}
                      services={services}
                      periods={periods}
                      canRemove={can(access, "it_costs.delete")}
                    />
                  ) : null}
                </div>
              ))}
            </details>
          ) : null}
        </section>
      ) : null}
      {tab === "documents" ? (
        <section className="panel">
          <h2>Hồ sơ chứng từ</h2>
          <p className="muted">
            Chứng từ lưu riêng; tổng tiền chỉ tính khi bạn xác nhận khoản chi.
          </p>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Chứng từ</th>
                  <th>Nhà cung cấp</th>
                  <th>Số / Ngày</th>
                  <th>Thao tác</th>
                </tr>
              </thead>
              <tbody>
                {docs.map((d) => (
                  <tr key={d.id}>
                    <td>
                      <strong>{d.name}</strong>
                      <small>
                        {
                          {
                            invoice: "Hóa đơn",
                            contract: "Hợp đồng",
                            quote: "Báo giá",
                            other: "Khác",
                          }[d.kind]
                        }
                      </small>
                    </td>
                    <td>{d.provider || "—"}</td>
                    <td>
                      {d.number || "—"}
                      <small>{formatDate(d.issued_on)}</small>
                    </td>
                    <td>
                      <div className="it-row-actions">
                        <a
                          className="text-button"
                          href={`/api/it-costs/documents/${d.id}`}
                          target="_blank"
                          rel="noreferrer"
                        >
                          Xem
                        </a>
                        <a
                          className="text-button"
                          href={`/api/it-costs/documents/${d.id}?download=1`}
                        >
                          Tải xuống
                        </a>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {!docs.length ? <p className="muted">Chưa có chứng từ.</p> : null}
        </section>
      ) : null}
      {tab === "reports" ? (
        <ItReport
          categories={categories}
          summary={summary}
          filter={filter}
          canExport={exportable}
        />
      ) : null}
      {tab === "categories" && settings ? (
        <section className="panel">
          <div className="section-heading">
            <h2>Danh mục chi phí</h2>
            <ModalTrigger title="Thêm danh mục" triggerLabel="+ Danh mục">
              <ItCategoryForm />
            </ModalTrigger>
          </div>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Danh mục</th>
                  <th>Mã</th>
                  <th>Thứ tự</th>
                  <th>Trạng thái</th>
                  <th>Thao tác</th>
                </tr>
              </thead>
              <tbody>
                {categories.map((c) => (
                  <tr key={c.id}>
                    <td>{c.name}</td>
                    <td>{c.code}</td>
                    <td>{c.sort_order}</td>
                    <td>{c.active ? "Đang sử dụng" : "Ngừng sử dụng"}</td>
                    <td>
                      <ModalTrigger
                        title="Sửa danh mục"
                        triggerLabel="Sửa"
                        triggerClassName="text-button"
                      >
                        <ItCategoryForm initial={c} />
                      </ModalTrigger>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      ) : null}
      {["costs", "services", "documents"].includes(tab) ? (
        <div className="it-pagination">
          <span>
            {count} dòng · 20 dòng/trang · Trang {filter.page}/{last}
          </span>
          <div>
            {filter.page > 1 ? (
              <Link
                className="secondary-button"
                href={href({ page: String(filter.page - 1) })}
              >
                Trước
              </Link>
            ) : null}
            {filter.page < last ? (
              <Link
                className="secondary-button"
                href={href({ page: String(filter.page + 1) })}
              >
                Sau
              </Link>
            ) : null}
          </div>
        </div>
      ) : null}
    </div>
  );
}
