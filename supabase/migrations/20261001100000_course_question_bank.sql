-- Lecturer-approved Course Brain questions, scoped to their owning course.
-- Student-facing reads and assessment publication are intentionally not included.

create table public.course_questions (
  id uuid primary key default gen_random_uuid(),
  course_id uuid not null
    references public.courses (id) on delete cascade,
  question text not null,
  options jsonb not null,
  correct_answer text not null,
  explanation text not null,
  source_references jsonb not null,
  created_at timestamptz not null default pg_catalog.now(),
  created_by uuid not null default auth.uid()
    references public.profiles (user_id) on delete restrict,
  constraint course_questions_question_valid check (
    question = pg_catalog.btrim(question)
    and pg_catalog.char_length(question) between 1 and 2000
  ),
  constraint course_questions_options_valid check (
    case
      when pg_catalog.jsonb_typeof(options) = 'array'
        then pg_catalog.jsonb_array_length(options) = 4
      else false
    end
  ),
  constraint course_questions_correct_answer_valid check (
    correct_answer = pg_catalog.btrim(correct_answer)
    and pg_catalog.char_length(correct_answer) between 1 and 500
    and options ? correct_answer
  ),
  constraint course_questions_explanation_valid check (
    explanation = pg_catalog.btrim(explanation)
    and pg_catalog.char_length(explanation) between 1 and 3000
  ),
  constraint course_questions_source_references_valid check (
    case
      when pg_catalog.jsonb_typeof(source_references) = 'array'
        then pg_catalog.jsonb_array_length(source_references) > 0
      else false
    end
  )
);

create index course_questions_by_course_created_idx
  on public.course_questions (course_id, created_at desc);

comment on table public.course_questions is
  'Lecturer-approved grounded questions. Students have no read policy until assessment access is implemented.';
comment on column public.course_questions.source_references is
  'JSON array of exact source_id, extraction_version, and page_number citation tuples.';

alter table public.course_questions enable row level security;
alter table public.course_questions force row level security;

create policy course_questions_read_by_course_owner
on public.course_questions
for select
to authenticated
using (public.owns_course(course_id));

create policy course_questions_insert_by_course_owner
on public.course_questions
for insert
to authenticated
with check (public.owns_course(course_id));

create policy course_questions_update_by_course_owner
on public.course_questions
for update
to authenticated
using (public.owns_course(course_id))
with check (public.owns_course(course_id));

create policy course_questions_delete_by_course_owner
on public.course_questions
for delete
to authenticated
using (public.owns_course(course_id));

revoke all on public.course_questions from public, anon, authenticated, service_role;
grant select, delete on public.course_questions to authenticated;
grant insert (course_id, question, options, correct_answer, explanation, source_references)
  on public.course_questions to authenticated;
grant update (question, options, correct_answer, explanation, source_references)
  on public.course_questions to authenticated;

-- Validate the JSON citation tuples against real pages in the same course.
-- This protects direct authenticated inserts as well as the server API.
create function public.validate_course_question_record()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_reference jsonb;
  v_source_id uuid;
  v_extraction_version integer;
  v_page_number integer;
begin
  if auth.uid() is null or not public.owns_course(new.course_id) then
    raise exception 'Active course-owner lecturer access is required.' using errcode = '42501';
  end if;
  if tg_op = 'INSERT' and new.created_by is distinct from auth.uid() then
    raise exception 'Question author must be the signed-in lecturer.' using errcode = '42501';
  end if;
  if tg_op = 'UPDATE' and new.created_by is distinct from old.created_by then
    raise exception 'Question author cannot be changed.' using errcode = '42501';
  end if;

  if exists (
    select 1
    from pg_catalog.jsonb_array_elements(new.options) as option(value)
    where pg_catalog.jsonb_typeof(option.value) is distinct from 'string'
       or pg_catalog.btrim(option.value #>> '{}') = ''
       or pg_catalog.char_length(option.value #>> '{}') > 500
  ) then
    raise exception 'Question options must be four non-empty strings of at most 500 characters.' using errcode = '22023';
  end if;
  if (
    select pg_catalog.count(distinct pg_catalog.lower(option.value #>> '{}'))
    from pg_catalog.jsonb_array_elements(new.options) as option(value)
  ) <> 4 then
    raise exception 'Question options must be distinct.' using errcode = '22023';
  end if;

  for v_reference in
    select reference.value
    from pg_catalog.jsonb_array_elements(new.source_references) as reference(value)
  loop
    if pg_catalog.jsonb_typeof(v_reference) is distinct from 'object'
      or pg_catalog.jsonb_typeof(v_reference -> 'source_id') is distinct from 'string'
      or (v_reference ->> 'source_id') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
      or pg_catalog.jsonb_typeof(v_reference -> 'extraction_version') is distinct from 'number'
      or pg_catalog.btrim(v_reference ->> 'extraction_version') !~ '^[1-9][0-9]*$'
      or pg_catalog.jsonb_typeof(v_reference -> 'page_number') is distinct from 'number'
      or pg_catalog.btrim(v_reference ->> 'page_number') !~ '^[1-9][0-9]*$'
      or (v_reference - array['source_id', 'extraction_version', 'page_number']::text[]) <> '{}'::jsonb then
      raise exception 'A question source reference is malformed.' using errcode = '22023';
    end if;

    v_source_id := (v_reference ->> 'source_id')::uuid;
    v_extraction_version := (v_reference ->> 'extraction_version')::integer;
    v_page_number := (v_reference ->> 'page_number')::integer;

    if not exists (
      select 1
      from public.course_material_extraction_pages page
      join public.course_material_sources source
        on source.id = page.source_id
      join public.course_materials material
        on material.id = source.course_material_id
      where page.source_id = v_source_id
        and page.extraction_version = v_extraction_version
        and page.page_number = v_page_number
        and material.course_id = new.course_id
    ) then
      raise exception 'A question source reference is not available in this course.' using errcode = '22023';
    end if;
  end loop;

  return new;
end;
$$;

revoke all on function public.validate_course_question_record() from public, anon, authenticated, service_role;

create trigger course_questions_validate_record
before insert or update on public.course_questions
for each row execute function public.validate_course_question_record();