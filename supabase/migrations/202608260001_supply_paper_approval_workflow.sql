begin;

-- Báo giá và kế hoạch mua chỉ là chứng từ nghiệp vụ. Tồn kho chỉ được thay đổi
-- khi người dùng ghi nhận một giao dịch nhập/xuất thực tế.
drop trigger if exists supply_quote_lines_inventory_after_insert_or_update on public.supply_quote_lines;
drop trigger if exists supply_quotes_inventory_after_archive on public.supply_quotes;
drop trigger if exists supply_request_lines_inventory_after_insert_or_update on public.supply_request_lines;
drop trigger if exists supply_requests_inventory_after_status_change on public.supply_requests;

drop function if exists public.sync_supply_quote_inventory_on_archive();
drop function if exists public.sync_supply_quote_line_inventory();
drop function if exists public.sync_supply_quote_line_inventory_for_id(uuid);
drop function if exists public.sync_supply_request_inventory_on_change();
drop function if exists public.sync_supply_request_line_inventory();
drop function if exists public.sync_supply_request_line_inventory_for_id(uuid);

alter table public.supply_requests
  drop constraint if exists supply_requests_status_check;

update public.supply_requests
set status = case status
  when 'SUBMITTED' then 'DRAFT'
  when 'APPROVED' then 'READY_TO_BUY'
  when 'CLOSED' then 'COMPLETED'
  when 'REJECTED' then 'CANCELLED'
  else status
end
where status in ('SUBMITTED', 'APPROVED', 'CLOSED', 'REJECTED');

alter table public.supply_requests
  add constraint supply_requests_status_check
  check (status in (
    'DRAFT', 'READY_TO_BUY', 'ORDERED', 'PARTIALLY_RECEIVED',
    'RECEIVED', 'COMPLETED', 'CANCELLED'
  ));

comment on column public.supply_requests.approver_name is
  'Người ký trên hồ sơ giấy đã duyệt; không phải bước phê duyệt điện tử trong hệ thống.';
comment on table public.supply_inventory_movements is
  'Sổ kho thực tế. Chỉ ghi khi hàng đã thực nhận, thực cấp, hoàn hoặc điều chỉnh; báo giá và kế hoạch mua không tự tạo giao dịch.';

commit;
