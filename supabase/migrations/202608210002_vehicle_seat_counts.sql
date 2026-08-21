begin;

alter table public.vehicles
  add column if not exists seat_count smallint;

alter table public.vehicles
  drop constraint if exists vehicles_seat_count_check;
alter table public.vehicles
  add constraint vehicles_seat_count_check
  check (seat_count is null or seat_count between 1 and 100);

alter table public.vehicle_inspections
  add column if not exists seat_count smallint;

alter table public.vehicle_inspections
  drop constraint if exists vehicle_inspections_seat_count_check;
alter table public.vehicle_inspections
  add constraint vehicle_inspections_seat_count_check
  check (seat_count is null or seat_count between 1 and 100);

commit;
