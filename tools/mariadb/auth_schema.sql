-- Thay thế Supabase Auth: tài khoản, phiên đăng nhập, MFA (TOTP), mã mời / đặt lại mật khẩu.
-- Chạy TRƯỚC schema.sql (các bảng nghiệp vụ tham chiếu auth_users.id).
SET NAMES utf8mb4;

CREATE TABLE IF NOT EXISTS `auth_users` (
  `id` VARCHAR(36) NOT NULL DEFAULT (UUID()),
  `email` VARCHAR(255) NOT NULL,
  `password_hash` VARCHAR(255) NULL,              -- scrypt: "scrypt$N$r$p$salt$hash"
  `email_confirmed_at` DATETIME(6) NULL,
  `last_sign_in_at` DATETIME(6) NULL,
  `banned_until` DATETIME(6) NULL,
  `raw_user_meta_data` JSON NOT NULL DEFAULT ('{}'),
  `created_at` DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  `updated_at` DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
  PRIMARY KEY (`id`),
  UNIQUE KEY `auth_users_email_idx` (`email`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `auth_sessions` (
  `id` CHAR(64) NOT NULL,  -- sha256(token) dạng hex; token gốc chỉ nằm trong cookie
  `user_id` VARCHAR(36) NOT NULL,
  `aal` VARCHAR(8) NOT NULL DEFAULT 'aal1',
  `created_at` DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  `last_seen_at` DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  `expires_at` DATETIME(6) NOT NULL,
  `user_agent` VARCHAR(500) NULL,
  `ip` VARCHAR(64) NULL,
  PRIMARY KEY (`id`),
  KEY `auth_sessions_user_idx` (`user_id`),
  KEY `auth_sessions_expires_idx` (`expires_at`),
  CONSTRAINT `auth_sessions_user_fk` FOREIGN KEY (`user_id`) REFERENCES `auth_users` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `auth_mfa_factors` (
  `id` VARCHAR(36) NOT NULL DEFAULT (UUID()),
  `user_id` VARCHAR(36) NOT NULL,
  `factor_type` VARCHAR(16) NOT NULL DEFAULT 'totp',
  `friendly_name` VARCHAR(255) NULL,
  `secret_encrypted` TEXT NOT NULL,                 -- AES-256-GCM với AUTH_ENCRYPTION_KEY
  `status` VARCHAR(16) NOT NULL DEFAULT 'unverified', -- unverified | verified
  `last_used_step` BIGINT NULL,                      -- chống dùng lại mã TOTP
  `created_at` DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  `updated_at` DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
  PRIMARY KEY (`id`),
  KEY `auth_mfa_user_idx` (`user_id`),
  CONSTRAINT `auth_mfa_user_fk` FOREIGN KEY (`user_id`) REFERENCES `auth_users` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `auth_one_time_tokens` (
  `token_hash` CHAR(64) NOT NULL,
  `user_id` VARCHAR(36) NOT NULL,
  `purpose` VARCHAR(16) NOT NULL,                    -- invite | recovery
  `expires_at` DATETIME(6) NOT NULL,
  `used_at` DATETIME(6) NULL,
  `created_at` DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  PRIMARY KEY (`token_hash`),
  KEY `auth_ott_user_idx` (`user_id`, `purpose`),
  CONSTRAINT `auth_ott_user_fk` FOREIGN KEY (`user_id`) REFERENCES `auth_users` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Giới hạn đăng nhập sai (thay rate limit của Supabase Auth)
CREATE TABLE IF NOT EXISTS `auth_rate_limits` (
  `bucket` VARCHAR(255) NOT NULL,
  `window_start` DATETIME(6) NOT NULL,
  `hits` INT NOT NULL DEFAULT 0,
  PRIMARY KEY (`bucket`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- File lưu trữ (thay storage.objects): file thật nằm trên ổ đĩa ngoài public_html.
CREATE TABLE IF NOT EXISTS `storage_objects` (
  `bucket_id` VARCHAR(64) NOT NULL,
  `name` VARCHAR(700) NOT NULL,
  `owner` VARCHAR(36) NULL,
  `mime_type` VARCHAR(255) NULL,
  `size` BIGINT NULL,
  `created_at` DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  `updated_at` DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
  PRIMARY KEY (`bucket_id`, `name`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_bin;
