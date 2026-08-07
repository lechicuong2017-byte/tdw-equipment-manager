"use client";

import { useActionState } from "react";
import {
  liquidateAsset,
  type LiquidationActionState,
} from "@/app/(protected)/assets/actions";
import { ActionStateToast } from "@/components/action-toast";
import { ModalTrigger } from "@/components/app-modal";

type LiquidationAssetOption = {
  id: string;
  asset_code: string;
  asset_name: string;
};

const initialState: LiquidationActionState = {};

function vietnamToday() {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Ho_Chi_Minh",
  }).format(new Date());
}

export function AssetLiquidationAction({
  assets,
  preselectedAssetId,
  triggerClassName = "secondary-button",
}: {
  assets: LiquidationAssetOption[];
  preselectedAssetId?: string;
  triggerClassName?: string;
}) {
  const [state, formAction, pending] = useActionState(liquidateAsset, initialState);
  const selectedId = preselectedAssetId ?? assets[0]?.id ?? "";

  return (
    <ModalTrigger
      description="Thiết bị sẽ được chuyển sang mục riêng và vẫn giữ đầy đủ lịch sử để báo cáo."
      eyebrow="THANH LÝ"
      size="medium"
      title="Ghi nhận thiết bị đã thanh lý"
      triggerClassName={triggerClassName}
      triggerLabel="Ghi nhận thanh lý"
    >
      <form action={formAction} className="liquidation-form">
        <ActionStateToast state={state} />
        <label className="span-2">
          Thiết bị *
          <select defaultValue={selectedId} name="asset_id" required>
            {assets.map((asset) => (
              <option key={asset.id} value={asset.id}>
                {asset.asset_code} — {asset.asset_name}
              </option>
            ))}
          </select>
        </label>
        <label>
          Ngày thanh lý *
          <input defaultValue={vietnamToday()} max={vietnamToday()} name="liquidation_date" required type="date" />
        </label>
        <label>
          Giá trị thu hồi
          <input min={0} name="recovery_value" placeholder="0" step="1000" type="number" />
        </label>
        <label className="span-2">
          Lý do thanh lý *
          <input maxLength={500} name="reason" placeholder="Ví dụ: Hư hỏng, hết khấu hao…" required />
        </label>
        <label className="span-2">
          Ghi chú
          <textarea maxLength={2000} name="note" placeholder="Số quyết định, đơn vị tiếp nhận hoặc thông tin liên quan" rows={4} />
        </label>
        {state.error ? <p className="form-error span-2" role="alert">{state.error}</p> : null}
        <div className="modal-actions span-2">
          <button className="danger-button" disabled={pending || !assets.length} type="submit">
            {pending ? "Đang ghi nhận…" : "Xác nhận đã thanh lý"}
          </button>
        </div>
      </form>
    </ModalTrigger>
  );
}
