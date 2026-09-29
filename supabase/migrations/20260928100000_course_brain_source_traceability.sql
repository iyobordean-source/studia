-- Preserve successful course PDF extraction versions and their page-level source locations.
-- Pages are text-only evidence for future retrieval; this migration adds no chunks or embeddings.

alter table public.course_material_extractions
  drop constraint course_material_extractions_pkey;

alter table public.course_material_extractions
  add column extraction_version integer not null default 1,
  add constraint course_material_extractions_version_positive
    check (extraction_version > 0),
  add constraint course_material_extractions_pkey
    primary key (source_id, extraction_version);

comment on table public.course_material_extractions is
  'One aggregate selectable-text extraction per successful source-processing version.';
comment on column public.course_material_extractions.extraction_version is
  'One-based successful extraction sequence for this source; prior versions remain available for traceability.';

create table public.course_material_extraction_pages (
  source_id uuid not null,
  extraction_version integer not null,
  page_number integer not null,
  extracted_text text not null,
  constraint course_material_extraction_pages_pkey
    primary key (source_id, extraction_version, page_number),
  constraint course_material_extraction_pages_version_fkey
    foreign key (source_id, extraction_version)
    references public.course_material_extractions (source_id, extraction_version)
    on delete cascade,
  constraint course_material_extraction_pages_page_positive
    check (page_number > 0),
  constraint course_material_extraction_pages_text_size
    check (pg_catalog.octet_length(extracted_text) between 1 and 5242880)
);

comment on table public.course_material_extraction_pages is
  'Non-empty selectable text by one-based PDF page, tied to an immutable source extraction version.';
comment on column public.course_material_extraction_pages.source_id is
  'Resolves through course_material_sources to the original course_materials row and course.';
comment on column public.course_material_extraction_pages.extracted_text is
  'Page text only; future retrieval chunks must retain this source, extraction version, and page number.';

alter table public.course_material_extraction_pages enable row level security;
alter table public.course_material_extraction_pages force row level security;

create policy course_material_extraction_pages_read_course_participants
on public.course_material_extraction_pages
for select
to authenticated
using (public.can_read_course_material_extraction(source_id));

revoke all on public.course_material_extraction_pages from public, anon, authenticated, service_role;
grant select on public.course_material_extraction_pages to authenticated;

-- Keep the two-argument overload for the currently deployed processor during rollout.
-- It creates an initial aggregate only when absent, preserving the old processor's single-row lookup.
-- It never overwrites existing evidence or invents page records.
-- Remove this compatibility overload only in a later migration after the page-aware
-- processor is deployed and verified in production.
create or replace function public.complete_course_material_extraction(
  p_source_id uuid,
  p_extracted_text text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_extraction_version integer;
  v_existing_text text;
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

  select coalesce(pg_catalog.max(extraction.extraction_version), 0)
  into v_extraction_version
  from public.course_material_extractions extraction
  where extraction.source_id = p_source_id;

  if v_extraction_version = 0 then
    insert into public.course_material_extractions (
      source_id,
      extraction_version,
      extracted_text
    )
    values (p_source_id, 1, p_extracted_text);
  else
    select extraction.extracted_text
    into v_existing_text
    from public.course_material_extractions extraction
    where extraction.source_id = p_source_id
      and extraction.extraction_version = v_extraction_version;

    if v_existing_text is distinct from p_extracted_text then
      raise exception 'Legacy completion cannot replace existing extraction evidence.' using errcode = 'P0001';
    end if;
  end if;

  update public.course_material_sources
  set status = 'ready'::public.studia_course_source_status,
      error_message = null
  where id = p_source_id;
end;
$$;

revoke all on function public.complete_course_material_extraction(uuid, text) from public, anon, authenticated, service_role;
grant execute on function public.complete_course_material_extraction(uuid, text) to service_role;

-- The new processor uses this overload to persist page-level traceability.

create function public.complete_course_material_extraction(
  p_source_id uuid,
  p_extracted_text text,
  p_pages jsonb
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_extraction_version integer;
  v_page_count integer;
  v_distinct_page_count integer;
  v_invalid_page_count integer;
  v_joined_page_text text;
begin
  if auth.role() is distinct from 'service_role' then
    raise exception 'Trusted server access is required.' using errcode = '42501';
  end if;
  if p_extracted_text is null
    or pg_catalog.btrim(p_extracted_text) = ''
    or pg_catalog.octet_length(p_extracted_text) > 5242880 then
    raise exception 'Extracted text must contain between 1 byte and 5 MiB.' using errcode = '22023';
  end if;
  if p_pages is null or pg_catalog.jsonb_typeof(p_pages) is distinct from 'array' then
    raise exception 'Page text must be provided as a JSON array.' using errcode = '22023';
  end if;
  if pg_catalog.jsonb_array_length(p_pages) = 0 then
    raise exception 'At least one page with selectable text is required.' using errcode = '22023';
  end if;

  select
    pg_catalog.count(*)::integer,
    pg_catalog.count(distinct page.page_number)::integer,
    (pg_catalog.count(*) filter (
      where page.page_number is null
        or page.page_number <= 0
        or page.extracted_text is null
        or pg_catalog.btrim(page.extracted_text) = ''
    ))::integer,
    pg_catalog.string_agg(page.extracted_text, E'\n\n' order by page.page_number)
      filter (
        where page.page_number > 0
          and page.extracted_text is not null
          and pg_catalog.btrim(page.extracted_text) <> ''
      )
  into v_page_count, v_distinct_page_count, v_invalid_page_count, v_joined_page_text
  from pg_catalog.jsonb_to_recordset(p_pages)
    as page(page_number integer, extracted_text text);

  if v_page_count <> pg_catalog.jsonb_array_length(p_pages)
    or v_invalid_page_count > 0
    or v_distinct_page_count <> v_page_count then
    raise exception 'Page text must contain unique positive page numbers and non-empty text.' using errcode = '22023';
  end if;
  if v_joined_page_text is distinct from p_extracted_text then
    raise exception 'Page text must match the aggregate extracted text.' using errcode = '22023';
  end if;

  perform 1
  from public.course_material_sources source
  where source.id = p_source_id
    and source.status = 'processing'::public.studia_course_source_status
  for update;
  if not found then
    raise exception 'Course source is not in processing state.' using errcode = 'P0001';
  end if;

  select coalesce(pg_catalog.max(extraction.extraction_version), 0) + 1
  into v_extraction_version
  from public.course_material_extractions extraction
  where extraction.source_id = p_source_id;

  insert into public.course_material_extractions (
    source_id,
    extraction_version,
    extracted_text
  )
  values (p_source_id, v_extraction_version, p_extracted_text);

  insert into public.course_material_extraction_pages (
    source_id,
    extraction_version,
    page_number,
    extracted_text
  )
  select p_source_id, v_extraction_version, page.page_number, page.extracted_text
  from pg_catalog.jsonb_to_recordset(p_pages)
    as page(page_number integer, extracted_text text);

  update public.course_material_sources
  set status = 'ready'::public.studia_course_source_status,
      error_message = null
  where id = p_source_id;
end;
$$;

revoke all on function public.complete_course_material_extraction(uuid, text, jsonb) from public, anon, authenticated, service_role;
grant execute on function public.complete_course_material_extraction(uuid, text, jsonb) to service_role;