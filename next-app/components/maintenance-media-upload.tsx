"use client";

import { useActionState, useEffect } from "react";
import { useRouter } from "next/navigation";
import {
  type MaintenanceMediaFormState,
  uploadMaintenanceMedia,
} from "@/app/(protected)/maintenance/actions";
import { ActionStateToast } from "@/components/action-toast";
import { ModalTrigger } from "@/components/app-modal";

const initialState: MaintenanceMediaFormState = {};

export function MaintenanceMediaUpload({
  maintenanceLogId,
  mediaCount,
}: {
  maintenanceLogId: string;
  mediaCount: number;
}) {
  const router = useRouter();
  const [state, formAction, pending] = useActionState(
    uploadMaintenanceMedia,
    initialState,
  );

  useEffect(() => {
    if (state.success) router.refresh();
  }, [router, state.success]);

  return (
    <ModalTrigger
      description="Chọn ảnh JPEG, PNG hoặc WebP, tổng dung lượng tối đa 5 MB mỗi lần tải."
      eyebrow="HÌNH ẢNH"
      size="medium"
      title="Ảnh ghi nhận bảo trì"
      triggerClassName="text-button"
      triggerLabel={mediaCount ? `Ảnh (${mediaCount})` : "+ Ảnh"}
    >
      <form action={formAction} className="upload-form">
        <ActionStateToast state={state} />
        <input
          name="maintenance_log_id"
          type="hidden"
          value={maintenanceLogId}
        />
        <label className="upload-drop">
          <span aria-hidden="true">＋</span>
          <strong>Chọn hình ảnh</strong>
          <small>JPEG, PNG hoặc WebP · tổng tối đa 5 MB/lần · chọn tối đa 5 ảnh</small>
          <input
            accept="image/jpeg,image/png,image/webp"
            multiple
            name="files"
            required
            type="file"
          />
        </label>
        {state.error ? <p className="form-error" role="alert">{state.error}</p> : null}
        <div className="modal-actions">
          <button className="primary-button" disabled={pending} type="submit">
            {pending ? "Đang tải…" : "Tải ảnh lên"}
          </button>
        </div>
      </form>
    </ModalTrigger>
  );
}
