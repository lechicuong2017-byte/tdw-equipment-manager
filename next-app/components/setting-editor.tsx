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
  type SettingType,
} from "@/lib/settings";
import type { Setting } from "@/lib/types";

const initialState: SettingsFormState = {};

export function SettingEditor({
  setting,
  defaultType,
  lockType = false,
}: {
  setting?: Setting;
  defaultType?: SettingType;
  lockType?: boolean;
}) {
  const [state, formAction, pending] = useActionState(saveSetting, initialState);
  const [displayName, setDisplayName] = useState(setting?.display_name ?? "");
  const [settingType, setSettingType] = useState<SettingType>(
    (setting?.setting_type as SettingType | undefined) ?? defaultType ?? "asset_group",
  );
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
          <h2>{setting ? setting.display_name : lockType ? `${settingTypeDefinitions[settingType].label} mới` : "Cấu hình mới"}</h2>
        </div>
      </div>
      {lockType ? (
        <>
          <input name="setting_type" type="hidden" value={settingType} />
          <div className="setting-editor-type">
            <small>Danh mục</small>
            <strong>{settingTypeDefinitions[settingType].label}</strong>
          </div>
        </>
      ) : (
        <label>
          Loại cấu hình
          <select
            name="setting_type"
            onChange={(event) => setSettingType(event.target.value as SettingType)}
            value={settingType}
          >
            {settingTypes.map((type) => (
              <option key={type} value={type}>{settingTypeDefinitions[type].label}</option>
            ))}
          </select>
        </label>
      )}
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
        {lockType
          ? "Mã nội bộ tự sinh từ tên hiển thị. Khi đổi tên, các thiết bị và dữ liệu đang dùng mục này được cập nhật theo cùng lúc."
          : "Khi đổi tên, mã nội bộ và dữ liệu đang liên kết được cập nhật cùng lúc. Chỉ đổi loại cấu hình khi mục này chưa được sử dụng."}
      </p>
      {state.error ? <p className="form-error" role="alert">{state.error}</p> : null}
      <button className="primary-button" disabled={pending} type="submit">
        {pending ? "Đang lưu…" : setting ? "Lưu thay đổi" : "Thêm cấu hình"}
      </button>
    </form>
  );
}
