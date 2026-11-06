"use client";

import { useActionState } from "react";
import { runStorageImport, type StorageImportState } from "./actions";

export function StorageImportButton({ disabled }: { disabled: boolean }) {
  const [state, action, pending] = useActionState<StorageImportState>(runStorageImport, {});
  return (
    <form action={action} className="storage-import-form">
      <button className="primary-button" disabled={disabled || pending} type="submit">
        {pending ? "Đang chuyển file… (có thể mất tới 1 phút)" : "Chuyển file từ Supabase"}
      </button>
      {state.error ? <p className="form-error" role="alert">{state.error}</p> : null}
      {state.run ? (
        <div className="storage-import-result" role="status">
          <p>
            Đã chuyển <strong>{state.run.copied}</strong> file
            {state.run.failed.length ? <>, lỗi <strong>{state.run.failed.length}</strong> file</> : null}.
            {state.run.remaining > 0 ? ` Còn ${state.run.remaining} file — bấm lại để chuyển tiếp.` : ""}
          </p>
          {state.run.failed.length ? (
            <ul>
              {state.run.failed.slice(0, 10).map((item) => <li key={item.name}><code>{item.name}</code> — {item.error}</li>)}
            </ul>
          ) : null}
        </div>
      ) : null}
    </form>
  );
}
