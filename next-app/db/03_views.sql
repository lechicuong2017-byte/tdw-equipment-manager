-- View MariaDB (chạy SAU schema.sql). Tương đương view PostgreSQL cùng tên.
SET NAMES utf8mb4;

CREATE OR REPLACE VIEW `supply_inventory_balances` AS
SELECT
  si.id AS item_id,
  si.category,
  si.item_code,
  si.item_name,
  si.unit,
  si.active,
  CAST(COALESCE(SUM(CASE WHEN sim.movement_type IN ('RECEIPT', 'ADJUSTMENT_IN', 'RETURN_IN')
                         THEN sim.quantity ELSE -sim.quantity END), 0) AS DECIMAL(14,3)) AS on_hand_quantity,
  CAST(COALESCE(SUM(CASE WHEN sim.movement_type IN ('RECEIPT', 'ADJUSTMENT_IN', 'RETURN_IN') AND sim.quantity > 0
                         THEN sim.quantity * sim.unit_price ELSE 0 END), 0) AS DECIMAL(18,2)) AS total_receipt_value,
  MAX(sim.created_at) AS last_movement_at
FROM supply_items si
LEFT JOIN supply_inventory_movements sim ON sim.item_id = si.id
WHERE si.deleted_at IS NULL
GROUP BY si.id, si.category, si.item_code, si.item_name, si.unit, si.active;

CREATE OR REPLACE VIEW `vehicle_toll_quarterly_records` AS
SELECT
  pass.id, pass.vehicle_id, pass.vehicle_type, pass.vehicle_color, pass.license_plate,
  pass.starts_on, pass.expires_on, pass.toll_station, pass.amount,
  pass.source_file, pass.source_sheet, pass.source_row, pass.fingerprint,
  pass.created_by, pass.updated_by, pass.created_at, pass.updated_at,
  (ROW_NUMBER() OVER (
     PARTITION BY COALESCE(pass.vehicle_id, REGEXP_REPLACE(UPPER(pass.license_plate), '[^A-Z0-9]', '')),
                  LOWER(REGEXP_REPLACE(TRIM(pass.toll_station), '\\s+', ' '))
     ORDER BY pass.starts_on DESC, pass.expires_on DESC, pass.created_at DESC, pass.id DESC) = 1) AS is_current
FROM vehicle_toll_quarterly_passes pass;
