"use client";

import { useState } from "react";

type WorkbookFilePickerProps = {
  label: string;
  name: string;
  required?: boolean;
};

export function WorkbookFilePicker({ label, name, required = true }: WorkbookFilePickerProps) {
  const [fileName, setFileName] = useState("");

  return (
    <label className="workbook-file-field">
      <span>{label}</span>
      <span className="app-file-picker">
        <input
          accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
          aria-label={label}
          name={name}
          onChange={(event) => setFileName(event.target.files?.[0]?.name ?? "")}
          required={required}
          type="file"
        />
        <strong>Chọn file XLSX</strong>
        <em title={fileName}>{fileName || "Chưa chọn file"}</em>
      </span>
    </label>
  );
}
