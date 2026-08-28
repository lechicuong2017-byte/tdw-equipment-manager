begin;

do $migration$
declare
  function_definition text;
  corrected_definition text;
begin
  function_definition := pg_get_functiondef(
    'public.claim_maintenance_notifications(jsonb)'::regprocedure
  );
  corrected_definition := replace(
    function_definition,
    $old$on conflict (
      plan_id,
      recipient_email,
      notification_type,
      due_date
    ) do nothing$old$,
    'on conflict do nothing'
  );
  if corrected_definition = function_definition then
    raise exception 'Unable to update claim_maintenance_notifications';
  end if;
  execute corrected_definition;

  function_definition := pg_get_functiondef(
    'public.claim_vehicle_inspection_notifications(jsonb)'::regprocedure
  );
  corrected_definition := replace(
    function_definition,
    $old$on conflict (inspection_id, recipient_email, notification_type, due_date)
    do nothing$old$,
    'on conflict do nothing'
  );
  if corrected_definition = function_definition then
    raise exception 'Unable to update claim_vehicle_inspection_notifications';
  end if;
  execute corrected_definition;
end;
$migration$;

commit;
