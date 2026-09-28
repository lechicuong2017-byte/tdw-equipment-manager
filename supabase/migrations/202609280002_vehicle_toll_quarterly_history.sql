begin;

-- Mỗi xe tại một trạm chỉ có một kỳ mới nhất được xem là hiện hành.
-- Các kỳ trước vẫn nằm trong bảng gốc để phục vụ báo cáo và được trình bày
-- trong tab lịch sử. security_invoker giữ nguyên RLS của bảng nguồn.
create or replace view public.vehicle_toll_quarterly_records
with (security_invoker = true)
as
select
  pass.*,
  row_number() over (
    partition by
      coalesce(
        pass.vehicle_id::text,
        regexp_replace(upper(pass.license_plate), '[^A-Z0-9]', '', 'g')
      ),
      lower(regexp_replace(btrim(pass.toll_station), '\s+', ' ', 'g'))
    order by
      pass.starts_on desc,
      pass.expires_on desc,
      pass.created_at desc,
      pass.id desc
  ) = 1 as is_current
from public.vehicle_toll_quarterly_passes pass;

create index if not exists vehicle_toll_quarterly_history_lookup_idx
  on public.vehicle_toll_quarterly_passes (
    vehicle_id,
    lower(regexp_replace(btrim(toll_station), '\s+', ' ', 'g')),
    starts_on desc,
    expires_on desc,
    created_at desc
  );

revoke all on public.vehicle_toll_quarterly_records from anon, authenticated;
grant select on public.vehicle_toll_quarterly_records to authenticated;

comment on view public.vehicle_toll_quarterly_records is
  'Phân loại kỳ vé quý VETC mới nhất theo xe và trạm; các kỳ cũ là lịch sử gia hạn.';

commit;
