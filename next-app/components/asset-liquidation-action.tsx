"use client";

import { useActionState, useState } from "react";
import {
  liquidateAsset,
  type LiquidationActionState,
} from "@/app/(protected)/assets/actions";
import { ActionStateToast, ActionSuccessBoundary } from "@/components/action-toast";
import { AppModal } from "@/components/app-modal";

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
  lazy = false,
  preselectedAssetId,
  triggerClassName = "secondary-button",
}: {
  assets: LiquidationAssetOption[];
  lazy?: boolean;
  preselectedAssetId?: string;
  triggerClassName?: string;
}) {
  const [state, formAction, pending] = useActionState(liquidateAsset, initialState);
  const [open, setOpen] = useState(false);
  const [options, setOptions] = useState(assets);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState("");
  const selectedId = preselectedAssetId ?? options[0]?.id ?? "";

  const openModal = async () => {
    setOpen(true);
    if (!lazy || options.length || loading) return;
    setLoading(true);
    setLoadError("");
    try {
      const response = await fetch("/api/assets/liquidation-options");
      const payload = await response.json() as { assets?: LiquidationAssetOption[]; error?: string };
      if (!response.ok) throw new Error(payload.error || "Không thể tải danh sách thiết bị.");
      setOptions(payload.assets ?? []);
    } catch (error) {
      setLoadError(error instanceof Error ? error.message : "Không thể tải danh sách thiết bị.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      <button className={triggerClassName} onClick={openModal} type="button">Ghi nhận thanh lý</button>
      <AppModal
        description="Thiết bị sẽ được chuyển sang mục riêng và vẫn giữ đầy đủ lịch sử để báo cáo."
        eyebrow="THANH LÝ"
        onClose={() => setOpen(false)}
        open={open}
        size="medium"
        title="Ghi nhận thiết bị đã thanh lý"
      >
      <ActionSuccessBoundary onSuccess={() => setOpen(false)}>
      <form action={formAction} className="liquidation-form">
        <ActionStateToast state={state} />
        <label className="span-2">
          Thiết bị *
          <select defaultValue={selectedId} disabled={loading} key={selectedId} name="asset_id" required>
            {options.map((asset) => (
              <option key={asset.id} value={asset.id}>
                {asset.asset_code} — {asset.asset_name}
              </option>
            ))}
          </select>
        </label>
        {loading ? <p className="form-hint span-2">Đang tải danh sách thiết bị…</p> : null}
        {loadError ? <p className="form-error span-2" role="alert">{loadError}</p> : null}
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
          <button className="danger-button" disabled={pending || loading || !options.length} type="submit">
            {pending ? "Đang ghi nhận…" : "Xác nhận đã thanh lý"}
          </button>
        </div>
      </form>
      </ActionSuccessBoundary>
      </AppModal>
    </>
  );
}
