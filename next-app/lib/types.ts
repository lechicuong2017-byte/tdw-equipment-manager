export type AccessProfile = {
  user_id: string;
  email: string;
  full_name: string;
  active: boolean;
  must_enroll_mfa: boolean;
  roles: string[];
  permissions: string[];
};

export type Asset = {
  id: string;
  legacy_id: string | null;
  asset_kind: "DEVICE" | "COMPONENT";
  asset_code: string;
  asset_name: string;
  asset_group: string;
  asset_group_label: string;
  asset_type: string;
  brand: string;
  model: string;
  serial_number: string;
  purchase_year: number | null;
  purchase_date: string | null;
  quantity: number;
  unit_price: number;
  total_price: number;
  assigned_to_name: string;
  department_id: string | null;
  department_legacy_name: string;
  location: string;
  status: string;
  quality_level: string;
  warranty_end_date: string | null;
  last_maintenance_date: string | null;
  next_check_date: string | null;
  note: string;
  created_at: string;
  updated_at: string;
};

export type AssetComponentSummary = Pick<
  Asset,
  | "id"
  | "asset_code"
  | "asset_name"
  | "asset_type"
  | "brand"
  | "model"
  | "serial_number"
  | "status"
  | "warranty_end_date"
>;

export type AssetComponentInstallation = {
  id: string;
  host_asset_id: string;
  component_asset_id: string;
  installed_at: string;
  removed_at: string | null;
  slot_name: string;
  install_note: string;
  removal_reason: string;
  removal_note: string;
  component?: AssetComponentSummary | null;
  host?: AssetComponentSummary | null;
};

export type DashboardStats = {
  total_assets: number;
  device_assets: number;
  component_assets: number;
  installed_components: number;
  available_components: number;
  active_assets: number;
  needs_attention: number;
  stored_assets: number;
  total_value: number;
  by_status: Record<string, number>;
};

export type Department = {
  id: string;
  name: string;
  manager_name?: string;
  location?: string;
  note?: string;
};

export type Setting = {
  id: string;
  setting_type: string;
  setting_value: string;
  display_name: string;
  sort_order: number;
  active: boolean;
};

export type ResponsibleUser = {
  id: string;
  email: string;
  full_name: string;
};

export type AssetResponsible = {
  user_id: string;
  responsibility_role: "primary" | "secondary";
};

export type MediaFile = {
  id: string;
  object_path: string;
  thumbnail_path: string | null;
  file_name: string;
  mime_type: string;
  byte_size: number;
  checksum?: string | null;
  sort_order: number;
  created_at: string;
  signed_url?: string;
  thumbnail_signed_url?: string;
};
