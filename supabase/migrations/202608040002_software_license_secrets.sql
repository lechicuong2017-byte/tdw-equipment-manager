create table public.software_license_secrets (
  license_id uuid primary key
    references public.software_licenses(id) on delete cascade,
  ciphertext text not null check (length(ciphertext) between 1 and 8192),
  iv text not null check (length(iv) between 1 and 64),
  auth_tag text not null check (length(auth_tag) between 1 and 64),
  encryption_version smallint not null default 1
    check (encryption_version = 1),
  updated_by uuid references public.profiles(id) on delete set null
    default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.software_license_secrets enable row level security;

create policy software_license_secrets_select_admin
  on public.software_license_secrets
  for select to authenticated
  using (public.is_admin());

create policy software_license_secrets_insert_admin
  on public.software_license_secrets
  for insert to authenticated
  with check (public.is_admin());

create policy software_license_secrets_update_admin
  on public.software_license_secrets
  for update to authenticated
  using (public.is_admin())
  with check (public.is_admin());

create policy software_license_secrets_delete_admin
  on public.software_license_secrets
  for delete to authenticated
  using (public.is_admin());

create or replace function public.admin_store_software_license_secret(
  target_license_id uuid,
  target_ciphertext text,
  target_iv text,
  target_auth_tag text,
  target_masked text,
  target_encryption_version smallint default 1
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not public.is_admin() then
    raise exception 'Admin with MFA required';
  end if;

  if target_encryption_version <> 1
    or length(target_ciphertext) not between 1 and 8192
    or length(target_iv) not between 1 and 64
    or length(target_auth_tag) not between 1 and 64
    or length(target_masked) not between 1 and 200 then
    raise exception 'Invalid encrypted license payload';
  end if;

  if not exists (
    select 1 from public.software_licenses where id = target_license_id
  ) then
    raise exception 'Software license not found';
  end if;

  insert into public.software_license_secrets (
    license_id,
    ciphertext,
    iv,
    auth_tag,
    encryption_version,
    updated_by
  )
  values (
    target_license_id,
    target_ciphertext,
    target_iv,
    target_auth_tag,
    target_encryption_version,
    auth.uid()
  )
  on conflict (license_id) do update set
    ciphertext = excluded.ciphertext,
    iv = excluded.iv,
    auth_tag = excluded.auth_tag,
    encryption_version = excluded.encryption_version,
    updated_by = auth.uid(),
    updated_at = now();

  update public.software_licenses
  set
    license_key_masked = target_masked,
    license_secret_ref = 'encrypted:v1'
  where id = target_license_id;

  insert into public.audit_logs (
    actor_user_id,
    action,
    table_name,
    record_id,
    metadata
  ) values (
    auth.uid(),
    'STORE_SECRET',
    'software_licenses',
    target_license_id,
    jsonb_build_object('encryption_version', target_encryption_version)
  );
end;
$$;

create or replace function public.admin_get_software_license_secret(
  target_license_id uuid
)
returns table (
  ciphertext text,
  iv text,
  auth_tag text,
  encryption_version smallint
)
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not public.is_admin() then
    raise exception 'Admin with MFA required';
  end if;

  if exists (
    select 1
    from public.software_license_secrets
    where license_id = target_license_id
  ) then
    insert into public.audit_logs (
      actor_user_id,
      action,
      table_name,
      record_id,
      metadata
    ) values (
      auth.uid(),
      'REVEAL_SECRET',
      'software_licenses',
      target_license_id,
      jsonb_build_object('encryption_version', 1)
    );
  end if;

  return query
  select
    secret.ciphertext,
    secret.iv,
    secret.auth_tag,
    secret.encryption_version
  from public.software_license_secrets secret
  where secret.license_id = target_license_id;
end;
$$;

revoke all on table public.software_license_secrets from public, anon;
grant select, insert, update, delete
  on table public.software_license_secrets to authenticated;

revoke all on function public.admin_store_software_license_secret(
  uuid, text, text, text, text, smallint
) from public;
revoke all on function public.admin_get_software_license_secret(uuid)
  from public;

grant execute on function public.admin_store_software_license_secret(
  uuid, text, text, text, text, smallint
) to authenticated;
grant execute on function public.admin_get_software_license_secret(uuid)
  to authenticated;
