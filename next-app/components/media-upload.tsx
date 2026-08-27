"use client";

import { useActionState } from "react";
import {
  uploadAssetMedia,
  type MediaFormState,
} from "@/app/(protected)/assets/actions";
import { ActionStateToast } from "@/components/action-toast";
import { ModalTrigger } from "@/components/app-modal";
import { ImageFilePicker } from "@/components/image-file-picker";

const initialState: MediaFormState = {};

export function MediaUpload({
  assetId,
  existingCount,
}: {
  assetId: string;
  existingCount: number;
}) {
  const [state, formAction, pending] = useActionState(
    uploadAssetMedia,
    initialState,
  );
  const remainingSlots = Math.max(0, 5 - existingCount);

  if (!remainingSlots) {
    return (
      <p className="form-help">
        Thiết bị đã đủ 5 ảnh. Hãy xóa ảnh cũ nếu muốn tải ảnh khác lên.
      </p>
    );
  }

  return (
    <ModalTrigger
      description="Ảnh này thuộc hồ sơ thiết bị và được dùng làm ảnh đại diện; không đưa vào nhật ký bảo trì."
      eyebrow="ẢNH THIẾT BỊ"
      size="medium"
      title="Thêm ảnh thiết bị (tối đa 5 ảnh)"
      triggerClassName="secondary-button"
      triggerLabel="+ Thêm hình ảnh"
    >
      <form action={formAction} className="upload-form">
        <ActionStateToast state={state} />
        <input name="asset_id" type="hidden" value={assetId} />
        <ImageFilePicker
          help={`JPEG, PNG hoặc WebP · tối đa 5 MB/ảnh · còn ${remainingSlots} vị trí`}
          inputName="files"
          label={remainingSlots > 1 ? "Chọn các ảnh thiết bị" : "Chọn ảnh thiết bị"}
          maxFiles={remainingSlots}
          multiple={remainingSlots > 1}
          required
          tone="asset"
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
