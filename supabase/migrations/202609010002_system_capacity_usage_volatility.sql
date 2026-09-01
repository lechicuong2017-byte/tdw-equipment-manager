begin;

alter function public.get_system_capacity_usage() volatile;

commit;
