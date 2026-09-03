"use client";

import { useState } from "react";

type WorkbookFilePickerProps = {
  label: string;
  name: string;
  onFileChange?: (fileName: string) => void;
  required?: boolean;
};

export function WorkbookFilePicker({ label, name, onFileChange, required = true }: WorkbookFilePickerProps) {
  const [fileName, setFileName] = useState("");

  return (
    <label className="workbook-file-field">
      <span>{label}</span>
      <span className="app-file-picker">
        <input
          accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
          aria-label={label}
          name={name}
          onChange={(event) => {
            const nextFileName = event.target.files?.[0]?.name ?? "";
            setFileName(nextFileName);
            onFileChange?.(nextFileName);
          }}
          required={required}
          type="file"
        />
        <strong>Chọn file XLSX</strong>
        <em title={fileName}>{fileName || "Chưa chọn file"}</em>
      </span>
    </label>
  );
}
