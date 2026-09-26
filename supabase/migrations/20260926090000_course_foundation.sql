-- Minimal course ownership and trusted enrollment foundation.
-- Student course access is granted only through a course_memberships row.

create table public.courses (
  id uuid primary key default gen_random_uuid(),
  lecturer_id uuid not null default auth.uid()
    references public.profiles (user_id) on delete restrict,
  name text not null,
  code text not null,
  description text,
  created_at timestamptz not null default pg_catalog.now(),
  updated_at timestamptz not null default pg_catalog.now(),
  constraint courses_name_valid check (
    name = pg_catalog.btrim(name)
    and pg_catalog.char_length(name) between 1 and 160
  ),
  constraint courses_code_valid check (
    code = pg_catalog.btrim(code)
    and pg_catalog.char_length(code) between 1 and 50
  ),
  constraint courses_description_length check (
    description is null or pg_catalog.char_length(description) <= 5000
  )
);

create unique index courses_lecturer_code_unique
  on public.courses (lecturer_id, (pg_catalog.lower(code)));

create table public.course_memberships (
  course_id uuid not null
    references public.courses (id) on delete cascade,
  student_id uuid not null
    references public.profiles (user_id) on delete cascade,
  created_at timestamptz not null default pg_catalog.now(),
  primary key (course_id, student_id)
);

create index course_memberships_by_student_idx
  on public.course_memberships (student_id, course_id);

comment on table public.courses is
  'Course spaces owned by an approved lecturer; access is controlled by course RLS.';
comment on table public.course_memberships is
  'Trusted course enrollment records; client-side enrollment writes are not granted.';

create trigger courses_set_updated_at
before update on public.courses
for each row execute function public.set_updated_at();

-- Used by the membership SELECT policy to avoid recursive RLS checks
-- between courses and course_memberships.
create or replace function public.owns_course(p_course_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select public.has_active_role('lecturer'::public.studia_role)
    and exists (
      select 1
      from public.courses c
      where c.id = p_course_id
        and c.lecturer_id = (select auth.uid())
    );
$$;

alter table public.courses enable row level security;
alter table public.courses force row level security;
alter table public.course_memberships enable row level security;
alter table public.course_memberships force row level security;

create policy courses_read_owner_or_enrolled_student
on public.courses
for select
to authenticated
using (
  (
    lecturer_id = (select auth.uid())
    and public.has_active_role('lecturer'::public.studia_role)
  )
  or (
    public.has_active_role('student'::public.studia_role)
    and exists (
      select 1
      from public.course_memberships cm
      where cm.course_id = courses.id
        and cm.student_id = (select auth.uid())
    )
  )
);

create policy courses_insert_by_active_owner
on public.courses
for insert
to authenticated
with check (
  lecturer_id = (select auth.uid())
  and public.has_active_role('lecturer'::public.studia_role)
);

create policy courses_update_by_active_owner
on public.courses
for update
to authenticated
using (
  lecturer_id = (select auth.uid())
  and public.has_active_role('lecturer'::public.studia_role)
)
with check (
  lecturer_id = (select auth.uid())
  and public.has_active_role('lecturer'::public.studia_role)
);

create policy course_memberships_read_student_or_owner
on public.course_memberships
for select
to authenticated
using (
  (
    student_id = (select auth.uid())
    and public.has_active_role('student'::public.studia_role)
  )
  or public.owns_course(course_id)
);

revoke all on public.courses from public, anon, authenticated;
revoke all on public.course_memberships from public, anon, authenticated;
grant select on public.courses to authenticated;
grant insert (name, code, description) on public.courses to authenticated;
grant update (name, code, description) on public.courses to authenticated;
grant select on public.course_memberships to authenticated;

revoke all on function public.owns_course(uuid) from public, anon, authenticated;
grant execute on function public.owns_course(uuid) to authenticated;
