-- Student-requested enrollment with lecturer approval.
-- Authenticated clients read through role-checked RPCs and cannot write memberships directly.

create type public.studia_course_join_request_status as enum ('pending', 'approved', 'rejected');

create table public.course_join_requests (
  id uuid primary key default gen_random_uuid(),
  course_id uuid not null references public.courses (id) on delete cascade,
  student_id uuid not null references public.profiles (user_id) on delete cascade,
  status public.studia_course_join_request_status not null default 'pending',
  created_at timestamptz not null default pg_catalog.now(),
  updated_at timestamptz not null default pg_catalog.now(),
  reviewed_at timestamptz,
  reviewed_by uuid references public.profiles (user_id) on delete restrict,
  constraint course_join_requests_review_state_check check (
    (status = 'pending' and reviewed_at is null and reviewed_by is null) or
    (status in ('approved', 'rejected') and reviewed_at is not null and reviewed_by is not null)
  )
);

create unique index course_join_requests_one_pending
  on public.course_join_requests (course_id, student_id)
  where status = 'pending';

create index course_join_requests_by_student
  on public.course_join_requests (student_id, course_id, created_at desc);

create index course_join_requests_pending_by_course
  on public.course_join_requests (course_id, created_at)
  where status = 'pending';

comment on table public.course_join_requests is
  'Student requests to join courses; approval and enrollment are handled atomically by restricted RPCs.';

create trigger course_join_requests_set_updated_at
before update on public.course_join_requests
for each row execute function public.set_updated_at();

alter table public.course_join_requests enable row level security;
alter table public.course_join_requests force row level security;

create policy course_join_requests_read_student_or_owner
on public.course_join_requests
for select
to authenticated
using (
  (
    student_id = (select auth.uid())
    and public.has_active_role('student'::public.studia_role)
  )
  or (
    status = 'pending'::public.studia_course_join_request_status
    and public.owns_course(course_id)
  )
);

revoke all on public.course_join_requests from public, anon, authenticated;
grant select on public.course_join_requests to authenticated;
grant usage on type public.studia_course_join_request_status to authenticated;

-- This directory is limited to active students and visible only to the owning lecturer.
create or replace function public.search_students_for_course(p_course_id uuid, p_query text)
returns table (
  student_id uuid,
  display_name text,
  email text,
  already_enrolled boolean
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_query text := pg_catalog.btrim(coalesce(p_query, ''));
begin
  if auth.uid() is null or not public.has_active_role('lecturer'::public.studia_role) then
    raise exception 'Active lecturer access is required.' using errcode = '42501';
  end if;
  if not public.owns_course(p_course_id) then
    raise exception 'Course access is required.' using errcode = '42501';
  end if;
  if pg_catalog.char_length(v_query) < 2 then
    raise exception 'Enter at least two characters to search.' using errcode = '22023';
  end if;

  return query
  select
    p.user_id,
    p.display_name,
    u.email::text,
    exists (
      select 1
      from public.course_memberships cm
      where cm.course_id = p_course_id
        and cm.student_id = p.user_id
    )
  from public.profiles p
  join auth.users u on u.id = p.user_id
  where p.role = 'student'::public.studia_role
    and p.account_status = 'active'::public.studia_account_status
    and (
      pg_catalog.strpos(pg_catalog.lower(coalesce(p.display_name, '')), pg_catalog.lower(v_query)) > 0
      or pg_catalog.strpos(pg_catalog.lower(coalesce(u.email, '')), pg_catalog.lower(v_query)) > 0
    )
  order by p.display_name nulls last, u.email
  limit 20;
end;
$$;

create or replace function public.list_course_students(p_course_id uuid)
returns table (
  student_id uuid,
  display_name text,
  email text,
  joined_at timestamptz
)
language plpgsql
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null or not public.owns_course(p_course_id) then
    raise exception 'Course owner access is required.' using errcode = '42501';
  end if;

  return query
  select p.user_id, p.display_name, u.email::text, cm.created_at
  from public.course_memberships cm
  join public.profiles p on p.user_id = cm.student_id
  join auth.users u on u.id = p.user_id
  where cm.course_id = p_course_id
  order by p.display_name nulls last, u.email;
end;
$$;

create or replace function public.add_course_student(p_course_id uuid, p_student_id uuid)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_inserted integer;
begin
  if auth.uid() is null or not public.has_active_role('lecturer'::public.studia_role) then
    raise exception 'Active lecturer access is required.' using errcode = '42501';
  end if;

  perform 1 from public.courses c where c.id = p_course_id for update;
  if not found or not public.owns_course(p_course_id) then
    raise exception 'Course owner access is required.' using errcode = '42501';
  end if;

  if not exists (
    select 1
    from public.profiles p
    where p.user_id = p_student_id
      and p.role = 'student'::public.studia_role
      and p.account_status = 'active'::public.studia_account_status
  ) then
    raise exception 'An active student account is required.' using errcode = '22023';
  end if;

  insert into public.course_memberships (course_id, student_id)
  values (p_course_id, p_student_id)
  on conflict (course_id, student_id) do nothing;
  get diagnostics v_inserted = row_count;

  -- A direct lecturer add also resolves any outstanding request for that student.
  update public.course_join_requests
  set status = 'approved',
      reviewed_at = pg_catalog.now(),
      reviewed_by = auth.uid()
  where course_id = p_course_id
    and student_id = p_student_id
    and status = 'pending';

  return v_inserted > 0;
end;
$$;

create or replace function public.remove_course_student(p_course_id uuid, p_student_id uuid)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_deleted integer;
begin
  if auth.uid() is null or not public.has_active_role('lecturer'::public.studia_role) then
    raise exception 'Active lecturer access is required.' using errcode = '42501';
  end if;

  perform 1 from public.courses c where c.id = p_course_id for update;
  if not found or not public.owns_course(p_course_id) then
    raise exception 'Course owner access is required.' using errcode = '42501';
  end if;

  delete from public.course_memberships
  where course_id = p_course_id
    and student_id = p_student_id;
  get diagnostics v_deleted = row_count;
  return v_deleted > 0;
end;
$$;

create or replace function public.list_course_join_requests(p_course_id uuid)
returns table (
  request_id uuid,
  student_id uuid,
  display_name text,
  email text,
  status public.studia_course_join_request_status,
  submitted_at timestamptz
)
language plpgsql
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null or not public.owns_course(p_course_id) then
    raise exception 'Course owner access is required.' using errcode = '42501';
  end if;

  return query
  select r.id, p.user_id, p.display_name, u.email::text, r.status, r.created_at
  from public.course_join_requests r
  join public.profiles p on p.user_id = r.student_id
  join auth.users u on u.id = p.user_id
  where r.course_id = p_course_id
    and r.status = 'pending'::public.studia_course_join_request_status
  order by r.created_at, r.id;
end;
$$;

create or replace function public.review_course_join_request(p_request_id uuid, p_decision text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_course_id uuid;
  v_request public.course_join_requests;
  v_decision public.studia_course_join_request_status;
begin
  if v_user_id is null or not public.has_active_role('lecturer'::public.studia_role) then
    raise exception 'Active lecturer access is required.' using errcode = '42501';
  end if;
  if p_decision is null or p_decision not in ('approved', 'rejected') then
    raise exception 'Decision must be approved or rejected.' using errcode = '22023';
  end if;

  select r.course_id into v_course_id
  from public.course_join_requests r
  where r.id = p_request_id;
  if not found then
    raise exception 'Course join request not found.' using errcode = 'P0002';
  end if;

  -- All enrollment mutations take the course lock first, so concurrent decisions serialize.
  perform 1 from public.courses c where c.id = v_course_id for update;
  if not found or not public.owns_course(v_course_id) then
    raise exception 'Course owner access is required.' using errcode = '42501';
  end if;

  select * into v_request
  from public.course_join_requests r
  where r.id = p_request_id
  for update;
  if not found then
    raise exception 'Course join request not found.' using errcode = 'P0002';
  end if;
  if v_request.status <> 'pending'::public.studia_course_join_request_status then
    raise exception 'Course join request has already been reviewed.' using errcode = 'P0001';
  end if;

  v_decision := p_decision::public.studia_course_join_request_status;
  if v_decision = 'approved'::public.studia_course_join_request_status then
    insert into public.course_memberships (course_id, student_id)
    values (v_request.course_id, v_request.student_id)
    on conflict (course_id, student_id) do nothing;
  end if;

  update public.course_join_requests
  set status = v_decision,
      reviewed_at = pg_catalog.now(),
      reviewed_by = v_user_id
  where id = p_request_id;
end;
$$;

create or replace function public.search_courses_for_join(p_query text)
returns table (
  course_id uuid,
  course_name text,
  course_code text,
  description text,
  is_enrolled boolean,
  request_status public.studia_course_join_request_status,
  request_created_at timestamptz
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_query text := pg_catalog.btrim(coalesce(p_query, ''));
begin
  if v_user_id is null or not public.has_active_role('student'::public.studia_role) then
    raise exception 'Active student access is required.' using errcode = '42501';
  end if;
  if pg_catalog.char_length(v_query) < 2 then
    raise exception 'Enter at least two characters to search.' using errcode = '22023';
  end if;

  return query
  select
    c.id,
    c.name,
    c.code,
    c.description,
    exists (
      select 1
      from public.course_memberships cm
      where cm.course_id = c.id
        and cm.student_id = v_user_id
    ),
    latest.status,
    latest.created_at
  from public.courses c
  left join lateral (
    select r.status, r.created_at
    from public.course_join_requests r
    where r.course_id = c.id
      and r.student_id = v_user_id
    order by r.created_at desc, r.id desc
    limit 1
  ) latest on true
  where pg_catalog.strpos(pg_catalog.lower(c.name), pg_catalog.lower(v_query)) > 0
     or pg_catalog.strpos(pg_catalog.lower(c.code), pg_catalog.lower(v_query)) > 0
  order by pg_catalog.lower(c.name), pg_catalog.lower(c.code)
  limit 25;
end;
$$;

create or replace function public.request_course_join(p_course_id uuid)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_inserted integer;
begin
  if v_user_id is null or not public.has_active_role('student'::public.studia_role) then
    raise exception 'Active student access is required.' using errcode = '42501';
  end if;

  -- Serialize requests with lecturer adds and approvals for this course.
  perform 1 from public.courses c where c.id = p_course_id for update;
  if not found then
    raise exception 'Course not found.' using errcode = 'P0002';
  end if;
  if exists (
    select 1
    from public.course_memberships cm
    where cm.course_id = p_course_id
      and cm.student_id = v_user_id
  ) then
    raise exception 'You are already enrolled in this course.' using errcode = 'P0001';
  end if;

  insert into public.course_join_requests (course_id, student_id)
  values (p_course_id, v_user_id)
  on conflict (course_id, student_id)
    where status = 'pending'::public.studia_course_join_request_status
  do nothing;
  get diagnostics v_inserted = row_count;
  return v_inserted > 0;
end;
$$;
create or replace function public.list_my_course_join_requests()
returns table (
  course_id uuid,
  course_name text,
  course_code text,
  status public.studia_course_join_request_status,
  submitted_at timestamptz,
  is_enrolled boolean
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
begin
  if v_user_id is null or not public.has_active_role('student'::public.studia_role) then
    raise exception 'Active student access is required.' using errcode = '42501';
  end if;

  return query
  with latest as (
    select distinct on (r.course_id)
      r.course_id,
      r.status,
      r.created_at
    from public.course_join_requests r
    where r.student_id = v_user_id
    order by r.course_id, r.created_at desc, r.id desc
  )
  select
    c.id,
    c.name,
    c.code,
    latest.status,
    latest.created_at,
    exists (
      select 1
      from public.course_memberships cm
      where cm.course_id = c.id
        and cm.student_id = v_user_id
    )
  from latest
  join public.courses c on c.id = latest.course_id
  order by latest.created_at desc, c.name;
end;
$$;

revoke all on function public.search_students_for_course(uuid, text) from public, anon, authenticated;
revoke all on function public.list_course_students(uuid) from public, anon, authenticated;
revoke all on function public.add_course_student(uuid, uuid) from public, anon, authenticated;
revoke all on function public.remove_course_student(uuid, uuid) from public, anon, authenticated;
revoke all on function public.list_course_join_requests(uuid) from public, anon, authenticated;
revoke all on function public.review_course_join_request(uuid, text) from public, anon, authenticated;
revoke all on function public.search_courses_for_join(text) from public, anon, authenticated;
revoke all on function public.request_course_join(uuid) from public, anon, authenticated;
revoke all on function public.list_my_course_join_requests() from public, anon, authenticated;

grant execute on function public.search_students_for_course(uuid, text) to authenticated;
grant execute on function public.list_course_students(uuid) to authenticated;
grant execute on function public.add_course_student(uuid, uuid) to authenticated;
grant execute on function public.remove_course_student(uuid, uuid) to authenticated;
grant execute on function public.list_course_join_requests(uuid) to authenticated;
grant execute on function public.review_course_join_request(uuid, text) to authenticated;
grant execute on function public.search_courses_for_join(text) to authenticated;
grant execute on function public.request_course_join(uuid) to authenticated;
grant execute on function public.list_my_course_join_requests() to authenticated;