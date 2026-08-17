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

export function MediaUpload({ assetId }: { assetId: string }) {
  const [state, formAction, pending] = useActionState(
    uploadAssetMedia,
    initialState,
  );

  return (
    <ModalTrigger
      description="Ảnh này thuộc hồ sơ thiết bị và được dùng làm ảnh đại diện; không đưa vào nhật ký bảo trì."
      eyebrow="ẢNH THIẾT BỊ"
      size="medium"
      title="Thêm ảnh thiết bị (đại diện)"
      triggerClassName="secondary-button"
      triggerLabel="+ Thêm hình ảnh"
    >
      <form action={formAction} className="upload-form">
        <ActionStateToast state={state} />
        <input name="asset_id" type="hidden" value={assetId} />
        <ImageFilePicker
          help="JPEG, PNG hoặc WebP · tối đa 5 MB"
          inputName="file"
          label="Chọn ảnh thiết bị"
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
