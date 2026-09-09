begin;

alter table public.user_module_access drop constraint user_module_access_module_check;
alter table public.user_module_access add constraint user_module_access_module_check
  check (module in ('equipment', 'vehicles', 'supplies', 'telecom', 'surveys'));
create or replace function public.permission_system_module(required_permission text)
returns text language sql immutable set search_path = '' as $$
  select case
    when required_permission like 'surveys.%' or required_permission like 'reports.surveys.%' then 'surveys'
    when required_permission like 'telecom.%' or required_permission like 'reports.telecom.%' then 'telecom'
    when required_permission like 'vehicles.%' or required_permission like 'reports.vehicles.%' then 'vehicles'
    when required_permission like 'supplies.%' or required_permission like 'reports.supplies.%' then 'supplies'
    else 'equipment' end;
$$;
do $$
declare signature text; definition text; extended text;
begin
  foreach signature in array array['public.has_system_module(text)', 'public.get_my_access()',
    'public.admin_set_user_access(uuid,text,boolean,boolean,jsonb,jsonb)'] loop
    definition := pg_get_functiondef(signature::regprocedure);
    extended := replace(replace(definition,
      '''equipment'', ''vehicles'', ''supplies'', ''telecom''', '''equipment'', ''vehicles'', ''supplies'', ''telecom'', ''surveys'''),
      '["equipment", "vehicles", "supplies", "telecom"]', '["equipment", "vehicles", "supplies", "telecom", "surveys"]');
    if definition = extended then raise exception 'Cannot extend module allowlist: %', signature; end if;
    execute extended;
  end loop;
end $$;
insert into public.permissions(code,module,description) values
  ('surveys.view','surveys','Xem khảo sát và thông tin người trả lời'),
  ('surveys.manage','surveys','Tạo, sửa, mở và đóng khảo sát'),
  ('reports.surveys.export','reports','Xuất kết quả khảo sát Excel') on conflict do nothing;
insert into public.role_permissions(role_id,permission_code)
select r.id,p.code from public.roles r cross join public.permissions p
where p.code in ('surveys.view','surveys.manage','reports.surveys.export')
  and (r.code in ('admin','manager') or (r.code in ('user','viewer') and p.code='surveys.view'))
on conflict do nothing;

create table public.company_surveys (
  id uuid primary key default gen_random_uuid(),
  public_token uuid not null unique default gen_random_uuid(),
  title text not null check(length(trim(title)) between 1 and 200),
  description text not null default '' check(length(description)<=3000),
  questions jsonb not null default '[]' check(jsonb_typeof(questions)='array'),
  status text not null default 'draft' check(status in ('draft','open','closed')),
  published_at timestamptz,
  revision integer not null default 1,
  response_count integer not null default 0,
  created_by uuid references public.profiles(id) on delete set null default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create table public.survey_responses (
  id uuid primary key default gen_random_uuid(),
  survey_id uuid not null references public.company_surveys(id),
  submission_id uuid not null,
  full_name text not null check(length(trim(full_name)) between 2 and 120),
  phone text not null default '' check(phone='' or phone ~ '^\+?[0-9]{8,15}$'),
  email text not null default '' check(length(email)<=254 and (email='' or email ~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$')),
  answers jsonb not null check(jsonb_typeof(answers)='object'),
  submitted_at timestamptz not null default now(),
  check(phone<>'' or email<>''),
  unique(survey_id,submission_id)
);
create index company_surveys_created on public.company_surveys(created_at desc,id);
create index survey_responses_listing on public.survey_responses(survey_id,submitted_at desc,id);
alter table public.company_surveys enable row level security;
alter table public.survey_responses enable row level security;
revoke all on public.company_surveys,public.survey_responses from anon,authenticated;
grant select on public.company_surveys,public.survey_responses to authenticated;
create policy surveys_read on public.company_surveys for select to authenticated using(public.has_permission('surveys.view'));
create policy survey_responses_read on public.survey_responses for select to authenticated using(public.has_permission('surveys.view'));

create function public.validate_survey_questions(target_questions jsonb) returns void
language plpgsql set search_path='' as $$
declare q jsonb; option_value jsonb;
begin
  if jsonb_typeof(target_questions) is distinct from 'array' then raise exception 'SURVEY_INVALID_QUESTIONS'; end if;
  if jsonb_array_length(target_questions)>100 then raise exception 'SURVEY_INVALID_QUESTIONS'; end if;
  if (select count(*)<>count(distinct value->>'id') from jsonb_array_elements(target_questions)) then raise exception 'SURVEY_INVALID_QUESTIONS'; end if;
  for q in select value from jsonb_array_elements(target_questions) loop
    if jsonb_typeof(q) is distinct from 'object'
      or coalesce(q->>'id','') !~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$'
      or jsonb_typeof(q->'title') is distinct from 'string' or length(trim(q->>'title')) not between 1 and 1000
      or coalesce(q->>'type','') not in ('short','long','single','multiple')
      or jsonb_typeof(q->'required') is distinct from 'boolean'
      or jsonb_typeof(q->'options') is distinct from 'array' then raise exception 'SURVEY_INVALID_QUESTIONS'; end if;
    if q->>'type' in ('single','multiple') then
      if jsonb_array_length(q->'options') not between 2 and 20
        or (select count(*)<>count(distinct value) from jsonb_array_elements(q->'options')) then raise exception 'SURVEY_INVALID_OPTIONS'; end if;
      for option_value in select value from jsonb_array_elements(q->'options') loop
        if jsonb_typeof(option_value)<>'string' or length(trim(option_value#>>'{}')) not between 1 and 300 then raise exception 'SURVEY_INVALID_OPTIONS'; end if;
      end loop;
    elsif jsonb_array_length(q->'options')<>0 then raise exception 'SURVEY_INVALID_OPTIONS'; end if;
  end loop;
end $$;

create function public.save_company_survey(target_id uuid,target_revision integer,target_title text,target_description text,target_questions jsonb)
returns uuid language plpgsql security definer set search_path='' as $$
declare existing public.company_surveys; result_id uuid;
begin
  if auth.uid() is null or not public.has_permission('surveys.manage') then raise exception 'SURVEY_FORBIDDEN'; end if;
  perform public.validate_survey_questions(target_questions);
  if target_id is null then
    insert into public.company_surveys(title,description,questions) values(trim(target_title),target_description,target_questions) returning id into result_id;
  else
    select * into existing from public.company_surveys where id=target_id for update;
    if not found or existing.revision is distinct from target_revision then raise exception 'SURVEY_STALE'; end if;
    if existing.published_at is not null and existing.questions<>target_questions then raise exception 'SURVEY_QUESTIONS_LOCKED'; end if;
    update public.company_surveys set title=trim(target_title),description=target_description,questions=target_questions,revision=revision+1,updated_at=now() where id=target_id;
    result_id:=target_id;
  end if;
  insert into public.audit_logs(actor_user_id,action,table_name,record_id,metadata)
    values(auth.uid(),'SURVEY_SAVED','company_surveys',result_id,jsonb_build_object('question_count',jsonb_array_length(target_questions)));
  return result_id;
end $$;

create function public.set_company_survey_status(target_id uuid,target_revision integer,target_status text)
returns void language plpgsql security definer set search_path='' as $$
declare existing public.company_surveys;
begin
  if auth.uid() is null or not public.has_permission('surveys.manage') then raise exception 'SURVEY_FORBIDDEN'; end if;
  if target_status is null or target_status not in ('open','closed') then raise exception 'SURVEY_INVALID_STATUS'; end if;
  select * into existing from public.company_surveys where id=target_id for update;
  if not found or existing.revision is distinct from target_revision then raise exception 'SURVEY_STALE'; end if;
  if target_status='open' and jsonb_array_length(existing.questions)=0 then raise exception 'SURVEY_NO_QUESTIONS'; end if;
  update public.company_surveys set status=target_status,revision=revision+1,updated_at=now(),
    published_at=case when target_status='open' then coalesce(published_at,now()) else published_at end where id=target_id;
  insert into public.audit_logs(actor_user_id,action,table_name,record_id,metadata)
    values(auth.uid(),'SURVEY_STATUS','company_surveys',target_id,jsonb_build_object('status',target_status));
end $$;

-- Only this limited projection is public, never tables or collected identities.
create function public.get_public_survey(target_token uuid) returns jsonb
language sql stable security definer set search_path='' as $$
  select jsonb_build_object('title',s.title,'description',s.description,'questions',s.questions)
  from public.company_surveys s where s.public_token=target_token and s.status='open';
$$;
create function public.submit_company_survey(target_token uuid,target_submission uuid,target_name text,target_phone text,target_email text,target_answers jsonb)
returns void language plpgsql security definer set search_path='' as $$
declare survey public.company_surveys; q jsonb; answer jsonb; choice jsonb;
begin
  select * into survey from public.company_surveys where public_token=target_token for update;
  if not found then raise exception 'SURVEY_UNAVAILABLE'; end if;
  -- Retrying the same request cannot create duplicate responses, even after closing.
  if exists(select 1 from public.survey_responses where survey_id=survey.id and submission_id=target_submission) then return; end if;
  if survey.status<>'open' then raise exception 'SURVEY_UNAVAILABLE'; end if;
  if survey.response_count>=10000 or (select count(*) from public.survey_responses where survey_id=survey.id and submitted_at>now()-interval '1 minute')>=120 then raise exception 'SURVEY_BUSY'; end if;
  if jsonb_typeof(target_answers) is distinct from 'object' or octet_length(target_answers::text)>524288 then raise exception 'SURVEY_INVALID_ANSWERS'; end if;
  if exists(select 1 from jsonb_object_keys(target_answers) as k(key) where not exists(select 1 from jsonb_array_elements(survey.questions) as question(value) where question.value->>'id'=k.key)) then raise exception 'SURVEY_INVALID_ANSWERS'; end if;
  for q in select value from jsonb_array_elements(survey.questions) loop
    answer:=target_answers->(q->>'id');
    if answer is null or answer='null'::jsonb or answer='""'::jsonb or answer='[]'::jsonb then
      if (q->>'required')::boolean then raise exception 'SURVEY_REQUIRED_ANSWER'; end if;
      continue;
    end if;
    if q->>'type' in ('short','long') then
      if jsonb_typeof(answer)<>'string' or length(answer#>>'{}')>(case when q->>'type'='short' then 500 else 5000 end)
        or ((q->>'required')::boolean and length(trim(answer#>>'{}'))=0) then raise exception 'SURVEY_INVALID_ANSWERS'; end if;
    elsif q->>'type'='single' then
      if jsonb_typeof(answer)<>'string' or not (q->'options' @> jsonb_build_array(answer)) then raise exception 'SURVEY_INVALID_ANSWERS'; end if;
    elsif q->>'type'='multiple' then
      if jsonb_typeof(answer)<>'array' then raise exception 'SURVEY_INVALID_ANSWERS'; end if;
      if jsonb_array_length(answer)>20 or (select count(*)<>count(distinct value) from jsonb_array_elements(answer)) then raise exception 'SURVEY_INVALID_ANSWERS'; end if;
      for choice in select value from jsonb_array_elements(answer) loop
        if jsonb_typeof(choice)<>'string' or not(q->'options' @> jsonb_build_array(choice)) then raise exception 'SURVEY_INVALID_ANSWERS'; end if;
      end loop;
    end if;
  end loop;
  insert into public.survey_responses(survey_id,submission_id,full_name,phone,email,answers)
    values(survey.id,target_submission,trim(target_name),coalesce(target_phone,''),lower(trim(coalesce(target_email,''))),target_answers);
  update public.company_surveys set response_count=response_count+1 where id=survey.id;
end $$;

revoke all on function public.validate_survey_questions(jsonb) from public,anon,authenticated;
revoke all on function public.save_company_survey(uuid,integer,text,text,jsonb), public.set_company_survey_status(uuid,integer,text) from public,anon,authenticated;
grant execute on function public.save_company_survey(uuid,integer,text,text,jsonb), public.set_company_survey_status(uuid,integer,text) to authenticated;
revoke all on function public.get_public_survey(uuid),public.submit_company_survey(uuid,uuid,text,text,text,jsonb) from public,anon,authenticated;
grant execute on function public.get_public_survey(uuid),public.submit_company_survey(uuid,uuid,text,text,text,jsonb) to anon,authenticated;
commit;
