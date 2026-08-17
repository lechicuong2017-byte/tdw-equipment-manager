"use client";

import { useActionState, useEffect } from "react";
import { useRouter } from "next/navigation";
import {
  type MaintenanceMediaFormState,
  uploadMaintenanceMedia,
} from "@/app/(protected)/maintenance/actions";
import { ActionStateToast } from "@/components/action-toast";
import { ImageFilePicker } from "@/components/image-file-picker";
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
        <ImageFilePicker
          help="JPEG, PNG hoặc WebP · tổng tối đa 5 MB/lần · chọn tối đa 5 ảnh"
          inputName="files"
          label="Chọn hình ảnh"
          maxFiles={5}
          multiple
          required
        />
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
