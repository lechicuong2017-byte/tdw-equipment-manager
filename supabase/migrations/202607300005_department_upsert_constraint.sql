begin;

alter table public.departments
  add constraint departments_name_key unique (name);

commit;
