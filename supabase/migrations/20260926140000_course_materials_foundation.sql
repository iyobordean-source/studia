-- Private course PDFs with authorization inherited from course ownership and membership.
-- Storage objects are accessed through the Supabase Storage API, never written through storage tables.

create table public.course_materials (
  id uuid primary key default gen_random_uuid(),
  course_id uuid not null references public.courses (id) on delete cascade,
  title text not null,
  description text,
  file_name text not null,
  storage_path text not null unique,
  mime_type text not null default 'application/pdf',
  file_size bigint not null,
  created_at timestamptz not null default pg_catalog.now(),
  updated_at timestamptz not null default pg_catalog.now(),
  constraint course_materials_title_valid check (
    title = pg_catalog.btrim(title)
    and pg_catalog.char_length(title) between 1 and 160
  ),
  constraint course_materials_description_length check (
    description is null or pg_catalog.char_length(description) <= 5000
  ),
  constraint course_materials_file_name_valid check (
    file_name = pg_catalog.btrim(file_name)
    and pg_catalog.char_length(file_name) between 1 and 255
    and pg_catalog.strpos(file_name, '/') = 0
    and pg_catalog.strpos(file_name, pg_catalog.chr(92)) = 0
  ),
  constraint course_materials_pdf_only check (
    mime_type = 'application/pdf'
    and pg_catalog.lower(pg_catalog.right(file_name, 4)) = '.pdf'
  ),
  constraint course_materials_file_size_valid check (
    file_size between 1 and 20971520
  ),
  constraint course_materials_storage_path_matches check (
    storage_path = course_id::text || '/' || id::text || '/' || file_name
  )
);

create index course_materials_by_course_created
  on public.course_materials (course_id, created_at desc);

comment on table public.course_materials is
  'Course PDF metadata. The private Storage object path is course_id/material_id/file_name.';

create trigger course_materials_set_updated_at
before update on public.course_materials
for each row execute function public.set_updated_at();

alter table public.course_materials enable row level security;
alter table public.course_materials force row level security;

create policy course_materials_read_course_participants
on public.course_materials
for select
to authenticated
using (
  public.owns_course(course_id)
  or (
    public.has_active_role('student'::public.studia_role)
    and exists (
      select 1
      from public.course_memberships cm
      where cm.course_id = course_materials.course_id
        and cm.student_id = (select auth.uid())
    )
  )
);

create policy course_materials_insert_by_owner
on public.course_materials
for insert
to authenticated
with check (public.owns_course(course_id));

create policy course_materials_update_by_owner
on public.course_materials
for update
to authenticated
using (public.owns_course(course_id))
with check (public.owns_course(course_id));

create policy course_materials_delete_by_owner
on public.course_materials
for delete
to authenticated
using (public.owns_course(course_id));

revoke all on public.course_materials from public, anon, authenticated;
grant select, delete on public.course_materials to authenticated;
grant insert (id, course_id, title, description, file_name, storage_path, mime_type, file_size)
  on public.course_materials to authenticated;
grant update (title, description) on public.course_materials to authenticated;

-- A private bucket enforces object-level RLS on every read and write.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'course-materials',
  'course-materials',
  false,
  20971520,
  array['application/pdf']::text[]
)
on conflict (id) do update
set name = excluded.name,
    public = false,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;

create policy course_material_objects_read_participant
on storage.objects
for select
to authenticated
using (
  bucket_id = 'course-materials'
  and exists (
    select 1
    from public.course_materials cm
    where cm.storage_path = storage.objects.name
      and (
        public.owns_course(cm.course_id)
        or (
          public.has_active_role('student'::public.studia_role)
          and exists (
            select 1
            from public.course_memberships membership
            where membership.course_id = cm.course_id
              and membership.student_id = (select auth.uid())
          )
        )
      )
  )
);

create policy course_material_objects_insert_by_owner
on storage.objects
for insert
to authenticated
with check (
  bucket_id = 'course-materials'
  and pg_catalog.array_length(storage.foldername(name), 1) = 2
  and (storage.foldername(name))[1] ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
  and (storage.foldername(name))[2] ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
  and pg_catalog.lower(storage.extension(name)) = 'pdf'
  and exists (
    select 1
    from public.courses c
    where c.id::text = (storage.foldername(name))[1]
      and public.owns_course(c.id)
  )
);

create policy course_material_objects_delete_by_owner
on storage.objects
for delete
to authenticated
using (
  bucket_id = 'course-materials'
  and pg_catalog.array_length(storage.foldername(name), 1) = 2
  and (storage.foldername(name))[1] ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
  and (storage.foldername(name))[2] ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
  and pg_catalog.lower(storage.extension(name)) = 'pdf'
  and exists (
    select 1
    from public.courses c
    where c.id::text = (storage.foldername(name))[1]
      and public.owns_course(c.id)
  )
);