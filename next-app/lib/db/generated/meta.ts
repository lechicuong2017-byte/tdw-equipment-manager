// Sinh tự động bởi tools/mariadb/gen_ts_meta.py — KHÔNG sửa tay.
/* eslint-disable */
import type { PolicyFragments } from "@/lib/db/policy-fragments";

export type ColumnKind = "uuid" | "json" | "bool" | "int" | "bigint" | "num" | "date" | "ts" | "text";

export const TABLE_COLUMNS: Record<string, Record<string, ColumnKind>> = {
  "asset_code_counters": {
    "prefix": "text",
    "code_year": "int",
    "last_sequence": "int",
    "updated_at": "ts"
  },
  "asset_component_installations": {
    "id": "uuid",
    "host_asset_id": "uuid",
    "component_asset_id": "uuid",
    "installed_at": "date",
    "removed_at": "date",
    "slot_name": "text",
    "install_note": "text",
    "removal_reason": "text",
    "removal_note": "text",
    "installed_by": "uuid",
    "removed_by": "uuid",
    "created_at": "ts",
    "updated_at": "ts"
  },
  "asset_documents": {
    "id": "uuid",
    "asset_id": "uuid",
    "document_kind": "text",
    "bucket_id": "text",
    "object_path": "text",
    "file_name": "text",
    "mime_type": "text",
    "original_byte_size": "bigint",
    "stored_byte_size": "bigint",
    "compression_method": "text",
    "checksum": "text",
    "page_count": "int",
    "created_by": "uuid",
    "created_at": "ts",
    "updated_at": "ts"
  },
  "asset_liquidations": {
    "id": "uuid",
    "asset_id": "uuid",
    "liquidation_date": "date",
    "recovery_value": "num",
    "reason": "text",
    "note": "text",
    "recorded_by": "uuid",
    "created_at": "ts",
    "voided_at": "ts",
    "voided_by": "uuid",
    "void_reason": "text"
  },
  "asset_responsibles": {
    "id": "uuid",
    "legacy_id": "text",
    "asset_id": "uuid",
    "user_id": "uuid",
    "responsibility_role": "text",
    "active": "bool",
    "created_at": "ts",
    "updated_at": "ts"
  },
  "assets": {
    "id": "uuid",
    "legacy_id": "text",
    "asset_code": "text",
    "asset_name": "text",
    "asset_group": "text",
    "asset_group_label": "text",
    "asset_type": "text",
    "brand": "text",
    "model": "text",
    "serial_number": "text",
    "purchase_year": "int",
    "purchase_date": "date",
    "quantity": "int",
    "unit_price": "num",
    "total_price": "num",
    "assigned_to_name": "text",
    "department_id": "uuid",
    "department_legacy_name": "text",
    "location": "text",
    "software_license_note": "text",
    "status": "text",
    "quality_level": "text",
    "warranty_end_date": "date",
    "last_maintenance_date": "date",
    "next_check_date": "date",
    "note": "text",
    "source_row": "int",
    "created_by": "uuid",
    "updated_by": "uuid",
    "created_at": "ts",
    "updated_at": "ts",
    "deleted_at": "ts",
    "deleted_by": "uuid",
    "asset_kind": "text",
    "search_text": "text"
  },
  "audit_logs": {
    "id": "bigint",
    "actor_user_id": "uuid",
    "action": "text",
    "table_name": "text",
    "record_id": "uuid",
    "old_data": "json",
    "new_data": "json",
    "metadata": "json",
    "created_at": "ts"
  },
  "company_surveys": {
    "id": "uuid",
    "public_token": "uuid",
    "title": "text",
    "description": "text",
    "questions": "json",
    "status": "text",
    "published_at": "ts",
    "revision": "int",
    "response_count": "int",
    "created_by": "uuid",
    "created_at": "ts",
    "updated_at": "ts"
  },
  "data_access_scopes": {
    "id": "uuid",
    "user_id": "uuid",
    "module": "text",
    "scope_type": "text",
    "department_id": "uuid",
    "created_by": "uuid",
    "created_at": "ts"
  },
  "departments": {
    "id": "uuid",
    "legacy_id": "text",
    "name": "text",
    "manager_name": "text",
    "location": "text",
    "note": "text",
    "created_at": "ts",
    "updated_at": "ts"
  },
  "export_jobs": {
    "id": "uuid",
    "export_type": "text",
    "filters": "json",
    "status": "text",
    "result_url": "text",
    "error": "text",
    "requested_by": "uuid",
    "created_at": "ts",
    "completed_at": "ts",
    "output_format": "text",
    "idempotency_key": "text"
  },
  "inventory_movements": {
    "id": "uuid",
    "legacy_id": "text",
    "asset_id": "uuid",
    "movement_date": "date",
    "from_user_id": "uuid",
    "to_user_id": "uuid",
    "from_user_name": "text",
    "to_user_name": "text",
    "from_location": "text",
    "to_location": "text",
    "reason": "text",
    "approved_by_name": "text",
    "note": "text",
    "created_by": "uuid",
    "created_at": "ts",
    "updated_at": "ts"
  },
  "it_cost_categories": {
    "id": "uuid",
    "code": "text",
    "name": "text",
    "sort_order": "int",
    "active": "bool",
    "created_at": "ts",
    "updated_at": "ts"
  },
  "it_cost_entries": {
    "id": "uuid",
    "request_id": "uuid",
    "provider": "text",
    "recognized_on": "date",
    "description": "text",
    "status": "text",
    "payment_status": "text",
    "paid_on": "date",
    "discrepancy_reason": "text",
    "version": "int",
    "created_by": "uuid",
    "updated_by": "uuid",
    "created_at": "ts",
    "updated_at": "ts"
  },
  "it_cost_entry_lines": {
    "id": "uuid",
    "entry_id": "uuid",
    "category_id": "uuid",
    "service_id": "uuid",
    "period_id": "uuid",
    "description": "text",
    "unit": "text",
    "quantity": "num",
    "unit_price": "num",
    "amount_before_tax": "num",
    "tax_amount": "num",
    "amount_after_tax": "num",
    "document_id": "uuid",
    "source_key": "text",
    "source_ref": "text"
  },
  "it_document_links": {
    "id": "uuid",
    "document_id": "uuid",
    "entry_id": "uuid",
    "service_id": "uuid",
    "period_id": "uuid",
    "created_by": "uuid",
    "created_at": "ts"
  },
  "it_documents": {
    "id": "uuid",
    "kind": "text",
    "provider": "text",
    "issuer_tax_code": "text",
    "number": "text",
    "series": "text",
    "issued_on": "date",
    "reference": "text",
    "total_amount": "num",
    "hash": "text",
    "storage_path": "text",
    "name": "text",
    "mime": "text",
    "size": "int",
    "created_by": "uuid",
    "created_at": "ts"
  },
  "it_service_periods": {
    "id": "uuid",
    "service_id": "uuid",
    "starts_on": "date",
    "expires_on": "date",
    "cycle": "text",
    "remind_days": "int",
    "renewed_from_id": "uuid",
    "status": "text",
    "note": "text",
    "version": "int",
    "created_by": "uuid",
    "updated_by": "uuid",
    "created_at": "ts",
    "updated_at": "ts"
  },
  "it_services": {
    "id": "uuid",
    "code": "text",
    "name": "text",
    "category_id": "uuid",
    "identifier": "text",
    "provider": "text",
    "location": "text",
    "note": "text",
    "status": "text",
    "version": "int",
    "created_by": "uuid",
    "updated_by": "uuid",
    "created_at": "ts",
    "updated_at": "ts"
  },
  "maintenance_logs": {
    "id": "uuid",
    "legacy_id": "text",
    "asset_id": "uuid",
    "plan_id": "uuid",
    "maintenance_date": "date",
    "action_type": "text",
    "description": "text",
    "cost": "num",
    "vendor": "text",
    "warranty_months": "int",
    "performed_by": "text",
    "note": "text",
    "created_by": "uuid",
    "created_at": "ts",
    "updated_at": "ts"
  },
  "maintenance_notification_logs": {
    "id": "uuid",
    "legacy_id": "text",
    "plan_id": "uuid",
    "asset_id": "uuid",
    "recipient_email": "text",
    "notification_type": "text",
    "due_date": "date",
    "sent_at": "ts",
    "status": "text",
    "error": "text",
    "created_at": "ts",
    "updated_at": "ts"
  },
  "maintenance_plans": {
    "id": "uuid",
    "legacy_id": "text",
    "asset_id": "uuid",
    "title": "text",
    "frequency": "text",
    "next_due_date": "date",
    "note": "text",
    "active": "bool",
    "created_by": "uuid",
    "created_at": "ts",
    "updated_at": "ts",
    "batch_id": "uuid",
    "scope_type": "text",
    "scope_value": "text",
    "repeat_enabled": "bool"
  },
  "media_files": {
    "id": "uuid",
    "legacy_id": "text",
    "owner_type": "text",
    "owner_id": "uuid",
    "asset_id": "uuid",
    "bucket_id": "text",
    "object_path": "text",
    "file_name": "text",
    "mime_type": "text",
    "byte_size": "bigint",
    "width": "int",
    "height": "int",
    "sort_order": "int",
    "legacy_drive_file_id": "text",
    "created_by": "uuid",
    "created_at": "ts",
    "updated_at": "ts",
    "thumbnail_path": "text",
    "checksum": "text"
  },
  "permissions": {
    "code": "text",
    "module": "text",
    "description": "text",
    "created_at": "ts"
  },
  "profiles": {
    "id": "uuid",
    "email": "text",
    "full_name": "text",
    "active": "bool",
    "must_enroll_mfa": "bool",
    "last_login_at": "ts",
    "created_at": "ts",
    "updated_at": "ts"
  },
  "role_permissions": {
    "role_id": "uuid",
    "permission_code": "text",
    "created_at": "ts"
  },
  "roles": {
    "id": "uuid",
    "code": "text",
    "name": "text",
    "created_at": "ts"
  },
  "settings": {
    "id": "uuid",
    "legacy_id": "text",
    "setting_type": "text",
    "setting_value": "text",
    "display_name": "text",
    "sort_order": "int",
    "active": "bool",
    "created_at": "ts",
    "updated_at": "ts"
  },
  "software_license_assets": {
    "id": "uuid",
    "license_id": "uuid",
    "asset_id": "uuid",
    "assigned_by": "uuid",
    "created_at": "ts"
  },
  "software_license_secrets": {
    "license_id": "uuid",
    "ciphertext": "text",
    "iv": "text",
    "auth_tag": "text",
    "encryption_version": "int",
    "updated_by": "uuid",
    "created_at": "ts",
    "updated_at": "ts"
  },
  "software_licenses": {
    "id": "uuid",
    "legacy_id": "text",
    "software_name": "text",
    "version": "text",
    "license_key_masked": "text",
    "license_secret_ref": "text",
    "assigned_asset_id": "uuid",
    "assigned_user_id": "uuid",
    "assigned_user_name": "text",
    "expiry_date": "date",
    "status": "text",
    "note": "text",
    "created_by": "uuid",
    "created_at": "ts",
    "updated_at": "ts"
  },
  "supply_inventory_balances": {
    "item_id": "uuid",
    "category": "text",
    "item_code": "text",
    "item_name": "text",
    "unit": "text",
    "active": "bool",
    "on_hand_quantity": "num",
    "total_receipt_value": "num",
    "last_movement_at": "ts"
  },
  "supply_inventory_movements": {
    "id": "uuid",
    "item_id": "uuid",
    "movement_type": "text",
    "quantity": "num",
    "unit_price": "num",
    "movement_date": "date",
    "source_type": "text",
    "source_id": "uuid",
    "source_line_id": "uuid",
    "reference_no": "text",
    "note": "text",
    "created_by": "uuid",
    "created_at": "ts"
  },
  "supply_items": {
    "id": "uuid",
    "category": "text",
    "item_code": "text",
    "item_name": "text",
    "unit": "text",
    "description": "text",
    "default_unit_price": "num",
    "active": "bool",
    "created_by": "uuid",
    "updated_by": "uuid",
    "created_at": "ts",
    "updated_at": "ts",
    "deleted_at": "ts"
  },
  "supply_quote_lines": {
    "id": "uuid",
    "quote_id": "uuid",
    "item_id": "uuid",
    "item_name": "text",
    "unit": "text",
    "quantity": "num",
    "unit_price": "num",
    "old_unit_price": "num",
    "amount": "num",
    "note": "text",
    "sort_order": "int",
    "created_by": "uuid",
    "updated_by": "uuid",
    "created_at": "ts",
    "updated_at": "ts",
    "category": "text",
    "item_code": "text"
  },
  "supply_quotes": {
    "id": "uuid",
    "quote_no": "text",
    "vendor_name": "text",
    "vendor_address": "text",
    "vendor_contact": "text",
    "category": "text",
    "quote_date": "date",
    "valid_until": "date",
    "status": "text",
    "subtotal": "num",
    "tax_rate": "num",
    "tax_amount": "num",
    "total_amount": "num",
    "note": "text",
    "source_file": "text",
    "source_sheet": "text",
    "import_fingerprint": "text",
    "created_by": "uuid",
    "updated_by": "uuid",
    "created_at": "ts",
    "updated_at": "ts",
    "deleted_at": "ts"
  },
  "supply_request_lines": {
    "id": "uuid",
    "request_id": "uuid",
    "item_id": "uuid",
    "item_name": "text",
    "unit": "text",
    "proposed_quantity": "num",
    "stock_quantity": "num",
    "ordered_quantity": "num",
    "requested_departments": "text",
    "approval_note": "text",
    "proposed_unit_price": "num",
    "approved_unit_price": "num",
    "amount": "num",
    "note": "text",
    "sort_order": "int",
    "created_by": "uuid",
    "updated_by": "uuid",
    "created_at": "ts",
    "updated_at": "ts",
    "item_code": "text"
  },
  "supply_requests": {
    "id": "uuid",
    "request_no": "text",
    "category": "text",
    "period_type": "text",
    "period_year": "int",
    "period_month": "int",
    "period_quarter": "int",
    "requested_on": "date",
    "required_on": "date",
    "department_id": "uuid",
    "requesting_department": "text",
    "requester_name": "text",
    "checker_name": "text",
    "approver_name": "text",
    "status": "text",
    "note": "text",
    "source_file": "text",
    "source_sheet": "text",
    "import_fingerprint": "text",
    "created_by": "uuid",
    "updated_by": "uuid",
    "created_at": "ts",
    "updated_at": "ts",
    "deleted_at": "ts"
  },
  "survey_responses": {
    "id": "uuid",
    "survey_id": "uuid",
    "submission_id": "uuid",
    "full_name": "text",
    "phone": "text",
    "email": "text",
    "answers": "json",
    "submitted_at": "ts"
  },
  "telecom_invoices": {
    "id": "uuid",
    "category": "text",
    "provider": "text",
    "issuer_tax_code": "text",
    "invoice_series": "text",
    "invoice_number": "text",
    "issued_on": "date",
    "period_month": "date",
    "subscriber": "text",
    "contract_number": "text",
    "service": "text",
    "group_name": "text",
    "amount_before_tax": "num",
    "tax_amount": "num",
    "amount_after_tax": "num",
    "source_file": "text",
    "source_page": "int",
    "paid_on": "date",
    "note": "text",
    "created_by": "uuid",
    "updated_by": "uuid",
    "created_at": "ts",
    "updated_at": "ts",
    "deleted_at": "ts"
  },
  "telecom_phones": {
    "id": "uuid",
    "phone": "text",
    "location": "text",
    "serial": "text",
    "replacement_phone": "text",
    "status": "text",
    "note": "text",
    "created_by": "uuid",
    "updated_by": "uuid",
    "created_at": "ts",
    "updated_at": "ts",
    "deleted_at": "ts"
  },
  "user_module_access": {
    "id": "uuid",
    "user_id": "uuid",
    "module": "text",
    "created_by": "uuid",
    "created_at": "ts"
  },
  "user_roles": {
    "user_id": "uuid",
    "role_id": "uuid",
    "created_at": "ts"
  },
  "vehicle_documents": {
    "id": "uuid",
    "vehicle_id": "uuid",
    "record_type": "text",
    "record_id": "uuid",
    "bucket_id": "text",
    "object_path": "text",
    "file_name": "text",
    "mime_type": "text",
    "original_byte_size": "bigint",
    "stored_byte_size": "bigint",
    "compression_method": "text",
    "checksum": "text",
    "page_count": "int",
    "created_by": "uuid",
    "created_at": "ts",
    "updated_at": "ts",
    "document_kind": "text"
  },
  "vehicle_fuel_logs": {
    "id": "uuid",
    "vehicle_id": "uuid",
    "payment_date": "date",
    "liters": "num",
    "odometer_from": "int",
    "odometer_to": "int",
    "amount": "num",
    "purchaser": "text",
    "note": "text",
    "source_file": "text",
    "source_sheet": "text",
    "source_row": "int",
    "import_fingerprint": "text",
    "created_by": "uuid",
    "updated_by": "uuid",
    "created_at": "ts",
    "updated_at": "ts"
  },
  "vehicle_inspection_notification_logs": {
    "id": "uuid",
    "inspection_id": "uuid",
    "vehicle_id": "uuid",
    "recipient_email": "text",
    "notification_type": "text",
    "due_date": "date",
    "sent_at": "ts",
    "status": "text",
    "error": "text",
    "created_at": "ts",
    "updated_at": "ts"
  },
  "vehicle_inspections": {
    "id": "uuid",
    "vehicle_id": "uuid",
    "inspection_date": "date",
    "expires_on": "date",
    "cost": "num",
    "reminder_days": "int",
    "certificate_number": "text",
    "inspection_center": "text",
    "odometer_km": "int",
    "note": "text",
    "created_by": "uuid",
    "updated_by": "uuid",
    "created_at": "ts",
    "updated_at": "ts",
    "seat_count": "int",
    "archived_at": "ts",
    "archived_by": "uuid",
    "archived_by_name": "text",
    "renewed_from_id": "uuid",
    "renewed_at": "ts",
    "renewed_by": "uuid",
    "renewed_by_name": "text"
  },
  "vehicle_insurances": {
    "id": "uuid",
    "vehicle_id": "uuid",
    "insurance_name": "text",
    "insurance_type": "text",
    "insurance_company": "text",
    "certificate_number": "text",
    "starts_on": "date",
    "expires_on": "date",
    "cost": "num",
    "reminder_days": "int",
    "note": "text",
    "created_by": "uuid",
    "updated_by": "uuid",
    "created_at": "ts",
    "updated_at": "ts",
    "archived_at": "ts",
    "archived_by": "uuid",
    "renewed_from_id": "uuid",
    "renewed_at": "ts",
    "renewed_by": "uuid",
    "renewed_by_name": "text"
  },
  "vehicle_repairs": {
    "id": "uuid",
    "vehicle_id": "uuid",
    "service_date": "date",
    "service_type": "text",
    "description": "text",
    "odometer_km": "int",
    "vat_amount": "num",
    "vendor": "text",
    "invoice_number": "text",
    "note": "text",
    "source_file": "text",
    "source_sheet": "text",
    "source_row": "int",
    "import_fingerprint": "text",
    "created_by": "uuid",
    "updated_by": "uuid",
    "created_at": "ts",
    "updated_at": "ts"
  },
  "vehicle_toll_monthly_batches": {
    "id": "uuid",
    "period_month": "date",
    "source_file_name": "text",
    "source_checksum": "text",
    "source_page_count": "int",
    "transaction_count": "int",
    "vehicle_count": "int",
    "station_count": "int",
    "amount_before_tax": "num",
    "tax_amount": "num",
    "amount_after_tax": "num",
    "created_by": "uuid",
    "updated_by": "uuid",
    "created_at": "ts",
    "updated_at": "ts"
  },
  "vehicle_toll_quarterly_passes": {
    "id": "uuid",
    "vehicle_id": "uuid",
    "vehicle_type": "text",
    "vehicle_color": "text",
    "license_plate": "text",
    "starts_on": "date",
    "expires_on": "date",
    "toll_station": "text",
    "amount": "num",
    "source_file": "text",
    "source_sheet": "text",
    "source_row": "int",
    "fingerprint": "text",
    "created_by": "uuid",
    "updated_by": "uuid",
    "created_at": "ts",
    "updated_at": "ts"
  },
  "vehicle_toll_quarterly_records": {
    "id": "uuid",
    "vehicle_id": "uuid",
    "vehicle_type": "text",
    "vehicle_color": "text",
    "license_plate": "text",
    "starts_on": "date",
    "expires_on": "date",
    "toll_station": "text",
    "amount": "num",
    "source_file": "text",
    "source_sheet": "text",
    "source_row": "int",
    "fingerprint": "text",
    "created_by": "uuid",
    "updated_by": "uuid",
    "created_at": "ts",
    "updated_at": "ts",
    "is_current": "bool"
  },
  "vehicle_toll_transactions": {
    "id": "uuid",
    "batch_id": "uuid",
    "vehicle_id": "uuid",
    "license_plate": "text",
    "toll_station": "text",
    "transaction_at": "ts",
    "invoice_number": "text",
    "transaction_code": "text",
    "amount_before_tax": "num",
    "tax_amount": "num",
    "amount_after_tax": "num",
    "source_page": "int",
    "fingerprint": "text",
    "created_at": "ts"
  },
  "vehicles": {
    "id": "uuid",
    "vehicle_code": "text",
    "vehicle_name": "text",
    "license_plate": "text",
    "brand": "text",
    "model": "text",
    "production_year": "int",
    "chassis_number": "text",
    "engine_number": "text",
    "fuel_norm_l_per_100km": "num",
    "assigned_driver": "text",
    "responsible_user_id": "uuid",
    "department_id": "uuid",
    "status": "text",
    "note": "text",
    "created_by": "uuid",
    "updated_by": "uuid",
    "created_at": "ts",
    "updated_at": "ts",
    "deleted_at": "ts",
    "seat_count": "int"
  }
};

export const PRIMARY_KEYS: Record<string, string[]> = {
  "roles": [
    "id"
  ],
  "permissions": [
    "code"
  ],
  "profiles": [
    "id"
  ],
  "user_roles": [
    "user_id",
    "role_id"
  ],
  "role_permissions": [
    "role_id",
    "permission_code"
  ],
  "departments": [
    "id"
  ],
  "settings": [
    "id"
  ],
  "assets": [
    "id"
  ],
  "asset_responsibles": [
    "id"
  ],
  "inventory_movements": [
    "id"
  ],
  "maintenance_plans": [
    "id"
  ],
  "maintenance_logs": [
    "id"
  ],
  "maintenance_notification_logs": [
    "id"
  ],
  "software_licenses": [
    "id"
  ],
  "media_files": [
    "id"
  ],
  "export_jobs": [
    "id"
  ],
  "audit_logs": [
    "id"
  ],
  "data_access_scopes": [
    "id"
  ],
  "vehicle_insurances": [
    "id"
  ],
  "asset_component_installations": [
    "id"
  ],
  "software_license_assets": [
    "id"
  ],
  "software_license_secrets": [
    "license_id"
  ],
  "asset_liquidations": [
    "id"
  ],
  "asset_code_counters": [
    "prefix",
    "code_year"
  ],
  "vehicles": [
    "id"
  ],
  "vehicle_inspections": [
    "id"
  ],
  "vehicle_repairs": [
    "id"
  ],
  "vehicle_fuel_logs": [
    "id"
  ],
  "vehicle_inspection_notification_logs": [
    "id"
  ],
  "vehicle_documents": [
    "id"
  ],
  "supply_items": [
    "id"
  ],
  "supply_requests": [
    "id"
  ],
  "supply_request_lines": [
    "id"
  ],
  "vehicle_toll_quarterly_passes": [
    "id"
  ],
  "supply_quotes": [
    "id"
  ],
  "supply_quote_lines": [
    "id"
  ],
  "supply_inventory_movements": [
    "id"
  ],
  "asset_documents": [
    "id"
  ],
  "user_module_access": [
    "id"
  ],
  "vehicle_toll_monthly_batches": [
    "id"
  ],
  "vehicle_toll_transactions": [
    "id"
  ],
  "telecom_invoices": [
    "id"
  ],
  "telecom_phones": [
    "id"
  ],
  "company_surveys": [
    "id"
  ],
  "survey_responses": [
    "id"
  ],
  "it_cost_categories": [
    "id"
  ],
  "it_services": [
    "id"
  ],
  "it_service_periods": [
    "id"
  ],
  "it_cost_entries": [
    "id"
  ],
  "it_documents": [
    "id"
  ],
  "it_cost_entry_lines": [
    "id"
  ],
  "it_document_links": [
    "id"
  ]
};

export type ForeignKey = { table: string; columns: string[]; refTable: string; refColumns: string[] };
export const FOREIGN_KEYS: ForeignKey[] = [
  {
    "table": "user_roles",
    "columns": [
      "user_id"
    ],
    "refTable": "profiles",
    "refColumns": [
      "id"
    ]
  },
  {
    "table": "user_roles",
    "columns": [
      "role_id"
    ],
    "refTable": "roles",
    "refColumns": [
      "id"
    ]
  },
  {
    "table": "role_permissions",
    "columns": [
      "role_id"
    ],
    "refTable": "roles",
    "refColumns": [
      "id"
    ]
  },
  {
    "table": "role_permissions",
    "columns": [
      "permission_code"
    ],
    "refTable": "permissions",
    "refColumns": [
      "code"
    ]
  },
  {
    "table": "assets",
    "columns": [
      "department_id"
    ],
    "refTable": "departments",
    "refColumns": [
      "id"
    ]
  },
  {
    "table": "assets",
    "columns": [
      "created_by"
    ],
    "refTable": "profiles",
    "refColumns": [
      "id"
    ]
  },
  {
    "table": "assets",
    "columns": [
      "updated_by"
    ],
    "refTable": "profiles",
    "refColumns": [
      "id"
    ]
  },
  {
    "table": "assets",
    "columns": [
      "deleted_by"
    ],
    "refTable": "profiles",
    "refColumns": [
      "id"
    ]
  },
  {
    "table": "asset_responsibles",
    "columns": [
      "asset_id"
    ],
    "refTable": "assets",
    "refColumns": [
      "id"
    ]
  },
  {
    "table": "asset_responsibles",
    "columns": [
      "user_id"
    ],
    "refTable": "profiles",
    "refColumns": [
      "id"
    ]
  },
  {
    "table": "inventory_movements",
    "columns": [
      "asset_id"
    ],
    "refTable": "assets",
    "refColumns": [
      "id"
    ]
  },
  {
    "table": "inventory_movements",
    "columns": [
      "from_user_id"
    ],
    "refTable": "profiles",
    "refColumns": [
      "id"
    ]
  },
  {
    "table": "inventory_movements",
    "columns": [
      "to_user_id"
    ],
    "refTable": "profiles",
    "refColumns": [
      "id"
    ]
  },
  {
    "table": "inventory_movements",
    "columns": [
      "created_by"
    ],
    "refTable": "profiles",
    "refColumns": [
      "id"
    ]
  },
  {
    "table": "maintenance_plans",
    "columns": [
      "asset_id"
    ],
    "refTable": "assets",
    "refColumns": [
      "id"
    ]
  },
  {
    "table": "maintenance_plans",
    "columns": [
      "created_by"
    ],
    "refTable": "profiles",
    "refColumns": [
      "id"
    ]
  },
  {
    "table": "maintenance_logs",
    "columns": [
      "asset_id"
    ],
    "refTable": "assets",
    "refColumns": [
      "id"
    ]
  },
  {
    "table": "maintenance_logs",
    "columns": [
      "plan_id"
    ],
    "refTable": "maintenance_plans",
    "refColumns": [
      "id"
    ]
  },
  {
    "table": "maintenance_logs",
    "columns": [
      "created_by"
    ],
    "refTable": "profiles",
    "refColumns": [
      "id"
    ]
  },
  {
    "table": "maintenance_notification_logs",
    "columns": [
      "plan_id"
    ],
    "refTable": "maintenance_plans",
    "refColumns": [
      "id"
    ]
  },
  {
    "table": "maintenance_notification_logs",
    "columns": [
      "asset_id"
    ],
    "refTable": "assets",
    "refColumns": [
      "id"
    ]
  },
  {
    "table": "software_licenses",
    "columns": [
      "assigned_asset_id"
    ],
    "refTable": "assets",
    "refColumns": [
      "id"
    ]
  },
  {
    "table": "software_licenses",
    "columns": [
      "assigned_user_id"
    ],
    "refTable": "profiles",
    "refColumns": [
      "id"
    ]
  },
  {
    "table": "software_licenses",
    "columns": [
      "created_by"
    ],
    "refTable": "profiles",
    "refColumns": [
      "id"
    ]
  },
  {
    "table": "media_files",
    "columns": [
      "asset_id"
    ],
    "refTable": "assets",
    "refColumns": [
      "id"
    ]
  },
  {
    "table": "media_files",
    "columns": [
      "created_by"
    ],
    "refTable": "profiles",
    "refColumns": [
      "id"
    ]
  },
  {
    "table": "software_license_assets",
    "columns": [
      "assigned_by"
    ],
    "refTable": "profiles",
    "refColumns": [
      "id"
    ]
  },
  {
    "table": "vehicle_inspections",
    "columns": [
      "archived_by"
    ],
    "refTable": "profiles",
    "refColumns": [
      "id"
    ]
  },
  {
    "table": "export_jobs",
    "columns": [
      "requested_by"
    ],
    "refTable": "profiles",
    "refColumns": [
      "id"
    ]
  },
  {
    "table": "audit_logs",
    "columns": [
      "actor_user_id"
    ],
    "refTable": "profiles",
    "refColumns": [
      "id"
    ]
  },
  {
    "table": "data_access_scopes",
    "columns": [
      "user_id"
    ],
    "refTable": "profiles",
    "refColumns": [
      "id"
    ]
  },
  {
    "table": "data_access_scopes",
    "columns": [
      "department_id"
    ],
    "refTable": "departments",
    "refColumns": [
      "id"
    ]
  },
  {
    "table": "data_access_scopes",
    "columns": [
      "created_by"
    ],
    "refTable": "profiles",
    "refColumns": [
      "id"
    ]
  },
  {
    "table": "asset_liquidations",
    "columns": [
      "voided_by"
    ],
    "refTable": "profiles",
    "refColumns": [
      "id"
    ]
  },
  {
    "table": "vehicle_insurances",
    "columns": [
      "vehicle_id"
    ],
    "refTable": "vehicles",
    "refColumns": [
      "id"
    ]
  },
  {
    "table": "vehicle_insurances",
    "columns": [
      "created_by"
    ],
    "refTable": "profiles",
    "refColumns": [
      "id"
    ]
  },
  {
    "table": "vehicle_insurances",
    "columns": [
      "updated_by"
    ],
    "refTable": "profiles",
    "refColumns": [
      "id"
    ]
  },
  {
    "table": "vehicle_inspections",
    "columns": [
      "renewed_from_id"
    ],
    "refTable": "vehicle_inspections",
    "refColumns": [
      "id"
    ]
  },
  {
    "table": "asset_component_installations",
    "columns": [
      "host_asset_id"
    ],
    "refTable": "assets",
    "refColumns": [
      "id"
    ]
  },
  {
    "table": "asset_component_installations",
    "columns": [
      "component_asset_id"
    ],
    "refTable": "assets",
    "refColumns": [
      "id"
    ]
  },
  {
    "table": "asset_component_installations",
    "columns": [
      "installed_by"
    ],
    "refTable": "profiles",
    "refColumns": [
      "id"
    ]
  },
  {
    "table": "asset_component_installations",
    "columns": [
      "removed_by"
    ],
    "refTable": "profiles",
    "refColumns": [
      "id"
    ]
  },
  {
    "table": "software_license_assets",
    "columns": [
      "license_id"
    ],
    "refTable": "software_licenses",
    "refColumns": [
      "id"
    ]
  },
  {
    "table": "software_license_assets",
    "columns": [
      "asset_id"
    ],
    "refTable": "assets",
    "refColumns": [
      "id"
    ]
  },
  {
    "table": "software_license_secrets",
    "columns": [
      "license_id"
    ],
    "refTable": "software_licenses",
    "refColumns": [
      "id"
    ]
  },
  {
    "table": "software_license_secrets",
    "columns": [
      "updated_by"
    ],
    "refTable": "profiles",
    "refColumns": [
      "id"
    ]
  },
  {
    "table": "asset_liquidations",
    "columns": [
      "asset_id"
    ],
    "refTable": "assets",
    "refColumns": [
      "id"
    ]
  },
  {
    "table": "asset_liquidations",
    "columns": [
      "recorded_by"
    ],
    "refTable": "profiles",
    "refColumns": [
      "id"
    ]
  },
  {
    "table": "vehicles",
    "columns": [
      "responsible_user_id"
    ],
    "refTable": "profiles",
    "refColumns": [
      "id"
    ]
  },
  {
    "table": "vehicles",
    "columns": [
      "department_id"
    ],
    "refTable": "departments",
    "refColumns": [
      "id"
    ]
  },
  {
    "table": "vehicles",
    "columns": [
      "created_by"
    ],
    "refTable": "profiles",
    "refColumns": [
      "id"
    ]
  },
  {
    "table": "vehicles",
    "columns": [
      "updated_by"
    ],
    "refTable": "profiles",
    "refColumns": [
      "id"
    ]
  },
  {
    "table": "vehicle_inspections",
    "columns": [
      "vehicle_id"
    ],
    "refTable": "vehicles",
    "refColumns": [
      "id"
    ]
  },
  {
    "table": "vehicle_inspections",
    "columns": [
      "created_by"
    ],
    "refTable": "profiles",
    "refColumns": [
      "id"
    ]
  },
  {
    "table": "vehicle_inspections",
    "columns": [
      "updated_by"
    ],
    "refTable": "profiles",
    "refColumns": [
      "id"
    ]
  },
  {
    "table": "vehicle_repairs",
    "columns": [
      "vehicle_id"
    ],
    "refTable": "vehicles",
    "refColumns": [
      "id"
    ]
  },
  {
    "table": "vehicle_repairs",
    "columns": [
      "created_by"
    ],
    "refTable": "profiles",
    "refColumns": [
      "id"
    ]
  },
  {
    "table": "vehicle_repairs",
    "columns": [
      "updated_by"
    ],
    "refTable": "profiles",
    "refColumns": [
      "id"
    ]
  },
  {
    "table": "vehicle_fuel_logs",
    "columns": [
      "vehicle_id"
    ],
    "refTable": "vehicles",
    "refColumns": [
      "id"
    ]
  },
  {
    "table": "vehicle_fuel_logs",
    "columns": [
      "created_by"
    ],
    "refTable": "profiles",
    "refColumns": [
      "id"
    ]
  },
  {
    "table": "vehicle_fuel_logs",
    "columns": [
      "updated_by"
    ],
    "refTable": "profiles",
    "refColumns": [
      "id"
    ]
  },
  {
    "table": "vehicle_inspection_notification_logs",
    "columns": [
      "inspection_id"
    ],
    "refTable": "vehicle_inspections",
    "refColumns": [
      "id"
    ]
  },
  {
    "table": "vehicle_inspection_notification_logs",
    "columns": [
      "vehicle_id"
    ],
    "refTable": "vehicles",
    "refColumns": [
      "id"
    ]
  },
  {
    "table": "vehicle_inspections",
    "columns": [
      "renewed_by"
    ],
    "refTable": "profiles",
    "refColumns": [
      "id"
    ]
  },
  {
    "table": "it_document_links",
    "columns": [
      "created_by"
    ],
    "refTable": "profiles",
    "refColumns": [
      "id"
    ]
  },
  {
    "table": "vehicle_documents",
    "columns": [
      "vehicle_id"
    ],
    "refTable": "vehicles",
    "refColumns": [
      "id"
    ]
  },
  {
    "table": "vehicle_documents",
    "columns": [
      "created_by"
    ],
    "refTable": "profiles",
    "refColumns": [
      "id"
    ]
  },
  {
    "table": "supply_items",
    "columns": [
      "created_by"
    ],
    "refTable": "profiles",
    "refColumns": [
      "id"
    ]
  },
  {
    "table": "supply_items",
    "columns": [
      "updated_by"
    ],
    "refTable": "profiles",
    "refColumns": [
      "id"
    ]
  },
  {
    "table": "supply_requests",
    "columns": [
      "department_id"
    ],
    "refTable": "departments",
    "refColumns": [
      "id"
    ]
  },
  {
    "table": "supply_requests",
    "columns": [
      "created_by"
    ],
    "refTable": "profiles",
    "refColumns": [
      "id"
    ]
  },
  {
    "table": "supply_requests",
    "columns": [
      "updated_by"
    ],
    "refTable": "profiles",
    "refColumns": [
      "id"
    ]
  },
  {
    "table": "supply_request_lines",
    "columns": [
      "request_id"
    ],
    "refTable": "supply_requests",
    "refColumns": [
      "id"
    ]
  },
  {
    "table": "supply_request_lines",
    "columns": [
      "item_id"
    ],
    "refTable": "supply_items",
    "refColumns": [
      "id"
    ]
  },
  {
    "table": "supply_request_lines",
    "columns": [
      "created_by"
    ],
    "refTable": "profiles",
    "refColumns": [
      "id"
    ]
  },
  {
    "table": "supply_request_lines",
    "columns": [
      "updated_by"
    ],
    "refTable": "profiles",
    "refColumns": [
      "id"
    ]
  },
  {
    "table": "supply_quotes",
    "columns": [
      "created_by"
    ],
    "refTable": "profiles",
    "refColumns": [
      "id"
    ]
  },
  {
    "table": "supply_quotes",
    "columns": [
      "updated_by"
    ],
    "refTable": "profiles",
    "refColumns": [
      "id"
    ]
  },
  {
    "table": "supply_quote_lines",
    "columns": [
      "quote_id"
    ],
    "refTable": "supply_quotes",
    "refColumns": [
      "id"
    ]
  },
  {
    "table": "supply_quote_lines",
    "columns": [
      "item_id"
    ],
    "refTable": "supply_items",
    "refColumns": [
      "id"
    ]
  },
  {
    "table": "supply_quote_lines",
    "columns": [
      "created_by"
    ],
    "refTable": "profiles",
    "refColumns": [
      "id"
    ]
  },
  {
    "table": "supply_quote_lines",
    "columns": [
      "updated_by"
    ],
    "refTable": "profiles",
    "refColumns": [
      "id"
    ]
  },
  {
    "table": "supply_inventory_movements",
    "columns": [
      "item_id"
    ],
    "refTable": "supply_items",
    "refColumns": [
      "id"
    ]
  },
  {
    "table": "supply_inventory_movements",
    "columns": [
      "created_by"
    ],
    "refTable": "profiles",
    "refColumns": [
      "id"
    ]
  },
  {
    "table": "asset_documents",
    "columns": [
      "asset_id"
    ],
    "refTable": "assets",
    "refColumns": [
      "id"
    ]
  },
  {
    "table": "asset_documents",
    "columns": [
      "created_by"
    ],
    "refTable": "profiles",
    "refColumns": [
      "id"
    ]
  },
  {
    "table": "user_module_access",
    "columns": [
      "user_id"
    ],
    "refTable": "profiles",
    "refColumns": [
      "id"
    ]
  },
  {
    "table": "user_module_access",
    "columns": [
      "created_by"
    ],
    "refTable": "profiles",
    "refColumns": [
      "id"
    ]
  },
  {
    "table": "vehicle_insurances",
    "columns": [
      "archived_by"
    ],
    "refTable": "profiles",
    "refColumns": [
      "id"
    ]
  },
  {
    "table": "vehicle_insurances",
    "columns": [
      "renewed_from_id"
    ],
    "refTable": "vehicle_insurances",
    "refColumns": [
      "id"
    ]
  },
  {
    "table": "vehicle_insurances",
    "columns": [
      "renewed_by"
    ],
    "refTable": "profiles",
    "refColumns": [
      "id"
    ]
  },
  {
    "table": "vehicle_toll_quarterly_passes",
    "columns": [
      "vehicle_id"
    ],
    "refTable": "vehicles",
    "refColumns": [
      "id"
    ]
  },
  {
    "table": "vehicle_toll_monthly_batches",
    "columns": [
      "created_by"
    ],
    "refTable": "profiles",
    "refColumns": [
      "id"
    ]
  },
  {
    "table": "vehicle_toll_monthly_batches",
    "columns": [
      "updated_by"
    ],
    "refTable": "profiles",
    "refColumns": [
      "id"
    ]
  },
  {
    "table": "vehicle_toll_transactions",
    "columns": [
      "batch_id"
    ],
    "refTable": "vehicle_toll_monthly_batches",
    "refColumns": [
      "id"
    ]
  },
  {
    "table": "vehicle_toll_transactions",
    "columns": [
      "vehicle_id"
    ],
    "refTable": "vehicles",
    "refColumns": [
      "id"
    ]
  },
  {
    "table": "vehicle_toll_quarterly_passes",
    "columns": [
      "created_by"
    ],
    "refTable": "profiles",
    "refColumns": [
      "id"
    ]
  },
  {
    "table": "vehicle_toll_quarterly_passes",
    "columns": [
      "updated_by"
    ],
    "refTable": "profiles",
    "refColumns": [
      "id"
    ]
  },
  {
    "table": "telecom_invoices",
    "columns": [
      "created_by"
    ],
    "refTable": "profiles",
    "refColumns": [
      "id"
    ]
  },
  {
    "table": "telecom_invoices",
    "columns": [
      "updated_by"
    ],
    "refTable": "profiles",
    "refColumns": [
      "id"
    ]
  },
  {
    "table": "telecom_phones",
    "columns": [
      "created_by"
    ],
    "refTable": "profiles",
    "refColumns": [
      "id"
    ]
  },
  {
    "table": "telecom_phones",
    "columns": [
      "updated_by"
    ],
    "refTable": "profiles",
    "refColumns": [
      "id"
    ]
  },
  {
    "table": "survey_responses",
    "columns": [
      "survey_id"
    ],
    "refTable": "company_surveys",
    "refColumns": [
      "id"
    ]
  },
  {
    "table": "company_surveys",
    "columns": [
      "created_by"
    ],
    "refTable": "profiles",
    "refColumns": [
      "id"
    ]
  },
  {
    "table": "it_services",
    "columns": [
      "category_id"
    ],
    "refTable": "it_cost_categories",
    "refColumns": [
      "id"
    ]
  },
  {
    "table": "it_services",
    "columns": [
      "created_by"
    ],
    "refTable": "profiles",
    "refColumns": [
      "id"
    ]
  },
  {
    "table": "it_services",
    "columns": [
      "updated_by"
    ],
    "refTable": "profiles",
    "refColumns": [
      "id"
    ]
  },
  {
    "table": "it_service_periods",
    "columns": [
      "service_id"
    ],
    "refTable": "it_services",
    "refColumns": [
      "id"
    ]
  },
  {
    "table": "it_service_periods",
    "columns": [
      "renewed_from_id"
    ],
    "refTable": "it_service_periods",
    "refColumns": [
      "id"
    ]
  },
  {
    "table": "it_service_periods",
    "columns": [
      "created_by"
    ],
    "refTable": "profiles",
    "refColumns": [
      "id"
    ]
  },
  {
    "table": "it_service_periods",
    "columns": [
      "updated_by"
    ],
    "refTable": "profiles",
    "refColumns": [
      "id"
    ]
  },
  {
    "table": "it_document_links",
    "columns": [
      "entry_id"
    ],
    "refTable": "it_cost_entries",
    "refColumns": [
      "id"
    ]
  },
  {
    "table": "it_cost_entries",
    "columns": [
      "created_by"
    ],
    "refTable": "profiles",
    "refColumns": [
      "id"
    ]
  },
  {
    "table": "it_cost_entries",
    "columns": [
      "updated_by"
    ],
    "refTable": "profiles",
    "refColumns": [
      "id"
    ]
  },
  {
    "table": "it_documents",
    "columns": [
      "created_by"
    ],
    "refTable": "profiles",
    "refColumns": [
      "id"
    ]
  },
  {
    "table": "it_document_links",
    "columns": [
      "service_id"
    ],
    "refTable": "it_services",
    "refColumns": [
      "id"
    ]
  },
  {
    "table": "it_document_links",
    "columns": [
      "period_id"
    ],
    "refTable": "it_service_periods",
    "refColumns": [
      "id"
    ]
  },
  {
    "table": "it_cost_entry_lines",
    "columns": [
      "entry_id"
    ],
    "refTable": "it_cost_entries",
    "refColumns": [
      "id"
    ]
  },
  {
    "table": "it_cost_entry_lines",
    "columns": [
      "category_id"
    ],
    "refTable": "it_cost_categories",
    "refColumns": [
      "id"
    ]
  },
  {
    "table": "it_cost_entry_lines",
    "columns": [
      "service_id"
    ],
    "refTable": "it_services",
    "refColumns": [
      "id"
    ]
  },
  {
    "table": "it_cost_entry_lines",
    "columns": [
      "period_id"
    ],
    "refTable": "it_service_periods",
    "refColumns": [
      "id"
    ]
  },
  {
    "table": "it_cost_entry_lines",
    "columns": [
      "document_id"
    ],
    "refTable": "it_documents",
    "refColumns": [
      "id"
    ]
  },
  {
    "table": "it_document_links",
    "columns": [
      "document_id"
    ],
    "refTable": "it_documents",
    "refColumns": [
      "id"
    ]
  }
];

/** Cột có DEFAULT auth.uid() trong PostgreSQL: builder tự gán người dùng hiện tại */
export const CURRENT_USER_DEFAULTS: Record<string, string[]> = {
  "asset_component_installations": [
    "installed_by"
  ],
  "asset_documents": [
    "created_by"
  ],
  "asset_liquidations": [
    "recorded_by"
  ],
  "assets": [
    "created_by",
    "updated_by"
  ],
  "company_surveys": [
    "created_by"
  ],
  "data_access_scopes": [
    "created_by"
  ],
  "export_jobs": [
    "requested_by"
  ],
  "inventory_movements": [
    "created_by"
  ],
  "it_cost_entries": [
    "created_by",
    "updated_by"
  ],
  "it_document_links": [
    "created_by"
  ],
  "it_documents": [
    "created_by"
  ],
  "it_service_periods": [
    "created_by",
    "updated_by"
  ],
  "it_services": [
    "created_by",
    "updated_by"
  ],
  "maintenance_logs": [
    "created_by"
  ],
  "maintenance_plans": [
    "created_by"
  ],
  "media_files": [
    "created_by"
  ],
  "software_license_assets": [
    "assigned_by"
  ],
  "software_license_secrets": [
    "updated_by"
  ],
  "software_licenses": [
    "created_by"
  ],
  "supply_inventory_movements": [
    "created_by"
  ],
  "supply_items": [
    "created_by",
    "updated_by"
  ],
  "supply_quote_lines": [
    "created_by",
    "updated_by"
  ],
  "supply_quotes": [
    "created_by",
    "updated_by"
  ],
  "supply_request_lines": [
    "created_by",
    "updated_by"
  ],
  "supply_requests": [
    "created_by",
    "updated_by"
  ],
  "telecom_invoices": [
    "created_by",
    "updated_by"
  ],
  "telecom_phones": [
    "created_by",
    "updated_by"
  ],
  "user_module_access": [
    "created_by"
  ],
  "vehicle_documents": [
    "created_by"
  ],
  "vehicle_fuel_logs": [
    "created_by",
    "updated_by"
  ],
  "vehicle_inspections": [
    "created_by",
    "updated_by"
  ],
  "vehicle_insurances": [
    "created_by",
    "updated_by"
  ],
  "vehicle_repairs": [
    "created_by",
    "updated_by"
  ],
  "vehicle_toll_monthly_batches": [
    "created_by",
    "updated_by"
  ],
  "vehicle_toll_quarterly_passes": [
    "created_by",
    "updated_by"
  ],
  "vehicles": [
    "created_by",
    "updated_by"
  ]
};

export const RLS_TABLES = new Set<string>(["asset_code_counters", "asset_component_installations", "asset_documents", "asset_liquidations", "asset_responsibles", "assets", "audit_logs", "company_surveys", "data_access_scopes", "departments", "export_jobs", "inventory_movements", "it_cost_categories", "it_cost_entries", "it_cost_entry_lines", "it_document_links", "it_documents", "it_service_periods", "it_services", "maintenance_logs", "maintenance_notification_logs", "maintenance_plans", "media_files", "permissions", "profiles", "role_permissions", "roles", "settings", "software_license_assets", "software_license_secrets", "software_licenses", "supply_inventory_movements", "supply_items", "supply_quote_lines", "supply_quotes", "supply_request_lines", "supply_requests", "survey_responses", "telecom_invoices", "telecom_phones", "user_module_access", "user_roles", "vehicle_documents", "vehicle_fuel_logs", "vehicle_inspection_notification_logs", "vehicle_inspections", "vehicle_insurances", "vehicle_repairs", "vehicle_toll_monthly_batches", "vehicle_toll_quarterly_passes", "vehicle_toll_transactions", "vehicles"]);

type Rule = (f: PolicyFragments) => string;
export type TablePolicies = { select: Rule[]; insert: Rule[]; update: { using: Rule; check: Rule }[]; delete: Rule[] };
export const POLICIES: Record<string, TablePolicies> = {
  "asset_component_installations": {
    select: [(f) => `(${f.canAccessAsset("`asset_component_installations`.`host_asset_id`", "assets", "assets.view")} AND ${f.canAccessAsset("`asset_component_installations`.`component_asset_id`", "assets", "assets.view")})`],
    insert: [],
    delete: [],
    update: [],
  },
  "asset_documents": {
    select: [(f) => `${f.canAccessAsset("`asset_documents`.`asset_id`", "assets", "assets.view")}`],
    insert: [(f) => `((created_by = ${f.uid()}) AND ${f.canAccessAsset("`asset_documents`.`asset_id`", "assets", "assets.manage")})`],
    delete: [(f) => `${f.canAccessAsset("`asset_documents`.`asset_id`", "assets", "assets.manage")}`],
    update: [{ using: (f) => `${f.canAccessAsset("`asset_documents`.`asset_id`", "assets", "assets.manage")}`, check: (f) => `((created_by = ${f.uid()}) AND ${f.canAccessAsset("`asset_documents`.`asset_id`", "assets", "assets.manage")})` }],
  },
  "asset_liquidations": {
    select: [(f) => `${f.canAccessAsset("`asset_liquidations`.`asset_id`", "assets", "assets.view")}`],
    insert: [],
    delete: [],
    update: [],
  },
  "asset_responsibles": {
    select: [(f) => `${f.canAccessAsset("`asset_responsibles`.`asset_id`", "assets", "assets.view")}`],
    insert: [(f) => `${f.canAccessAsset("`asset_responsibles`.`asset_id`", "assets", "assets.manage")}`],
    delete: [(f) => `${f.canAccessAsset("`asset_responsibles`.`asset_id`", "assets", "assets.manage")}`],
    update: [{ using: (f) => `${f.canAccessAsset("`asset_responsibles`.`asset_id`", "assets", "assets.manage")}`, check: (f) => `${f.canAccessAsset("`asset_responsibles`.`asset_id`", "assets", "assets.manage")}` }],
  },
  "assets": {
    select: [(f) => `((deleted_at IS NULL) AND ${f.canAccessAsset("`assets`.`id`", "assets", "assets.view")})`],
    insert: [(f) => `${f.canCreateForDepartment("`assets`.`department_id`", "assets", "assets.manage")}`],
    delete: [],
    update: [{ using: (f) => `((deleted_at IS NULL) AND ${f.canAccessAsset("`assets`.`id`", "assets", "assets.manage")})`, check: (f) => `(${f.canAccessAsset("`assets`.`id`", "assets", "assets.manage")} AND ((deleted_at IS NULL) OR ${f.hasPermission("assets.delete")}))` }],
  },
  "audit_logs": {
    select: [(f) => `${f.hasPermission("audit.view")}`],
    insert: [],
    delete: [],
    update: [],
  },
  "company_surveys": {
    select: [(f) => `${f.hasPermission("surveys.view")}`],
    insert: [],
    delete: [],
    update: [],
  },
  "data_access_scopes": {
    select: [(f) => `((user_id = ${f.uid()}) OR ${f.isAdmin()})`],
    insert: [(f) => `${f.isAdmin()}`],
    delete: [(f) => `${f.isAdmin()}`],
    update: [{ using: (f) => `${f.isAdmin()}`, check: (f) => `${f.isAdmin()}` }],
  },
  "departments": {
    select: [(f) => `${f.isActiveUser()}`],
    insert: [(f) => `${f.hasPermission("departments.manage")}`],
    delete: [(f) => `${f.hasPermission("departments.manage")}`],
    update: [{ using: (f) => `${f.hasPermission("departments.manage")}`, check: (f) => `${f.hasPermission("departments.manage")}` }],
  },
  "export_jobs": {
    select: [(f) => `((requested_by = ${f.uid()}) OR ${f.isAdmin()})`],
    insert: [(f) => `(${f.hasPermission("reports.view")} AND (requested_by = ${f.uid()}))`],
    delete: [],
    update: [],
  },
  "inventory_movements": {
    select: [(f) => `${f.canAccessAsset("`inventory_movements`.`asset_id`", "movement", "movement.view")}`],
    insert: [],
    delete: [],
    update: [],
  },
  "it_cost_categories": {
    select: [(f) => `${f.hasPermission("it_costs.view")}`],
    insert: [],
    delete: [],
    update: [],
  },
  "it_cost_entries": {
    select: [(f) => `${f.hasPermission("it_costs.view")}`],
    insert: [],
    delete: [],
    update: [],
  },
  "it_cost_entry_lines": {
    select: [(f) => `${f.hasPermission("it_costs.view")}`],
    insert: [],
    delete: [],
    update: [],
  },
  "it_document_links": {
    select: [(f) => `${f.hasPermission("it_costs.view")}`],
    insert: [],
    delete: [],
    update: [],
  },
  "it_documents": {
    select: [(f) => `${f.hasPermission("it_costs.view")}`],
    insert: [],
    delete: [],
    update: [],
  },
  "it_service_periods": {
    select: [(f) => `${f.hasPermission("it_costs.view")}`],
    insert: [],
    delete: [],
    update: [],
  },
  "it_services": {
    select: [(f) => `${f.hasPermission("it_costs.view")}`],
    insert: [],
    delete: [],
    update: [],
  },
  "maintenance_logs": {
    select: [(f) => `${f.canAccessAsset("`maintenance_logs`.`asset_id`", "maintenance", "maintenance.view")}`],
    insert: [(f) => `${f.canAccessAsset("`maintenance_logs`.`asset_id`", "maintenance", "maintenance.manage")}`],
    delete: [(f) => `${f.canAccessAsset("`maintenance_logs`.`asset_id`", "maintenance", "maintenance.delete")}`],
    update: [{ using: (f) => `${f.canAccessAsset("`maintenance_logs`.`asset_id`", "maintenance", "maintenance.manage")}`, check: (f) => `${f.canAccessAsset("`maintenance_logs`.`asset_id`", "maintenance", "maintenance.manage")}` }],
  },
  "maintenance_notification_logs": {
    select: [(f) => `${f.canAccessAsset("`maintenance_notification_logs`.`asset_id`", "maintenance", "maintenance.view")}`],
    insert: [],
    delete: [],
    update: [],
  },
  "maintenance_plans": {
    select: [(f) => `${f.canAccessAsset("`maintenance_plans`.`asset_id`", "maintenance", "maintenance.view")}`],
    insert: [(f) => `${f.canAccessAsset("`maintenance_plans`.`asset_id`", "maintenance", "maintenance.manage")}`],
    delete: [(f) => `${f.canAccessAsset("`maintenance_plans`.`asset_id`", "maintenance", "maintenance.delete")}`],
    update: [{ using: (f) => `${f.canAccessAsset("`maintenance_plans`.`asset_id`", "maintenance", "maintenance.manage")}`, check: (f) => `${f.canAccessAsset("`maintenance_plans`.`asset_id`", "maintenance", "maintenance.manage")}` }],
  },
  "media_files": {
    select: [(f) => `(((owner_type = 'ASSET') AND ${f.canAccessAsset("`media_files`.`asset_id`", "assets", "assets.view")}) OR ((owner_type = 'MAINTENANCE') AND ${f.canAccessAsset("`media_files`.`asset_id`", "maintenance", "maintenance.view")}))`],
    insert: [(f) => `((bucket_id = 'asset-media') AND (created_by = ${f.uid()}) AND (((owner_type = 'ASSET') AND ${f.canAccessAsset("`media_files`.`asset_id`", "assets", "assets.manage")}) OR ((owner_type = 'MAINTENANCE') AND ${f.canAccessAsset("`media_files`.`asset_id`", "maintenance", "maintenance.manage")})))`],
    delete: [(f) => `(((owner_type = 'ASSET') AND ${f.canAccessAsset("`media_files`.`asset_id`", "assets", "assets.manage")}) OR ((owner_type = 'MAINTENANCE') AND ${f.canAccessAsset("`media_files`.`asset_id`", "maintenance", "maintenance.manage")}))`],
    update: [],
  },
  "permissions": {
    select: [(f) => `${f.isActiveUser()}`],
    insert: [],
    delete: [],
    update: [],
  },
  "profiles": {
    select: [(f) => `((id = ${f.uid()}) OR ${f.isAdmin()})`],
    insert: [],
    delete: [],
    update: [{ using: (f) => `${f.isAdmin()}`, check: (f) => `${f.isAdmin()}` }, { using: (f) => `((id = ${f.uid()}) AND active)`, check: (f) => `((id = ${f.uid()}) AND active)` }],
  },
  "role_permissions": {
    select: [(f) => `${f.isActiveUser()}`],
    insert: [],
    delete: [],
    update: [],
  },
  "roles": {
    select: [(f) => `${f.isActiveUser()}`],
    insert: [],
    delete: [],
    update: [],
  },
  "settings": {
    select: [(f) => `${f.isActiveUser()}`],
    insert: [(f) => `${f.hasPermission("settings.manage")}`],
    delete: [(f) => `${f.hasPermission("settings.manage")}`],
    update: [{ using: (f) => `${f.hasPermission("settings.manage")}`, check: (f) => `${f.hasPermission("settings.manage")}` }],
  },
  "software_license_assets": {
    select: [(f) => `(${f.hasPermission("software.view")} AND ${f.canAccessAsset("`software_license_assets`.`asset_id`", "assets", "assets.view")})`],
    insert: [],
    delete: [],
    update: [],
  },
  "software_license_secrets": {
    select: [(f) => `${f.isAdmin()}`],
    insert: [(f) => `${f.isAdmin()}`],
    delete: [(f) => `${f.isAdmin()}`],
    update: [{ using: (f) => `${f.isAdmin()}`, check: (f) => `${f.isAdmin()}` }],
  },
  "software_licenses": {
    select: [(f) => `${f.canAccessSoftwareLicense("`software_licenses`.`id`", "software.view")}`],
    insert: [(f) => `(${f.hasPermission("software.manage")} AND (${f.isAdmin()} OR ${f.hasRoleCode("manager")} OR ((assigned_asset_id IS NOT NULL) AND ${f.assetScopeMatches("`software_licenses`.`assigned_asset_id`", "software")}) OR (assigned_user_id = ${f.uid()})))`],
    delete: [(f) => `${f.canAccessSoftwareLicense("`software_licenses`.`id`", "software.delete")}`],
    update: [{ using: (f) => `${f.canAccessSoftwareLicense("`software_licenses`.`id`", "software.manage")}`, check: (f) => `(${f.hasPermission("software.manage")} AND (${f.isAdmin()} OR ${f.hasRoleCode("manager")} OR ((assigned_asset_id IS NOT NULL) AND ${f.assetScopeMatches("`software_licenses`.`assigned_asset_id`", "software")}) OR (assigned_user_id = ${f.uid()})))` }],
  },
  "supply_inventory_movements": {
    select: [(f) => `${f.hasPermission("supplies.view")}`],
    insert: [(f) => `(${f.hasPermission("supplies.manage")} OR ${f.hasPermission("supplies.import")})`],
    delete: [],
    update: [],
  },
  "supply_items": {
    select: [(f) => `((deleted_at IS NULL) AND ${f.hasPermission("supplies.view")})`],
    insert: [(f) => `${f.hasPermission("supplies.manage")}`],
    delete: [],
    update: [{ using: (f) => `((deleted_at IS NULL) AND ${f.hasPermission("supplies.manage")})`, check: (f) => `${f.hasPermission("supplies.manage")}` }],
  },
  "supply_quote_lines": {
    select: [(f) => `(${f.hasPermission("supplies.view")} AND (EXISTS ( SELECT 1
   FROM supply_quotes sq
  WHERE ((sq.id = supply_quote_lines.quote_id) AND (sq.deleted_at IS NULL)))))`],
    insert: [(f) => `${f.hasPermission("supplies.manage")}`],
    delete: [(f) => `${f.hasPermission("supplies.delete")}`],
    update: [{ using: (f) => `${f.hasPermission("supplies.manage")}`, check: (f) => `${f.hasPermission("supplies.manage")}` }],
  },
  "supply_quotes": {
    select: [(f) => `((deleted_at IS NULL) AND ${f.hasPermission("supplies.view")})`],
    insert: [(f) => `${f.hasPermission("supplies.manage")}`],
    delete: [],
    update: [{ using: (f) => `((deleted_at IS NULL) AND ${f.hasPermission("supplies.manage")})`, check: (f) => `${f.hasPermission("supplies.manage")}` }],
  },
  "supply_request_lines": {
    select: [(f) => `(${f.hasPermission("supplies.view")} AND ${f.supplyRequestScopeMatches("`supply_request_lines`.`request_id`")})`],
    insert: [(f) => `(${f.hasPermission("supplies.manage")} AND ${f.supplyRequestScopeMatches("`supply_request_lines`.`request_id`")})`],
    delete: [(f) => `(${f.hasPermission("supplies.delete")} AND ${f.supplyRequestScopeMatches("`supply_request_lines`.`request_id`")})`],
    update: [{ using: (f) => `(${f.hasPermission("supplies.manage")} AND ${f.supplyRequestScopeMatches("`supply_request_lines`.`request_id`")})`, check: (f) => `(${f.hasPermission("supplies.manage")} AND ${f.supplyRequestScopeMatches("`supply_request_lines`.`request_id`")})` }],
  },
  "supply_requests": {
    select: [(f) => `((deleted_at IS NULL) AND ${f.hasPermission("supplies.view")} AND ${f.supplyRequestScopeMatches("`supply_requests`.`id`")})`],
    insert: [(f) => `${f.hasPermission("supplies.manage")}`],
    delete: [],
    update: [{ using: (f) => `((deleted_at IS NULL) AND ${f.hasPermission("supplies.manage")} AND ${f.supplyRequestScopeMatches("`supply_requests`.`id`")})`, check: (f) => `(${f.hasPermission("supplies.manage")} AND ${f.supplyRequestScopeMatches("`supply_requests`.`id`")})` }],
  },
  "survey_responses": {
    select: [(f) => `${f.hasPermission("surveys.view")}`],
    insert: [],
    delete: [],
    update: [],
  },
  "telecom_invoices": {
    select: [(f) => `((deleted_at IS NULL) AND ${f.hasPermission("telecom.view")})`],
    insert: [],
    delete: [],
    update: [],
  },
  "telecom_phones": {
    select: [(f) => `((deleted_at IS NULL) AND ${f.hasPermission("telecom.view")})`],
    insert: [],
    delete: [],
    update: [],
  },
  "user_module_access": {
    select: [(f) => `((user_id = ${f.uid()}) OR ${f.isAdmin()})`],
    insert: [],
    delete: [],
    update: [],
  },
  "user_roles": {
    select: [(f) => `((user_id = ${f.uid()}) OR ${f.isAdmin()})`],
    insert: [(f) => `${f.isAdmin()}`],
    delete: [(f) => `${f.isAdmin()}`],
    update: [],
  },
  "vehicle_documents": {
    select: [(f) => `${f.canAccessVehicle("`vehicle_documents`.`vehicle_id`", "vehicles.view")}`],
    insert: [(f) => `((created_by = ${f.uid()}) AND ${f.canAccessVehicle("`vehicle_documents`.`vehicle_id`", "vehicles.manage")})`],
    delete: [(f) => `${f.canAccessVehicle("`vehicle_documents`.`vehicle_id`", "vehicles.manage")}`],
    update: [{ using: (f) => `${f.canAccessVehicle("`vehicle_documents`.`vehicle_id`", "vehicles.manage")}`, check: (f) => `${f.canAccessVehicle("`vehicle_documents`.`vehicle_id`", "vehicles.manage")}` }],
  },
  "vehicle_fuel_logs": {
    select: [(f) => `${f.canAccessVehicle("`vehicle_fuel_logs`.`vehicle_id`", "vehicles.view")}`],
    insert: [(f) => `${f.canAccessVehicle("`vehicle_fuel_logs`.`vehicle_id`", "vehicles.manage")}`],
    delete: [(f) => `${f.canAccessVehicle("`vehicle_fuel_logs`.`vehicle_id`", "vehicles.delete")}`],
    update: [{ using: (f) => `${f.canAccessVehicle("`vehicle_fuel_logs`.`vehicle_id`", "vehicles.manage")}`, check: (f) => `${f.canAccessVehicle("`vehicle_fuel_logs`.`vehicle_id`", "vehicles.manage")}` }],
  },
  "vehicle_inspection_notification_logs": {
    select: [(f) => `${f.canAccessVehicle("`vehicle_inspection_notification_logs`.`vehicle_id`", "vehicles.view")}`],
    insert: [],
    delete: [],
    update: [],
  },
  "vehicle_inspections": {
    select: [(f) => `${f.canAccessVehicle("`vehicle_inspections`.`vehicle_id`", "vehicles.view")}`],
    insert: [(f) => `${f.canAccessVehicle("`vehicle_inspections`.`vehicle_id`", "vehicles.manage")}`],
    delete: [(f) => `${f.canAccessVehicle("`vehicle_inspections`.`vehicle_id`", "vehicles.delete")}`],
    update: [{ using: (f) => `${f.canAccessVehicle("`vehicle_inspections`.`vehicle_id`", "vehicles.manage")}`, check: (f) => `${f.canAccessVehicle("`vehicle_inspections`.`vehicle_id`", "vehicles.manage")}` }],
  },
  "vehicle_insurances": {
    select: [(f) => `${f.canAccessVehicle("`vehicle_insurances`.`vehicle_id`", "vehicles.view")}`],
    insert: [(f) => `${f.canAccessVehicle("`vehicle_insurances`.`vehicle_id`", "vehicles.manage")}`],
    delete: [(f) => `${f.canAccessVehicle("`vehicle_insurances`.`vehicle_id`", "vehicles.delete")}`],
    update: [{ using: (f) => `${f.canAccessVehicle("`vehicle_insurances`.`vehicle_id`", "vehicles.manage")}`, check: (f) => `${f.canAccessVehicle("`vehicle_insurances`.`vehicle_id`", "vehicles.manage")}` }],
  },
  "vehicle_repairs": {
    select: [(f) => `${f.canAccessVehicle("`vehicle_repairs`.`vehicle_id`", "vehicles.view")}`],
    insert: [(f) => `${f.canAccessVehicle("`vehicle_repairs`.`vehicle_id`", "vehicles.manage")}`],
    delete: [(f) => `${f.canAccessVehicle("`vehicle_repairs`.`vehicle_id`", "vehicles.delete")}`],
    update: [{ using: (f) => `${f.canAccessVehicle("`vehicle_repairs`.`vehicle_id`", "vehicles.manage")}`, check: (f) => `${f.canAccessVehicle("`vehicle_repairs`.`vehicle_id`", "vehicles.manage")}` }],
  },
  "vehicle_toll_monthly_batches": {
    select: [(f) => `${f.canAccessTollBatch("`vehicle_toll_monthly_batches`.`id`", "vehicles.view")}`],
    insert: [],
    delete: [],
    update: [],
  },
  "vehicle_toll_quarterly_passes": {
    select: [(f) => `${f.canAccessVehicle("`vehicle_toll_quarterly_passes`.`vehicle_id`", "vehicles.view")}`],
    insert: [],
    delete: [],
    update: [],
  },
  "vehicle_toll_transactions": {
    select: [(f) => `${f.canAccessVehicle("`vehicle_toll_transactions`.`vehicle_id`", "vehicles.view")}`],
    insert: [],
    delete: [],
    update: [],
  },
  "vehicles": {
    select: [(f) => `((deleted_at IS NULL) AND ${f.canAccessVehicle("`vehicles`.`id`", "vehicles.view")})`],
    insert: [(f) => `(${f.hasPermission("vehicles.manage")} AND (${f.isAdmin()} OR ${f.hasRoleCode("manager")} OR (EXISTS ( SELECT 1
   FROM data_access_scopes das
  WHERE ((das.user_id = ${f.uid()}) AND (das.module = 'vehicles') AND ((das.scope_type = 'all') OR ((das.scope_type = 'department') AND (das.department_id = das.department_id))))))))`],
    delete: [],
    update: [{ using: (f) => `((deleted_at IS NULL) AND ${f.canAccessVehicle("`vehicles`.`id`", "vehicles.manage")})`, check: (f) => `${f.canAccessVehicle("`vehicles`.`id`", "vehicles.manage")}` }],
  },
};
