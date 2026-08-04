"use client";

import { useActionState, useState } from "react";
import {
  saveSetting,
  type SettingsFormState,
} from "@/app/(protected)/admin/settings/actions";
import { ActionStateToast } from "@/components/action-toast";
import {
  settingTypeDefinitions,
  settingTypes,
  settingValueFromDisplayName,
} from "@/lib/settings";
import type { Setting } from "@/lib/types";

const initialState: SettingsFormState = {};

export function SettingEditor({ setting }: { setting?: Setting }) {
  const [state, formAction, pending] = useActionState(saveSetting, initialState);
  const [displayName, setDisplayName] = useState(setting?.display_name ?? "");
  const [settingType, setSettingType] = useState(setting?.setting_type ?? "asset_group");
  const nameChanged = Boolean(setting) && displayName.trim() !== setting?.display_name;
  const generatedValue = setting && !nameChanged
    ? setting.setting_value
    : settingValueFromDisplayName(displayName);

  return (
    <form action={formAction} className="panel data-form compact-form settings-editor">
      <ActionStateToast state={state} />
      <input name="id" type="hidden" value={setting?.id ?? ""} />
      <div className="panel-heading">
        <div>
          <p className="eyebrow">{setting ? "SỬA DANH MỤC" : "THÊM DANH MỤC"}</p>
          <h2>{setting ? setting.display_name : "Cấu hình mới"}</h2>
        </div>
      </div>
      <label>
        Loại cấu hình
        <select
          name="setting_type"
          onChange={(event) => setSettingType(event.target.value as typeof settingType)}
          value={settingType}
        >
          {settingTypes.map((type) => (
            <option key={type} value={type}>{settingTypeDefinitions[type].label}</option>
          ))}
        </select>
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
        Khi đổi tên, mã nội bộ và dữ liệu đang liên kết được cập nhật cùng lúc. Chỉ đổi loại cấu hình khi mục này chưa được sử dụng.
      </p>
      {state.error ? <p className="form-error" role="alert">{state.error}</p> : null}
      <button className="primary-button" disabled={pending} type="submit">
        {pending ? "Đang lưu…" : setting ? "Lưu thay đổi" : "Thêm cấu hình"}
      </button>
    </form>
  );
}
