-- Source-processing state for lecturer-provided course materials.
-- Actual document processing and state transitions belong to a future trusted worker.

-- create type public.studia_course_source_status as enum ('pending', 'processing', 'ready', 'failed');

-- create table public.course_material_sources (
--   id uuid primary key default gen_random_uuid(),
--   course_material_id uuid not null unique
--     references public.course_materials (id) on delete cascade,
--   status public.studia_course_source_status not null default 'pending',
--   error_message text,
--   created_at timestamptz not null default pg_catalog.now(),
--   updated_at timestamptz not null default pg_catalog.now(),
--   constraint course_material_sources_error_valid check (
--     error_message is null or (
--       status = 'failed'::public.studia_course_source_status
--       and error_message = pg_catalog.btrim(error_message)
--       and pg_catalog.char_length(error_message) between 1 and 2000
--     )
--   )
-- );

comment on table public.course_material_sources is
  'One course-scoped processing record per material; future processing state is written by a trusted worker.';

create trigger course_material_sources_set_updated_at
before update on public.course_material_sources
for each row execute function public.set_updated_at();

alter table public.course_material_sources enable row level security;
alter table public.course_material_sources force row level security;

create policy course_material_sources_read_owner
on public.course_material_sources
for select
to authenticated
using (
  exists (
    select 1
    from public.course_materials cm
    where cm.id = course_material_sources.course_material_id
      and public.owns_course(cm.course_id)
  )
);

-- Allows the material insert trigger to create only an initial pending row for its owner.
-- Authenticated clients receive no update or delete policy for processing state.
create policy course_material_sources_insert_pending_by_owner
on public.course_material_sources
for insert
to authenticated
with check (
  status = 'pending'::public.studia_course_source_status
  and error_message is null
  and exists (
    select 1
    from public.course_materials cm
    where cm.id = course_material_sources.course_material_id
      and public.owns_course(cm.course_id)
  )
);

revoke all on public.course_material_sources from public, anon, authenticated, service_role;
grant select on public.course_material_sources to authenticated, service_role;
grant insert (course_material_id) on public.course_material_sources to authenticated;
revoke all on type public.studia_course_source_status from public, anon, authenticated, service_role;
grant usage on type public.studia_course_source_status to authenticated, service_role;
grant update (status, error_message) on public.course_material_sources to service_role;

create or replace function public.create_course_material_source()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  insert into public.course_material_sources (course_material_id)
  values (new.id)
  on conflict (course_material_id) do nothing;
  return new;
end;
$$;

revoke all on function public.create_course_material_source() from public, anon, authenticated, service_role;

create trigger course_materials_create_source
 after insert on public.course_materials
 for each row execute function public.create_course_material_source();

-- Existing PDFs receive an honest pending state; new uploads are seeded by the trigger above.
insert into public.course_material_sources (course_material_id)
select cm.id
from public.course_materials cm
on conflict (course_material_id) do nothing;
