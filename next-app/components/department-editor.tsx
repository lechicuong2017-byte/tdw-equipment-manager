"use client";

import Link from "next/link";
import { useActionState } from "react";
import {
  saveDepartment,
  type SettingsFormState,
} from "@/app/(protected)/admin/settings/actions";
import type { Department } from "@/lib/types";

const initialState: SettingsFormState = {};

export function DepartmentEditor({ department }: { department?: Department }) {
  const [state, formAction, pending] = useActionState(saveDepartment, initialState);
  return (
    <form action={formAction} className="panel data-form compact-form settings-editor">
      <input name="id" type="hidden" value={department?.id ?? ""} />
      <div className="panel-heading">
        <div>
          <p className="eyebrow">{department ? "SỬA PHÒNG BAN" : "THÊM PHÒNG BAN"}</p>
          <h2>{department?.name ?? "Phòng ban mới"}</h2>
        </div>
        {department ? <Link className="text-button" href="/admin/settings">Hủy sửa</Link> : null}
      </div>
      <label>
        Tên phòng ban *
        <input defaultValue={department?.name} maxLength={160} name="name" required />
      </label>
      <label>
        Người phụ trách
        <input defaultValue={department?.manager_name} maxLength={160} name="manager_name" />
      </label>
      <label>
        Vị trí
        <input defaultValue={department?.location} maxLength={200} name="location" />
      </label>
      <label>
        Ghi chú
        <textarea defaultValue={department?.note} maxLength={1000} name="note" rows={3} />
      </label>
      <p className="form-help">Phòng ban đã dùng không bị xóa để giữ nguyên phân bổ thiết bị và phạm vi người dùng.</p>
      {state.error ? <p className="form-error" role="alert">{state.error}</p> : null}
      {state.success ? <p className="form-success" role="status">{state.success}</p> : null}
      <button className="primary-button" disabled={pending} type="submit">
        {pending ? "Đang lưu…" : department ? "Lưu phòng ban" : "Thêm phòng ban"}
      </button>
    </form>
  );
}
