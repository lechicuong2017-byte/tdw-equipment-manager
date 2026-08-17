"use client";

import { useEffect, useRef, useState } from "react";

type SelectedImage = {
  file: File;
  id: string;
  url: string;
};

type ImageFilePickerProps = {
  dropClassName?: string;
  help: string;
  inputName: string;
  label: string;
  maxFiles?: number;
  multiple?: boolean;
  required?: boolean;
  tone?: "asset" | "maintenance";
};

function fileId(file: File, index: number) {
  return `${file.name}-${file.size}-${file.lastModified}-${index}`;
}

export function ImageFilePicker({
  dropClassName = "",
  help,
  inputName,
  label,
  maxFiles = 1,
  multiple = false,
  required = false,
  tone = "asset",
}: ImageFilePickerProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [files, setFiles] = useState<File[]>([]);
  const [previews, setPreviews] = useState<SelectedImage[]>([]);
  const [selectionMessage, setSelectionMessage] = useState("");

  useEffect(() => {
    const nextPreviews = files.map((file, index) => ({
      file,
      id: fileId(file, index),
      url: URL.createObjectURL(file),
    }));
    setPreviews(nextPreviews);
    return () => nextPreviews.forEach((preview) => URL.revokeObjectURL(preview.url));
  }, [files]);

  function updateInputFiles(nextFiles: File[]) {
    if (inputRef.current) {
      const transfer = new DataTransfer();
      nextFiles.forEach((file) => transfer.items.add(file));
      inputRef.current.files = transfer.files;
    }
    setFiles(nextFiles);
  }

  function handleSelection(event: React.ChangeEvent<HTMLInputElement>) {
    const selectedFiles = [...(event.target.files ?? [])].filter((file) =>
      file.type.startsWith("image/"),
    );
    const limitedFiles = selectedFiles.slice(0, multiple ? maxFiles : 1);
    setSelectionMessage(
      selectedFiles.length > limitedFiles.length
        ? `Chỉ giữ ${limitedFiles.length} ảnh đầu tiên theo giới hạn của mục này.`
        : "",
    );
    updateInputFiles(limitedFiles);
  }

  function removeFile(index: number) {
    setSelectionMessage("");
    updateInputFiles(files.filter((_, fileIndex) => fileIndex !== index));
  }

  return (
    <div className={`image-file-picker image-file-picker--${tone}`}>
      <label className={`upload-drop ${dropClassName}`.trim()}>
        <span aria-hidden="true">＋</span>
        <strong>{files.length ? "Chọn lại hình ảnh" : label}</strong>
        <small>{help}</small>
        <input
          accept="image/jpeg,image/png,image/webp"
          multiple={multiple}
          name={inputName}
          onChange={handleSelection}
          ref={inputRef}
          required={required}
          type="file"
        />
      </label>

      {previews.length ? (
        <section aria-label="Ảnh đã chọn" className="image-file-preview-section">
          <div className="image-file-preview-heading">
            <strong>{previews.length} ảnh đã chọn</strong>
            <button onClick={() => updateInputFiles([])} type="button">Bỏ tất cả</button>
          </div>
          <div className="image-file-preview-grid">
            {previews.map((preview, index) => (
              <figure className="image-file-preview" key={preview.id}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img alt={`Xem trước ${preview.file.name}`} src={preview.url} />
                <figcaption>
                  <span title={preview.file.name}>{preview.file.name}</span>
                  <button
                    aria-label={`Bỏ ảnh ${preview.file.name}`}
                    onClick={() => removeFile(index)}
                    type="button"
                  >
                    ×
                  </button>
                </figcaption>
              </figure>
            ))}
          </div>
        </section>
      ) : null}
      {selectionMessage ? <p className="form-help">{selectionMessage}</p> : null}
    </div>
  );
}
