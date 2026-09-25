-- Studia identity and authorization foundation.
-- All new Supabase Auth users begin in onboarding; public metadata never grants a role.

create type public.studia_role as enum ('student', 'lecturer', 'admin');
create type public.studia_account_status as enum ('onboarding', 'active', 'pending', 'rejected', 'disabled');
create type public.studia_lecturer_application_status as enum ('pending', 'approved', 'rejected');

create table public.profiles (
  user_id uuid primary key references auth.users (id) on delete cascade,
  display_name text,
  role public.studia_role not null default 'student',
  account_status public.studia_account_status not null default 'onboarding',
  created_at timestamptz not null default pg_catalog.now(),
  updated_at timestamptz not null default pg_catalog.now(),
  constraint profiles_display_name_length check (display_name is null or pg_catalog.char_length(display_name) <= 120),
  constraint profiles_role_status_check check (
    (role = 'student' and account_status in ('onboarding', 'active', 'disabled')) or
    (role = 'lecturer' and account_status in ('pending', 'active', 'rejected', 'disabled')) or
    (role = 'admin' and account_status in ('active', 'disabled'))
  )
);

create table public.lecturer_applications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null unique references public.profiles (user_id) on delete cascade,
  status public.studia_lecturer_application_status not null default 'pending',
  submitted_at timestamptz not null default pg_catalog.now(),
  reviewed_at timestamptz,
  reviewed_by uuid references auth.users (id) on delete restrict,
  constraint lecturer_applications_review_state_check check (
    (status = 'pending' and reviewed_at is null and reviewed_by is null) or
    (status in ('approved', 'rejected') and reviewed_at is not null and reviewed_by is not null)
  )
);

comment on table public.profiles is 'Studia identity profile. Role and account status are database-controlled.';
comment on table public.lecturer_applications is 'Lecturer access requests; applicant writes and approval decisions go through restricted database functions.';

create or replace function public.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := pg_catalog.now();
  return new;
end;
$$;

create trigger profiles_set_updated_at
before update on public.profiles
for each row execute function public.set_updated_at();

create or replace function public.handle_auth_user_created()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (user_id, display_name, role, account_status)
  values (
    new.id,
    nullif(pg_catalog.left(pg_catalog.btrim(coalesce(new.raw_user_meta_data ->> 'full_name', new.raw_user_meta_data ->> 'name')), 120), ''),
    'student',
    'onboarding'
  )
  on conflict (user_id) do nothing;
  return new;
end;
$$;

-- Backfill existing Auth users to a non-privileged onboarding state before adding the trigger.
insert into public.profiles (user_id, display_name, role, account_status)
select
  id,
  nullif(pg_catalog.left(pg_catalog.btrim(coalesce(raw_user_meta_data ->> 'full_name', raw_user_meta_data ->> 'name')), 120), ''),
  'student',
  'onboarding'
from auth.users
on conflict (user_id) do nothing;

create trigger on_auth_user_created_studia_profile
after insert on auth.users
for each row execute function public.handle_auth_user_created();

create or replace function public.has_active_role(p_role public.studia_role)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.profiles p
    where p.user_id = (select auth.uid())
      and p.role = p_role
      and p.account_status = 'active'
      and (
        p_role <> 'lecturer' or exists (
          select 1
          from public.lecturer_applications a
          where a.user_id = p.user_id
            and a.status = 'approved'
        )
      )
  );
$$;

create or replace function public.is_active_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select public.has_active_role('admin'::public.studia_role);
$$;

create or replace function public.ensure_my_profile()
returns public.profiles
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_profile public.profiles;
begin
  if v_user_id is null then
    raise exception 'Authentication is required.' using errcode = '28000';
  end if;

  insert into public.profiles (user_id, display_name, role, account_status)
  select
    u.id,
    nullif(pg_catalog.left(pg_catalog.btrim(coalesce(u.raw_user_meta_data ->> 'full_name', u.raw_user_meta_data ->> 'name')), 120), ''),
    'student',
    'onboarding'
  from auth.users u
  where u.id = v_user_id
  on conflict (user_id) do nothing;

  select * into v_profile from public.profiles where user_id = v_user_id;
  if not found then
    raise exception 'Profile could not be created.' using errcode = 'P0001';
  end if;
  return v_profile;
end;
$$;

create or replace function public.complete_my_onboarding(p_role text, p_display_name text)
returns public.profiles
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_role public.studia_role;
  v_profile public.profiles;
begin
  if v_user_id is null then
    raise exception 'Authentication is required.' using errcode = '28000';
  end if;
  if p_role is null or p_role not in ('student', 'lecturer') then
    raise exception 'Choose Student or apply as a Lecturer.' using errcode = '22023';
  end if;
  if p_display_name is null or pg_catalog.char_length(pg_catalog.btrim(p_display_name)) not between 1 and 120 then
    raise exception 'Enter a name of 1 to 120 characters.' using errcode = '22023';
  end if;

  v_role := p_role::public.studia_role;
  select * into v_profile from public.profiles where user_id = v_user_id for update;
  if not found then
    raise exception 'Profile not found.' using errcode = 'P0002';
  end if;
  if v_profile.account_status <> 'onboarding' then
    raise exception 'Onboarding has already been completed.' using errcode = 'P0001';
  end if;

  update public.profiles
  set display_name = pg_catalog.btrim(p_display_name),
      role = v_role,
      account_status = case when v_role = 'student' then 'active'::public.studia_account_status else 'pending'::public.studia_account_status end
  where user_id = v_user_id
  returning * into v_profile;

  if v_role = 'lecturer' then
    insert into public.lecturer_applications (user_id, status)
    values (v_user_id, 'pending')
    on conflict (user_id) do nothing;
  end if;
  return v_profile;
end;
$$;

create or replace function public.review_lecturer_application(p_application_id uuid, p_decision text)
returns public.lecturer_applications
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_application public.lecturer_applications;
  v_decision public.studia_lecturer_application_status;
begin
  if auth.uid() is null or not public.is_active_admin() then
    raise exception 'Active administrator access is required.' using errcode = '42501';
  end if;
  if p_decision is null or p_decision not in ('approved', 'rejected') then
    raise exception 'Decision must be approved or rejected.' using errcode = '22023';
  end if;
  v_decision := p_decision::public.studia_lecturer_application_status;

  select * into v_application
  from public.lecturer_applications
  where id = p_application_id
  for update;
  if not found then
    raise exception 'Lecturer application not found.' using errcode = 'P0002';
  end if;
  if v_application.status <> 'pending' then
    raise exception 'Lecturer application has already been reviewed.' using errcode = 'P0001';
  end if;

  update public.lecturer_applications
  set status = v_decision,
      reviewed_at = pg_catalog.now(),
      reviewed_by = auth.uid()
  where id = p_application_id
  returning * into v_application;

  update public.profiles
  set account_status = case when v_decision = 'approved' then 'active'::public.studia_account_status else 'rejected'::public.studia_account_status end
  where user_id = v_application.user_id
    and role = 'lecturer'
    and account_status = 'pending';
  if not found then
    raise exception 'Applicant profile is not in the expected pending state.' using errcode = 'P0001';
  end if;

  return v_application;
end;
$$;

alter table public.profiles enable row level security;
alter table public.profiles force row level security;
alter table public.lecturer_applications enable row level security;
alter table public.lecturer_applications force row level security;

create policy profiles_read_self_or_admin
on public.profiles
for select
to authenticated
using (user_id = (select auth.uid()) or public.is_active_admin());

create policy lecturer_applications_read_applicant_or_admin
on public.lecturer_applications
for select
to authenticated
using (user_id = (select auth.uid()) or public.is_active_admin());

revoke all on public.profiles from anon, authenticated;
revoke all on public.lecturer_applications from anon, authenticated;
grant select on public.profiles to authenticated;
grant select on public.lecturer_applications to authenticated;
grant usage on type public.studia_role to authenticated;
grant usage on type public.studia_account_status to authenticated;
grant usage on type public.studia_lecturer_application_status to authenticated;
grant usage on type public.profiles to authenticated;
grant usage on type public.lecturer_applications to authenticated;

revoke all on function public.set_updated_at() from public, anon, authenticated;
revoke all on function public.handle_auth_user_created() from public, anon, authenticated;
revoke all on function public.has_active_role(public.studia_role) from public, anon, authenticated;
revoke all on function public.is_active_admin() from public, anon, authenticated;
revoke all on function public.ensure_my_profile() from public, anon, authenticated;
revoke all on function public.complete_my_onboarding(text, text) from public, anon, authenticated;
revoke all on function public.review_lecturer_application(uuid, text) from public, anon, authenticated;
grant execute on function public.has_active_role(public.studia_role) to authenticated;
grant execute on function public.is_active_admin() to authenticated;
grant execute on function public.ensure_my_profile() to authenticated;
grant execute on function public.complete_my_onboarding(text, text) to authenticated;
grant execute on function public.review_lecturer_application(uuid, text) to authenticated;


