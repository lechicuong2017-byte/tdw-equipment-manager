begin;

-- Backfill records imported before the paid-on-import default was introduced.
-- Keep any explicitly recorded payment date; otherwise use the record creation
-- date in Vietnam time so the audit history remains deterministic.
update public.telecom_invoices
set paid_on = (created_at at time zone 'Asia/Ho_Chi_Minh')::date,
    updated_at = now()
where deleted_at is null and paid_on is null;

commit;
