"use client";

import { useActionState, useEffect } from "react";
import Image from "next/image";
import { useRouter } from "next/navigation";
import {
  deleteMaintenanceMedia,
  type MaintenanceMediaFormState,
  uploadMaintenanceMedia,
} from "@/app/(protected)/maintenance/actions";
import { ActionStateToast } from "@/components/action-toast";
import { ImageFilePicker } from "@/components/image-file-picker";
import { ConfirmAction, ModalTrigger } from "@/components/app-modal";

const initialState: MaintenanceMediaFormState = {};

export function MaintenanceMediaUpload({
  maintenanceLogId,
  media,
}: {
  maintenanceLogId: string;
  media: {
    file_name: string;
    id: string;
    signed_url: string | null;
  }[];
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
      description="Ảnh chỉ thuộc lần bảo trì này; không được dùng làm ảnh đại diện của thiết bị."
      eyebrow="ẢNH BẢO TRÌ"
      size="medium"
      title="Ảnh của lần bảo trì"
      triggerClassName="text-button"
      triggerLabel={media.length ? `Ảnh bảo trì (${media.length})` : "+ Ảnh bảo trì"}
    >
      <form action={formAction} className="upload-form">
        <ActionStateToast state={state} />
        <input
          name="maintenance_log_id"
          type="hidden"
          value={maintenanceLogId}
        />
        {media.length ? (
          <section className="maintenance-saved-media" aria-label="Ảnh bảo trì đã lưu">
            <div className="maintenance-saved-media-heading">
              <strong>Ảnh bảo trì đã lưu</strong>
              <small>{media.length} ảnh · chỉ thuộc nhật ký này</small>
            </div>
            <div className="maintenance-saved-media-grid">
              {media.map((item) => (
                <figure key={item.id}>
                  {item.signed_url ? (
                    <Image
                      alt={item.file_name || "Ảnh bảo trì"}
                      height={180}
                      src={item.signed_url}
                      unoptimized
                      width={240}
                    />
                  ) : (
                    <div className="media-unavailable">Không thể tải ảnh</div>
                  )}
                  <figcaption>
                    <span title={item.file_name}>{item.file_name}</span>
                    <ConfirmAction
                      action={deleteMaintenanceMedia}
                      description={`Ảnh “${item.file_name}” sẽ chỉ bị xóa khỏi nhật ký bảo trì này.`}
                      fields={{
                        id: item.id,
                        maintenance_log_id: maintenanceLogId,
                      }}
                      title="Xóa ảnh bảo trì?"
                      triggerAriaLabel={`Xóa ảnh bảo trì ${item.file_name}`}
                      triggerClassName="media-delete-trigger"
                      triggerLabel="×"
                    />
                  </figcaption>
                </figure>
              ))}
            </div>
          </section>
        ) : (
          <p className="maintenance-media-empty">Nhật ký này chưa có ảnh bảo trì.</p>
        )}
        <ImageFilePicker
          help="JPEG, PNG hoặc WebP · tổng tối đa 5 MB/lần · chọn tối đa 5 ảnh"
          inputName="files"
          label="Chọn ảnh bảo trì"
          maxFiles={5}
          multiple
          required
          tone="maintenance"
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
