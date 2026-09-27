-- Persist selectable PDF text for the existing course-material source records.
-- The server-only completion function writes text and marks a source ready atomically.

create table public.course_material_extractions (
  source_id uuid primary key
    references public.course_material_sources (id) on delete cascade,
  extracted_text text not null,
  created_at timestamptz not null default pg_catalog.now(),
  updated_at timestamptz not null default pg_catalog.now(),
  constraint course_material_extractions_text_size check (
    pg_catalog.octet_length(extracted_text) between 1 and 5242880
  )
);

comment on table public.course_material_extractions is
  'One bounded selectable-text extraction per course source; it contains no chunks, embeddings, or generated content.';

create trigger course_material_extractions_set_updated_at
before update on public.course_material_extractions
for each row execute function public.set_updated_at();

alter table public.course_material_extractions enable row level security;
alter table public.course_material_extractions force row level security;

-- This SECURITY DEFINER check avoids recursive source-table RLS evaluation while
-- returning only whether the current user can read this extraction row.
create or replace function public.can_read_course_material_extraction(p_source_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.course_material_sources source
    join public.course_materials material
      on material.id = source.course_material_id
    where source.id = p_source_id
      and (
        public.owns_course(material.course_id)
        or (
          public.has_active_role('student'::public.studia_role)
          and exists (
            select 1
            from public.course_memberships membership
            where membership.course_id = material.course_id
              and membership.student_id = (select auth.uid())
          )
        )
      )
  );
$$;

revoke all on function public.can_read_course_material_extraction(uuid) from public, anon, authenticated, service_role;
grant execute on function public.can_read_course_material_extraction(uuid) to authenticated;

create policy course_material_extractions_read_course_participants
on public.course_material_extractions
for select
to authenticated
using (public.can_read_course_material_extraction(source_id));

revoke all on public.course_material_extractions from public, anon, authenticated, service_role;
grant select on public.course_material_extractions to authenticated;

-- This is the only successful extraction write path. Its transaction persists
-- (or replaces) the single extraction and transitions processing to ready.
create or replace function public.complete_course_material_extraction(
  p_source_id uuid,
  p_extracted_text text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if auth.role() is distinct from 'service_role' then
    raise exception 'Trusted server access is required.' using errcode = '42501';
  end if;
  if p_extracted_text is null
    or pg_catalog.btrim(p_extracted_text) = ''
    or pg_catalog.octet_length(p_extracted_text) > 5242880 then
    raise exception 'Extracted text must contain between 1 byte and 5 MiB.' using errcode = '22023';
  end if;

  perform 1
  from public.course_material_sources source
  where source.id = p_source_id
    and source.status = 'processing'::public.studia_course_source_status
  for update;
  if not found then
    raise exception 'Course source is not in processing state.' using errcode = 'P0001';
  end if;

  insert into public.course_material_extractions (source_id, extracted_text)
  values (p_source_id, p_extracted_text)
  on conflict (source_id) do update
    set extracted_text = excluded.extracted_text;

  update public.course_material_sources
  set status = 'ready'::public.studia_course_source_status,
      error_message = null
  where id = p_source_id;
end;
$$;

revoke all on function public.complete_course_material_extraction(uuid, text) from public, anon, authenticated, service_role;
grant execute on function public.complete_course_material_extraction(uuid, text) to service_role;
