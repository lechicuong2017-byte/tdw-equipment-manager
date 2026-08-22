"use client";

import { useRef, useState } from "react";

const maxSourceBytes = 20 * 1024 * 1024;
const maxUploadBytes = 5 * 1024 * 1024;
const maxRasterPages = 40;

function formatBytes(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

function canvasToJpeg(canvas: HTMLCanvasElement, quality: number) {
  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (blob) resolve(blob);
      else reject(new Error("Không thể nén trang PDF"));
    }, "image/jpeg", quality);
  });
}

async function optimizePdf(file: File) {
  const sourceBytes = new Uint8Array(await file.arrayBuffer());
  const [{ PDFArray, PDFDict, PDFDocument, PDFName }, pdfjs] = await Promise.all([
    import("pdf-lib"),
    import("pdfjs-dist/legacy/build/pdf.mjs"),
  ]);

  pdfjs.GlobalWorkerOptions.workerSrc = new URL(
    "pdfjs-dist/legacy/build/pdf.worker.min.mjs",
    import.meta.url,
  ).toString();

  const sourceDocument = await PDFDocument.load(sourceBytes, {
    ignoreEncryption: false,
    updateMetadata: false,
  });
  const pageCount = sourceDocument.getPageCount();
  if (!pageCount || pageCount > 200) throw new Error("Hóa đơn phải có từ 1 đến 200 trang.");

  sourceDocument.catalog.delete(PDFName.of("OpenAction"));
  sourceDocument.catalog.delete(PDFName.of("AA"));
  const names = sourceDocument.catalog.lookupMaybe(PDFName.of("Names"), PDFDict);
  names?.delete(PDFName.of("JavaScript"));
  names?.delete(PDFName.of("EmbeddedFiles"));
  sourceDocument.getPages().forEach((page) => {
    const annotations = page.node.lookupMaybe(PDFName.of("Annots"), PDFArray);
    annotations?.asArray().forEach((reference) => {
      const annotation = sourceDocument.context.lookup(reference, PDFDict);
      annotation?.delete(PDFName.of("A"));
      annotation?.delete(PDFName.of("AA"));
    });
  });

  const losslessBytes = await sourceDocument.save({
    addDefaultPage: false,
    objectsPerTick: 50,
    updateFieldAppearances: false,
    useObjectStreams: true,
  });

  const candidates: { bytes: Uint8Array; method: "không mất chất lượng" | "nén mạnh" }[] = [
    { bytes: losslessBytes, method: "không mất chất lượng" },
  ];

  if (sourceBytes.byteLength >= 650 * 1024 && pageCount <= maxRasterPages) {
    const loadingTask = pdfjs.getDocument({
      data: sourceBytes.slice(),
      isEvalSupported: false,
      useWorkerFetch: false,
    });
    const renderedSource = await loadingTask.promise;
    const rasterDocument = await PDFDocument.create();

    for (let pageNumber = 1; pageNumber <= renderedSource.numPages; pageNumber += 1) {
      const sourcePage = await renderedSource.getPage(pageNumber);
      const pageSize = sourcePage.getViewport({ scale: 1 });
      const renderViewport = sourcePage.getViewport({ scale: 1.7 });
      const canvas = document.createElement("canvas");
      canvas.width = Math.ceil(renderViewport.width);
      canvas.height = Math.ceil(renderViewport.height);
      const context = canvas.getContext("2d", { alpha: false });
      if (!context) throw new Error("Trình duyệt không hỗ trợ nén PDF.");
      context.fillStyle = "#ffffff";
      context.fillRect(0, 0, canvas.width, canvas.height);
      await sourcePage.render({ canvas, canvasContext: context, viewport: renderViewport }).promise;
      const imageBlob = await canvasToJpeg(canvas, 0.74);
      const image = await rasterDocument.embedJpg(await imageBlob.arrayBuffer());
      const outputPage = rasterDocument.addPage([pageSize.width, pageSize.height]);
      outputPage.drawImage(image, {
        height: pageSize.height,
        width: pageSize.width,
        x: 0,
        y: 0,
      });
      sourcePage.cleanup();
      canvas.width = 1;
      canvas.height = 1;
    }

    const rasterBytes = await rasterDocument.save({
      addDefaultPage: false,
      objectsPerTick: 20,
      useObjectStreams: true,
    });
    candidates.push({ bytes: rasterBytes, method: "nén mạnh" });
    await renderedSource.destroy();
  }

  candidates.sort((left, right) => left.bytes.byteLength - right.bytes.byteLength);
  return { ...candidates[0], originalBytes: sourceBytes.byteLength, pageCount };
}

export function PdfInvoicePicker({
  existingFileName,
  fieldName = "invoice_pdf",
  label = "Hóa đơn / chứng từ PDF",
}: {
  existingFileName?: string | null;
  fieldName?: string;
  label?: string;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [optimizing, setOptimizing] = useState(false);
  const [compressionMethod, setCompressionMethod] = useState("");
  const [originalByteSize, setOriginalByteSize] = useState("");

  async function handleFile(file: File | undefined) {
    setError("");
    setMessage("");
    setCompressionMethod("");
    setOriginalByteSize("");
    if (!file) return;
    if (file.type !== "application/pdf" || !file.name.toLowerCase().endsWith(".pdf")) {
      setError("Chỉ chấp nhận tệp PDF.");
      if (inputRef.current) inputRef.current.value = "";
      return;
    }
    if (file.size > maxSourceBytes) {
      setError("PDF gốc không được vượt quá 20 MB.");
      if (inputRef.current) inputRef.current.value = "";
      return;
    }

    setOptimizing(true);
    try {
      const result = await optimizePdf(file);
      if (result.bytes.byteLength > maxUploadBytes) {
        throw new Error("Sau khi nén, PDF vẫn vượt quá 5 MB. Hãy scan lại ở 150 DPI hoặc chia nhỏ hóa đơn.");
      }
      const optimizedBuffer = result.bytes.slice().buffer as ArrayBuffer;
      const optimizedFile = new File([optimizedBuffer], file.name.slice(0, 200), {
        lastModified: Date.now(),
        type: "application/pdf",
      });
      const transfer = new DataTransfer();
      transfer.items.add(optimizedFile);
      if (inputRef.current) inputRef.current.files = transfer.files;
      setCompressionMethod(result.method === "nén mạnh" ? "RASTERIZED" : "LOSSLESS");
      setOriginalByteSize(String(result.originalBytes));
      const savedPercent = Math.max(0, Math.round((1 - optimizedFile.size / result.originalBytes) * 100));
      setMessage(
        savedPercent > 0
          ? `Đã nén ${formatBytes(result.originalBytes)} → ${formatBytes(optimizedFile.size)} (${savedPercent}%) · ${result.pageCount} trang · ${result.method}.`
          : `PDF đã tối ưu sẵn · ${formatBytes(optimizedFile.size)} · ${result.pageCount} trang.`,
      );
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Không thể đọc hoặc nén PDF này.");
      if (inputRef.current) inputRef.current.value = "";
    } finally {
      setOptimizing(false);
    }
  }

  return (
    <label className="span-3 vehicle-pdf-picker">
      <span>{label}</span>
      {existingFileName ? <small>Đang lưu: {existingFileName}. Chọn tệp mới để thay thế.</small> : null}
      <input
        accept=".pdf,application/pdf"
        disabled={optimizing}
        name={fieldName}
        onChange={(event) => void handleFile(event.currentTarget.files?.[0])}
        ref={inputRef}
        type="file"
      />
      <input name={`${fieldName}_optimizing`} type="hidden" value={optimizing ? "1" : "0"} />
      <input name={`${fieldName}_compression_method`} type="hidden" value={compressionMethod} />
      <input name={`${fieldName}_original_byte_size`} type="hidden" value={originalByteSize} />
      <small>Tự động chọn bản nhỏ nhất giữa PDF gốc, nén không mất chất lượng và nén mạnh hóa đơn scan. Tệp gửi lên tối đa 5 MB.</small>
      <small>Tên tệp sẽ được chuẩn hóa tự động theo hồ sơ khi lưu.</small>
      {optimizing ? <em>Đang tối ưu dung lượng PDF…</em> : null}
      {message ? <em className="vehicle-pdf-success">{message}</em> : null}
      {error ? <em className="vehicle-pdf-error">{error}</em> : null}
    </label>
  );
}
