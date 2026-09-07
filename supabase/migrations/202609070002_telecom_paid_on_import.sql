begin;

-- Newly imported invoices have already been paid in this business workflow.
-- Preserve existing payment dates/statuses; only new inserts receive this default.
alter table public.telecom_invoices alter column paid_on
  set default (now() at time zone 'Asia/Ho_Chi_Minh')::date;

commit;
