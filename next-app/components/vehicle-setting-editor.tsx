"use client";

import { useActionState, useState } from "react";
import {
  saveVehicleSetting,
  type VehicleActionState,
} from "@/app/(protected)/vehicles/actions";
import { ActionStateToast } from "@/components/action-toast";
import {
  settingValueFromDisplayName,
  vehicleSettingTypeDefinitions,
  type VehicleSettingType,
} from "@/lib/settings";
import type { Setting } from "@/lib/types";

const initialState: VehicleActionState = {};

export function VehicleSettingEditor({
  setting,
  settingType,
}: {
  setting?: Setting;
  settingType: VehicleSettingType;
}) {
  const [state, formAction, pending] = useActionState(saveVehicleSetting, initialState);
  const [displayName, setDisplayName] = useState(setting?.display_name ?? "");
  const nameChanged = Boolean(setting) && displayName.trim() !== setting?.display_name;
  const generatedValue = setting && !nameChanged
    ? setting.setting_value
    : settingValueFromDisplayName(displayName);

  return (
    <form action={formAction} className="data-form vehicle-form settings-editor">
      <ActionStateToast state={state} />
      <input name="id" type="hidden" value={setting?.id ?? ""} />
      <input name="setting_type" type="hidden" value={settingType} />
      <input name="setting_value" type="hidden" value={setting?.setting_value ?? ""} />
      <input name="original_display_name" type="hidden" value={setting?.display_name ?? ""} />
      <label>
        Danh mục
        <input readOnly value={vehicleSettingTypeDefinitions[settingType].label} />
      </label>
      <label>
        Tên hiển thị *
        <input
          maxLength={160}
          name="display_name"
          onChange={(event) => setDisplayName(event.target.value)}
          required
          value={displayName}
        />
      </label>
      <label>
        Mã nội bộ
        <input readOnly value={generatedValue} />
      </label>
      <p className="form-help">
        Khi đổi tên, mã nội bộ và các hồ sơ xe đang dùng lựa chọn này sẽ được cập nhật cùng lúc.
      </p>
      {state.error ? <p className="form-error" role="alert">{state.error}</p> : null}
      <div className="form-actions">
        <button className="primary-button" disabled={pending} type="submit">
          {pending ? "Đang lưu…" : setting ? "Lưu thay đổi" : "Thêm cấu hình"}
        </button>
      </div>
    </form>
  );
}
