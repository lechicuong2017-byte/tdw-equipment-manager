"use client";

import { useActionState } from "react";
import {
  uploadAssetMedia,
  type MediaFormState,
} from "@/app/(protected)/assets/actions";
import { ModalTrigger } from "@/components/app-modal";

const initialState: MediaFormState = {};

export function MediaUpload({ assetId }: { assetId: string }) {
  const [state, formAction, pending] = useActionState(
    uploadAssetMedia,
    initialState,
  );

  return (
    <ModalTrigger
      description="Chọn ảnh JPEG, PNG hoặc WebP có dung lượng tối đa 5 MB."
      eyebrow="HÌNH ẢNH"
      size="medium"
      title="Thêm ảnh thiết bị"
      triggerClassName="secondary-button"
      triggerLabel="+ Thêm hình ảnh"
    >
      <form action={formAction} className="upload-form">
        <input name="asset_id" type="hidden" value={assetId} />
        <label className="upload-drop">
          <span aria-hidden="true">＋</span>
          <strong>Chọn hình ảnh</strong>
          <small>JPEG, PNG hoặc WebP · tối đa 5 MB</small>
          <input accept="image/jpeg,image/png,image/webp" name="file" required type="file" />
        </label>
        {state.error ? <p className="form-error" role="alert">{state.error}</p> : null}
        {state.success ? <p className="form-success" role="status">{state.success}</p> : null}
        <div className="modal-actions">
          <button className="primary-button" disabled={pending} type="submit">
            {pending ? "Đang tải…" : "Tải ảnh lên"}
          </button>
        </div>
      </form>
    </ModalTrigger>
  );
}
