import { checkDocxArchive, type ItTextSource } from "./it-cost-documents";
import { telecomPageText } from "./telecom-invoices";
export async function readItDocument(
  file: File,
  signal: AbortSignal,
  progress: (s: string) => void,
  forceOcr = false,
): Promise<ItTextSource[]> {
  if (file.size > 20 * 1024 * 1024) throw new Error("Tệp tối đa 20 MB.");
  const bytes = new Uint8Array(await file.arrayBuffer());
  let worker:
    | Awaited<ReturnType<typeof import("tesseract.js").createWorker>>
    | undefined;
  const check = () => {
    if (signal.aborted) throw new DOMException("Đã hủy đọc tệp.", "AbortError");
  };
  async function ocr(image: HTMLCanvasElement | Blob, ref: string) {
    check();
    progress(`Đang nhận diện ${ref}…`);
    if (!worker) {
      const t = await import("tesseract.js");
      worker = await t.createWorker("vie", 1, {
        workerPath: "/ocr/worker.min.js",
        corePath: "/ocr",
        langPath: "/ocr",
        gzip: false,
        cacheMethod: "none",
        logger: (m) => {
          if (!signal.aborted && m.status === "recognizing text")
            progress(`${ref} · ${Math.round(m.progress * 100)}%`);
        },
      });
    }
    check();
    const r = await worker.recognize(image, {}, { blocks: true });
    const lines =
      r.data.blocks?.flatMap((b) => b.paragraphs.flatMap((p) => p.lines)) || [];
    // Preserve large horizontal column gaps without sending OCR text elsewhere.
    return lines.length
      ? lines
          .map((l) =>
            l.words
              .map(
                (w, i) =>
                  `${i && w.bbox.x0 - l.words[i - 1].bbox.x1 > Math.max(22, l.bbox.y1 - l.bbox.y0) ? " | " : i ? " " : ""}${w.text}`,
              )
              .join(""),
          )
          .join("\n")
      : r.data.text;
  }
  const abort = () => {
    void worker?.terminate();
  };
  signal.addEventListener("abort", abort);
  try {
    if (file.name.toLowerCase().endsWith(".pdf")) {
      if (new TextDecoder().decode(bytes.slice(0, 5)) !== "%PDF-")
        throw new Error("Tệp không có chữ ký PDF hợp lệ.");
      const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
      pdfjs.GlobalWorkerOptions.workerSrc = new URL(
        "pdfjs-dist/legacy/build/pdf.worker.min.mjs",
        import.meta.url,
      ).toString();
      const task = pdfjs.getDocument({
        data: bytes,
        isEvalSupported: false,
        useWorkerFetch: false,
      });
      const stop = () => {
        void task.destroy();
      };
      signal.addEventListener("abort", stop);
      const doc = await task.promise;
      try {
        if (doc.numPages > 50) throw new Error("PDF tối đa 50 trang.");
        const sources: ItTextSource[] = [];
        for (let n = 1; n <= doc.numPages; n++) {
          check();
          progress(`Đang đọc trang ${n}/${doc.numPages}…`);
          const page = await doc.getPage(n),
            content = await page.getTextContent();
          let text = telecomPageText(content.items.filter((i) => "str" in i));
          const useOcr = forceOcr || text.replace(/\s/g, "").length < 100;
          if (useOcr) {
            const viewport = page.getViewport({
                scale: Math.min(
                  2.2,
                  2200 / page.getViewport({ scale: 1 }).width,
                ),
              }),
              canvas = document.createElement("canvas");
            canvas.width = Math.ceil(viewport.width);
            canvas.height = Math.ceil(viewport.height);
            await page.render({ canvas, viewport }).promise;
            text = await ocr(canvas, `Trang ${n}`);
            canvas.width = canvas.height = 0;
          }
          sources.push({ ref: `Trang ${n}`, text, ocr: useOcr });
          page.cleanup();
        }
        return sources;
      } finally {
        signal.removeEventListener("abort", stop);
        await doc.destroy();
      }
    }
    if (!file.name.toLowerCase().endsWith(".docx"))
      throw new Error("Chỉ nhận PDF hoặc DOCX.");
    checkDocxArchive(bytes);
    const { default: JSZip } = await import("jszip");
    const zip = await JSZip.loadAsync(bytes);
    if (!zip.file("word/document.xml") || zip.file("word/vbaProject.bin"))
      throw new Error("Chọn DOCX thông thường, không có macro.");
    const sources: ItTextSource[] = [];
    for (const name of Object.keys(zip.files)
      .filter((n) => /^word\/(document|header\d*|footer\d*)\.xml$/.test(n))
      .sort()) {
      check();
      const xml = await zip.file(name)!.async("string");
      if (/<!DOCTYPE|<!ENTITY/i.test(xml))
        throw new Error("DOCX chứa khai báo XML không được hỗ trợ.");
      const tree = new DOMParser().parseFromString(xml, "application/xml");
      if (tree.getElementsByTagName("parsererror").length)
        throw new Error("Nội dung DOCX lỗi.");
      const body =
        tree.getElementsByTagNameNS("*", "body")[0] || tree.documentElement;
      const paragraph = (e: Element) =>
        Array.from(e.getElementsByTagNameNS("*", "t"))
          .map((n) => n.textContent || "")
          .join("");
      const rows: string[] = [];
      for (const e of Array.from(body.children)) {
        if (e.localName === "tbl")
          for (const row of Array.from(e.getElementsByTagNameNS("*", "tr")))
            rows.push(
              Array.from(row.children)
                .filter((c) => c.localName === "tc")
                .map(paragraph)
                .join(" | "),
            );
        else rows.push(paragraph(e));
      }
      sources.push({
        ref: name.replace("word/", ""),
        text: rows.join("\n"),
        ocr: false,
      });
    }
    const media = Object.keys(zip.files).filter((n) =>
      /^word\/media\/.*\.(png|jpe?g|webp)$/i.test(n),
    );
    if (media.length > 50)
      throw new Error(
        "DOCX tối đa 50 ảnh cần OCR. Hãy tách chứng từ thành các tệp nhỏ hơn.",
      );
    for (const name of media) {
      check();
      const blob = new Blob([await zip.file(name)!.async("arraybuffer")]);
      sources.push({
        ref: name.replace("word/", ""),
        text: await ocr(blob, name.replace("word/", "")),
        ocr: true,
      });
    }
    return sources;
  } finally {
    signal.removeEventListener("abort", abort);
    await worker?.terminate();
  }
}
