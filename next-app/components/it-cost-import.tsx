"use client";
import { useState, useRef, useEffect } from "react";
import { useRouter } from "next/navigation";
import { AppModal } from "@/components/app-modal";
import {
  ActionSuccessContext,
  useActionToast,
} from "@/components/action-toast";
import { ItLineEditor, ItEntryForm } from "./it-cost-forms";
import {
  compareItDocument,
  prepareItUpload,
  registerItDocument,
  linkItDocument,
  findItEntryCandidates,
} from "@/app/(protected)/it-costs/actions";
import {
  itDocumentSchema,
  emptyItLine,
  itSum,
  type ItCategory,
  type ItService,
  type ItPeriod,
  type ItLine,
} from "@/lib/it-costs";
import {
  draftItDocument,
  type ItDocumentDraft,
  type ItTextSource,
} from "@/lib/it-cost-documents";
import { formatMoney } from "@/lib/format";
import { createClient } from "@/lib/supabase/client";

type Compare = Awaited<ReturnType<typeof compareItDocument>>;
export function ItCostImport({
  categories,
  services,
  periods,
}: {
  categories: ItCategory[];
  services: ItService[];
  periods: ItPeriod[];
}) {
  const [open, setOpen] = useState(false),
    [file, setFile] = useState<File | null>(null),
    [url, setUrl] = useState("");
  const [draft, setDraft] = useState<ItDocumentDraft | null>(null),
    [sources, setSources] = useState<ItTextSource[]>([]),
    [lines, setLines] = useState<ItLine[]>([]),
    [selected, setSelected] = useState(new Set<string>());
  const [kind, setKind] = useState<"invoice" | "contract" | "quote" | "other">(
      "invoice",
    ),
    [force, setForce] = useState(false),
    [mode, setMode] = useState("new"),
    [target, setTarget] = useState("");
  const [progress, setProgress] = useState(""),
    [error, setError] = useState(""),
    [hash, setHash] = useState(""),
    [compare, setCompare] = useState<Compare>(),
    [documentId, setDocumentId] = useState("");
  const [verified, setVerified] = useState(false);
  const controller = useRef<AbortController | null>(null),
    revision = useRef(0),
    uploadId = useRef(crypto.randomUUID());
  const [entries, setEntries] = useState<
    {
      id: string;
      provider: string;
      recognized_on: string;
      description: string;
    }[]
  >([]);
  const router = useRouter(),
    { showToast } = useActionToast();
  useEffect(() => {
    if (!file) {
      setUrl("");
      return;
    }
    const u = URL.createObjectURL(file);
    setUrl(u);
    return () => URL.revokeObjectURL(u);
  }, [file]);
  const reset = () => {
    revision.current++;
    controller.current?.abort();
    setDraft(null);
    setLines([]);
    setSelected(new Set());
    setSources([]);
    setError("");
    setProgress("");
    setDocumentId("");
    setCompare(undefined);
    setVerified(false);
    uploadId.current = crypto.randomUUID();
  };
  const close = () => {
    reset();
    setFile(null);
    setOpen(false);
  };
  const finish = () => {
    close();
    setTimeout(() => router.refresh(), 0);
  };
  async function read() {
    if (!file) return;
    reset();
    const request = revision.current;
    controller.current = new AbortController();
    setProgress("Đang mở chứng từ…");
    try {
      const { readItDocument } = await import("@/lib/it-document-reader");
      const s = await readItDocument(
        file,
        controller.current.signal,
        (m) => {
          if (request === revision.current) setProgress(m);
        },
        force,
      );
      if (request !== revision.current) return;
      const d = draftItDocument(s);
      const h = Array.from(
        new Uint8Array(
          await crypto.subtle.digest("SHA-256", await file.arrayBuffer()),
        ),
      )
        .map((v) => v.toString(16).padStart(2, "0"))
        .join("");
      const c = await compareItDocument(h, d.reference);
      if (request !== revision.current) return;
      if (c.error) throw new Error(c.error);
      setHash(h);
      setDraft(d);
      setSources(s);
      setLines(d.lines);
      setCompare(c);
      setSelected(
        new Set(
          d.lines
            .filter((l) => !c.used?.some((u) => u.source_key === l.source_key))
            .map((l) => l.source_key),
        ),
      );
    } catch (e) {
      if (request === revision.current)
        setError(e instanceof Error ? e.message : "Không đọc được chứng từ.");
    } finally {
      if (request === revision.current) setProgress("");
    }
  }
  const chosen = lines.filter((l) => selected.has(l.source_key));
  const patch = (p: Partial<ItDocumentDraft>) => {
    if (draft) setDraft({ ...draft, ...p });
    setVerified(false);
  };
  async function findEntries() {
    if (!draft) return;
    try {
      const r = await findItEntryCandidates(draft.provider);
      if (r.error) setError(r.error);
      else setEntries(r.entries || []);
    } catch {
      setError("Không tìm được hồ sơ liên kết.");
    }
  }
  async function store() {
    if (!file || !draft || !verified) return;
    setError("");
    setProgress("Đang lưu chứng từ…");
    const request = revision.current;
    let path = "";
    try {
      const latest = await compareItDocument(hash, draft.reference, {
        issuer_tax_code: draft.issuer_tax_code,
        number: draft.number,
        series: draft.series,
        kind,
      });
      if (latest.error) throw new Error(latest.error);
      setCompare(latest);
      if (latest.differentFile && mode === "new") {
        setMode("link");
        await findEntries();
        throw new Error(
          "Số hóa đơn này đã lưu từ tệp khác. Hãy liên kết hồ sơ cũ để tránh cộng lại chi phí.",
        );
      }
      let id = latest.saved?.id || documentId;
      if (!id) {
        const mime = file.name.toLowerCase().endsWith(".pdf")
          ? "application/pdf"
          : "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
        const meta = itDocumentSchema.safeParse({
          id: uploadId.current,
          kind,
          ...draft,
          hash,
          name: file.name,
          mime,
          size: file.size,
        });
        if (!meta.success)
          throw new Error("Kiểm tra thông tin và tổng tiền chứng từ.");
        const upload = await prepareItUpload(uploadId.current, mime);
        if (upload.error || !upload.token || !upload.path)
          throw new Error(upload.error || "Không tải được tệp.");
        path = upload.path;
        const supabase = createClient();
        const uploaded = await supabase.storage
          .from("it-cost-documents")
          .uploadToSignedUrl(path, upload.token, file, { contentType: mime });
        if (uploaded.error)
          throw new Error("Tải tệp thất bại. Vui lòng thử lại.");
        const saved = await registerItDocument(meta.data);
        if (saved.error || !saved.id)
          throw new Error(saved.error || "Không lưu được chứng từ.");
        id = saved.id;
        if (id !== uploadId.current)
          await supabase.storage.from("it-cost-documents").remove([path]);
        path = "";
      }
      if (request !== revision.current) return;
      setDocumentId(id);
      if (mode === "new") {
        if (!chosen.length)
          throw new Error("Chọn ít nhất một dòng để ghi nhận chi phí.");
        setProgress("");
        return;
      }
      if (mode === "link") {
        const linked = await linkItDocument(id, "entry", target);
        if (linked.error) throw new Error(linked.error);
        showToast(linked.success!);
        finish();
      } else {
        showToast("Đã lưu hồ sơ chứng từ. Chưa ghi nhận chi phí.");
        finish();
      }
    } catch (e) {
      if (path)
        await createClient().storage.from("it-cost-documents").remove([path]);
      if (request === revision.current)
        setError(e instanceof Error ? e.message : "Không lưu được chứng từ.");
    } finally {
      if (request === revision.current) setProgress("");
    }
  }
  return (
    <>
      <button
        className="secondary-button"
        type="button"
        onClick={() => setOpen(true)}
      >
        Nhập PDF / DOCX
      </button>
      <AppModal
        open={open}
        onClose={close}
        title="Nhập chứng từ chi phí CNTT"
        eyebrow="HÓA ĐƠN · HỢP ĐỒNG · BÁO GIÁ"
        size="wide"
        description="Đọc, đối chiếu và chọn dòng cần ghi nhận. Tải chứng từ lên chưa tự xác nhận thanh toán."
      >
        <div
          className="it-import"
          data-unsaved-changes={draft ? "true" : "false"}
        >
          <div className="it-fields">
            <label>
              Tệp PDF / DOCX · tối đa 20 MB
              <input
                type="file"
                accept=".pdf,.docx"
                onChange={(e) => {
                  reset();
                  setFile(e.target.files?.[0] || null);
                }}
                disabled={!!documentId}
              />
            </label>
            <label>
              Loại chứng từ
              <select
                value={kind}
                onChange={(e) => setKind(e.target.value as typeof kind)}
                disabled={!!documentId}
              >
                <option value="invoice">Hóa đơn</option>
                <option value="contract">Hợp đồng</option>
                <option value="quote">Báo giá</option>
                <option value="other">Khác</option>
              </select>
            </label>
          </div>
          <div className="it-toolbar">
            <label className="it-checkbox">
              <input
                type="checkbox"
                checked={force}
                onChange={(e) => setForce(e.target.checked)}
              />
              OCR toàn bộ PDF nếu bảng là ảnh
            </label>
            <button
              className="secondary-button"
              type="button"
              onClick={() => void read()}
              disabled={!!progress || !file || !!documentId}
            >
              Đọc và xem trước
            </button>
            {progress ? (
              <>
                <span role="status">{progress}</span>
                <button className="text-button" type="button" onClick={reset}>
                  Hủy
                </button>
              </>
            ) : null}
          </div>
          {error ? (
            <p className="form-error" role="alert">
              {error}
            </p>
          ) : null}
          {draft && !documentId ? (
            <>
              <div className="it-source-review">
                <div className="it-source-pane">
                  {file?.name.toLowerCase().endsWith(".pdf") ? (
                    <object
                      data={url}
                      type="application/pdf"
                      aria-label="Chứng từ gốc"
                    >
                      <a href={url} target="_blank" rel="noreferrer">
                        Mở chứng từ gốc
                      </a>
                    </object>
                  ) : (
                    <a
                      href={url}
                      className="secondary-button"
                      download={file?.name}
                    >
                      Tải DOCX gốc
                    </a>
                  )}
                  <details>
                    <summary>Nội dung nhận diện để đối chiếu</summary>
                    {sources.map((s) => (
                      <section key={s.ref}>
                        <h4>{s.ref}</h4>
                        <pre>{s.text}</pre>
                      </section>
                    ))}
                  </details>
                </div>
                <div className="it-meta-pane">
                  {draft.warnings.map((w) => (
                    <p className="it-notice" key={w}>
                      {w}
                    </p>
                  ))}
                  <div className="it-fields">
                    <label>
                      Nhà cung cấp
                      <input
                        value={draft.provider}
                        maxLength={200}
                        onChange={(e) => patch({ provider: e.target.value })}
                      />
                    </label>
                    <label>
                      MST nhà cung cấp
                      <input
                        value={draft.issuer_tax_code}
                        maxLength={20}
                        onChange={(e) =>
                          patch({ issuer_tax_code: e.target.value })
                        }
                      />
                    </label>
                    <label>
                      Số chứng từ
                      <input
                        value={draft.number}
                        maxLength={150}
                        onChange={(e) => patch({ number: e.target.value })}
                      />
                    </label>
                    <label>
                      Ký hiệu
                      <input
                        value={draft.series}
                        maxLength={50}
                        onChange={(e) => patch({ series: e.target.value })}
                      />
                    </label>
                    <label>
                      Ngày chứng từ
                      <input
                        type="date"
                        value={draft.issued_on}
                        onChange={(e) => patch({ issued_on: e.target.value })}
                      />
                    </label>
                    <label>
                      Hợp đồng tham chiếu
                      <input
                        value={draft.reference}
                        maxLength={200}
                        onChange={(e) => patch({ reference: e.target.value })}
                      />
                    </label>
                    <label>
                      Tổng tiền chứng từ
                      <input
                        type="number"
                        min="0"
                        step="0.01"
                        value={draft.total_amount ?? ""}
                        onChange={(e) =>
                          patch({
                            total_amount:
                              e.target.value === ""
                                ? null
                                : Number(e.target.value),
                          })
                        }
                      />
                    </label>
                  </div>
                </div>
              </div>
              {compare?.saved ? (
                <p className="it-notice">
                  Tệp này đã lưu. Các dòng đã nhập được khóa; bạn có thể nhập bổ
                  sung dòng còn lại.
                </p>
              ) : null}
              {compare?.candidates?.length ? (
                <div className="it-notice">
                  <strong>
                    Tìm thấy hợp đồng tham chiếu. Kiểm tra liên kết để tránh
                    cộng trùng.
                  </strong>
                  {compare.candidates.map((c) => (
                    <p key={c.id}>
                      {c.name}
                      {(c.it_document_links as { entry_id: string | null }[])
                        .filter((l) => l.entry_id)
                        .map((l) => (
                          <button
                            className="text-button"
                            key={l.entry_id}
                            onClick={() => {
                              setMode("link");
                              setTarget(l.entry_id!);
                            }}
                            type="button"
                          >
                            Liên kết khoản chi {l.entry_id?.slice(0, 8)}
                          </button>
                        ))}
                    </p>
                  ))}
                </div>
              ) : null}
              <ItLineEditor
                lines={lines}
                setLines={setLines}
                categories={categories}
                services={services}
                periods={periods}
                selectable
                selected={selected}
                setSelected={setSelected}
                usedKeys={compare?.used?.map((u) => u.source_key)}
              />
              <div className="it-toolbar">
                <button
                  className="secondary-button"
                  type="button"
                  onClick={() => {
                    const l = {
                      ...emptyItLine(),
                      source_key: crypto.randomUUID(),
                      source_ref: "Dòng bổ sung thủ công",
                    };
                    setLines([...lines, l]);
                    setSelected(new Set([...selected, l.source_key]));
                  }}
                >
                  + Tách thêm dòng
                </button>
                <button
                  className="text-button"
                  type="button"
                  onClick={() => setSelected(new Set())}
                >
                  Bỏ chọn
                </button>
                <strong>
                  {chosen.length} dòng ·{" "}
                  {Number.isFinite(itSum(chosen))
                    ? formatMoney(itSum(chosen))
                    : "Cần bổ sung số tiền"}
                </strong>
              </div>
              <div className="it-fields">
                <label>
                  Cách lưu
                  <select
                    value={mode}
                    onChange={(e) => {
                      setMode(e.target.value);
                      if (e.target.value === "link") void findEntries();
                    }}
                  >
                    <option value="new">Tạo chi phí từ dòng đã chọn</option>
                    <option value="link">
                      Bổ sung chứng từ cho khoản chi đã lưu
                    </option>
                    <option value="file">Chỉ lưu hồ sơ / báo giá</option>
                  </select>
                </label>
                {mode === "link" ? (
                  <label>
                    Khoản chi đã lưu
                    <select
                      value={target}
                      onChange={(e) => setTarget(e.target.value)}
                    >
                      <option value="">Chọn hồ sơ để liên kết</option>
                      {target && !entries.some((e) => e.id === target) ? (
                        <option value={target}>
                          Hồ sơ từ hợp đồng tham chiếu đã chọn
                        </option>
                      ) : null}
                      {entries.map((e) => (
                        <option key={e.id} value={e.id}>
                          {e.recognized_on} · {e.provider} ·{" "}
                          {e.description.slice(0, 60)}
                        </option>
                      ))}
                    </select>
                    <button
                      className="text-button"
                      type="button"
                      onClick={() => void findEntries()}
                    >
                      Tìm theo nhà cung cấp
                    </button>
                  </label>
                ) : null}
              </div>
              <label className="it-checkbox">
                <input
                  type="checkbox"
                  checked={verified}
                  onChange={(e) => setVerified(e.target.checked)}
                />
                Tôi đã đối chiếu thông tin với chứng từ gốc.
              </label>
              <div className="it-form-footer">
                <p>
                  Chỉ dòng đã chọn được ghi nhận. Hợp đồng và hóa đơn cùng khoản
                  chi cần liên kết để tránh tính hai lần.
                </p>
                <button
                  className="primary-button"
                  type="button"
                  onClick={() => void store()}
                  disabled={
                    !verified ||
                    !!progress ||
                    (mode === "new" && !chosen.length)
                  }
                >
                  {mode === "new"
                    ? "Tiếp tục ghi nhận chi phí"
                    : "Lưu chứng từ"}
                </button>
              </div>
            </>
          ) : null}
          {documentId && mode === "new" ? (
            <ActionSuccessContext.Provider value={finish}>
              <ItEntryForm
                key={documentId}
                categories={categories}
                services={services}
                periods={periods}
                documentId={documentId}
                sourceLines={chosen}
                sourceTotal={draft?.total_amount}
                initial={{
                  id: "",
                  request_id: crypto.randomUUID(),
                  version: 1,
                  provider: draft?.provider || "",
                  recognized_on: draft?.issued_on || "",
                  description: "",
                  status: "confirmed",
                  payment_status: "unconfirmed",
                  paid_on: "",
                  document_id: documentId,
                  discrepancy_reason: "",
                  lines: chosen,
                }}
              />
            </ActionSuccessContext.Provider>
          ) : null}
        </div>
      </AppModal>
    </>
  );
}
