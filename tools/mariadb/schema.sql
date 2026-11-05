-- Schema MariaDB sinh tự động từ migration Supabase. KHÔNG sửa tay: chạy lại pg_to_mariadb.py.
SET NAMES utf8mb4;
SET FOREIGN_KEY_CHECKS = 0;

CREATE TABLE IF NOT EXISTS `asset_code_counters` (
  `prefix` VARCHAR(255) NOT NULL,
  `code_year` SMALLINT NOT NULL,
  `last_sequence` INT NOT NULL DEFAULT 0,
  `updated_at` DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  CONSTRAINT `asset_code_counters_code_year_check` CHECK (((code_year >= 1990) AND (code_year <= 2100))),
  CONSTRAINT `asset_code_counters_last_sequence_check` CHECK ((last_sequence >= 0)),
  PRIMARY KEY (`prefix`, `code_year`),
  CONSTRAINT `asset_code_counters_prefix_check` CHECK ((prefix REGEXP '^[A-Z0-9]{2,8}$'))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `asset_component_installations` (
  `id` VARCHAR(36) NOT NULL DEFAULT (UUID()),
  `host_asset_id` VARCHAR(36) NOT NULL,
  `component_asset_id` VARCHAR(36) NOT NULL,
  `installed_at` DATE NOT NULL,
  `removed_at` DATE NULL,
  `slot_name` TEXT NOT NULL DEFAULT (''),
  `install_note` TEXT NOT NULL DEFAULT (''),
  `removal_reason` TEXT NOT NULL DEFAULT (''),
  `removal_note` TEXT NOT NULL DEFAULT (''),
  `installed_by` VARCHAR(36) NULL,
  `removed_by` VARCHAR(36) NULL,
  `created_at` DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  `updated_at` DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  CONSTRAINT `asset_component_installations_check` CHECK ((host_asset_id <> component_asset_id)),
  CONSTRAINT `asset_component_installations_check1` CHECK (((removed_at IS NULL) OR (removed_at >= installed_at))),
  PRIMARY KEY (`id`),
  KEY `asset_component_history_idx` (`component_asset_id`, `installed_at` DESC),
  KEY `asset_component_host_active_idx` (`host_asset_id`, `installed_at` DESC),
  `_u_asset_component_one_active_host_idx_1` VARCHAR(255) AS (IF(removed_at IS NULL, `component_asset_id`, NULL)) VIRTUAL,
  UNIQUE KEY `asset_component_one_active_host_idx` (`_u_asset_component_one_active_host_idx_1`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `asset_documents` (
  `id` VARCHAR(36) NOT NULL DEFAULT (UUID()),
  `asset_id` VARCHAR(36) NOT NULL,
  `document_kind` VARCHAR(255) NOT NULL DEFAULT 'PURCHASE_INVOICE',
  `bucket_id` TEXT NOT NULL DEFAULT ('asset-documents'),
  `object_path` VARCHAR(255) NOT NULL,
  `file_name` TEXT NOT NULL,
  `mime_type` TEXT NOT NULL DEFAULT ('application/pdf'),
  `original_byte_size` BIGINT NOT NULL,
  `stored_byte_size` BIGINT NOT NULL,
  `compression_method` TEXT NOT NULL DEFAULT ('LOSSLESS'),
  `checksum` TEXT NOT NULL,
  `page_count` INT NOT NULL,
  `created_by` VARCHAR(36) NULL,
  `created_at` DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  `updated_at` DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  UNIQUE KEY `asset_documents_asset_id_document_kind_key` (`asset_id`, `document_kind`),
  CONSTRAINT `asset_documents_bucket_id_check` CHECK ((bucket_id = 'asset-documents')),
  CONSTRAINT `asset_documents_checksum_check` CHECK ((checksum REGEXP '^[0-9a-f]{64}$')),
  CONSTRAINT `asset_documents_compression_method_check` CHECK ((compression_method IN ('LOSSLESS', 'RASTERIZED'))),
  CONSTRAINT `asset_documents_document_kind_check` CHECK ((document_kind = 'PURCHASE_INVOICE')),
  CONSTRAINT `asset_documents_mime_type_check` CHECK ((mime_type = 'application/pdf')),
  UNIQUE KEY `asset_documents_object_path_key` (`object_path`),
  CONSTRAINT `asset_documents_original_byte_size_check` CHECK (((original_byte_size > 0) AND (original_byte_size <= 20971520))),
  CONSTRAINT `asset_documents_page_count_check` CHECK (((page_count >= 1) AND (page_count <= 200))),
  PRIMARY KEY (`id`),
  CONSTRAINT `asset_documents_stored_byte_size_check` CHECK (((stored_byte_size > 0) AND (stored_byte_size <= 5242880))),
  KEY `asset_documents_asset_idx` (`asset_id`, `document_kind`, `created_at` DESC)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `asset_liquidations` (
  `id` VARCHAR(36) NOT NULL DEFAULT (UUID()),
  `asset_id` VARCHAR(36) NOT NULL,
  `liquidation_date` DATE NOT NULL,
  `recovery_value` DECIMAL(18,2) NULL,
  `reason` TEXT NOT NULL DEFAULT (''),
  `note` TEXT NOT NULL DEFAULT (''),
  `recorded_by` VARCHAR(36) NULL,
  `created_at` DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  `voided_at` DATETIME(6) NULL,
  `voided_by` VARCHAR(36) NULL,
  `void_reason` TEXT NOT NULL DEFAULT (''),
  PRIMARY KEY (`id`),
  CONSTRAINT `asset_liquidations_recovery_value_check` CHECK (((recovery_value IS NULL) OR (recovery_value >= 0))),
  `_u_asset_liquidations_active_asset_idx_1` VARCHAR(255) AS (IF(voided_at IS NULL, `asset_id`, NULL)) VIRTUAL,
  UNIQUE KEY `asset_liquidations_active_asset_idx` (`_u_asset_liquidations_active_asset_idx_1`),
  KEY `asset_liquidations_date_idx` (`liquidation_date` DESC, `asset_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `asset_responsibles` (
  `id` VARCHAR(36) NOT NULL DEFAULT (UUID()),
  `legacy_id` VARCHAR(255) NULL,
  `asset_id` VARCHAR(36) NOT NULL,
  `user_id` VARCHAR(36) NOT NULL,
  `responsibility_role` VARCHAR(255) NOT NULL,
  `active` BOOLEAN NOT NULL DEFAULT TRUE,
  `created_at` DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  `updated_at` DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  UNIQUE KEY `asset_responsibles_asset_id_user_id_responsibility_role_key` (`asset_id`, `user_id`, `responsibility_role`),
  UNIQUE KEY `asset_responsibles_legacy_id_key` (`legacy_id`),
  PRIMARY KEY (`id`),
  CONSTRAINT `asset_responsibles_responsibility_role_check` CHECK ((responsibility_role IN ('primary', 'secondary'))),
  `_u_asset_one_primary_idx_1` VARCHAR(255) AS (IF((responsibility_role = 'primary') AND active, `asset_id`, NULL)) VIRTUAL,
  UNIQUE KEY `asset_one_primary_idx` (`_u_asset_one_primary_idx_1`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `assets` (
  `id` VARCHAR(36) NOT NULL DEFAULT (UUID()),
  `legacy_id` VARCHAR(255) NULL,
  `asset_code` VARCHAR(255) NOT NULL,
  `asset_name` VARCHAR(255) NOT NULL,
  `asset_group` VARCHAR(255) NOT NULL DEFAULT '',
  `asset_group_label` TEXT NOT NULL DEFAULT (''),
  `asset_type` VARCHAR(255) NOT NULL DEFAULT '',
  `brand` TEXT NOT NULL DEFAULT (''),
  `model` TEXT NOT NULL DEFAULT (''),
  `serial_number` VARCHAR(255) NOT NULL DEFAULT '',
  `purchase_year` SMALLINT NULL,
  `purchase_date` DATE NULL,
  `quantity` INT NOT NULL DEFAULT 1,
  `unit_price` DECIMAL(18,2) NOT NULL DEFAULT 0,
  `total_price` DECIMAL(18,2) AS (`quantity` * `unit_price`) STORED,
  `assigned_to_name` TEXT NOT NULL DEFAULT (''),
  `department_id` VARCHAR(36) NULL,
  `department_legacy_name` TEXT NOT NULL DEFAULT (''),
  `location` TEXT NOT NULL DEFAULT (''),
  `software_license_note` TEXT NOT NULL DEFAULT (''),
  `status` VARCHAR(255) NOT NULL DEFAULT 'CON_SU_DUNG',
  `quality_level` TEXT NOT NULL DEFAULT (''),
  `warranty_end_date` DATE NULL,
  `last_maintenance_date` DATE NULL,
  `next_check_date` DATE NULL,
  `note` TEXT NOT NULL DEFAULT (''),
  `source_row` INT NULL,
  `created_by` VARCHAR(36) NULL,
  `updated_by` VARCHAR(36) NULL,
  `created_at` DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  `updated_at` DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  `deleted_at` DATETIME(6) NULL,
  `deleted_by` VARCHAR(36) NULL,
  `asset_kind` VARCHAR(255) NOT NULL DEFAULT 'DEVICE',
  `search_text` VARCHAR(2000) AS (REPLACE(REPLACE(LOWER(CONCAT_WS(' ', COALESCE(`asset_code`, ''), COALESCE(`asset_name`, ''), COALESCE(`serial_number`, ''), COALESCE(`asset_type`, ''), COALESCE(`asset_group_label`, ''), COALESCE(`brand`, ''), COALESCE(`model`, ''), COALESCE(`assigned_to_name`, ''), COALESCE(`department_legacy_name`, ''), COALESCE(`location`, ''))), 'đ', 'd'), 'Đ', 'd')) STORED,
  CONSTRAINT `assets_asset_kind_check` CHECK ((asset_kind IN ('DEVICE', 'COMPONENT'))),
  UNIQUE KEY `assets_legacy_id_key` (`legacy_id`),
  PRIMARY KEY (`id`),
  CONSTRAINT `assets_quantity_check` CHECK ((quantity > 0)),
  CONSTRAINT `assets_unit_price_check` CHECK ((unit_price >= 0)),
  KEY `assets_kind_updated_active_idx` (`asset_kind`, `updated_at` DESC),
  KEY `assets_department_idx` (`department_id`),
  KEY `assets_updated_idx` (`updated_at` DESC),
  KEY `assets_kind_active_idx` (`asset_kind`, `asset_code`),
  KEY `assets_type_updated_active_idx` (`asset_type`, `updated_at` DESC),
  KEY `assets_status_updated_active_idx` (`status`, `updated_at` DESC),
  KEY `assets_status_idx` (`status`),
  KEY `assets_group_idx` (`asset_group`),
  `_u_assets_code_active_idx_1` VARCHAR(255) AS (IF(deleted_at IS NULL, LOWER(`asset_code`), NULL)) VIRTUAL,
  UNIQUE KEY `assets_code_active_idx` (`_u_assets_code_active_idx_1`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `audit_logs` (
  `id` BIGINT NOT NULL AUTO_INCREMENT,
  `actor_user_id` VARCHAR(36) NULL,
  `action` VARCHAR(255) NOT NULL,
  `table_name` VARCHAR(255) NOT NULL,
  `record_id` VARCHAR(36) NULL,
  `old_data` JSON NULL,
  `new_data` JSON NULL,
  `metadata` JSON NOT NULL DEFAULT ('{}'),
  `created_at` DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  PRIMARY KEY (`id`),
  KEY `audit_logs_table_created_idx` (`table_name`, `created_at` DESC),
  KEY `audit_logs_action_created_idx` (`action`, `created_at` DESC),
  KEY `audit_logs_actor_idx` (`actor_user_id`, `created_at` DESC),
  KEY `audit_logs_created_idx` (`created_at` DESC),
  KEY `audit_logs_record_idx` (`table_name`, `record_id`, `created_at` DESC)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `company_surveys` (
  `id` VARCHAR(36) NOT NULL DEFAULT (UUID()),
  `public_token` VARCHAR(36) NOT NULL DEFAULT (UUID()),
  `title` TEXT NOT NULL,
  `description` TEXT NOT NULL DEFAULT (''),
  `questions` JSON NOT NULL DEFAULT ('[]'),
  `status` TEXT NOT NULL DEFAULT ('draft'),
  `published_at` DATETIME(6) NULL,
  `revision` INT NOT NULL DEFAULT 1,
  `response_count` INT NOT NULL DEFAULT 0,
  `created_by` VARCHAR(36) NULL,
  `created_at` DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  `updated_at` DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  CONSTRAINT `company_surveys_description_check` CHECK ((CHAR_LENGTH(description) <= 3000)),
  PRIMARY KEY (`id`),
  UNIQUE KEY `company_surveys_public_token_key` (`public_token`),
  CONSTRAINT `company_surveys_status_check` CHECK ((status IN ('draft', 'open', 'closed'))),
  CONSTRAINT `company_surveys_title_check` CHECK (((CHAR_LENGTH(TRIM(title)) >= 1) AND (CHAR_LENGTH(TRIM(title)) <= 200))),
  KEY `company_surveys_created` (`created_at` DESC, `id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `data_access_scopes` (
  `id` VARCHAR(36) NOT NULL DEFAULT (UUID()),
  `user_id` VARCHAR(36) NOT NULL,
  `module` VARCHAR(255) NOT NULL,
  `scope_type` VARCHAR(255) NOT NULL,
  `department_id` VARCHAR(36) NULL,
  `created_by` VARCHAR(36) NULL,
  `created_at` DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  CONSTRAINT `data_access_scopes_check` CHECK ((((scope_type = 'department') AND (department_id IS NOT NULL)) OR ((scope_type <> 'department') AND (department_id IS NULL)))),
  CONSTRAINT `data_access_scopes_module_check` CHECK ((module IN ('assets', 'maintenance', 'movement', 'software', 'vehicles', 'supplies'))),
  PRIMARY KEY (`id`),
  CONSTRAINT `data_access_scopes_scope_type_check` CHECK ((scope_type IN ('all', 'department', 'assigned', 'owned'))),
  UNIQUE KEY `data_access_scopes_user_id_module_scope_type_department_id_key` (`user_id`, `module`, `scope_type`, `department_id`),
  KEY `data_access_scopes_user_module_idx` (`user_id`, `module`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `departments` (
  `id` VARCHAR(36) NOT NULL DEFAULT (UUID()),
  `legacy_id` VARCHAR(255) NULL,
  `name` VARCHAR(255) NOT NULL,
  `manager_name` TEXT NOT NULL DEFAULT (''),
  `location` TEXT NOT NULL DEFAULT (''),
  `note` TEXT NOT NULL DEFAULT (''),
  `created_at` DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  `updated_at` DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  UNIQUE KEY `departments_legacy_id_key` (`legacy_id`),
  UNIQUE KEY `departments_name_key` (`name`),
  PRIMARY KEY (`id`),
  `_u_departments_name_lower_idx_1` VARCHAR(255) AS (LOWER(`name`)) VIRTUAL,
  UNIQUE KEY `departments_name_lower_idx` (`_u_departments_name_lower_idx_1`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `export_jobs` (
  `id` VARCHAR(36) NOT NULL DEFAULT (UUID()),
  `export_type` TEXT NOT NULL,
  `filters` JSON NOT NULL DEFAULT ('{}'),
  `status` TEXT NOT NULL DEFAULT ('pending'),
  `result_url` TEXT NULL,
  `error` TEXT NULL,
  `requested_by` VARCHAR(36) NULL,
  `created_at` DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  `completed_at` DATETIME(6) NULL,
  `output_format` TEXT NOT NULL DEFAULT ('xlsx'),
  `idempotency_key` VARCHAR(255) NULL,
  CONSTRAINT `export_jobs_idempotency_key_check` CHECK (((idempotency_key IS NULL) OR (idempotency_key REGEXP '^[a-f0-9]{64}$'))),
  CONSTRAINT `export_jobs_output_format_check` CHECK ((output_format IN ('spreadsheet', 'google_doc', 'xlsx', 'pdf'))),
  PRIMARY KEY (`id`),
  CONSTRAINT `export_jobs_status_check` CHECK ((status IN ('pending', 'processing', 'completed', 'failed'))),
  UNIQUE KEY `export_jobs_user_idempotency_idx` (`requested_by`, `idempotency_key`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `inventory_movements` (
  `id` VARCHAR(36) NOT NULL DEFAULT (UUID()),
  `legacy_id` VARCHAR(255) NULL,
  `asset_id` VARCHAR(36) NOT NULL,
  `movement_date` DATE NOT NULL,
  `from_user_id` VARCHAR(36) NULL,
  `to_user_id` VARCHAR(36) NULL,
  `from_user_name` TEXT NOT NULL DEFAULT (''),
  `to_user_name` TEXT NOT NULL DEFAULT (''),
  `from_location` TEXT NOT NULL DEFAULT (''),
  `to_location` TEXT NOT NULL DEFAULT (''),
  `reason` TEXT NOT NULL DEFAULT (''),
  `approved_by_name` TEXT NOT NULL DEFAULT (''),
  `note` TEXT NOT NULL DEFAULT (''),
  `created_by` VARCHAR(36) NULL,
  `created_at` DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  `updated_at` DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  UNIQUE KEY `inventory_movements_legacy_id_key` (`legacy_id`),
  PRIMARY KEY (`id`),
  KEY `inventory_movements_asset_date_idx` (`asset_id`, `movement_date` DESC)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `it_cost_categories` (
  `id` VARCHAR(36) NOT NULL DEFAULT (UUID()),
  `code` VARCHAR(255) NOT NULL,
  `name` TEXT NOT NULL,
  `sort_order` INT NOT NULL DEFAULT 0,
  `active` BOOLEAN NOT NULL DEFAULT TRUE,
  `created_at` DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  `updated_at` DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  CONSTRAINT `it_cost_categories_code_check` CHECK (((CHAR_LENGTH(code) >= 1) AND (CHAR_LENGTH(code) <= 60))),
  UNIQUE KEY `it_cost_categories_code_key` (`code`),
  CONSTRAINT `it_cost_categories_name_check` CHECK (((CHAR_LENGTH(TRIM(name)) >= 1) AND (CHAR_LENGTH(TRIM(name)) <= 150))),
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `it_cost_entries` (
  `id` VARCHAR(36) NOT NULL DEFAULT (UUID()),
  `request_id` VARCHAR(36) NOT NULL,
  `provider` TEXT NOT NULL,
  `recognized_on` DATE NOT NULL,
  `description` TEXT NOT NULL DEFAULT (''),
  `status` TEXT NOT NULL,
  `payment_status` TEXT NOT NULL,
  `paid_on` DATE NULL,
  `discrepancy_reason` TEXT NOT NULL DEFAULT (''),
  `version` INT NOT NULL DEFAULT 1,
  `created_by` VARCHAR(36) NULL,
  `updated_by` VARCHAR(36) NULL,
  `created_at` DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  `updated_at` DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  CONSTRAINT `it_cost_entries_check` CHECK (((payment_status <> 'paid') OR (paid_on IS NOT NULL))),
  CONSTRAINT `it_cost_entries_description_check` CHECK ((CHAR_LENGTH(description) <= 2000)),
  CONSTRAINT `it_cost_entries_discrepancy_reason_check` CHECK ((CHAR_LENGTH(discrepancy_reason) <= 1000)),
  CONSTRAINT `it_cost_entries_payment_status_check` CHECK ((payment_status IN ('unconfirmed', 'unpaid', 'paid'))),
  PRIMARY KEY (`id`),
  CONSTRAINT `it_cost_entries_provider_check` CHECK (((CHAR_LENGTH(TRIM(provider)) >= 1) AND (CHAR_LENGTH(TRIM(provider)) <= 200))),
  CONSTRAINT `it_cost_entries_recognized_on_check` CHECK (((recognized_on >= '2000-01-01') AND (recognized_on <= '2100-12-31'))),
  UNIQUE KEY `it_cost_entries_request_id_key` (`request_id`),
  CONSTRAINT `it_cost_entries_status_check` CHECK ((status IN ('draft', 'confirmed', 'cancelled'))),
  KEY `it_cost_dates` (`recognized_on` DESC, `id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `it_cost_entry_lines` (
  `id` VARCHAR(36) NOT NULL DEFAULT (UUID()),
  `entry_id` VARCHAR(36) NOT NULL,
  `category_id` VARCHAR(36) NOT NULL,
  `service_id` VARCHAR(36) NULL,
  `period_id` VARCHAR(36) NULL,
  `description` TEXT NOT NULL,
  `unit` TEXT NOT NULL DEFAULT (''),
  `quantity` DECIMAL(20,4) NOT NULL DEFAULT 1,
  `unit_price` DECIMAL(18,2) NULL,
  `amount_before_tax` DECIMAL(18,2) NOT NULL,
  `tax_amount` DECIMAL(18,2) NOT NULL,
  `amount_after_tax` DECIMAL(18,2) NOT NULL,
  `document_id` VARCHAR(36) NULL,
  `source_key` VARCHAR(255) NOT NULL DEFAULT '',
  `source_ref` TEXT NOT NULL DEFAULT (''),
  CONSTRAINT `it_cost_entry_lines_amount_after_tax_check` CHECK (((amount_after_tax >= 0) AND (amount_after_tax <= 100000000000))),
  CONSTRAINT `it_cost_entry_lines_amount_before_tax_check` CHECK (((amount_before_tax >= 0) AND (amount_before_tax <= 100000000000))),
  CONSTRAINT `it_cost_entry_lines_check` CHECK ((abs(((amount_before_tax + tax_amount) - amount_after_tax)) <= 1)),
  CONSTRAINT `it_cost_entry_lines_check1` CHECK (((document_id IS NULL) OR (source_key <> ''))),
  CONSTRAINT `it_cost_entry_lines_description_check` CHECK (((CHAR_LENGTH(TRIM(description)) >= 1) AND (CHAR_LENGTH(TRIM(description)) <= 2000))),
  PRIMARY KEY (`id`),
  CONSTRAINT `it_cost_entry_lines_quantity_check` CHECK (((quantity > 0) AND (quantity <= 100000))),
  CONSTRAINT `it_cost_entry_lines_source_key_check` CHECK ((CHAR_LENGTH(source_key) <= 150)),
  CONSTRAINT `it_cost_entry_lines_source_ref_check` CHECK ((CHAR_LENGTH(source_ref) <= 200)),
  CONSTRAINT `it_cost_entry_lines_tax_amount_check` CHECK (((tax_amount >= 0) AND (tax_amount <= 100000000000))),
  CONSTRAINT `it_cost_entry_lines_unit_check` CHECK ((CHAR_LENGTH(unit) <= 50)),
  CONSTRAINT `it_cost_entry_lines_unit_price_check` CHECK (((unit_price >= 0) AND (unit_price <= 100000000000))),
  KEY `it_cost_category` (`category_id`, `entry_id`),
  UNIQUE KEY `it_cost_line_source` (`document_id`, `source_key`),
  KEY `it_cost_service` (`service_id`, `entry_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `it_document_links` (
  `id` VARCHAR(36) NOT NULL DEFAULT (UUID()),
  `document_id` VARCHAR(36) NOT NULL,
  `entry_id` VARCHAR(36) NULL,
  `service_id` VARCHAR(36) NULL,
  `period_id` VARCHAR(36) NULL,
  `created_by` VARCHAR(36) NULL,
  `created_at` DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  CONSTRAINT `it_document_links_check` CHECK ((((entry_id IS NOT NULL) + (service_id IS NOT NULL) + (period_id IS NOT NULL)) = 1)),
  PRIMARY KEY (`id`),
  UNIQUE KEY `it_link_entry` (`document_id`, `entry_id`),
  UNIQUE KEY `it_link_service` (`document_id`, `service_id`),
  UNIQUE KEY `it_link_period` (`document_id`, `period_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `it_documents` (
  `id` VARCHAR(36) NOT NULL,
  `kind` TEXT NOT NULL,
  `provider` TEXT NOT NULL DEFAULT (''),
  `issuer_tax_code` VARCHAR(255) NOT NULL DEFAULT '',
  `number` VARCHAR(255) NOT NULL DEFAULT '',
  `series` VARCHAR(255) NOT NULL DEFAULT '',
  `issued_on` DATE NULL,
  `reference` TEXT NOT NULL DEFAULT (''),
  `total_amount` DECIMAL(18,2) NULL,
  `hash` VARCHAR(255) NOT NULL,
  `storage_path` VARCHAR(255) NOT NULL,
  `name` TEXT NOT NULL,
  `mime` TEXT NOT NULL,
  `size` INT NOT NULL,
  `created_by` VARCHAR(36) NOT NULL,
  `created_at` DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  CONSTRAINT `it_documents_hash_check` CHECK ((hash REGEXP '^[a-f0-9]{64}$')),
  UNIQUE KEY `it_documents_hash_key` (`hash`),
  CONSTRAINT `it_documents_issuer_tax_code_check` CHECK ((CHAR_LENGTH(issuer_tax_code) <= 20)),
  CONSTRAINT `it_documents_kind_check` CHECK ((kind IN ('invoice', 'contract', 'quote', 'other'))),
  CONSTRAINT `it_documents_mime_check` CHECK ((mime IN ('application/pdf', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'))),
  CONSTRAINT `it_documents_name_check` CHECK (((CHAR_LENGTH(name) >= 1) AND (CHAR_LENGTH(name) <= 200))),
  CONSTRAINT `it_documents_number_check` CHECK ((CHAR_LENGTH(number) <= 150)),
  PRIMARY KEY (`id`),
  CONSTRAINT `it_documents_provider_check` CHECK ((CHAR_LENGTH(provider) <= 200)),
  CONSTRAINT `it_documents_reference_check` CHECK ((CHAR_LENGTH(reference) <= 200)),
  CONSTRAINT `it_documents_series_check` CHECK ((CHAR_LENGTH(series) <= 50)),
  CONSTRAINT `it_documents_size_check` CHECK (((size >= 1) AND (size <= 20971520))),
  UNIQUE KEY `it_documents_storage_path_key` (`storage_path`),
  CONSTRAINT `it_documents_total_amount_check` CHECK (((total_amount >= 0) AND (total_amount <= 100000000000))),
  `_u_it_document_invoice_identity_1` VARCHAR(255) AS (IF(kind = 'invoice' AND issuer_tax_code <> '' AND number <> '' AND series <> '', `issuer_tax_code`, NULL)) VIRTUAL,
  `_u_it_document_invoice_identity_2` VARCHAR(255) AS (IF(kind = 'invoice' AND issuer_tax_code <> '' AND number <> '' AND series <> '', UPPER(`series`), NULL)) VIRTUAL,
  `_u_it_document_invoice_identity_3` VARCHAR(255) AS (IF(kind = 'invoice' AND issuer_tax_code <> '' AND number <> '' AND series <> '', `number`, NULL)) VIRTUAL,
  UNIQUE KEY `it_document_invoice_identity` (`_u_it_document_invoice_identity_1`, `_u_it_document_invoice_identity_2`, `_u_it_document_invoice_identity_3`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `it_service_periods` (
  `id` VARCHAR(36) NOT NULL DEFAULT (UUID()),
  `service_id` VARCHAR(36) NOT NULL,
  `starts_on` DATE NOT NULL,
  `expires_on` DATE NOT NULL,
  `cycle` TEXT NOT NULL,
  `remind_days` INT NOT NULL DEFAULT 30,
  `renewed_from_id` VARCHAR(36) NULL,
  `status` TEXT NOT NULL DEFAULT ('active'),
  `note` TEXT NOT NULL DEFAULT (''),
  `version` INT NOT NULL DEFAULT 1,
  `created_by` VARCHAR(36) NULL,
  `updated_by` VARCHAR(36) NULL,
  `created_at` DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  `updated_at` DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  CONSTRAINT `it_service_periods_check` CHECK (((expires_on >= starts_on) AND (starts_on >= '2000-01-01') AND (expires_on <= '2100-12-31'))),
  CONSTRAINT `it_service_periods_check1` CHECK ((NOT (renewed_from_id <=> id))),
  CONSTRAINT `it_service_periods_cycle_check` CHECK ((cycle IN ('month', 'quarter', 'year', 'custom'))),
  CONSTRAINT `it_service_periods_note_check` CHECK ((CHAR_LENGTH(note) <= 2000)),
  PRIMARY KEY (`id`),
  CONSTRAINT `it_service_periods_remind_days_check` CHECK (((remind_days >= 0) AND (remind_days <= 365))),
  CONSTRAINT `it_service_periods_status_check` CHECK ((status IN ('active', 'superseded', 'cancelled'))),
  KEY `it_period_dates` (`expires_on`, `service_id`, `id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `it_services` (
  `id` VARCHAR(36) NOT NULL DEFAULT (UUID()),
  `code` VARCHAR(255) NOT NULL,
  `name` TEXT NOT NULL,
  `category_id` VARCHAR(36) NOT NULL,
  `identifier` TEXT NOT NULL DEFAULT (''),
  `provider` TEXT NOT NULL DEFAULT (''),
  `location` TEXT NOT NULL DEFAULT (''),
  `note` TEXT NOT NULL DEFAULT (''),
  `status` TEXT NOT NULL DEFAULT ('active'),
  `version` INT NOT NULL DEFAULT 1,
  `created_by` VARCHAR(36) NULL,
  `updated_by` VARCHAR(36) NULL,
  `created_at` DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  `updated_at` DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  CONSTRAINT `it_services_code_check` CHECK (((CHAR_LENGTH(TRIM(code)) >= 1) AND (CHAR_LENGTH(TRIM(code)) <= 60))),
  UNIQUE KEY `it_services_code_key` (`code`),
  CONSTRAINT `it_services_identifier_check` CHECK ((CHAR_LENGTH(identifier) <= 200)),
  CONSTRAINT `it_services_location_check` CHECK ((CHAR_LENGTH(location) <= 300)),
  CONSTRAINT `it_services_name_check` CHECK (((CHAR_LENGTH(TRIM(name)) >= 1) AND (CHAR_LENGTH(TRIM(name)) <= 200))),
  CONSTRAINT `it_services_note_check` CHECK ((CHAR_LENGTH(note) <= 2000)),
  PRIMARY KEY (`id`),
  CONSTRAINT `it_services_provider_check` CHECK ((CHAR_LENGTH(provider) <= 200)),
  CONSTRAINT `it_services_status_check` CHECK ((status IN ('active', 'paused', 'archived')))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `maintenance_logs` (
  `id` VARCHAR(36) NOT NULL DEFAULT (UUID()),
  `legacy_id` VARCHAR(255) NULL,
  `asset_id` VARCHAR(36) NOT NULL,
  `plan_id` VARCHAR(36) NULL,
  `maintenance_date` DATE NOT NULL,
  `action_type` TEXT NOT NULL DEFAULT (''),
  `description` TEXT NOT NULL,
  `cost` DECIMAL(18,2) NOT NULL DEFAULT 0,
  `vendor` TEXT NOT NULL DEFAULT (''),
  `warranty_months` INT NOT NULL DEFAULT 0,
  `performed_by` TEXT NOT NULL DEFAULT (''),
  `note` TEXT NOT NULL DEFAULT (''),
  `created_by` VARCHAR(36) NULL,
  `created_at` DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  `updated_at` DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  CONSTRAINT `maintenance_logs_cost_check` CHECK ((cost >= 0)),
  UNIQUE KEY `maintenance_logs_legacy_id_key` (`legacy_id`),
  PRIMARY KEY (`id`),
  CONSTRAINT `maintenance_logs_warranty_months_check` CHECK ((warranty_months >= 0)),
  KEY `maintenance_logs_asset_date_idx` (`asset_id`, `maintenance_date` DESC)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `maintenance_notification_logs` (
  `id` VARCHAR(36) NOT NULL DEFAULT (UUID()),
  `legacy_id` VARCHAR(255) NULL,
  `plan_id` VARCHAR(36) NOT NULL,
  `asset_id` VARCHAR(36) NOT NULL,
  `recipient_email` VARCHAR(255) NOT NULL,
  `notification_type` VARCHAR(255) NOT NULL,
  `due_date` DATE NOT NULL,
  `sent_at` DATETIME(6) NULL,
  `status` TEXT NOT NULL,
  `error` TEXT NOT NULL DEFAULT (''),
  `created_at` DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  `updated_at` DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  UNIQUE KEY `maintenance_notification_logs_legacy_id_key` (`legacy_id`),
  PRIMARY KEY (`id`),
  UNIQUE KEY `maintenance_notification_logs_plan_id_recipient_email_notif_key` (`plan_id`, `recipient_email`, `notification_type`, `due_date`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `maintenance_plans` (
  `id` VARCHAR(36) NOT NULL DEFAULT (UUID()),
  `legacy_id` VARCHAR(255) NULL,
  `asset_id` VARCHAR(36) NOT NULL,
  `title` TEXT NOT NULL,
  `frequency` TEXT NOT NULL,
  `next_due_date` DATE NOT NULL,
  `note` TEXT NOT NULL DEFAULT (''),
  `active` BOOLEAN NOT NULL DEFAULT TRUE,
  `created_by` VARCHAR(36) NULL,
  `created_at` DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  `updated_at` DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  `batch_id` VARCHAR(36) NOT NULL DEFAULT (UUID()),
  `scope_type` TEXT NOT NULL DEFAULT ('ASSET'),
  `scope_value` TEXT NOT NULL DEFAULT (''),
  `repeat_enabled` BOOLEAN NOT NULL DEFAULT TRUE,
  CONSTRAINT `maintenance_plans_frequency_check` CHECK ((frequency IN ('MONTHLY', 'QUARTERLY', 'YEARLY'))),
  UNIQUE KEY `maintenance_plans_legacy_id_key` (`legacy_id`),
  PRIMARY KEY (`id`),
  CONSTRAINT `maintenance_plans_scope_type_check` CHECK ((scope_type IN ('ASSET', 'GROUP', 'TYPE'))),
  KEY `maintenance_plans_batch_idx` (`batch_id`, `active`, `next_due_date`),
  KEY `maintenance_plans_due_idx` (`active`, `next_due_date`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `media_files` (
  `id` VARCHAR(36) NOT NULL DEFAULT (UUID()),
  `legacy_id` VARCHAR(255) NULL,
  `owner_type` VARCHAR(255) NOT NULL,
  `owner_id` VARCHAR(36) NOT NULL,
  `asset_id` VARCHAR(36) NOT NULL,
  `bucket_id` TEXT NOT NULL DEFAULT ('asset-media'),
  `object_path` VARCHAR(255) NOT NULL,
  `file_name` TEXT NOT NULL,
  `mime_type` TEXT NOT NULL,
  `byte_size` BIGINT NOT NULL DEFAULT 0,
  `width` INT NULL,
  `height` INT NULL,
  `sort_order` INT NOT NULL DEFAULT 0,
  `legacy_drive_file_id` TEXT NULL,
  `created_by` VARCHAR(36) NULL,
  `created_at` DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  `updated_at` DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  `thumbnail_path` VARCHAR(255) NULL,
  `checksum` VARCHAR(255) NULL,
  CONSTRAINT `media_files_byte_size_check` CHECK ((byte_size >= 0)),
  CONSTRAINT `media_files_checksum_sha256` CHECK (((checksum IS NULL) OR (checksum REGEXP '^[0-9a-f]{64}$'))),
  UNIQUE KEY `media_files_legacy_id_key` (`legacy_id`),
  CONSTRAINT `media_files_mime_type_check` CHECK ((mime_type IN ('image/jpeg', 'image/png', 'image/webp'))),
  UNIQUE KEY `media_files_object_path_key` (`object_path`),
  CONSTRAINT `media_files_owner_type_check` CHECK ((owner_type IN ('ASSET', 'MAINTENANCE'))),
  PRIMARY KEY (`id`),
  CONSTRAINT `media_files_thumbnail_path_distinct` CHECK (((thumbnail_path IS NULL) OR (thumbnail_path <> object_path))),
  KEY `media_files_checksum_idx` (`checksum`),
  KEY `media_files_owner_idx` (`owner_type`, `owner_id`, `sort_order`),
  KEY `media_files_asset_idx` (`asset_id`, `sort_order`),
  UNIQUE KEY `media_files_thumbnail_path_idx` (`thumbnail_path`),
  KEY `media_files_asset_owner_order_idx` (`asset_id`, `owner_type`, `sort_order`, `created_at`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `permissions` (
  `code` VARCHAR(255) NOT NULL,
  `module` TEXT NOT NULL,
  `description` TEXT NOT NULL,
  `created_at` DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  PRIMARY KEY (`code`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `profiles` (
  `id` VARCHAR(36) NOT NULL,
  `email` VARCHAR(255) NOT NULL,
  `full_name` TEXT NOT NULL DEFAULT (''),
  `active` BOOLEAN NOT NULL DEFAULT TRUE,
  `must_enroll_mfa` BOOLEAN NOT NULL DEFAULT FALSE,
  `last_login_at` DATETIME(6) NULL,
  `created_at` DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  `updated_at` DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  PRIMARY KEY (`id`),
  `_u_profiles_email_lower_idx_1` VARCHAR(255) AS (LOWER(`email`)) VIRTUAL,
  UNIQUE KEY `profiles_email_lower_idx` (`_u_profiles_email_lower_idx_1`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `role_permissions` (
  `role_id` VARCHAR(36) NOT NULL,
  `permission_code` VARCHAR(255) NOT NULL,
  `created_at` DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  PRIMARY KEY (`role_id`, `permission_code`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `roles` (
  `id` VARCHAR(36) NOT NULL DEFAULT (UUID()),
  `code` VARCHAR(255) NOT NULL,
  `name` VARCHAR(255) NOT NULL,
  `created_at` DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  UNIQUE KEY `roles_code_key` (`code`),
  UNIQUE KEY `roles_name_key` (`name`),
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `settings` (
  `id` VARCHAR(36) NOT NULL DEFAULT (UUID()),
  `legacy_id` VARCHAR(255) NULL,
  `setting_type` VARCHAR(255) NOT NULL,
  `setting_value` VARCHAR(255) NOT NULL,
  `display_name` TEXT NOT NULL,
  `sort_order` INT NOT NULL DEFAULT 0,
  `active` BOOLEAN NOT NULL DEFAULT TRUE,
  `created_at` DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  `updated_at` DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  UNIQUE KEY `settings_legacy_id_key` (`legacy_id`),
  PRIMARY KEY (`id`),
  UNIQUE KEY `settings_setting_type_setting_value_key` (`setting_type`, `setting_value`),
  KEY `settings_type_active_idx` (`setting_type`, `active`, `sort_order`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `software_license_assets` (
  `id` VARCHAR(36) NOT NULL DEFAULT (UUID()),
  `license_id` VARCHAR(36) NOT NULL,
  `asset_id` VARCHAR(36) NOT NULL,
  `assigned_by` VARCHAR(36) NULL,
  `created_at` DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  UNIQUE KEY `software_license_assets_license_id_asset_id_key` (`license_id`, `asset_id`),
  PRIMARY KEY (`id`),
  KEY `software_license_assets_asset_idx` (`asset_id`, `license_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `software_license_secrets` (
  `license_id` VARCHAR(36) NOT NULL,
  `ciphertext` TEXT NOT NULL,
  `iv` TEXT NOT NULL,
  `auth_tag` TEXT NOT NULL,
  `encryption_version` SMALLINT NOT NULL DEFAULT 1,
  `updated_by` VARCHAR(36) NULL,
  `created_at` DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  `updated_at` DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  CONSTRAINT `software_license_secrets_auth_tag_check` CHECK (((CHAR_LENGTH(auth_tag) >= 1) AND (CHAR_LENGTH(auth_tag) <= 64))),
  CONSTRAINT `software_license_secrets_ciphertext_check` CHECK (((CHAR_LENGTH(ciphertext) >= 1) AND (CHAR_LENGTH(ciphertext) <= 8192))),
  CONSTRAINT `software_license_secrets_encryption_version_check` CHECK ((encryption_version = 1)),
  CONSTRAINT `software_license_secrets_iv_check` CHECK (((CHAR_LENGTH(iv) >= 1) AND (CHAR_LENGTH(iv) <= 64))),
  PRIMARY KEY (`license_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `software_licenses` (
  `id` VARCHAR(36) NOT NULL DEFAULT (UUID()),
  `legacy_id` VARCHAR(255) NULL,
  `software_name` TEXT NOT NULL,
  `version` TEXT NOT NULL DEFAULT (''),
  `license_key_masked` TEXT NOT NULL DEFAULT (''),
  `license_secret_ref` TEXT NOT NULL DEFAULT (''),
  `assigned_asset_id` VARCHAR(36) NULL,
  `assigned_user_id` VARCHAR(36) NULL,
  `assigned_user_name` TEXT NOT NULL DEFAULT (''),
  `expiry_date` DATE NULL,
  `status` TEXT NOT NULL DEFAULT (''),
  `note` TEXT NOT NULL DEFAULT (''),
  `created_by` VARCHAR(36) NULL,
  `created_at` DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  `updated_at` DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  UNIQUE KEY `software_licenses_legacy_id_key` (`legacy_id`),
  PRIMARY KEY (`id`),
  KEY `software_licenses_expiry_idx` (`expiry_date`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `supply_inventory_movements` (
  `id` VARCHAR(36) NOT NULL DEFAULT (UUID()),
  `item_id` VARCHAR(36) NOT NULL,
  `movement_type` TEXT NOT NULL,
  `quantity` DECIMAL(14,3) NOT NULL,
  `unit_price` DECIMAL(18,2) NOT NULL DEFAULT 0,
  `movement_date` DATE NOT NULL DEFAULT (CURRENT_DATE),
  `source_type` VARCHAR(255) NOT NULL DEFAULT 'MANUAL',
  `source_id` VARCHAR(36) NULL,
  `source_line_id` VARCHAR(36) NULL,
  `reference_no` TEXT NOT NULL DEFAULT (''),
  `note` TEXT NOT NULL DEFAULT (''),
  `created_by` VARCHAR(36) NULL,
  `created_at` DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  CONSTRAINT `supply_inventory_movements_movement_type_check` CHECK ((movement_type IN ('RECEIPT', 'ISSUE', 'ADJUSTMENT_IN', 'ADJUSTMENT_OUT', 'RETURN_IN', 'RECEIPT_REVERSAL'))),
  PRIMARY KEY (`id`),
  CONSTRAINT `supply_inventory_movements_quantity_check` CHECK ((quantity > 0)),
  CONSTRAINT `supply_inventory_movements_source_type_check` CHECK ((source_type IN ('SUPPLIER_QUOTE', 'SUPPLY_REQUEST', 'MANUAL'))),
  CONSTRAINT `supply_inventory_movements_unit_price_check` CHECK ((unit_price >= 0)),
  KEY `supply_inventory_movements_item_date_idx` (`item_id`, `movement_date` DESC, `created_at` DESC),
  KEY `supply_inventory_movements_source_idx` (`source_type`, `source_line_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `supply_items` (
  `id` VARCHAR(36) NOT NULL DEFAULT (UUID()),
  `category` VARCHAR(255) NOT NULL,
  `item_code` VARCHAR(255) NOT NULL DEFAULT '',
  `item_name` VARCHAR(255) NOT NULL,
  `unit` TEXT NOT NULL,
  `description` TEXT NOT NULL DEFAULT (''),
  `default_unit_price` DECIMAL(18,2) NOT NULL DEFAULT 0,
  `active` BOOLEAN NOT NULL DEFAULT TRUE,
  `created_by` VARCHAR(36) NULL,
  `updated_by` VARCHAR(36) NULL,
  `created_at` DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  `updated_at` DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  `deleted_at` DATETIME(6) NULL,
  CONSTRAINT `supply_items_category_check` CHECK ((category IN ('OFFICE_SUPPLY', 'CLEANING_SUPPLY'))),
  CONSTRAINT `supply_items_default_unit_price_check` CHECK ((default_unit_price >= 0)),
  PRIMARY KEY (`id`),
  KEY `supply_items_category_idx` (`category`, `active`, `item_name`),
  `_u_supply_items_item_code_active_idx_1` VARCHAR(255) AS (IF(TRIM(item_code) <> '' AND deleted_at IS NULL, UPPER(`item_code`), NULL)) VIRTUAL,
  UNIQUE KEY `supply_items_item_code_active_idx` (`_u_supply_items_item_code_active_idx_1`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `supply_quote_lines` (
  `id` VARCHAR(36) NOT NULL DEFAULT (UUID()),
  `quote_id` VARCHAR(36) NOT NULL,
  `item_id` VARCHAR(36) NULL,
  `item_name` TEXT NOT NULL,
  `unit` TEXT NOT NULL DEFAULT (''),
  `quantity` DECIMAL(14,3) NOT NULL DEFAULT 0,
  `unit_price` DECIMAL(18,2) NOT NULL DEFAULT 0,
  `old_unit_price` DECIMAL(18,2) NULL,
  `amount` DECIMAL(18,2) NOT NULL DEFAULT 0,
  `note` TEXT NOT NULL DEFAULT (''),
  `sort_order` INT NOT NULL DEFAULT 0,
  `created_by` VARCHAR(36) NULL,
  `updated_by` VARCHAR(36) NULL,
  `created_at` DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  `updated_at` DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  `category` TEXT NOT NULL,
  `item_code` TEXT NOT NULL DEFAULT (''),
  CONSTRAINT `supply_quote_lines_amount_check` CHECK ((amount >= 0)),
  CONSTRAINT `supply_quote_lines_category_check` CHECK ((category IN ('OFFICE_SUPPLY', 'CLEANING_SUPPLY'))),
  CONSTRAINT `supply_quote_lines_old_unit_price_check` CHECK (((old_unit_price IS NULL) OR (old_unit_price >= 0))),
  PRIMARY KEY (`id`),
  CONSTRAINT `supply_quote_lines_quantity_check` CHECK ((quantity >= 0)),
  CONSTRAINT `supply_quote_lines_unit_price_check` CHECK ((unit_price >= 0)),
  KEY `supply_quote_lines_quote_idx` (`quote_id`, `sort_order`),
  KEY `supply_quote_lines_item_idx` (`item_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `supply_quotes` (
  `id` VARCHAR(36) NOT NULL DEFAULT (UUID()),
  `quote_no` TEXT NOT NULL DEFAULT (''),
  `vendor_name` VARCHAR(255) NOT NULL,
  `vendor_address` TEXT NOT NULL DEFAULT (''),
  `vendor_contact` TEXT NOT NULL DEFAULT (''),
  `category` TEXT NOT NULL,
  `quote_date` DATE NULL,
  `valid_until` DATE NULL,
  `status` TEXT NOT NULL DEFAULT ('RECEIVED'),
  `subtotal` DECIMAL(18,2) NOT NULL DEFAULT 0,
  `tax_rate` DECIMAL(8,4) NOT NULL DEFAULT 0,
  `tax_amount` DECIMAL(18,2) NOT NULL DEFAULT 0,
  `total_amount` DECIMAL(18,2) NOT NULL DEFAULT 0,
  `note` TEXT NOT NULL DEFAULT (''),
  `source_file` TEXT NOT NULL DEFAULT (''),
  `source_sheet` TEXT NOT NULL DEFAULT (''),
  `import_fingerprint` VARCHAR(255) NULL,
  `created_by` VARCHAR(36) NULL,
  `updated_by` VARCHAR(36) NULL,
  `created_at` DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  `updated_at` DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  `deleted_at` DATETIME(6) NULL,
  CONSTRAINT `supply_quotes_category_check` CHECK ((category IN ('OFFICE_SUPPLY', 'CLEANING_SUPPLY', 'MIXED'))),
  PRIMARY KEY (`id`),
  CONSTRAINT `supply_quotes_status_check` CHECK ((status IN ('RECEIVED', 'REVIEWING', 'SELECTED', 'REJECTED', 'EXPIRED'))),
  CONSTRAINT `supply_quotes_subtotal_check` CHECK ((subtotal >= 0)),
  CONSTRAINT `supply_quotes_tax_amount_check` CHECK ((tax_amount >= 0)),
  CONSTRAINT `supply_quotes_tax_rate_check` CHECK ((tax_rate >= 0)),
  CONSTRAINT `supply_quotes_total_amount_check` CHECK ((total_amount >= 0)),
  KEY `supply_quotes_vendor_date_idx` (`vendor_name`, `quote_date` DESC),
  `_u_supply_quotes_fingerprint_idx_1` VARCHAR(255) AS (IF(deleted_at IS NULL, `import_fingerprint`, NULL)) VIRTUAL,
  UNIQUE KEY `supply_quotes_fingerprint_idx` (`_u_supply_quotes_fingerprint_idx_1`),
  KEY `supply_quotes_date_idx` (`quote_date` DESC)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `supply_request_lines` (
  `id` VARCHAR(36) NOT NULL DEFAULT (UUID()),
  `request_id` VARCHAR(36) NOT NULL,
  `item_id` VARCHAR(36) NULL,
  `item_name` TEXT NOT NULL,
  `unit` TEXT NOT NULL,
  `proposed_quantity` DECIMAL(14,3) NOT NULL DEFAULT 0,
  `stock_quantity` DECIMAL(14,3) NOT NULL DEFAULT 0,
  `ordered_quantity` DECIMAL(14,3) NOT NULL DEFAULT 0,
  `requested_departments` TEXT NOT NULL DEFAULT (''),
  `approval_note` TEXT NOT NULL DEFAULT (''),
  `proposed_unit_price` DECIMAL(18,2) NULL,
  `approved_unit_price` DECIMAL(18,2) NOT NULL DEFAULT 0,
  `amount` DECIMAL(18,2) AS (`ordered_quantity` * `approved_unit_price`) STORED,
  `note` TEXT NOT NULL DEFAULT (''),
  `sort_order` INT NOT NULL DEFAULT 0,
  `created_by` VARCHAR(36) NULL,
  `updated_by` VARCHAR(36) NULL,
  `created_at` DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  `updated_at` DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  `item_code` TEXT NOT NULL DEFAULT (''),
  CONSTRAINT `supply_request_lines_approved_unit_price_check` CHECK ((approved_unit_price >= 0)),
  CONSTRAINT `supply_request_lines_ordered_quantity_check` CHECK ((ordered_quantity >= 0)),
  PRIMARY KEY (`id`),
  CONSTRAINT `supply_request_lines_proposed_quantity_check` CHECK ((proposed_quantity >= 0)),
  CONSTRAINT `supply_request_lines_proposed_unit_price_check` CHECK (((proposed_unit_price IS NULL) OR (proposed_unit_price >= 0))),
  CONSTRAINT `supply_request_lines_stock_quantity_check` CHECK ((stock_quantity >= 0)),
  KEY `supply_request_lines_item_idx` (`item_id`),
  KEY `supply_request_lines_request_idx` (`request_id`, `sort_order`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `supply_requests` (
  `id` VARCHAR(36) NOT NULL DEFAULT (UUID()),
  `request_no` TEXT NOT NULL,
  `category` VARCHAR(255) NOT NULL,
  `period_type` TEXT NOT NULL DEFAULT ('QUARTER'),
  `period_year` SMALLINT NOT NULL,
  `period_month` SMALLINT NULL,
  `period_quarter` SMALLINT NULL,
  `requested_on` DATE NOT NULL DEFAULT (CURRENT_DATE),
  `required_on` DATE NULL,
  `department_id` VARCHAR(36) NULL,
  `requesting_department` TEXT NOT NULL DEFAULT (''),
  `requester_name` TEXT NOT NULL DEFAULT (''),
  `checker_name` TEXT NOT NULL DEFAULT (''),
  `approver_name` TEXT NOT NULL DEFAULT (''),
  `status` TEXT NOT NULL DEFAULT ('DRAFT'),
  `note` TEXT NOT NULL DEFAULT (''),
  `source_file` TEXT NOT NULL DEFAULT (''),
  `source_sheet` TEXT NOT NULL DEFAULT (''),
  `import_fingerprint` VARCHAR(255) NULL,
  `created_by` VARCHAR(36) NULL,
  `updated_by` VARCHAR(36) NULL,
  `created_at` DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  `updated_at` DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  `deleted_at` DATETIME(6) NULL,
  CONSTRAINT `supply_requests_category_check` CHECK ((category IN ('OFFICE_SUPPLY', 'CLEANING_SUPPLY'))),
  CONSTRAINT `supply_requests_check` CHECK ((((period_type = 'MONTH') AND (period_month IS NOT NULL) AND (period_quarter IS NULL)) OR ((period_type = 'QUARTER') AND (period_quarter IS NOT NULL) AND (period_month IS NULL)) OR ((period_type = 'YEAR') AND (period_month IS NULL) AND (period_quarter IS NULL)))),
  CONSTRAINT `supply_requests_period_month_check` CHECK (((period_month IS NULL) OR ((period_month >= 1) AND (period_month <= 12)))),
  CONSTRAINT `supply_requests_period_quarter_check` CHECK (((period_quarter IS NULL) OR ((period_quarter >= 1) AND (period_quarter <= 4)))),
  CONSTRAINT `supply_requests_period_type_check` CHECK ((period_type IN ('MONTH', 'QUARTER', 'YEAR'))),
  CONSTRAINT `supply_requests_period_year_check` CHECK (((period_year >= 2000) AND (period_year <= 2200))),
  PRIMARY KEY (`id`),
  CONSTRAINT `supply_requests_status_check` CHECK ((status IN ('DRAFT', 'READY_TO_BUY', 'ORDERED', 'PARTIALLY_RECEIVED', 'RECEIVED', 'COMPLETED', 'CANCELLED'))),
  `_u_supply_requests_fingerprint_idx_1` VARCHAR(255) AS (IF(deleted_at IS NULL, `import_fingerprint`, NULL)) VIRTUAL,
  UNIQUE KEY `supply_requests_fingerprint_idx` (`_u_supply_requests_fingerprint_idx_1`),
  KEY `supply_requests_requested_idx` (`requested_on` DESC),
  KEY `supply_requests_period_idx` (`period_year` DESC, `period_quarter`, `period_month`, `category`),
  KEY `supply_requests_department_idx` (`department_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `survey_responses` (
  `id` VARCHAR(36) NOT NULL DEFAULT (UUID()),
  `survey_id` VARCHAR(36) NOT NULL,
  `submission_id` VARCHAR(36) NOT NULL,
  `full_name` TEXT NOT NULL,
  `phone` TEXT NOT NULL DEFAULT (''),
  `email` TEXT NOT NULL DEFAULT (''),
  `answers` JSON NOT NULL,
  `submitted_at` DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  CONSTRAINT `survey_responses_check` CHECK (((phone <> '') OR (email <> ''))),
  CONSTRAINT `survey_responses_email_check` CHECK (((CHAR_LENGTH(email) <= 254) AND ((email = '') OR (email REGEXP '^[^[:space:]@]+@[^[:space:]@]+\\.[^[:space:]@]+$')))),
  CONSTRAINT `survey_responses_full_name_check` CHECK (((CHAR_LENGTH(TRIM(full_name)) >= 2) AND (CHAR_LENGTH(TRIM(full_name)) <= 120))),
  CONSTRAINT `survey_responses_phone_check` CHECK (((phone = '') OR (phone REGEXP '^\\+?[0-9]{8,15}$'))),
  PRIMARY KEY (`id`),
  UNIQUE KEY `survey_responses_survey_id_submission_id_key` (`survey_id`, `submission_id`),
  KEY `survey_responses_listing` (`survey_id`, `submitted_at` DESC, `id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `telecom_invoices` (
  `id` VARCHAR(36) NOT NULL DEFAULT (UUID()),
  `category` TEXT NOT NULL,
  `provider` TEXT NOT NULL,
  `issuer_tax_code` VARCHAR(255) NOT NULL,
  `invoice_series` VARCHAR(255) NOT NULL,
  `invoice_number` VARCHAR(255) NOT NULL,
  `issued_on` DATE NOT NULL,
  `period_month` DATE NOT NULL,
  `subscriber` VARCHAR(255) NOT NULL,
  `contract_number` TEXT NOT NULL DEFAULT (''),
  `service` TEXT NOT NULL,
  `group_name` TEXT NOT NULL DEFAULT (''),
  `amount_before_tax` DECIMAL(18,2) NOT NULL,
  `tax_amount` DECIMAL(18,2) NOT NULL,
  `amount_after_tax` DECIMAL(18,2) NOT NULL,
  `source_file` TEXT NOT NULL,
  `source_page` INT NOT NULL,
  `paid_on` DATE NULL DEFAULT (CAST(UTC_TIMESTAMP() + INTERVAL 7 HOUR AS DATE)),
  `note` TEXT NOT NULL DEFAULT (''),
  `created_by` VARCHAR(36) NULL,
  `updated_by` VARCHAR(36) NULL,
  `created_at` DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  `updated_at` DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  `deleted_at` DATETIME(6) NULL,
  CONSTRAINT `telecom_invoices_amount_after_tax_check` CHECK (((amount_after_tax >= 0) AND (amount_after_tax <= 100000000000))),
  CONSTRAINT `telecom_invoices_amount_before_tax_check` CHECK (((amount_before_tax >= 0) AND (amount_before_tax <= 100000000000))),
  CONSTRAINT `telecom_invoices_category_check` CHECK ((category IN ('pipeline', 'landline', 'director'))),
  CONSTRAINT `telecom_invoices_check` CHECK ((abs(((amount_before_tax + tax_amount) - amount_after_tax)) <= 1)),
  CONSTRAINT `telecom_invoices_contract_number_check` CHECK ((CHAR_LENGTH(contract_number) <= 150)),
  CONSTRAINT `telecom_invoices_group_name_check` CHECK ((CHAR_LENGTH(group_name) <= 120)),
  CONSTRAINT `telecom_invoices_invoice_number_check` CHECK ((invoice_number REGEXP '^\\d{1,20}$')),
  CONSTRAINT `telecom_invoices_invoice_series_check` CHECK (((CHAR_LENGTH(invoice_series) >= 1) AND (CHAR_LENGTH(invoice_series) <= 30))),
  CONSTRAINT `telecom_invoices_issuer_tax_code_check` CHECK ((issuer_tax_code REGEXP '^\\d{10}(-?\\d{3})?$')),
  CONSTRAINT `telecom_invoices_note_check` CHECK ((CHAR_LENGTH(note) <= 2000)),
  CONSTRAINT `telecom_invoices_period_month_check` CHECK (((EXTRACT(day FROM period_month) = 1) AND ((period_month >= '2000-01-01') AND (period_month <= '2100-12-01')))),
  PRIMARY KEY (`id`),
  CONSTRAINT `telecom_invoices_provider_check` CHECK (((CHAR_LENGTH(provider) >= 1) AND (CHAR_LENGTH(provider) <= 200))),
  CONSTRAINT `telecom_invoices_service_check` CHECK (((CHAR_LENGTH(service) >= 1) AND (CHAR_LENGTH(service) <= 200))),
  CONSTRAINT `telecom_invoices_source_file_check` CHECK (((CHAR_LENGTH(source_file) >= 1) AND (CHAR_LENGTH(source_file) <= 200))),
  CONSTRAINT `telecom_invoices_source_page_check` CHECK (((source_page >= 1) AND (source_page <= 200))),
  CONSTRAINT `telecom_invoices_subscriber_check` CHECK ((subscriber REGEXP '^\\+?\\d{6,20}$')),
  CONSTRAINT `telecom_invoices_tax_amount_check` CHECK (((tax_amount >= 0) AND (tax_amount <= 100000000000))),
  KEY `telecom_invoice_period` (`period_month`, `subscriber`, `id`),
  `_u_telecom_invoice_identity_1` VARCHAR(255) AS (IF(deleted_at IS NULL, `issuer_tax_code`, NULL)) VIRTUAL,
  `_u_telecom_invoice_identity_2` VARCHAR(255) AS (IF(deleted_at IS NULL, `invoice_series`, NULL)) VIRTUAL,
  `_u_telecom_invoice_identity_3` VARCHAR(255) AS (IF(deleted_at IS NULL, `invoice_number`, NULL)) VIRTUAL,
  UNIQUE KEY `telecom_invoice_identity` (`_u_telecom_invoice_identity_1`, `_u_telecom_invoice_identity_2`, `_u_telecom_invoice_identity_3`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `telecom_phones` (
  `id` VARCHAR(36) NOT NULL DEFAULT (UUID()),
  `phone` VARCHAR(255) NOT NULL,
  `location` TEXT NOT NULL DEFAULT (''),
  `serial` TEXT NOT NULL DEFAULT (''),
  `replacement_phone` TEXT NOT NULL DEFAULT (''),
  `status` TEXT NOT NULL,
  `note` TEXT NOT NULL DEFAULT (''),
  `created_by` VARCHAR(36) NULL,
  `updated_by` VARCHAR(36) NULL,
  `created_at` DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  `updated_at` DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  `deleted_at` DATETIME(6) NULL,
  CONSTRAINT `telecom_phones_location_check` CHECK ((CHAR_LENGTH(location) <= 300)),
  CONSTRAINT `telecom_phones_note_check` CHECK ((CHAR_LENGTH(note) <= 2000)),
  CONSTRAINT `telecom_phones_phone_check` CHECK ((phone REGEXP '^\\+?[0-9]{6,20}$')),
  PRIMARY KEY (`id`),
  CONSTRAINT `telecom_phones_replacement_phone_check` CHECK (((replacement_phone = '') OR (replacement_phone REGEXP '^\\+?[0-9]{6,20}$'))),
  CONSTRAINT `telecom_phones_serial_check` CHECK ((CHAR_LENGTH(serial) <= 100)),
  CONSTRAINT `telecom_phones_status_check` CHECK ((status IN ('active', 'inactive', 'cancelled', 'unknown'))),
  `_u_telecom_phones_identity_1` VARCHAR(255) AS (IF(deleted_at IS NULL, `phone`, NULL)) VIRTUAL,
  UNIQUE KEY `telecom_phones_identity` (`_u_telecom_phones_identity_1`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `user_module_access` (
  `id` VARCHAR(36) NOT NULL DEFAULT (UUID()),
  `user_id` VARCHAR(36) NOT NULL,
  `module` VARCHAR(255) NOT NULL,
  `created_by` VARCHAR(36) NULL,
  `created_at` DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  CONSTRAINT `user_module_access_module_check` CHECK ((module IN ('equipment', 'vehicles', 'supplies', 'telecom', 'surveys', 'it_costs'))),
  PRIMARY KEY (`id`),
  UNIQUE KEY `user_module_access_user_id_module_key` (`user_id`, `module`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `user_roles` (
  `user_id` VARCHAR(36) NOT NULL,
  `role_id` VARCHAR(36) NOT NULL,
  `created_at` DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  PRIMARY KEY (`user_id`, `role_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `vehicle_documents` (
  `id` VARCHAR(36) NOT NULL DEFAULT (UUID()),
  `vehicle_id` VARCHAR(36) NOT NULL,
  `record_type` VARCHAR(255) NOT NULL,
  `record_id` VARCHAR(36) NOT NULL,
  `bucket_id` TEXT NOT NULL DEFAULT ('vehicle-documents'),
  `object_path` VARCHAR(255) NOT NULL,
  `file_name` TEXT NOT NULL,
  `mime_type` TEXT NOT NULL DEFAULT ('application/pdf'),
  `original_byte_size` BIGINT NOT NULL,
  `stored_byte_size` BIGINT NOT NULL,
  `compression_method` TEXT NOT NULL DEFAULT ('ORIGINAL'),
  `checksum` TEXT NOT NULL,
  `page_count` INT NOT NULL,
  `created_by` VARCHAR(36) NULL,
  `created_at` DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  `updated_at` DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  `document_kind` VARCHAR(255) NOT NULL DEFAULT 'INVOICE',
  CONSTRAINT `vehicle_documents_bucket_id_check` CHECK ((bucket_id = 'vehicle-documents')),
  CONSTRAINT `vehicle_documents_checksum_check` CHECK ((checksum REGEXP '^[0-9a-f]{64}$')),
  CONSTRAINT `vehicle_documents_compression_method_check` CHECK ((compression_method IN ('ORIGINAL', 'LOSSLESS', 'RASTERIZED'))),
  CONSTRAINT `vehicle_documents_document_kind_check` CHECK ((document_kind IN ('INVOICE', 'CERTIFICATE'))),
  CONSTRAINT `vehicle_documents_mime_type_check` CHECK ((mime_type = 'application/pdf')),
  UNIQUE KEY `vehicle_documents_object_path_key` (`object_path`),
  CONSTRAINT `vehicle_documents_original_byte_size_check` CHECK ((original_byte_size > 0)),
  CONSTRAINT `vehicle_documents_page_count_check` CHECK (((page_count >= 1) AND (page_count <= 200))),
  PRIMARY KEY (`id`),
  UNIQUE KEY `vehicle_documents_record_document_kind_key` (`record_type`, `record_id`, `document_kind`),
  CONSTRAINT `vehicle_documents_record_type_check` CHECK ((record_type IN ('INSPECTION', 'REPAIR', 'FUEL', 'INSURANCE'))),
  CONSTRAINT `vehicle_documents_stored_byte_size_check` CHECK ((stored_byte_size > 0)),
  KEY `vehicle_documents_vehicle_idx` (`vehicle_id`, `record_type`, `created_at` DESC),
  KEY `vehicle_documents_record_created_idx` (`record_type`, `created_at` DESC)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `vehicle_fuel_logs` (
  `id` VARCHAR(36) NOT NULL DEFAULT (UUID()),
  `vehicle_id` VARCHAR(36) NOT NULL,
  `payment_date` DATE NOT NULL,
  `liters` DECIMAL(12,3) NOT NULL,
  `odometer_from` INT NULL,
  `odometer_to` INT NULL,
  `amount` DECIMAL(18,2) NOT NULL DEFAULT 0,
  `purchaser` TEXT NOT NULL DEFAULT (''),
  `note` TEXT NOT NULL DEFAULT (''),
  `source_file` VARCHAR(255) NOT NULL DEFAULT '',
  `source_sheet` VARCHAR(255) NOT NULL DEFAULT '',
  `source_row` INT NULL,
  `import_fingerprint` VARCHAR(255) NULL,
  `created_by` VARCHAR(36) NULL,
  `updated_by` VARCHAR(36) NULL,
  `created_at` DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  `updated_at` DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  CONSTRAINT `vehicle_fuel_logs_amount_check` CHECK ((amount >= 0)),
  CONSTRAINT `vehicle_fuel_logs_check` CHECK (((odometer_from IS NULL) OR (odometer_to IS NULL) OR (odometer_to >= odometer_from))),
  CONSTRAINT `vehicle_fuel_logs_liters_check` CHECK ((liters > 0)),
  CONSTRAINT `vehicle_fuel_logs_odometer_from_check` CHECK (((odometer_from IS NULL) OR (odometer_from >= 0))),
  CONSTRAINT `vehicle_fuel_logs_odometer_to_check` CHECK (((odometer_to IS NULL) OR (odometer_to >= 0))),
  PRIMARY KEY (`id`),
  KEY `vehicle_fuel_vehicle_date_idx` (`vehicle_id`, `payment_date` DESC),
  KEY `vehicle_fuel_logs_source_position_idx` (`source_file`, `source_sheet`, `source_row`),
  UNIQUE KEY `vehicle_fuel_import_fingerprint_idx` (`import_fingerprint`),
  KEY `vehicle_fuel_date_idx` (`payment_date` DESC)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `vehicle_inspection_notification_logs` (
  `id` VARCHAR(36) NOT NULL DEFAULT (UUID()),
  `inspection_id` VARCHAR(36) NOT NULL,
  `vehicle_id` VARCHAR(36) NOT NULL,
  `recipient_email` VARCHAR(255) NOT NULL,
  `notification_type` VARCHAR(255) NOT NULL,
  `due_date` DATE NOT NULL,
  `sent_at` DATETIME(6) NULL,
  `status` TEXT NOT NULL,
  `error` TEXT NOT NULL DEFAULT (''),
  `created_at` DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  `updated_at` DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  UNIQUE KEY `vehicle_inspection_notificati_inspection_id_recipient_email_key` (`inspection_id`, `recipient_email`, `notification_type`, `due_date`),
  PRIMARY KEY (`id`),
  CONSTRAINT `vehicle_inspection_notification_logs_status_check` CHECK ((status IN ('PROCESSING', 'SENT', 'FAILED', 'UNKNOWN')))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `vehicle_inspections` (
  `id` VARCHAR(36) NOT NULL DEFAULT (UUID()),
  `vehicle_id` VARCHAR(36) NOT NULL,
  `inspection_date` DATE NOT NULL,
  `expires_on` DATE NOT NULL,
  `cost` DECIMAL(18,2) NOT NULL DEFAULT 0,
  `reminder_days` INT NOT NULL DEFAULT 30,
  `certificate_number` TEXT NOT NULL DEFAULT (''),
  `inspection_center` TEXT NOT NULL DEFAULT (''),
  `odometer_km` INT NULL,
  `note` TEXT NOT NULL DEFAULT (''),
  `created_by` VARCHAR(36) NULL,
  `updated_by` VARCHAR(36) NULL,
  `created_at` DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  `updated_at` DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  `seat_count` SMALLINT NULL,
  `archived_at` DATETIME(6) NULL,
  `archived_by` VARCHAR(36) NULL,
  `archived_by_name` TEXT NOT NULL DEFAULT (''),
  `renewed_from_id` VARCHAR(36) NULL,
  `renewed_at` DATETIME(6) NULL,
  `renewed_by` VARCHAR(36) NULL,
  `renewed_by_name` TEXT NOT NULL DEFAULT (''),
  CONSTRAINT `vehicle_inspections_check` CHECK ((expires_on >= inspection_date)),
  CONSTRAINT `vehicle_inspections_cost_check` CHECK ((cost >= 0)),
  CONSTRAINT `vehicle_inspections_odometer_km_check` CHECK (((odometer_km IS NULL) OR (odometer_km >= 0))),
  PRIMARY KEY (`id`),
  CONSTRAINT `vehicle_inspections_reminder_days_check` CHECK (((reminder_days >= 1) AND (reminder_days <= 180))),
  CONSTRAINT `vehicle_inspections_seat_count_check` CHECK (((seat_count IS NULL) OR ((seat_count >= 1) AND (seat_count <= 100)))),
  KEY `vehicle_inspections_due_idx` (`expires_on`, `vehicle_id`),
  KEY `vehicle_inspections_active_due_idx` (`expires_on`, `vehicle_id`),
  KEY `vehicle_inspections_date_idx` (`inspection_date` DESC),
  `_u_vehicle_inspections_one_active_per_vehicle_1` VARCHAR(255) AS (IF(archived_at IS NULL, `vehicle_id`, NULL)) VIRTUAL,
  UNIQUE KEY `vehicle_inspections_one_active_per_vehicle` (`_u_vehicle_inspections_one_active_per_vehicle_1`),
  KEY `vehicle_inspections_history_idx` (`vehicle_id`, `archived_at` DESC),
  UNIQUE KEY `vehicle_inspections_renewed_from_unique` (`renewed_from_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `vehicle_insurances` (
  `id` VARCHAR(36) NOT NULL DEFAULT (UUID()),
  `vehicle_id` VARCHAR(36) NOT NULL,
  `insurance_name` TEXT NOT NULL,
  `insurance_type` TEXT NOT NULL,
  `insurance_company` TEXT NOT NULL,
  `certificate_number` TEXT NOT NULL DEFAULT (''),
  `starts_on` DATE NOT NULL,
  `expires_on` DATE NOT NULL,
  `cost` DECIMAL(18,2) NOT NULL DEFAULT 0,
  `reminder_days` INT NOT NULL DEFAULT 30,
  `note` TEXT NOT NULL DEFAULT (''),
  `created_by` VARCHAR(36) NULL,
  `updated_by` VARCHAR(36) NULL,
  `created_at` DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  `updated_at` DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  `archived_at` DATETIME(6) NULL,
  `archived_by` VARCHAR(36) NULL,
  `renewed_from_id` VARCHAR(36) NULL,
  `renewed_at` DATETIME(6) NULL,
  `renewed_by` VARCHAR(36) NULL,
  `renewed_by_name` TEXT NOT NULL DEFAULT (''),
  CONSTRAINT `vehicle_insurances_check` CHECK ((expires_on >= starts_on)),
  CONSTRAINT `vehicle_insurances_cost_check` CHECK ((cost >= 0)),
  PRIMARY KEY (`id`),
  CONSTRAINT `vehicle_insurances_reminder_days_check` CHECK (((reminder_days >= 1) AND (reminder_days <= 365))),
  UNIQUE KEY `vehicle_insurances_renewed_from_unique` (`renewed_from_id`),
  KEY `vehicle_insurances_due_idx` (`expires_on`, `vehicle_id`),
  KEY `vehicle_insurances_vehicle_idx` (`vehicle_id`, `starts_on` DESC),
  KEY `vehicle_insurances_active_starts_idx` (`starts_on` DESC),
  KEY `vehicle_insurances_archived_idx` (`vehicle_id`, `archived_at` DESC),
  KEY `vehicle_insurances_active_due_idx` (`expires_on`, `vehicle_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `vehicle_repairs` (
  `id` VARCHAR(36) NOT NULL DEFAULT (UUID()),
  `vehicle_id` VARCHAR(36) NOT NULL,
  `service_date` DATE NOT NULL,
  `service_type` TEXT NOT NULL DEFAULT ('BAO_DUONG'),
  `description` TEXT NOT NULL,
  `odometer_km` INT NULL,
  `vat_amount` DECIMAL(18,2) NOT NULL DEFAULT 0,
  `vendor` TEXT NOT NULL DEFAULT (''),
  `invoice_number` TEXT NOT NULL DEFAULT (''),
  `note` TEXT NOT NULL DEFAULT (''),
  `source_file` VARCHAR(255) NOT NULL DEFAULT '',
  `source_sheet` VARCHAR(255) NOT NULL DEFAULT '',
  `source_row` INT NULL,
  `import_fingerprint` VARCHAR(255) NULL,
  `created_by` VARCHAR(36) NULL,
  `updated_by` VARCHAR(36) NULL,
  `created_at` DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  `updated_at` DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  CONSTRAINT `vehicle_repairs_odometer_km_check` CHECK (((odometer_km IS NULL) OR (odometer_km >= 0))),
  PRIMARY KEY (`id`),
  CONSTRAINT `vehicle_repairs_vat_amount_check` CHECK ((vat_amount >= 0)),
  KEY `vehicle_repairs_vehicle_date_idx` (`vehicle_id`, `service_date` DESC),
  KEY `vehicle_repairs_date_idx` (`service_date` DESC),
  KEY `vehicle_repairs_source_position_idx` (`source_file`, `source_sheet`, `source_row`),
  UNIQUE KEY `vehicle_repairs_import_fingerprint_idx` (`import_fingerprint`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `vehicle_toll_monthly_batches` (
  `id` VARCHAR(36) NOT NULL DEFAULT (UUID()),
  `period_month` DATE NOT NULL,
  `source_file_name` TEXT NOT NULL DEFAULT (''),
  `source_checksum` TEXT NOT NULL,
  `source_page_count` INT NOT NULL,
  `transaction_count` INT NOT NULL DEFAULT 0,
  `vehicle_count` INT NOT NULL DEFAULT 0,
  `station_count` INT NOT NULL DEFAULT 0,
  `amount_before_tax` DECIMAL(18,2) NOT NULL DEFAULT 0,
  `tax_amount` DECIMAL(18,2) NOT NULL DEFAULT 0,
  `amount_after_tax` DECIMAL(18,2) NOT NULL DEFAULT 0,
  `created_by` VARCHAR(36) NULL,
  `updated_by` VARCHAR(36) NULL,
  `created_at` DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  `updated_at` DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  CONSTRAINT `vehicle_toll_monthly_batches_amount_after_tax_check` CHECK ((amount_after_tax >= 0)),
  CONSTRAINT `vehicle_toll_monthly_batches_amount_before_tax_check` CHECK ((amount_before_tax >= 0)),
  UNIQUE KEY `vehicle_toll_monthly_batches_period_month_key` (`period_month`),
  PRIMARY KEY (`id`),
  CONSTRAINT `vehicle_toll_monthly_batches_source_checksum_check` CHECK ((source_checksum REGEXP '^[0-9a-f]{64}$')),
  CONSTRAINT `vehicle_toll_monthly_batches_source_page_count_check` CHECK (((source_page_count >= 1) AND (source_page_count <= 500))),
  CONSTRAINT `vehicle_toll_monthly_batches_station_count_check` CHECK ((station_count >= 0)),
  CONSTRAINT `vehicle_toll_monthly_batches_tax_amount_check` CHECK ((tax_amount >= 0)),
  CONSTRAINT `vehicle_toll_monthly_batches_transaction_count_check` CHECK ((transaction_count >= 0)),
  CONSTRAINT `vehicle_toll_monthly_batches_vehicle_count_check` CHECK ((vehicle_count >= 0)),
  KEY `vehicle_toll_batches_period_idx` (`period_month` DESC)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `vehicle_toll_quarterly_passes` (
  `id` VARCHAR(36) NOT NULL DEFAULT (UUID()),
  `vehicle_id` VARCHAR(36) NULL,
  `vehicle_type` TEXT NOT NULL DEFAULT (''),
  `vehicle_color` TEXT NOT NULL DEFAULT (''),
  `license_plate` TEXT NOT NULL,
  `starts_on` DATE NOT NULL,
  `expires_on` DATE NOT NULL,
  `toll_station` VARCHAR(255) NOT NULL,
  `amount` DECIMAL(18,2) NOT NULL DEFAULT 0,
  `source_file` VARCHAR(255) NOT NULL,
  `source_sheet` VARCHAR(255) NOT NULL,
  `source_row` INT NOT NULL,
  `fingerprint` VARCHAR(255) NOT NULL,
  `created_by` VARCHAR(36) NULL,
  `updated_by` VARCHAR(36) NULL,
  `created_at` DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  `updated_at` DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  CONSTRAINT `vehicle_toll_quarterly_passes_amount_check` CHECK ((amount >= 0)),
  CONSTRAINT `vehicle_toll_quarterly_passes_check` CHECK ((expires_on >= starts_on)),
  CONSTRAINT `vehicle_toll_quarterly_passes_fingerprint_check` CHECK ((fingerprint REGEXP '^[0-9a-f]{64}$')),
  UNIQUE KEY `vehicle_toll_quarterly_passes_fingerprint_key` (`fingerprint`),
  PRIMARY KEY (`id`),
  CONSTRAINT `vehicle_toll_quarterly_passes_source_row_check` CHECK ((source_row > 0)),
  KEY `vehicle_toll_quarterly_vehicle_idx` (`vehicle_id`, `expires_on` DESC),
  KEY `vehicle_toll_quarterly_period_idx` (`starts_on` DESC, `expires_on` DESC),
  KEY `vehicle_toll_quarterly_source_position_idx` (`source_file`, `source_sheet`, `source_row`),
  KEY `vehicle_toll_quarterly_history_lookup_idx` (`vehicle_id`, `starts_on` DESC, `expires_on` DESC, `created_at` DESC)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `vehicle_toll_transactions` (
  `id` VARCHAR(36) NOT NULL DEFAULT (UUID()),
  `batch_id` VARCHAR(36) NOT NULL,
  `vehicle_id` VARCHAR(36) NULL,
  `license_plate` TEXT NOT NULL,
  `toll_station` TEXT NOT NULL,
  `transaction_at` DATETIME(6) NOT NULL,
  `invoice_number` TEXT NOT NULL DEFAULT (''),
  `transaction_code` TEXT NOT NULL DEFAULT (''),
  `amount_before_tax` DECIMAL(18,2) NOT NULL DEFAULT 0,
  `tax_amount` DECIMAL(18,2) NOT NULL DEFAULT 0,
  `amount_after_tax` DECIMAL(18,2) NOT NULL DEFAULT 0,
  `source_page` INT NOT NULL,
  `fingerprint` VARCHAR(255) NOT NULL,
  `created_at` DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  CONSTRAINT `vehicle_toll_transactions_amount_after_tax_check` CHECK ((amount_after_tax >= 0)),
  CONSTRAINT `vehicle_toll_transactions_amount_before_tax_check` CHECK ((amount_before_tax >= 0)),
  CONSTRAINT `vehicle_toll_transactions_fingerprint_check` CHECK ((fingerprint REGEXP '^[0-9a-f]{64}$')),
  UNIQUE KEY `vehicle_toll_transactions_fingerprint_key` (`fingerprint`),
  PRIMARY KEY (`id`),
  CONSTRAINT `vehicle_toll_transactions_source_page_check` CHECK ((source_page > 0)),
  CONSTRAINT `vehicle_toll_transactions_tax_amount_check` CHECK ((tax_amount >= 0)),
  KEY `vehicle_toll_transactions_vehicle_time_idx` (`vehicle_id`, `transaction_at` DESC),
  KEY `vehicle_toll_transactions_batch_time_idx` (`batch_id`, `transaction_at` DESC)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `vehicles` (
  `id` VARCHAR(36) NOT NULL DEFAULT (UUID()),
  `vehicle_code` VARCHAR(255) NOT NULL,
  `vehicle_name` TEXT NOT NULL,
  `license_plate` VARCHAR(255) NOT NULL,
  `brand` TEXT NOT NULL DEFAULT (''),
  `model` TEXT NOT NULL DEFAULT (''),
  `production_year` SMALLINT NULL,
  `chassis_number` TEXT NOT NULL DEFAULT (''),
  `engine_number` TEXT NOT NULL DEFAULT (''),
  `fuel_norm_l_per_100km` DECIMAL(8,2) NULL,
  `assigned_driver` TEXT NOT NULL DEFAULT (''),
  `responsible_user_id` VARCHAR(36) NULL,
  `department_id` VARCHAR(36) NULL,
  `status` TEXT NOT NULL DEFAULT ('ACTIVE'),
  `note` TEXT NOT NULL DEFAULT (''),
  `created_by` VARCHAR(36) NULL,
  `updated_by` VARCHAR(36) NULL,
  `created_at` DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  `updated_at` DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  `deleted_at` DATETIME(6) NULL,
  `seat_count` SMALLINT NULL,
  PRIMARY KEY (`id`),
  CONSTRAINT `vehicles_seat_count_check` CHECK (((seat_count IS NULL) OR ((seat_count >= 1) AND (seat_count <= 100)))),
  CONSTRAINT `vehicles_status_check` CHECK ((status IN ('ACTIVE', 'MAINTENANCE', 'INACTIVE', 'LIQUIDATED'))),
  `_u_vehicles_code_active_idx_1` VARCHAR(255) AS (IF(deleted_at IS NULL, LOWER(`vehicle_code`), NULL)) VIRTUAL,
  UNIQUE KEY `vehicles_code_active_idx` (`_u_vehicles_code_active_idx_1`),
  KEY `vehicles_department_idx` (`department_id`),
  KEY `vehicles_updated_idx` (`updated_at` DESC),
  `_u_vehicles_plate_active_idx_2` VARCHAR(255) AS (IF(deleted_at IS NULL, REGEXP_REPLACE(UPPER(`license_plate`), '[^A-Z0-9]', ''), NULL)) VIRTUAL,
  UNIQUE KEY `vehicles_plate_active_idx` (`_u_vehicles_plate_active_idx_2`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Khoá ngoại
ALTER TABLE `asset_component_installations` ADD CONSTRAINT `asset_component_installations_component_asset_id_fkey` FOREIGN KEY (`component_asset_id`) REFERENCES `assets` (`id`) ON DELETE RESTRICT;
ALTER TABLE `asset_component_installations` ADD CONSTRAINT `asset_component_installations_host_asset_id_fkey` FOREIGN KEY (`host_asset_id`) REFERENCES `assets` (`id`) ON DELETE RESTRICT;
ALTER TABLE `asset_component_installations` ADD CONSTRAINT `asset_component_installations_installed_by_fkey` FOREIGN KEY (`installed_by`) REFERENCES `profiles` (`id`) ON DELETE SET NULL;
ALTER TABLE `asset_component_installations` ADD CONSTRAINT `asset_component_installations_removed_by_fkey` FOREIGN KEY (`removed_by`) REFERENCES `profiles` (`id`) ON DELETE SET NULL;
ALTER TABLE `asset_documents` ADD CONSTRAINT `asset_documents_asset_id_fkey` FOREIGN KEY (`asset_id`) REFERENCES `assets` (`id`) ON DELETE CASCADE;
ALTER TABLE `asset_documents` ADD CONSTRAINT `asset_documents_created_by_fkey` FOREIGN KEY (`created_by`) REFERENCES `profiles` (`id`) ON DELETE SET NULL;
ALTER TABLE `asset_liquidations` ADD CONSTRAINT `asset_liquidations_asset_id_fkey` FOREIGN KEY (`asset_id`) REFERENCES `assets` (`id`) ON DELETE RESTRICT;
ALTER TABLE `asset_liquidations` ADD CONSTRAINT `asset_liquidations_recorded_by_fkey` FOREIGN KEY (`recorded_by`) REFERENCES `profiles` (`id`) ON DELETE SET NULL;
ALTER TABLE `asset_liquidations` ADD CONSTRAINT `asset_liquidations_voided_by_fkey` FOREIGN KEY (`voided_by`) REFERENCES `profiles` (`id`) ON DELETE SET NULL;
ALTER TABLE `asset_responsibles` ADD CONSTRAINT `asset_responsibles_asset_id_fkey` FOREIGN KEY (`asset_id`) REFERENCES `assets` (`id`) ON DELETE CASCADE;
ALTER TABLE `asset_responsibles` ADD CONSTRAINT `asset_responsibles_user_id_fkey` FOREIGN KEY (`user_id`) REFERENCES `profiles` (`id`) ON DELETE RESTRICT;
ALTER TABLE `assets` ADD CONSTRAINT `assets_created_by_fkey` FOREIGN KEY (`created_by`) REFERENCES `profiles` (`id`) ON DELETE SET NULL;
ALTER TABLE `assets` ADD CONSTRAINT `assets_deleted_by_fkey` FOREIGN KEY (`deleted_by`) REFERENCES `profiles` (`id`) ON DELETE SET NULL;
ALTER TABLE `assets` ADD CONSTRAINT `assets_department_id_fkey` FOREIGN KEY (`department_id`) REFERENCES `departments` (`id`) ON DELETE SET NULL;
ALTER TABLE `assets` ADD CONSTRAINT `assets_updated_by_fkey` FOREIGN KEY (`updated_by`) REFERENCES `profiles` (`id`) ON DELETE SET NULL;
ALTER TABLE `audit_logs` ADD CONSTRAINT `audit_logs_actor_user_id_fkey` FOREIGN KEY (`actor_user_id`) REFERENCES `profiles` (`id`) ON DELETE SET NULL;
ALTER TABLE `company_surveys` ADD CONSTRAINT `company_surveys_created_by_fkey` FOREIGN KEY (`created_by`) REFERENCES `profiles` (`id`) ON DELETE SET NULL;
ALTER TABLE `data_access_scopes` ADD CONSTRAINT `data_access_scopes_created_by_fkey` FOREIGN KEY (`created_by`) REFERENCES `profiles` (`id`) ON DELETE SET NULL;
ALTER TABLE `data_access_scopes` ADD CONSTRAINT `data_access_scopes_department_id_fkey` FOREIGN KEY (`department_id`) REFERENCES `departments` (`id`) ON DELETE CASCADE;
ALTER TABLE `data_access_scopes` ADD CONSTRAINT `data_access_scopes_user_id_fkey` FOREIGN KEY (`user_id`) REFERENCES `profiles` (`id`) ON DELETE CASCADE;
ALTER TABLE `export_jobs` ADD CONSTRAINT `export_jobs_requested_by_fkey` FOREIGN KEY (`requested_by`) REFERENCES `profiles` (`id`) ON DELETE SET NULL;
ALTER TABLE `inventory_movements` ADD CONSTRAINT `inventory_movements_asset_id_fkey` FOREIGN KEY (`asset_id`) REFERENCES `assets` (`id`) ON DELETE RESTRICT;
ALTER TABLE `inventory_movements` ADD CONSTRAINT `inventory_movements_created_by_fkey` FOREIGN KEY (`created_by`) REFERENCES `profiles` (`id`) ON DELETE SET NULL;
ALTER TABLE `inventory_movements` ADD CONSTRAINT `inventory_movements_from_user_id_fkey` FOREIGN KEY (`from_user_id`) REFERENCES `profiles` (`id`) ON DELETE SET NULL;
ALTER TABLE `inventory_movements` ADD CONSTRAINT `inventory_movements_to_user_id_fkey` FOREIGN KEY (`to_user_id`) REFERENCES `profiles` (`id`) ON DELETE SET NULL;
ALTER TABLE `it_cost_entries` ADD CONSTRAINT `it_cost_entries_created_by_fkey` FOREIGN KEY (`created_by`) REFERENCES `profiles` (`id`) ;
ALTER TABLE `it_cost_entries` ADD CONSTRAINT `it_cost_entries_updated_by_fkey` FOREIGN KEY (`updated_by`) REFERENCES `profiles` (`id`) ;
ALTER TABLE `it_cost_entry_lines` ADD CONSTRAINT `it_cost_entry_lines_category_id_fkey` FOREIGN KEY (`category_id`) REFERENCES `it_cost_categories` (`id`) ;
ALTER TABLE `it_cost_entry_lines` ADD CONSTRAINT `it_cost_entry_lines_document_id_fkey` FOREIGN KEY (`document_id`) REFERENCES `it_documents` (`id`) ;
ALTER TABLE `it_cost_entry_lines` ADD CONSTRAINT `it_cost_entry_lines_entry_id_fkey` FOREIGN KEY (`entry_id`) REFERENCES `it_cost_entries` (`id`) ;
ALTER TABLE `it_cost_entry_lines` ADD CONSTRAINT `it_cost_entry_lines_period_id_fkey` FOREIGN KEY (`period_id`) REFERENCES `it_service_periods` (`id`) ;
ALTER TABLE `it_cost_entry_lines` ADD CONSTRAINT `it_cost_entry_lines_service_id_fkey` FOREIGN KEY (`service_id`) REFERENCES `it_services` (`id`) ;
ALTER TABLE `it_document_links` ADD CONSTRAINT `it_document_links_created_by_fkey` FOREIGN KEY (`created_by`) REFERENCES `profiles` (`id`) ;
ALTER TABLE `it_document_links` ADD CONSTRAINT `it_document_links_document_id_fkey` FOREIGN KEY (`document_id`) REFERENCES `it_documents` (`id`) ;
ALTER TABLE `it_document_links` ADD CONSTRAINT `it_document_links_entry_id_fkey` FOREIGN KEY (`entry_id`) REFERENCES `it_cost_entries` (`id`) ;
ALTER TABLE `it_document_links` ADD CONSTRAINT `it_document_links_period_id_fkey` FOREIGN KEY (`period_id`) REFERENCES `it_service_periods` (`id`) ;
ALTER TABLE `it_document_links` ADD CONSTRAINT `it_document_links_service_id_fkey` FOREIGN KEY (`service_id`) REFERENCES `it_services` (`id`) ;
ALTER TABLE `it_documents` ADD CONSTRAINT `it_documents_created_by_fkey` FOREIGN KEY (`created_by`) REFERENCES `profiles` (`id`) ;
ALTER TABLE `it_service_periods` ADD CONSTRAINT `it_service_periods_created_by_fkey` FOREIGN KEY (`created_by`) REFERENCES `profiles` (`id`) ;
ALTER TABLE `it_service_periods` ADD CONSTRAINT `it_service_periods_renewed_from_id_fkey` FOREIGN KEY (`renewed_from_id`) REFERENCES `it_service_periods` (`id`) ;
ALTER TABLE `it_service_periods` ADD CONSTRAINT `it_service_periods_service_id_fkey` FOREIGN KEY (`service_id`) REFERENCES `it_services` (`id`) ;
ALTER TABLE `it_service_periods` ADD CONSTRAINT `it_service_periods_updated_by_fkey` FOREIGN KEY (`updated_by`) REFERENCES `profiles` (`id`) ;
ALTER TABLE `it_services` ADD CONSTRAINT `it_services_category_id_fkey` FOREIGN KEY (`category_id`) REFERENCES `it_cost_categories` (`id`) ;
ALTER TABLE `it_services` ADD CONSTRAINT `it_services_created_by_fkey` FOREIGN KEY (`created_by`) REFERENCES `profiles` (`id`) ;
ALTER TABLE `it_services` ADD CONSTRAINT `it_services_updated_by_fkey` FOREIGN KEY (`updated_by`) REFERENCES `profiles` (`id`) ;
ALTER TABLE `maintenance_logs` ADD CONSTRAINT `maintenance_logs_asset_id_fkey` FOREIGN KEY (`asset_id`) REFERENCES `assets` (`id`) ON DELETE RESTRICT;
ALTER TABLE `maintenance_logs` ADD CONSTRAINT `maintenance_logs_created_by_fkey` FOREIGN KEY (`created_by`) REFERENCES `profiles` (`id`) ON DELETE SET NULL;
ALTER TABLE `maintenance_logs` ADD CONSTRAINT `maintenance_logs_plan_id_fkey` FOREIGN KEY (`plan_id`) REFERENCES `maintenance_plans` (`id`) ON DELETE SET NULL;
ALTER TABLE `maintenance_notification_logs` ADD CONSTRAINT `maintenance_notification_logs_asset_id_fkey` FOREIGN KEY (`asset_id`) REFERENCES `assets` (`id`) ON DELETE CASCADE;
ALTER TABLE `maintenance_notification_logs` ADD CONSTRAINT `maintenance_notification_logs_plan_id_fkey` FOREIGN KEY (`plan_id`) REFERENCES `maintenance_plans` (`id`) ON DELETE CASCADE;
ALTER TABLE `maintenance_plans` ADD CONSTRAINT `maintenance_plans_asset_id_fkey` FOREIGN KEY (`asset_id`) REFERENCES `assets` (`id`) ON DELETE RESTRICT;
ALTER TABLE `maintenance_plans` ADD CONSTRAINT `maintenance_plans_created_by_fkey` FOREIGN KEY (`created_by`) REFERENCES `profiles` (`id`) ON DELETE SET NULL;
ALTER TABLE `media_files` ADD CONSTRAINT `media_files_asset_id_fkey` FOREIGN KEY (`asset_id`) REFERENCES `assets` (`id`) ON DELETE CASCADE;
ALTER TABLE `media_files` ADD CONSTRAINT `media_files_created_by_fkey` FOREIGN KEY (`created_by`) REFERENCES `profiles` (`id`) ON DELETE SET NULL;
ALTER TABLE `profiles` ADD CONSTRAINT `profiles_id_fkey` FOREIGN KEY (`id`) REFERENCES `auth_users` (`id`) ON DELETE CASCADE;
ALTER TABLE `role_permissions` ADD CONSTRAINT `role_permissions_permission_code_fkey` FOREIGN KEY (`permission_code`) REFERENCES `permissions` (`code`) ON DELETE CASCADE;
ALTER TABLE `role_permissions` ADD CONSTRAINT `role_permissions_role_id_fkey` FOREIGN KEY (`role_id`) REFERENCES `roles` (`id`) ON DELETE CASCADE;
ALTER TABLE `software_license_assets` ADD CONSTRAINT `software_license_assets_asset_id_fkey` FOREIGN KEY (`asset_id`) REFERENCES `assets` (`id`) ON DELETE RESTRICT;
ALTER TABLE `software_license_assets` ADD CONSTRAINT `software_license_assets_assigned_by_fkey` FOREIGN KEY (`assigned_by`) REFERENCES `profiles` (`id`) ON DELETE SET NULL;
ALTER TABLE `software_license_assets` ADD CONSTRAINT `software_license_assets_license_id_fkey` FOREIGN KEY (`license_id`) REFERENCES `software_licenses` (`id`) ON DELETE CASCADE;
ALTER TABLE `software_license_secrets` ADD CONSTRAINT `software_license_secrets_license_id_fkey` FOREIGN KEY (`license_id`) REFERENCES `software_licenses` (`id`) ON DELETE CASCADE;
ALTER TABLE `software_license_secrets` ADD CONSTRAINT `software_license_secrets_updated_by_fkey` FOREIGN KEY (`updated_by`) REFERENCES `profiles` (`id`) ON DELETE SET NULL;
ALTER TABLE `software_licenses` ADD CONSTRAINT `software_licenses_assigned_asset_id_fkey` FOREIGN KEY (`assigned_asset_id`) REFERENCES `assets` (`id`) ON DELETE SET NULL;
ALTER TABLE `software_licenses` ADD CONSTRAINT `software_licenses_assigned_user_id_fkey` FOREIGN KEY (`assigned_user_id`) REFERENCES `profiles` (`id`) ON DELETE SET NULL;
ALTER TABLE `software_licenses` ADD CONSTRAINT `software_licenses_created_by_fkey` FOREIGN KEY (`created_by`) REFERENCES `profiles` (`id`) ON DELETE SET NULL;
ALTER TABLE `supply_inventory_movements` ADD CONSTRAINT `supply_inventory_movements_created_by_fkey` FOREIGN KEY (`created_by`) REFERENCES `profiles` (`id`) ON DELETE SET NULL;
ALTER TABLE `supply_inventory_movements` ADD CONSTRAINT `supply_inventory_movements_item_id_fkey` FOREIGN KEY (`item_id`) REFERENCES `supply_items` (`id`) ON DELETE RESTRICT;
ALTER TABLE `supply_items` ADD CONSTRAINT `supply_items_created_by_fkey` FOREIGN KEY (`created_by`) REFERENCES `profiles` (`id`) ON DELETE SET NULL;
ALTER TABLE `supply_items` ADD CONSTRAINT `supply_items_updated_by_fkey` FOREIGN KEY (`updated_by`) REFERENCES `profiles` (`id`) ON DELETE SET NULL;
ALTER TABLE `supply_quote_lines` ADD CONSTRAINT `supply_quote_lines_created_by_fkey` FOREIGN KEY (`created_by`) REFERENCES `profiles` (`id`) ON DELETE SET NULL;
ALTER TABLE `supply_quote_lines` ADD CONSTRAINT `supply_quote_lines_item_id_fkey` FOREIGN KEY (`item_id`) REFERENCES `supply_items` (`id`) ON DELETE SET NULL;
ALTER TABLE `supply_quote_lines` ADD CONSTRAINT `supply_quote_lines_quote_id_fkey` FOREIGN KEY (`quote_id`) REFERENCES `supply_quotes` (`id`) ON DELETE CASCADE;
ALTER TABLE `supply_quote_lines` ADD CONSTRAINT `supply_quote_lines_updated_by_fkey` FOREIGN KEY (`updated_by`) REFERENCES `profiles` (`id`) ON DELETE SET NULL;
ALTER TABLE `supply_quotes` ADD CONSTRAINT `supply_quotes_created_by_fkey` FOREIGN KEY (`created_by`) REFERENCES `profiles` (`id`) ON DELETE SET NULL;
ALTER TABLE `supply_quotes` ADD CONSTRAINT `supply_quotes_updated_by_fkey` FOREIGN KEY (`updated_by`) REFERENCES `profiles` (`id`) ON DELETE SET NULL;
ALTER TABLE `supply_request_lines` ADD CONSTRAINT `supply_request_lines_created_by_fkey` FOREIGN KEY (`created_by`) REFERENCES `profiles` (`id`) ON DELETE SET NULL;
ALTER TABLE `supply_request_lines` ADD CONSTRAINT `supply_request_lines_item_id_fkey` FOREIGN KEY (`item_id`) REFERENCES `supply_items` (`id`) ON DELETE SET NULL;
ALTER TABLE `supply_request_lines` ADD CONSTRAINT `supply_request_lines_request_id_fkey` FOREIGN KEY (`request_id`) REFERENCES `supply_requests` (`id`) ON DELETE CASCADE;
ALTER TABLE `supply_request_lines` ADD CONSTRAINT `supply_request_lines_updated_by_fkey` FOREIGN KEY (`updated_by`) REFERENCES `profiles` (`id`) ON DELETE SET NULL;
ALTER TABLE `supply_requests` ADD CONSTRAINT `supply_requests_created_by_fkey` FOREIGN KEY (`created_by`) REFERENCES `profiles` (`id`) ON DELETE SET NULL;
ALTER TABLE `supply_requests` ADD CONSTRAINT `supply_requests_department_id_fkey` FOREIGN KEY (`department_id`) REFERENCES `departments` (`id`) ON DELETE SET NULL;
ALTER TABLE `supply_requests` ADD CONSTRAINT `supply_requests_updated_by_fkey` FOREIGN KEY (`updated_by`) REFERENCES `profiles` (`id`) ON DELETE SET NULL;
ALTER TABLE `survey_responses` ADD CONSTRAINT `survey_responses_survey_id_fkey` FOREIGN KEY (`survey_id`) REFERENCES `company_surveys` (`id`) ;
ALTER TABLE `telecom_invoices` ADD CONSTRAINT `telecom_invoices_created_by_fkey` FOREIGN KEY (`created_by`) REFERENCES `profiles` (`id`) ON DELETE SET NULL;
ALTER TABLE `telecom_invoices` ADD CONSTRAINT `telecom_invoices_updated_by_fkey` FOREIGN KEY (`updated_by`) REFERENCES `profiles` (`id`) ON DELETE SET NULL;
ALTER TABLE `telecom_phones` ADD CONSTRAINT `telecom_phones_created_by_fkey` FOREIGN KEY (`created_by`) REFERENCES `profiles` (`id`) ;
ALTER TABLE `telecom_phones` ADD CONSTRAINT `telecom_phones_updated_by_fkey` FOREIGN KEY (`updated_by`) REFERENCES `profiles` (`id`) ;
ALTER TABLE `user_module_access` ADD CONSTRAINT `user_module_access_created_by_fkey` FOREIGN KEY (`created_by`) REFERENCES `profiles` (`id`) ON DELETE SET NULL;
ALTER TABLE `user_module_access` ADD CONSTRAINT `user_module_access_user_id_fkey` FOREIGN KEY (`user_id`) REFERENCES `profiles` (`id`) ON DELETE CASCADE;
ALTER TABLE `user_roles` ADD CONSTRAINT `user_roles_role_id_fkey` FOREIGN KEY (`role_id`) REFERENCES `roles` (`id`) ON DELETE CASCADE;
ALTER TABLE `user_roles` ADD CONSTRAINT `user_roles_user_id_fkey` FOREIGN KEY (`user_id`) REFERENCES `profiles` (`id`) ON DELETE CASCADE;
ALTER TABLE `vehicle_documents` ADD CONSTRAINT `vehicle_documents_created_by_fkey` FOREIGN KEY (`created_by`) REFERENCES `profiles` (`id`) ON DELETE SET NULL;
ALTER TABLE `vehicle_documents` ADD CONSTRAINT `vehicle_documents_vehicle_id_fkey` FOREIGN KEY (`vehicle_id`) REFERENCES `vehicles` (`id`) ON DELETE CASCADE;
ALTER TABLE `vehicle_fuel_logs` ADD CONSTRAINT `vehicle_fuel_logs_created_by_fkey` FOREIGN KEY (`created_by`) REFERENCES `profiles` (`id`) ON DELETE SET NULL;
ALTER TABLE `vehicle_fuel_logs` ADD CONSTRAINT `vehicle_fuel_logs_updated_by_fkey` FOREIGN KEY (`updated_by`) REFERENCES `profiles` (`id`) ON DELETE SET NULL;
ALTER TABLE `vehicle_fuel_logs` ADD CONSTRAINT `vehicle_fuel_logs_vehicle_id_fkey` FOREIGN KEY (`vehicle_id`) REFERENCES `vehicles` (`id`) ON DELETE CASCADE;
ALTER TABLE `vehicle_inspection_notification_logs` ADD CONSTRAINT `vehicle_inspection_notification_logs_inspection_id_fkey` FOREIGN KEY (`inspection_id`) REFERENCES `vehicle_inspections` (`id`) ON DELETE CASCADE;
ALTER TABLE `vehicle_inspection_notification_logs` ADD CONSTRAINT `vehicle_inspection_notification_logs_vehicle_id_fkey` FOREIGN KEY (`vehicle_id`) REFERENCES `vehicles` (`id`) ON DELETE CASCADE;
ALTER TABLE `vehicle_inspections` ADD CONSTRAINT `vehicle_inspections_archived_by_fkey` FOREIGN KEY (`archived_by`) REFERENCES `profiles` (`id`) ON DELETE SET NULL;
ALTER TABLE `vehicle_inspections` ADD CONSTRAINT `vehicle_inspections_created_by_fkey` FOREIGN KEY (`created_by`) REFERENCES `profiles` (`id`) ON DELETE SET NULL;
ALTER TABLE `vehicle_inspections` ADD CONSTRAINT `vehicle_inspections_renewed_by_fkey` FOREIGN KEY (`renewed_by`) REFERENCES `profiles` (`id`) ON DELETE SET NULL;
ALTER TABLE `vehicle_inspections` ADD CONSTRAINT `vehicle_inspections_renewed_from_id_fkey` FOREIGN KEY (`renewed_from_id`) REFERENCES `vehicle_inspections` (`id`) ON DELETE SET NULL;
ALTER TABLE `vehicle_inspections` ADD CONSTRAINT `vehicle_inspections_updated_by_fkey` FOREIGN KEY (`updated_by`) REFERENCES `profiles` (`id`) ON DELETE SET NULL;
ALTER TABLE `vehicle_inspections` ADD CONSTRAINT `vehicle_inspections_vehicle_id_fkey` FOREIGN KEY (`vehicle_id`) REFERENCES `vehicles` (`id`) ON DELETE CASCADE;
ALTER TABLE `vehicle_insurances` ADD CONSTRAINT `vehicle_insurances_archived_by_fkey` FOREIGN KEY (`archived_by`) REFERENCES `profiles` (`id`) ON DELETE SET NULL;
ALTER TABLE `vehicle_insurances` ADD CONSTRAINT `vehicle_insurances_created_by_fkey` FOREIGN KEY (`created_by`) REFERENCES `profiles` (`id`) ON DELETE SET NULL;
ALTER TABLE `vehicle_insurances` ADD CONSTRAINT `vehicle_insurances_renewed_by_fkey` FOREIGN KEY (`renewed_by`) REFERENCES `profiles` (`id`) ON DELETE SET NULL;
ALTER TABLE `vehicle_insurances` ADD CONSTRAINT `vehicle_insurances_renewed_from_id_fkey` FOREIGN KEY (`renewed_from_id`) REFERENCES `vehicle_insurances` (`id`) ON DELETE SET NULL;
ALTER TABLE `vehicle_insurances` ADD CONSTRAINT `vehicle_insurances_updated_by_fkey` FOREIGN KEY (`updated_by`) REFERENCES `profiles` (`id`) ON DELETE SET NULL;
ALTER TABLE `vehicle_insurances` ADD CONSTRAINT `vehicle_insurances_vehicle_id_fkey` FOREIGN KEY (`vehicle_id`) REFERENCES `vehicles` (`id`) ON DELETE CASCADE;
ALTER TABLE `vehicle_repairs` ADD CONSTRAINT `vehicle_repairs_created_by_fkey` FOREIGN KEY (`created_by`) REFERENCES `profiles` (`id`) ON DELETE SET NULL;
ALTER TABLE `vehicle_repairs` ADD CONSTRAINT `vehicle_repairs_updated_by_fkey` FOREIGN KEY (`updated_by`) REFERENCES `profiles` (`id`) ON DELETE SET NULL;
ALTER TABLE `vehicle_repairs` ADD CONSTRAINT `vehicle_repairs_vehicle_id_fkey` FOREIGN KEY (`vehicle_id`) REFERENCES `vehicles` (`id`) ON DELETE CASCADE;
ALTER TABLE `vehicle_toll_monthly_batches` ADD CONSTRAINT `vehicle_toll_monthly_batches_created_by_fkey` FOREIGN KEY (`created_by`) REFERENCES `profiles` (`id`) ON DELETE SET NULL;
ALTER TABLE `vehicle_toll_monthly_batches` ADD CONSTRAINT `vehicle_toll_monthly_batches_updated_by_fkey` FOREIGN KEY (`updated_by`) REFERENCES `profiles` (`id`) ON DELETE SET NULL;
ALTER TABLE `vehicle_toll_quarterly_passes` ADD CONSTRAINT `vehicle_toll_quarterly_passes_created_by_fkey` FOREIGN KEY (`created_by`) REFERENCES `profiles` (`id`) ON DELETE SET NULL;
ALTER TABLE `vehicle_toll_quarterly_passes` ADD CONSTRAINT `vehicle_toll_quarterly_passes_updated_by_fkey` FOREIGN KEY (`updated_by`) REFERENCES `profiles` (`id`) ON DELETE SET NULL;
ALTER TABLE `vehicle_toll_quarterly_passes` ADD CONSTRAINT `vehicle_toll_quarterly_passes_vehicle_id_fkey` FOREIGN KEY (`vehicle_id`) REFERENCES `vehicles` (`id`) ON DELETE SET NULL;
ALTER TABLE `vehicle_toll_transactions` ADD CONSTRAINT `vehicle_toll_transactions_batch_id_fkey` FOREIGN KEY (`batch_id`) REFERENCES `vehicle_toll_monthly_batches` (`id`) ON DELETE CASCADE;
ALTER TABLE `vehicle_toll_transactions` ADD CONSTRAINT `vehicle_toll_transactions_vehicle_id_fkey` FOREIGN KEY (`vehicle_id`) REFERENCES `vehicles` (`id`) ON DELETE SET NULL;
ALTER TABLE `vehicles` ADD CONSTRAINT `vehicles_created_by_fkey` FOREIGN KEY (`created_by`) REFERENCES `profiles` (`id`) ON DELETE SET NULL;
ALTER TABLE `vehicles` ADD CONSTRAINT `vehicles_department_id_fkey` FOREIGN KEY (`department_id`) REFERENCES `departments` (`id`) ON DELETE SET NULL;
ALTER TABLE `vehicles` ADD CONSTRAINT `vehicles_responsible_user_id_fkey` FOREIGN KEY (`responsible_user_id`) REFERENCES `profiles` (`id`) ON DELETE SET NULL;
ALTER TABLE `vehicles` ADD CONSTRAINT `vehicles_updated_by_fkey` FOREIGN KEY (`updated_by`) REFERENCES `profiles` (`id`) ON DELETE SET NULL;

SET FOREIGN_KEY_CHECKS = 1;

-- Ghi chú chuyển đổi (cần xử lý ở tầng ứng dụng):
-- [GIN bỏ qua] assets.assets_name_search_active_idx: dùng LIKE/collation không dấu
-- [GIN bỏ qua] assets.assets_search_text_active_idx: dùng LIKE/collation không dấu
-- [GIN bỏ qua] assets.assets_serial_search_active_idx: dùng LIKE/collation không dấu
-- [GIN bỏ qua] assets.assets_code_search_active_idx: dùng LIKE/collation không dấu
-- [CHECK chưa chuyển] company_surveys.company_surveys_questions_check: CHECK ((jsonb_typeof(questions) = 'array'::text))
-- [UNIQUE cần kiểm tra trong code] CREATE UNIQUE INDEX supply_items_name_category_active_idx ON public.supply_items USING btree (category, lower(regexp_replace(TRIM(BOTH FROM item_name), '\s+'::text, ' '::text, 'g'::text))) WHERE (deleted_at IS NULL)
-- [CHECK chưa chuyển] survey_responses.survey_responses_answers_check: CHECK ((jsonb_typeof(answers) = 'object'::text))
-- [CHECK chưa chuyển] vehicle_toll_monthly_batches.vehicle_toll_monthly_batches_period_month_check: CHECK ((period_month = (date_trunc('month'::text, (period_month)::timestamp with time zone))::date))
