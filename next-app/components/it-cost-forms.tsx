"use client";

import { useContext, useState } from "react";
import {
  ActionSuccessContext,
  useActionToast,
} from "@/components/action-toast";
import { AppModal, ModalTrigger } from "@/components/app-modal";
import { useRouter } from "next/navigation";
import {
  saveItEntity,
  saveItEntry,
  getItEntry,
  linkItDocument,
} from "@/app/(protected)/it-costs/actions";
import {
  emptyItLine,
  itSum,
  type ItCategory,
  type ItService,
  type ItPeriod,
  type ItEntry,
  type ItLine,
  type ItActionState,
} from "@/lib/it-costs";
import { formatMoney } from "@/lib/format";

function useSave() {
  const [pending, setPending] = useState(false),
    [error, setError] = useState("");
  const success = useContext(ActionSuccessContext),
    { showToast } = useActionToast();
  async function run(save: () => Promise<ItActionState>) {
    if (pending) return;
    setPending(true);
    setError("");
    try {
      const result = await save();
      if (result.error) {
        setError(result.error);
        return;
      }
      showToast(result.success || "Đã lưu.");
      success();
    } catch {
      setError(
        "Kết nối gián đoạn. Dữ liệu nhập vẫn được giữ, bạn có thể thử lại.",
      );
    } finally {
      setPending(false);
    }
  }
  return { pending, error, run };
}
function Footer({
  pending,
  error,
  label = "Lưu thông tin",
}: {
  pending: boolean;
  error: string;
  label?: string;
}) {
  return (
    <>
      <p className="form-error" role={error ? "alert" : undefined}>
        {error}
      </p>
      <div className="it-form-footer">
        <p>Thông tin được lưu sau khi bạn xác nhận.</p>
        <button className="primary-button" type="submit" disabled={pending}>
          {pending ? "Đang lưu…" : label}
        </button>
      </div>
    </>
  );
}
export function ItServiceForm({
  categories,
  initial,
}: {
  categories: ItCategory[];
  initial?: ItService;
}) {
  const { pending, error, run } = useSave();
  return (
    <form
      className="it-form"
      onSubmit={(e) => {
        e.preventDefault();
        const f = new FormData(e.currentTarget);
        void run(() =>
          saveItEntity("service", {
            ...Object.fromEntries(f),
            id: initial?.id || "",
            version: initial?.version || 1,
          }),
        );
      }}
    >
      <fieldset disabled={pending}>
        <div className="it-fields">
          <label>
            Mã dịch vụ
            <input
              name="code"
              required
              maxLength={60}
              defaultValue={initial?.code}
            />
          </label>
          <label>
            Tên dịch vụ
            <input
              name="name"
              required
              maxLength={200}
              defaultValue={initial?.name}
            />
          </label>
          <label>
            Danh mục
            <select
              name="category_id"
              required
              defaultValue={initial?.category_id || ""}
            >
              <option value="">Chọn danh mục</option>
              {categories
                .filter((c) => c.active || c.id === initial?.category_id)
                .map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
            </select>
          </label>
          <label>
            Tên miền / mã đường truyền
            <input
              name="identifier"
              maxLength={200}
              defaultValue={initial?.identifier}
            />
          </label>
          <label>
            Nhà cung cấp
            <input
              name="provider"
              maxLength={200}
              defaultValue={initial?.provider}
            />
          </label>
          <label>
            Vị trí / mục đích
            <input
              name="location"
              maxLength={300}
              defaultValue={initial?.location}
            />
          </label>
          <label>
            Trạng thái
            <select name="status" defaultValue={initial?.status || "active"}>
              <option value="active">Đang sử dụng</option>
              <option value="paused">Tạm ngừng</option>
              <option value="archived">Lưu trữ</option>
            </select>
          </label>
        </div>
        <label>
          Ghi chú
          <textarea name="note" maxLength={2000} defaultValue={initial?.note} />
        </label>
      </fieldset>
      <Footer pending={pending} error={error} />
    </form>
  );
}
function nextDay(s: string) {
  const d = new Date(`${s}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + 1);
  return d.toISOString().slice(0, 10);
}
export function ItPeriodForm({
  services,
  initial,
  renew,
}: {
  services: ItService[];
  initial?: ItPeriod;
  renew?: ItPeriod;
}) {
  const { pending, error, run } = useSave();
  return (
    <form
      className="it-form"
      onSubmit={(e) => {
        e.preventDefault();
        const f = new FormData(e.currentTarget);
        void run(() =>
          saveItEntity("period", {
            ...Object.fromEntries(f),
            id: initial?.id || "",
            version: initial?.version || 1,
            renewed_from_id: renew?.id || initial?.renewed_from_id || "",
            remind_days: Number(f.get("remind_days")),
            allow_overlap: f.get("allow_overlap") === "on",
          }),
        );
      }}
    >
      <fieldset disabled={pending}>
        <div className="it-fields">
          <label>
            Dịch vụ
            <select
              name="service_id"
              required
              defaultValue={initial?.service_id || renew?.service_id || ""}
            >
              <option value="">Chọn dịch vụ</option>
              {services.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name} · {s.identifier || s.code}
                </option>
              ))}
            </select>
          </label>
          <label>
            Chu kỳ
            <select
              name="cycle"
              defaultValue={initial?.cycle || renew?.cycle || "year"}
            >
              <option value="month">Tháng</option>
              <option value="quarter">Quý</option>
              <option value="year">Năm</option>
              <option value="custom">Tùy chọn</option>
            </select>
          </label>
          <label>
            Ngày bắt đầu
            <input
              type="date"
              name="starts_on"
              required
              defaultValue={
                initial?.starts_on || (renew ? nextDay(renew.expires_on) : "")
              }
            />
          </label>
          <label>
            Ngày hết hạn
            <input
              type="date"
              name="expires_on"
              required
              defaultValue={initial?.expires_on}
            />
          </label>
          <label>
            Nhắc trước (ngày)
            <input
              type="number"
              name="remind_days"
              min={0}
              max={365}
              required
              defaultValue={initial?.remind_days ?? renew?.remind_days ?? 30}
            />
          </label>
          <label>
            Tình trạng kỳ
            <select name="status" defaultValue={initial?.status || "active"}>
              <option value="active">Đang theo dõi</option>
              <option value="superseded">Đã thay thế</option>
              <option value="cancelled">Đã hủy</option>
            </select>
          </label>
        </div>
        <label>
          Ghi chú
          <textarea name="note" maxLength={2000} defaultValue={initial?.note} />
        </label>
        <label className="it-checkbox">
          <input type="checkbox" name="allow_overlap" />
          Tôi đã kiểm tra và chấp thuận nếu kỳ này chồng ngày với kỳ hiện có.
        </label>
      </fieldset>
      <Footer
        pending={pending}
        error={error}
        label={renew ? "Lưu kỳ gia hạn" : "Lưu kỳ sử dụng"}
      />
    </form>
  );
}
export function ItCategoryForm({ initial }: { initial?: ItCategory }) {
  const { pending, error, run } = useSave();
  return (
    <form
      className="it-form"
      onSubmit={(e) => {
        e.preventDefault();
        const f = new FormData(e.currentTarget);
        void run(() =>
          saveItEntity("category", {
            ...Object.fromEntries(f),
            id: initial?.id || "",
            code: initial?.code || f.get("code"),
            sort_order: Number(f.get("sort_order")),
            active: f.get("active") === "on",
          }),
        );
      }}
    >
      <fieldset disabled={pending}>
        <div className="it-fields">
          <label>
            Mã danh mục
            <input
              name="code"
              pattern="[a-z0-9_-]+"
              required
              maxLength={60}
              defaultValue={initial?.code}
              readOnly={!!initial}
            />
          </label>
          <label>
            Tên danh mục
            <input
              name="name"
              required
              maxLength={150}
              defaultValue={initial?.name}
            />
          </label>
          <label>
            Thứ tự
            <input
              name="sort_order"
              type="number"
              required
              defaultValue={initial?.sort_order || 0}
            />
          </label>
        </div>
        <label className="it-checkbox">
          <input
            name="active"
            type="checkbox"
            defaultChecked={initial?.active ?? true}
          />
          Đang sử dụng
        </label>
      </fieldset>
      <Footer pending={pending} error={error} />
    </form>
  );
}
export function ItLineEditor({
  lines,
  setLines,
  categories,
  services,
  periods,
  selectable = false,
  selected,
  setSelected,
  usedKeys = [],
}: {
  lines: ItLine[];
  setLines: (lines: ItLine[]) => void;
  categories: ItCategory[];
  services: ItService[];
  periods: ItPeriod[];
  selectable?: boolean;
  selected?: Set<string>;
  setSelected?: (s: Set<string>) => void;
  usedKeys?: string[];
}) {
  const patch = (i: number, p: Partial<ItLine>) =>
    setLines(lines.map((l, n) => (n === i ? { ...l, ...p } : l)));
  return (
    <div className="it-line-list">
      {lines.map((l, i) => {
        const key = l.source_key || String(i),
          used = usedKeys.includes(key);
        return (
          <section
            className={`it-line-card ${used ? "it-line-saved" : ""}`}
            key={key}
          >
            <div className="it-line-heading">
              <strong>
                Dòng {i + 1}
                {l.source_ref ? ` · ${l.source_ref}` : ""}
              </strong>
              {selectable ? (
                <label className="it-checkbox">
                  <input
                    type="checkbox"
                    disabled={used}
                    checked={!used && !!selected?.has(key)}
                    onChange={(e) => {
                      const n = new Set(selected);
                      if (e.target.checked) n.add(key);
                      else n.delete(key);
                      setSelected?.(n);
                    }}
                  />
                  {used ? "Đã nhập · bỏ qua" : "Chọn nhập"}
                </label>
              ) : (
                <button
                  type="button"
                  className="text-button"
                  disabled={lines.length === 1}
                  onClick={() => setLines(lines.filter((_, n) => n !== i))}
                >
                  Bỏ dòng
                </button>
              )}
            </div>
            <div className="it-fields it-line-fields">
              <label className="it-span">
                Nội dung
                <textarea
                  aria-label="Nội dung"
                  required={!selectable}
                  value={l.description}
                  maxLength={2000}
                  onChange={(e) => patch(i, { description: e.target.value })}
                />
              </label>
              <label>
                Danh mục
                <select
                  value={l.category_id}
                  onChange={(e) => patch(i, { category_id: e.target.value })}
                >
                  <option value="">Chọn danh mục</option>
                  {categories
                    .filter((c) => c.active || c.id === l.category_id)
                    .map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name}
                      </option>
                    ))}
                </select>
              </label>
              <label>
                Dịch vụ
                <select
                  value={l.service_id}
                  onChange={(e) => {
                    const s = services.find((s) => s.id === e.target.value);
                    patch(i, {
                      service_id: e.target.value,
                      period_id: "",
                      ...(s ? { category_id: s.category_id } : {}),
                    });
                  }}
                >
                  <option value="">Chưa liên kết dịch vụ</option>
                  {services.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Kỳ sử dụng
                <select
                  value={l.period_id}
                  onChange={(e) =>
                    patch(i, {
                      period_id: e.target.value,
                      starts_on: "",
                      expires_on: "",
                    })
                  }
                >
                  <option value="">Chưa liên kết kỳ</option>
                  {periods
                    .filter((p) => p.service_id === l.service_id)
                    .map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.starts_on} → {p.expires_on}
                      </option>
                    ))}
                </select>
              </label>
              {!l.service_id ? (
                <>
                  <label>
                    Tạo dịch vụ mới (tùy chọn)
                    <input
                      value={l.new_service_name || ""}
                      maxLength={200}
                      onChange={(e) =>
                        patch(i, { new_service_name: e.target.value })
                      }
                    />
                  </label>
                  <label>
                    Định danh dịch vụ mới
                    <input
                      value={l.new_identifier || ""}
                      maxLength={200}
                      onChange={(e) =>
                        patch(i, { new_identifier: e.target.value })
                      }
                    />
                  </label>
                </>
              ) : null}
              {!l.period_id ? (
                <>
                  <label>
                    Bắt đầu kỳ mới (tùy chọn)
                    <input
                      type="date"
                      value={l.starts_on || ""}
                      onChange={(e) => patch(i, { starts_on: e.target.value })}
                    />
                  </label>
                  <label>
                    Hết hạn kỳ mới
                    <input
                      type="date"
                      value={l.expires_on || ""}
                      onChange={(e) => patch(i, { expires_on: e.target.value })}
                    />
                  </label>
                  <label className="it-checkbox">
                    <input
                      type="checkbox"
                      checked={l.allow_overlap || false}
                      onChange={(e) =>
                        patch(i, { allow_overlap: e.target.checked })
                      }
                    />
                    Đã kiểm tra kỳ chồng ngày
                  </label>
                </>
              ) : null}
              <label>
                Đơn vị
                <input
                  value={l.unit}
                  maxLength={50}
                  onChange={(e) => patch(i, { unit: e.target.value })}
                />
              </label>
              <label>
                Số lượng
                <input
                  type="number"
                  step="any"
                  min="0.001"
                  value={l.quantity}
                  onChange={(e) =>
                    patch(i, { quantity: Number(e.target.value) })
                  }
                />
              </label>
              <label>
                Đơn giá tham khảo
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  value={l.unit_price ?? ""}
                  onChange={(e) =>
                    patch(i, {
                      unit_price:
                        e.target.value === "" ? null : Number(e.target.value),
                    })
                  }
                />
              </label>
              <label>
                Tiền trước thuế
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  value={
                    Number.isFinite(l.amount_before_tax)
                      ? l.amount_before_tax
                      : ""
                  }
                  onChange={(e) =>
                    patch(i, {
                      amount_before_tax:
                        e.target.value === "" ? NaN : Number(e.target.value),
                    })
                  }
                />
              </label>
              <label>
                Tiền VAT
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  value={Number.isFinite(l.tax_amount) ? l.tax_amount : ""}
                  onChange={(e) =>
                    patch(i, {
                      tax_amount:
                        e.target.value === "" ? NaN : Number(e.target.value),
                    })
                  }
                />
              </label>
              <label>
                Tiền sau thuế
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  value={
                    Number.isFinite(l.amount_after_tax)
                      ? l.amount_after_tax
                      : ""
                  }
                  onChange={(e) =>
                    patch(i, {
                      amount_after_tax:
                        e.target.value === "" ? NaN : Number(e.target.value),
                    })
                  }
                />
              </label>
            </div>
            {Math.abs(l.amount_before_tax + l.tax_amount - l.amount_after_tax) >
            1 ? (
              <p className="form-error">
                Tiền trước thuế + VAT chưa khớp tiền sau thuế.
              </p>
            ) : null}
          </section>
        );
      })}
    </div>
  );
}
export function ItEntryForm({
  categories,
  services,
  periods,
  initial,
  documentId = "",
  sourceLines,
  selected,
  sourceTotal = null,
  canCancel = false,
}: {
  categories: ItCategory[];
  services: ItService[];
  periods: ItPeriod[];
  initial?: ItEntry;
  documentId?: string;
  sourceLines?: ItLine[];
  selected?: Set<string>;
  sourceTotal?: number | null;
  canCancel?: boolean;
}) {
  const [lines, setLines] = useState<ItLine[]>(
    initial?.lines || sourceLines || [emptyItLine()],
  );
  const [requestId] = useState(
    () => initial?.request_id || crypto.randomUUID(),
  );
  const [payment, setPayment] = useState(
    initial?.payment_status || "unconfirmed",
  );
  const { pending, error, run } = useSave();
  const chosen = selected
    ? lines.filter((l) => selected.has(l.source_key))
    : lines;
  return (
    <form
      className="it-form"
      onSubmit={(e) => {
        e.preventDefault();
        const f = new FormData(e.currentTarget);
        void run(() =>
          saveItEntry({
            ...Object.fromEntries(f),
            id: initial?.id || "",
            version: initial?.version || 1,
            request_id: requestId,
            document_id: documentId,
            lines: chosen,
          }),
        );
      }}
    >
      <fieldset disabled={pending}>
        <div className="it-fields">
          <label>
            Nhà cung cấp
            <input
              name="provider"
              required
              maxLength={200}
              defaultValue={initial?.provider}
            />
          </label>
          <label>
            Ngày ghi nhận chi phí
            <input
              name="recognized_on"
              type="date"
              required
              defaultValue={initial?.recognized_on}
            />
          </label>
          <label>
            Ghi nhận
            <select name="status" defaultValue={initial?.status || "confirmed"}>
              <option value="confirmed">Xác nhận chi phí</option>
              <option value="draft">Bản nháp</option>
              {initial?.id && (canCancel || initial.status === "cancelled") ? (
                <option value="cancelled">Hủy khoản chi</option>
              ) : null}
            </select>
          </label>
          <label>
            Thanh toán
            <select
              name="payment_status"
              value={payment}
              onChange={(e) => setPayment(e.target.value as typeof payment)}
            >
              <option value="unconfirmed">Chưa xác nhận</option>
              <option value="unpaid">Chưa thanh toán</option>
              <option value="paid">Đã thanh toán</option>
            </select>
          </label>
          <label>
            Ngày thanh toán
            <input
              name="paid_on"
              type="date"
              required={payment === "paid"}
              disabled={payment !== "paid"}
              defaultValue={initial?.paid_on}
            />
          </label>
        </div>
        <label>
          Nội dung chung
          <textarea
            name="description"
            maxLength={2000}
            defaultValue={initial?.description}
          />
        </label>
        <ItLineEditor
          lines={lines}
          setLines={setLines}
          categories={categories}
          services={services}
          periods={periods}
        />
        {!sourceLines ? (
          <button
            type="button"
            className="secondary-button"
            onClick={() => setLines([...lines, emptyItLine()])}
          >
            + Thêm dòng chi phí
          </button>
        ) : null}
        <label>
          Lý do chênh lệch so với chứng từ (nếu có)
          <textarea
            name="discrepancy_reason"
            maxLength={1000}
            defaultValue={initial?.discrepancy_reason}
          />
        </label>
        <div className="it-review-summary">
          <strong>
            Tổng các dòng:{" "}
            {Number.isFinite(itSum(chosen))
              ? formatMoney(itSum(chosen))
              : "Cần bổ sung số tiền"}
          </strong>
          {sourceTotal !== null ? (
            <span>Tổng chứng từ: {formatMoney(sourceTotal)}</span>
          ) : null}
        </div>
      </fieldset>
      <Footer pending={pending} error={error} label="Lưu khoản chi phí" />
    </form>
  );
}
export function ItEntryEdit({
  id,
  categories,
  services,
  periods,
  canRemove = false,
}: {
  id: string;
  categories: ItCategory[];
  services: ItService[];
  periods: ItPeriod[];
  canRemove?: boolean;
}) {
  const [open, setOpen] = useState(false),
    [loading, setLoading] = useState(false),
    [error, setError] = useState("");
  const [entry, setEntry] = useState<ItEntry>(),
    [links, setLinks] = useState<
      { document_id: string; it_documents: unknown }[]
    >([]);
  const router = useRouter();
  const { showToast } = useActionToast();
  async function load() {
    setOpen(true);
    setLoading(true);
    setError("");
    try {
      const r = await getItEntry(id);
      if (r.error) setError(r.error);
      else {
        setEntry(r.entry as ItEntry);
        setLinks(r.links || []);
      }
    } catch {
      setError("Không tải được hồ sơ.");
    } finally {
      setLoading(false);
    }
  }
  async function unlink(d: string) {
    if (!confirm("Gỡ liên kết chứng từ khỏi khoản chi?")) return;
    const r = await linkItDocument(d, "entry", id, true);
    if (r.error) setError(r.error);
    else {
      showToast(r.success!);
      setLinks(links.filter((l) => l.document_id !== d));
    }
  }
  // ModalTrigger normally supplies this boundary; this lazy editor supplies it explicitly.
  return (
    <>
      <button className="text-button" type="button" onClick={load}>
        Xem / Sửa
      </button>
      <AppModal
        open={open}
        onClose={() => setOpen(false)}
        title="Hồ sơ chi phí CNTT"
        size="wide"
      >
        {loading ? <p role="status">Đang tải hồ sơ…</p> : null}
        {error ? (
          <p role="alert" className="form-error">
            {error}
          </p>
        ) : null}
        {!loading && entry ? (
          <ActionSuccessContext.Provider
            value={() => {
              setOpen(false);
              setTimeout(() => router.refresh(), 0);
            }}
          >
            <ItEntryForm
              initial={entry}
              categories={categories}
              services={services}
              periods={periods}
              canCancel={canRemove}
            />
          </ActionSuccessContext.Provider>
        ) : null}
        <div className="it-document-list">
          {links.map((l) => {
            const d = l.it_documents as { name: string } | null;
            return (
              <div key={l.document_id}>
                <a
                  className="secondary-button"
                  href={`/api/it-costs/documents/${l.document_id}`}
                  target="_blank"
                  rel="noreferrer"
                >
                  {d?.name || "Xem chứng từ"}
                </a>
                {canRemove ? (
                  <button
                    className="text-button"
                    type="button"
                    onClick={() => void unlink(l.document_id)}
                  >
                    Gỡ liên kết
                  </button>
                ) : null}
              </div>
            );
          })}
        </div>
      </AppModal>
    </>
  );
}
export function ItManualEntry({
  categories,
  services,
  periods,
}: {
  categories: ItCategory[];
  services: ItService[];
  periods: ItPeriod[];
}) {
  return (
    <ModalTrigger
      title="Ghi nhận chi phí CNTT"
      triggerLabel="+ Chi phí"
      size="wide"
    >
      <ItEntryForm
        categories={categories}
        services={services}
        periods={periods}
      />
    </ModalTrigger>
  );
}
